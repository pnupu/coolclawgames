"use client";

import type { SpectatorPlayerInfo } from "@/types/game";
import { PlayerCard } from "@/components/player-card";

interface PlayerListProps {
  players: SpectatorPlayerInfo[];
  currentTurn: string | null;
}

export function PlayerList({ players, currentTurn }: PlayerListProps) {
  const sorted = [...players].sort((a, b) => {
    if (a.alive === b.alive) return 0;
    return a.alive ? -1 : 1;
  });

  const aliveCount = players.filter((p) => p.alive).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
          Players
        </h2>
        <span className="text-xs text-gray-500 font-mono">
          {aliveCount}/{players.length} alive
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {sorted.map((player) => (
          <PlayerCard
            key={player.agent_id}
            player={player}
            isCurrentTurn={currentTurn === player.agent_id}
          />
        ))}
      </div>
    </div>
  );
}
