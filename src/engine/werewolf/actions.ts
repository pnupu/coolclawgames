// ============================================================
// Action Validation for Werewolf
// ============================================================

import type { GameState, Action, AgentId } from "@/types/game";
import type { WerewolfPhase, WerewolfRole } from "@/types/werewolf";
import { WEREWOLF_ROLES } from "@/types/werewolf";

/**
 * Returns the set of actions available to a player in the current phase.
 */
export function getAvailableActions(
  state: GameState,
  playerId: string
): string[] {
  const player = state.players.find((p) => p.agentId === playerId);
  if (!player || !player.alive) return [];

  const phase = state.phase as WerewolfPhase;

  switch (phase) {
    case "day_discussion":
      return ["speak"];

    case "day_vote":
      return ["vote"];

    case "night_action": {
      const role = player.role as WerewolfRole;
      if (role === "werewolf") return ["use_ability"];
      if (role === "seer") return ["use_ability"];
      if (role === "doctor") return ["use_ability"];
      // Villagers have no night action -- they're handled as auto-skip
      return [];
    }

    case "dawn_reveal":
      // No player actions during dawn reveal
      return [];

    default:
      return [];
  }
}

/**
 * Validates an action submitted by a player.
 *
 * @returns An error message string if invalid, or null if valid.
 */
export function validateAction(
  state: GameState,
  playerId: string,
  action: Action
): string | null {
  // Game must be in progress
  if (state.status !== "in_progress") {
    return "Game is not in progress.";
  }

  // Player must exist
  const player = state.players.find((p) => p.agentId === playerId);
  if (!player) {
    return "Player not found in this match.";
  }

  // Player must be alive
  if (!player.alive) {
    return "Dead players cannot take actions.";
  }

  const phase = state.phase as WerewolfPhase;
  const available = getAvailableActions(state, playerId);

  // Action type must be available
  if (!available.includes(action.action)) {
    return `Action "${action.action}" is not available during ${phase} phase for your role.`;
  }

  // Phase-specific validation
  switch (action.action) {
    case "speak": {
      if (phase !== "day_discussion") {
        return "Can only speak during day discussion.";
      }
      // Must be this player's turn (sequential)
      const aliveTurnOrder = getAliveTurnOrder(state);
      const currentSpeaker = aliveTurnOrder[state.currentTurnIndex];
      if (currentSpeaker !== playerId) {
        return "It is not your turn to speak.";
      }
      if (!action.message || action.message.trim().length === 0) {
        return "Speak action requires a message.";
      }
      break;
    }

    case "vote": {
      if (phase !== "day_vote") {
        return "Can only vote during day vote phase.";
      }
      // Simultaneous voting -- check if already voted
      if (state.actedThisPhase.has(playerId)) {
        return "You have already voted this phase.";
      }
      // Target must be a valid alive player (or absent for abstain)
      if (action.target) {
        const target = state.players.find((p) => p.agentId === action.target);
        if (!target) {
          return "Vote target not found.";
        }
        if (!target.alive) {
          return "Cannot vote for a dead player.";
        }
        if (target.agentId === playerId) {
          return "Cannot vote for yourself.";
        }
      }
      break;
    }

    case "use_ability": {
      if (phase !== "night_action") {
        return "Abilities can only be used at night.";
      }
      if (state.actedThisPhase.has(playerId)) {
        return "You have already used your ability this phase.";
      }
      const role = player.role as WerewolfRole;

      // All night roles require a target
      if (!action.target) {
        return `${WEREWOLF_ROLES[role].name} ability requires a target.`;
      }
      const target = state.players.find((p) => p.agentId === action.target);
      if (!target) {
        return "Ability target not found.";
      }
      if (!target.alive) {
        return "Cannot target a dead player.";
      }

      // Role-specific target restrictions
      if (role === "werewolf") {
        if (target.role === "werewolf") {
          return "Werewolves cannot target fellow werewolves.";
        }
      }
      // Doctor CAN target self, seer cannot investigate self
      if (role === "seer" && action.target === playerId) {
        return "The Seer cannot investigate themselves.";
      }
      break;
    }

    default:
      return `Unknown action type: ${(action as Action).action}`;
  }

  return null; // Valid
}

// ---- Helpers re-exported for internal use ----

function getAliveTurnOrder(state: GameState): string[] {
  const aliveSet = new Set(
    state.players.filter((p) => p.alive).map((p) => p.agentId)
  );
  return state.turnOrder.filter((id) => aliveSet.has(id));
}
