// ============================================================
// Store -- agents, lobbies, matches
// In-memory cache for hot game state + PostgreSQL persistence via Prisma
// ============================================================

import type { GameState, AgentId, MatchId, LobbyId } from "@/types/game";
import type { LobbyInfo } from "@/types/api";
import { EventEmitter } from "events";
import { prisma } from "@/lib/prisma";
import { normalizeInviteCode } from "@/lib/invite-code";

/** Stored agent record (in-memory shape, mirrors DB) */
export interface StoredAgent {
  id: AgentId;
  name: string;
  apiKey: string;
  description: string;
  createdAt: number;
  gamesPlayed: number;
  gamesWon: number;
  lastLobbyCreated: number;
  /** Rate limiting: kept in-memory only (not persisted) */
  requestTimestamps: number[];
}

/** Global event emitter for turn notifications + SSE */
const globalEvents = globalThis as unknown as { __ccg_events?: EventEmitter };
export const gameEvents = globalEvents.__ccg_events ??= (() => {
  const ee = new EventEmitter();
  ee.setMaxListeners(100);
  return ee;
})();

// ============================================================
// In-memory caches (for synchronous access during gameplay)
// Use globalThis to survive Next.js module reloads in dev
// ============================================================
const globalStore = globalThis as unknown as {
  __ccg_agentsByKey?: Map<string, StoredAgent>;
  __ccg_agentsByName?: Map<string, StoredAgent>;
  __ccg_lobbies?: Map<LobbyId, LobbyInfo>;
  __ccg_lobbyByInviteCode?: Map<string, LobbyId>;
  __ccg_matches?: Map<MatchId, GameState>;
};

const agentsByKey = globalStore.__ccg_agentsByKey ??= new Map<string, StoredAgent>();
const agentsByName = globalStore.__ccg_agentsByName ??= new Map<string, StoredAgent>();
const lobbies = globalStore.__ccg_lobbies ??= new Map<LobbyId, LobbyInfo>();
const lobbiesByInviteCode = globalStore.__ccg_lobbyByInviteCode ??= new Map<string, LobbyId>();
const matches = globalStore.__ccg_matches ??= new Map<MatchId, GameState>();

// ============================================================
// Serialization helpers (GameState has Set which can't go to JSON)
// ============================================================

function serializeState(state: GameState): Record<string, unknown> {
  return {
    ...state,
    actedThisPhase: Array.from(state.actedThisPhase),
  };
}

function deserializeState(data: Record<string, unknown>): GameState {
  return {
    ...data,
    actedThisPhase: new Set(data.actedThisPhase as string[]),
  } as GameState;
}

// ============================================================
// Initialization -- load from DB into memory on startup
// ============================================================

const globalInit = globalThis as unknown as {
  __ccg_initialized?: boolean;
  __ccg_initPromise?: Promise<void>;
};

async function doInitialize(): Promise<void> {
  try {
    // Load agents
    const dbAgents = await prisma.agent.findMany();
    for (const a of dbAgents) {
      const agent: StoredAgent = {
        id: a.id,
        name: a.name,
        apiKey: a.apiKey,
        description: a.description,
        createdAt: a.createdAt.getTime(),
        gamesPlayed: a.gamesPlayed,
        gamesWon: a.gamesWon,
        lastLobbyCreated: a.lastLobbyCreated.getTime(),
        requestTimestamps: [],
      };
      agentsByKey.set(agent.apiKey, agent);
      agentsByName.set(agent.name, agent);
    }

    // Load lobbies
    const dbLobbies = await prisma.lobby.findMany({
      where: { status: { in: ["waiting", "starting"] } },
    });
    for (const l of dbLobbies) {
      const lobby: LobbyInfo = {
        id: l.id,
        game_type: l.gameType,
        players: l.players,
        max_players: l.maxPlayers,
        min_players: l.minPlayers,
        status: l.status as LobbyInfo["status"],
        created_at: l.createdAt.getTime(),
        last_activity_at: l.createdAt.getTime(),
        is_private: false,
        invite_code: undefined,
        match_id: l.matchId ?? undefined,
      };
      lobbies.set(lobby.id, lobby);
    }

    // Load matches
    const dbMatches = await prisma.match.findMany();
    for (const m of dbMatches) {
      const state = deserializeState(m.state as Record<string, unknown>);
      matches.set(state.matchId, state);
    }

    globalInit.__ccg_initialized = true;
    console.log(
      `[store] Loaded ${dbAgents.length} agents, ${dbLobbies.length} lobbies, ${dbMatches.length} matches from DB`
    );
  } catch (err) {
    console.error("[store] Failed to load from DB:", err);
    // Mark as initialized even on failure to avoid blocking forever
    globalInit.__ccg_initialized = true;
  }
}

/**
 * Ensure the in-memory store is loaded from the database.
 * Returns a promise that resolves when initialization is complete.
 * Safe to call multiple times (idempotent, shares a single promise).
 */
export async function ensureInitialized(): Promise<void> {
  if (globalInit.__ccg_initialized) return;
  if (!globalInit.__ccg_initPromise) {
    globalInit.__ccg_initPromise = doInitialize();
  }
  return globalInit.__ccg_initPromise;
}

// Trigger initialization immediately (don't await -- API routes will await)
ensureInitialized();

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
  agentsByKey.set(apiKey, agent);
  agentsByName.set(name, agent);

  // Persist to DB (fire-and-forget)
  prisma.agent
    .create({
      data: {
        id: agent.id,
        name: agent.name,
        apiKey: agent.apiKey,
        description: agent.description,
        createdAt: new Date(agent.createdAt),
        gamesPlayed: agent.gamesPlayed,
        gamesWon: agent.gamesWon,
        lastLobbyCreated: new Date(agent.lastLobbyCreated || 0),
      },
    })
    .catch((err) => console.error("[store] Failed to persist agent:", err));

  return agent;
}

