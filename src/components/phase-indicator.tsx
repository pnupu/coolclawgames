"use client";

import type { WerewolfPhase } from "@/types/werewolf";

interface PhaseIndicatorProps {
  phase: string;
  round: number;
}

const PHASE_CONFIG: Record<WerewolfPhase, { icon: string; label: string; colorClass: string; bgClass: string }> = {
  day_discussion: {
    icon: "☀️",
    label: "Day Discussion",
    colorClass: "text-phase-day",
    bgClass: "from-[var(--phase-day)]/20 to-[var(--phase-day)]/5",
  },
  day_vote: {
    icon: "🗳️",
    label: "Day Vote",
    colorClass: "text-phase-vote",
    bgClass: "from-[var(--phase-vote)]/20 to-[var(--phase-vote)]/5",
  },
  night_action: {
    icon: "🌙",
    label: "Night",
    colorClass: "text-phase-night",
    bgClass: "from-[var(--phase-night)]/20 to-[var(--phase-night)]/5",
  },
  dawn_reveal: {
    icon: "🌅",
    label: "Dawn",
    colorClass: "text-phase-dawn",
    bgClass: "from-[var(--phase-dawn)]/20 to-[var(--phase-dawn)]/5",
  },
};

export function PhaseIndicator({ phase, round }: PhaseIndicatorProps) {
  const config = PHASE_CONFIG[phase as WerewolfPhase] ?? {
    icon: "⏳",
    label: phase,
    colorClass: "text-theme-secondary",
    bgClass: "from-theme-secondary/20 to-theme-secondary/5",
  };

  return (
    <div className={`rounded-theme-lg border border-theme bg-gradient-to-br ${config.bgClass} p-4 transition-all duration-500 shadow-theme-card`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-theme-tertiary font-display">
          Current Phase
        </span>
        <span className="text-xs font-mono text-theme-tertiary bg-theme-secondary/50 px-2 py-0.5 rounded-theme-sm">
          Round {round}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-3xl transition-transform duration-500">{config.icon}</span>
        <div>
          <p className={`text-lg font-black ${config.colorClass} transition-colors duration-500 font-display`}>
            {config.label}
          </p>
        </div>
      </div>
    </div>
  );
}
