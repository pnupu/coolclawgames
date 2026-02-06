// ============================================================
// Werewolf Game Engine -- Pure Game Logic
// ============================================================

import type {
  GameState,
  PlayerView,
  SpectatorView,
  Action,
  GameEvent,
  PlayerState,
  PlayerViewEvent,
  SpectatorEvent,
  SpectatorPlayerInfo,
  WinResult,
  AgentId,
} from "@/types/game";
import type {
  WerewolfPhase,
  WerewolfRole,
  NightActions,
  VoteTally,
} from "@/types/werewolf";
import {
  WEREWOLF_ROLES,
  TURN_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  DISCUSSION_ROUNDS,
} from "@/types/werewolf";

import { assignRoles } from "./werewolf/roles";
import { getNextPhase, getAliveTurnOrder } from "./werewolf/phases";
import {
  validateAction,
  getAvailableActions,
} from "./werewolf/actions";
import { checkWinCondition } from "./werewolf/win-conditions";

// ============================================================
// createWerewolfMatch
// ============================================================

/**
 * Creates a fresh Werewolf match.
 */
export function createWerewolfMatch(
  matchId: string,
  players: { agentId: string; agentName: string }[]
): GameState {
  const assignments = assignRoles(players.map((p) => p.agentId));
  const roleMap = new Map(assignments.map((a) => [a.agentId, a.role]));

  const playerStates: PlayerState[] = players.map((p) => ({
    agentId: p.agentId,
    agentName: p.agentName,
    role: roleMap.get(p.agentId)!,
    alive: true,
    actionsThisPhase: [],
  }));

  // Turn order is the order players were passed in (could shuffle)
  const turnOrder = players.map((p) => p.agentId);

  const now = Date.now();

  const startEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    type: "game_started",
    phase: "day_discussion",
    round: 1,
    actor: null,
    message: "The game has begun! Day 1 discussion starts now.",
    visibility: "public",
  };

  const phaseEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    type: "phase_change",
    phase: "day_discussion",
    round: 1,
    actor: null,
    message:
      "☀️ Day Discussion — Talk among yourselves. Who do you suspect?",
    visibility: "public",
  };

  return {
    matchId,
    gameType: "werewolf",
    status: "in_progress",
    phase: "day_discussion",
    round: 1,
    players: playerStates,
    events: [startEvent, phaseEvent],
    turnOrder,
    currentTurnIndex: 0,
    actedThisPhase: new Set<AgentId>(),
    phaseData: { discussionRound: 1 },
    turnStartedAt: now,
    createdAt: now,
  };
}

// ============================================================
// getPlayerView
// ============================================================

/**
 * Returns a role-filtered view of the game for one player.
 */
