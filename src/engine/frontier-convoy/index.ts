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
  FRONTIER_HUMAN_INPUT_INTERVAL_ROUNDS,
  FRONTIER_HUMAN_INPUT_WINDOW_MS,
  FRONTIER_MAX_ROUNDS,
  FRONTIER_PHASE_TIMEOUT_MS,
} from "./settings";

type FrontierPhase = "briefing" | "human_briefing" | "operations";
type ConvoyOrderType = "mine" | "research" | "escort" | "rush" | "raid";

interface ConvoyStats {
  credits: number;
  fuel: number;
  cargo: number;
  science: number;
  defense: number;
  morale: number;
  distance: number;
}

interface ConvoyOrder {
  type: ConvoyOrderType;
  targetId?: string;
  orderText?: string;
}

interface HumanDirective {
  text: string;
  submittedAt: number;
  parsedOrder: ConvoyOrder | null;
}

interface FrontierPhaseData {
  convoys: Record<string, ConvoyStats>;
  pendingOrders: Record<string, ConvoyOrder>;
  humanDirectives: Record<string, HumanDirective>;
  maxRounds: number;
  phaseTimeoutMs: number;
  humanInputEveryNRounds: number;
  humanInputWindowMs: number;
}

const POLL_INTERVAL_MS = 2_000;

const FRONTIER_DEFINITION: GameTypeDefinition = {
  id: "frontier-convoy",
  name: "Frontier Convoy",
  description:
    "Competing convoy commanders balance resources, science, security, and raids while humans coach their agent captains at timed windows.",
  min_players: 3,
  max_players: 6,
  roles: [
    {
      id: "convoy_captain",
      name: "Convoy Captain",
      team: "convoy",
      description:
        "Expand route distance, protect cargo, and outmaneuver rival caravans.",
      count: 6,
    },
  ],
  phases: [
    {
      id: "briefing",
      name: "Briefing",
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
      id: "operations",
      name: "Operations",
      type: "action",
      turn_style: "simultaneous",
      allowed_actions: ["use_ability"],
    },
  ],
};

