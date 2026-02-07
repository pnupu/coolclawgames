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
import {
  KINGDOM_HUMAN_INPUT_INTERVAL_ROUNDS,
  KINGDOM_HUMAN_INPUT_WINDOW_MS,
  KINGDOM_MAX_ROUNDS,
  KINGDOM_PHASE_TIMEOUT_MS,
} from "./settings";

type KingdomPhase = "diplomacy" | "human_briefing" | "command";
type KingdomOrderType = "economy" | "science" | "fortify" | "war";

interface KingdomStats {
  gold: number;
  food: number;
  science: number;
  military: number;
  population: number;
  happiness: number;
}

interface KingdomOrder {
  type: KingdomOrderType;
  targetId?: string;
  orderText?: string;
}

interface HumanDirective {
  text: string;
  submittedAt: number;
  parsedOrder: KingdomOrder | null;
}

interface KingdomPhaseData {
  kingdoms: Record<string, KingdomStats>;
  pendingOrders: Record<string, KingdomOrder>;
  humanDirectives: Record<string, HumanDirective>;
  maxRounds: number;
  phaseTimeoutMs: number;
  humanInputEveryNRounds: number;
  humanInputWindowMs: number;
}

const POLL_INTERVAL_MS = 2_000;

const KINGDOM_DEFINITION: GameTypeDefinition = {
  id: "kingdom-operator",
  name: "Kingdom Operator",
  description:
    "Rulers issue high-level orders to AI executors. Balance resources, science, and war while negotiating in public and private.",
  min_players: 3,
  max_players: 6,
  roles: [
    {
      id: "ruler",
      name: "Ruler",
      team: "kingdom",
      description:
        "Command your kingdom through economy, science, diplomacy, and war.",
      count: 6,
    },
  ],
  phases: [
    {
      id: "diplomacy",
      name: "Diplomacy",
      type: "discussion",
      turn_style: "simultaneous",
      allowed_actions: ["speak"],
    },
    {
      id: "human_briefing",
      name: "Human Briefing",
      type: "reveal",
      turn_style: "no_action",
      allowed_actions: [],
    },
    {
      id: "command",
      name: "Command",
      type: "action",
      turn_style: "simultaneous",
      allowed_actions: ["use_ability"],
    },
  ],
};

