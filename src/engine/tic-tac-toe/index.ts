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

type Cell = "A1" | "A2" | "A3" | "B1" | "B2" | "B3" | "C1" | "C2" | "C3";
type Mark = "X" | "O";

const TURN_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 2_000;
const CELLS: Cell[] = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const DEFAULT_BEST_OF = 1;
const MAX_BEST_OF = 9;
/** Safety cap: max total games (including draws) before forcing a result */
const MAX_TOTAL_GAMES_FACTOR = 2;

interface CompletedGame {
  board: Array<Mark | null>;
  winner: Mark | "draw" | null;
  winLine: number[] | null;
}

interface TttPhaseData {
  board: Array<Mark | null>;
  marksByPlayer: Record<string, Mark>;
  moveCount: number;
  /** Best-of-N series config (1 = single game) */
  bestOf: number;
  /** Series score keyed by mark: { X: 0, O: 0 } */
  seriesScore: Record<string, number>;
  /** How many individual games have been played */
  gamesPlayed: number;
  /** Who started the current game (player index into turnOrder) */
  gameStarterIndex: number;
  /** History of completed game boards in this series */
  gameHistory: CompletedGame[];
}

const TTT_DEFINITION: GameTypeDefinition = {
  id: "tic-tac-toe",
  name: "Tic Tac Toe",
  description:
    "Classic 3x3 duel for two agents. Place marks, block forks, and explain your logic as you play.",
  min_players: 2,
  max_players: 2,
  roles: [
    {
      id: "x_player",
      name: "X Player",
      team: "x",
      description: "Moves first as X.",
      count: 1,
    },
    {
      id: "o_player",
      name: "O Player",
      team: "o",
      description: "Moves second as O.",
      count: 1,
    },
  ],
  phases: [
    {
      id: "move",
      name: "Move",
      type: "action",
      turn_style: "sequential",
      allowed_actions: ["speak", "use_ability"],
    },
  ],
};

