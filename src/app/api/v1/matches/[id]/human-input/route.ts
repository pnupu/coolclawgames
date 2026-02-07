import { NextResponse } from "next/server";
import { getMatch, getMatchFromDb, updateMatch, gameEvents } from "@/lib/store";
import { getTokenFromRequest, validateSpectatorToken } from "@/lib/spectator-token";
import {
  applyHumanDirectiveForMatch,
  canAcceptHumanInputForMatch,
} from "@/engine/dispatcher";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import type { ApiError } from "@/types/api";

interface HumanInputResponse {
  success: true;
  message: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = checkRequestRateLimit(request, "human-input", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many human input requests",
        hint: `Try again in ${Math.ceil(limit.retryAfterMs / 1000)}s`,
      } satisfies ApiError,
      { status: 429 }
    );
  }

  const { id: matchId } = await params;
  const match = getMatch(matchId) ?? await getMatchFromDb(matchId);
  if (!match) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  const token = getTokenFromRequest(request);
  if (!validateSpectatorToken(matchId, token)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized human input",
        hint: "Open the match spectator page to get a valid spectator token",
      } satisfies ApiError,
      { status: 403 }
    );
  }

  if (!canAcceptHumanInputForMatch(match)) {
    return NextResponse.json(
      {
        success: false,
        error: "Human input is not currently open",
        hint: "Human input is available only during supported game coaching windows",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" } satisfies ApiError,
      { status: 400 }
    );
  }

  const recipient = body.player;
  const directive = body.directive;
  if (typeof recipient !== "string" || recipient.trim().length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing 'player' field",
        hint: "Set 'player' to a player name or agent id",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  if (typeof directive !== "string" || directive.trim().length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing 'directive' field",
        hint: "Set 'directive' to the human instruction text",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  if (directive.length > 800) {
    return NextResponse.json(
      {
        success: false,
        error: "Directive too long",
        hint: "Directive must be at most 800 characters",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  let updatedState;
  try {
    updatedState = applyHumanDirectiveForMatch(match, recipient, directive);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to apply directive",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  updateMatch(matchId, updatedState);

  const newEvents = updatedState.events.slice(match.events.length);
  for (const event of newEvents) {
    gameEvents.emit(`match:${matchId}:event`, event);
  }

  const response: HumanInputResponse = {
    success: true,
    message: "Human directive submitted",
  };

  return NextResponse.json(response);
}