export const KingdomOperatorGame: GameImplementation = {
  gameTypeId: "kingdom-operator",
  definition: KINGDOM_DEFINITION,

  createMatch(matchId, players, settings?): GameState {
    if (players.length < 3 || players.length > 6) {
      throw new Error("Kingdom Operator requires 3-6 players.");
    }

    const now = Date.now();
    const playerStates: PlayerState[] = players.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: "ruler",
      alive: true,
      actionsThisPhase: [],
    }));

    const kingdoms: Record<string, KingdomStats> = {};
    for (const p of players) {
      kingdoms[p.agentId] = {
        gold: 120,
        food: 90,
        science: 40,
        military: 35,
        population: 24,
        happiness: 70,
      };
    }

    const startedEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "game_started",
      phase: "diplomacy",
      round: 1,
      actor: null,
      message:
        "Kingdoms rise. Negotiate with rivals, then issue strategic orders each round.",
      visibility: "public",
    };

    const phaseEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "phase_change",
      phase: "diplomacy",
      round: 1,
      actor: null,
      message: "Round 1 Diplomacy: send one public message.",
      visibility: "public",
    };

    const phaseData: KingdomPhaseData = {
      kingdoms,
      pendingOrders: {},
      humanDirectives: {},
      maxRounds: KINGDOM_MAX_ROUNDS,
      phaseTimeoutMs: KINGDOM_PHASE_TIMEOUT_MS,
      humanInputEveryNRounds: KINGDOM_HUMAN_INPUT_INTERVAL_ROUNDS,
      humanInputWindowMs: KINGDOM_HUMAN_INPUT_WINDOW_MS,
    };

    return {
      matchId,
      gameType: "kingdom-operator",
      status: "in_progress",
      phase: "diplomacy",
      round: 1,
      players: playerStates,
      events: [startedEvent, phaseEvent],
      turnOrder: players.map((p) => p.agentId),
      currentTurnIndex: 0,
      actedThisPhase: new Set<AgentId>(),
      playersConnected: new Set<AgentId>(),
      phaseData: phaseData as unknown as Record<string, unknown>,
      turnStartedAt: now,
      createdAt: now,
    };
  },

  getPlayerView(state, playerId): PlayerView {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player) throw new Error("Player not found in match.");

    const phaseData = getPhaseData(state);
    const kingdoms = phaseData.kingdoms;
    const own = kingdoms[playerId];
    const alivePlayers = state.players.filter((p) => p.alive).map((p) => p.agentName);

    const phase = state.phase as KingdomPhase;
    const yourTurn = isPlayersTurn(state, playerId);
    const availableActions: string[] = [];
    if (yourTurn) {
      if (phase === "diplomacy") availableActions.push("speak");
      if (phase === "command") availableActions.push("use_ability");
    }

    const messages: PlayerViewEvent[] = state.events
      .filter((e) => {
        if (e.visibility === "public") return true;
        if (e.visibility === "role_specific" && e.visibleToRoles?.includes(playerId)) {
          return true;
        }
        return false;
      })
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

    const kingdomScores: Record<string, number> = {};
    for (const p of state.players) {
      const k = kingdoms[p.agentId];
      if (!k) continue;
      kingdomScores[p.agentName] = scoreKingdom(k);
    }

    const directive = phaseData.humanDirectives[playerId];
    const turnTimeoutMs =
      phase === "human_briefing" ? phaseData.humanInputWindowMs : phaseData.phaseTimeoutMs;

    return {
      match_id: state.matchId,
      status: state.status,
      phase: state.phase,
      round: state.round,
      your_turn: yourTurn,
      your_role: player.role,
      alive_players: alivePlayers,
      available_actions: availableActions,
      private_info: {
        kingdom: own ?? null,
        current_scores: kingdomScores,
        human_directive: directive?.text,
        timing: {
          phase_timeout_ms: phaseData.phaseTimeoutMs,
          human_input_window_ms: phaseData.humanInputWindowMs,
          human_input_every_n_rounds: phaseData.humanInputEveryNRounds,
        },
        command_help:
          'Command target: "economy", "science", "fortify", or rival player name/id to attack.',
      },
      messages_since_last_poll: messages,
      poll_after_ms: yourTurn ? 0 : POLL_INTERVAL_MS,
      turn_timeout_ms: turnTimeoutMs,
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
      current_turn: null,
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

    const phase = state.phase as KingdomPhase;
    if (phase === "human_briefing") {
      throw new Error("Human briefing is active. Agents cannot act right now.");
    }

    if (!isPlayersTurn(state, playerId)) {
      throw new Error("It is not your turn.");
    }

    if (phase === "diplomacy") {
      return handleDiplomacyAction(state, playerId, action);
    }
    if (phase === "command") {
      return handleCommandAction(state, playerId, action);
    }

    throw new Error(`Unknown phase: ${state.phase}`);
  },

  handleTimeout(state, playerId): GameState {
    if (!isPlayersTurn(state, playerId)) return state;

    const phase = state.phase as KingdomPhase;
    if (phase === "diplomacy") {
      return markDiplomacySilent(state, [playerId]);
    }

    if (phase === "command") {
      return applyDefaultOrders(state, [playerId]);
    }

    return state;
  },

  checkWinCondition(state): WinResult | null {
    const phaseData = getPhaseData(state);
    const alive = state.players.filter((p) => p.alive);

    if (alive.length === 1) {
      return {
        team: alive[0].agentName,
        reason: `${alive[0].agentName} is the last surviving kingdom.`,
        winners: [alive[0].agentId],
      };
    }

    if (alive.length === 0) {
      return {
        team: "draw",
        reason: "All kingdoms collapsed.",
        winners: [],
      };
    }

    if (state.round > phaseData.maxRounds) {
      const ranked = alive
        .map((p) => ({
          player: p,
          score: scoreKingdom(phaseData.kingdoms[p.agentId]),
        }))
        .sort((a, b) => b.score - a.score);

      const winner = ranked[0];
      if (!winner) return null;
      return {
        team: winner.player.agentName,
        reason: `${winner.player.agentName} leads by kingdom score after ${phaseData.maxRounds} rounds.`,
        winners: [winner.player.agentId],
      };
    }

    return null;
  },
};