export const TicTacToeGame: GameImplementation = {
  gameTypeId: "tic-tac-toe",
  definition: TTT_DEFINITION,

  createMatch(matchId, players, settings?): GameState {
    if (players.length !== 2) {
      throw new Error("Tic Tac Toe requires exactly 2 players.");
    }

    // Parse best_of from settings
    let bestOf = DEFAULT_BEST_OF;
    if (settings?.best_of !== undefined) {
      const raw = Number(settings.best_of);
      if (!Number.isInteger(raw) || raw < 1) {
        throw new Error("best_of must be a positive odd integer.");
      }
      bestOf = Math.min(raw, MAX_BEST_OF);
      // Force odd so there's always a decisive winner
      if (bestOf % 2 === 0) bestOf += 1;
      if (bestOf > MAX_BEST_OF) bestOf = MAX_BEST_OF;
    }

    const marksByPlayer: Record<string, Mark> = {
      [players[0].agentId]: "X",
      [players[1].agentId]: "O",
    };
    const now = Date.now();

    const seriesLabel = bestOf > 1 ? ` (best of ${bestOf})` : "";
    const gameStarted: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "game_started",
      phase: "move",
      round: 1,
      actor: null,
      message: `${players[0].agentName} is X and starts. ${players[1].agentName} is O.${seriesLabel}`,
      visibility: "public",
    };

    const phaseChange: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "phase_change",
      phase: "move",
      round: 1,
      actor: null,
      message: bestOf > 1
        ? `Game 1 of ${bestOf} — Round 1: X to move.`
        : "Round 1: X to move. Use use_ability with target A1..C3.",
      visibility: "public",
    };

    const playerStates: PlayerState[] = players.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: marksByPlayer[p.agentId] === "X" ? "x_player" : "o_player",
      alive: true,
      actionsThisPhase: [],
    }));

    const phaseData: TttPhaseData = {
      board: Array<Mark | null>(9).fill(null),
      marksByPlayer,
      moveCount: 0,
      bestOf,
      seriesScore: { X: 0, O: 0 },
      gamesPlayed: 0,
      gameStarterIndex: 0,
      gameHistory: [],
    };

    return {
      matchId,
      gameType: "tic-tac-toe",
      status: "in_progress",
      phase: "move",
      round: 1,
      players: playerStates,
      events: [gameStarted, phaseChange],
      turnOrder: players.map((p) => p.agentId),
      currentTurnIndex: 0,
      actedThisPhase: new Set<AgentId>(),
      phaseData: phaseData as unknown as Record<string, unknown>,
      turnStartedAt: now,
      createdAt: now,
    };
  },

  getPlayerView(state, playerId): PlayerView {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player) throw new Error("Player not found in match.");

    const phaseData = getPhaseData(state);
    const board = formatBoard(phaseData.board);
    const yourTurn = isPlayersTurn(state, playerId);
    const yourMark = phaseData.marksByPlayer[playerId];
    const opponentId = state.turnOrder.find((id) => id !== playerId);
    const opponentMark = opponentId ? phaseData.marksByPlayer[opponentId] : undefined;

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

    const privateInfo: Record<string, unknown> = {
      your_mark: yourMark,
      opponent_mark: opponentMark,
      board,
      board_hint: "Use targets A1..C3.",
    };

    // Include series info if best_of > 1
    if (phaseData.bestOf > 1) {
      privateInfo.best_of = phaseData.bestOf;
      privateInfo.games_played = phaseData.gamesPlayed;
      privateInfo.series_score = { ...phaseData.seriesScore };
      privateInfo.wins_needed = Math.ceil(phaseData.bestOf / 2);
    }

    return {
      match_id: state.matchId,
      status: state.status,
      phase: state.phase,
      round: state.round,
      your_turn: yourTurn,
      your_role: player.role,
      alive_players: state.players.filter((p) => p.alive).map((p) => p.agentName),
      available_actions: yourTurn
        ? [
            ...(player.actionsThisPhase.includes("speak") ? [] : ["speak"]),
            "use_ability",
          ]
        : [],
      private_info: privateInfo,
      messages_since_last_poll: messages,
      poll_after_ms: yourTurn ? 0 : POLL_INTERVAL_MS,
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

    const currentTurn =
      state.status === "in_progress"
        ? state.turnOrder[state.currentTurnIndex % state.turnOrder.length] ?? null
        : null;

    // Build game-specific data for rich spectator rendering
    const phaseData = getPhaseData(state);
    const board = phaseData.board.map((cell) => cell ?? null);
    const winLine = findWinLine(board);
    const marksByName: Record<string, string> = {};
    for (const p of state.players) {
      const mark = phaseData.marksByPlayer[p.agentId];
      if (mark) marksByName[p.agentName] = mark;
    }

    const gameData: Record<string, unknown> = {
      board, // Array of 9: "X" | "O" | null
      marks_by_player: marksByName, // { "AgentName": "X", ... }
      series_score: { ...phaseData.seriesScore },
      best_of: phaseData.bestOf,
      games_played: phaseData.gamesPlayed,
      win_line: winLine, // [0,1,2] indices or null
      game_history: phaseData.gameHistory.map((g) => ({
        board: g.board,
        winner: g.winner,
        win_line: g.winLine,
      })),
    };

    return {
      match_id: state.matchId,
      game_type: state.gameType,
      status: state.status,
      phase: state.phase,
      round: state.round,
      players,
      events,
      current_turn: currentTurn,
      winner: state.winner
        ? { team: state.winner.team, reason: state.winner.reason }
        : undefined,
      created_at: state.createdAt,
      game_data: gameData,
    };
  },

  processAction(state, playerId, action): GameState {
    if (state.status !== "in_progress") {
      throw new Error("Game is not in progress.");
    }
    if (!isPlayersTurn(state, playerId)) {
      throw new Error("It is not your turn.");
    }
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive) {
      throw new Error("Invalid player.");
    }

    if (action.action === "speak") {
      if (player.actionsThisPhase.includes("speak")) {
        throw new Error("You already spoke this turn.");
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
      throw new Error('Tic Tac Toe supports only "speak" and "use_ability" actions.');
    }

    const phaseData = getPhaseData(state);
    const cell = parseCell(action.target);
    if (!cell) {
      throw new Error("Invalid cell target. Use A1..C3.");
    }
    const cellIndex = CELLS.indexOf(cell);
    if (phaseData.board[cellIndex] !== null) {
      throw new Error(`Cell ${cell} is already occupied.`);
    }

    const mark = phaseData.marksByPlayer[playerId];
    const board = [...phaseData.board];
    board[cellIndex] = mark;
    const moveCount = phaseData.moveCount + 1;

    const moveEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "player_ability",
      phase: state.phase,
      round: state.round,
      actor: playerId,
      message: action.message?.trim()
        ? `${player.agentName} placed ${mark} on ${cell}. ${action.message.trim()}`
        : `${player.agentName} placed ${mark} on ${cell}.`,
      thinking: action.thinking,
      visibility: "public",
    };

    const withMove: GameState = {
      ...state,
      events: [...state.events, moveEvent],
      players: state.players.map((p) =>
        p.agentId === playerId
          ? {
              ...p,
              actionsThisPhase: [...p.actionsThisPhase, "use_ability"],
            }
          : p
      ),
      phaseData: {
        ...state.phaseData,
        board,
        moveCount,
      },
      turnStartedAt: Date.now(),
    };

    // Check for board winner or draw
    const winnerMark = checkBoardWinner(board);
    const boardFull = board.every((v) => v !== null);

    if (winnerMark || boardFull) {
      return handleBoardResult(withMove, phaseData, winnerMark, board);
    }

    // No result yet — advance to next turn
    const nextTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
    const phaseEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "phase_change",
      phase: "move",
      round: moveCount + 1,
      actor: null,
      message: `Round ${moveCount + 1}: ${state.players.find((p) => p.agentId === state.turnOrder[nextTurnIndex])?.agentName ?? "Next player"} to move.`,
      visibility: "public",
    };

    return {
      ...withMove,
      round: moveCount + 1,
      currentTurnIndex: nextTurnIndex,
      events: [...withMove.events, phaseEvent],
      players: withMove.players.map((p) => ({ ...p, actionsThisPhase: [] })),
    };
  },

  handleTimeout(state, playerId): GameState {
    if (!isPlayersTurn(state, playerId)) return state;
    const phaseData = getPhaseData(state);
    const firstOpen = CELLS.find(
      (cell) => phaseData.board[CELLS.indexOf(cell)] === null
    );
    if (!firstOpen) return state;

    return this.processAction(state, playerId, {
      action: "use_ability",
      target: firstOpen,
      thinking: "(timed out - auto move)",
    });
  },

  checkWinCondition(state): WinResult | null {
    const phaseData = getPhaseData(state);
    const winnerMark = checkBoardWinner(phaseData.board);
    if (winnerMark) {
      const winnerId = Object.entries(phaseData.marksByPlayer).find(
        ([, value]) => value === winnerMark
      )?.[0];
      if (!winnerId) return null;
      return {
        team: winnerMark,
        reason: `Player ${winnerMark} has three in a row.`,
        winners: [winnerId],
      };
    }
    if (phaseData.board.every((cell) => cell !== null)) {
      return {
        team: "draw",
        reason: "No moves left.",
        winners: [],
      };
    }
    return null;
  },
};

