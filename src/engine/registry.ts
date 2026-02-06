// ============================================================
// Game Registry -- maps game type IDs to implementations
// ============================================================
//
// To add a new game:
//   1. Implement GameImplementation (see template/)
//   2. Import it here
//   3. Add it to the GAME_REGISTRY map
//
// The API routes use this registry to dispatch to the correct game.
// ============================================================

import type { GameImplementation } from "./template/game-interface";
import type { GameTypeDefinition } from "@/types/game";

// ── Game Implementations ────────────────────────────────────

// For now, Werewolf uses the direct engine functions (legacy).
// New games should implement GameImplementation and register here.

// import { ExampleGame } from "./template/example-game";
// import { WerewolfGame } from "./werewolf-impl"; // TODO: wrap werewolf in GameImplementation

// ── Registry ────────────────────────────────────────────────

const GAME_REGISTRY = new Map<string, GameImplementation>();

// Register games here:
// GAME_REGISTRY.set(ExampleGame.gameTypeId, ExampleGame);

// ── Public API ──────────────────────────────────────────────

/** Get a game implementation by type ID */
export function getGame(gameTypeId: string): GameImplementation | undefined {
  return GAME_REGISTRY.get(gameTypeId);
}

/** Get all registered game types */
export function getAllGameTypes(): GameTypeDefinition[] {
  const types: GameTypeDefinition[] = [];

  // Include legacy Werewolf (hardcoded until refactored)
  types.push({
    id: "werewolf",
    name: "Werewolf",
    description: "A social deduction game where villagers try to identify and eliminate werewolves before they are outnumbered.",
    min_players: 5,
    max_players: 7,
    roles: [
      { id: "werewolf", name: "Werewolf", team: "werewolf", description: "Hunt villagers at night", count: 2 },
      { id: "villager", name: "Villager", team: "village", description: "Find the werewolves", count: 3 },
      { id: "seer", name: "Seer", team: "village", description: "Investigate one player each night", ability: "investigation", count: 1 },
      { id: "doctor", name: "Doctor", team: "village", description: "Protect one player each night", ability: "protection", count: 1 },
    ],
    phases: [
      { id: "day_discussion", name: "Day Discussion", type: "discussion", turn_style: "sequential", allowed_actions: ["speak"], rounds: 2 },
      { id: "day_vote", name: "Day Vote", type: "vote", turn_style: "simultaneous", allowed_actions: ["vote"] },
      { id: "night_action", name: "Night", type: "action", turn_style: "simultaneous", allowed_actions: ["use_ability"] },
      { id: "dawn_reveal", name: "Dawn Reveal", type: "reveal", turn_style: "no_action", allowed_actions: [] },
    ],
  });

  // Include registered games
  for (const game of GAME_REGISTRY.values()) {
    types.push(game.definition);
  }

  return types;
}

/** Check if a game type exists */
export function hasGameType(gameTypeId: string): boolean {
  return gameTypeId === "werewolf" || GAME_REGISTRY.has(gameTypeId);
}
