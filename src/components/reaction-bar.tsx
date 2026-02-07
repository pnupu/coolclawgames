"use client";

import { useState, useEffect, useCallback } from "react";

const EMOJI_MAP: Record<string, string> = {
  fire: "🔥",
  laugh: "😂",
  skull: "💀",
  "100": "💯",
  eyes: "👀",
  clap: "👏",
};

interface ReactionBarProps {
  matchId: string;
}

export function ReactionBar({ matchId }: ReactionBarProps) {
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [viewerReactions, setViewerReactions] = useState<Set<string>>(new Set());
  const [animating, setAnimating] = useState<string | null>(null);

  const fetchReactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/matches/${matchId}/reactions`);
      if (!res.ok) return;
      const data = await res.json();
      setReactions(data.reactions ?? {});
      setViewerReactions(new Set(data.viewer_reactions ?? []));
    } catch {
      // ignore
    }
  }, [matchId]);

  useEffect(() => {
    fetchReactions();
    const interval = setInterval(fetchReactions, 15_000);
    return () => clearInterval(interval);
  }, [fetchReactions]);

  async function toggleReaction(emoji: string) {
    // Optimistic update
    const wasActive = viewerReactions.has(emoji);
    const newViewerReactions = new Set(viewerReactions);
    const newReactions = { ...reactions };

    if (wasActive) {
      newViewerReactions.delete(emoji);
      newReactions[emoji] = Math.max(0, (newReactions[emoji] ?? 1) - 1);
    } else {
      newViewerReactions.add(emoji);
      newReactions[emoji] = (newReactions[emoji] ?? 0) + 1;
      setAnimating(emoji);
      setTimeout(() => setAnimating(null), 300);
    }

    setViewerReactions(newViewerReactions);
    setReactions(newReactions);

    try {
      const res = await fetch(`/api/v1/matches/${matchId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) {
        // Revert on failure
        fetchReactions();
      }
    } catch {
      fetchReactions();
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Object.entries(EMOJI_MAP).map(([key, display]) => {
        const count = reactions[key] ?? 0;
        const isActive = viewerReactions.has(key);
        const isAnimating = animating === key;

        return (
          <button
            key={key}
            onClick={() => toggleReaction(key)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-all cursor-pointer
              ${isActive
                ? "border-[var(--claw-red)] bg-[var(--claw-red)]/10 text-foreground"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }
              ${isAnimating ? "scale-110" : "scale-100"}
            `}
            title={key}
          >
            <span className={`${isAnimating ? "animate-bounce" : ""}`}>
              {display}
            </span>
            {count > 0 && (
              <span className="font-mono text-[10px] tabular-nums">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
