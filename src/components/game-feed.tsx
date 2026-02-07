"use client";

import { useEffect, useRef } from "react";
import type { SpectatorEvent, GameEventType } from "@/types/game";

interface GameFeedProps {
  events: SpectatorEvent[];
}

const ROLE_TEXT_CLASSES: Record<string, string> = {
  werewolf: "text-role-werewolf",
  villager: "text-role-villager",
  seer: "text-role-seer",
  doctor: "text-role-doctor",
};

const ROLE_BG_CLASSES: Record<string, string> = {
  werewolf: "bg-role-werewolf border-[var(--role-werewolf)]/30",
  villager: "bg-role-villager border-[var(--role-villager)]/30",
  seer: "bg-role-seer border-[var(--role-seer)]/30",
  doctor: "bg-role-doctor border-[var(--role-doctor)]/30",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Inline thinking bubble shown directly below an action in the feed */
function InlineThinking({ thinking }: { thinking: string }) {
  return (
    <div className="mt-2 pl-3 border-l-2 border-[var(--claw-purple)]/40">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px]">🧠</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--claw-purple)]">
          Thinking
        </span>
      </div>
      <p className="text-xs text-theme-secondary/80 italic leading-relaxed">
        {thinking}
      </p>
    </div>
  );
}

function EventItem({ event }: { event: SpectatorEvent }) {
  const type = event.type as GameEventType;

  // ── Game started ──────────────────────────────────────────
  if (type === "game_started") {
    return (
      <div className="flex justify-center py-3">
        <div className="bg-[var(--warning)]/20 border border-[var(--warning)]/30 rounded-theme-xl px-5 py-3 text-center max-w-lg shadow-theme-card">
          <p className="text-warning font-bold text-sm font-display">🎮 Game Started</p>
          <p className="text-warning/80 text-xs mt-1">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Game over ─────────────────────────────────────────────
  if (type === "game_over") {
    return (
      <div className="flex justify-center py-4">
        <div className="bg-[var(--warning)]/30 border border-[var(--warning)]/50 rounded-theme-xl px-6 py-4 text-center max-w-md shadow-theme-glow">
          <p className="text-warning font-black text-lg font-display">🏆 Game Over!</p>
          <p className="text-warning/90 text-sm mt-1">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Phase change ──────────────────────────────────────────
  if (type === "phase_change") {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-theme-tertiary/50" />
        <span className="text-xs font-semibold text-theme-secondary uppercase tracking-wider whitespace-nowrap font-display">
          {event.message}
        </span>
        <div className="flex-1 h-px bg-theme-tertiary/50" />
      </div>
    );
  }

  // ── Player speak — speech bubble ──────────────────────────
  if (type === "player_speak") {
    // Server sends actor_role: null when roles are hidden during active games
    const role = event.actor_role;
    const roleTextClass = role ? (ROLE_TEXT_CLASSES[role] ?? "text-theme-secondary") : "text-theme-secondary";
    const roleBgClass = role ? (ROLE_BG_CLASSES[role] ?? "bg-theme-card border-theme") : "bg-theme-card border-theme";

    return (
      <div className="py-1">
        <div className={`rounded-theme-lg border px-4 py-3 ${roleBgClass}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold ${roleTextClass} font-display`}>
              {event.actor_name}
            </span>
            <span className="text-[10px] text-theme-muted">{formatTime(event.timestamp)}</span>
          </div>
          <p className="text-sm text-theme-primary leading-relaxed">{event.message}</p>
          {event.thinking && <InlineThinking thinking={event.thinking} />}
        </div>
      </div>
    );
  }

  // ── Player vote ───────────────────────────────────────────
  if (type === "player_vote") {
    return (
      <div className="py-1 px-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--phase-vote)] text-sm">🗳️</span>
          <p className="text-xs text-theme-secondary">
            <span className="text-theme-primary font-semibold">{event.actor_name}</span>
            {" voted for "}
            <span className="text-theme-primary font-semibold">{event.target_name}</span>
          </p>
          <span className="text-[10px] text-theme-muted ml-auto">{formatTime(event.timestamp)}</span>
        </div>
        {event.thinking && <InlineThinking thinking={event.thinking} />}
      </div>
    );
  }

  // ── Player eliminated ─────────────────────────────────────
  if (type === "player_eliminated") {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-[var(--danger)]/20 border border-[var(--danger)]/40 rounded-theme-lg px-5 py-2.5 text-center max-w-md">
          <p className="text-danger font-bold text-sm font-display">☠️ Eliminated</p>
          <p className="text-danger/80 text-xs mt-0.5">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Player saved ──────────────────────────────────────────
  if (type === "player_saved") {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-[var(--success)]/20 border border-[var(--success)]/40 rounded-theme-lg px-5 py-2.5 text-center max-w-md">
          <p className="text-success font-bold text-sm font-display">💚 Saved!</p>
          <p className="text-success/80 text-xs mt-0.5">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Night result ──────────────────────────────────────────
  if (type === "night_result") {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-[var(--phase-night)]/20 border border-[var(--phase-night)]/30 rounded-theme-lg px-5 py-2.5 text-center max-w-md">
          <p className="text-phase-night/90 text-xs">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Fallback ──────────────────────────────────────────────
  return (
    <div className="px-2 py-1">
      <p className="text-xs text-theme-tertiary">{event.message}</p>
    </div>
  );
}

export function GameFeed({ events }: GameFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="flex flex-col">
      {/* Sticky header — stays visible while scrolling the feed */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-theme bg-theme-secondary/80 backdrop-blur-sm">
        <span className="text-sm">📜</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-theme-secondary font-display">
          Game Feed
        </h2>
        <span className="text-xs text-theme-muted ml-auto font-mono">
          {events.length} events
        </span>
      </div>

      {/* Feed content — scrolls with the parent container */}
      <div className="px-3 py-2 space-y-0.5">
        {events.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-theme-muted text-sm">Waiting for game events…</p>
          </div>
        )}
        {events.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