export function getPlayerView(
  state: GameState,
  playerId: string
): PlayerView {
  const player = state.players.find((p) => p.agentId === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found in match ${state.matchId}`);
  }

  const alivePlayers = state.players
    .filter((p) => p.alive)
    .map((p) => p.agentName);

  const available = getAvailableActions(state, playerId);

  // Determine if it's this player's turn
  const yourTurn = isPlayersTurn(state, playerId);

  // Build private info based on role
  const privateInfo: Record<string, unknown> = {};
  const role = player.role as WerewolfRole;

  if (role === "werewolf") {
    const fellowWolves = state.players
      .filter(
        (p) => p.role === "werewolf" && p.agentId !== playerId
      )
      .map((p) => p.agentName);
    privateInfo.fellow_wolves = fellowWolves;
  }

  if (role === "seer") {
    // Collect all investigation results from events
    const investigations = state.events
      .filter(
        (e) =>
          e.type === "player_ability" &&
          e.actor === playerId &&
          e.visibility === "role_specific"
      )
      .map((e) => ({
        target: e.target,
        message: e.message,
      }));
    if (investigations.length > 0) {
      privateInfo.investigation_results = investigations;
    }
  }

  // Build public events for the player
  const messages: PlayerViewEvent[] = state.events
    .filter((e) => {
      if (e.visibility === "public") return true;
      if (
        e.visibility === "role_specific" &&
        e.visibleToRoles?.includes(player.role)
      ) {
        return true;
      }
      // Seer sees their own investigation results
      if (e.actor === playerId && e.visibility === "role_specific") {
        return true;
      }
      return false;
    })
    .map((e) => {
      const actorPlayer = e.actor
        ? state.players.find((p) => p.agentId === e.actor)
        : null;
      return {
        from: actorPlayer?.agentName ?? "System",
        action: e.type,
        message: e.message,
        target: e.target
          ? state.players.find((p) => p.agentId === e.target)?.agentName
          : undefined,
      };
    });

  return {
    match_id: state.matchId,
    status: state.status,
    phase: state.phase,
    round: state.round,
    your_turn: yourTurn,
    your_role: player.role,
    alive_players: alivePlayers,
    available_actions: yourTurn ? available : [],
    private_info: privateInfo,
    messages_since_last_poll: messages,
    poll_after_ms: yourTurn ? 0 : POLL_INTERVAL_MS,
    turn_timeout_ms: TURN_TIMEOUT_MS,
    winner: state.winner
      ? { team: state.winner.team, reason: state.winner.reason }
      : undefined,
  };
}

// ============================================================
// getSpectatorView
// ============================================================

/**
 * Returns the full spectator view with all info visible.
 */
export function getSpectatorView(state: GameState): SpectatorView {
  const specPlayers: SpectatorPlayerInfo[] = state.players.map((p) => ({
    agent_id: p.agentId,
    agent_name: p.agentName,
    role: p.role,
    alive: p.alive,
  }));

  const specEvents: SpectatorEvent[] = state.events.map((e) => {
    const actorPlayer = e.actor
      ? state.players.find((p) => p.agentId === e.actor)
      : null;
    const targetPlayer = e.target
      ? state.players.find((p) => p.agentId === e.target)
      : null;
    return {
      id: e.id,
      timestamp: e.timestamp,
      type: e.type,
      phase: e.phase,
      round: e.round,
      actor: e.actor,
      actor_name: actorPlayer?.agentName ?? null,
      actor_role: actorPlayer?.role ?? null,
      message: e.message,
      target: e.target ?? null,
      target_name: targetPlayer?.agentName ?? null,
      thinking: e.thinking,
    };
  });

  const aliveTurn = getAliveTurnOrder(state);
  const currentTurn =
    state.status === "in_progress" && aliveTurn.length > 0
      ? aliveTurn[state.currentTurnIndex % aliveTurn.length] ?? null
      : null;

  return {
    match_id: state.matchId,
    game_type: state.gameType,
    status: state.status,
    phase: state.phase,
    round: state.round,
    players: specPlayers,
    events: specEvents,
    current_turn: currentTurn,
    winner: state.winner
      ? { team: state.winner.team, reason: state.winner.reason }
      : undefined,
    created_at: state.createdAt,
  };
}

// ============================================================
// processAction
// ============================================================

/**
 * Processes a player action and returns the new game state (immutable).
 *
 * @throws if validation fails.
 */
export function processAction(
  state: GameState,
  playerId: string,
  action: Action
): GameState {
  const error = validateAction(state, playerId, action);
  if (error) {
    throw new Error(error);
  }

  switch (action.action) {
    case "speak":
      return handleSpeak(state, playerId, action);
    case "vote":
      return handleVote(state, playerId, action);
    case "use_ability":
      return handleAbility(state, playerId, action);
    default:
      throw new Error(`Unknown action: ${(action as Action).action}`);
  }
}

// ============================================================
// handleTimeout
// ============================================================

/**
 * Called when a player fails to act within the time limit.
 * Applies a sensible default (silence / abstain / random target).
 */
export function handleTimeout(
  state: GameState,
  playerId: string
): GameState {
  const player = state.players.find((p) => p.agentId === playerId);
  if (!player || !player.alive) return state;

  const phase = state.phase as WerewolfPhase;

  switch (phase) {
    case "day_discussion": {
      // Player stays silent
      const silentEvent: GameEvent = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "player_silent",
        phase: state.phase,
        round: state.round,
        actor: playerId,
        message: `${player.agentName} remained silent.`,
        visibility: "public",
      };

      const newState = {
        ...state,
        events: [...state.events, silentEvent],
        actedThisPhase: new Set(state.actedThisPhase),
      };
      return advanceDiscussionTurn(newState, playerId);
    }

    case "day_vote": {
      // Abstain
      const abstainAction: Action = {
        action: "vote",
        thinking: "(timed out -- auto-abstain)",
      };
      return handleVote(state, playerId, abstainAction);
    }

    case "night_action": {
      const role = player.role as WerewolfRole;
      if (role === "villager") return state; // no action needed

      // Pick a random valid target
      const validTargets = state.players.filter((p) => {
        if (!p.alive) return false;
        if (role === "werewolf" && p.role === "werewolf") return false;
        if (role === "seer" && p.agentId === playerId) return false;
        return true;
      });

      if (validTargets.length === 0) return state;

      const randomTarget =
        validTargets[Math.floor(Math.random() * validTargets.length)];

      return handleAbility(state, playerId, {
        action: "use_ability",
        target: randomTarget.agentId,
        thinking: "(timed out -- random target)",
      });
    }

    default:
      return state;
  }
}

// ============================================================
// Internal Action Handlers
// ============================================================

function handleSpeak(
  state: GameState,
  playerId: string,
  action: Action
): GameState {
  const player = state.players.find((p) => p.agentId === playerId)!;

  const speakEvent: GameEvent = {
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

  const newState: GameState = {
    ...state,
    events: [...state.events, speakEvent],
    players: state.players.map((p) =>
      p.agentId === playerId
        ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "speak"] }
        : p
    ),
    actedThisPhase: new Set(state.actedThisPhase),
  };

  return advanceDiscussionTurn(newState, playerId);
}

function advanceDiscussionTurn(
  state: GameState,
  playerId: string
): GameState {
  const aliveTurn = getAliveTurnOrder(state);
  const nextIndex = state.currentTurnIndex + 1;

  // If we haven't gone through all alive players yet, advance turn
  if (nextIndex < aliveTurn.length) {
    return {
      ...state,
      currentTurnIndex: nextIndex,
      turnStartedAt: Date.now(),
    };
  }

  // All players have spoken this discussion round
  const currentDiscussionRound =
    (state.phaseData.discussionRound as number) ?? 1;

  if (currentDiscussionRound < DISCUSSION_ROUNDS) {
    // Start next discussion round
    const roundEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "phase_change",
      phase: "day_discussion",
      round: state.round,
      actor: null,
      message: `Discussion round ${currentDiscussionRound + 1} of ${DISCUSSION_ROUNDS}. Continue the debate!`,
      visibility: "public",
    };

    return {
      ...state,
      events: [...state.events, roundEvent],
      currentTurnIndex: 0,
      actedThisPhase: new Set<AgentId>(),
      phaseData: {
        ...state.phaseData,
        discussionRound: currentDiscussionRound + 1,
      },
      players: state.players.map((p) => ({
        ...p,
        actionsThisPhase: [],
      })),
      turnStartedAt: Date.now(),
    };
  }

  // All discussion rounds complete -> transition to day_vote
  return transitionToPhase(state, "day_vote");
}

function handleVote(
  state: GameState,
  playerId: string,
  action: Action
): GameState {
  const player = state.players.find((p) => p.agentId === playerId)!;
  const tally = (state.phaseData.voteTally as VoteTally) ?? {
    votes: {},
    abstained: [],
  };

  const newTally: VoteTally = { ...tally, votes: { ...tally.votes }, abstained: [...tally.abstained] };

  if (action.target) {
    newTally.votes[playerId] = action.target;
  } else {
    newTally.abstained.push(playerId);
  }

  const targetPlayer = action.target
    ? state.players.find((p) => p.agentId === action.target)
    : null;
  const voteMessage = action.target
    ? `${player.agentName} voted to eliminate ${targetPlayer?.agentName ?? "unknown"}.`
    : `${player.agentName} abstained from voting.`;

  const voteEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "player_vote",
    phase: state.phase,
    round: state.round,
    actor: playerId,
    message: voteMessage,
    target: action.target ?? null,
    thinking: action.thinking,
    visibility: "public",
  };

  const newActed = new Set(state.actedThisPhase);
  newActed.add(playerId);

  let newState: GameState = {
    ...state,
    events: [...state.events, voteEvent],
    players: state.players.map((p) =>
      p.agentId === playerId
        ? { ...p, actionsThisPhase: [...p.actionsThisPhase, "vote"] }
        : p
    ),
    actedThisPhase: newActed,
    phaseData: { ...state.phaseData, voteTally: newTally },
    turnStartedAt: Date.now(),
  };

  // Check if all alive players have voted
  const alivePlayerIds = state.players
    .filter((p) => p.alive)
    .map((p) => p.agentId);
  const allVoted = alivePlayerIds.every((id) => newActed.has(id));

  if (allVoted) {
    newState = resolveVotes(newState, newTally);
  }

  return newState;
}

function resolveVotes(state: GameState, tally: VoteTally): GameState {
  // Count votes
  const voteCounts: Record<string, number> = {};
  for (const target of Object.values(tally.votes)) {
    voteCounts[target] = (voteCounts[target] ?? 0) + 1;
  }

  // Find the player with most votes
  let maxVotes = 0;
  let eliminated: string | null = null;
  let isTie = false;

  for (const [target, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      eliminated = target;
      isTie = false;
    } else if (count === maxVotes) {
      isTie = true;
    }
  }

  // On tie or no votes, no one is eliminated
  if (isTie || maxVotes === 0) {
    eliminated = null;
  }

  const now = Date.now();
  const resultEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    type: "vote_result",
    phase: state.phase,
    round: state.round,
    actor: null,
    message: eliminated
      ? `The village has spoken! ${
          state.players.find((p) => p.agentId === eliminated)?.agentName
        } has been eliminated.`
      : "The vote was tied. No one is eliminated today.",
    target: eliminated,
    visibility: "public",
  };

  let newPlayers = state.players;
  const newEvents = [...state.events, resultEvent];

  if (eliminated) {
    const eliminatedPlayer = state.players.find(
      (p) => p.agentId === eliminated
    )!;
    newPlayers = state.players.map((p) =>
      p.agentId === eliminated ? { ...p, alive: false } : p
    );

    const eliminatedEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "player_eliminated",
      phase: state.phase,
      round: state.round,
      actor: null,
      message: `${eliminatedPlayer.agentName} was a ${WEREWOLF_ROLES[eliminatedPlayer.role as WerewolfRole]?.name ?? eliminatedPlayer.role}.`,
      target: eliminated,
      visibility: "public",
    };
    newEvents.push(eliminatedEvent);
  }

  let newState: GameState = {
    ...state,
    players: newPlayers,
    events: newEvents,
  };

  // Check win condition after elimination
  const winResult = checkWinCondition(newState);
  if (winResult) {
    return endGame(newState, winResult);
  }

  // Transition to night
  return transitionToPhase(newState, "night_action");
}

function handleAbility(
  state: GameState,
  playerId: string,
  action: Action
): GameState {
  const player = state.players.find((p) => p.agentId === playerId)!;
  const role = player.role as WerewolfRole;
  const nightActions = (state.phaseData.nightActions as NightActions) ?? {};
  const newNightActions: NightActions = { ...nightActions };
  const targetPlayer = state.players.find(
    (p) => p.agentId === action.target
  )!;

  // Store the action
  switch (role) {
    case "werewolf":
      newNightActions.werewolf_target = action.target;
      break;
    case "seer":
      newNightActions.seer_target = action.target;
      newNightActions.seer_result = {
        target: action.target!,
        is_werewolf: targetPlayer.role === "werewolf",
      };
      break;
    case "doctor":
      newNightActions.doctor_target = action.target;
      break;
  }

  // Create ability event (role-specific visibility)
  const abilityEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "player_ability",
    phase: state.phase,
    round: state.round,
    actor: playerId,
    message: getAbilityMessage(role, player.agentName, targetPlayer.agentName),
    target: action.target ?? null,
    thinking: action.thinking,
    visibility: "role_specific",
    visibleToRoles: role === "werewolf" ? ["werewolf"] : [role],
  };

  // For seer, also add an investigation result event
  const extraEvents: GameEvent[] = [];
  if (role === "seer" && newNightActions.seer_result) {
    const isWolf = newNightActions.seer_result.is_werewolf;
    const investigationEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "player_ability",
      phase: state.phase,
      round: state.round,
      actor: playerId,
      message: `Your investigation reveals: ${targetPlayer.agentName} is ${isWolf ? "a Werewolf! 🐺" : "NOT a Werewolf. ✓"}`,
      target: action.target ?? null,
      visibility: "role_specific",
      visibleToRoles: ["seer"],
    };
    extraEvents.push(investigationEvent);
  }

  const newActed = new Set(state.actedThisPhase);
  newActed.add(playerId);

  let newState: GameState = {
    ...state,
    events: [...state.events, abilityEvent, ...extraEvents],
    players: state.players.map((p) =>
      p.agentId === playerId
        ? {
            ...p,
            actionsThisPhase: [...p.actionsThisPhase, "use_ability"],
          }
        : p
    ),
    actedThisPhase: newActed,
    phaseData: { ...state.phaseData, nightActions: newNightActions },
    turnStartedAt: Date.now(),
  };

  // Check if all night-role players have acted
  if (allNightActionsComplete(newState)) {
    newState = resolveNight(newState, newNightActions);
  }

  return newState;
}

function allNightActionsComplete(state: GameState): boolean {
  const nightRolePlayers = state.players.filter(
    (p) =>
      p.alive &&
      (p.role === "werewolf" || p.role === "seer" || p.role === "doctor")
  );
  return nightRolePlayers.every((p) => state.actedThisPhase.has(p.agentId));
}

function resolveNight(
  state: GameState,
  nightActions: NightActions
): GameState {
  const now = Date.now();
  const newEvents: GameEvent[] = [...state.events];
  let newPlayers = [...state.players];

  const killTarget = nightActions.werewolf_target;
  const protectTarget = nightActions.doctor_target;

  let wasKilled = false;
  let killedPlayer: PlayerState | undefined;

  if (killTarget) {
    if (killTarget === protectTarget) {
      // Doctor saved the target
      const savedPlayer = state.players.find(
        (p) => p.agentId === killTarget
      )!;
      const savedEvent: GameEvent = {
        id: crypto.randomUUID(),
        timestamp: now,
        type: "player_saved",
        phase: state.phase,
        round: state.round,
        actor: null,
        message: `The doctor's protection saved a life! No one was killed tonight.`,
        visibility: "public",
      };
      newEvents.push(savedEvent);
    } else {
      // Target is killed
      killedPlayer = state.players.find((p) => p.agentId === killTarget);
      if (killedPlayer) {
        wasKilled = true;
        newPlayers = newPlayers.map((p) =>
          p.agentId === killTarget ? { ...p, alive: false } : p
        );
      }
    }
  }

  const nightResultEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    type: "night_result",
    phase: state.phase,
    round: state.round,
    actor: null,
    message: wasKilled
      ? `Dawn breaks... ${killedPlayer!.agentName} was found dead. They were a ${WEREWOLF_ROLES[killedPlayer!.role as WerewolfRole]?.name ?? killedPlayer!.role}.`
      : "Dawn breaks... Everyone survived the night!",
    target: wasKilled ? killTarget : null,
    visibility: "public",
  };
  newEvents.push(nightResultEvent);

  if (wasKilled) {
    const eliminatedEvent: GameEvent = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "player_eliminated",
      phase: state.phase,
      round: state.round,
      actor: null,
      message: `${killedPlayer!.agentName} has been eliminated by the werewolves.`,
      target: killTarget!,
      visibility: "public",
    };
    newEvents.push(eliminatedEvent);
  }

  let newState: GameState = {
    ...state,
    players: newPlayers,
    events: newEvents,
  };

  // Check win condition
  const winResult = checkWinCondition(newState);
  if (winResult) {
    return endGame(newState, winResult);
  }

  // Transition through dawn_reveal then to day_discussion
  return transitionToPhase(
    transitionToPhase(newState, "dawn_reveal"),
    "day_discussion"
  );
}

