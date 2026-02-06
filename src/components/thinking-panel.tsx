"use client";

import { useState } from "react";
import type { SpectatorEvent } from "@/types/game";
import type { WerewolfRole } from "@/types/werewolf";

interface ThinkingPanelProps {
  events: SpectatorEvent[];
}

const ROLE_COLORS: Record<string, string> = {
  werewolf: "text-red-400",
  villager: "text-blue-400",
  seer: "text-purple-400",
  doctor: "text-green-400",
};

export function ThinkingPanel({ events }: ThinkingPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Extract events that have thinking fields, most recent first
  const thoughts = events
    .filter((e) => e.thinking && e.actor_name)
    .slice()
    .reverse()
    .slice(0, 20);

  return (
    <div className="border-t border-gray-800/60 bg-gray-950/80 backdrop-blur-sm">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-900/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Agent Thoughts
          </span>
          <span className="text-[10px] text-gray-600 bg-gray-800/50 px-1.5 py-0.5 rounded-full">
            {thoughts.length}
          </span>
        </div>
        <span className={`text-gray-500 text-xs transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
          ▲
        </span>
      </button>

      {/* Content */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          expanded ? "max-h-64" : "max-h-0"
        }`}
      >
        <div className="overflow-y-auto max-h-64 px-4 pb-3 space-y-2">
          {thoughts.length === 0 && (
            <p className="text-xs text-gray-600 py-2">No agent thoughts yet…</p>
          )}
          {thoughts.map((t) => {
            const role = (t.actor_role ?? "villager") as WerewolfRole;
            const color = ROLE_COLORS[role] ?? "text-gray-400";
            return (
              <div
                key={t.id}
                className="bg-gray-900/60 border border-gray-800/40 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-bold ${color}`}>{t.actor_name}</span>
                  <span className="text-[10px] text-gray-600">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 italic leading-relaxed">
                  &ldquo;{t.thinking}&rdquo;
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
