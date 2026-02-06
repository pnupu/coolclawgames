import { NextResponse } from "next/server";
import { getLobby } from "@/lib/store";
import type { LobbyStatusResponse, ApiError } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const lobby = getLobby(id);
  if (!lobby) {
    return NextResponse.json(
      { success: false, error: "Lobby not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  const response: LobbyStatusResponse = {
    success: true,
    lobby,
  };

  return NextResponse.json(response);
}
