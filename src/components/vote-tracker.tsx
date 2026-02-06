"use client";

import type { SpectatorEvent, SpectatorPlayerInfo } from "@/types/game";

interface VoteTrackerProps {
  events: SpectatorEvent[];
  phase: string;
  players: SpectatorPlayerInfo[];
}

interface VoteEntry {
  voter: string;
  voterName: string;
  target: string;
  targetName: string;
}

export function VoteTracker({ events, phase, players }: VoteTrackerProps) {
  // Collect votes from the current voting phase
  const voteEvents = events.filter((e) => e.type === "player_vote" && e.phase === "day_vote");

  // Latest round's votes only
  const latestRound = voteEvents.length > 0 ? Math.max(...voteEvents.map((e) => e.round)) : 0;
  const currentVotes = voteEvents.filter((e) => e.round === latestRound);

  const votes: VoteEntry[] = currentVotes
    .filter((e) => e.actor && e.target)
    .map((e) => ({
      voter: e.actor!,
      voterName: e.actor_name ?? "Unknown",
      target: e.target!,
      targetName: e.target_name ?? "Unknown",
    }));

  // Tally
  const tally: Record<string, { name: string; count: number; voters: string[] }> = {};
  for (const vote of votes) {
    if (!tally[vote.target]) {
      tally[vote.target] = { name: vote.targetName, count: 0, voters: [] };
    }
    tally[vote.target].count++;
    tally[vote.target].voters.push(vote.voterName);
  }

  const sortedTargets = Object.entries(tally).sort(([, a], [, b]) => b.count - a.count);

  // Elimination event?
  const eliminatedEvent = events.find(
    (e) => e.type === "player_eliminated" && e.round === latestRound
  );

  const isVotePhase = phase === "day_vote";
  const alivePlayers = players.filter((p) => p.alive);
  const votedCount = votes.length;

  return (
    <div className="rounded-theme-lg border border-theme bg-theme-card p-4 shadow-theme-card">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🗳️</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-theme-secondary font-display">
          Vote Tracker
        </h2>
      </div>

      {votes.length === 0 && !isVotePhase && (
        <p className="text-xs text-theme-muted">No votes yet this round.</p>
      )}

      {votes.length === 0 && isVotePhase && (
        <p className="text-xs text-theme-tertiary animate-pulse">Waiting for votes…</p>
      )}

      {sortedTargets.length > 0 && (
        <div className="space-y-2">
          {sortedTargets.map(([targetId, data]) => {
            const maxVotes = alivePlayers.length;
            const pct = maxVotes > 0 ? (data.count / maxVotes) * 100 : 0;

            return (
              <div key={targetId}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-theme-primary font-display">{data.name}</span>
                  <span className="text-xs text-theme-tertiary font-mono">{data.count}</span>
                </div>
                {/* Vote bar */}
                <div className="w-full bg-theme-secondary/50 rounded-theme-sm h-2 overflow-hidden">
                  <div
                    className="h-full bg-accent-gradient rounded-theme-sm transition-all duration-500"
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                </div>
                <p className="text-[10px] text-theme-muted mt-0.5 truncate">
                  {data.voters.join(", ")}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Vote progress */}
      {isVotePhase && (
        <p className="text-[10px] text-theme-muted mt-3 text-center">
          {votedCount}/{alivePlayers.length} players voted
        </p>
      )}

      {/* Elimination result */}
      {eliminatedEvent && (
        <div className="mt-3 pt-3 border-t border-theme">
          <p className="text-xs text-danger font-bold text-center font-display">
            ☠️ {eliminatedEvent.message}
          </p>
        </div>
      )}
    </div>
  );
}
