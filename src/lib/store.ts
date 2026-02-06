// ============================================================
// In-memory Store -- agents, lobbies, matches
// ============================================================

import type { GameState, AgentId, MatchId, LobbyId } from "@/types/game";
import type { LobbyInfo } from "@/types/api";
import { EventEmitter } from "events";

/** Stored agent record */
export interface StoredAgent {
  id: AgentId;
  name: string;
  apiKey: string;
  description: string;
  createdAt: number;
  gamesPlayed: number;
  gamesWon: number;
  /** Rate limiting: last action timestamps */
  lastLobbyCreated: number;
  requestTimestamps: number[];
}

/** Global event emitter for turn notifications + SSE */
export const gameEvents = new EventEmitter();
gameEvents.setMaxListeners(100);

/** In-memory stores */
const agents = new Map<string, StoredAgent>();       // apiKey -> agent
const agentsByName = new Map<string, StoredAgent>();  // name -> agent
const lobbies = new Map<LobbyId, LobbyInfo>();
const matches = new Map<MatchId, GameState>();

// --- Agent operations ---

export function createAgent(name: string, description: string): StoredAgent {
  const apiKey = `ccg_${crypto.randomUUID().replace(/-/g, "")}`;
  const agent: StoredAgent = {
    id: crypto.randomUUID(),
    name,
    apiKey,
    description,
    createdAt: Date.now(),
    gamesPlayed: 0,
    gamesWon: 0,
    lastLobbyCreated: 0,
    requestTimestamps: [],
  };
  agents.set(apiKey, agent);
  agentsByName.set(name, agent);
  return agent;
}

export function getAgentByKey(apiKey: string): StoredAgent | undefined {
  return agents.get(apiKey);
}

export function getAgentByName(name: string): StoredAgent | undefined {
  return agentsByName.get(name);
}

// --- Lobby operations ---

export function createLobby(lobby: LobbyInfo): void {
  lobbies.set(lobby.id, lobby);
}

export function getLobby(id: LobbyId): LobbyInfo | undefined {
  return lobbies.get(id);
}

export function getAllLobbies(): LobbyInfo[] {
  return Array.from(lobbies.values());
}

export function updateLobby(id: LobbyId, updates: Partial<LobbyInfo>): void {
  const lobby = lobbies.get(id);
  if (lobby) {
    Object.assign(lobby, updates);
  }
}

export function deleteLobby(id: LobbyId): void {
  lobbies.delete(id);
}

// --- Match operations ---

export function createMatch(state: GameState): void {
  matches.set(state.matchId, state);
}

export function getMatch(id: MatchId): GameState | undefined {
  return matches.get(id);
}

export function getAllMatches(): GameState[] {
  return Array.from(matches.values());
}

export function updateMatch(id: MatchId, state: GameState): void {
  matches.set(id, state);
}

// --- Rate limiting ---

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

export function checkRateLimit(agent: StoredAgent): boolean {
  const now = Date.now();
  agent.requestTimestamps = agent.requestTimestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (agent.requestTimestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }
  agent.requestTimestamps.push(now);
  return true;
}

const LOBBY_COOLDOWN_MS = 10 * 60 * 1000; // 10 min

export function checkLobbyCooldown(agent: StoredAgent): boolean {
  const now = Date.now();
  if (now - agent.lastLobbyCreated < LOBBY_COOLDOWN_MS) {
    return false;
  }
  agent.lastLobbyCreated = now;
  return true;
}
