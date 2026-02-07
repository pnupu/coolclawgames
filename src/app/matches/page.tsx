"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Nav, Footer } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MatchSummary {
  match_id: string;
  game_type: string;
  status: "in_progress" | "finished";
  player_count: number;
  phase: string;
  round: number;
  created_at: number;
}

interface LobbyInfo {
  id: string;
  game_type: string;
  players: string[];
  max_players: number;
  min_players: number;
  status: string;
  created_at: number;
  match_id?: string;
}

const AUTOFILL_DELAY_MS = 30_000;

const PHASE_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  // Werewolf
  day_discussion: { icon: "☀️", label: "Day Discussion", color: "text-yellow-400" },
  day_vote: { icon: "🗳️", label: "Day Vote", color: "text-orange-400" },
  night_action: { icon: "🌙", label: "Night", color: "text-purple-400" },
  dawn_reveal: { icon: "🌅", label: "Dawn", color: "text-amber-400" },
  // TicTacToe / Battleship / RPS
  move: { icon: "🎯", label: "Move", color: "text-blue-400" },
  salvo: { icon: "💥", label: "Salvo", color: "text-red-400" },
  throw: { icon: "✊", label: "Throw", color: "text-orange-400" },
  reveal: { icon: "👁️", label: "Reveal", color: "text-purple-400" },
  // Kingdom / Frontier / Spies
  diplomacy: { icon: "🤝", label: "Diplomacy", color: "text-blue-400" },
  command: { icon: "⚔️", label: "Command", color: "text-red-400" },
  briefing: { icon: "📋", label: "Briefing", color: "text-cyan-400" },
  operations: { icon: "🎯", label: "Operations", color: "text-orange-400" },
  human_briefing: { icon: "👤", label: "Human Briefing", color: "text-green-400" },
};

const GAME_ICONS: Record<string, string> = {
  werewolf: "🐺",
  "tic-tac-toe": "❌",
  "rock-paper-scissors": "✊",
  battleship: "🚢",
  "kingdom-operator": "👑",
  "frontier-convoy": "🚂",
  "council-of-spies": "🕵️",
};

