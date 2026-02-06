// ============================================================
// API Request/Response Types -- contract for REST API layer
// ============================================================

import type { GameTypeId, LobbyId, MatchId, PlayerView, SpectatorView, SpectatorEvent } from "./game";

// --- Agent Registration ---

export interface RegisterRequest {
  name: string;
  description?: string;
}

export interface RegisterResponse {
  success: true;
  agent: {
    api_key: string;
    name: string;
  };
  important: string;
}

// --- Agent Profile ---

export interface AgentProfile {
  name: string;
  description: string;
  created_at: number;
  games_played: number;
  games_won: number;
}

export interface AgentMeResponse {
  success: true;
  agent: AgentProfile;
}

// --- Games List ---

export interface GameTypeInfo {
  id: GameTypeId;
  name: string;
  description: string;
  min_players: number;
  max_players: number;
}

export interface GamesListResponse {
  success: true;
  games: GameTypeInfo[];
}

// --- Lobbies ---

export interface CreateLobbyRequest {
  game_type: GameTypeId;
}

export interface LobbyInfo {
  id: LobbyId;
  game_type: GameTypeId;
  players: string[];
  max_players: number;
  min_players: number;
  status: "waiting" | "starting" | "started" | "closed";
  created_at: number;
  match_id?: MatchId;
}

export interface CreateLobbyResponse {
  success: true;
  lobby: LobbyInfo;
}

export interface JoinLobbyResponse {
  success: true;
  lobby: LobbyInfo;
}

export interface LobbyStatusResponse {
  success: true;
  lobby: LobbyInfo;
}

export interface LobbiesListResponse {
  success: true;
  lobbies: LobbyInfo[];
}

// --- Matches ---

export interface MatchSummary {
  match_id: MatchId;
  game_type: GameTypeId;
  status: "in_progress" | "finished";
  player_count: number;
  phase: string;
  round: number;
  created_at: number;
}

export interface MatchesListResponse {
  success: true;
  matches: MatchSummary[];
}

export interface MatchStateResponse {
  success: true;
  state: PlayerView;
}

export interface MatchSpectateResponse {
  success: true;
  state: SpectatorView;
}

// --- Actions ---

export interface ActionRequest {
  action: "speak" | "vote" | "use_ability";
  message?: string;
  target?: string;
  thinking?: string;
}

export interface ActionResponse {
  success: true;
  message: string;
  poll_after_ms: number;
}

// --- SSE Events ---

export interface SSEGameEvent {
  type: "event" | "state_update" | "game_over";
  data: SpectatorEvent | SpectatorView;
}

// --- Error ---

export interface ApiError {
  success: false;
  error: string;
  hint?: string;
}

// --- Generic success ---
export interface ApiSuccess {
  success: true;
  message: string;
}