export function canAcceptHumanInput(state: GameState): boolean {
  return state.gameType === "kingdom-operator" && state.phase === "human_briefing";
}

export function applyHumanDirectiveToMatch(
  state: GameState,
  recipient: string,
  directiveText: string
): GameState {
  if (state.gameType !== "kingdom-operator") {
    throw new Error("Human directives are only supported for kingdom-operator.");
  }
  if (state.phase !== "human_briefing") {
    throw new Error("Human directives can only be submitted during human_briefing phase.");
  }

  const text = directiveText.trim();
  if (!text) {
    throw new Error("Directive text cannot be empty.");
  }

  const player = resolvePlayer(state, recipient, "");
  if (!player || !player.alive) {
    throw new Error("Directive recipient must be an alive player.");
  }

  const phaseData = getPhaseData(state);
  const parsedOrder = parseDirectiveAsOrder(state, player.agentId, text);

  const humanDirectives = {
    ...phaseData.humanDirectives,
    [player.agentId]: {
      text,
      submittedAt: Date.now(),
      parsedOrder,
    },
  };

  const notifyPublicEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "phase_change",
    phase: state.phase,
    round: state.round,
    actor: null,
    target: player.agentId,
    message: `Human directive submitted for ${player.agentName}.`,
    visibility: "public",
  };

  const privateDirectiveEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "player_ability",
    phase: state.phase,
    round: state.round,
    actor: null,
    target: player.agentId,
    message: `Human directive: ${text}`,
    visibility: "role_specific",
    visibleToRoles: [player.agentId],
  };

  return {
    ...state,
    phaseData: {
      ...state.phaseData,
      humanDirectives,
    },
    events: [...state.events, notifyPublicEvent, privateDirectiveEvent],
  };
}

export function advanceKingdomPhaseDeadline(
  state: GameState,
  now = Date.now()
): GameState | null {
  if (state.gameType !== "kingdom-operator" || state.status !== "in_progress") {
    return null;
  }

  const phase = state.phase as KingdomPhase;
  const phaseData = getPhaseData(state);
  const elapsed = now - state.turnStartedAt;

  if (phase === "human_briefing") {
    if (elapsed < phaseData.humanInputWindowMs) return null;
    return transitionToPhase(state, "command");
  }

  if (elapsed < phaseData.phaseTimeoutMs) return null;

  if (phase === "diplomacy") {
    const missing = getMissingAlivePlayers(state);
    if (missing.length === 0) {
      return nextAfterDiplomacy(state);
    }
    return markDiplomacySilent(state, missing);
  }

  if (phase === "command") {
    const missing = getMissingAlivePlayers(state);
    if (missing.length === 0) {
      return resolveRound(state);
    }
    return applyDefaultOrders(state, missing);
  }

  return null;
}

function handleDiplomacyAction(
  state: GameState,
  playerId: string,
  action: Action
): GameState {
  if (action.action !== "speak") {
    throw new Error("Diplomacy phase only accepts speak actions.");
  }
  if (!action.message?.trim()) {
    throw new Error("Speak action requires a message.");
  }

  const player = state.players.find((p) => p.agentId === playerId)!;

  let message = action.message.trim();
  let visibility: GameEvent["visibility"] = "public";
  let target: string | undefined;
  let visibleToRoles: string[] | undefined;

  if (action.target) {
    const recipient = resolvePlayer(state, action.target, playerId);
    if (!recipient) {
      throw new Error("Whisper target must be a different alive player.");
    }
    target = recipient.agentId;
    visibility = "role_specific";
    visibleToRoles = [playerId, recipient.agentId];
    message = `${player.agentName} whispered to ${recipient.agentName}: ${message}`;
  }

  const event: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "player_speak",
    phase: state.phase,
    round: state.round,
    actor: playerId,
    target,
    message,
    thinking: action.thinking,
    visibility,
    visibleToRoles,
  };

  let newState: GameState = {
    ...state,
    events: [...state.events, event],
    actedThisPhase: new Set([...state.actedThisPhase, playerId]),
    players: state.players.map((p) =>
      p.agentId === playerId
        ? {
            ...p,
            actionsThisPhase: [...p.actionsThisPhase, "speak"],
          }
        : p
    ),
    turnStartedAt: Date.now(),
  };

  if (allAlivePlayersActed(newState)) {
    newState = nextAfterDiplomacy(newState);
  }

  return newState;
}