// ============================================================
// Phase Transition Helpers
// ============================================================

function transitionToPhase(
  state: GameState,
  nextPhase: WerewolfPhase
): GameState {
  const now = Date.now();
  const newRound =
    nextPhase === "day_discussion" &&
    (state.phase as WerewolfPhase) !== "day_discussion"
      ? state.round + 1
      : state.round;

  const phaseMessage = getPhaseMessage(nextPhase, newRound);

  const phaseEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    type: "phase_change",
    phase: nextPhase,
    round: newRound,
    actor: null,
    message: phaseMessage,
    visibility: "public",
  };

  // Build fresh phaseData for the new phase
  const phaseData: Record<string, unknown> = {};
  if (nextPhase === "day_discussion") {
    phaseData.discussionRound = 1;
  }
  if (nextPhase === "day_vote") {
    phaseData.voteTally = { votes: {}, abstained: [] };
  }
  if (nextPhase === "night_action") {
    phaseData.nightActions = {};
  }

  return {
    ...state,
    phase: nextPhase,
    round: newRound,
    events: [...state.events, phaseEvent],
    currentTurnIndex: 0,
    actedThisPhase: new Set<AgentId>(),
    phaseData,
    players: state.players.map((p) => ({
      ...p,
      actionsThisPhase: [],
    })),
    turnStartedAt: now,
  };
}

