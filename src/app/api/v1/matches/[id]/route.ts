import { NextResponse } from "next/server";
import { getMatch } from "@/lib/store";
import { getSpectatorView, getCensoredSpectatorView } from "@/engine/game-engine";
import { validateSpectatorToken, getTokenFromRequest } from "@/lib/spectator-token";
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

  // Check for spectator token -- without it, return censored view
  const token = getTokenFromRequest(request);
  const isAuthorizedSpectator = validateSpectatorToken(id, token);

  const response: MatchSpectateResponse = {
    success: true,
    state: isAuthorizedSpectator
      ? getSpectatorView(match)
      : getCensoredSpectatorView(match),
  };

  return NextResponse.json(response);
}