// ─── Helpers ────────────────────────────────────────────────────

function parseCell(target: string | undefined): Cell | null {
  if (!target) return null;
  const normalized = target.trim().toUpperCase();
  return CELLS.includes(normalized as Cell) ? (normalized as Cell) : null;
}

function getPhaseData(state: GameState): TttPhaseData {
  const board = Array.isArray(state.phaseData.board)
    ? (state.phaseData.board as Array<Mark | null>)
    : Array<Mark | null>(9).fill(null);
  const marksByPlayer = (state.phaseData.marksByPlayer as Record<string, Mark>) ?? {};
  const moveCount = (state.phaseData.moveCount as number) ?? 0;
  const bestOf = (state.phaseData.bestOf as number) ?? DEFAULT_BEST_OF;
  const seriesScore = (state.phaseData.seriesScore as Record<string, number>) ?? { X: 0, O: 0 };
  const gamesPlayed = (state.phaseData.gamesPlayed as number) ?? 0;
  const gameStarterIndex = (state.phaseData.gameStarterIndex as number) ?? 0;
  const gameHistory = (state.phaseData.gameHistory as CompletedGame[]) ?? [];
  return { board, marksByPlayer, moveCount, bestOf, seriesScore, gamesPlayed, gameStarterIndex, gameHistory };
}

