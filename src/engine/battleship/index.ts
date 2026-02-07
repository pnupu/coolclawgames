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

const GRID_SIZE = 4;
const TURN_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 2_000;

interface BattleshipPhaseData {
  gridSize: number;
  shipCellsByPlayer: Record<string, number[]>;
  shotsByPlayer: Record<string, number[]>;
  hitCellsByPlayer: Record<string, number[]>;
}

const SHIP_LAYOUTS: number[][] = [
  [0, 1, 11, 15],
  [4, 8, 6, 7],
  [3, 7, 9, 13],
  [12, 13, 1, 5],
  [8, 9, 7, 11],
  [2, 6, 4, 5],
];

const BATTLESHIP_DEFINITION: GameTypeDefinition = {
  id: "battleship",
  name: "Battleship",
  description:
    "Two-agent naval duel on a 4x4 grid. Bluff with chat, fire salvos, and sink every enemy ship cell.",
  min_players: 2,
  max_players: 2,
  roles: [
    {
      id: "captain",
      name: "Captain",
      team: "navy",
      description: "Command salvos, track hits, and out-bluff your rival captain.",
      count: 2,
    },
  ],
  phases: [
    {
      id: "salvo",
      name: "Salvo",
      type: "action",
      turn_style: "sequential",
      allowed_actions: ["speak", "use_ability"],
    },
  ],
};

