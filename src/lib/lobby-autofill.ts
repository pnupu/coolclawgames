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
import { createWerewolfMatch, processAction, getPlayerView, handleTimeout } from "@/engine/game-engine";
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
const BOT_ALIAS_POOL = [
  "Lena-Hart",
  "Milo-Cross",
  "Nadia-Reeve",
  "Theo-Kent",
  "Ari-Sloan",
  "Evan-Pike",
  "Mara-Voss",
  "Rafi-Stone",
  "Tara-Quinn",
  "Noah-March",
  "Iris-Rowe",
  "Kai-Bennett",
  "Sera-Finch",
  "Owen-Creed",
  "Luca-Dane",
  "Nina-Vale",
  "Remy-Slade",
  "Mina-Kerr",
  "Jonah-West",
  "Vera-Blake",
  "Elio-Grant",
  "Ruby-Kane",
  "Arlo-Hale",
  "Talia-Brooks",
];

/** Track which lobbies we've already started filling */
const fillingLobbies = new Set<string>();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

async function callMistral(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!MISTRAL_API_KEY) {
    return generateFallbackResponse(userPrompt, systemPrompt);
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
      return generateFallbackResponse(userPrompt, systemPrompt);
    }

    const data = await response.json();
    return (
      data.choices?.[0]?.message?.content ||
      generateFallbackResponse(userPrompt, systemPrompt)
    );
  } catch (error) {
    console.error("Mistral call failed:", error);
    return generateFallbackResponse(userPrompt, systemPrompt);
  }
}

function generateFallbackResponse(userPrompt: string, systemPrompt: string): string {
  const context = parseFallbackContext(userPrompt, systemPrompt);
  const suspicionScores = buildSuspicionScores(
    context.alivePlayers,
    context.recentMessages,
    context.botName
  );

  if (userPrompt.includes("IT IS YOUR TURN TO SPEAK")) {
    const suspect = choosePlayerBySuspicion(suspicionScores, context, false);
    const speakTemplates =
      context.role === "werewolf"
        ? [
            `${suspect ?? "Someone"} is steering this too hard. That reads like manufactured certainty.`,
            `I want pressure on ${suspect ?? "the loudest voice"} before we hand wolves an easy night.`,
            `The timing from ${suspect ?? "that side of the table"} feels rehearsed, not reactive.`,
          ]
        : [
            `${suspect ?? "Someone"} has too many convenient answers. I want clearer explanations.`,
            `I’m tracking how people pivot. ${suspect ?? "One player"} keeps shifting without committing.`,
            `Before we rush, I want to challenge ${suspect ?? "the current frontrunner"} directly.`,
          ];
    const message = pickRandom(speakTemplates);
    return JSON.stringify({
      action: "speak",
      message,
      thinking: `Fallback strategy: ${context.role} applying pressure on ${
        suspect ?? "uncertain target"
      } based on message patterns.`,
    });
  }

  if (userPrompt.includes("IT IS TIME TO VOTE")) {
    const target = choosePlayerBySuspicion(suspicionScores, context, true);
    return JSON.stringify({
      action: "vote",
      target,
      thinking: `Fallback vote: selected ${target ?? "abstain"} from weighted suspicion and role constraints.`,
    });
  }

  if (userPrompt.includes("IT IS NIGHT")) {
    const target = chooseNightTarget(suspicionScores, context);
    return JSON.stringify({
      action: "use_ability",
      target,
      thinking: `Fallback night action: role=${context.role}, target=${target ?? "none"}.`,
    });
  }

  return JSON.stringify({
    action: "wait",
    thinking: "Fallback: no actionable phase detected.",
  });
}

function parseFallbackContext(userPrompt: string, systemPrompt: string): {
  role: WerewolfRole | "unknown";
  botName: string;
  alivePlayers: string[];
  recentMessages: string[];
  fellowWolves: string[];
} {
  const roleMatch = systemPrompt.match(/YOUR ROLE:\s*([A-Za-z]+)/);
  const role = (roleMatch?.[1]?.toLowerCase() ?? "unknown") as WerewolfRole | "unknown";
  const botNameMatch = systemPrompt.match(/You are ([^,]+), an AI agent/i);
  const botName = botNameMatch?.[1]?.trim() ?? "Unknown";

  const alivePlayersMatch = userPrompt.match(/Alive players:\s*(.+)/i);
  const alivePlayers = alivePlayersMatch
    ? alivePlayersMatch[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const recentBlock = extractBetween(
    userPrompt,
    "RECENT MESSAGES:\n",
    "\n\nIT IS"
  );
  const recentMessages = recentBlock
    ? recentBlock
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line !== "(no messages yet)")
    : [];

  const privateInfoRaw = extractBetween(
    userPrompt,
    "PRIVATE INFO (only you know this): ",
    "\n\nRECENT MESSAGES:"
  );

  let fellowWolves: string[] = [];
  if (privateInfoRaw) {
    try {
      const parsed = JSON.parse(privateInfoRaw) as {
        fellow_wolves?: unknown;
      };
      if (Array.isArray(parsed.fellow_wolves)) {
        fellowWolves = parsed.fellow_wolves
          .filter((value): value is string => typeof value === "string");
      }
    } catch {
      // ignore malformed private info
    }
  }

  return {
    role,
    botName,
    alivePlayers,
    recentMessages,
    fellowWolves,
  };
}

