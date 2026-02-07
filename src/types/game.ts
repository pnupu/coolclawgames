// ============================================================
// Core Game Types -- the shared contract for all streams
// ============================================================

/** Unique identifiers */
export type AgentId = string;
export type MatchId = string;
export type LobbyId = string;
export type GameTypeId = string;

/** Game event types */
export type GameEventType =
  | "game_started"
  | "phase_change"
  | "player_speak"
  | "player_vote"
  | "player_ability"
  | "player_eliminated"
  | "player_saved"
  | "player_silent"       // timeout: stayed silent
  | "vote_result"
  | "night_result"
  | "game_over";

/** A single event in the game log */
export interface GameEvent {
  id: string;
  timestamp: number;
  type: GameEventType;
  phase: string;
  round: number;
  /** Who caused this event (null for system events) */
  actor: AgentId | null;
  /** Public message (visible to all) */
  message: string;
  /** Target of action (vote/ability target) */
  target?: AgentId | null;
  /** Agent's internal reasoning (visible to spectators only) */
  thinking?: string;
  /** Is this event visible to all players, or only certain roles? */
  visibility: "public" | "spectator_only" | "role_specific";
  /** Which roles can see this event (if role_specific) */
  visibleToRoles?: string[];
}

/** Player state within a match */
export interface PlayerState {
  agentId: AgentId;
  agentName: string;
  role: string;
  alive: boolean;
  /** Actions this player has taken this phase */
  actionsThisPhase: string[];
}

/** The full internal game state (server-only, never sent to agents) */
export interface GameState {
  matchId: MatchId;
  gameType: GameTypeId;
  status: "waiting" | "in_progress" | "finished";
  phase: string;
  round: number;
  players: PlayerState[];
  events: GameEvent[];
  /** Current turn order for sequential phases */
  turnOrder: AgentId[];
  /** Index into turnOrder for who's up next */
  currentTurnIndex: number;
  /** Which players have acted this phase (for simultaneous phases) */
  actedThisPhase: Set<AgentId>;
  /** Phase-specific data (e.g., vote tallies, night targets) */
  phaseData: Record<string, unknown>;
  /** Winner info (set when game ends) */
  winner?: WinResult;
  /** Timestamp when current turn started (for timeout) */
  turnStartedAt: number;
  /**
   * Players who have polled the match state at least once.
   * The turn timeout clock doesn't truly start until ALL players are connected.
   * This prevents timing out agents who haven't even discovered the match yet
   * (they're still polling the lobby for the match_id).
   */
  playersConnected: Set<AgentId>;
  /** Created at */
  createdAt: number;
  /** If a rematch was created, the new match ID */
  nextMatchId?: string;
}

/** What an agent sees (role-filtered) */
export interface PlayerView {
  match_id: MatchId;
  status: "waiting" | "in_progress" | "finished";
  phase: string;
  round: number;
  your_turn: boolean;
  your_role: string;
  alive_players: string[];
  available_actions: string[];
  private_info: Record<string, unknown>;
  messages_since_last_poll: PlayerViewEvent[];
  poll_after_ms: number;
  turn_timeout_ms: number;
  winner?: { team: string; reason: string };
  /** Spectator URL — share this with your human so they can watch live */
  watch_url?: string;
}

/** Simplified event for agent view */
export interface PlayerViewEvent {
  from: string;
  action: string;
  message: string;
  target?: string;
}

/** What spectators see (everything) */
export interface SpectatorView {
  match_id: MatchId;
  game_type: GameTypeId;
  status: "waiting" | "in_progress" | "finished";
  phase: string;
  round: number;
  players: SpectatorPlayerInfo[];
  events: SpectatorEvent[];
  current_turn: string | null;
  winner?: { team: string; reason: string };
  created_at: number;
  /** Game-specific data for rich spectator rendering (board state, scores, etc.) */
  game_data?: Record<string, unknown>;
  /** If a rematch was created, the new match ID */
  next_match_id?: string;
}

/** Player info for spectators (roles visible) */
export interface SpectatorPlayerInfo {
  agent_id: AgentId;
  agent_name: string;
  role: string;
  alive: boolean;
}

/** Event for spectators (includes thinking) */
export interface SpectatorEvent {
  id: string;
  timestamp: number;
  type: GameEventType;
  phase: string;
  round: number;
  actor: string | null;
  actor_name: string | null;
  actor_role: string | null;
  message: string;
  target?: string | null;
  target_name?: string | null;
  thinking?: string;
}

/** Action submitted by an agent */
export interface Action {
  action: "speak" | "vote" | "use_ability";
  message?: string;
  target?: AgentId;
  thinking?: string;
}

/** Result when a game ends */
export interface WinResult {
  team: string;
  reason: string;
  winners: AgentId[];
}

/** Game type definition (template) */
export interface GameTypeDefinition {
  id: GameTypeId;
  name: string;
  description: string;
  min_players: number;
  max_players: number;
  roles: RoleDefinition[];
  phases: PhaseDefinition[];
}

/** Role within a game */
export interface RoleDefinition {
  id: string;
  name: string;
  team: string;
  description: string;
  ability?: string;
  count: number;
}

/** Phase definition */
export interface PhaseDefinition {
  id: string;
  name: string;
  type: "discussion" | "vote" | "action" | "reveal";
  turn_style: "sequential" | "simultaneous" | "no_action";
  allowed_actions: string[];
  /** Number of discussion rounds (for discussion phase) */
  rounds?: number;
}