export const FrontierConvoyGame: GameImplementation = {
  gameTypeId: "frontier-convoy",
  definition: FRONTIER_DEFINITION,

  createMatch(matchId, players, settings?): GameState {
    if (players.length < 3 || players.length > 6) {
      throw new Error("Frontier Convoy requires 3-6 players.");
    }

    const now = Date.now();
    const playerStates: PlayerState[] = players.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: "convoy_captain",
      alive: true,
      actionsThisPhase: [],
    }));

    const convoys: Record<string, ConvoyStats> = {};
    for (const p of players) {
      convoys[p.agentId] = {
        credits: 120,
        fuel: 85,
        cargo: 70,
        science: 28,
        defense: 34,
        morale: 68,
        distance: 0,
      };
    }

    const phaseData: FrontierPhaseData = {
      convoys,
      pendingOrders: {},
      humanDirectives: {},
      maxRounds: FRONTIER_MAX_ROUNDS,
      phaseTimeoutMs: FRONTIER_PHASE_TIMEOUT_MS,
      humanInputEveryNRounds: FRONTIER_HUMAN_INPUT_INTERVAL_ROUNDS,
      humanInputWindowMs: FRONTIER_HUMAN_INPUT_WINDOW_MS,
    };

    const events: GameEvent[] = [
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "game_started",
        phase: "briefing",
        round: 1,
        actor: null,
        message:
          "Convoys depart into the frontier. Negotiate, issue operations, and race for the strongest logistics empire.",
        visibility: "public",
      },
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "phase_change",
        phase: "briefing",
        round: 1,
        actor: null,
        message: "Round 1 Briefing: each convoy sends one strategic message.",
        visibility: "public",
      },
    ];

    return {
      matchId,
      gameType: "frontier-convoy",
      status: "in_progress",
      phase: "briefing",
      round: 1,
      players: playerStates,
      events,
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
    const phase = state.phase as FrontierPhase;
    const yourTurn = isPlayersTurn(state, playerId);

    const availableActions: string[] = [];
    if (yourTurn) {
      if (phase === "briefing") availableActions.push("speak");
      if (phase === "operations") availableActions.push("use_ability");
    }

    const scores: Record<string, number> = {};
    for (const p of state.players) {
      const convoy = phaseData.convoys[p.agentId];
      if (!convoy) continue;
      scores[p.agentName] = scoreConvoy(convoy);
    }

    const messages: PlayerViewEvent[] = state.events
      .filter((event) => {
        if (event.visibility === "public") return true;
        return (
          event.visibility === "role_specific" &&
          !!event.visibleToRoles?.includes(playerId)
        );
      })
      .map((event) => ({
        from: event.actor
          ? state.players.find((p) => p.agentId === event.actor)?.agentName ?? "System"
          : "System",
        action: event.type,
        message: event.message,
        target: event.target
          ? state.players.find((p) => p.agentId === event.target)?.agentName
          : undefined,
      }));

    const turnTimeoutMs =
      phase === "human_briefing" ? phaseData.humanInputWindowMs : phaseData.phaseTimeoutMs;

    return {
      match_id: state.matchId,
      status: state.status,
      phase: state.phase,
      round: state.round,
      your_turn: yourTurn,
      your_role: player.role,
      alive_players: state.players.filter((p) => p.alive).map((p) => p.agentName),
      available_actions: availableActions,
      private_info: {
        convoy: phaseData.convoys[playerId] ?? null,
        current_scores: scores,
        human_directive: phaseData.humanDirectives[playerId]?.text,
        timing: {
          phase_timeout_ms: phaseData.phaseTimeoutMs,
          human_input_window_ms: phaseData.humanInputWindowMs,
          human_input_every_n_rounds: phaseData.humanInputEveryNRounds,
        },
        command_help:
          'Operation target: "mine", "research", "escort", "rush", or rival player name/id for raid.',
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

    const events: SpectatorEvent[] = state.events.map((event) => {
      const actor = event.actor
        ? state.players.find((p) => p.agentId === event.actor)
        : null;
      const target = event.target
        ? state.players.find((p) => p.agentId === event.target)
        : null;
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.phase,
        round: event.round,
        actor: event.actor,
        actor_name: actor?.agentName ?? null,
        actor_role: actor?.role ?? null,
        message: event.message,
        target: event.target ?? null,
        target_name: target?.agentName ?? null,
        thinking: event.thinking,
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

    const phase = state.phase as FrontierPhase;
    if (phase === "human_briefing") {
      throw new Error("Human briefing is active. Agents cannot act right now.");
    }

    if (!isPlayersTurn(state, playerId)) {
      throw new Error("It is not your turn.");
    }

    if (phase === "briefing") {
      return handleBriefingAction(state, playerId, action);
    }
    if (phase === "operations") {
      return handleOperationsAction(state, playerId, action);
    }

    throw new Error(`Unknown phase: ${state.phase}`);
  },

  handleTimeout(state, playerId): GameState {
    if (!isPlayersTurn(state, playerId)) return state;

    const phase = state.phase as FrontierPhase;
    if (phase === "briefing") {
      return markBriefingSilent(state, [playerId]);
    }
    if (phase === "operations") {
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
        reason: `${alive[0].agentName} is the last convoy standing.`,
        winners: [alive[0].agentId],
      };
    }

    if (alive.length === 0) {
      return {
        team: "draw",
        reason: "All convoys collapsed in the frontier.",
        winners: [],
      };
    }

    if (state.round > phaseData.maxRounds) {
      const ranked = alive
        .map((player) => ({
          player,
          score: scoreConvoy(phaseData.convoys[player.agentId]),
        }))
        .sort((a, b) => b.score - a.score);

      if (!ranked[0]) return null;
      return {
        team: ranked[0].player.agentName,
        reason: `${ranked[0].player.agentName} leads convoy score after ${phaseData.maxRounds} rounds.`,
        winners: [ranked[0].player.agentId],
      };
    }

    return null;
  },
};

export function canAcceptFrontierHumanInput(state: GameState): boolean {
  return state.gameType === "frontier-convoy" && state.phase === "human_briefing";
}

export function applyHumanDirectiveToFrontierMatch(
  state: GameState,
  recipient: string,
  directiveText: string
): GameState {
  if (state.gameType !== "frontier-convoy") {
    throw new Error("Human directives are only supported for frontier-convoy.");
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

  const notifyEvent: GameEvent = {
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

  const privateEvent: GameEvent = {
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
    events: [...state.events, notifyEvent, privateEvent],
  };
}

export function advanceFrontierPhaseDeadline(
  state: GameState,
  now = Date.now()
): GameState | null {
  if (state.gameType !== "frontier-convoy" || state.status !== "in_progress") {
    return null;
  }

  const phase = state.phase as FrontierPhase;
  const phaseData = getPhaseData(state);
  const elapsed = now - state.turnStartedAt;

  if (phase === "human_briefing") {
    if (elapsed < phaseData.humanInputWindowMs) return null;
    return transitionToPhase(state, "operations");
  }

  if (elapsed < phaseData.phaseTimeoutMs) return null;

  if (phase === "briefing") {
    const missing = getMissingAlivePlayers(state);
    if (missing.length === 0) return nextAfterBriefing(state);
    return markBriefingSilent(state, missing);
  }

  if (phase === "operations") {
    const missing = getMissingAlivePlayers(state);
    if (missing.length === 0) return resolveRound(state);
    return applyDefaultOrders(state, missing);
  }

  return null;
}

function handleBriefingAction(state: GameState, playerId: string, action: Action): GameState {
  if (action.action !== "speak") {
    throw new Error("Briefing phase only accepts speak actions.");
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
    message = `${player.agentName} whispered route intel to ${recipient.agentName}: ${message}`;
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

  let nextState: GameState = {
    ...state,
    events: [...state.events, event],
    actedThisPhase: new Set([...state.actedThisPhase, playerId]),
    players: state.players.map((p) =>
      p.agentId === playerId ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "speak"] } : p
    ),
    turnStartedAt: Date.now(),
  };

  if (allAlivePlayersActed(nextState)) {
    nextState = nextAfterBriefing(nextState);
  }

  return nextState;
}

function handleOperationsAction(state: GameState, playerId: string, action: Action): GameState {
  if (action.action !== "use_ability") {
    throw new Error("Operations phase only accepts use_ability actions.");
  }

  const phaseData = getPhaseData(state);
  const player = state.players.find((p) => p.agentId === playerId)!;

  const directive = phaseData.humanDirectives[playerId];
  const forcedOrder = directive?.parsedOrder;
  const parsedOrder = forcedOrder ?? parseOrderTarget(state, playerId, action.target);
  if (!parsedOrder) {
    throw new Error(
      'Invalid order target. Use "mine", "research", "escort", "rush", or a rival player name/id for raid.'
    );
  }

  const pendingOrders = {
    ...phaseData.pendingOrders,
    [playerId]: {
      ...parsedOrder,
      orderText: action.message?.trim() || directive?.text || undefined,
    },
  };

  const event: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "player_ability",
    phase: state.phase,
    round: state.round,
    actor: playerId,
    target: pendingOrders[playerId].targetId,
    message: forcedOrder
      ? `${formatOrderMessage(state, playerId, pendingOrders[playerId])} (human directive enforced)`
      : formatOrderMessage(state, playerId, pendingOrders[playerId]),
    thinking: action.thinking,
    visibility: "public",
  };

  let nextState: GameState = {
    ...state,
    events: [...state.events, event],
    actedThisPhase: new Set([...state.actedThisPhase, playerId]),
    players: state.players.map((p) =>
      p.agentId === playerId
        ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "use_ability"] }
        : p
    ),
    phaseData: {
      ...state.phaseData,
      pendingOrders,
    },
    turnStartedAt: Date.now(),
  };

  if (allAlivePlayersActed(nextState)) {
    nextState = resolveRound(nextState);
  }

  return nextState;
}

