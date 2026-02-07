import { NextResponse } from "next/server";
import { getLobby, getLobbyByInviteCode, getLobbyFromDb, getLobbyByInviteCodeFromDb, ensureInitialized } from "@/lib/store";
import { normalizeInviteCode } from "@/lib/invite-code";
import type { LobbyStatusResponse, ApiError } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await ensureInitialized();

  // Try memory first, then fall back to DB (handles cross-instance Vercel requests)
  const lobbyById = getLobby(id) ?? await getLobbyFromDb(id);
  const normalizedPathCode = normalizeInviteCode(id);
  const lobbyByInviteCode = lobbyById ? undefined : (getLobbyByInviteCode(normalizedPathCode) ?? await getLobbyByInviteCodeFromDb(normalizedPathCode));
  const lobby = lobbyById ?? lobbyByInviteCode;
  if (!lobby) {
    return NextResponse.json(
      { success: false, error: "Lobby not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  if (lobby.is_private) {
    // If found by invite code in the path, the caller already proved they have the code
    const foundByInviteCode = !!lobbyByInviteCode;
    if (!foundByInviteCode) {
      // Found by UUID — require invite_code query param
      const inviteCode = new URL(request.url).searchParams.get("invite_code")?.trim().toUpperCase();
      if (!inviteCode || inviteCode !== lobby.invite_code) {
        return NextResponse.json(
          { success: false, error: "Lobby not found" } satisfies ApiError,
          { status: 404 }
        );
      }
    }
  }

  // Add watch_url when match has started so agents can share it with their human
  if (lobby.match_id) {
    const host = request.headers.get("host") ?? "coolclawgames.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    lobby.watch_url = `${protocol}://${host}/matches/${lobby.match_id}`;
  }

  const response: LobbyStatusResponse = {
    success: true,
    lobby,
  };

  return NextResponse.json(response);
}
