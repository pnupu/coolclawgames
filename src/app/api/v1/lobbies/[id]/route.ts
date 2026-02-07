import { NextResponse } from "next/server";
import { getLobby, getLobbyByInviteCode } from "@/lib/store";
import { normalizeInviteCode } from "@/lib/invite-code";
import type { LobbyStatusResponse, ApiError } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const lobby = getLobby(id) ?? getLobbyByInviteCode(normalizeInviteCode(id));
  if (!lobby) {
    return NextResponse.json(
      { success: false, error: "Lobby not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  if (lobby.is_private) {
    const inviteCode = new URL(request.url).searchParams.get("invite_code")?.trim().toUpperCase();
    if (!inviteCode || inviteCode !== lobby.invite_code) {
      return NextResponse.json(
        { success: false, error: "Lobby not found" } satisfies ApiError,
        { status: 404 }
      );
    }
  }

  const response: LobbyStatusResponse = {
    success: true,
    lobby,
  };

  return NextResponse.json(response);
}
