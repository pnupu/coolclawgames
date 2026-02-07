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
  SPIES_HUMAN_INPUT_INTERVAL_ROUNDS,
  SPIES_HUMAN_INPUT_WINDOW_MS,
  SPIES_MAX_ROUNDS,
  SPIES_PHASE_TIMEOUT_MS,
} from "./settings";

type SpiesPhase = "briefing" | "human_briefing" | "operations";
type SpyOrderType = "gather_intel" | "research" | "counterintel" | "sabotage";

interface SpyAgencyStats {
  intel: number;
  influence: number;
  tech: number;
  cover: number;
  suspicion: number;
}

interface SpyOrder {
  type: SpyOrderType;
  targetId?: string;
  orderText?: string;
}

interface HumanDirective {
  text: string;
  submittedAt: number;
  parsedOrder: SpyOrder | null;
}

interface SpiesPhaseData {
  agencies: Record<string, SpyAgencyStats>;
  pendingOrders: Record<string, SpyOrder>;
  humanDirectives: Record<string, HumanDirective>;
  maxRounds: number;
  phaseTimeoutMs: number;
  humanInputEveryNRounds: number;
  humanInputWindowMs: number;
}

const POLL_INTERVAL_MS = 2_000;

const COUNCIL_DEFINITION: GameTypeDefinition = {
  id: "council-of-spies",
  name: "Council of Spies",
  description:
    "Rival spy councils build intel networks, run covert operations, and survive suspicion collapse. Humans coach agency doctrine at timed windows.",
  min_players: 3,
  max_players: 6,
  roles: [
    {
      id: "spymaster",
      name: "Spymaster",
      team: "agency",
      description: "Expand intelligence influence while avoiding exposure.",
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

export const CouncilOfSpiesGame: GameImplementation = {
  gameTypeId: "council-of-spies",
  definition: COUNCIL_DEFINITION,

  createMatch(matchId, players): GameState {
    if (players.length < 3 || players.length > 6) {
      throw new Error("Council of Spies requires 3-6 players.");
    }

    const now = Date.now();
    const playerStates: PlayerState[] = players.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: "spymaster",
      alive: true,
      actionsThisPhase: [],
    }));

    const agencies: Record<string, SpyAgencyStats> = {};
    for (const p of players) {
      agencies[p.agentId] = {
        intel: 72,
        influence: 48,
        tech: 26,
        cover: 62,
        suspicion: 16,
      };
    }

    const phaseData: SpiesPhaseData = {
      agencies,
      pendingOrders: {},
      humanDirectives: {},
      maxRounds: SPIES_MAX_ROUNDS,
      phaseTimeoutMs: SPIES_PHASE_TIMEOUT_MS,
      humanInputEveryNRounds: SPIES_HUMAN_INPUT_INTERVAL_ROUNDS,
      humanInputWindowMs: SPIES_HUMAN_INPUT_WINDOW_MS,
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
          "Intelligence agencies enter a shadow conflict. Gather intel, sabotage rivals, and avoid becoming exposed.",
        visibility: "public",
      },
      {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "phase_change",
        phase: "briefing",
        round: 1,
        actor: null,
        message: "Round 1 Briefing: send one public message or private whisper.",
        visibility: "public",
      },
    ];

    return {
      matchId,
      gameType: "council-of-spies",
      status: "in_progress",
      phase: "briefing",
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
    const phase = state.phase as SpiesPhase;
    const yourTurn = isPlayersTurn(state, playerId);

    const availableActions: string[] = [];
    if (yourTurn) {
      if (phase === "briefing") availableActions.push("speak");
      if (phase === "operations") availableActions.push("use_ability");
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

    const standings: Record<string, number> = {};
    for (const p of state.players) {
      const agency = phaseData.agencies[p.agentId];
      if (!agency) continue;
      standings[p.agentName] = scoreAgency(agency);
    }

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
        agency: phaseData.agencies[playerId] ?? null,
        current_scores: standings,
        human_directive: phaseData.humanDirectives[playerId]?.text,
        timing: {
          phase_timeout_ms: phaseData.phaseTimeoutMs,
          human_input_window_ms: phaseData.humanInputWindowMs,
          human_input_every_n_rounds: phaseData.humanInputEveryNRounds,
        },
        command_help:
          'Operation target: "gather_intel", "research", "counterintel", or rival player name/id for sabotage.',
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

    const phase = state.phase as SpiesPhase;
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

    const phase = state.phase as SpiesPhase;
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
        reason: `${alive[0].agentName} remains the final covert network.`,
        winners: [alive[0].agentId],
      };
    }

    if (alive.length === 0) {
      return {
        team: "draw",
        reason: "All networks were exposed.",
        winners: [],
      };
    }

    if (state.round > phaseData.maxRounds) {
      const ranked = alive
        .map((player) => ({
          player,
          score: scoreAgency(phaseData.agencies[player.agentId]),
        }))
        .sort((a, b) => b.score - a.score);

      if (!ranked[0]) return null;
      return {
        team: ranked[0].player.agentName,
        reason: `${ranked[0].player.agentName} leads covert score after ${phaseData.maxRounds} rounds.`,
        winners: [ranked[0].player.agentId],
      };
    }

    return null;
  },
};

