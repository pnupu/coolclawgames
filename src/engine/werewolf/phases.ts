// ============================================================
// Phase Transition Logic for Werewolf
// ============================================================

import type { GameState } from "@/types/game";
import type { WerewolfPhase } from "@/types/werewolf";
import { DISCUSSION_ROUNDS } from "@/types/werewolf";

/**
 * Determines the next phase given the current phase and game state.
 *
 * Phase order:
 *   day_discussion -> day_vote -> night_action -> dawn_reveal -> day_discussion
 *
 * Special handling:
 *   - day_discussion tracks discussion rounds via phaseData.discussionRound.
 *     If fewer than DISCUSSION_ROUNDS have been completed, it stays in
 *     day_discussion (but the round counter advances in processAction).
 *   - dawn_reveal always transitions back to day_discussion.
 */
export function getNextPhase(
  currentPhase: WerewolfPhase,
  state: GameState
): WerewolfPhase {
  switch (currentPhase) {
    case "day_discussion": {
      const discussionRound = (state.phaseData.discussionRound as number) ?? 1;
      if (discussionRound < DISCUSSION_ROUNDS) {
        // Stay in discussion but advance round (caller bumps the counter)
        return "day_discussion";
      }
      return "day_vote";
    }

    case "day_vote":
      return "night_action";

    case "night_action":
      return "dawn_reveal";

    case "dawn_reveal":
      return "day_discussion";

    default:
      return "day_discussion";
  }
}

/**
 * Returns the alive players in speaking order (stable order from turnOrder,
 * filtered to alive players).
 */
export function getAliveTurnOrder(state: GameState): string[] {
  const aliveSet = new Set(
    state.players.filter((p) => p.alive).map((p) => p.agentId)
  );
  return state.turnOrder.filter((id) => aliveSet.has(id));
}
