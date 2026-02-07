import { gameEvents } from "@/lib/store";

/** Allowed emoji reactions */
const ALLOWED_EMOJIS = new Set(["fire", "laugh", "skull", "100", "eyes", "clap"]);

/** Rate limit: max reactions per minute per IP */
const MAX_PER_MIN = 60;
const rateLimits = new Map<string, number[]>();

function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * POST -- broadcast a floating emoji to all spectators (ephemeral, no DB write).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;
  const ip = getIp(request);

  // Rate limit
  const now = Date.now();
  const ts = rateLimits.get(ip)?.filter((t) => now - t < 60_000) ?? [];
  if (ts.length >= MAX_PER_MIN) {
    return new Response(JSON.stringify({ success: false, error: "Rate limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  ts.push(now);
  rateLimits.set(ip, ts);

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const emoji = body.emoji?.trim().toLowerCase();
  if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
    return new Response(JSON.stringify({ success: false, error: "Invalid emoji" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Broadcast to all spectators
  gameEvents.emit(`match:${matchId}:reaction`, emoji);

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * SSE endpoint for real-time emoji reaction broadcasting.
 * Spectators subscribe to this stream and see floating emojis from other viewers.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let cleaned = false;
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        gameEvents.removeListener(`match:${matchId}:reaction`, onReaction);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }

      function send(eventType: string, data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      }

      function onReaction(emoji: string) {
        send("reaction", { emoji });
      }

      gameEvents.on(`match:${matchId}:reaction`, onReaction);

      // Heartbeat every 30s
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 30_000);

      // Handle client disconnect
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