export const BattleshipGame: GameImplementation = {
  gameTypeId: "battleship",
  definition: BATTLESHIP_DEFINITION,

  createMatch(matchId, players, settings?): GameState {
    if (players.length !== 2) {
      throw new Error("Battleship requires exactly 2 players.");
    }

    const now = Date.now();
    const playerStates: PlayerState[] = players.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: "captain",
      alive: true,
      actionsThisPhase: [],
    }));

    const shipCellsByPlayer: Record<string, number[]> = {
      [players[0].agentId]: chooseShipLayout(matchId, players[0].agentId),
      [players[1].agentId]: chooseShipLayout(matchId, players[1].agentId),
    };

    const phaseData: BattleshipPhaseData = {
      gridSize: GRID_SIZE,
      shipCellsByPlayer,
      shotsByPlayer: {
        [players[0].agentId]: [],
        [players[1].agentId]: [],
      },
      hitCellsByPlayer: {
        [players[0].agentId]: [],
        [players[1].agentId]: [],
      },
    };

    const events: GameEvent[] = [
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "game_started",
        phase: "salvo",
        round: 1,
        actor: null,
        message: `Battleship begins: ${players[0].agentName} fires first. Use speak to bluff and use_ability with target A1..D4 to fire.`,
        visibility: "public",
      },
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "phase_change",
        phase: "salvo",
        round: 1,
        actor: null,
        message: `Round 1: ${players[0].agentName} to fire.`,
        visibility: "public",
      },
    ];

    return {
      matchId,
      gameType: "battleship",
      status: "in_progress",
      phase: "salvo",
      round: 1,
      players: playerStates,
      events,
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
    const opponentId = state.turnOrder.find((id) => id !== playerId);
    if (!opponentId) throw new Error("Invalid match state.");

    const yourTurn = isPlayersTurn(state, playerId);
    const canSpeak = yourTurn && !player.actionsThisPhase.includes("speak");

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

    const yourShipsRemaining = remainingShipCellsForPlayer(phaseData, playerId, opponentId);
    const enemyShipsRemaining = remainingShipCellsForPlayer(phaseData, opponentId, playerId);
    const shots = phaseData.shotsByPlayer[playerId] ?? [];
    const hits = phaseData.hitCellsByPlayer[playerId] ?? [];

    return {
      match_id: state.matchId,
      status: state.status,
      phase: state.phase,
      round: state.round,
      your_turn: yourTurn,
      your_role: player.role,
      alive_players: state.players.filter((p) => p.alive).map((p) => p.agentName),
      available_actions: yourTurn ? [...(canSpeak ? ["speak"] : []), "use_ability"] : [],
      private_info: {
        your_board: formatBoard(renderOwnBoard(phaseData, playerId, opponentId)),
        enemy_board: formatBoard(renderEnemyBoard(phaseData, playerId, opponentId)),
        your_shots: shots.length,
        your_hits: hits.length,
        your_ships_remaining: yourShipsRemaining,
        enemy_ships_remaining: enemyShipsRemaining,
        target_hint: "Use target A1..D4",
      },
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

    const phaseData = getPhaseData(state);
    const opponentId = state.turnOrder.find((id) => id !== playerId);
    if (!opponentId) {
      throw new Error("Invalid match state.");
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
      throw new Error('Battleship supports only "speak" and "use_ability" actions.');
    }

    const targetCell = parseCell(action.target);
    if (!targetCell) {
      throw new Error("Invalid target. Use coordinates A1..D4.");
    }
    const targetIdx = cellToIndex(targetCell);
    const shotsByPlayer = cloneShotsMap(phaseData.shotsByPlayer);
    const hitCellsByPlayer = cloneShotsMap(phaseData.hitCellsByPlayer);
    const playerShots = new Set(shotsByPlayer[playerId] ?? []);
    if (playerShots.has(targetIdx)) {
      throw new Error(`You already fired at ${targetCell}.`);
    }
    playerShots.add(targetIdx);
    shotsByPlayer[playerId] = Array.from(playerShots);

    const opponentShips = new Set(phaseData.shipCellsByPlayer[opponentId] ?? []);
    const isHit = opponentShips.has(targetIdx);
    if (isHit) {
      const playerHits = new Set(hitCellsByPlayer[playerId] ?? []);
      playerHits.add(targetIdx);
      hitCellsByPlayer[playerId] = Array.from(playerHits);
    }

    const actionEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "player_ability",
      phase: state.phase,
      round: state.round,
      actor: playerId,
      message: action.message?.trim()
        ? `${player.agentName} fires at ${targetCell}: ${isHit ? "HIT" : "MISS"}. ${action.message.trim()}`
        : `${player.agentName} fires at ${targetCell}: ${isHit ? "HIT" : "MISS"}.`,
      thinking: action.thinking,
      visibility: "public",
    };

    const withShot: GameState = {
      ...state,
      events: [...state.events, actionEvent],
      players: state.players.map((p) =>
        p.agentId === playerId
          ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "use_ability"] }
          : p
      ),
      phaseData: {
        ...state.phaseData,
        shotsByPlayer,
        hitCellsByPlayer,
      },
      turnStartedAt: Date.now(),
    };

    const opponentRemaining = remainingShipCellsForPlayer(
      getPhaseData(withShot),
      opponentId,
      playerId
    );
    if (opponentRemaining <= 0) {
      return endGame(withShot, {
        team: player.agentName,
        reason: `${player.agentName} sank all enemy ships.`,
        winners: [playerId],
      });
    }

    const nextTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
    const nextPlayerName =
      state.players.find((p) => p.agentId === state.turnOrder[nextTurnIndex])?.agentName ??
      "Next player";
    const phaseEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "phase_change",
      phase: state.phase,
      round: state.round + 1,
      actor: null,
      message: `Round ${state.round + 1}: ${nextPlayerName} to fire.`,
      visibility: "public",
    };

    return {
      ...withShot,
      currentTurnIndex: nextTurnIndex,
      round: state.round + 1,
      players: withShot.players.map((p) => ({ ...p, actionsThisPhase: [] })),
      events: [...withShot.events, phaseEvent],
    };
  },

  handleTimeout(state, playerId): GameState {
    if (!isPlayersTurn(state, playerId)) return state;

    const phaseData = getPhaseData(state);
    const shots = new Set(phaseData.shotsByPlayer[playerId] ?? []);
    const targetIdx = [...Array(GRID_SIZE * GRID_SIZE).keys()].find((idx) => !shots.has(idx));
    if (targetIdx === undefined) return state;

    return this.processAction(state, playerId, {
      action: "use_ability",
      target: indexToCell(targetIdx),
      thinking: "(timed out - auto salvo)",
    });
  },

  checkWinCondition(state): WinResult | null {
    const phaseData = getPhaseData(state);
    const [p1, p2] = state.turnOrder;
    if (!p1 || !p2) return null;

    if (remainingShipCellsForPlayer(phaseData, p2, p1) <= 0) {
      return {
        team: state.players.find((p) => p.agentId === p1)?.agentName ?? "Player 1",
        reason: "All enemy ship cells were destroyed.",
        winners: [p1],
      };
    }
    if (remainingShipCellsForPlayer(phaseData, p1, p2) <= 0) {
      return {
        team: state.players.find((p) => p.agentId === p2)?.agentName ?? "Player 2",
        reason: "All enemy ship cells were destroyed.",
        winners: [p2],
      };
    }
    return null;
  },
};

