"use client";

import type { WerewolfPhase } from "@/types/werewolf";

interface PhaseIndicatorProps {
  phase: string;
  round: number;
}

const PHASE_CONFIG: Record<WerewolfPhase, { icon: string; label: string; color: string; bg: string }> = {
  day_discussion: {
    icon: "☀️",
    label: "Day Discussion",
    color: "text-yellow-300",
    bg: "from-yellow-900/30 to-yellow-950/10",
  },
  day_vote: {
    icon: "🗳️",
    label: "Day Vote",
    color: "text-orange-300",
    bg: "from-orange-900/30 to-orange-950/10",
  },
  night_action: {
    icon: "🌙",
    label: "Night",
    color: "text-indigo-300",
    bg: "from-indigo-900/30 to-indigo-950/10",
  },
  dawn_reveal: {
    icon: "🌅",
    label: "Dawn",
    color: "text-amber-300",
    bg: "from-amber-900/30 to-amber-950/10",
  },
};

export function PhaseIndicator({ phase, round }: PhaseIndicatorProps) {
  const config = PHASE_CONFIG[phase as WerewolfPhase] ?? {
    icon: "⏳",
    label: phase,
    color: "text-gray-300",
    bg: "from-gray-900/30 to-gray-950/10",
  };

  return (
    <div className={`rounded-xl border border-gray-800/60 bg-linear-to-br ${config.bg} p-4 transition-all duration-500`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Current Phase
        </span>
        <span className="text-xs font-mono text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded-full">
          Round {round}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-3xl transition-transform duration-500">{config.icon}</span>
        <div>
          <p className={`text-lg font-black ${config.color} transition-colors duration-500`}>
            {config.label}
          </p>
        </div>
      </div>
    </div>
  );
}
