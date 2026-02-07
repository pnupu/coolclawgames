"use client";

import { useMemo, useState, useEffect } from "react";
import type { SpectatorView } from "@/types/game";

interface TicTacToeBoardProps {
  spectatorView: SpectatorView;
}

interface HistoryGame {
  board: Array<string | null>;
  winner: string | null;
  win_line: number[] | null;
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

function BoardGrid({
  board,
  winLine,
  lastMoveIndex,
}: {
  board: Array<string | null>;
  winLine: number[] | null;
  lastMoveIndex: number;
}) {
  const winSet = useMemo(() => new Set(winLine ?? []), [winLine]);

  return (
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
  );
}

export function TicTacToeBoard({ spectatorView }: TicTacToeBoardProps) {
  const gameData = spectatorView.game_data;

  const currentBoard = (gameData?.board as Array<string | null>) ?? Array(9).fill(null);
  const currentWinLine = (gameData?.win_line as number[] | null) ?? null;
  const seriesScore = (gameData?.series_score as Record<string, number>) ?? { X: 0, O: 0 };
  const bestOf = (gameData?.best_of as number) ?? 1;
  const gamesPlayed = (gameData?.games_played as number) ?? 0;
  const marksByPlayer = (gameData?.marks_by_player as Record<string, string>) ?? {};
  const gameHistory = (gameData?.game_history as HistoryGame[]) ?? [];

  const isFinished = spectatorView.status === "finished";

  // Total games: completed history + current game (if in progress or just finished this game)
  const totalGames = isFinished ? gameHistory.length : gameHistory.length + 1;
  const currentGameIndex = Math.max(0, totalGames - 1);

  // Selected game tab -- default to the latest game
  const [selectedGame, setSelectedGame] = useState(currentGameIndex);

  // Auto-advance to latest game when new games start
  useEffect(() => {
    setSelectedGame(currentGameIndex);
  }, [currentGameIndex]);

  // Determine what board/winLine to show based on selected tab
  const isViewingCurrentGame = selectedGame === currentGameIndex && !isFinished;
  const isViewingHistoryGame = selectedGame < gameHistory.length;
  const selectedGameNumber = selectedGame + 1;

  let displayBoard: Array<string | null>;
  let displayWinLine: number[] | null;
  let gameLabel: string;

  if (isViewingHistoryGame && gameHistory[selectedGame]) {
    // Viewing a completed game from history
    const histGame = gameHistory[selectedGame];
    displayBoard = histGame.board ?? Array(9).fill(null);
    displayWinLine = histGame.win_line ?? null;
    const winner = histGame.winner;
    gameLabel = winner === "draw" ? "Draw" : `${winner} won`;
  } else {
    // Viewing the current/live game
    displayBoard = currentBoard;
    displayWinLine = currentWinLine;
    gameLabel = isFinished ? "Final" : "Live";
  }

  // Find player names by mark
  const xPlayer = Object.entries(marksByPlayer).find(([, m]) => m === "X")?.[0];
  const oPlayer = Object.entries(marksByPlayer).find(([, m]) => m === "O")?.[0];

  // Find current turn player (only for current live game)
  const currentTurnPlayer = spectatorView.players.find(
    (p) => p.agent_id === spectatorView.current_turn
  );
  const currentMark = currentTurnPlayer ? marksByPlayer[currentTurnPlayer.agent_name] : null;

  // Find the last placed move (for current game only)
  const lastMoveIndex = useMemo(() => {
    if (!isViewingCurrentGame && !(!isViewingHistoryGame && isFinished)) return -1;
    const abilities = spectatorView.events.filter((e) => e.type === "player_ability");
    if (abilities.length === 0) return -1;
    const last = abilities[abilities.length - 1];
    const match = last.message.match(/on ([A-C][1-3])/);
    if (!match) return -1;
    const cell = match[1];
    const row = cell.charCodeAt(0) - 65;
    const col = parseInt(cell[1]) - 1;
    return row * 3 + col;
  }, [spectatorView.events, isViewingCurrentGame, isViewingHistoryGame, isFinished]);

  // Guard: if no game data, render nothing (all hooks called above)
  if (!gameData) return null;

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
              {isFinished ? "Final" : `Game ${gamesPlayed + 1} of ${bestOf}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-black text-theme-primary">{seriesScore.O ?? 0}</span>
            <span className="text-theme-secondary text-xs truncate max-w-[80px]">{oPlayer}</span>
            <div className="w-6 h-6"><OMark isWinning={false} size="small" /></div>
          </div>
        </div>
      )}

      {/* Game switcher tabs (only for series with multiple games) */}
      {bestOf > 1 && totalGames > 0 && (
        <div className="w-full max-w-xl rounded-theme-md border border-theme bg-theme/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSelectedGame((v) => Math.max(0, v - 1))}
              disabled={selectedGame === 0}
              className="px-2.5 py-1 text-xs font-semibold rounded-theme-sm border border-theme bg-theme-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-theme-secondary"
            >
              Prev
            </button>
            <p className="text-xs font-semibold text-theme-primary text-center">
              Viewing Game {selectedGameNumber} of {totalGames}
            </p>
            <button
              onClick={() => setSelectedGame((v) => Math.min(currentGameIndex, v + 1))}
              disabled={selectedGame >= currentGameIndex}
              className="px-2.5 py-1 text-xs font-semibold rounded-theme-sm border border-theme bg-theme-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-theme-secondary"
            >
              Next
            </button>
          </div>

          <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1">
            {Array.from({ length: totalGames }, (_, i) => {
              const isSelected = i === selectedGame;
              const isHistorical = i < gameHistory.length;
              const histGame = isHistorical ? gameHistory[i] : null;
              const tabWinner = histGame?.winner;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedGame(i)}
                  className={`
                    shrink-0 px-3 py-1 text-xs font-bold rounded-theme-sm transition-all cursor-pointer
                    ${isSelected
                      ? "bg-[var(--claw-blue)] text-white shadow-md"
                      : "bg-theme-secondary/60 text-theme-secondary hover:bg-theme-secondary hover:text-theme-primary"
                    }
                  `}
                >
                  <span>Game {i + 1}</span>
                  {isHistorical && tabWinner && (
                    <span className="ml-1 opacity-70">
                      {tabWinner === "draw" ? "=" : tabWinner === "X" ? "X" : "O"}
                    </span>
                  )}
                  {!isHistorical && !isFinished && (
                    <span className="ml-1 text-[var(--success)] opacity-80">&#x25CF;</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Board */}
      <BoardGrid
        board={displayBoard}
        winLine={displayWinLine}
        lastMoveIndex={isViewingCurrentGame || (!isViewingHistoryGame && isFinished) ? lastMoveIndex : -1}
      />

      {/* Status below the board */}
      {isViewingCurrentGame && currentTurnPlayer && (
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

      {/* Historical game result label */}
      {isViewingHistoryGame && (
        <div className="text-xs font-semibold text-theme-tertiary mt-1">
          Game {selectedGameNumber}: {gameLabel}
        </div>
      )}

      {/* Current game status label */}
      {!isViewingHistoryGame && (
        <div className="text-xs font-semibold text-theme-tertiary mt-1">
          Game {selectedGameNumber}: {gameLabel}
        </div>
      )}

      {/* Winner banner (when viewing final state) */}
      {isFinished && !isViewingHistoryGame && spectatorView.winner && (
        <div className="bg-[var(--warning)]/20 border border-[var(--warning)]/40 rounded-lg px-5 py-2.5 text-center mt-1">
          <span className="text-warning font-bold font-display text-sm">
            {spectatorView.winner.reason}
          </span>
        </div>
      )}

      {/* Winner banner when viewing a historical game that was the series decider */}
      {isFinished && isViewingHistoryGame && selectedGame === gameHistory.length - 1 && spectatorView.winner && (
        <div className="bg-[var(--warning)]/20 border border-[var(--warning)]/40 rounded-lg px-5 py-2.5 text-center mt-1">
          <span className="text-warning font-bold font-display text-sm">
            {spectatorView.winner.reason}
          </span>
        </div>
      )}
    </div>
  );
}
