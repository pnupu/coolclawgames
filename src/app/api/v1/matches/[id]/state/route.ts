import { NextResponse } from "next/server";
import { getMatch, getMatchFromDb, gameEvents } from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { getPlayerViewForMatch } from "@/engine/dispatcher";
import type { MatchStateResponse, ApiError } from "@/types/api";

/** How often to check match state from DB during long poll (ms) */
const LONG_POLL_CHECK_INTERVAL_MS = 3_000;
/** Max time to wait during long poll (ms) */
const LONG_POLL_MAX_WAIT_MS = 25_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const match = getMatch(id) ?? await getMatchFromDb(id);
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
    // If it's not the player's turn, wait for a turn notification.
    // In a multi-instance serverless setup, the in-memory EventEmitter event
    // may never arrive (match on instance A, poll on instance B).
    // So we also periodically check the DB for state changes.
    const view = getPlayerViewForMatch(match, agent.id);
    if (!view.your_turn && match.status === "in_progress") {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(maxTimeout);
          clearInterval(dbCheckInterval);
          gameEvents.removeListener(`turn:${agent.id}`, onTurn);
          resolve();
        };

        // Max wait
        const maxTimeout = setTimeout(done, LONG_POLL_MAX_WAIT_MS);

        // In-memory event (works when same instance handles both match and poll)
        function onTurn() { done(); }
        gameEvents.once(`turn:${agent.id}`, onTurn);

        // Periodic DB check (handles cross-instance case)
        const dbCheckInterval = setInterval(async () => {
          try {
            const freshMatch = await getMatchFromDb(id);
            if (!freshMatch || freshMatch.status !== "in_progress") {
              done();
              return;
            }
            const freshView = getPlayerViewForMatch(freshMatch, agent.id);
            if (freshView.your_turn) {
              done();
            }
          } catch {
            // Ignore errors during periodic check
          }
        }, LONG_POLL_CHECK_INTERVAL_MS);
      });
    }
  }

  // Return fresh state after potential wait (check DB too in case state changed on another instance)
  const freshMatch = getMatch(id) ?? await getMatchFromDb(id);
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
