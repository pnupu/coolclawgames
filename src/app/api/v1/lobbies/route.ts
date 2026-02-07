import { NextResponse } from "next/server";
import {
  createLobby,
  getAllLobbies,
  checkLobbyCooldown,
  getLobbyByInviteCode,
} from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { hasGameType, getGameTypeDefinition } from "@/engine/registry";
import { generateInviteCode } from "@/lib/invite-code";
import type {
  LobbiesListResponse,
  CreateLobbyResponse,
  LobbyInfo,
  ApiError,
} from "@/types/api";
// Import to start the auto-fill loop and turn timeout enforcement
import "@/lib/lobby-autofill";
import "@/lib/turn-timeout";
import "@/lib/private-lobby-cleanup";

export async function GET() {
  const lobbies = getAllLobbies().filter(
    (l) => l.status === "waiting" && !l.is_private
  );

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
    const { game_type, is_private, settings } = body;

    if (typeof game_type !== "string" || !hasGameType(game_type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid game_type",
          hint: "Use GET /api/v1/games to see supported game types",
        } satisfies ApiError,
        { status: 400 }
      );
    }
    const definition = getGameTypeDefinition(game_type)!;
    if (is_private !== undefined && typeof is_private !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid is_private value",
          hint: "is_private must be a boolean when provided",
        } satisfies ApiError,
        { status: 400 }
      );
    }
    // Validate settings if provided
    if (settings !== undefined && (typeof settings !== "object" || settings === null || Array.isArray(settings))) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid settings value",
          hint: "settings must be a plain object when provided, e.g. { best_of: 3 }",
        } satisfies ApiError,
        { status: 400 }
      );
    }

    const isPrivateLobby = is_private === true;
    const inviteCode = isPrivateLobby
      ? generateInviteCode((code) => !!getLobbyByInviteCode(code))
      : undefined;

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
      min_players: definition.min_players,
      max_players: definition.max_players,
      status: "waiting",
      created_at: Date.now(),
      last_activity_at: Date.now(),
      is_private: isPrivateLobby,
      invite_code: inviteCode,
      settings: settings ?? undefined,
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