function formatBoard(board: Array<Mark | null>): string {
  const safe = board.map((cell) => cell ?? ".");
  return `${safe[0]} ${safe[1]} ${safe[2]}\n${safe[3]} ${safe[4]} ${safe[5]}\n${safe[6]} ${safe[7]} ${safe[8]}`;
}

function isPlayersTurn(state: GameState, playerId: string): boolean {
  if (state.status !== "in_progress") return false;
  return state.turnOrder[state.currentTurnIndex % state.turnOrder.length] === playerId;
}

function checkBoardWinner(board: Array<Mark | null>): Mark | null {
  for (const [a, b, c] of WIN_LINES) {
    const candidate = board[a];
    if (candidate && candidate === board[b] && candidate === board[c]) {
      return candidate;
    }
  }
  return null;
}

/** Returns the indices of the winning line, or null */
function findWinLine(board: Array<Mark | null>): number[] | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const candidate = board[a];
    if (candidate && candidate === board[b] && candidate === board[c]) {
      return line;
    }
  }
  return null;
}

function endMatch(state: GameState, result: WinResult): GameState {
  const gameOverEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "game_over",
    phase: state.phase,
    round: state.round,
    actor: null,
    message: result.reason,
    visibility: "public",
  };
  return {
    ...state,
    status: "finished",
    winner: result,
    events: [...state.events, gameOverEvent],
  };
}

/**
 * Handle the result of a single board (win or draw).
 * In a best-of-1 this ends the match. In a series it may start a new game.
 */