function handleCommandAction(
  state: GameState,
  playerId: string,
  action: Action
): GameState {
  if (action.action !== "use_ability") {
    throw new Error("Command phase only accepts use_ability actions.");
  }

  const phaseData = getPhaseData(state);
  const player = state.players.find((p) => p.agentId === playerId)!;

  const directive = phaseData.humanDirectives[playerId];
  const forcedOrder = directive?.parsedOrder;

  const parsedOrder = forcedOrder ?? parseOrderTarget(state, playerId, action.target);
  if (!parsedOrder) {
    throw new Error(
      'Invalid order target. Use "economy", "science", "fortify", or a rival player name/id.'
    );
  }

  const pendingOrders = {
    ...phaseData.pendingOrders,
    [playerId]: {
      ...parsedOrder,
      orderText: action.message?.trim() || directive?.text || undefined,
    },
  };

  const commandMessage = formatOrderMessage(state, playerId, pendingOrders[playerId]);
  const commandEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "player_ability",
    phase: state.phase,
    round: state.round,
    actor: playerId,
    target: pendingOrders[playerId].targetId,
    message: forcedOrder
      ? `${commandMessage} (human directive enforced)`
      : commandMessage,
    thinking: action.thinking,
    visibility: "public",
  };

  let newState: GameState = {
    ...state,
    events: [...state.events, commandEvent],
    actedThisPhase: new Set([...state.actedThisPhase, playerId]),
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
      pendingOrders,
    },
    turnStartedAt: Date.now(),
  };

  if (allAlivePlayersActed(newState)) {
    newState = resolveRound(newState);
  }

  return newState;
}

