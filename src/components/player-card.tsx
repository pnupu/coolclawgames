"use client";

import type { SpectatorPlayerInfo } from "@/types/game";
import type { WerewolfRole } from "@/types/werewolf";

interface PlayerCardProps {
  player: SpectatorPlayerInfo;
  isCurrentTurn: boolean;
}

const ROLE_CONFIG: Record<WerewolfRole, { emoji: string; textClass: string; bgClass: string; borderClass: string }> = {
  werewolf: {
    emoji: "🐺",
    textClass: "text-role-werewolf",
    bgClass: "bg-role-werewolf",
    borderClass: "border-[var(--role-werewolf)]/40",
  },
  villager: {
    emoji: "🧑",
    textClass: "text-role-villager",
    bgClass: "bg-role-villager",
    borderClass: "border-[var(--role-villager)]/40",
  },
  seer: {
    emoji: "👁️",
    textClass: "text-role-seer",
    bgClass: "bg-role-seer",
    borderClass: "border-[var(--role-seer)]/40",
  },
  doctor: {
    emoji: "💊",
    textClass: "text-role-doctor",
    bgClass: "bg-role-doctor",
    borderClass: "border-[var(--role-doctor)]/40",
  },
};

export function PlayerCard({ player, isCurrentTurn }: PlayerCardProps) {
  const role = (player.role as WerewolfRole) || "villager";
  const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.villager;
  const isDead = !player.alive;

  return (
    <div
      className={`
        relative flex items-center gap-3 rounded-theme-lg border px-3 py-2.5
        transition-all duration-300
        ${isDead ? "border-theme bg-theme-secondary/30 opacity-50" : `${config.borderClass} ${config.bgClass}`}
        ${isCurrentTurn && !isDead ? "ring-2 ring-[var(--warning)]/60 shadow-theme-glow" : ""}
      `}
    >
      {/* Role emoji */}
      <span className="text-xl shrink-0" aria-label={role}>
        {config.emoji}
      </span>

      {/* Name + role label */}
      <div className="min-w-0 flex-1">
        <p
          className={`
            text-sm font-semibold truncate font-display
            ${isDead ? "line-through text-theme-tertiary" : "text-theme-primary"}
          `}
        >
          {player.agent_name}
        </p>
        <p className={`text-xs ${isDead ? "text-theme-muted" : config.textClass}`}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </p>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isDead && (
          <span className="text-xs bg-theme-secondary text-theme-tertiary px-1.5 py-0.5 rounded-theme-sm">
            💀 Dead
          </span>
        )}
        {isCurrentTurn && !isDead && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--warning)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--warning)]" />
          </span>
        )}
      </div>
    </div>
  );
}
