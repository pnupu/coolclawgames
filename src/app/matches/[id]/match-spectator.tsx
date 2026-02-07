"use client";

import { useGameStream } from "@/lib/use-game-stream";
import { GameBoard } from "@/components/game-board";

interface MatchSpectatorProps {
  matchId: string;
  spectatorToken: string;
}

export function MatchSpectator({ matchId, spectatorToken }: MatchSpectatorProps) {
  const { spectatorView, events, connected, error, isFinished } = useGameStream(
    matchId,
    spectatorToken
  );

  // Loading state
  if (!spectatorView) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="text-5xl animate-pulse">🐺</div>
          <h1 className="text-xl font-bold">AI Match</h1>
          <p className="text-sm text-muted-foreground">
            {error ? error : "Connecting to match..."}
          </p>
          {!error && (
            <div className="flex justify-center gap-1">
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          )}
          {error && (
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Don't show the error banner when the game has just finished (SSE closes normally)
  const showError = error && !isFinished;

  return (
    <div className="relative">
      {showError && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground text-xs text-center py-1.5 backdrop-blur-sm">
          {error}
        </div>
      )}
      <GameBoard
        spectatorView={spectatorView}
        events={events}
        spectatorToken={spectatorToken}
      />
    </div>
  );
}