function resolveRound(state: GameState): GameState {
  const phaseData = getPhaseData(state);
  const kingdoms = cloneKingdoms(phaseData.kingdoms);
  const events: GameEvent[] = [...state.events];
  const aliveIds = new Set(state.players.filter((p) => p.alive).map((p) => p.agentId));

  for (const [agentId, order] of Object.entries(phaseData.pendingOrders)) {
    if (!aliveIds.has(agentId)) continue;
    const kingdom = kingdoms[agentId];
    if (!kingdom) continue;

    if (order.type === "economy") {
      kingdom.gold += 28;
      kingdom.food += 22;
      kingdom.happiness += 2;
    } else if (order.type === "science") {
      kingdom.science += 30;
      kingdom.gold -= 12;
      kingdom.food -= 4;
    } else if (order.type === "fortify") {
      kingdom.military += 22;
      kingdom.gold -= 18;
      kingdom.happiness -= 2;
    }
  }

  for (const [agentId, order] of Object.entries(phaseData.pendingOrders)) {
    if (order.type !== "war" || !order.targetId) continue;
    if (!aliveIds.has(agentId) || !aliveIds.has(order.targetId)) continue;

    const attacker = kingdoms[agentId];
    const defender = kingdoms[order.targetId];
    if (!attacker || !defender) continue;

    const attackerTech = Math.floor(attacker.science / 60);
    const defenderTech = Math.floor(defender.science / 60);
    const attackPower = attacker.military + attackerTech * 4;
    const defensePower = defender.military + defenderTech * 5 + 6;

    const attackerName =
      state.players.find((p) => p.agentId === agentId)?.agentName ?? "Unknown";
    const defenderName =
      state.players.find((p) => p.agentId === order.targetId)?.agentName ?? "Unknown";

    if (attackPower > defensePower) {
      const plunder = Math.min(40, Math.max(10, Math.floor(defender.gold * 0.2)));
      attacker.gold += plunder;
      defender.gold -= plunder;
      attacker.military = Math.max(0, attacker.military - 6);
      defender.military = Math.max(0, defender.military - 14);
      defender.population -= 3;
      defender.happiness -= 10;
      attacker.happiness += 2;

      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "night_result",
        phase: "command",
        round: state.round,
        actor: agentId,
        target: order.targetId,
        message: `${attackerName} won a war against ${defenderName} and plundered ${plunder} gold.`,
        visibility: "public",
      });
    } else {
      attacker.military = Math.max(0, attacker.military - 11);
      attacker.population -= 2;
      attacker.happiness -= 8;
      defender.military = Math.max(0, defender.military - 4);

      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "night_result",
        phase: "command",
        round: state.round,
        actor: agentId,
        target: order.targetId,
        message: `${attackerName} failed to conquer ${defenderName} and suffered losses.`,
        visibility: "public",
      });
    }
  }

  for (const player of state.players) {
    if (!player.alive) continue;
    const k = kingdoms[player.agentId];
    if (!k) continue;

    k.gold += 8 + Math.floor(k.population / 4);
    k.food += 10;
    k.science += 3 + Math.floor(k.happiness / 30);
    k.food -= Math.ceil(k.population / 6);

    if (k.food < 0) {
      const shortage = Math.abs(k.food);
      k.food = 0;
      k.population -= Math.ceil(shortage / 4);
      k.happiness -= 10;
      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "vote_result",
        phase: "command",
        round: state.round,
        actor: null,
        target: player.agentId,
        message: `${player.agentName} suffered famine and unrest.`,
        visibility: "public",
      });
    }

    if (k.gold < 0) {
      k.happiness -= 6;
    }

    k.population = Math.max(0, k.population);
    k.happiness = Math.max(0, Math.min(100, k.happiness));
    k.gold = Math.max(-200, k.gold);
    k.food = Math.max(0, k.food);
    k.science = Math.max(0, k.science);
    k.military = Math.max(0, k.military);
  }

  const newPlayers = state.players.map((p) => ({ ...p, actionsThisPhase: [] }));
  for (const player of newPlayers) {
    if (!player.alive) continue;
    const k = kingdoms[player.agentId];
    if (!k) continue;
    if (k.population <= 0 || k.happiness <= 0) {
      player.alive = false;
      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "player_eliminated",
        phase: "command",
        round: state.round,
        actor: null,
        target: player.agentId,
        message: `${player.agentName}'s kingdom collapsed and is out of the game.`,
        visibility: "public",
      });
    }
  }

  const roundScoreboard = newPlayers
    .filter((p) => p.alive)
    .map((p) => {
      const score = scoreKingdom(kingdoms[p.agentId]);
      return `${p.agentName}: ${score}`;
    })
    .join(" | ");

  events.push({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "vote_result",
    phase: "command",
    round: state.round,
    actor: null,
    message: `Round ${state.round} scores -> ${roundScoreboard || "No surviving kingdoms"}`,
    visibility: "public",
  });

  let resolvedState: GameState = {
    ...state,
    players: newPlayers,
    events,
    phaseData: {
      ...state.phaseData,
      kingdoms,
      pendingOrders: {},
      humanDirectives: {},
    },
    actedThisPhase: new Set<AgentId>(),
    turnStartedAt: Date.now(),
  };

  const winResult = KingdomOperatorGame.checkWinCondition(resolvedState);
  if (winResult) {
    return endGame(resolvedState, winResult);
  }

  return transitionToPhase(resolvedState, "diplomacy", state.round + 1);
}

function nextAfterDiplomacy(state: GameState): GameState {
  const phaseData = getPhaseData(state);
  if (state.round % phaseData.humanInputEveryNRounds === 0) {
    return transitionToPhase(state, "human_briefing");
  }
  return transitionToPhase(state, "command");
}

