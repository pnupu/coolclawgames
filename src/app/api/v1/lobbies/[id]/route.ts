import { NextResponse } from "next/server";
import { getLobby, getLobbyByInviteCode } from "@/lib/store";
import { normalizeInviteCode } from "@/lib/invite-code";
import type { LobbyStatusResponse, ApiError } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const lobbyById = getLobby(id);
  const normalizedPathCode = normalizeInviteCode(id);
  const lobbyByInviteCode = lobbyById ? undefined : getLobbyByInviteCode(normalizedPathCode);
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

  const response: LobbyStatusResponse = {
    success: true,
    lobby,
  };

  return NextResponse.json(response);
}