function handleBoardResult(
  state: GameState,
  phaseData: TttPhaseData,
  winnerMark: Mark | null,
  board: Array<Mark | null>,
): GameState {
  const { bestOf, seriesScore, gamesPlayed, marksByPlayer, gameStarterIndex, gameHistory } = phaseData;

  // Save this completed game to history
  const completedGame: CompletedGame = {
    board: [...board],
    winner: winnerMark ?? "draw",
    winLine: findWinLine(board),
  };
  const newHistory = [...gameHistory, completedGame];
  const newGamesPlayed = gamesPlayed + 1;
  const newScore = { ...seriesScore };
  const winsNeeded = Math.ceil(bestOf / 2);
  const maxTotalGames = bestOf * MAX_TOTAL_GAMES_FACTOR;

  const now = Date.now();

  if (winnerMark) {
    // Someone won this game
    newScore[winnerMark] = (newScore[winnerMark] ?? 0) + 1;

    const winnerId = Object.entries(marksByPlayer).find(([, v]) => v === winnerMark)?.[0];
    const winnerPlayer = state.players.find((p) => p.agentId === winnerId);

    const boardResultEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "vote_result",
      phase: state.phase,
      round: state.round,
      actor: null,
      message: bestOf > 1
        ? `${winnerPlayer?.agentName ?? winnerMark} wins game ${newGamesPlayed}! Score: X ${newScore.X ?? 0} – O ${newScore.O ?? 0}`
        : `${winnerPlayer?.agentName ?? "A player"} won with ${winnerMark}.`,
      visibility: "public",
    };

    const withResult: GameState = {
      ...state,
      events: [...state.events, boardResultEvent],
      phaseData: {
        ...state.phaseData,
        board,
        seriesScore: newScore,
        gamesPlayed: newGamesPlayed,
        gameHistory: newHistory,
      },
    };

    // Check if series is decided
    if (bestOf <= 1 || newScore[winnerMark] >= winsNeeded) {
      const seriesReason = bestOf > 1
        ? `${winnerPlayer?.agentName ?? winnerMark} wins the series ${newScore[winnerMark]} – ${newScore[winnerMark === "X" ? "O" : "X"] ?? 0}!`
        : `${winnerPlayer?.agentName ?? "A player"} won with ${winnerMark}.`;
      return endMatch(withResult, {
        team: winnerMark,
        reason: seriesReason,
        winners: winnerId ? [winnerId] : [],
      });
    }

    // Series continues — start new game
    return startNewGameInSeries(withResult, newGamesPlayed, newScore, gameStarterIndex);

  } else {
    // Draw
    const drawEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "vote_result",
      phase: state.phase,
      round: state.round,
      actor: null,
      message: bestOf > 1
        ? `Game ${newGamesPlayed} is a draw! Score: X ${newScore.X ?? 0} – O ${newScore.O ?? 0}. Draws don't count.`
        : "The board is full. The game ends in a draw.",
      visibility: "public",
    };

    const withResult: GameState = {
      ...state,
      events: [...state.events, drawEvent],
      phaseData: {
        ...state.phaseData,
        board,
        seriesScore: newScore,
        gamesPlayed: newGamesPlayed,
        gameHistory: newHistory,
      },
    };

    // Single game — end as draw
    if (bestOf <= 1) {
      return endMatch(withResult, {
        team: "draw",
        reason: "The board is full. The game ends in a draw.",
        winners: [],
      });
    }

    // Safety cap for infinite draws
    if (newGamesPlayed >= maxTotalGames) {
      const xScore = newScore.X ?? 0;
      const oScore = newScore.O ?? 0;
      if (xScore > oScore) {
        const xId = Object.entries(marksByPlayer).find(([, v]) => v === "X")?.[0];
        return endMatch(withResult, {
          team: "X",
          reason: `Series capped at ${newGamesPlayed} games. X wins ${xScore} – ${oScore}.`,
          winners: xId ? [xId] : [],
        });
      } else if (oScore > xScore) {
        const oId = Object.entries(marksByPlayer).find(([, v]) => v === "O")?.[0];
        return endMatch(withResult, {
          team: "O",
          reason: `Series capped at ${newGamesPlayed} games. O wins ${oScore} – ${xScore}.`,
          winners: oId ? [oId] : [],
        });
      }
      return endMatch(withResult, {
        team: "draw",
        reason: `Series capped at ${newGamesPlayed} games. Final score: X ${xScore} – O ${oScore}. Draw.`,
        winners: [],
      });
    }

    // Series continues
    return startNewGameInSeries(withResult, newGamesPlayed, newScore, gameStarterIndex);
  }
}

/**
 * Reset the board and swap who goes first for the next game in the series.
 */
function startNewGameInSeries(
  state: GameState,
  gamesPlayed: number,
  seriesScore: Record<string, number>,
  prevGameStarterIndex: number,
): GameState {
  const now = Date.now();
  const newStarterIndex = (prevGameStarterIndex + 1) % state.turnOrder.length;
  const starterName = state.players.find(
    (p) => p.agentId === state.turnOrder[newStarterIndex]
  )?.agentName ?? "Next player";

  const newGameEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    type: "phase_change",
    phase: "move",
    round: 1,
    actor: null,
    message: `Game ${gamesPlayed + 1} begins! ${starterName} moves first. Score: X ${seriesScore.X ?? 0} – O ${seriesScore.O ?? 0}`,
    visibility: "public",
  };

  return {
    ...state,
    round: 1,
    currentTurnIndex: newStarterIndex,
    events: [...state.events, newGameEvent],
    players: state.players.map((p) => ({ ...p, actionsThisPhase: [] })),
    phaseData: {
      ...state.phaseData,
      board: Array(9).fill(null),
      moveCount: 0,
      gamesPlayed,
      seriesScore,
      gameStarterIndex: newStarterIndex,
    },
    turnStartedAt: now,
  };
}
