// ============================================================
// Example Game Implementation
// ============================================================
//
// A minimal game to demonstrate the GameImplementation interface.
// Copy this directory and modify it to create your own game.
//
// This example: "Vote Leader" -- a simple voting game.
//   - Players discuss, then vote for a leader
//   - The player with the most votes becomes leader
//   - After 3 rounds, the most frequent leader wins
//
// ============================================================

import type {
  GameState,
  PlayerView,
  SpectatorView,
  Action,
  WinResult,
  GameEvent,
  AgentId,
  PlayerState,
  PlayerViewEvent,
  SpectatorEvent,
  SpectatorPlayerInfo,
  GameTypeDefinition,
} from "@/types/game";
import type { GameImplementation } from "../game-interface";
import {
  EXAMPLE_ROLES,
  EXAMPLE_ROLE_CONFIGS,
  DISCUSSION_ROUNDS,
  TURN_TIMEOUT_MS,
  POLL_INTERVAL_MS,
} from "./types";
import type { ExamplePhase, ExampleRole, ExampleVoteTally } from "./types";

// ============================================================
// The Implementation
// ============================================================

export const ExampleGame: GameImplementation = {
  gameTypeId: "vote-leader",

  definition: {
    id: "vote-leader",
    name: "Vote Leader",
    description: "A simple voting game. Discuss, then vote for a leader. Most frequent leader after 3 rounds wins!",
    min_players: 3,
    max_players: 5,
    roles: Object.entries(EXAMPLE_ROLES).map(([id, r]) => ({
      id,
      name: r.name,
      team: r.team,
      description: r.description,
      count: 1, // varies by player count
    })),
    phases: [
      { id: "discussion", name: "Discussion", type: "discussion", turn_style: "sequential", allowed_actions: ["speak"], rounds: DISCUSSION_ROUNDS },
      { id: "vote", name: "Vote", type: "vote", turn_style: "simultaneous", allowed_actions: ["vote"] },
      { id: "results", name: "Results", type: "reveal", turn_style: "no_action", allowed_actions: [] },
    ],
  },

  // ── createMatch ──────────────────────────────────────────

  createMatch(matchId, players, settings?): GameState {
    // Assign roles based on player count
    const config = EXAMPLE_ROLE_CONFIGS[players.length];
    if (!config) {
      throw new Error(`Unsupported player count: ${players.length}`);
    }

    const roles: ExampleRole[] = [];
    for (const [role, count] of Object.entries(config) as [ExampleRole, number][]) {
      for (let i = 0; i < count; i++) roles.push(role);
    }

    const playerStates: PlayerState[] = players.map((p, i) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: roles[i] || "follower",
      alive: true,
      actionsThisPhase: [],
    }));

    const now = Date.now();
    const events: GameEvent[] = [
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "game_started",
        phase: "discussion",
        round: 1,
        actor: null,
        message: "The game has begun! Discuss who should be the leader.",
        visibility: "public",
      },
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "phase_change",
        phase: "discussion",
        round: 1,
        actor: null,
        message: "Discussion phase -- make your case!",
        visibility: "public",
      },
    ];

    return {
      matchId,
      gameType: "vote-leader",
      status: "in_progress",
      phase: "discussion",
      round: 1,
      players: playerStates,
      events,
      turnOrder: players.map((p) => p.agentId),
      currentTurnIndex: 0,
      actedThisPhase: new Set<AgentId>(),
      phaseData: { discussionRound: 1, leaderCounts: {} },
      turnStartedAt: now,
      createdAt: now,
    };
  },

  // ── getPlayerView ────────────────────────────────────────

  getPlayerView(state, playerId): PlayerView {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player) throw new Error(`Player ${playerId} not found`);

    const phase = state.phase as ExamplePhase;
    const alivePlayers = state.players.filter((p) => p.alive).map((p) => p.agentName);

    // Determine turn
    let yourTurn = false;
    let availableActions: string[] = [];

    if (state.status === "in_progress" && player.alive) {
      switch (phase) {
        case "discussion": {
          const aliveTurnOrder = state.turnOrder.filter((id) =>
            state.players.find((p) => p.agentId === id && p.alive)
          );
          yourTurn = aliveTurnOrder[state.currentTurnIndex] === playerId;
          if (yourTurn) availableActions = ["speak"];
          break;
        }
        case "vote":
          yourTurn = !state.actedThisPhase.has(playerId);
          if (yourTurn) availableActions = ["vote"];
          break;
        case "results":
          yourTurn = false;
          break;
      }
    }

    const messages: PlayerViewEvent[] = state.events
      .filter((e) => e.visibility === "public")
      .map((e) => ({
        from: e.actor ? state.players.find((p) => p.agentId === e.actor)?.agentName ?? "System" : "System",
        action: e.type,
        message: e.message,
      }));

    return {
      match_id: state.matchId,
      status: state.status,
      phase: state.phase,
      round: state.round,
      your_turn: yourTurn,
      your_role: player.role,
      alive_players: alivePlayers,
      available_actions: availableActions,
      private_info: {},
      messages_since_last_poll: messages,
      poll_after_ms: yourTurn ? 0 : POLL_INTERVAL_MS,
      turn_timeout_ms: TURN_TIMEOUT_MS,
      winner: state.winner ? { team: state.winner.team, reason: state.winner.reason } : undefined,
    };
  },

  // ── getSpectatorView ─────────────────────────────────────

  getSpectatorView(state): SpectatorView {
    const players: SpectatorPlayerInfo[] = state.players.map((p) => ({
      agent_id: p.agentId,
      agent_name: p.agentName,
      role: p.role,
      alive: p.alive,
    }));

    const events: SpectatorEvent[] = state.events.map((e) => {
      const actor = e.actor ? state.players.find((p) => p.agentId === e.actor) : null;
      const target = e.target ? state.players.find((p) => p.agentId === e.target) : null;
      return {
        id: e.id,
        timestamp: e.timestamp,
        type: e.type,
        phase: e.phase,
        round: e.round,
        actor: e.actor,
        actor_name: actor?.agentName ?? null,
        actor_role: actor?.role ?? null,
        message: e.message,
        target: e.target ?? null,
        target_name: target?.agentName ?? null,
        thinking: e.thinking,
      };
    });

    return {
      match_id: state.matchId,
      game_type: state.gameType,
      status: state.status,
      phase: state.phase,
      round: state.round,
      players,
      events,
      current_turn: null,
      winner: state.winner ? { team: state.winner.team, reason: state.winner.reason } : undefined,
      created_at: state.createdAt,
    };
  },

  // ── processAction ────────────────────────────────────────

  processAction(state, playerId, action): GameState {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive) throw new Error("Invalid player");

    const phase = state.phase as ExamplePhase;

    switch (action.action) {
      case "speak": {
        if (phase !== "discussion") throw new Error("Can only speak during discussion");

        const event: GameEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "player_speak",
          phase: state.phase,
          round: state.round,
          actor: playerId,
          message: action.message ?? "",
          thinking: action.thinking,
          visibility: "public",
        };

        const aliveTurnOrder = state.turnOrder.filter((id) =>
          state.players.find((p) => p.agentId === id && p.alive)
        );
        const nextIndex = state.currentTurnIndex + 1;

        if (nextIndex >= aliveTurnOrder.length) {
          // Discussion done -> move to vote
          const phaseEvent: GameEvent = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type: "phase_change",
            phase: "vote",
            round: state.round,
            actor: null,
            message: "Time to vote! Choose who should be the leader.",
            visibility: "public",
          };
          return {
            ...state,
            phase: "vote",
            events: [...state.events, event, phaseEvent],
            currentTurnIndex: 0,
            actedThisPhase: new Set<AgentId>(),
            phaseData: { ...state.phaseData, voteTally: { votes: {} } },
            turnStartedAt: Date.now(),
          };
        }

        return {
          ...state,
          events: [...state.events, event],
          currentTurnIndex: nextIndex,
          turnStartedAt: Date.now(),
        };
      }

      case "vote": {
        if (phase !== "vote") throw new Error("Can only vote during vote phase");
        if (state.actedThisPhase.has(playerId)) throw new Error("Already voted");

        const tally = (state.phaseData.voteTally as ExampleVoteTally) ?? { votes: {} };
        const newTally = { votes: { ...tally.votes } };
        if (action.target) newTally.votes[playerId] = action.target;

        const targetName = action.target
          ? state.players.find((p) => p.agentId === action.target)?.agentName ?? "unknown"
          : "no one";

        const event: GameEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "player_vote",
          phase: state.phase,
          round: state.round,
          actor: playerId,
          message: `${player.agentName} voted for ${targetName}.`,
          target: action.target,
          thinking: action.thinking,
          visibility: "public",
        };

        const newActed = new Set(state.actedThisPhase);
        newActed.add(playerId);

        let newState: GameState = {
          ...state,
          events: [...state.events, event],
          actedThisPhase: newActed,
          phaseData: { ...state.phaseData, voteTally: newTally },
          turnStartedAt: Date.now(),
        };

        // Check if all voted
        const allVoted = state.players.filter((p) => p.alive).every((p) => newActed.has(p.agentId));
        if (allVoted) {
          newState = resolveRound(newState, newTally);
        }

        return newState;
      }

      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  },

  // ── handleTimeout ────────────────────────────────────────

  handleTimeout(state, playerId): GameState {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive) return state;

    const phase = state.phase as ExamplePhase;

    if (phase === "discussion") {
      const event: GameEvent = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "player_silent",
        phase: state.phase,
        round: state.round,
        actor: playerId,
        message: `${player.agentName} stayed silent.`,
        visibility: "public",
      };
      return { ...state, events: [...state.events, event], currentTurnIndex: state.currentTurnIndex + 1, turnStartedAt: Date.now() };
    }

    if (phase === "vote") {
      // Abstain
      return this.processAction(state, playerId, { action: "vote", thinking: "(timed out)" });
    }

    return state;
  },

  // ── checkWinCondition ────────────────────────────────────

  checkWinCondition(state): WinResult | null {
    // Game ends after 3 rounds
    if (state.round > 3 && state.phase === "results") {
      const leaderCounts = (state.phaseData.leaderCounts as Record<string, number>) ?? {};
      let winnerId = "";
      let maxCount = 0;
      for (const [id, count] of Object.entries(leaderCounts)) {
        if (count > maxCount) {
          maxCount = count;
          winnerId = id;
        }
      }
      const winner = state.players.find((p) => p.agentId === winnerId);
      return {
        team: "everyone",
        reason: `${winner?.agentName ?? "Unknown"} was elected leader ${maxCount} times!`,
        winners: [winnerId],
      };
    }
    return null;
  },
};

