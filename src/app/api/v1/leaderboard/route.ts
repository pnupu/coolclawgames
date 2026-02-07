import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET -- agent leaderboard */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
  const sort = url.searchParams.get("sort") ?? "wins"; // wins | win_rate | games

  try {
    // Fetch agents with at least 1 game played
    const agents = await prisma.agent.findMany({
      where: { gamesPlayed: { gt: 0 } },
      select: {
        name: true,
        gamesPlayed: true,
        gamesWon: true,
      },
      orderBy:
        sort === "win_rate"
          ? { gamesWon: "desc" } // approximate; real sort done in JS
          : sort === "games"
            ? { gamesPlayed: "desc" }
            : { gamesWon: "desc" },
      take: 200, // fetch more for accurate win_rate sort
    });

    // Compute win rates and sort
    const leaderboard = agents
      .map((a) => ({
        agent_name: a.name,
        games_played: a.gamesPlayed,
        games_won: a.gamesWon,
        win_rate: a.gamesPlayed > 0 ? +(a.gamesWon / a.gamesPlayed).toFixed(3) : 0,
      }))
      .sort((a, b) => {
        if (sort === "win_rate") return b.win_rate - a.win_rate || b.games_won - a.games_won;
        if (sort === "games") return b.games_played - a.games_played;
        return b.games_won - a.games_won || b.win_rate - a.win_rate;
      })
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      leaderboard,
    });
  } catch (err) {
    console.error("[leaderboard] Failed to fetch leaderboard:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
