import type {
  Action,
  AgentId,
  GameEvent,
  GameState,
  GameTypeDefinition,
  PlayerState,
  PlayerView,
  PlayerViewEvent,
  SpectatorEvent,
  SpectatorPlayerInfo,
  SpectatorView,
  WinResult,
} from "@/types/game";
import type { GameImplementation } from "@/engine/template/game-interface";

type Move = "rock" | "paper" | "scissors";

const TURN_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;
const TARGET_WINS = 4; // best of 7
const MOVES: Move[] = ["rock", "paper", "scissors"];

interface RpsPhaseData {
  targetWins: number;
  currentThrows: Record<string, Move>;
  scores: Record<string, number>;
}

const RPS_DEFINITION: GameTypeDefinition = {
  id: "rock-paper-scissors",
  name: "Rock Paper Scissors",
  description:
    "Best-of-seven duel. Bluff with chat and lock in throws each round.",
  min_players: 2,
  max_players: 2,
  roles: [
    {
      id: "duelist",
      name: "Duelist",
      team: "duel",
      description: "Read your opponent and adapt faster.",
      count: 2,
    },
  ],
  phases: [
    {
      id: "throw",
      name: "Throw",
      type: "action",
      turn_style: "simultaneous",
      allowed_actions: ["speak", "use_ability"],
    },
  ],
};

export const RockPaperScissorsGame: GameImplementation = {
  gameTypeId: "rock-paper-scissors",
  definition: RPS_DEFINITION,

  createMatch(matchId, players): GameState {
    if (players.length !== 2) {
      throw new Error("Rock Paper Scissors requires exactly 2 players.");
    }

    const now = Date.now();
    const events: GameEvent[] = [
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "game_started",
        phase: "throw",
        round: 1,
        actor: null,
        message: `Best of 7 begins: first to ${TARGET_WINS} round wins.`,
        visibility: "public",
      },
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "phase_change",
        phase: "throw",
        round: 1,
        actor: null,
        message: "Round 1: use_ability with target rock, paper, or scissors.",
        visibility: "public",
      },
    ];

    const playerStates: PlayerState[] = players.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: "duelist",
      alive: true,
      actionsThisPhase: [],
    }));

    const scores: Record<string, number> = {
      [players[0].agentId]: 0,
      [players[1].agentId]: 0,
    };

    return {
      matchId,
      gameType: "rock-paper-scissors",
      status: "in_progress",
      phase: "throw",
      round: 1,
      players: playerStates,
      events,
      turnOrder: players.map((p) => p.agentId),
      currentTurnIndex: 0,
      actedThisPhase: new Set<AgentId>(),
      phaseData: {
        targetWins: TARGET_WINS,
        currentThrows: {},
        scores,
      },
      turnStartedAt: now,
      createdAt: now,
    };
  },

  getPlayerView(state, playerId): PlayerView {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player) throw new Error("Player not found in match.");

    const phaseData = getPhaseData(state);
    const canAct = state.status === "in_progress" && !phaseData.currentThrows[playerId];
    const canSpeak = canAct && !player.actionsThisPhase.includes("speak");

    const messages: PlayerViewEvent[] = state.events
      .filter((e) => e.visibility === "public")
      .map((e) => ({
        from: e.actor
          ? state.players.find((p) => p.agentId === e.actor)?.agentName ?? "System"
          : "System",
        action: e.type,
        message: e.message,
        target: e.target
          ? state.players.find((p) => p.agentId === e.target)?.agentName
          : undefined,
      }));

    const opponentId = state.turnOrder.find((id) => id !== playerId);
    const yourScore = phaseData.scores[playerId] ?? 0;
    const opponentScore = opponentId ? phaseData.scores[opponentId] ?? 0 : 0;

    return {
      match_id: state.matchId,
      status: state.status,
      phase: state.phase,
      round: state.round,
      your_turn: canAct,
      your_role: player.role,
      alive_players: state.players.filter((p) => p.alive).map((p) => p.agentName),
      available_actions: canAct ? [...(canSpeak ? ["speak"] : []), "use_ability"] : [],
      private_info: {
        target_wins: phaseData.targetWins,
        your_score: yourScore,
        opponent_score: opponentScore,
        throw_hint: "Send use_ability target=rock|paper|scissors.",
      },
      messages_since_last_poll: messages,
      poll_after_ms: canAct ? 0 : POLL_INTERVAL_MS,
      turn_timeout_ms: TURN_TIMEOUT_MS,
      winner: state.winner
        ? { team: state.winner.team, reason: state.winner.reason }
        : undefined,
    };
  },

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
      current_turn: null, // simultaneous throws
      winner: state.winner
        ? { team: state.winner.team, reason: state.winner.reason }
        : undefined,
      created_at: state.createdAt,
    };
  },

  processAction(state, playerId, action): GameState {
    if (state.status !== "in_progress") {
      throw new Error("Game is not in progress.");
    }
    const phaseData = getPhaseData(state);
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive) {
      throw new Error("Invalid player.");
    }
    if (phaseData.currentThrows[playerId]) {
      throw new Error("You already locked your throw this round.");
    }

    if (action.action === "speak") {
      if (player.actionsThisPhase.includes("speak")) {
        throw new Error("You already spoke this round.");
      }
      if (!action.message?.trim()) {
        throw new Error("Speak action requires a message.");
      }
      const speakEvent: GameEvent = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "player_speak",
        phase: state.phase,
        round: state.round,
        actor: playerId,
        message: action.message.trim(),
        thinking: action.thinking,
        visibility: "public",
      };
      return {
        ...state,
        events: [...state.events, speakEvent],
        players: state.players.map((p) =>
          p.agentId === playerId
            ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "speak"] }
            : p
        ),
      };
    }

    if (action.action !== "use_ability") {
      throw new Error('Rock Paper Scissors supports only "speak" and "use_ability".');
    }

    const move = parseMove(action.target);
    if (!move) {
      throw new Error("Invalid throw. Use rock, paper, or scissors.");
    }

    const newThrows = { ...phaseData.currentThrows, [playerId]: move };
    const lockedEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "player_ability",
      phase: state.phase,
      round: state.round,
      actor: playerId,
      message: action.message?.trim()
        ? `${player.agentName} locks a throw. ${action.message.trim()}`
        : `${player.agentName} locks a throw.`,
      thinking: action.thinking,
      visibility: "public",
    };

    let withThrow: GameState = {
      ...state,
      events: [...state.events, lockedEvent],
      players: state.players.map((p) =>
        p.agentId === playerId
          ? {
              ...p,
              actionsThisPhase: [...p.actionsThisPhase, "use_ability"],
            }
          : p
      ),
      actedThisPhase: new Set([...state.actedThisPhase, playerId]),
      phaseData: {
        ...state.phaseData,
        currentThrows: newThrows,
      },
      turnStartedAt: Date.now(),
    };

    if (Object.keys(newThrows).length < 2) {
      return withThrow;
    }

    return resolveRound(withThrow);
  },

  handleTimeout(state, playerId): GameState {
    if (state.status !== "in_progress") return state;
    const phaseData = getPhaseData(state);
    if (phaseData.currentThrows[playerId]) return state;

    const randomMove = MOVES[Math.floor(Math.random() * MOVES.length)];
    return this.processAction(state, playerId, {
      action: "use_ability",
      target: randomMove,
      thinking: "(timed out - random throw)",
    });
  },

  checkWinCondition(state): WinResult | null {
    const phaseData = getPhaseData(state);
    const targetWins = phaseData.targetWins;
    for (const player of state.players) {
      const score = phaseData.scores[player.agentId] ?? 0;
      if (score >= targetWins) {
        return {
          team: player.agentName,
          reason: `${player.agentName} reached ${score} round wins.`,
          winners: [player.agentId],
        };
      }
    }
    return null;
  },
};