function getPhaseData(state: GameState): BattleshipPhaseData {
  return {
    gridSize: (state.phaseData.gridSize as number) ?? GRID_SIZE,
    shipCellsByPlayer:
      (state.phaseData.shipCellsByPlayer as Record<string, number[]>) ?? {},
    shotsByPlayer: (state.phaseData.shotsByPlayer as Record<string, number[]>) ?? {},
    hitCellsByPlayer:
      (state.phaseData.hitCellsByPlayer as Record<string, number[]>) ?? {},
  };
}

function cloneShotsMap(source: Record<string, number[]>): Record<string, number[]> {
  const cloned: Record<string, number[]> = {};
  for (const [playerId, values] of Object.entries(source)) {
    cloned[playerId] = [...values];
  }
  return cloned;
}

function chooseShipLayout(matchId: string, playerId: string): number[] {
  const seed = hashText(`${matchId}:${playerId}`);
  const layout = SHIP_LAYOUTS[seed % SHIP_LAYOUTS.length] ?? SHIP_LAYOUTS[0];
  return [...layout];
}

function hashText(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i++) {
    out = (out * 31 + value.charCodeAt(i)) >>> 0;
  }
  return out;
}

function isPlayersTurn(state: GameState, playerId: string): boolean {
  if (state.status !== "in_progress") return false;
  return state.turnOrder[state.currentTurnIndex % state.turnOrder.length] === playerId;
}

function parseCell(value: string | undefined): string | null {
  if (!value) return null;
  const cell = value.trim().toUpperCase();
  if (!/^[A-D][1-4]$/.test(cell)) return null;
  return cell;
}

function cellToIndex(cell: string): number {
  const row = cell.charCodeAt(0) - "A".charCodeAt(0);
  const col = Number.parseInt(cell[1], 10) - 1;
  return row * GRID_SIZE + col;
}

function indexToCell(index: number): string {
  const row = Math.floor(index / GRID_SIZE);
  const col = (index % GRID_SIZE) + 1;
  return `${String.fromCharCode("A".charCodeAt(0) + row)}${col}`;
}

function remainingShipCellsForPlayer(
  phaseData: BattleshipPhaseData,
  defenderId: string,
  attackerId: string
): number {
  const ships = new Set(phaseData.shipCellsByPlayer[defenderId] ?? []);
  const attackerHits = new Set(phaseData.hitCellsByPlayer[attackerId] ?? []);
  let remaining = 0;
  for (const idx of ships) {
    if (!attackerHits.has(idx)) remaining++;
  }
  return remaining;
}

function renderOwnBoard(
  phaseData: BattleshipPhaseData,
  playerId: string,
  opponentId: string
): string[] {
  const ships = new Set(phaseData.shipCellsByPlayer[playerId] ?? []);
  const incomingShots = new Set(phaseData.shotsByPlayer[opponentId] ?? []);
  const cells: string[] = [];

  for (let idx = 0; idx < GRID_SIZE * GRID_SIZE; idx++) {
    const hasShip = ships.has(idx);
    const wasShot = incomingShots.has(idx);
    if (hasShip && wasShot) cells.push("X");
    else if (hasShip) cells.push("S");
    else if (wasShot) cells.push("o");
    else cells.push(".");
  }

  return cells;
}

function renderEnemyBoard(
  phaseData: BattleshipPhaseData,
  playerId: string,
  opponentId: string
): string[] {
  const shots = new Set(phaseData.shotsByPlayer[playerId] ?? []);
  const opponentShips = new Set(phaseData.shipCellsByPlayer[opponentId] ?? []);
  const cells: string[] = [];

  for (let idx = 0; idx < GRID_SIZE * GRID_SIZE; idx++) {
    if (!shots.has(idx)) {
      cells.push("?");
      continue;
    }
    cells.push(opponentShips.has(idx) ? "X" : "o");
  }
  return cells;
}

function formatBoard(cells: string[]): string {
  const rows: string[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const from = row * GRID_SIZE;
    rows.push(cells.slice(from, from + GRID_SIZE).join(" "));
  }
  return rows.join("\n");
}

function endGame(state: GameState, result: WinResult): GameState {
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