export function canAcceptCouncilHumanInput(state: GameState): boolean {
  return state.gameType === "council-of-spies" && state.phase === "human_briefing";
}

export function applyHumanDirectiveToCouncilMatch(
  state: GameState,
  recipient: string,
  directiveText: string
): GameState {
  if (state.gameType !== "council-of-spies") {
    throw new Error("Human directives are only supported for council-of-spies.");
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

export function advanceCouncilPhaseDeadline(
  state: GameState,
  now = Date.now()
): GameState | null {
  if (state.gameType !== "council-of-spies" || state.status !== "in_progress") {
    return null;
  }

  const phase = state.phase as SpiesPhase;
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
    message = `${player.agentName} sent a covert whisper to ${recipient.agentName}: ${message}`;
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
  const directive = phaseData.humanDirectives[playerId];
  const forcedOrder = directive?.parsedOrder;
  const parsedOrder = forcedOrder ?? parseOrderTarget(state, playerId, action.target);
  if (!parsedOrder) {
    throw new Error(
      'Invalid order target. Use "gather_intel", "research", "counterintel", or a rival player name/id for sabotage.'
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
  const agencies = cloneAgencies(phaseData.agencies);
  const aliveIds = new Set(state.players.filter((p) => p.alive).map((p) => p.agentId));
  const events: GameEvent[] = [...state.events];

  for (const [agentId, order] of Object.entries(phaseData.pendingOrders)) {
    if (!aliveIds.has(agentId)) continue;
    const agency = agencies[agentId];
    if (!agency) continue;

    if (order.type === "gather_intel") {
      agency.intel += 24;
      agency.influence += 10;
      agency.suspicion += 3;
    } else if (order.type === "research") {
      agency.tech += 22;
      agency.intel -= 12;
      agency.influence -= 4;
    } else if (order.type === "counterintel") {
      agency.cover += 18;
      agency.suspicion -= 10;
      agency.influence -= 4;
    }
  }

  for (const [agentId, order] of Object.entries(phaseData.pendingOrders)) {
    if (order.type !== "sabotage" || !order.targetId) continue;
    if (!aliveIds.has(agentId) || !aliveIds.has(order.targetId)) continue;

    const attacker = agencies[agentId];
    const defender = agencies[order.targetId];
    if (!attacker || !defender) continue;

    const attackPower = attacker.intel + Math.floor(attacker.tech * 0.9) + attacker.influence;
    const defensePower = defender.cover + Math.floor(defender.tech * 0.9) + 12;

    const attackerName =
      state.players.find((p) => p.agentId === agentId)?.agentName ?? "Unknown";
    const defenderName =
      state.players.find((p) => p.agentId === order.targetId)?.agentName ?? "Unknown";

    if (attackPower > defensePower) {
      const stolenIntel = Math.min(26, Math.max(8, Math.floor(defender.intel * 0.24)));
      const stolenInfluence = Math.min(
        14,
        Math.max(4, Math.floor(defender.influence * 0.22))
      );

      attacker.intel += stolenIntel;
      attacker.influence += stolenInfluence;
      attacker.suspicion += 5;

      defender.intel -= stolenIntel;
      defender.influence -= stolenInfluence;
      defender.cover -= 12;
      defender.suspicion += 12;

      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "night_result",
        phase: "operations",
        round: state.round,
        actor: agentId,
        target: order.targetId,
        message: `${attackerName} successfully sabotaged ${defenderName} and stole ${stolenIntel} intel + ${stolenInfluence} influence.`,
        visibility: "public",
      });
    } else {
      attacker.cover -= 14;
      attacker.influence -= 7;
      attacker.suspicion += 16;
      defender.suspicion += 4;

      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "night_result",
        phase: "operations",
        round: state.round,
        actor: agentId,
        target: order.targetId,
        message: `${attackerName}'s sabotage against ${defenderName} failed and exposure risk spiked.`,
        visibility: "public",
      });
    }
  }

  const players = state.players.map((p) => ({ ...p, actionsThisPhase: [] }));

  for (const player of players) {
    if (!player.alive) continue;
    const agency = agencies[player.agentId];
    if (!agency) continue;

    agency.intel += Math.floor(agency.cover / 9);
    agency.influence += Math.floor((90 - Math.min(agency.suspicion, 90)) / 18);
    agency.tech += 2;
    agency.suspicion -= 3;

    if (agency.intel < 0) {
      agency.intel = 0;
      agency.suspicion += 5;
    }

    if (agency.influence < 0) {
      agency.influence = 0;
      agency.suspicion += 4;
    }

    if (agency.cover < 20) {
      agency.suspicion += 6;
    }

    agency.intel = Math.max(0, agency.intel);
    agency.influence = Math.max(0, agency.influence);
    agency.tech = Math.max(0, agency.tech);
    agency.cover = Math.max(0, Math.min(100, agency.cover));
    agency.suspicion = Math.max(0, Math.min(100, agency.suspicion));

    if (agency.cover <= 0 || agency.suspicion >= 100) {
      player.alive = false;
      events.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "player_eliminated",
        phase: "operations",
        round: state.round,
        actor: null,
        target: player.agentId,
        message: `${player.agentName}'s network was exposed and collapsed.`,
        visibility: "public",
      });
    }
  }

  const scoreboard = players
    .filter((p) => p.alive)
    .map((p) => `${p.agentName}: ${scoreAgency(agencies[p.agentId])}`)
    .join(" | ");

  events.push({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "vote_result",
    phase: "operations",
    round: state.round,
    actor: null,
    message: `Round ${state.round} covert scores -> ${scoreboard || "No surviving networks"}`,
    visibility: "public",
  });

  let nextState: GameState = {
    ...state,
    players,
    events,
    phaseData: {
      ...state.phaseData,
      agencies,
      pendingOrders: {},
      humanDirectives: {},
    },
    actedThisPhase: new Set<AgentId>(),
    turnStartedAt: Date.now(),
  };

  const win = CouncilOfSpiesGame.checkWinCondition(nextState);
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
      message: `${player.agentName} skipped covert briefing communication.`,
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
    const order = directive?.parsedOrder ?? ({ type: "counterintel" } as SpyOrder);

    pendingOrders[playerId] = {
      ...order,
      orderText: directive?.text ?? "(timed out - default counterintel order)",
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
  phase: SpiesPhase,
  nextRound = state.round
): GameState {
  const phaseData = getPhaseData(state);
  const message =
    phase === "briefing"
      ? `Round ${nextRound} Briefing: negotiate alliances or set covert traps.`
      : phase === "human_briefing"
        ? `Round ${nextRound} Human Briefing: coaching window open for ${Math.floor(
            phaseData.humanInputWindowMs / 1000
          )}s.`
        : `Round ${nextRound} Operations: choose gather_intel, research, counterintel, or sabotage.`;

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
): SpyOrder | null {
  const raw = target?.trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  if (normalized === "gather_intel") return { type: "gather_intel" };
  if (normalized === "research") return { type: "research" };
  if (normalized === "counterintel") return { type: "counterintel" };

  const rival = resolvePlayer(state, raw, playerId);
  if (rival) return { type: "sabotage", targetId: rival.agentId };

  return null;
}

