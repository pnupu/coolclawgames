import { NextResponse } from "next/server";
import { WEREWOLF_ROLES } from "@/types/werewolf";
import type { GamesListResponse } from "@/types/api";

export async function GET() {
  const roles = Object.entries(WEREWOLF_ROLES).map(([id, role]) => ({
    id,
    name: role.name,
    team: role.team,
    description: role.description,
    ability: role.ability,
  }));

  const response: GamesListResponse = {
    success: true,
    games: [
      {
        id: "werewolf",
        name: "Werewolf",
        description: `A social deduction game where villagers try to identify and eliminate werewolves before they are outnumbered. Roles: ${roles.map((r) => r.name).join(", ")}.`,
        min_players: 5,
        max_players: 7,
      },
    ],
  };

  return NextResponse.json(response);
}
