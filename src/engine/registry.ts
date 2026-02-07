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
import { TicTacToeGame } from "./tic-tac-toe";
import { RockPaperScissorsGame } from "./rock-paper-scissors";
import { BattleshipGame } from "./battleship";
import { KingdomOperatorGame } from "./kingdom-operator";
import { FrontierConvoyGame } from "./frontier-convoy";
import { CouncilOfSpiesGame } from "./council-of-spies";

// ── Game Implementations ────────────────────────────────────

const WEREWOLF_DEFINITION: GameTypeDefinition = {
  id: "werewolf",
  name: "Werewolf",
  description:
    "A social deduction game where villagers try to identify and eliminate werewolves before they are outnumbered.",
  min_players: 5,
  max_players: 7,
  roles: [
    {
      id: "werewolf",
      name: "Werewolf",
      team: "werewolf",
      description: "Hunt villagers at night",
      count: 2,
    },
    {
      id: "villager",
      name: "Villager",
      team: "village",
      description: "Find the werewolves",
      count: 3,
    },
    {
      id: "seer",
      name: "Seer",
      team: "village",
      description: "Investigate one player each night",
      ability: "investigation",
      count: 1,
    },
    {
      id: "doctor",
      name: "Doctor",
      team: "village",
      description: "Protect one player each night",
      ability: "protection",
      count: 1,
    },
  ],
  phases: [
    {
      id: "day_discussion",
      name: "Day Discussion",
      type: "discussion",
      turn_style: "sequential",
      allowed_actions: ["speak"],
      rounds: 2,
    },
    {
      id: "day_vote",
      name: "Day Vote",
      type: "vote",
      turn_style: "simultaneous",
      allowed_actions: ["vote"],
    },
    {
      id: "night_action",
      name: "Night",
      type: "action",
      turn_style: "simultaneous",
      allowed_actions: ["use_ability"],
    },
    {
      id: "dawn_reveal",
      name: "Dawn Reveal",
      type: "reveal",
      turn_style: "no_action",
      allowed_actions: [],
    },
  ],
};

// import { ExampleGame } from "./template/example-game";
// import { WerewolfGame } from "./werewolf-impl"; // TODO: wrap werewolf in GameImplementation

// ── Registry ────────────────────────────────────────────────

const GAME_REGISTRY = new Map<string, GameImplementation>();

GAME_REGISTRY.set(TicTacToeGame.gameTypeId, TicTacToeGame);
GAME_REGISTRY.set(RockPaperScissorsGame.gameTypeId, RockPaperScissorsGame);
GAME_REGISTRY.set(BattleshipGame.gameTypeId, BattleshipGame);
GAME_REGISTRY.set(KingdomOperatorGame.gameTypeId, KingdomOperatorGame);
GAME_REGISTRY.set(FrontierConvoyGame.gameTypeId, FrontierConvoyGame);
GAME_REGISTRY.set(CouncilOfSpiesGame.gameTypeId, CouncilOfSpiesGame);

// ── Public API ──────────────────────────────────────────────

/** Get a game implementation by type ID */
export function getGame(gameTypeId: string): GameImplementation | undefined {
  return GAME_REGISTRY.get(gameTypeId);
}

/** Get all registered game types */
export function getAllGameTypes(): GameTypeDefinition[] {
  const types: GameTypeDefinition[] = [WEREWOLF_DEFINITION];

  // Include registered games
  for (const game of GAME_REGISTRY.values()) {
    types.push(game.definition);
  }

  return types;
}

/** Get a game type definition by ID */
export function getGameTypeDefinition(
  gameTypeId: string
): GameTypeDefinition | undefined {
  if (gameTypeId === "werewolf") return WEREWOLF_DEFINITION;
  return GAME_REGISTRY.get(gameTypeId)?.definition;
}

/** Check if a game type exists */
export function hasGameType(gameTypeId: string): boolean {
  return getGameTypeDefinition(gameTypeId) !== undefined;
}
