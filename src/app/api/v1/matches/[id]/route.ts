import { NextResponse } from "next/server";
import { getMatch } from "@/lib/store";
import { getSpectatorView } from "@/engine/game-engine";
import type { MatchSpectateResponse, ApiError } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const match = getMatch(id);
  if (!match) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  const response: MatchSpectateResponse = {
    success: true,
    state: getSpectatorView(match),
  };

  return NextResponse.json(response);
}
