// ============================================================
// Role Assignment for Werewolf
// ============================================================

import { WerewolfRole, WEREWOLF_ROLE_CONFIGS } from "@/types/werewolf";

/**
 * Fisher-Yates shuffle (immutable -- returns a new array).
 */
function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Assigns Werewolf roles to a list of player IDs.
 *
 * Supports 5-7 players. Shuffles the player list, then distributes
 * roles according to WEREWOLF_ROLE_CONFIGS.
 *
 * @throws if player count is not 5, 6, or 7.
 */
export function assignRoles(
  playerIds: string[]
): { agentId: string; role: WerewolfRole }[] {
  const count = playerIds.length;
  const config = WEREWOLF_ROLE_CONFIGS[count];

  if (!config) {
    throw new Error(
      `Unsupported player count: ${count}. Werewolf requires 5-7 players.`
    );
  }

  // Build a flat list of roles from the config
  const roles: WerewolfRole[] = [];
  for (const [role, qty] of Object.entries(config) as [WerewolfRole, number][]) {
    for (let i = 0; i < qty; i++) {
      roles.push(role);
    }
  }

  // Shuffle players, then zip with (already-ordered) roles
  const shuffledPlayers = shuffle(playerIds);

  return shuffledPlayers.map((agentId, i) => ({
    agentId,
    role: roles[i],
  }));
}
