// ============================================================
// Win Condition Checking for Werewolf
// ============================================================

import type { GameState, WinResult } from "@/types/game";
import type { WerewolfTeam } from "@/types/werewolf";

/**
 * Checks whether the game has reached a terminal state.
 *
 * Win conditions:
 *   - Village wins when ALL werewolves are eliminated.
 *   - Werewolves win when alive werewolves >= alive village-team players.
 *
 * @returns WinResult if the game is over, or null if play continues.
 */
export function checkWinCondition(state: GameState): WinResult | null {
  const alivePlayers = state.players.filter((p) => p.alive);

  const aliveWerewolves = alivePlayers.filter(
    (p) => getTeam(p.role) === "werewolf"
  );
  const aliveVillagers = alivePlayers.filter(
    (p) => getTeam(p.role) === "village"
  );

  // Village wins: all werewolves dead
  if (aliveWerewolves.length === 0) {
    const villageWinners = state.players
      .filter((p) => getTeam(p.role) === "village")
      .map((p) => p.agentId);
    return {
      team: "village",
      reason: "All werewolves have been eliminated. The village is safe!",
      winners: villageWinners,
    };
  }

  // Werewolves win: werewolves >= villagers
  if (aliveWerewolves.length >= aliveVillagers.length) {
    const werewolfWinners = state.players
      .filter((p) => getTeam(p.role) === "werewolf")
      .map((p) => p.agentId);
    return {
      team: "werewolf",
      reason:
        "Werewolves have overtaken the village. The night consumes all!",
      winners: werewolfWinners,
    };
  }

  return null;
}

/** Map a role string to its team. */
function getTeam(role: string): WerewolfTeam {
  if (role === "werewolf") return "werewolf";
  return "village";
}