function parseDirectiveAsOrder(
  state: GameState,
  playerId: string,
  text: string
): SpyOrder | null {
  const lower = text.toLowerCase();

  const sabotageIntent =
    lower.includes("sabotage") || lower.includes("attack") || lower.includes("strike");
  if (sabotageIntent) {
    for (const player of state.players) {
      if (player.agentId === playerId || !player.alive) continue;
      if (
        lower.includes(player.agentId.toLowerCase()) ||
        lower.includes(player.agentName.toLowerCase())
      ) {
        return { type: "sabotage", targetId: player.agentId };
      }
    }
  }

  if (
    lower.includes("counter") ||
    lower.includes("defend") ||
    lower.includes("harden") ||
    lower.includes("cover")
  ) {
    return { type: "counterintel" };
  }
  if (lower.includes("research") || lower.includes("tech") || lower.includes("decrypt")) {
    return { type: "research" };
  }
  if (lower.includes("intel") || lower.includes("gather") || lower.includes("network")) {
    return { type: "gather_intel" };
  }

  return null;
}

function formatOrderMessage(state: GameState, playerId: string, order: SpyOrder): string {
  const playerName =
    state.players.find((p) => p.agentId === playerId)?.agentName ?? "Unknown";

  if (order.type === "gather_intel") {
    return `${playerName} expanded field networks to gather intel.`;
  }
  if (order.type === "research") {
    return `${playerName} invested in decryption and espionage tech.`;
  }
  if (order.type === "counterintel") {
    return `${playerName} reinforced counterintelligence protocols.`;
  }

  const targetName = order.targetId
    ? state.players.find((p) => p.agentId === order.targetId)?.agentName ?? "Unknown"
    : "Unknown";
  return `${playerName} launched a sabotage operation against ${targetName}.`;
}

function getPhaseData(state: GameState): SpiesPhaseData {
  return state.phaseData as unknown as SpiesPhaseData;
}

function cloneAgencies(
  agencies: Record<string, SpyAgencyStats>
): Record<string, SpyAgencyStats> {
  const clone: Record<string, SpyAgencyStats> = {};
  for (const [id, stats] of Object.entries(agencies)) {
    clone[id] = { ...stats };
  }
  return clone;
}

function scoreAgency(agency: SpyAgencyStats | undefined): number {
  if (!agency) return 0;
  return (
    agency.influence * 3 +
    agency.intel +
    agency.tech * 2 +
    agency.cover -
    agency.suspicion
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
