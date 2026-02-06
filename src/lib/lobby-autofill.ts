// ============================================================
// Lobby Auto-Fill -- House bots join lobbies after a timeout
// ============================================================

import {
  getAllLobbies,
  getLobby,
  updateLobby,
  createAgent,
  getAgentByName,
  createMatch,
  getMatch,
  updateMatch,
  gameEvents,
} from "@/lib/store";
import { createWerewolfMatch, processAction, getPlayerView, getSpectatorView, handleTimeout } from "@/engine/game-engine";
import {
  HOUSE_BOT_PERSONALITIES,
  buildBotSystemPrompt,
  buildActionPrompt,
  parseBotResponse,
} from "@/lib/house-bots";
import type { WerewolfRole } from "@/types/werewolf";
import type { Action } from "@/types/game";

/** How long to wait before filling a lobby with bots (ms) */
const AUTOFILL_DELAY_MS = 30_000; // 30 seconds

/** Track which lobbies we've already started filling */
const fillingLobbies = new Set<string>();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

async function callMistral(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!MISTRAL_API_KEY) {
    return generateFallbackResponse(userPrompt);
  }

  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("Mistral API error:", response.status);
      return generateFallbackResponse(userPrompt);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || generateFallbackResponse(userPrompt);
  } catch (error) {
    console.error("Mistral call failed:", error);
    return generateFallbackResponse(userPrompt);
  }
}

function generateFallbackResponse(prompt: string): string {
  if (prompt.includes("SPEAK") || prompt.includes("speak")) {
    const messages = [
      "I've been watching everyone carefully and I have my suspicions...",
      "Something doesn't add up here. Who was quiet last round?",
      "I trust my instincts, and they're telling me someone here is hiding something.",
      "Let's think about this logically. Who benefits from staying silent?",
      "I'm just a simple villager trying to survive. What about you?",
      "The real question is: who was too eager to accuse others?",
      "I noticed some interesting patterns in the voting last round...",
      "We need to work together or the werewolves will pick us off one by one.",
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    return JSON.stringify({
      action: "speak",
      message: msg,
      thinking: "STRATEGY: Playing as a house bot. Trying to drive discussion.",
    });
  }

  if (prompt.includes("VOTE") || prompt.includes("vote")) {
    const playersMatch = prompt.match(/Alive players: (.+)/);
    const players = playersMatch
      ? playersMatch[1].split(", ").map((p) => p.trim())
      : [];
    const target = players[Math.floor(Math.random() * players.length)] || null;
    return JSON.stringify({
      action: "vote",
      target,
      thinking: `STRATEGY: Going with my gut feeling on ${target}.`,
    });
  }

  if (prompt.includes("NIGHT") || prompt.includes("ability")) {
    const playersMatch = prompt.match(/Pick from: (.+)/);
    const players = playersMatch
      ? playersMatch[1].split(", ").map((p) => p.trim())
      : [];
    const target = players[Math.floor(Math.random() * players.length)] || null;
    return JSON.stringify({
      action: "use_ability",
      target,
      thinking: `STRATEGY: Targeting ${target} based on my analysis.`,
    });
  }

  return JSON.stringify({ action: "wait", thinking: "Waiting..." });
}

/**
 * Fill a lobby with house bots and start the game.
 * Called when a lobby has waited long enough.
 */
async function fillLobbyAndStart(lobbyId: string): Promise<void> {
  if (fillingLobbies.has(lobbyId)) return;
  fillingLobbies.add(lobbyId);

  try {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.status !== "waiting") return;

    const slotsNeeded = lobby.min_players - lobby.players.length;
    if (slotsNeeded <= 0) return;

    console.log(`[autofill] Filling lobby ${lobbyId} with ${slotsNeeded} house bots`);

    // Pick personalities not already used
    const usedNames = new Set(lobby.players);
    const availablePersonalities = HOUSE_BOT_PERSONALITIES.filter(
      (p) => !usedNames.has(p.name)
    );

    const botsToAdd: { name: string; personality: (typeof HOUSE_BOT_PERSONALITIES)[0] }[] = [];

    for (let i = 0; i < slotsNeeded; i++) {
      const personality = availablePersonalities[i % availablePersonalities.length];
      const suffix = "_" + Date.now().toString(36) + i;
      const botName = personality.name + suffix;

      // Register bot agent
      createAgent(botName, personality.description + " (house bot)");
      lobby.players.push(botName);
      botsToAdd.push({ name: botName, personality });
    }

    // Start the match
    lobby.status = "started";
    const matchId = crypto.randomUUID();

    const players = lobby.players.map((name) => {
      const a = getAgentByName(name);
      return {
        agentId: a!.id,
        agentName: name,
      };
    });

    const gameState = createWerewolfMatch(matchId, players);
    createMatch(gameState);

    lobby.match_id = matchId;
    updateLobby(lobbyId, lobby);

    gameEvents.emit(`match:${matchId}`, "started");
    gameEvents.emit("lobby:updated");

    console.log(`[autofill] Match ${matchId} started with ${lobby.players.length} players (${botsToAdd.length} bots)`);

    // Run the bot game loop in the background
    runBotGameLoop(matchId, botsToAdd);
  } catch (err) {
    console.error("[autofill] Failed to fill lobby:", err);
  } finally {
    fillingLobbies.delete(lobbyId);
  }
}

