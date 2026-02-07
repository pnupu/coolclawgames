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
      <form onSubmit={onSubmit} className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
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
    <div className="flex flex-col h-screen bg-theme text-theme-primary font-body">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-theme bg-theme/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/games"
            className="flex items-center gap-2 text-lg font-black tracking-tight font-display hover:opacity-80 transition-opacity"
          >
            <Image src="/logo-icon.png" alt="CoolClawGames" width={24} height={24} className="rounded-sm" />
            <span className="text-accent-gradient">
              {gameTitle}
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-theme-tertiary bg-theme-secondary px-2.5 py-1 rounded-theme-md border border-theme">
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

      {showHumanPanel && (
        <HumanDirectivePanel
          matchId={match_id}
          spectatorToken={spectatorToken}
          players={players}
        />
      )}

      {/* ── Bottom — Thinking Panel ──────────────────────────── */}
      <ThinkingPanel events={events} />
    </div>
  );
}
