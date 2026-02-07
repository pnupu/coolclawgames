"use client";

import { useMemo } from "react";
import type { SpectatorView } from "@/types/game";

interface TicTacToeBoardProps {
  spectatorView: SpectatorView;
}

const CELL_LABELS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];

function XMark({ isWinning }: { isWinning: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`w-full h-full ${isWinning ? "animate-pulse" : ""}`}>
      <line
        x1="20" y1="20" x2="80" y2="80"
        stroke={isWinning ? "var(--claw-red)" : "var(--claw-blue)"}
        strokeWidth="10"
        strokeLinecap="round"
        className="drop-shadow-sm"
      />
      <line
        x1="80" y1="20" x2="20" y2="80"
        stroke={isWinning ? "var(--claw-red)" : "var(--claw-blue)"}
        strokeWidth="10"
        strokeLinecap="round"
        className="drop-shadow-sm"
      />
    </svg>
  );
}

function OMark({ isWinning }: { isWinning: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`w-full h-full ${isWinning ? "animate-pulse" : ""}`}>
      <circle
        cx="50" cy="50" r="30"
        fill="none"
        stroke={isWinning ? "var(--claw-red)" : "var(--claw-purple)"}
        strokeWidth="10"
        strokeLinecap="round"
        className="drop-shadow-sm"
      />
    </svg>
  );
}

export function TicTacToeBoard({ spectatorView }: TicTacToeBoardProps) {
  const gameData = spectatorView.game_data;
  if (!gameData) return null;

  const board = (gameData.board as Array<string | null>) ?? Array(9).fill(null);
  const winLine = (gameData.win_line as number[] | null) ?? null;
  const seriesScore = (gameData.series_score as Record<string, number>) ?? { X: 0, O: 0 };
  const bestOf = (gameData.best_of as number) ?? 1;
  const gamesPlayed = (gameData.games_played as number) ?? 0;
  const marksByPlayer = (gameData.marks_by_player as Record<string, string>) ?? {};

  const winSet = useMemo(() => new Set(winLine ?? []), [winLine]);

  // Find current turn player name
  const currentTurnPlayer = spectatorView.players.find(
    (p) => p.agent_id === spectatorView.current_turn
  );

  // Find which mark belongs to the current player
  const currentMark = currentTurnPlayer ? marksByPlayer[currentTurnPlayer.agent_name] : null;

  const isFinished = spectatorView.status === "finished";

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Series score header */}
      {bestOf > 1 && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[var(--claw-blue)] font-bold font-display text-lg">X</span>
            <span className="font-mono text-lg font-bold">{seriesScore.X ?? 0}</span>
          </div>
          <span className="text-theme-tertiary text-xs">
            Game {gamesPlayed + (isFinished ? 0 : 1)} of {bestOf}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">{seriesScore.O ?? 0}</span>
            <span className="text-[var(--claw-purple)] font-bold font-display text-lg">O</span>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="relative">
        <div className="grid grid-cols-3 gap-1.5 bg-theme-tertiary/30 p-1.5 rounded-theme-lg">
          {board.map((cell, i) => {
            const isWin = winSet.has(i);
            return (
              <div
                key={i}
                className={`
                  w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center rounded-theme-md
                  transition-all duration-300
                  ${isWin
                    ? "bg-[var(--claw-red)]/15 border-2 border-[var(--claw-red)]/40 shadow-lg"
                    : cell
                      ? "bg-theme-secondary border border-theme"
                      : "bg-theme border border-theme/50"
                  }
                `}
                title={CELL_LABELS[i]}
              >
                <div className="w-12 h-12 sm:w-16 sm:h-16">
                  {cell === "X" && <XMark isWinning={isWin} />}
                  {cell === "O" && <OMark isWinning={isWin} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Turn indicator */}
      {!isFinished && currentTurnPlayer && (
        <div className="flex items-center gap-2 text-sm text-theme-secondary">
          <div className="w-5 h-5">
            {currentMark === "X" ? <XMark isWinning={false} /> : <OMark isWinning={false} />}
          </div>
          <span>
            <span className="font-semibold text-theme-primary">{currentTurnPlayer.agent_name}</span>
            {" to move"}
          </span>
          <span className="relative flex h-2 w-2 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--warning)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--warning)]" />
          </span>
        </div>
      )}

      {/* Winner banner */}
      {isFinished && spectatorView.winner && (
        <div className="bg-[var(--warning)]/20 border border-[var(--warning)]/40 rounded-theme-lg px-5 py-2 text-center">
          <span className="text-warning font-bold font-display">
            {spectatorView.winner.reason}
          </span>
        </div>
      )}
    </div>
  );
}
