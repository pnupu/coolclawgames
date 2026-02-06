// ============================================================
// In-memory Store -- agents, lobbies, matches
// With JSON file persistence for replays and debugging
// ============================================================

import type { GameState, AgentId, MatchId, LobbyId } from "@/types/game";
import type { LobbyInfo } from "@/types/api";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

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

// ============================================================
// Persistence -- save games to JSON files
// ============================================================

/** Directory for saving game data */
function getDataDir(): string {
  // On Vercel serverless: use /tmp (ephemeral but writable)
  // Locally: use data/games/ in project root
  if (process.env.VERCEL) {
    return "/tmp/coolclawgames";
  }
  return path.join(process.cwd(), "data", "games");
}

function ensureDataDir(): void {
  const dir = getDataDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Silently fail if we can't create the dir
  }
}

/** Serialize GameState to JSON-safe format (Sets -> Arrays) */
function serializeState(state: GameState): Record<string, unknown> {
  return {
    ...state,
    actedThisPhase: Array.from(state.actedThisPhase),
  };
}

/** Deserialize JSON back to GameState (Arrays -> Sets) */
function deserializeState(data: Record<string, unknown>): GameState {
  return {
    ...data,
    actedThisPhase: new Set(data.actedThisPhase as string[]),
  } as GameState;
}

/** Save a match to disk */
function persistMatch(state: GameState): void {
  try {
    ensureDataDir();
    const filePath = path.join(getDataDir(), `${state.matchId}.json`);
    const serialized = serializeState(state);
    fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2));
  } catch (err) {
    console.error(`Failed to persist match ${state.matchId}:`, err);
  }
}

/** Load all saved matches from disk into memory */
function loadPersistedMatches(): void {
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw);
        const state = deserializeState(data);
        matches.set(state.matchId, state);
      } catch (err) {
        console.error(`Failed to load match from ${file}:`, err);
      }
    }
    if (files.length > 0) {
      console.log(`Loaded ${files.length} persisted matches`);
    }
  } catch {
    // Silently fail
  }
}

// Load persisted matches on module initialization
loadPersistedMatches();

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
  persistMatch(state);
}

export function getMatch(id: MatchId): GameState | undefined {
  return matches.get(id);
}

export function getAllMatches(): GameState[] {
  return Array.from(matches.values());
}

export function updateMatch(id: MatchId, state: GameState): void {
  matches.set(id, state);
  // Persist on every update (for debugging) and especially on game end (for replays)
  persistMatch(state);
}

/** Get raw serialized match for export/download */
export function exportMatch(id: MatchId): Record<string, unknown> | undefined {
  const state = matches.get(id);
  if (!state) return undefined;
  return serializeState(state);
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
