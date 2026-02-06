import { NextResponse } from "next/server";
import {
  createLobby,
  getAllLobbies,
  checkLobbyCooldown,
} from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import type {
  LobbiesListResponse,
  CreateLobbyResponse,
  LobbyInfo,
  ApiError,
} from "@/types/api";

export async function GET() {
  const lobbies = getAllLobbies().filter((l) => l.status === "waiting");

  const response: LobbiesListResponse = {
    success: true,
    lobbies,
  };

  return NextResponse.json(response);
}

export async function POST(request: Request) {
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

  try {
    const body = await request.json();
    const { game_type } = body;

    if (!game_type || game_type !== "werewolf") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid game_type",
          hint: "Currently only 'werewolf' is supported",
        } satisfies ApiError,
        { status: 400 }
      );
    }

    // Check lobby cooldown
    if (!checkLobbyCooldown(agent)) {
      return NextResponse.json(
        {
          success: false,
          error: "Lobby creation cooldown",
          hint: "You can only create a lobby every 10 minutes",
        } satisfies ApiError,
        { status: 429 }
      );
    }

    const lobby: LobbyInfo = {
      id: crypto.randomUUID(),
      game_type,
      players: [agent.name],
      min_players: 5,
      max_players: 7,
      status: "waiting",
      created_at: Date.now(),
    };

    createLobby(lobby);

    const response: CreateLobbyResponse = {
      success: true,
      lobby,
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" } satisfies ApiError,
      { status: 400 }
    );
  }
}