function resolveRound(state: GameState): GameState {
  const phaseData = getPhaseData(state);
  const convoys = cloneConvoys(phaseData.convoys);
  const aliveIds = new Set(state.players.filter((p) => p.alive).map((p) => p.agentId));
  const events: GameEvent[] = [...state.events];

  for (const [agentId, order] of Object.entries(phaseData.pendingOrders)) {
    if (!aliveIds.has(agentId)) continue;
    const convoy = convoys[agentId];
    if (!convoy) continue;

    if (order.type === "mine") {
      convoy.credits += 32;
      convoy.cargo += 21;
      convoy.fuel -= 8;
      convoy.morale += 2;
    } else if (order.type === "research") {
      convoy.science += 24;
      convoy.credits -= 18;
      convoy.cargo -= 5;
    } else if (order.type === "escort") {
      convoy.defense += 18;
      convoy.credits -= 12;
      convoy.morale += 4;
    } else if (order.type === "rush") {
      convoy.distance += 26;
      convoy.fuel -= 18;
      convoy.morale -= 4;
      convoy.credits += 11;
    }
  }

  for (const [agentId, order] of Object.entries(phaseData.pendingOrders)) {
    if (order.type !== "raid" || !order.targetId) continue;
    if (!aliveIds.has(agentId) || !aliveIds.has(order.targetId)) continue;

    const attacker = convoys[agentId];
    const defender = convoys[order.targetId];
    if (!attacker || !defender) continue;

    const attackerPower = attacker.defense + Math.floor(attacker.science / 8) + 12;
    const defenderPower = defender.defense + Math.floor(defender.science / 9) + 10;

    const attackerName =
      state.players.find((p) => p.agentId === agentId)?.agentName ?? "Unknown";
    const defenderName =
      state.players.find((p) => p.agentId === order.targetId)?.agentName ?? "Unknown";

    if (attackerPower > defenderPower) {
      const stolenCredits = Math.min(36, Math.max(8, Math.floor(defender.credits * 0.24)));
      const stolenCargo = Math.min(18, Math.max(4, Math.floor(defender.cargo * 0.2)));

      attacker.credits += stolenCredits;
      attacker.cargo += stolenCargo;
      attacker.fuel -= 10;
      attacker.defense = Math.max(0, attacker.defense - 5);
      attacker.morale += 3;

      defender.credits -= stolenCredits;
      defender.cargo -= stolenCargo;
      defender.defense = Math.max(0, defender.defense - 13);
      defender.morale -= 11;

      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "night_result",
        phase: "operations",
        round: state.round,
        actor: agentId,
        target: order.targetId,
        message: `${attackerName} raided ${defenderName} and stole ${stolenCredits} credits + ${stolenCargo} cargo.`,
        visibility: "public",
      });
    } else {
      attacker.fuel -= 14;
      attacker.defense = Math.max(0, attacker.defense - 11);
      attacker.morale -= 9;
      defender.defense = Math.max(0, defender.defense - 4);
      defender.morale -= 1;

      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "night_result",
        phase: "operations",
        round: state.round,
        actor: agentId,
        target: order.targetId,
        message: `${attackerName} failed a raid against ${defenderName} and retreated with heavy losses.`,
        visibility: "public",
      });
    }
  }

  const players = state.players.map((p) => ({ ...p, actionsThisPhase: [] }));

  for (const player of players) {
    if (!player.alive) continue;
    const convoy = convoys[player.agentId];
    if (!convoy) continue;

    convoy.credits += 8 + Math.floor(convoy.distance / 20);
    convoy.fuel -= 6 + Math.floor(convoy.distance / 30);
    convoy.cargo -= 4;
    convoy.science += 2 + Math.floor(convoy.morale / 40);

    if (convoy.cargo < 0) {
      convoy.morale -= 8;
      convoy.cargo = 0;
      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "vote_result",
        phase: "operations",
        round: state.round,
        actor: null,
        target: player.agentId,
        message: `${player.agentName} ran short on supplies and morale dropped.`,
        visibility: "public",
      });
    }

    if (convoy.fuel < 0) {
      const shortage = Math.abs(convoy.fuel);
      convoy.fuel = 0;
      convoy.distance = Math.max(0, convoy.distance - Math.ceil(shortage / 2));
      convoy.morale -= 10;
      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "player_silent",
        phase: "operations",
        round: state.round,
        actor: player.agentId,
        message: `${player.agentName}'s convoy stalled from fuel shortage.`,
        visibility: "public",
      });
    }

    if (convoy.credits < 0) {
      convoy.morale -= 5;
    }

    convoy.credits = Math.max(-220, convoy.credits);
    convoy.fuel = Math.max(0, convoy.fuel);
    convoy.cargo = Math.max(0, convoy.cargo);
    convoy.science = Math.max(0, convoy.science);
    convoy.defense = Math.max(0, convoy.defense);
    convoy.morale = Math.max(0, Math.min(100, convoy.morale));
    convoy.distance = Math.max(0, convoy.distance);

    if (convoy.morale <= 0 || (convoy.fuel === 0 && convoy.credits < -50)) {
      player.alive = false;
      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "player_eliminated",
        phase: "operations",
        round: state.round,
        actor: null,
        target: player.agentId,
        message: `${player.agentName}'s convoy collapsed and is out of the race.`,
        visibility: "public",
      });
    }
  }

  const scoreboard = players
    .filter((p) => p.alive)
    .map((p) => `${p.agentName}: ${scoreConvoy(convoys[p.agentId])}`)
    .join(" | ");

  events.push({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "vote_result",
    phase: "operations",
    round: state.round,
    actor: null,
    message: `Round ${state.round} convoy scores -> ${scoreboard || "No surviving convoys"}`,
    visibility: "public",
  });

  let nextState: GameState = {
    ...state,
    players,
    events,
    phaseData: {
      ...state.phaseData,
      convoys,
      pendingOrders: {},
      humanDirectives: {},
    },
    actedThisPhase: new Set<AgentId>(),
    turnStartedAt: Date.now(),
  };

  const win = FrontierConvoyGame.checkWinCondition(nextState);
  if (win) {
    return endGame(nextState, win);
  }

  return transitionToPhase(nextState, "briefing", state.round + 1);
}

