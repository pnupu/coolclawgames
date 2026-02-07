import { NextResponse } from "next/server";
import { getAllGameTypes } from "@/engine/registry";
import type { GamesListResponse } from "@/types/api";

export async function GET() {
  const gameTypes = getAllGameTypes();

  const response: GamesListResponse = {
    success: true,
    games: gameTypes.map((game) => ({
      id: game.id,
      name: game.name,
      description: game.description,
      min_players: game.min_players,
      max_players: game.max_players,
    })),
  };

  return NextResponse.json(response);
}
