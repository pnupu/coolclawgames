import { NextResponse } from "next/server";
import { getMatch, updateMatch, gameEvents } from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { processActionForMatch, getPlayerViewForMatch } from "@/engine/dispatcher";
import { validateMessage, validateThinking } from "@/lib/validation";
import type { ActionResponse, ApiError } from "@/types/api";
import type { Action } from "@/types/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  const authResult = await authenticateAgent(request);
  if (isAuthError(authResult)) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error,
        hint: authResult.hint,
      } satisfies ApiError,
      { status: authResult.status }
    );
  }

  const { agent } = authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" } satisfies ApiError,
      { status: 400 }
    );
  }

  const { action, message, target, thinking } = body;

  // Validate fields
  const messageError = validateMessage(message);
  if (messageError) {
    return NextResponse.json(
      { success: false, error: messageError } satisfies ApiError,
      { status: 400 }
    );
  }

  const thinkingError = validateThinking(thinking);
  if (thinkingError) {
    return NextResponse.json(
      { success: false, error: thinkingError } satisfies ApiError,
      { status: 400 }
    );
  }

  const match = getMatch(matchId);
  if (!match) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  // Check agent is a player
  const player = match.players.find((p) => p.agentId === agent.id);
  if (!player) {
    return NextResponse.json(
      { success: false, error: "You are not a player in this match" } satisfies ApiError,
      { status: 403 }
    );
  }

  // Check it's their turn
  const view = getPlayerViewForMatch(match, agent.id);
  if (!view.your_turn) {
    return NextResponse.json(
      {
        success: false,
        error: "It is not your turn",
        hint: `Current phase: ${view.phase}. Poll again after ${view.poll_after_ms}ms.`,
      } satisfies ApiError,
      { status: 400 }
    );
  }

  // Resolve target names to agent IDs only for Werewolf.
  // Other games may use non-player target strings (e.g., "B2", "rock").
  let resolvedTarget = target as string | undefined;
  if (match.gameType === "werewolf" && resolvedTarget) {
    // First check if it's already a valid agent ID
    const byId = match.players.find((p) => p.agentId === resolvedTarget);
    if (!byId) {
      // Try resolving by name (case-insensitive)
      const byName = match.players.find(
        (p) => p.agentName.toLowerCase() === resolvedTarget!.toLowerCase()
      );
      if (byName) {
        resolvedTarget = byName.agentId;
      }
      // If neither matches, let the engine's validation return the proper error
    }
  }

  // Build Action
  const gameAction: Action = {
    action: action as Action["action"],
    message: message as string | undefined,
    target: resolvedTarget,
    thinking: thinking as string | undefined,
  };

  // Process the action through the game engine
  let newState;
  try {
    newState = processActionForMatch(match, agent.id, gameAction);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json(
      { success: false, error: errorMessage } satisfies ApiError,
      { status: 400 }
    );
  }

  // Update match in store
  updateMatch(matchId, newState);

  // Emit ALL new events for spectator SSE (not just the last one)
  const oldEventCount = match.events.length;
  const newEvents = newState.events.slice(oldEventCount);
  for (const event of newEvents) {
    gameEvents.emit(`match:${matchId}:event`, event);
  }

  // Notify the next player whose turn it is
  // Check all alive players and emit turn event for whoever's turn it is now
  for (const p of newState.players) {
    if (p.alive) {
      const pView = getPlayerViewForMatch(newState, p.agentId);
      if (pView.your_turn) {
        gameEvents.emit(`turn:${p.agentId}`);
      }
    }
  }

  const response: ActionResponse = {
    success: true,
    message: "Action processed",
    poll_after_ms: getPlayerViewForMatch(newState, agent.id).poll_after_ms,
  };

  return NextResponse.json(response);
}
