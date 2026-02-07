"use client";

import { useMemo } from "react";
import type { SpectatorView } from "@/types/game";

interface TicTacToeBoardProps {
  spectatorView: SpectatorView;
}

const ROW_LABELS = ["A", "B", "C"];
const COL_LABELS = ["1", "2", "3"];

function XMark({ isWinning, size = "normal" }: { isWinning: boolean; size?: "small" | "normal" }) {
  const sw = size === "small" ? 12 : 10;
  return (
    <svg viewBox="0 0 100 100" className={`w-full h-full ${isWinning ? "animate-pulse" : ""}`}>
      <line
        x1="22" y1="22" x2="78" y2="78"
        stroke={isWinning ? "var(--claw-red)" : "var(--claw-blue)"}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <line
        x1="78" y1="22" x2="22" y2="78"
        stroke={isWinning ? "var(--claw-red)" : "var(--claw-blue)"}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}

function OMark({ isWinning, size = "normal" }: { isWinning: boolean; size?: "small" | "normal" }) {
  const sw = size === "small" ? 12 : 10;
  return (
    <svg viewBox="0 0 100 100" className={`w-full h-full ${isWinning ? "animate-pulse" : ""}`}>
      <circle
        cx="50" cy="50" r="28"
        fill="none"
        stroke={isWinning ? "var(--claw-red)" : "var(--claw-purple)"}
        strokeWidth={sw}
        strokeLinecap="round"
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

  // Find player names by mark
  const xPlayer = Object.entries(marksByPlayer).find(([, m]) => m === "X")?.[0];
  const oPlayer = Object.entries(marksByPlayer).find(([, m]) => m === "O")?.[0];

  // Find current turn player
  const currentTurnPlayer = spectatorView.players.find(
    (p) => p.agent_id === spectatorView.current_turn
  );
  const currentMark = currentTurnPlayer ? marksByPlayer[currentTurnPlayer.agent_name] : null;

  const isFinished = spectatorView.status === "finished";

  // Find the last placed move (most recent player_ability event)
  const lastMoveIndex = useMemo(() => {
    const abilities = spectatorView.events.filter((e) => e.type === "player_ability");
    if (abilities.length === 0) return -1;
    const last = abilities[abilities.length - 1];
    const match = last.message.match(/on ([A-C][1-3])/);
    if (!match) return -1;
    const cell = match[1];
    const row = cell.charCodeAt(0) - 65; // A=0, B=1, C=2
    const col = parseInt(cell[1]) - 1;
    return row * 3 + col;
  }, [spectatorView.events]);

  return (
    <div className="flex flex-col items-center gap-3 py-4 px-2">
      {/* Series score header */}
      {bestOf > 1 && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6"><XMark isWinning={false} size="small" /></div>
            <span className="text-theme-secondary text-xs truncate max-w-[80px]">{xPlayer}</span>
            <span className="font-mono text-2xl font-black text-theme-primary">{seriesScore.X ?? 0}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-theme-tertiary text-[10px] uppercase tracking-wider font-semibold">
              Game {gamesPlayed + (isFinished ? 0 : 1)} of {bestOf}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-black text-theme-primary">{seriesScore.O ?? 0}</span>
            <span className="text-theme-secondary text-xs truncate max-w-[80px]">{oPlayer}</span>
            <div className="w-6 h-6"><OMark isWinning={false} size="small" /></div>
          </div>
        </div>
      )}

      {/* Board with row/col labels */}
      <div className="flex items-start gap-0">
        {/* Row labels */}
        <div className="flex flex-col mt-8 mr-2">
          {ROW_LABELS.map((label) => (
            <div key={label} className="h-[72px] sm:h-[88px] flex items-center justify-center">
              <span className="text-xs font-mono font-bold text-theme-tertiary">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center">
          {/* Column labels */}
          <div className="flex mb-1">
            {COL_LABELS.map((label) => (
              <div key={label} className="w-[72px] sm:w-[88px] flex items-center justify-center">
                <span className="text-xs font-mono font-bold text-theme-tertiary">{label}</span>
              </div>
            ))}
          </div>

          {/* The grid */}
          <div className="grid grid-cols-3 gap-[3px] bg-theme-tertiary/60 p-[3px] rounded-lg">
            {board.map((cell, i) => {
              const isWin = winSet.has(i);
              const isLastMove = i === lastMoveIndex;
              return (
                <div
                  key={i}
                  className={`
                    w-[68px] h-[68px] sm:w-[84px] sm:h-[84px] flex items-center justify-center rounded-md
                    transition-all duration-300 relative
                    ${isWin
                      ? "bg-[var(--claw-red)]/20 ring-2 ring-[var(--claw-red)]/60 shadow-lg"
                      : isLastMove && cell
                        ? "bg-[var(--claw-amber)]/10 ring-1 ring-[var(--claw-amber)]/40"
                        : cell
                          ? "bg-[oklch(0.25_0.01_250)]"
                          : "bg-[oklch(0.20_0.005_250)]"
                    }
                  `}
                >
                  <div className="w-11 h-11 sm:w-14 sm:h-14">
                    {cell === "X" && <XMark isWinning={isWin} />}
                    {cell === "O" && <OMark isWinning={isWin} />}
                  </div>
                  {/* Empty cell dot */}
                  {!cell && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-theme-tertiary/30" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Turn indicator */}
      {!isFinished && currentTurnPlayer && (
        <div className="flex items-center gap-2 text-sm text-theme-secondary mt-1">
          <div className="w-5 h-5">
            {currentMark === "X" ? <XMark isWinning={false} size="small" /> : <OMark isWinning={false} size="small" />}
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
        <div className="bg-[var(--warning)]/20 border border-[var(--warning)]/40 rounded-lg px-5 py-2.5 text-center mt-1">
          <span className="text-warning font-bold font-display text-sm">
            {spectatorView.winner.reason}
          </span>
        </div>
      )}
    </div>
  );
}