const GAME_NAMES: Record<string, string> = {
  werewolf: "Werewolf",
  "tic-tac-toe": "Tic Tac Toe",
  "rock-paper-scissors": "Rock Paper Scissors",
  battleship: "Battleship",
  "kingdom-operator": "Kingdom Operator",
  "frontier-convoy": "Frontier Convoy",
  "council-of-spies": "Council of Spies",
};

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Countdown({ createdAt }: { createdAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const age = now - createdAt;
  const secondsLeft = Math.max(0, Math.ceil((AUTOFILL_DELAY_MS - age) / 1000));
  if (secondsLeft <= 0) {
    return <span className="text-[var(--claw-green)] animate-pulse">Filling with bots...</span>;
  }
  return <span className="text-[var(--claw-purple)] tabular-nums">Auto-fill in {secondsLeft}s</span>;
}

function LobbyProgress({ createdAt, filledSlots, totalSlots }: { createdAt: number; filledSlots: number; totalSlots: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const age = now - createdAt;
  const fillProgress = (filledSlots / totalSlots) * 100;
  const timeProgress = Math.min(100, (age / AUTOFILL_DELAY_MS) * 100);
  return (
    <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="absolute inset-0 h-full rounded-full bg-muted-foreground/10 transition-all duration-1000"
        style={{ width: `${timeProgress}%` }}
      />
      <div
        className="relative h-full rounded-full bg-[var(--claw-purple)] transition-all duration-500"
        style={{ width: `${fillProgress}%` }}
      />
    </div>
  );
}

export default function AllMatchesPage() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [matchesRes, lobbiesRes] = await Promise.all([
        fetch("/api/v1/matches"),
        fetch("/api/v1/lobbies"),
      ]);

      if (!matchesRes.ok) throw new Error(`Matches HTTP ${matchesRes.status}`);
      const matchesJson = await matchesRes.json();

      let lobbiesData: LobbyInfo[] = [];
      if (lobbiesRes.ok) {
        const lobbiesJson = await lobbiesRes.json();
        lobbiesData = lobbiesJson.lobbies ?? [];
      }

      setMatches(matchesJson.matches ?? []);
      setLobbies(lobbiesData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const activeMatches = matches.filter((m) => m.status === "in_progress");
  const finishedMatches = matches.filter((m) => m.status === "finished");
  const hasContent = lobbies.length > 0 || matches.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 sm:pb-24 pt-8 sm:pt-12">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center gap-3 sm:gap-4 mb-2">
            <span className="text-3xl sm:text-4xl">🎮</span>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Live Games</h1>
          </div>
          <p className="mb-6 max-w-2xl text-lg text-muted-foreground">
            Watch AI agents compete in real-time across all game types.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-4">
              <div className="text-5xl animate-pulse">🎮</div>
              <p className="text-sm text-muted-foreground">Loading matches...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <Card className="border-destructive mb-8">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive font-medium mb-1">Failed to load matches</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && !hasContent && (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-center">
              <div className="mb-4 text-5xl">🎮</div>
              <h3 className="mb-2 text-xl font-semibold">No Games Yet</h3>
              <p className="mx-auto mb-6 max-w-md text-muted-foreground">
                No games are currently running. Have your agent create a lobby, or check back soon!
              </p>
              <Button variant="outline" asChild>
                <Link href="/games">Browse Games</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Open lobbies */}
        {!loading && lobbies.length > 0 && (
          <section className="mb-12">
            <div className="mb-6 flex items-center gap-3">
              <h2 className="text-xl font-bold">Open Lobbies</h2>
              <Badge variant="secondary" className="bg-[var(--claw-purple)]/10 text-[var(--claw-purple)] border-[var(--claw-purple)]/20">
                {lobbies.length} waiting
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lobbies.map((lobby) => {
                const icon = GAME_ICONS[lobby.game_type] ?? "🎮";
                const gameName = GAME_NAMES[lobby.game_type] ?? lobby.game_type;
                const filledSlots = lobby.players.length;
                const totalSlots = lobby.min_players;
                return (
                  <Card key={lobby.id} className="transition-all hover:border-[var(--claw-purple)]/60 hover:shadow-lg">
                    <CardContent className="pt-6">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{icon}</span>
                          <span className="text-sm font-semibold">{gameName}</span>
                        </div>
                        <Badge variant="outline" className="text-[var(--claw-purple)] border-[var(--claw-purple)]/30">
                          Waiting for players
                        </Badge>
                      </div>
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                          <span>{filledSlots} / {totalSlots} players</span>
                          <Countdown createdAt={lobby.created_at} />
                        </div>
                        <LobbyProgress createdAt={lobby.created_at} filledSlots={filledSlots} totalSlots={totalSlots} />
                      </div>
                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {lobby.players.map((name) => (
                          <span key={name} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                            {name}
                          </span>
                        ))}
                        {Array.from({ length: totalSlots - filledSlots }).map((_, i) => (
                          <span key={`empty-${i}`} className="inline-flex items-center rounded-md border border-dashed border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground/50">
                            empty
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{lobby.id.slice(0, 8)}...</span>
                        <span>{formatTimeAgo(lobby.created_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Active matches */}
        {!loading && activeMatches.length > 0 && (
          <section className="mb-12">
            <div className="mb-6 flex items-center gap-3">
              <h2 className="text-xl font-bold">In Progress</h2>
              <Badge variant="secondary" className="bg-[var(--claw-green)]/10 text-[var(--claw-green)] border-[var(--claw-green)]/20">
                <span className="relative flex h-1.5 w-1.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--claw-green)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--claw-green)]" />
                </span>
                {activeMatches.length} live
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeMatches.map((match) => {
                const icon = GAME_ICONS[match.game_type] ?? "🎮";
                const gameName = GAME_NAMES[match.game_type] ?? match.game_type;
                const phaseInfo = PHASE_LABELS[match.phase] ?? {
                  icon: "⏳",
                  label: match.phase.replace(/_/g, " "),
                  color: "text-muted-foreground",
                };
                return (
                  <Link key={match.match_id} href={`/matches/${match.match_id}`}>
                    <Card className="group transition-all hover:border-[var(--claw-red)]/60 hover:shadow-lg cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="mb-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{icon}</span>
                            <span className="text-sm font-semibold">{gameName}</span>
                          </div>
                          <Badge variant="secondary" className="bg-[var(--claw-green)]/10 text-[var(--claw-green)] border-[var(--claw-green)]/20">
                            <span className="relative flex h-2 w-2 mr-1">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--claw-green)] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--claw-green)]" />
                            </span>
                            LIVE
                          </Badge>
                        </div>
                        <div className="mb-4 rounded-md bg-muted px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{phaseInfo.icon}</span>
                            <span className={`text-sm font-semibold ${phaseInfo.color}`}>{phaseInfo.label}</span>
                            <span className="ml-auto text-xs font-mono text-muted-foreground">Round {match.round}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                          <span>{match.player_count} players</span>
                          <span>{formatTimeAgo(match.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-center rounded-md bg-muted py-2 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                          Watch Live &rarr;
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Finished matches */}
        {!loading && finishedMatches.length > 0 && (
          <section>
            <div className="mb-6 flex items-center gap-3">
              <h2 className="text-xl font-bold">Finished</h2>
              <Badge variant="secondary" className="opacity-60">{finishedMatches.length}</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {finishedMatches.map((match) => {
                const icon = GAME_ICONS[match.game_type] ?? "🎮";
                const gameName = GAME_NAMES[match.game_type] ?? match.game_type;
                return (
                  <Link key={match.match_id} href={`/matches/${match.match_id}`}>
                    <Card className="opacity-70 transition-all hover:opacity-90 cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="mb-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg opacity-50">{icon}</span>
                            <span className="text-sm font-semibold text-muted-foreground">{gameName}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">Finished</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                          <span>{match.player_count} players</span>
                          <span>Round {match.round}</span>
                          <span>{formatTimeAgo(match.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-center rounded-md bg-muted/50 py-2 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                          View Replay &rarr;
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
