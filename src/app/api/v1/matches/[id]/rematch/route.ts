import { NextResponse } from "next/server";
import { getMatch, createMatch, gameEvents } from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { createMatchForGame } from "@/engine/dispatcher";
import type { ApiError } from "@/types/api";

/** Cooldown between rematch requests per agent (ms) */
const REMATCH_COOLDOWN_MS = 30_000;
const recentRematches = new Map<string, number>();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authResult = await authenticateAgent(request);
  if (isAuthError(authResult)) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error,
        hint: authResult.hint,
      } satisfies ApiError,
      { status: authResult.status }
    );
  }

  const { agent } = authResult;

  const match = getMatch(id);
  if (!match) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  if (match.status !== "finished") {
    return NextResponse.json(
      {
        success: false,
        error: "Match is still in progress",
        hint: "You can only request a rematch after the match has finished.",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  // Verify the requesting agent is a player in the match
  const isPlayer = match.players.some((p) => p.agentId === agent.id);
  if (!isPlayer) {
    return NextResponse.json(
      {
        success: false,
        error: "You are not a player in this match",
        hint: "Only players in the finished match can request a rematch.",
      } satisfies ApiError,
      { status: 403 }
    );
  }

  // Cooldown check
  const lastRematch = recentRematches.get(agent.id);
  if (lastRematch && Date.now() - lastRematch < REMATCH_COOLDOWN_MS) {
    const retryAfter = Math.ceil((REMATCH_COOLDOWN_MS - (Date.now() - lastRematch)) / 1000);
    return NextResponse.json(
      {
        success: false,
        error: "Rematch cooldown",
        hint: `Wait ${retryAfter}s before requesting another rematch.`,
      } satisfies ApiError,
      { status: 429 }
    );
  }

  try {
    // Reconstruct players from the finished match
    const players = match.players.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
    }));

    // Extract settings from the original match's phaseData
    const settings: Record<string, unknown> = {};
    if (match.gameType === "tic-tac-toe" && match.phaseData.bestOf) {
      settings.best_of = match.phaseData.bestOf;
    }

    const newMatchId = crypto.randomUUID();
    const newState = createMatchForGame(
      match.gameType,
      newMatchId,
      players,
      Object.keys(settings).length > 0 ? settings : undefined
    );
    createMatch(newState);

    recentRematches.set(agent.id, Date.now());
    gameEvents.emit(`match:${newMatchId}`, "started");

    return NextResponse.json({
      success: true,
      match_id: newMatchId,
      game_type: match.gameType,
      message: "Rematch created! Same players, new match.",
    });
  } catch (err) {
    console.error("[rematch] Failed to create rematch:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create rematch",
      } satisfies ApiError,
      { status: 500 }
    );
  }
}
