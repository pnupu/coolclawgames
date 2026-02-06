import { getMatch, gameEvents } from "@/lib/store";
import { getAuthenticatedSpectatorView, getCensoredSpectatorView } from "@/engine/game-engine";
import { validateSpectatorToken } from "@/lib/spectator-token";
import type { GameEvent } from "@/types/game";
// Ensure turn timeout enforcement is running
import "@/lib/turn-timeout";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  const match = getMatch(matchId);
  if (!match) {
    return new Response(
      JSON.stringify({ success: false, error: "Match not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check for spectator token
  const url = new URL(request.url);
  const token = url.searchParams.get("spectator_token");
  const isAuthorized = validateSpectatorToken(matchId, token);

  // Choose the view function based on authorization
  const getView = isAuthorized ? getAuthenticatedSpectatorView : getCensoredSpectatorView;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(eventType: string, data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed, ignore
        }
      }

      // Send initial state
      const currentMatch = getMatch(matchId);
      if (currentMatch) {
        send("state_update", getView(currentMatch));
      }

      // Events that change player status or game phase -- need full state refresh
      const STATE_CHANGING_EVENTS = new Set([
        "player_eliminated",
        "player_saved",
        "phase_change",
        "vote_result",
        "night_result",
        "game_over",
      ]);

      // Listen for new game events
      function onEvent(event: GameEvent) {
        // Get fresh state for spectator event conversion
        const freshMatch = getMatch(matchId);
        if (!freshMatch) return;
        const specView = getView(freshMatch);
        const specEvent = specView.events.find((e) => e.id === event.id);
        if (specEvent) {
          send("event", specEvent);
        }

        // Send full state update for events that change player list / game status
        if (STATE_CHANGING_EVENTS.has(event.type)) {
          send("state_update", specView);
        }

        // If game is over, also close the stream
        if (event.type === "game_over") {
          send("game_over", specView);
          cleanup();
          controller.close();
        }
      }

      gameEvents.on(`match:${matchId}:event`, onEvent);

      // Heartbeat every 15s
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);

      function cleanup() {
        gameEvents.removeListener(`match:${matchId}:event`, onEvent);
        clearInterval(heartbeatInterval);
      }

      // Handle client disconnect via abort signal
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
