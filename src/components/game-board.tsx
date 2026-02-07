"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { SpectatorView, SpectatorEvent } from "@/types/game";
import { PlayerList } from "@/components/player-list";
import { GameFeed } from "@/components/game-feed";
import { PhaseIndicator } from "@/components/phase-indicator";
import { VoteTracker } from "@/components/vote-tracker";
import { ThinkingPanel } from "@/components/thinking-panel";
import { FloatingReactions } from "@/components/floating-reactions";
import { TicTacToeBoard } from "@/components/tic-tac-toe-board";
import { CommentsSection } from "@/components/comments-section";

function ShareButton({
  matchId,
  isLive,
  gameTitle,
}: {
  matchId: string;
  isLive: boolean;
  gameTitle: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/matches/${matchId}`;
    const text = isLive
      ? `Watch this ${gameTitle} match LIVE on CoolClawGames!`
      : `Check out this ${gameTitle} replay on CoolClawGames!`;

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: `CoolClawGames - ${gameTitle}`, text, url });
        return;
      } catch {
        // User cancelled or not supported, fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Last resort
      prompt("Copy this link:", url);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-theme-md border border-theme bg-theme-secondary hover:bg-muted transition-colors cursor-pointer"
      title="Share this match"
    >
      {copied ? (
        <>
          <span className="text-[var(--success)]">✓</span>
          <span className="text-[var(--success)]">Copied!</span>
        </>
      ) : (
        <>
          <span>🔗</span>
          <span className="text-theme-secondary">Share</span>
        </>
      )}
    </button>
  );
}

function MatchResult({
  winner,
  players,
  gameData,
}: {
  winner: { team: string; reason: string };
  players: SpectatorView["players"];
  gameData?: Record<string, unknown>;
}) {
  const seriesScore = gameData?.series_score as Record<string, number> | undefined;
  const bestOf = gameData?.best_of as number | undefined;
  const marksByPlayer = gameData?.marks_by_player as Record<string, string> | undefined;

  return (
    <div className="rounded-theme-lg border border-theme bg-gradient-to-br from-[var(--warning)]/15 to-[var(--warning)]/5 p-4 shadow-theme-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-theme-tertiary font-display">
          Match Result
        </span>
        <span className="text-xs font-mono text-theme-tertiary bg-theme-secondary/50 px-2 py-0.5 rounded-theme-sm">
          Final
        </span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">🏆</span>
        <div>
          <p className="text-lg font-black text-[var(--warning)] font-display">
            Game Over
          </p>
        </div>
      </div>

      <div className="bg-theme/60 rounded-theme-md p-3 mb-3 border border-theme">
        <p className="text-sm font-semibold text-theme-primary text-center">
          {winner.reason}
        </p>
      </div>

      {/* Series score summary for tic-tac-toe-like games */}
      {seriesScore && bestOf && bestOf > 1 && marksByPlayer && (
        <div className="bg-theme/40 rounded-theme-md p-3 border border-theme">
          <p className="text-[10px] font-bold uppercase tracking-wider text-theme-tertiary mb-2 text-center">
            Series Score
          </p>
          <div className="flex items-center justify-center gap-4">
            {Object.entries(marksByPlayer).map(([name, mark]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="text-xs font-bold text-theme-primary truncate max-w-[70px]">
                  {name}
                </span>
                <span className="text-xs text-theme-secondary">({mark})</span>
                <span className="font-mono text-lg font-black text-theme-primary">
                  {seriesScore[mark] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="mt-3 space-y-1.5">
        {players.map((p) => (
          <div
            key={p.agent_id}
            className="flex items-center gap-2 text-xs"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${p.alive ? "bg-[var(--success)]" : "bg-[var(--error)]"}`} />
            <span className="text-theme-primary font-medium truncate">{p.agent_name}</span>
            <span className="text-theme-tertiary ml-auto">{p.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GameBoardProps {
  spectatorView: SpectatorView;
  events: SpectatorEvent[];
  spectatorToken?: string;
}

function HumanDirectivePanel({
  matchId,
  spectatorToken,
  players,
}: {
  matchId: string;
  spectatorToken?: string;
  players: SpectatorView["players"];
}) {
  const [target, setTarget] = useState("");
  const [directive, setDirective] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const alivePlayers = useMemo(
    () => players.filter((p) => p.alive),
    [players]
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target || !directive.trim()) {
      setFeedback("Pick a target and write a directive.");
      return;
    }
    if (!spectatorToken) {
      setFeedback("Missing spectator token.");
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const url = `/api/v1/matches/${matchId}/human-input?spectator_token=${encodeURIComponent(
        spectatorToken
      )}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: target,
          directive: directive.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setDirective("");
      setFeedback("Directive submitted.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-theme bg-theme-secondary/40 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-theme-secondary">
        Human Coaching Window
      </h3>
      <form onSubmit={onSubmit} className="grid gap-2 grid-cols-1 sm:grid-cols-[180px_1fr_auto]">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded border border-theme bg-theme px-2 py-1.5 text-xs"
        >
          <option value="">Target player</option>
          {alivePlayers.map((p) => (
            <option key={p.agent_id} value={p.agent_name}>
              {p.agent_name}
            </option>
          ))}
        </select>
        <input
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          placeholder="Directive (e.g. Push economy this round. Avoid high-risk attacks.)"
          className="rounded border border-theme bg-theme px-2 py-1.5 text-xs"
          maxLength={800}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded border border-theme bg-theme px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {submitting ? "Sending..." : "Send"}
        </button>
      </form>
      {feedback && (
        <p className="mt-1 text-[11px] text-theme-tertiary">{feedback}</p>
      )}
    </div>
  );
}

export function GameBoard({ spectatorView, events, spectatorToken }: GameBoardProps) {
  const { match_id, status, phase, round, players, current_turn, game_type } = spectatorView;
  const isFinished = status === "finished";
  const supportsHumanPanel =
    game_type === "kingdom-operator" ||
    game_type === "frontier-convoy" ||
    game_type === "council-of-spies";
  const showHumanPanel =
    supportsHumanPanel && phase === "human_briefing" && !isFinished;
  const gameTitle =
    game_type === "kingdom-operator"
      ? "AI Kingdom Operator"
      : game_type === "frontier-convoy"
        ? "AI Frontier Convoy"
        : game_type === "council-of-spies"
          ? "AI Council of Spies"
      : game_type === "rock-paper-scissors"
        ? "AI Rock Paper Scissors"
        : game_type === "tic-tac-toe"
          ? "AI Tic Tac Toe"
          : "AI Werewolf";

  return (
    <div className="flex flex-col h-screen bg-theme text-theme-primary font-body overflow-hidden">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-theme bg-theme/90 backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            href="/games"
            className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-lg font-black tracking-tight font-display hover:opacity-80 transition-opacity min-w-0"
          >
            <Image src="/logo-icon.png" alt="CoolClawGames" width={24} height={24} className="rounded-sm shrink-0" />
            <span className="text-accent-gradient truncate">
              {gameTitle}
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden sm:inline text-xs font-mono text-theme-tertiary bg-theme-secondary px-2.5 py-1 rounded-theme-md border border-theme">
            {match_id.slice(0, 8)}
          </span>
          <ShareButton matchId={match_id} isLive={!isFinished} gameTitle={gameTitle} />
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
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left sidebar — Players */}
        <aside className="shrink-0 w-full max-h-48 lg:max-h-none lg:w-64 xl:w-72 border-b lg:border-b-0 lg:border-r border-theme p-3 sm:p-4 overflow-y-auto bg-theme-secondary/30">
          <PlayerList players={players} currentTurn={current_turn} />
        </aside>

        {/* Center — Game board (pinned) + scrollable feed/thoughts/comments */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Visual game board — pinned at top, never scrolls away */}
          {game_type === "tic-tac-toe" && (
            <div className="shrink-0 border-b border-theme bg-theme-secondary/20">
              <TicTacToeBoard spectatorView={spectatorView} />
            </div>
          )}

          {/* Scrollable area: feed + thinking + rematch + comments */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Game Feed (no longer manages its own scroll) */}
            <GameFeed events={events} />

            {/* Thinking Panel — scrolls with feed */}
            <ThinkingPanel events={events} />

            {/* Human coaching panel */}
            {showHumanPanel && (
              <HumanDirectivePanel
                matchId={match_id}
                spectatorToken={spectatorToken}
                players={players}
              />
            )}

            {/* Rematch banner */}
            {isFinished && spectatorView.next_match_id && (
              <div className="border-t border-theme bg-[var(--claw-blue)]/10 px-4 py-3">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-sm font-semibold text-theme-primary">
                    Rematch started!
                  </span>
                  <Link
                    href={`/matches/${spectatorView.next_match_id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-theme-md
                      bg-[var(--claw-blue)] text-white hover:bg-[var(--claw-blue)]/80 transition-colors"
                  >
                    Watch Rematch
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </div>
            )}

            {/* Comments (post-game) */}
            <CommentsSection matchId={match_id} isFinished={isFinished} />
          </div>
        </main>

        {/* Right sidebar — Phase + Votes / Result */}
        <aside className="shrink-0 w-full max-h-56 lg:max-h-none lg:w-64 xl:w-72 border-t lg:border-t-0 lg:border-l border-theme p-3 sm:p-4 space-y-4 overflow-y-auto bg-theme-secondary/30">
          {isFinished && spectatorView.winner ? (
            <MatchResult winner={spectatorView.winner} players={players} gameData={spectatorView.game_data} />
          ) : (
            <>
              <PhaseIndicator phase={phase} round={round} />
              <VoteTracker events={events} phase={phase} players={players} />
            </>
          )}
        </aside>
      </div>

      {/* ── Floating emoji reactions ───────────────────────────── */}
      <FloatingReactions matchId={match_id} />
    </div>
  );
}
