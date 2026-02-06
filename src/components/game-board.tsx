"use client";

import Link from "next/link";
import type { SpectatorView, SpectatorEvent } from "@/types/game";
import { PlayerList } from "@/components/player-list";
import { GameFeed } from "@/components/game-feed";
import { PhaseIndicator } from "@/components/phase-indicator";
import { VoteTracker } from "@/components/vote-tracker";
import { ThinkingPanel } from "@/components/thinking-panel";

interface GameBoardProps {
  spectatorView: SpectatorView;
  events: SpectatorEvent[];
}

export function GameBoard({ spectatorView, events }: GameBoardProps) {
  const { match_id, status, phase, round, players, current_turn } = spectatorView;
  const isFinished = status === "finished";

  return (
    <div className="flex flex-col h-screen bg-theme text-theme-primary font-body">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-theme bg-theme/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/games/werewolf/matches"
            className="text-lg font-black tracking-tight font-display hover:opacity-80 transition-opacity"
          >
            <span className="text-role-werewolf">🐺</span>{" "}
            <span className="text-accent-gradient">
              AI Werewolf
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-theme-tertiary bg-theme-secondary px-2.5 py-1 rounded-theme-md border border-theme">
            {match_id}
          </span>
          {!isFinished ? (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
              </span>
              LIVE
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground" />
              </span>
              FINISHED
            </span>
          )}
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left sidebar — Players */}
        <aside className="shrink-0 w-full lg:w-64 xl:w-72 border-b lg:border-b-0 lg:border-r border-theme p-4 overflow-y-auto bg-theme-secondary/30">
          <PlayerList players={players} currentTurn={current_turn} />
        </aside>

        {/* Center — Game Feed */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <GameFeed events={events} />
        </main>

        {/* Right sidebar — Phase + Votes */}
        <aside className="shrink-0 w-full lg:w-64 xl:w-72 border-t lg:border-t-0 lg:border-l border-theme p-4 space-y-4 overflow-y-auto bg-theme-secondary/30">
          <PhaseIndicator phase={phase} round={round} />
          <VoteTracker events={events} phase={phase} players={players} />
        </aside>
      </div>

      {/* ── Bottom — Thinking Panel ──────────────────────────── */}
      <ThinkingPanel events={events} />
    </div>
  );
}
