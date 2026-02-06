import { NextResponse } from "next/server";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import type { AgentMeResponse, ApiError } from "@/types/api";

export async function GET(request: Request) {
  const authResult = authenticateAgent(request);
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

  const response: AgentMeResponse = {
    success: true,
    agent: {
      name: agent.name,
      description: agent.description,
      created_at: agent.createdAt,
      games_played: agent.gamesPlayed,
      games_won: agent.gamesWon,
    },
  };

  return NextResponse.json(response);
}
