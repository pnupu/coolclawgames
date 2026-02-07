import { NextResponse } from "next/server";
import {
  getLobby,
  getLobbyByInviteCode,
  getLobbyFromDb,
  getLobbyFreshFromDb,
  getLobbyByInviteCodeFromDb,
  gameEvents,
  ensureInitialized,
} from "@/lib/store";
import { normalizeInviteCode } from "@/lib/invite-code";
import type { LobbyStatusResponse, ApiError, LobbyInfo } from "@/types/api";

/** How often to check lobby state from DB during long poll (ms) */
const LOBBY_LONG_POLL_CHECK_MS = 3_000;
/** Max time to wait during lobby long poll (ms) — fits within Vercel function timeout */
const LOBBY_LONG_POLL_MAX_MS = 25_000;

/**
 * Resolve a lobby by ID or invite code, checking memory then DB.
 */
async function resolveLobby(
  lookupKey: string
): Promise<{ lobby: LobbyInfo | undefined; foundByInviteCode: boolean }> {
  const lobbyById = getLobby(lookupKey) ?? (await getLobbyFromDb(lookupKey));
  if (lobbyById) return { lobby: lobbyById, foundByInviteCode: false };

  const normalizedPathCode = normalizeInviteCode(lookupKey);
  const lobbyByCode =
    getLobbyByInviteCode(normalizedPathCode) ??
    (await getLobbyByInviteCodeFromDb(normalizedPathCode));
  return { lobby: lobbyByCode, foundByInviteCode: !!lobbyByCode };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await ensureInitialized();

  const { lobby, foundByInviteCode } = await resolveLobby(id);
  if (!lobby) {
    return NextResponse.json(
      { success: false, error: "Lobby not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  if (lobby.is_private) {
    if (!foundByInviteCode) {
      const inviteCode = new URL(request.url).searchParams
        .get("invite_code")
        ?.trim()
        .toUpperCase();
      if (!inviteCode || inviteCode !== lobby.invite_code) {
        return NextResponse.json(
          { success: false, error: "Lobby not found" } satisfies ApiError,
          { status: 404 }
        );
      }
    }
  }

  // ── Long-poll: ?wait=true ────────────────────────────────────
  // Block until the lobby status changes from "waiting" (i.e. match starts).
  // This lets agents make ONE request that covers the entire wait period
  // instead of maintaining a fragile polling loop.
  const url = new URL(request.url);
  const wait = url.searchParams.get("wait") === "true";

  if (wait && lobby.status === "waiting") {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(maxTimeout);
        clearInterval(dbCheckInterval);
        gameEvents.removeListener(`lobby:${lobby.id}`, onLobbyChange);
        resolve();
      };

      // Max wait — fits within Vercel's function timeout
      const maxTimeout = setTimeout(done, LOBBY_LONG_POLL_MAX_MS);

      // In-memory event (works when same instance handles both lobby and poll)
      function onLobbyChange() {
        done();
      }
      gameEvents.once(`lobby:${lobby.id}`, onLobbyChange);

      // Periodic DB check (handles cross-instance case — bypasses memory cache)
      const dbCheckInterval = setInterval(async () => {
        try {
          const fresh = await getLobbyFreshFromDb(lobby.id);
          if (!fresh || fresh.status !== "waiting") {
            done();
          }
        } catch {
          // Ignore errors during periodic check
        }
      }, LOBBY_LONG_POLL_CHECK_MS);
    });
  }

  // ── Return fresh lobby state after potential wait ─────────────
  const fresh = await resolveLobby(id);
  const finalLobby = fresh.lobby ?? lobby;

  // Add watch_url when match has started
  if (finalLobby.match_id) {
    const host = request.headers.get("host") ?? "coolclawgames.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    finalLobby.watch_url = `${protocol}://${host}/matches/${finalLobby.match_id}`;
  }

  const response: LobbyStatusResponse = {
    success: true,
    lobby: finalLobby,
  };

  return NextResponse.json(response);
}
