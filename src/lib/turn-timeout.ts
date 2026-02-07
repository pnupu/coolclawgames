// ============================================================
// Server-side turn timeout enforcement
// ============================================================
// Periodically checks all in-progress matches and auto-times-out
// players who haven't acted within TURN_TIMEOUT_MS.
// This prevents games from stalling when an agent goes offline.
// ============================================================

import { getAllMatches, getMatch, updateMatch, gameEvents } from "@/lib/store";
import {
  handleTimeoutForMatch,
  getPlayerViewForMatch,
  handlePhaseDeadlineForMatch,
  isPhaseDeadlineManagedGame,
} from "@/engine/dispatcher";

// Track matches we've already finished processing (avoid double-processing)
const processingMatches = new Set<string>();

/**
 * Grace period for the first turn of a brand-new match.
 * Agents need time to discover the match started (poll lobby → see match_id → poll state → submit).
 * Without this, the first player can get timed out while still trying to connect.
 */
const FIRST_TURN_GRACE_MS = 15_000; // 15 seconds extra for the very first round

/**
 * Grace period after a Vercel cold start / redeployment.
 * When the server restarts, matches are reloaded from DB but agents don't know
 * they need to re-poll. Give them extra time to recover.
 */
const COLD_START_GRACE_MS = 30_000; // 30 seconds after server startup before enforcing timeouts
const serverStartedAt = Date.now();

/**
 * Clear all turn tracking for a match (game ended).
 */
function clearMatch(matchId: string): void {
  // No-op now (turnStartTimes removed), but keep for future use
  void matchId;
}

/**
 * Check all active matches for players who have exceeded the turn timeout.
 * Uses the authoritative `turnStartedAt` field from the game state (persisted in DB)
 * instead of a separate in-memory map -- this is resilient to cold starts.
 */
function checkForTimeouts(): void {
  const now = Date.now();

  // Don't enforce timeouts during the cold start grace period
  // This prevents mass-timeouts when the server restarts and matches are reloaded
  if (now - serverStartedAt < COLD_START_GRACE_MS) {
    return;
  }

  const matches = getAllMatches();

  for (const state of matches) {
    if (state.status !== "in_progress") {
      clearMatch(state.matchId);
      continue;
    }
    if (processingMatches.has(state.matchId)) continue;

    const phaseDeadlineState = handlePhaseDeadlineForMatch(state, now);
    if (phaseDeadlineState) {
      processingMatches.add(state.matchId);
      try {
        const freshState = getMatch(state.matchId);
        if (!freshState || freshState.status !== "in_progress") {
          clearMatch(state.matchId);
          processingMatches.delete(state.matchId);
          continue;
        }

        updateMatch(state.matchId, phaseDeadlineState);

        const newEvents = phaseDeadlineState.events.slice(freshState.events.length);
        for (const event of newEvents) {
          gameEvents.emit(`match:${state.matchId}:event`, event);
        }

        for (const p of phaseDeadlineState.players) {
          if (p.alive) {
            try {
              const pView = getPlayerViewForMatch(phaseDeadlineState, p.agentId);
              if (pView.your_turn) {
                gameEvents.emit(`turn:${p.agentId}`);
              }
            } catch {
              // skip
            }
          }
        }
      } finally {
        processingMatches.delete(state.matchId);
      }
      continue;
    }

    if (isPhaseDeadlineManagedGame(state)) {
      continue;
    }

    // Find players whose turn it is
    for (const player of state.players) {
      if (!player.alive) continue;

      let view;
      try {
        view = getPlayerViewForMatch(state, player.agentId);
      } catch {
        continue;
      }

      if (view.your_turn) {
        // Use the authoritative turnStartedAt from the game state (persisted in DB).
        // This is much more reliable than an in-memory map that gets wiped on cold starts.
        const turnStart = state.turnStartedAt;
        const elapsed = now - turnStart;

        // Add grace period for the first round of a new match.
        // Agents need extra time to discover the match started (poll lobby, poll state, build action).
        const isFirstRound = state.round <= 1;
        const effectiveTimeout = isFirstRound
          ? view.turn_timeout_ms + FIRST_TURN_GRACE_MS
          : view.turn_timeout_ms;

        if (elapsed > effectiveTimeout) {
          // Player has exceeded timeout -- auto-action
          processingMatches.add(state.matchId);
          console.log(
            `[turn-timeout] Player ${player.agentName} timed out in match ${state.matchId} ` +
            `(phase: ${state.phase}, elapsed: ${Math.round(elapsed / 1000)}s, timeout: ${Math.round(effectiveTimeout / 1000)}s)`
          );

          try {
            const freshState = getMatch(state.matchId);
            if (!freshState || freshState.status !== "in_progress") {
              clearMatch(state.matchId);
              processingMatches.delete(state.matchId);
              continue;
            }

            const newState = handleTimeoutForMatch(freshState, player.agentId);
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
                  const pView = getPlayerViewForMatch(newState, p.agentId);
                  if (pView.your_turn) {
                    gameEvents.emit(`turn:${p.agentId}`);
                  }
                } catch {
                  // skip
                }
              }
            }
          } catch (err) {
            console.error(`[turn-timeout] Error handling timeout:`, err);
          } finally {
            processingMatches.delete(state.matchId);
          }
        }
      }
    }
  }
}

// Start the periodic check
let timeoutInterval: ReturnType<typeof setInterval> | null = null;

export function startTimeoutLoop(): void {
  if (timeoutInterval) return;
  timeoutInterval = setInterval(checkForTimeouts, 5_000); // check every 5s
  console.log("[turn-timeout] Turn timeout loop started (checking every 5s)");
}

export function stopTimeoutLoop(): void {
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
  }
}

// Auto-start when imported
startTimeoutLoop();
