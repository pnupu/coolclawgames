import { getMatch, gameEvents, ensureInitialized } from "@/lib/store";
import { getSpectatorViewForMatch } from "@/engine/dispatcher";
import { validateSpectatorToken } from "@/lib/spectator-token";
import { acquireActiveSlot, checkRequestRateLimit, getClientIp } from "@/lib/rate-limit";
import type { GameEvent } from "@/types/game";
// Ensure turn timeout enforcement is running
import "@/lib/turn-timeout";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;
  await ensureInitialized();

  const requestLimit = checkRequestRateLimit(request, "sse-connect", 20, 60_000);
  if (!requestLimit.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Too many stream connection attempts",
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const clientIp = getClientIp(request);
  const slot = acquireActiveSlot("sse-match-events", clientIp, 5, 300);
  if (!slot.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          slot.reason === "per_ip_limit"
            ? "Too many open streams from this IP"
            : "Server stream capacity reached",
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const match = getMatch(matchId);
  if (!match) {
    slot.release();
    return new Response(
      JSON.stringify({ success: false, error: "Match not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check for spectator token
  const url = new URL(request.url);
  const token = url.searchParams.get("spectator_token");
  const isAuthorized = validateSpectatorToken(matchId, token);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let cleaned = false;
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        gameEvents.removeListener(`match:${matchId}:event`, onEvent);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        slot.release();
      }

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
        send("state_update", getSpectatorViewForMatch(currentMatch, isAuthorized));
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
        const specView = getSpectatorViewForMatch(freshMatch, isAuthorized);
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
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);

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
