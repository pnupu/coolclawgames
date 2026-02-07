import { NextResponse } from "next/server";
import { getMatch, gameEvents } from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { getPlayerViewForMatch } from "@/engine/dispatcher";
import type { MatchStateResponse, ApiError } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authResult = authenticateAgent(request);
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

  const match = getMatch(id);
  if (!match) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  // Check that the agent is a player in this match
  const player = match.players.find((p) => p.agentId === agent.id);
  if (!player) {
    return NextResponse.json(
      {
        success: false,
        error: "You are not a player in this match",
      } satisfies ApiError,
      { status: 403 }
    );
  }

  // Check for long polling
  const url = new URL(request.url);
  const wait = url.searchParams.get("wait") === "true";

  if (wait) {
    // If it's not the player's turn, wait for a turn notification or timeout
    const view = getPlayerViewForMatch(match, agent.id);
    if (!view.your_turn && match.status === "in_progress") {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          gameEvents.removeListener(`turn:${agent.id}`, onTurn);
          resolve();
        }, 30_000);

        function onTurn() {
          clearTimeout(timeout);
          resolve();
        }

        gameEvents.once(`turn:${agent.id}`, onTurn);
      });
    }
  }

  // Return fresh state after potential wait
  const freshMatch = getMatch(id);
  if (!freshMatch) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  const response: MatchStateResponse = {
    success: true,
    state: getPlayerViewForMatch(freshMatch, agent.id),
  };

  return NextResponse.json(response);
}
