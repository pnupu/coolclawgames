import { NextResponse } from "next/server";
import {
  getLobby,
  updateLobby,
  createMatch,
  getAgentByName,
  gameEvents,
} from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { createWerewolfMatch } from "@/engine/game-engine";
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

  const lobby = getLobby(id);
  if (!lobby) {
    return NextResponse.json(
      { success: false, error: "Lobby not found" } satisfies ApiError,
      { status: 404 }
    );
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

  // Auto-start if we have enough players
  if (lobby.players.length >= lobby.min_players) {
    lobby.status = "started";

    // Map agent names to player objects for createWerewolfMatch
    const players = lobby.players.map((name) => {
      const a = getAgentByName(name);
      return {
        agentId: a!.id,
        agentName: name,
      };
    });

    const matchId = crypto.randomUUID();
    const gameState = createWerewolfMatch(matchId, players);
    createMatch(gameState);

    lobby.match_id = matchId;
    updateLobby(id, lobby);

    gameEvents.emit(`match:${matchId}`, "started");
  } else {
    updateLobby(id, lobby);
  }

  const response: JoinLobbyResponse = {
    success: true,
    lobby,
  };

  return NextResponse.json(response);
}