function extractBetween(value: string, start: string, end: string): string | undefined {
  const startIndex = value.indexOf(start);
  if (startIndex < 0) return undefined;
  const contentStart = startIndex + start.length;
  const endIndex = value.indexOf(end, contentStart);
  if (endIndex < 0) return undefined;
  return value.slice(contentStart, endIndex).trim();
}

function buildSuspicionScores(
  alivePlayers: string[],
  recentMessages: string[],
  botName: string
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const player of alivePlayers) {
    scores[player] = player === botName ? -999 : 0;
  }

  for (const line of recentMessages) {
    const lower = line.toLowerCase();
    const hostileTone = /(wolf|lying|liar|sus|suspicious|accuse|vote|eliminate|kill)/.test(
      lower
    );
    const trustTone = /(trust|safe|clear|innocent|defend|protect)/.test(lower);

    for (const player of alivePlayers) {
      if (!lower.includes(player.toLowerCase())) continue;
      if (player === botName) continue;
      scores[player] += hostileTone ? 2 : 1;
      if (trustTone) scores[player] -= 1;
    }
  }

  for (const player of alivePlayers) {
    if (player === botName) continue;
    scores[player] += Math.floor(Math.random() * 3) - 1;
  }

  return scores;
}

function choosePlayerBySuspicion(
  scores: Record<string, number>,
  context: {
    role: WerewolfRole | "unknown";
    botName: string;
    fellowWolves: string[];
  },
  respectWerewolfTeam: boolean
): string | null {
  const blocked = new Set<string>([context.botName]);
  if (respectWerewolfTeam && context.role === "werewolf") {
    for (const wolf of context.fellowWolves) blocked.add(wolf);
  }

  const ranked = Object.entries(scores)
    .filter(([player]) => !blocked.has(player))
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) return null;
  const topBand = ranked.filter(([, score]) => score >= ranked[0][1] - 1);
  return topBand[Math.floor(Math.random() * topBand.length)]?.[0] ?? ranked[0][0];
}

function chooseNightTarget(
  scores: Record<string, number>,
  context: {
    role: WerewolfRole | "unknown";
    botName: string;
    fellowWolves: string[];
    alivePlayers: string[];
  }
): string | null {
  if (context.role === "doctor") {
    const protectSelf = Math.random() < 0.4;
    if (protectSelf) return context.botName;
    return choosePlayerBySuspicion(scores, context, false);
  }
  if (context.role === "seer") {
    return choosePlayerBySuspicion(scores, context, false);
  }
  if (context.role === "werewolf") {
    return choosePlayerBySuspicion(scores, context, true);
  }
  return context.alivePlayers.find((player) => player !== context.botName) ?? null;
}

function pickRandom(values: string[]): string {
  return values[Math.floor(Math.random() * values.length)] ?? values[0] ?? "";
}

function generateHouseBotName(usedNames: Set<string>, offset: number): string {
  for (let i = 0; i < BOT_ALIAS_POOL.length; i++) {
    const candidate = BOT_ALIAS_POOL[(offset + i) % BOT_ALIAS_POOL.length];
    if (!usedNames.has(candidate) && !getAgentByName(candidate)) {
      return candidate;
    }
  }

  const base = BOT_ALIAS_POOL[offset % BOT_ALIAS_POOL.length];
  const suffixes = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  for (const suffix of suffixes) {
    const candidate = `${base}-${suffix}`;
    if (!usedNames.has(candidate) && !getAgentByName(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`.slice(0, 30);
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
    if (lobby.game_type !== "werewolf") return;
    if (lobby.is_private) return;

    const slotsNeeded = lobby.min_players - lobby.players.length;
    if (slotsNeeded <= 0) return;

    console.log(`[autofill] Filling lobby ${lobbyId} with ${slotsNeeded} house bots`);

    const usedNames = new Set(lobby.players);
    const personalityRotation = [...HOUSE_BOT_PERSONALITIES].sort(
      () => Math.random() - 0.5
    );

    const botsToAdd: { name: string; personality: (typeof HOUSE_BOT_PERSONALITIES)[0] }[] = [];

    for (let i = 0; i < slotsNeeded; i++) {
      const personality = personalityRotation[i % personalityRotation.length];
      const botName = generateHouseBotName(usedNames, i);

      // Register bot agent
      createAgent(botName, personality.description + " (house bot)");
      lobby.players.push(botName);
      usedNames.add(botName);
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

  let botActionCount = 0;
  const maxBotActions = 200;
  const maxIdleMs = 10 * 60 * 1000; // 10 minutes max idle (waiting for humans)
  const loopStartTime = Date.now();

  while (botActionCount < maxBotActions) {
    const currentState = getMatch(matchId);
    if (!currentState || currentState.status === "finished") break;

    // Safety: if we've been idle too long (humans not acting), bail
    if (Date.now() - loopStartTime > maxIdleMs && botActionCount === 0) break;

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
        botActionCount++;

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
        botActionCount++;
      }

      break; // Re-evaluate state after each action
    }

    if (!acted) {
      // It's a human's turn (or no bot has an action available).
      // Wait patiently -- don't burn through the action counter.
      const checkState = getMatch(matchId);
      if (checkState && checkState.status === "finished") break;
      await new Promise((r) => setTimeout(r, 2000)); // poll every 2s
    }
  }

  console.log(`[autofill] Match ${matchId} game loop ended after ${botActionCount} bot actions`);
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
    if (lobby.game_type !== "werewolf") continue;
    if (lobby.is_private) continue;
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
