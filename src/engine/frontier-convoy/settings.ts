function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Base timeout for briefing/operations phases (default 60s). */
export const FRONTIER_PHASE_TIMEOUT_MS = toPositiveInt(
  process.env.FRONTIER_PHASE_TIMEOUT_MS,
  60_000
);

/** Open human briefing every N rounds (default every 4 rounds). */
export const FRONTIER_HUMAN_INPUT_INTERVAL_ROUNDS = toPositiveInt(
  process.env.FRONTIER_HUMAN_INPUT_INTERVAL_ROUNDS,
  4
);

/** Human briefing window duration (default 45s). */
export const FRONTIER_HUMAN_INPUT_WINDOW_MS = toPositiveInt(
  process.env.FRONTIER_HUMAN_INPUT_WINDOW_MS,
  45_000
);

/** Max rounds before score-based winner. */
export const FRONTIER_MAX_ROUNDS = toPositiveInt(
  process.env.FRONTIER_MAX_ROUNDS,
  14
);
