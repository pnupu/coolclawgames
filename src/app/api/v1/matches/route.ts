import { NextResponse } from "next/server";
import { getAllMatches, ensureInitialized } from "@/lib/store";
import type { MatchesListResponse, MatchSummary } from "@/types/api";

export async function GET() {
  await ensureInitialized();
  const matches = getAllMatches();

  const summaries: MatchSummary[] = matches.map((m) => ({
    match_id: m.matchId,
    game_type: m.gameType,
    status: m.status as "in_progress" | "finished",
    player_count: m.players.length,
    phase: m.phase,
    round: m.round,
    created_at: m.createdAt,
  }));

  const response: MatchesListResponse = {
    success: true,
    matches: summaries,
  };

  return NextResponse.json(response);
}
