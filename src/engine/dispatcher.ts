import type { Action, GameState, PlayerView, SpectatorView } from "@/types/game";
import { getGame } from "./registry";
import {
  advanceKingdomPhaseDeadline,
  applyHumanDirectiveToMatch as applyKingdomDirective,
  canAcceptHumanInput as canAcceptKingdomHumanInput,
} from "./kingdom-operator";
import {
  advanceFrontierPhaseDeadline,
  applyHumanDirectiveToFrontierMatch,
  canAcceptFrontierHumanInput,
} from "./frontier-convoy";
import {
  advanceCouncilPhaseDeadline,
  applyHumanDirectiveToCouncilMatch,
  canAcceptCouncilHumanInput,
} from "./council-of-spies";
import {
  createWerewolfMatch,
  getAuthenticatedSpectatorView,
  getCensoredSpectatorView,
  getPlayerView as getWerewolfPlayerView,
  handleTimeout as handleWerewolfTimeout,
  processAction as processWerewolfAction,
} from "./game-engine";

function getImplementationForState(state: GameState) {
  return getGame(state.gameType);
}

export function createMatchForGame(
  gameType: string,
  matchId: string,
  players: { agentId: string; agentName: string }[]
): GameState {
  if (gameType === "werewolf") {
    return createWerewolfMatch(matchId, players);
  }

  const impl = getGame(gameType);
  if (!impl) throw new Error(`Unsupported game type: ${gameType}`);
  return impl.createMatch(matchId, players);
}

export function getPlayerViewForMatch(
  state: GameState,
  playerId: string
): PlayerView {
  if (state.gameType === "werewolf") {
    return getWerewolfPlayerView(state, playerId);
  }

  const impl = getImplementationForState(state);
  if (!impl) throw new Error(`No implementation for game type: ${state.gameType}`);
  return impl.getPlayerView(state, playerId);
}

export function processActionForMatch(
  state: GameState,
  playerId: string,
  action: Action
): GameState {
  if (state.gameType === "werewolf") {
    return processWerewolfAction(state, playerId, action);
  }

  const impl = getImplementationForState(state);
  if (!impl) throw new Error(`No implementation for game type: ${state.gameType}`);
  return impl.processAction(state, playerId, action);
}

export function handleTimeoutForMatch(
  state: GameState,
  playerId: string
): GameState {
  if (state.gameType === "werewolf") {
    return handleWerewolfTimeout(state, playerId);
  }

  const impl = getImplementationForState(state);
  if (!impl) throw new Error(`No implementation for game type: ${state.gameType}`);
  return impl.handleTimeout(state, playerId);
}

export function getSpectatorViewForMatch(
  state: GameState,
  isAuthorized: boolean
): SpectatorView {
  if (state.gameType === "werewolf") {
    return isAuthorized
      ? getAuthenticatedSpectatorView(state)
      : getCensoredSpectatorView(state);
  }

  const impl = getImplementationForState(state);
  if (!impl) throw new Error(`No implementation for game type: ${state.gameType}`);
  // No hidden-role mode for non-werewolf games yet.
  return impl.getSpectatorView(state);
}

export function handlePhaseDeadlineForMatch(
  state: GameState,
  now = Date.now()
): GameState | null {
  if (state.gameType === "kingdom-operator") {
    return advanceKingdomPhaseDeadline(state, now);
  }
  if (state.gameType === "frontier-convoy") {
    return advanceFrontierPhaseDeadline(state, now);
  }
  if (state.gameType === "council-of-spies") {
    return advanceCouncilPhaseDeadline(state, now);
  }
  return null;
}

export function canAcceptHumanInputForMatch(state: GameState): boolean {
  if (state.gameType === "kingdom-operator") {
    return canAcceptKingdomHumanInput(state);
  }
  if (state.gameType === "frontier-convoy") {
    return canAcceptFrontierHumanInput(state);
  }
  if (state.gameType === "council-of-spies") {
    return canAcceptCouncilHumanInput(state);
  }
  return false;
}

export function applyHumanDirectiveForMatch(
  state: GameState,
  recipient: string,
  directive: string
): GameState {
  if (state.gameType === "kingdom-operator") {
    return applyKingdomDirective(state, recipient, directive);
  }
  if (state.gameType === "frontier-convoy") {
    return applyHumanDirectiveToFrontierMatch(state, recipient, directive);
  }
  if (state.gameType === "council-of-spies") {
    return applyHumanDirectiveToCouncilMatch(state, recipient, directive);
  }
  throw new Error(`Human directives are not supported for game type: ${state.gameType}`);
}

export function isPhaseDeadlineManagedGame(state: GameState): boolean {
  return (
    state.gameType === "kingdom-operator" ||
    state.gameType === "frontier-convoy" ||
    state.gameType === "council-of-spies"
  );
}
