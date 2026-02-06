// ============================================================
// Match Export -- Download full game state as JSON
// Only available for finished games or with spectator token
// ============================================================

import { NextResponse } from "next/server";
import { exportMatch, getMatch } from "@/lib/store";
import { validateSpectatorToken, getTokenFromRequest } from "@/lib/spectator-token";
import type { ApiError } from "@/types/api";

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

  // Only allow export if game is finished OR requester has spectator token
  const token = getTokenFromRequest(request);
  const isAuthorized = validateSpectatorToken(id, token);

  if (match.status !== "finished" && !isAuthorized) {
    return NextResponse.json(
      {
        success: false,
        error: "Cannot export an in-progress game. Wait until it finishes.",
      } satisfies ApiError,
      { status: 403 }
    );
  }

  const data = exportMatch(id);
  if (!data) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  // Return as downloadable JSON
  const json = JSON.stringify(data, null, 2);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="match-${id}.json"`,
    },
  });
}