function nextAfterBriefing(state: GameState): GameState {
  const phaseData = getPhaseData(state);
  if (state.round % phaseData.humanInputEveryNRounds === 0) {
    return transitionToPhase(state, "human_briefing");
  }
  return transitionToPhase(state, "operations");
}

function markBriefingSilent(state: GameState, playerIds: string[]): GameState {
  const events: GameEvent[] = [...state.events];
  const actedThisPhase = new Set(state.actedThisPhase);

  for (const playerId of playerIds) {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive || actedThisPhase.has(playerId)) continue;

    events.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "player_silent",
      phase: state.phase,
      round: state.round,
      actor: playerId,
      message: `${player.agentName} sent no convoy briefing.`,
      visibility: "public",
    });

    actedThisPhase.add(playerId);
  }

  let nextState: GameState = {
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

  if (allAlivePlayersActed(nextState)) {
    nextState = nextAfterBriefing(nextState);
  }

  return nextState;
}

function applyDefaultOrders(state: GameState, playerIds: string[]): GameState {
  const phaseData = getPhaseData(state);
  const events = [...state.events];
  const pendingOrders = { ...phaseData.pendingOrders };
  const actedThisPhase = new Set(state.actedThisPhase);

  for (const playerId of playerIds) {
    const player = state.players.find((p) => p.agentId === playerId);
    if (!player || !player.alive || actedThisPhase.has(playerId)) continue;

    const directive = phaseData.humanDirectives[playerId];
    const order = directive?.parsedOrder ?? ({ type: "escort" } as ConvoyOrder);

    pendingOrders[playerId] = {
      ...order,
      orderText: directive?.text ?? "(timed out - default escort order)",
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

  let nextState: GameState = {
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

  if (allAlivePlayersActed(nextState)) {
    nextState = resolveRound(nextState);
  }

  return nextState;
}

function transitionToPhase(
  state: GameState,
  phase: FrontierPhase,
  nextRound = state.round
): GameState {
  const phaseData = getPhaseData(state);
  const message =
    phase === "briefing"
      ? `Round ${nextRound} Briefing: negotiate route plans.`
      : phase === "human_briefing"
        ? `Round ${nextRound} Human Briefing: coaching window open for ${Math.floor(
            phaseData.humanInputWindowMs / 1000
          )}s.`
        : `Round ${nextRound} Operations: choose mine, research, escort, rush, or raid.`;

  const event: GameEvent = {
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
    events: [...state.events, event],
    actedThisPhase: new Set<AgentId>(),
    players: state.players.map((p) => ({ ...p, actionsThisPhase: [] })),
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
): ConvoyOrder | null {
  const raw = target?.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();

  if (normalized === "mine") return { type: "mine" };
  if (normalized === "research") return { type: "research" };
  if (normalized === "escort") return { type: "escort" };
  if (normalized === "rush") return { type: "rush" };

  const rival = resolvePlayer(state, raw, playerId);
  if (rival) return { type: "raid", targetId: rival.agentId };

  return null;
}

function parseDirectiveAsOrder(
  state: GameState,
  playerId: string,
  text: string
): ConvoyOrder | null {
  const lower = text.toLowerCase();

  const attackIntent =
    lower.includes("raid") || lower.includes("attack") || lower.includes("strike");
  if (attackIntent) {
    for (const player of state.players) {
      if (player.agentId === playerId || !player.alive) continue;
      if (
        lower.includes(player.agentId.toLowerCase()) ||
        lower.includes(player.agentName.toLowerCase())
      ) {
        return { type: "raid", targetId: player.agentId };
      }
    }
  }

  if (lower.includes("research") || lower.includes("science") || lower.includes("tech")) {
    return { type: "research" };
  }
  if (lower.includes("escort") || lower.includes("guard") || lower.includes("defend")) {
    return { type: "escort" };
  }
  if (lower.includes("rush") || lower.includes("speed") || lower.includes("distance")) {
    return { type: "rush" };
  }
  if (
    lower.includes("mine") ||
    lower.includes("cargo") ||
    lower.includes("resource") ||
    lower.includes("profit")
  ) {
    return { type: "mine" };
  }

  return null;
}

function formatOrderMessage(state: GameState, playerId: string, order: ConvoyOrder): string {
  const playerName =
    state.players.find((p) => p.agentId === playerId)?.agentName ?? "Unknown";

  if (order.type === "mine") {
    return `${playerName} ordered resource extraction and trade prep.`;
  }
  if (order.type === "research") {
    return `${playerName} invested in convoy science and route analytics.`;
  }
  if (order.type === "escort") {
    return `${playerName} fortified escorts and convoy defenses.`;
  }
  if (order.type === "rush") {
    return `${playerName} executed a high-speed expansion push.`;
  }

  const targetName = order.targetId
    ? state.players.find((p) => p.agentId === order.targetId)?.agentName ?? "Unknown"
    : "Unknown";
  return `${playerName} launched a raid against ${targetName}.`;
}

function getPhaseData(state: GameState): FrontierPhaseData {
  return state.phaseData as unknown as FrontierPhaseData;
}

function cloneConvoys(convoys: Record<string, ConvoyStats>): Record<string, ConvoyStats> {
  const clone: Record<string, ConvoyStats> = {};
  for (const [id, stats] of Object.entries(convoys)) {
    clone[id] = { ...stats };
  }
  return clone;
}

function scoreConvoy(convoy: ConvoyStats | undefined): number {
  if (!convoy) return 0;
  return (
    convoy.distance * 4 +
    Math.floor(convoy.credits / 4) +
    convoy.science * 2 +
    convoy.defense +
    Math.floor(convoy.cargo / 2) +
    convoy.morale
  );
}

function resolvePlayer(
  state: GameState,
  rawTarget: string,
  actorId: string
): PlayerState | undefined {
  const normalized = rawTarget.trim().toLowerCase();
  if (!normalized) return undefined;

  return state.players.find(
    (player) =>
      player.alive &&
      player.agentId !== actorId &&
      (player.agentId.toLowerCase() === normalized ||
        player.agentName.toLowerCase() === normalized)
  );
}

function isPlayersTurn(state: GameState, playerId: string): boolean {
  if (state.status !== "in_progress") return false;
  if (state.phase === "human_briefing") return false;

  const player = state.players.find((p) => p.agentId === playerId);
  if (!player || !player.alive) return false;

  return !state.actedThisPhase.has(playerId);
}

function allAlivePlayersActed(state: GameState): boolean {
  return state.players
    .filter((p) => p.alive)
    .every((p) => state.actedThisPhase.has(p.agentId));
}

function getMissingAlivePlayers(state: GameState): string[] {
  return state.players
    .filter((p) => p.alive && !state.actedThisPhase.has(p.agentId))
    .map((p) => p.agentId);
}
