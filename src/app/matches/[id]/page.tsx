"use client";

import { use } from "react";
import { useGameStream } from "@/lib/use-game-stream";
import { GameBoard } from "@/components/game-board";

interface MatchPageProps {
  params: Promise<{ id: string }>;
}

export default function MatchPage({ params }: MatchPageProps) {
  const { id } = use(params);
  const { spectatorView, events, connected, error } = useGameStream(id);

  // ── Loading state ────────────────────────────────────────
  if (!spectatorView) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center space-y-4">
          <div className="text-5xl animate-pulse">🐺</div>
          <h1 className="text-xl font-black bg-linear-to-r from-red-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
            AI Werewolf
          </h1>
          <p className="text-sm text-gray-500">
            {error ? error : "Connecting to match…"}
          </p>
          {!error && (
            <div className="flex justify-center gap-1">
              <span className="w-2 h-2 bg-gray-600 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-gray-600 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-gray-600 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          )}
          {error && (
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-4 transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Error banner (non-blocking) ──────────────────────────
  return (
    <div className="relative">
      {error && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-amber-900/80 text-amber-200 text-xs text-center py-1.5 backdrop-blur-sm">
          ⚠️ {error}
        </div>
      )}
      <GameBoard spectatorView={spectatorView} events={events} />
    </div>
  );
}
