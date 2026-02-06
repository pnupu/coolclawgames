"use client";

import { useEffect, useRef } from "react";
import type { SpectatorEvent, GameEventType } from "@/types/game";
import type { WerewolfRole } from "@/types/werewolf";

interface GameFeedProps {
  events: SpectatorEvent[];
}

const ROLE_COLORS: Record<string, string> = {
  werewolf: "text-red-400",
  villager: "text-blue-400",
  seer: "text-purple-400",
  doctor: "text-green-400",
};

const ROLE_BG: Record<string, string> = {
  werewolf: "bg-red-950/30 border-red-900/40",
  villager: "bg-blue-950/30 border-blue-900/40",
  seer: "bg-purple-950/30 border-purple-900/40",
  doctor: "bg-green-950/30 border-green-900/40",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function EventItem({ event }: { event: SpectatorEvent }) {
  const type = event.type as GameEventType;

  // ── Game started ──────────────────────────────────────────
  if (type === "game_started") {
    return (
      <div className="flex justify-center py-3">
        <div className="bg-linear-to-r from-amber-900/40 via-amber-800/50 to-amber-900/40 border border-amber-700/40 rounded-xl px-5 py-3 text-center max-w-lg">
          <p className="text-amber-300 font-bold text-sm">🎮 Game Started</p>
          <p className="text-amber-200/80 text-xs mt-1">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Game over ─────────────────────────────────────────────
  if (type === "game_over") {
    return (
      <div className="flex justify-center py-4">
        <div className="bg-linear-to-r from-yellow-900/50 via-yellow-800/60 to-yellow-900/50 border border-yellow-600/50 rounded-2xl px-6 py-4 text-center max-w-md shadow-lg shadow-yellow-900/20">
          <p className="text-yellow-300 font-black text-lg">🏆 Game Over!</p>
          <p className="text-yellow-200/90 text-sm mt-1">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Phase change ──────────────────────────────────────────
  if (type === "phase_change") {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-gray-800" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
          {event.message}
        </span>
        <div className="flex-1 h-px bg-gray-800" />
      </div>
    );
  }

  // ── Player speak — speech bubble ──────────────────────────
  if (type === "player_speak") {
    const role = (event.actor_role ?? "villager") as WerewolfRole;
    const roleColor = ROLE_COLORS[role] ?? "text-gray-400";
    const roleBg = ROLE_BG[role] ?? "bg-gray-900/30 border-gray-800";

    return (
      <div className="py-1">
        <div className={`rounded-xl border px-4 py-3 ${roleBg}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold ${roleColor}`}>
              {event.actor_name}
            </span>
            <span className="text-[10px] text-gray-600">{formatTime(event.timestamp)}</span>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Player vote ───────────────────────────────────────────
  if (type === "player_vote") {
    return (
      <div className="flex items-center gap-2 py-1 px-2">
        <span className="text-orange-400 text-sm">🗳️</span>
        <p className="text-xs text-gray-400">
          <span className="text-gray-200 font-semibold">{event.actor_name}</span>
          {" voted for "}
          <span className="text-gray-200 font-semibold">{event.target_name}</span>
        </p>
        <span className="text-[10px] text-gray-600 ml-auto">{formatTime(event.timestamp)}</span>
      </div>
    );
  }

  // ── Player eliminated ─────────────────────────────────────
  if (type === "player_eliminated") {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-red-950/50 border border-red-800/50 rounded-xl px-5 py-2.5 text-center max-w-md">
          <p className="text-red-300 font-bold text-sm">☠️ Eliminated</p>
          <p className="text-red-200/80 text-xs mt-0.5">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Player saved ──────────────────────────────────────────
  if (type === "player_saved") {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-green-950/50 border border-green-800/50 rounded-xl px-5 py-2.5 text-center max-w-md">
          <p className="text-green-300 font-bold text-sm">💚 Saved!</p>
          <p className="text-green-200/80 text-xs mt-0.5">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Night result ──────────────────────────────────────────
  if (type === "night_result") {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-indigo-950/50 border border-indigo-800/40 rounded-xl px-5 py-2.5 text-center max-w-md">
          <p className="text-indigo-200/90 text-xs">{event.message}</p>
        </div>
      </div>
    );
  }

  // ── Fallback ──────────────────────────────────────────────
  return (
    <div className="px-2 py-1">
      <p className="text-xs text-gray-500">{event.message}</p>
    </div>
  );
}

export function GameFeed({ events }: GameFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/60">
        <span className="text-sm">📜</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
          Game Feed
        </h2>
        <span className="text-xs text-gray-600 ml-auto font-mono">
          {events.length} events
        </span>
      </div>

      {/* Scrollable feed */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 scroll-smooth">
        {events.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-sm">Waiting for game events…</p>
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
