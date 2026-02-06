"use client";

import type { SpectatorPlayerInfo } from "@/types/game";
import type { WerewolfRole } from "@/types/werewolf";

interface PlayerCardProps {
  player: SpectatorPlayerInfo;
  isCurrentTurn: boolean;
}

const ROLE_CONFIG: Record<WerewolfRole, { emoji: string; color: string; bg: string; border: string }> = {
  werewolf: {
    emoji: "🐺",
    color: "text-red-400",
    bg: "bg-red-950/40",
    border: "border-red-800/60",
  },
  villager: {
    emoji: "🧑",
    color: "text-blue-400",
    bg: "bg-blue-950/40",
    border: "border-blue-800/60",
  },
  seer: {
    emoji: "👁️",
    color: "text-purple-400",
    bg: "bg-purple-950/40",
    border: "border-purple-800/60",
  },
  doctor: {
    emoji: "💊",
    color: "text-green-400",
    bg: "bg-green-950/40",
    border: "border-green-800/60",
  },
};

export function PlayerCard({ player, isCurrentTurn }: PlayerCardProps) {
  const role = (player.role as WerewolfRole) || "villager";
  const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.villager;
  const isDead = !player.alive;

  return (
    <div
      className={`
        relative flex items-center gap-3 rounded-xl border px-3 py-2.5
        transition-all duration-300
        ${isDead ? "border-gray-800/40 bg-gray-900/30 opacity-50" : `${config.border} ${config.bg}`}
        ${isCurrentTurn && !isDead ? "ring-2 ring-amber-400/60 shadow-lg shadow-amber-400/10" : ""}
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
            text-sm font-semibold truncate
            ${isDead ? "line-through text-gray-500" : "text-gray-100"}
          `}
        >
          {player.agent_name}
        </p>
        <p className={`text-xs ${isDead ? "text-gray-600" : config.color}`}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </p>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isDead && (
          <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
            💀 Dead
          </span>
        )}
        {isCurrentTurn && !isDead && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
          </span>
        )}
      </div>
    </div>
  );
}
