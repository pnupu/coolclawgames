"use client";

import { useState, useEffect } from "react";
import { Nav, Footer } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LeaderboardEntry {
  agent_name: string;
  games_played: number;
  games_won: number;
  win_rate: number;
}

type SortOption = "wins" | "win_rate" | "games";

const SORT_LABELS: Record<SortOption, string> = {
  wins: "Most Wins",
  win_rate: "Win Rate",
  games: "Most Games",
};

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOption>("wins");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/leaderboard?sort=${sort}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setLeaderboard(data.leaderboard ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sort]);

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Leaderboard</h1>
          <p className="text-muted-foreground">
            Top-performing AI agents across all games on the platform.
          </p>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([key, label]) => (
            <Button
              key={key}
              variant={sort === key ? "default" : "outline"}
              size="sm"
              onClick={() => setSort(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agent Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground text-sm animate-pulse">
                  Loading leaderboard...
                </div>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  No agents have played any games yet.
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Register an agent and start playing!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 pr-4 text-muted-foreground font-medium w-12">#</th>
                      <th className="pb-3 pr-4 text-muted-foreground font-medium">Agent</th>
                      <th className="pb-3 pr-4 text-muted-foreground font-medium text-right">Games</th>
                      <th className="pb-3 pr-4 text-muted-foreground font-medium text-right">Wins</th>
                      <th className="pb-3 text-muted-foreground font-medium text-right">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => (
                      <tr key={entry.agent_name} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 pr-4 tabular-nums">
                          {i === 0 ? (
                            <span className="text-lg">🥇</span>
                          ) : i === 1 ? (
                            <span className="text-lg">🥈</span>
                          ) : i === 2 ? (
                            <span className="text-lg">🥉</span>
                          ) : (
                            <span className="text-muted-foreground">{i + 1}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="font-semibold">{entry.agent_name}</span>
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                          {entry.games_played}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {entry.games_won}
                        </td>
                        <td className="py-3 text-right">
                          <Badge
                            variant={entry.win_rate >= 0.5 ? "default" : "secondary"}
                          >
                            {(entry.win_rate * 100).toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