/**
 * Run house bots for a match (only the bots, not human agents).
 * Human agents play via the API -- this only drives the house bot actions.
 */
async function runBotGameLoop(
  matchId: string,
  bots: { name: string; personality: (typeof HOUSE_BOT_PERSONALITIES)[0] }[]
): Promise<void> {
  // Build bot map
  const state = getMatch(matchId);
  if (!state) return;

  const botMap = new Map<string, { personality: (typeof bots)[0]["personality"]; systemPrompt: string; name: string }>();

  for (const bot of bots) {
    const player = state.players.find((p) => p.agentName === bot.name);
    if (!player) continue;
    const role = player.role as WerewolfRole;
    const systemPrompt = buildBotSystemPrompt(bot.personality, role);
    botMap.set(player.agentId, {
      personality: bot.personality,
      systemPrompt,
      name: bot.name,
    });
  }

  let turnCount = 0;
  const maxTurns = 200;

  while (turnCount < maxTurns) {
    const currentState = getMatch(matchId);
    if (!currentState || currentState.status === "finished") break;

    let acted = false;

    for (const player of currentState.players) {
      if (!player.alive) continue;

      // Only act for house bots
      const bot = botMap.get(player.agentId);
      if (!bot) continue;

      const view = getPlayerView(currentState, player.agentId);
      if (!view.your_turn) continue;
      if (view.available_actions.length === 0) continue;

      // Call LLM
      const actionPrompt = buildActionPrompt(view, bot.personality);
      const llmResponse = await callMistral(bot.systemPrompt, actionPrompt);
      const parsed = parseBotResponse(llmResponse, view.available_actions, view.alive_players);

      // Resolve target
      let targetId = parsed.target;
      if (targetId) {
        const targetPlayer = currentState.players.find(
          (p) => p.agentName === targetId || p.agentName.toLowerCase() === targetId!.toLowerCase()
        );
        if (targetPlayer) targetId = targetPlayer.agentId;
      }

      const gameAction: Action = {
        action: parsed.action as Action["action"],
        message: parsed.message,
        target: targetId,
        thinking: parsed.thinking,
      };

      try {
        const freshState = getMatch(matchId)!;
        const newState = processAction(freshState, player.agentId, gameAction);
        updateMatch(matchId, newState);

        // Emit events for spectators
        const oldCount = freshState.events.length;
        const newEvents = newState.events.slice(oldCount);
        for (const event of newEvents) {
          gameEvents.emit(`match:${matchId}:event`, event);
        }

        // Notify next players
        for (const p of newState.players) {
          if (p.alive) {
            const pView = getPlayerView(newState, p.agentId);
            if (pView.your_turn) {
              gameEvents.emit(`turn:${p.agentId}`);
            }
          }
        }

        acted = true;
        turnCount++;

        // Small delay for readability
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[autofill] Bot ${bot.name} action failed:`, err);
        try {
          const freshState = getMatch(matchId)!;
          const timedOut = handleTimeout(freshState, player.agentId);
          updateMatch(matchId, timedOut);
        } catch {
          // skip
        }
        acted = true;
        turnCount++;
      }

      break; // Re-evaluate state after each action
    }

    if (!acted) {
      const checkState = getMatch(matchId);
      if (checkState && checkState.status === "finished") break;
      turnCount++;
      if (turnCount > maxTurns - 5) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`[autofill] Match ${matchId} game loop ended after ${turnCount} turns`);
}

/**
 * Check all lobbies and auto-fill any that have been waiting too long.
 * Should be called periodically.
 */
export function checkLobbiesForAutofill(): void {
  const now = Date.now();
  const allLobbies = getAllLobbies();

  for (const lobby of allLobbies) {
    if (lobby.status !== "waiting") continue;
    if (fillingLobbies.has(lobby.id)) continue;

    const age = now - lobby.created_at;
    if (age >= AUTOFILL_DELAY_MS && lobby.players.length > 0 && lobby.players.length < lobby.min_players) {
      fillLobbyAndStart(lobby.id);
    }
  }
}

// Start the periodic check
let autofillInterval: ReturnType<typeof setInterval> | null = null;

export function startAutofillLoop(): void {
  if (autofillInterval) return;
  autofillInterval = setInterval(checkLobbiesForAutofill, 5_000); // check every 5s
  console.log("[autofill] Auto-fill loop started (checking every 5s, fill after 30s)");
}

export function stopAutofillLoop(): void {
  if (autofillInterval) {
    clearInterval(autofillInterval);
    autofillInterval = null;
  }
}

// Auto-start the loop when this module is imported
startAutofillLoop();
