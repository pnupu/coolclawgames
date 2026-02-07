"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const EMOJI_MAP: Record<string, string> = {
  fire: "\uD83D\uDD25",
  laugh: "\uD83D\uDE02",
  skull: "\uD83D\uDC80",
  "100": "\uD83D\uDCAF",
  eyes: "\uD83D\uDC40",
  clap: "\uD83D\uDC4F",
};

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number; // random horizontal offset (0-100)
  startTime: number;
}

interface FloatingReactionsProps {
  matchId: string;
}

let nextId = 0;

export function FloatingReactions({ matchId }: FloatingReactionsProps) {
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([]);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const sseRef = useRef<EventSource | null>(null);

  const addFloater = useCallback((emojiKey: string) => {
    const display = EMOJI_MAP[emojiKey];
    if (!display) return;

    const id = nextId++;
    const floater: FloatingEmoji = {
      id,
      emoji: display,
      x: 10 + Math.random() * 80, // 10-90% from left
      startTime: Date.now(),
    };
    setFloaters((prev) => [...prev.slice(-30), floater]); // Cap at 30

    // Remove after animation (3s)
    setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, 3000);
  }, []);

  // Listen for SSE reaction events from other spectators
  useEffect(() => {
    const es = new EventSource(`/api/v1/matches/${matchId}/reaction-stream`);
    sseRef.current = es;

    es.addEventListener("reaction", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.emoji && EMOJI_MAP[data.emoji]) {
          addFloater(data.emoji);
        }
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      // Silently reconnect -- the browser will handle it
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [matchId, addFloater]);

  const sendReaction = useCallback(
    async (emojiKey: string) => {
      // Local cooldown: 500ms per emoji
      const now = Date.now();
      if (cooldowns[emojiKey] && now - cooldowns[emojiKey] < 500) return;
      setCooldowns((prev) => ({ ...prev, [emojiKey]: now }));

      // Show locally immediately
      addFloater(emojiKey);

      // Broadcast to other spectators (fire-and-forget)
      try {
        await fetch(`/api/v1/matches/${matchId}/reaction-stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji: emojiKey }),
        });
      } catch {
        // ignore
      }
    },
    [matchId, addFloater, cooldowns]
  );

  return (
    <>
      {/* Emoji buttons at the bottom */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 bg-theme/90 backdrop-blur-md border border-theme rounded-full px-2 py-1.5 shadow-lg">
          {Object.entries(EMOJI_MAP).map(([key, display]) => (
            <button
              key={key}
              onClick={() => sendReaction(key)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-theme-secondary active:scale-90 transition-all cursor-pointer text-lg"
              title={key}
            >
              {display}
            </button>
          ))}
        </div>
      </div>

      {/* Floating emoji overlay */}
      <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
        {floaters.map((f) => (
          <div
            key={f.id}
            className="absolute animate-float-up text-3xl"
            style={{
              left: `${f.x}%`,
              bottom: "60px",
            }}
          >
            {f.emoji}
          </div>
        ))}
      </div>
    </>
  );
}