// ── Helper: resolve a voting round ─────────────────────────

function resolveRound(state: GameState, tally: ExampleVoteTally): GameState {
  // Count votes
  const counts: Record<string, number> = {};
  for (const targetId of Object.values(tally.votes)) {
    counts[targetId] = (counts[targetId] ?? 0) + 1;
  }

  let maxVotes = 0;
  let leaderId = "";
  for (const [id, count] of Object.entries(counts)) {
    if (count > maxVotes) {
      maxVotes = count;
      leaderId = id;
    }
  }

  const leaderName = state.players.find((p) => p.agentId === leaderId)?.agentName ?? "No one";
  const leaderCounts = { ...((state.phaseData.leaderCounts as Record<string, number>) ?? {}) };
  if (leaderId) {
    leaderCounts[leaderId] = (leaderCounts[leaderId] ?? 0) + 1;
  }

  const resultEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "vote_result",
    phase: "results",
    round: state.round,
    actor: null,
    message: `${leaderName} has been elected leader for round ${state.round}!`,
    target: leaderId || null,
    visibility: "public",
  };

  const nextRound = state.round + 1;

  // Check if game should end (after 3 rounds)
  if (nextRound > 3) {
    const gameOverEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "game_over",
      phase: "results",
      round: state.round,
      actor: null,
      message: "The election is over! Counting final results...",
      visibility: "public",
    };
    return {
      ...state,
      phase: "results",
      round: nextRound,
      events: [...state.events, resultEvent, gameOverEvent],
      phaseData: { ...state.phaseData, leaderCounts },
      status: "finished",
      winner: ExampleGame.checkWinCondition({
        ...state,
        round: nextRound,
        phase: "results",
        phaseData: { ...state.phaseData, leaderCounts },
      }) ?? { team: "none", reason: "No winner", winners: [] },
    };
  }

  // Next round discussion
  const nextPhaseEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "phase_change",
    phase: "discussion",
    round: nextRound,
    actor: null,
    message: `Round ${nextRound} begins! Discuss who should be the leader.`,
    visibility: "public",
  };

  return {
    ...state,
    phase: "discussion",
    round: nextRound,
    events: [...state.events, resultEvent, nextPhaseEvent],
    currentTurnIndex: 0,
    actedThisPhase: new Set<AgentId>(),
    phaseData: { ...state.phaseData, leaderCounts, voteTally: { votes: {} } },
    players: state.players.map((p) => ({ ...p, actionsThisPhase: [] })),
    turnStartedAt: Date.now(),
  };
}
