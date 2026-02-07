"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SpectatorView, SpectatorEvent } from "@/types/game";
import { MOCK_SPECTATOR_VIEW, MOCK_EVENTS } from "@/lib/mock-data";

interface UseGameStreamResult {
  spectatorView: SpectatorView | null;
  events: SpectatorEvent[];
  connected: boolean;
  error: string | null;
  /** True when the match has finished (game_over received or status === "finished") */
  isFinished: boolean;
}

/** Set to true during development to use mock data instead of real SSE */
const USE_MOCK_DATA = false;

/**
 * Custom React hook for streaming game events via SSE.
 * Falls back to polling if SSE connection fails.
 *
 * @param matchId - The match to spectate
 * @param spectatorToken - Server-generated token for full spectator access
 */
export function useGameStream(
  matchId: string,
  spectatorToken?: string
): UseGameStreamResult {
  const [spectatorView, setSpectatorView] = useState<SpectatorView | null>(null);
  const [events, setEvents] = useState<SpectatorEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseFailedRef = useRef(false);
  const gameOverRef = useRef(false);

  /** Build URL with optional spectator token */
  const buildUrl = useCallback(
    (base: string) => {
      if (!spectatorToken) return base;
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}spectator_token=${spectatorToken}`;
    },
    [spectatorToken]
  );

  // ── Mock data mode ──────────────────────────────────────────
  const useMock = useCallback(() => {
    // Drip-feed events to simulate live streaming
    let idx = 0;
    setConnected(true);
    setSpectatorView(MOCK_SPECTATOR_VIEW);

    const interval = setInterval(() => {
      if (idx < MOCK_EVENTS.length) {
        setEvents((prev) => [...prev, MOCK_EVENTS[idx]]);
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 800);

    return () => clearInterval(interval);
  }, []);

  // ── Polling fallback ────────────────────────────────────────
  const startPolling = useCallback((intervalMs = 5000) => {
    if (pollIntervalRef.current) return;

    const poll = async () => {
      try {
        const url = buildUrl(`/api/v1/matches/${matchId}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // The API returns { success: true, state: SpectatorView }
        const data: SpectatorView = json.state ?? json;
        setSpectatorView(data);
        setEvents(data.events);
        setConnected(true);
        setError(null);

        if (data.status === "finished") {
          setIsFinished(true);
          // Once we have the rematch link, stop polling
          if (data.next_match_id && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Polling failed");
        setConnected(false);
      }
    };

    poll(); // initial fetch
    pollIntervalRef.current = setInterval(poll, intervalMs);
  }, [matchId, buildUrl]);

  // ── SSE connection ──────────────────────────────────────────
  const connectSSE = useCallback(() => {
    const url = buildUrl(`/api/v1/matches/${matchId}/events`);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    // Server sends "event: state_update" with full SpectatorView
    es.addEventListener("state_update", (e) => {
      try {
        const data: SpectatorView = JSON.parse(e.data);
        setSpectatorView(data);
        setEvents(data.events);
        if (data.status === "finished") {
          setIsFinished(true);
          gameOverRef.current = true;
        }
      } catch {
        // ignore malformed messages
      }
    });

    // Server sends "event: event" with individual SpectatorEvent
    es.addEventListener("event", (e) => {
      try {
        const event: SpectatorEvent = JSON.parse(e.data);
        setEvents((prev) => {
          if (prev.some((ev) => ev.id === event.id)) return prev;
          return [...prev, event];
        });
      } catch {
        // ignore malformed messages
      }
    });

    // Server sends "event: game_over" with full SpectatorView
    es.addEventListener("game_over", (e) => {
      try {
        const data: SpectatorView = JSON.parse(e.data);
        setSpectatorView(data);
        setEvents(data.events);
        setIsFinished(true);
        gameOverRef.current = true;
      } catch {
        // ignore malformed messages
      }
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      if (gameOverRef.current) {
        // Game ended normally — keep polling slowly to pick up rematch links
        setConnected(true);
        startPolling(15_000);
        return;
      }

      setConnected(false);

      if (!sseFailedRef.current) {
        sseFailedRef.current = true;
        setError("Live connection failed — switching to polling");
        startPolling();
      }
    };
  }, [matchId, startPolling, buildUrl]);

  // ── Lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK_DATA) {
      return useMock();
    }

    connectSSE();

    return () => {
      eventSourceRef.current?.close();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connectSSE, useMock]);

  return { spectatorView, events, connected, error, isFinished };
}