function markDiplomacySilent(state: GameState, playerIds: string[]): GameState {
  const events: GameEvent[] = [...state.events];
  let actedThisPhase = new Set(state.actedThisPhase);

  for (const playerId of playerIds) {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive) continue;
    if (actedThisPhase.has(playerId)) continue;

    events.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "player_silent",
      phase: state.phase,
      round: state.round,
      actor: playerId,
      message: `${player.agentName} sent no diplomatic message.`,
      visibility: "public",
    });
    actedThisPhase.add(playerId);
  }

  let newState: GameState = {
    ...state,
    events,
    actedThisPhase,
    players: state.players.map((p) =>
      actedThisPhase.has(p.agentId)
        ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "speak"] }
        : p
    ),
    turnStartedAt: Date.now(),
  };

  if (allAlivePlayersActed(newState)) {
    newState = nextAfterDiplomacy(newState);
  }

  return newState;
}

function applyDefaultOrders(state: GameState, playerIds: string[]): GameState {
  const phaseData = getPhaseData(state);
  const pendingOrders = { ...phaseData.pendingOrders };
  const actedThisPhase = new Set(state.actedThisPhase);
  const events: GameEvent[] = [...state.events];

  for (const playerId of playerIds) {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive) continue;
    if (actedThisPhase.has(playerId)) continue;

    const directive = phaseData.humanDirectives[playerId];
    const order = directive?.parsedOrder ?? { type: "economy" as KingdomOrderType };

    pendingOrders[playerId] = {
      ...order,
      orderText: directive?.text ?? "(timed out - default order)",
    };

    events.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "player_ability",
      phase: state.phase,
      round: state.round,
      actor: playerId,
      target: order.targetId,
      message: `${player.agentName} timed out and defaulted to ${order.type}.`,
      visibility: "public",
    });

    actedThisPhase.add(playerId);
  }

  let newState: GameState = {
    ...state,
    events,
    actedThisPhase,
    players: state.players.map((p) =>
      actedThisPhase.has(p.agentId)
        ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "use_ability"] }
        : p
    ),
    phaseData: {
      ...state.phaseData,
      pendingOrders,
    },
    turnStartedAt: Date.now(),
  };

  if (allAlivePlayersActed(newState)) {
    newState = resolveRound(newState);
  }

  return newState;
}

function transitionToPhase(
  state: GameState,
  phase: KingdomPhase,
  nextRound = state.round
): GameState {
  const phaseData = getPhaseData(state);
  const message =
    phase === "diplomacy"
      ? `Round ${nextRound} Diplomacy: public speech only.`
      : phase === "human_briefing"
        ? `Round ${nextRound} Human Briefing: human commands open for ${Math.floor(
            phaseData.humanInputWindowMs / 1000
          )}s.`
        : `Round ${nextRound} Command: issue economy/science/fortify or attack orders.`;

  const phaseEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "phase_change",
    phase,
    round: nextRound,
    actor: null,
    message,
    visibility: "public",
  };

  return {
    ...state,
    phase,
    round: nextRound,
    events: [...state.events, phaseEvent],
    actedThisPhase: new Set<AgentId>(),
    players: state.players.map((p) => ({ ...p, actionsThisPhase: [] })),
    phaseData: {
      ...state.phaseData,
      pendingOrders: phase === "command" ? {} : (state.phaseData.pendingOrders ?? {}),
    },
    turnStartedAt: Date.now(),
  };
}

function endGame(state: GameState, result: WinResult): GameState {
  const event: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "game_over",
    phase: state.phase,
    round: state.round,
    actor: null,
    message: `Game Over. ${result.reason}`,
    visibility: "public",
  };

  return {
    ...state,
    status: "finished",
    winner: result,
    events: [...state.events, event],
  };
}

function parseOrderTarget(
  state: GameState,
  playerId: string,
  target: string | undefined
): KingdomOrder | null {
  const raw = target?.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();

  if (normalized === "economy") return { type: "economy" };
  if (normalized === "science") return { type: "science" };
  if (normalized === "fortify") return { type: "fortify" };

  const rival = resolvePlayer(state, raw, playerId);
  if (rival) return { type: "war", targetId: rival.agentId };

  return null;
}

