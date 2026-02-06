// ============================================================
// Server-side turn timeout enforcement
// ============================================================
// Periodically checks all in-progress matches and auto-times-out
// players who haven't acted within TURN_TIMEOUT_MS.
// This prevents games from stalling when an agent goes offline.
// ============================================================

import { getAllMatches, getMatch, updateMatch, gameEvents } from "@/lib/store";
import { handleTimeout, getPlayerView } from "@/engine/game-engine";
import { TURN_TIMEOUT_MS } from "@/types/werewolf";

// Track when each player's current turn started
// Key: `${matchId}:${playerId}`, Value: timestamp
const turnStartTimes = new Map<string, number>();

// Track matches we've already finished processing (avoid double-processing)
const processingMatches = new Set<string>();

/**
 * Record that a player's turn has started.
 * Called when game state changes and a new player gets their turn.
 */
function recordTurnStart(matchId: string, playerId: string): void {
  const key = `${matchId}:${playerId}`;
  if (!turnStartTimes.has(key)) {
    turnStartTimes.set(key, Date.now());
  }
}

/**
 * Clear turn tracking for a player (they acted or game ended).
 */
function clearTurn(matchId: string, playerId: string): void {
  turnStartTimes.delete(`${matchId}:${playerId}`);
}

/**
 * Clear all turn tracking for a match (game ended).
 */
function clearMatch(matchId: string): void {
  for (const key of turnStartTimes.keys()) {
    if (key.startsWith(`${matchId}:`)) {
      turnStartTimes.delete(key);
    }
  }
}

/**
 * Check all active matches for players who have exceeded the turn timeout.
 */
function checkForTimeouts(): void {
  const now = Date.now();
  const matches = getAllMatches();

  for (const state of matches) {
    if (state.status !== "in_progress") {
      clearMatch(state.matchId);
      continue;
    }
    if (processingMatches.has(state.matchId)) continue;

    // Find players whose turn it is
    for (const player of state.players) {
      if (!player.alive) continue;

      let view;
      try {
        view = getPlayerView(state, player.agentId);
      } catch {
        continue;
      }

      const key = `${state.matchId}:${player.agentId}`;

      if (view.your_turn) {
        // Record turn start if not already tracked
        recordTurnStart(state.matchId, player.agentId);

        const turnStart = turnStartTimes.get(key);
        if (turnStart && now - turnStart > TURN_TIMEOUT_MS) {
          // Player has exceeded timeout -- auto-action
          processingMatches.add(state.matchId);
          console.log(
            `[turn-timeout] Player ${player.agentName} timed out in match ${state.matchId} (phase: ${state.phase})`
          );

          try {
            const freshState = getMatch(state.matchId);
            if (!freshState || freshState.status !== "in_progress") {
              clearMatch(state.matchId);
              processingMatches.delete(state.matchId);
              continue;
            }

            const newState = handleTimeout(freshState, player.agentId);
            updateMatch(state.matchId, newState);

            // Emit new events for spectator SSE
            const newEvents = newState.events.slice(freshState.events.length);
            for (const event of newEvents) {
              gameEvents.emit(`match:${state.matchId}:event`, event);
            }

            // Notify next player
            for (const p of newState.players) {
              if (p.alive) {
                try {
                  const pView = getPlayerView(newState, p.agentId);
                  if (pView.your_turn) {
                    gameEvents.emit(`turn:${p.agentId}`);
                  }
                } catch {
                  // skip
                }
              }
            }

            // Clear the timed-out player's turn tracking
            clearTurn(state.matchId, player.agentId);
          } catch (err) {
            console.error(`[turn-timeout] Error handling timeout:`, err);
          } finally {
            processingMatches.delete(state.matchId);
          }
        }
      } else {
        // Not their turn -- clear tracking
        clearTurn(state.matchId, player.agentId);
      }
    }
  }
}

// Start the periodic check
let timeoutInterval: ReturnType<typeof setInterval> | null = null;

export function startTimeoutLoop(): void {
  if (timeoutInterval) return;
  timeoutInterval = setInterval(checkForTimeouts, 5_000); // check every 5s
  console.log(`[turn-timeout] Turn timeout loop started (checking every 5s, timeout after ${TURN_TIMEOUT_MS / 1000}s)`);
}

export function stopTimeoutLoop(): void {
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
  }
}

// Auto-start when imported
startTimeoutLoop();