function parseMove(target: string | undefined): Move | null {
  if (!target) return null;
  const normalized = target.trim().toLowerCase();
  if (!MOVES.includes(normalized as Move)) return null;
  return normalized as Move;
}

function getPhaseData(state: GameState): RpsPhaseData {
  return {
    targetWins: (state.phaseData.targetWins as number) ?? TARGET_WINS,
    currentThrows: (state.phaseData.currentThrows as Record<string, Move>) ?? {},
    scores: (state.phaseData.scores as Record<string, number>) ?? {},
  };
}

function resolveRound(state: GameState): GameState {
  const phaseData = getPhaseData(state);
  const [p1, p2] = state.turnOrder;
  const throwA = phaseData.currentThrows[p1];
  const throwB = phaseData.currentThrows[p2];
  if (!throwA || !throwB) return state;

  const outcome = compareThrows(throwA, throwB);
  const newScores = { ...phaseData.scores };
  let roundMessage = `Round ${state.round}: ${state.players.find((p) => p.agentId === p1)?.agentName} threw ${throwA}, ${state.players.find((p) => p.agentId === p2)?.agentName} threw ${throwB}.`;

  if (outcome === 1) {
    newScores[p1] = (newScores[p1] ?? 0) + 1;
    roundMessage += ` ${state.players.find((p) => p.agentId === p1)?.agentName} wins the round.`;
  } else if (outcome === -1) {
    newScores[p2] = (newScores[p2] ?? 0) + 1;
    roundMessage += ` ${state.players.find((p) => p.agentId === p2)?.agentName} wins the round.`;
  } else {
    roundMessage += " It's a tie.";
  }

  const resultEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "night_result",
    phase: "throw",
    round: state.round,
    actor: null,
    message: roundMessage,
    visibility: "public",
  };

  const scoreEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "phase_change",
    phase: "throw",
    round: state.round,
    actor: null,
    message: `Score: ${state.players.find((p) => p.agentId === p1)?.agentName} ${newScores[p1] ?? 0} - ${newScores[p2] ?? 0} ${state.players.find((p) => p.agentId === p2)?.agentName}`,
    visibility: "public",
  };

  let newState: GameState = {
    ...state,
    events: [...state.events, resultEvent, scoreEvent],
    actedThisPhase: new Set<AgentId>(),
    players: state.players.map((p) => ({ ...p, actionsThisPhase: [] })),
    phaseData: {
      ...state.phaseData,
      currentThrows: {},
      scores: newScores,
    },
    round: state.round + 1,
    turnStartedAt: Date.now(),
  };

  const winResult = RockPaperScissorsGame.checkWinCondition(newState);
  if (winResult) {
    const gameOverEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "game_over",
      phase: newState.phase,
      round: newState.round,
      actor: null,
      message: winResult.reason,
      visibility: "public",
    };
    newState = {
      ...newState,
      status: "finished",
      winner: winResult,
      events: [...newState.events, gameOverEvent],
    };
  }

  return newState;
}

function compareThrows(a: Move, b: Move): -1 | 0 | 1 {
  if (a === b) return 0;
  if (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  ) {
    return 1;
  }
  return -1;
}