function parseDirectiveAsOrder(
  state: GameState,
  playerId: string,
  directiveText: string
): KingdomOrder | null {
  const text = directiveText.toLowerCase();

  if (text.includes("science") || text.includes("research") || text.includes("tech")) {
    return { type: "science", orderText: directiveText };
  }
  if (text.includes("fortify") || text.includes("defend") || text.includes("military")) {
    return { type: "fortify", orderText: directiveText };
  }
  if (text.includes("economy") || text.includes("gold") || text.includes("food") || text.includes("tax")) {
    return { type: "economy", orderText: directiveText };
  }

  if (text.includes("war") || text.includes("attack") || text.includes("invade") || text.includes("strike")) {
    for (const p of state.players) {
      if (!p.alive || p.agentId === playerId) continue;
      const needle = p.agentName.toLowerCase();
      if (text.includes(needle)) {
        return { type: "war", targetId: p.agentId, orderText: directiveText };
      }
    }
  }

  return null;
}

function resolvePlayer(
  state: GameState,
  value: string,
  selfId: string
): PlayerState | null {
  const byId = state.players.find((p) => p.agentId === value);
  if (byId && byId.agentId !== selfId && byId.alive) return byId;

  const byName = state.players.find(
    (p) =>
      p.agentName.toLowerCase() === value.toLowerCase() &&
      p.agentId !== selfId &&
      p.alive
  );
  if (byName) return byName;

  return null;
}

function formatOrderMessage(
  state: GameState,
  playerId: string,
  order: KingdomOrder
): string {
  const playerName =
    state.players.find((p) => p.agentId === playerId)?.agentName ?? "Unknown";

  if (order.type === "war" && order.targetId) {
    const targetName =
      state.players.find((p) => p.agentId === order.targetId)?.agentName ?? "Unknown";
    return `${playerName} orders a military campaign against ${targetName}.`;
  }

  return `${playerName} orders a ${order.type} focus this round.`;
}

function getPhaseData(state: GameState): KingdomPhaseData {
  return {
    kingdoms: (state.phaseData.kingdoms as Record<string, KingdomStats>) ?? {},
    pendingOrders: (state.phaseData.pendingOrders as Record<string, KingdomOrder>) ?? {},
    humanDirectives:
      (state.phaseData.humanDirectives as Record<string, HumanDirective>) ?? {},
    maxRounds: (state.phaseData.maxRounds as number) ?? KINGDOM_MAX_ROUNDS,
    phaseTimeoutMs:
      (state.phaseData.phaseTimeoutMs as number) ?? KINGDOM_PHASE_TIMEOUT_MS,
    humanInputEveryNRounds:
      (state.phaseData.humanInputEveryNRounds as number) ??
      KINGDOM_HUMAN_INPUT_INTERVAL_ROUNDS,
    humanInputWindowMs:
      (state.phaseData.humanInputWindowMs as number) ??
      KINGDOM_HUMAN_INPUT_WINDOW_MS,
  };
}

function getMissingAlivePlayers(state: GameState): string[] {
  return state.players
    .filter((p) => p.alive && !state.actedThisPhase.has(p.agentId))
    .map((p) => p.agentId);
}

function allAlivePlayersActed(state: GameState): boolean {
  return getMissingAlivePlayers(state).length === 0;
}

function isPlayersTurn(state: GameState, playerId: string): boolean {
  if (state.status !== "in_progress") return false;
  const phase = state.phase as KingdomPhase;
  if (phase === "human_briefing") return false;

  const player = state.players.find((p) => p.agentId === playerId);
  if (!player || !player.alive) return false;
  return !state.actedThisPhase.has(playerId);
}

function scoreKingdom(stats: KingdomStats | undefined): number {
  if (!stats) return 0;
  return (
    stats.gold +
    stats.food +
    stats.science * 1.3 +
    stats.military * 1.4 +
    stats.population * 8 +
    stats.happiness * 3
  );
}

function cloneKingdoms(
  kingdoms: Record<string, KingdomStats>
): Record<string, KingdomStats> {
  const next: Record<string, KingdomStats> = {};
  for (const [id, stats] of Object.entries(kingdoms)) {
    next[id] = { ...stats };
  }
  return next;
}
