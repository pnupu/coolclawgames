import { NextResponse } from "next/server";
import {
  getLobby,
  getLobbyByInviteCode,
  updateLobby,
  touchLobbyActivity,
  createMatch,
  getAgentByName,
  gameEvents,
} from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { createMatchForGame } from "@/engine/dispatcher";
import { normalizeInviteCode } from "@/lib/invite-code";
import type { JoinLobbyResponse, ApiError } from "@/types/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  const requestText = await request.text();
  let inviteCodeFromBody: string | undefined;
  if (requestText) {
    try {
      const body = JSON.parse(requestText) as { invite_code?: unknown };
      if (typeof body.invite_code === "string" && body.invite_code.trim()) {
        inviteCodeFromBody = normalizeInviteCode(body.invite_code);
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          hint: "Expected JSON with optional invite_code field",
        } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  const lookupKey = id.trim();
  const lobbyById = getLobby(lookupKey);
  const normalizedPathCode = normalizeInviteCode(lookupKey);
  const lobbyByInviteCode = lobbyById ? undefined : getLobbyByInviteCode(normalizedPathCode);
  const lobby = lobbyById ?? lobbyByInviteCode;
  if (!lobby) {
    return NextResponse.json(
      { success: false, error: "Lobby not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  if (lobby.is_private) {
    const providedInviteCode =
      inviteCodeFromBody ??
      (lobbyByInviteCode ? normalizedPathCode : undefined);
    if (!providedInviteCode || providedInviteCode !== lobby.invite_code) {
      return NextResponse.json(
        {
          success: false,
          error: "Invite code required for private lobby",
          hint: "Provide a valid invite_code in body or join with /lobbies/{invite_code}/join",
        } satisfies ApiError,
        { status: 403 }
      );
    }
  }

  if (lobby.status !== "waiting") {
    return NextResponse.json(
      {
        success: false,
        error: "Lobby is not accepting players",
        hint: `Lobby status is '${lobby.status}'`,
      } satisfies ApiError,
      { status: 400 }
    );
  }

  if (lobby.players.length >= lobby.max_players) {
    return NextResponse.json(
      { success: false, error: "Lobby is full" } satisfies ApiError,
      { status: 400 }
    );
  }

  if (lobby.players.includes(agent.name)) {
    touchLobbyActivity(lobby.id);
    return NextResponse.json(
      {
        success: false,
        error: "Already in this lobby",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  // Add player to lobby
  lobby.players.push(agent.name);
  lobby.last_activity_at = Date.now();

  // Auto-start if we have enough players
  if (lobby.players.length >= lobby.min_players) {
    try {
      lobby.status = "started";

      const players = lobby.players.map((name) => {
        const a = getAgentByName(name);
        if (!a) {
          throw new Error(`Agent not found for lobby player: ${name}`);
        }
        return {
          agentId: a.id,
          agentName: name,
        };
      });

      const matchId = crypto.randomUUID();
      const gameState = createMatchForGame(lobby.game_type, matchId, players);
      createMatch(gameState);

      lobby.match_id = matchId;
      lobby.last_activity_at = Date.now();
      updateLobby(lobby.id, lobby);

      gameEvents.emit(`match:${matchId}`, "started");
    } catch (err) {
      console.error("[lobbies/join] Failed to start match:", err);
      lobby.status = "waiting";
      updateLobby(lobby.id, lobby);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to start match for this game type",
        } satisfies ApiError,
        { status: 500 }
      );
    }
  } else {
    updateLobby(lobby.id, lobby);
  }

  const response: JoinLobbyResponse = {
    success: true,
    lobby,
  };

  return NextResponse.json(response);
}