function endGame(state: GameState, winResult: WinResult): GameState {
  const now = Date.now();

  const gameOverEvent: GameEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    type: "game_over",
    phase: state.phase,
    round: state.round,
    actor: null,
    message: `Game Over! ${winResult.team === "village" ? "🏘️ Village" : "🐺 Werewolves"} win! ${winResult.reason}`,
    visibility: "public",
  };

  return {
    ...state,
    status: "finished",
    events: [...state.events, gameOverEvent],
    winner: winResult,
  };
}

// ============================================================
// Utility Helpers
// ============================================================

function isPlayersTurn(state: GameState, playerId: string): boolean {
  if (state.status !== "in_progress") return false;
  const phase = state.phase as WerewolfPhase;

  const player = state.players.find((p) => p.agentId === playerId);
  if (!player || !player.alive) return false;

  switch (phase) {
    case "day_discussion": {
      const aliveTurn = getAliveTurnOrder(state);
      return aliveTurn[state.currentTurnIndex] === playerId;
    }
    case "day_vote":
      return !state.actedThisPhase.has(playerId);
    case "night_action": {
      const role = player.role as WerewolfRole;
      if (role === "villager") return false; // no night action
      return !state.actedThisPhase.has(playerId);
    }
    case "dawn_reveal":
      return false;
    default:
      return false;
  }
}

function getAbilityMessage(
  role: WerewolfRole,
  actorName: string,
  targetName: string
): string {
  switch (role) {
    case "werewolf":
      return `${actorName} targets ${targetName} for elimination.`;
    case "seer":
      return `${actorName} investigates ${targetName}.`;
    case "doctor":
      return `${actorName} protects ${targetName} tonight.`;
    default:
      return `${actorName} uses ability on ${targetName}.`;
  }
}

function getPhaseMessage(phase: WerewolfPhase, round: number): string {
  switch (phase) {
    case "day_discussion":
      return `☀️ Day ${round} Discussion — Debate who among you is a werewolf.`;
    case "day_vote":
      return `🗳️ Day ${round} Vote — Cast your vote to eliminate a suspect.`;
    case "night_action":
      return `🌙 Night ${round} — The village sleeps. Creatures of darkness act in secret.`;
    case "dawn_reveal":
      return `🌅 Dawn ${round} — The night is over. What happened while you slept?`;
    default:
      return `Phase: ${phase}`;
  }
}
