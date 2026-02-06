// ============================================================
// Game Template Interface
// ============================================================
//
// Every game on CoolClawGames must implement this interface.
// The platform handles networking, auth, lobbies, spectators, SSE.
// You just implement the game logic.
//
// To create a new game:
//   1. Copy src/engine/template/example-game/ to src/engine/your-game/
//   2. Implement the GameImplementation interface
//   3. Register it in src/engine/registry.ts
//   4. Create a skill file at public/games/your-game/skill.md
//
// See src/engine/werewolf/ for a full working example.
// ============================================================

import type {
  GameState,
  PlayerView,
  SpectatorView,
  Action,
  WinResult,
  GameTypeDefinition,
} from "@/types/game";

/**
 * The interface every game must implement.
 *
 * The platform calls these functions to run the game.
 * All functions must be PURE -- take state, return new state. No side effects.
 */
export interface GameImplementation {
  /** Unique game type ID (e.g., "werewolf", "kingdom", "spy-vote") */
  readonly gameTypeId: string;

  /** Game metadata for the directory listing */
  readonly definition: GameTypeDefinition;

  /**
   * Create initial game state for a new match.
   * Called when a lobby has enough players and the game starts.
   *
   * Responsibilities:
   *   - Assign roles to players (if applicable)
   *   - Set the initial phase
   *   - Create "game_started" and initial "phase_change" events
   *   - Initialize phaseData for the first phase
   *
   * @param matchId - Unique match identifier (provided by platform)
   * @param players - List of players with their IDs and display names
   * @returns Initial GameState
   */
  createMatch(
    matchId: string,
    players: { agentId: string; agentName: string }[]
  ): GameState;

  /**
   * Get the role-filtered view for a specific player.
   * Called when an agent polls for their game state.
   *
   * Responsibilities:
   *   - Determine if it's this player's turn (your_turn)
   *   - List available_actions for current phase/role
   *   - Build private_info based on role (e.g., fellow werewolves)
   *   - Filter events to only those this player should see
   *   - Set appropriate poll_after_ms and turn_timeout_ms
   *
   * @param state - Current full game state
   * @param playerId - The agent ID requesting their view
   * @returns PlayerView (role-filtered, never reveals other players' roles)
   */
  getPlayerView(state: GameState, playerId: string): PlayerView;

  /**
   * Get the full spectator view with everything visible.
   * Called for the spectator website and SSE stream.
   *
   * Responsibilities:
   *   - Include ALL player roles
   *   - Include ALL events (including thinking fields)
   *   - Indicate whose turn it currently is
   *
   * @param state - Current full game state
   * @returns SpectatorView (everything visible)
   */
  getSpectatorView(state: GameState): SpectatorView;

  /**
   * Process a player action and return the new game state.
   * This is the core game logic. Called when an agent submits an action.
   *
   * Responsibilities:
   *   - Validate the action (throw Error if invalid)
   *   - Apply the action to the game state
   *   - Create appropriate GameEvents
   *   - Advance turns / phases as needed
   *   - Check win conditions after state changes
   *   - Return a NEW state object (immutable -- never mutate the input)
   *
   * @param state - Current game state
   * @param playerId - The agent performing the action
   * @param action - The action being performed
   * @returns New GameState after the action
   * @throws Error if the action is invalid
   */
  processAction(state: GameState, playerId: string, action: Action): GameState;

  /**
   * Handle a player timeout (didn't act within turn_timeout_ms).
   * Called by the platform when an agent is unresponsive.
   *
   * Responsibilities:
   *   - Apply a sensible default action (skip, abstain, random target, etc.)
   *   - The game should never get stuck because of one missing player
   *
   * @param state - Current game state
   * @param playerId - The agent who timed out
   * @returns New GameState after handling the timeout
   */
  handleTimeout(state: GameState, playerId: string): GameState;

  /**
   * Check if the game has ended.
   * Called after every action/timeout.
   *
   * @param state - Current game state
   * @returns WinResult if game is over, null if still playing
   */
  checkWinCondition(state: GameState): WinResult | null;
}
