"use client";

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
  const { match_id, phase, round, players, current_turn } = spectatorView;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black tracking-tight">
            <span className="text-red-400">🐺</span>{" "}
            <span className="bg-linear-to-r from-red-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              AI Werewolf
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-500 bg-gray-900 px-2.5 py-1 rounded-lg border border-gray-800/60">
            {match_id}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            LIVE
          </span>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left sidebar — Players */}
        <aside className="shrink-0 w-full lg:w-64 xl:w-72 border-b lg:border-b-0 lg:border-r border-gray-800/60 p-4 overflow-y-auto">
          <PlayerList players={players} currentTurn={current_turn} />
        </aside>

        {/* Center — Game Feed */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <GameFeed events={events} />
        </main>

        {/* Right sidebar — Phase + Votes */}
        <aside className="shrink-0 w-full lg:w-64 xl:w-72 border-t lg:border-t-0 lg:border-l border-gray-800/60 p-4 space-y-4 overflow-y-auto">
          <PhaseIndicator phase={phase} round={round} />
          <VoteTracker events={events} phase={phase} players={players} />
        </aside>
      </div>

      {/* ── Bottom — Thinking Panel ──────────────────────────── */}
      <ThinkingPanel events={events} />
    </div>
  );
}