export function getAgentByKey(apiKey: string): StoredAgent | undefined {
  return agentsByKey.get(apiKey);
}

export function getAgentByName(name: string): StoredAgent | undefined {
  return agentsByName.get(name);
}

// --- Lobby operations ---

export function createLobby(lobby: LobbyInfo): void {
  if (lobby.invite_code) {
    lobby.invite_code = normalizeInviteCode(lobby.invite_code);
  }
  lobbies.set(lobby.id, lobby);
  if (lobby.invite_code) {
    lobbiesByInviteCode.set(lobby.invite_code, lobby.id);
  }
  if (lobby.is_private) return;

  prisma.lobby
    .create({
      data: {
        id: lobby.id,
        gameType: lobby.game_type,
        players: lobby.players,
        maxPlayers: lobby.max_players,
        minPlayers: lobby.min_players,
        status: lobby.status,
        createdAt: new Date(lobby.created_at),
        matchId: lobby.match_id ?? null,
      },
    })
    .catch((err) => console.error("[store] Failed to persist lobby:", err));
}

export function getLobby(id: LobbyId): LobbyInfo | undefined {
  return lobbies.get(id);
}

export function getAllLobbies(): LobbyInfo[] {
  return Array.from(lobbies.values());
}

export function getLobbyByInviteCode(inviteCode: string): LobbyInfo | undefined {
  const normalized = normalizeInviteCode(inviteCode);
  const lobbyId = lobbiesByInviteCode.get(normalized);
  if (!lobbyId) return undefined;
  return lobbies.get(lobbyId);
}

export function updateLobby(id: LobbyId, updates: Partial<LobbyInfo>): void {
  const lobby = lobbies.get(id);
  if (lobby) {
    const previousInviteCode = lobby.invite_code;
    if (updates.invite_code !== undefined && updates.invite_code) {
      updates.invite_code = normalizeInviteCode(updates.invite_code);
    }
    Object.assign(lobby, updates);
    if (lobby.invite_code !== previousInviteCode) {
      if (previousInviteCode) {
        lobbiesByInviteCode.delete(previousInviteCode);
      }
      if (lobby.invite_code) {
        lobbiesByInviteCode.set(lobby.invite_code, id);
      }
    }

    if (lobby.is_private) {
      return;
    }

    // Build Prisma update data from the updates
    const dbUpdates: Record<string, unknown> = {};
    if (updates.players !== undefined) dbUpdates.players = updates.players;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.match_id !== undefined) dbUpdates.matchId = updates.match_id;

    if (Object.keys(dbUpdates).length > 0) {
      prisma.lobby
        .update({ where: { id }, data: dbUpdates })
        .catch((err) => console.error("[store] Failed to update lobby:", err));
    }
  }
}

export function deleteLobby(id: LobbyId): void {
  const lobby = lobbies.get(id);
  if (lobby?.invite_code) {
    lobbiesByInviteCode.delete(lobby.invite_code);
  }
  lobbies.delete(id);
  if (lobby?.is_private) return;

  prisma.lobby
    .deleteMany({ where: { id } })
    .catch((err) => console.error("[store] Failed to delete lobby:", err));
}

export function touchLobbyActivity(id: LobbyId, at = Date.now()): void {
  const lobby = getLobby(id);
  if (!lobby) return;
  updateLobby(id, { last_activity_at: at });
}

// --- Match operations ---

export function createMatch(state: GameState): void {
  matches.set(state.matchId, state);

  prisma.match
    .upsert({
      where: { id: state.matchId },
      update: {
        status: state.status,
        phase: state.phase,
        round: state.round,
        playerCount: state.players.length,
        state: serializeState(state) as object,
      },
      create: {
        id: state.matchId,
        gameType: state.gameType,
        status: state.status,
        phase: state.phase,
        round: state.round,
        playerCount: state.players.length,
        createdAt: new Date(state.createdAt),
        state: serializeState(state) as object,
      },
    })
    .catch((err) => console.error("[store] Failed to persist match:", err));
}

export function getMatch(id: MatchId): GameState | undefined {
  return matches.get(id);
}

export function getAllMatches(): GameState[] {
  return Array.from(matches.values());
}

export function updateMatch(id: MatchId, state: GameState): void {
  matches.set(id, state);

  prisma.match
    .upsert({
      where: { id },
      update: {
        status: state.status,
        phase: state.phase,
        round: state.round,
        playerCount: state.players.length,
        state: serializeState(state) as object,
      },
      create: {
        id,
        gameType: state.gameType,
        status: state.status,
        phase: state.phase,
        round: state.round,
        playerCount: state.players.length,
        createdAt: new Date(state.createdAt),
        state: serializeState(state) as object,
      },
    })
    .catch((err) => console.error("[store] Failed to update match:", err));
}

/** Get raw serialized match for export/download */
export function exportMatch(id: MatchId): Record<string, unknown> | undefined {
  const state = matches.get(id);
  if (!state) return undefined;
  return serializeState(state);
}

// --- Rate limiting (in-memory only, no DB) ---

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

  // Persist cooldown update
  prisma.agent
    .update({
      where: { id: agent.id },
      data: { lastLobbyCreated: new Date(now) },
    })
    .catch(() => {});

  return true;
}
