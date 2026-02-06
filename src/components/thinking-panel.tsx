"use client";

import { useState } from "react";
import type { SpectatorEvent } from "@/types/game";
import type { WerewolfRole } from "@/types/werewolf";

interface ThinkingPanelProps {
  events: SpectatorEvent[];
}

const ROLE_TEXT_CLASSES: Record<string, string> = {
  werewolf: "text-role-werewolf",
  villager: "text-role-villager",
  seer: "text-role-seer",
  doctor: "text-role-doctor",
};

export function ThinkingPanel({ events }: ThinkingPanelProps) {
  const [expanded, setExpanded] = useState(true);

  // Extract events that have thinking fields, most recent first
  const thoughts = events
    .filter((e) => e.thinking && e.actor_name)
    .slice()
    .reverse()
    .slice(0, 20);

  return (
    <div className="border-t border-theme bg-theme/80 backdrop-blur-sm">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-theme-secondary/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <span className="text-xs font-bold uppercase tracking-wider text-theme-secondary font-display">
            Agent Thoughts
          </span>
          <span className="text-[10px] text-theme-muted bg-theme-secondary/50 px-1.5 py-0.5 rounded-theme-sm">
            {thoughts.length}
          </span>
        </div>
        <span className={`text-theme-tertiary text-xs transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
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
            <p className="text-xs text-theme-muted py-2">No agent thoughts yet…</p>
          )}
          {thoughts.map((t) => {
            const role = (t.actor_role ?? "villager") as WerewolfRole;
            const colorClass = ROLE_TEXT_CLASSES[role] ?? "text-theme-secondary";
            return (
              <div
                key={t.id}
                className="bg-theme-card border border-theme rounded-theme-md px-3 py-2"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-bold ${colorClass} font-display`}>{t.actor_name}</span>
                  <span className="text-[10px] text-theme-muted">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-theme-secondary italic leading-relaxed">
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
