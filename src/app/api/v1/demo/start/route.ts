// ============================================================
// Demo Start -- Run a full house-bot Werewolf game
// Streams progress as SSE while also emitting for spectators
// ============================================================

import {
  createAgent,
  createMatch as storeMatch,
  getMatch,
  updateMatch,
  gameEvents,
} from "@/lib/store";
import {
  createWerewolfMatch,
  processAction,
  getPlayerView,
  getAuthenticatedSpectatorView,
  handleTimeout,
} from "@/engine/game-engine";
import {
  HOUSE_BOT_PERSONALITIES,
  buildBotSystemPrompt,
  buildActionPrompt,
  parseBotResponse,
} from "@/lib/house-bots";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import type { WerewolfRole } from "@/types/werewolf";
import type { Action } from "@/types/game";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

async function callMistral(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!MISTRAL_API_KEY) {
    // Fallback: generate a simple response without LLM
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
      console.error("Mistral API error:", response.status, await response.text());
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
  // Simple fallback for when Mistral is not available
  if (prompt.includes("SPEAK")) {
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
      thinking: "I need to be strategic about what I say.",
    });
  }

  if (prompt.includes("VOTE")) {
    // Extract alive players from the prompt
    const playersMatch = prompt.match(/Alive players: (.+)/);
    const players = playersMatch
      ? playersMatch[1].split(", ").map((p) => p.trim())
      : [];
    const target = players[Math.floor(Math.random() * players.length)] || null;
    return JSON.stringify({
      action: "vote",
      target,
      thinking: `Going with my gut feeling on ${target}.`,
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
      thinking: `Targeting ${target} based on my analysis.`,
    });
  }

  return JSON.stringify({ action: "wait", thinking: "Waiting..." });
}

export async function POST(request: Request) {
  const limit = checkRequestRateLimit(request, "demo-start", 3, 60_000);
  if (!limit.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Too many demo game requests",
        hint: `Try again in ${Math.ceil(limit.retryAfterMs / 1000)}s`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const numPlayers = 5;
  const personalities = HOUSE_BOT_PERSONALITIES.slice(0, numPlayers);

  // Register bot agents
  const botAgents = personalities.map((p) => {
    const agent = createAgent(
      p.name + "_" + Date.now().toString(36),
      p.description
    );
    return { agent, personality: p };
  });

  // Create match
  const matchId = crypto.randomUUID();
  const players = botAgents.map((b) => ({
    agentId: b.agent.id,
    agentName: b.agent.name,
  }));

  const initialState = createWerewolfMatch(matchId, players);
  storeMatch(initialState);

  // Emit match started for any listening spectators
  gameEvents.emit(`match:${matchId}`, "started");

  // Build a map of agentId -> { personality, systemPrompt }
  const botMap = new Map<
    string,
    { personality: (typeof botAgents)[0]["personality"]; systemPrompt: string; agentName: string }
  >();

  const state = getMatch(matchId)!;
  for (const bot of botAgents) {
    const player = state.players.find((p) => p.agentId === bot.agent.id)!;
    const role = player.role as WerewolfRole;
    const systemPrompt = buildBotSystemPrompt(bot.personality, role);
    botMap.set(bot.agent.id, {
      personality: bot.personality,
      systemPrompt,
      agentName: bot.agent.name,
    });
  }

  // Stream the game as SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      send({
        type: "game_started",
        match_id: matchId,
        players: botAgents.map((b) => ({
          name: b.agent.name,
          personality: b.personality.name,
        })),
      });

      // Game loop
      let turnCount = 0;
      const maxTurns = 100; // safety limit

      while (turnCount < maxTurns) {
        const currentState = getMatch(matchId);
        if (!currentState || currentState.status === "finished") {
          send({
            type: "game_over",
            state: currentState ? getAuthenticatedSpectatorView(currentState) : null,
          });
          break;
        }

        // Find who needs to act
        let acted = false;
        for (const player of currentState.players) {
          if (!player.alive) continue;

          const view = getPlayerView(currentState, player.agentId);
          if (!view.your_turn) continue;
          if (view.available_actions.length === 0) continue;

          const bot = botMap.get(player.agentId);
          if (!bot) continue;

          // Call Mistral (or fallback)
          const actionPrompt = buildActionPrompt(view, bot.personality);
          const llmResponse = await callMistral(bot.systemPrompt, actionPrompt);

          // Parse response
          const parsed = parseBotResponse(
            llmResponse,
            view.available_actions,
            view.alive_players
          );

          // Resolve target from name to agentId
          let targetId = parsed.target;
          if (targetId) {
            const targetPlayer = currentState.players.find(
              (p) => p.agentName === targetId || p.agentName.toLowerCase() === targetId!.toLowerCase()
            );
            if (targetPlayer) {
              targetId = targetPlayer.agentId;
            }
          }

          const gameAction: Action = {
            action: parsed.action as Action["action"],
            message: parsed.message,
            target: targetId,
            thinking: parsed.thinking,
          };

          try {
            const freshState = getMatch(matchId)!;
            const newState = processAction(
              freshState,
              player.agentId,
              gameAction
            );
            updateMatch(matchId, newState);

            // Emit events for spectator SSE
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

            send({
              type: "turn_complete",
              agent: bot.agentName,
              action: parsed.action,
              message: parsed.message,
              phase: newState.phase,
              round: newState.round,
              status: newState.status,
            });

            acted = true;
            turnCount++;

            // Small delay between turns for readability
            await new Promise((r) => setTimeout(r, 500));
          } catch (err) {
            console.error(`Bot ${bot.agentName} action failed:`, err);
            // Handle timeout / skip
            try {
              const freshState = getMatch(matchId)!;
              const timedOut = handleTimeout(freshState, player.agentId);
              updateMatch(matchId, timedOut);
            } catch {
              // Skip this player
            }
            acted = true;
            turnCount++;
          }

          // Break inner loop after one action to re-evaluate game state
          break;
        }

        if (!acted) {
          // No one could act -- might be a phase with no actions (dawn_reveal)
          // or all players are dead. Check game state.
          const checkState = getMatch(matchId);
          if (checkState && checkState.status === "finished") {
            send({
              type: "game_over",
              state: getAuthenticatedSpectatorView(checkState),
            });
            break;
          }

          // Safety: if truly stuck, break
          turnCount++;
          if (turnCount > maxTurns - 5) {
            send({ type: "error", message: "Game appears stuck, stopping." });
            break;
          }

          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
