function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Base timeout for diplomacy/command turns (default 60s). */
export const KINGDOM_PHASE_TIMEOUT_MS = toPositiveInt(
  process.env.KINGDOM_PHASE_TIMEOUT_MS,
  60_000
);

/** Human command window appears every N rounds (default every 3 rounds). */
export const KINGDOM_HUMAN_INPUT_INTERVAL_ROUNDS = toPositiveInt(
  process.env.KINGDOM_HUMAN_INPUT_INTERVAL_ROUNDS,
  3
);

/** How long the human input window stays open (default 60s). */
export const KINGDOM_HUMAN_INPUT_WINDOW_MS = toPositiveInt(
  process.env.KINGDOM_HUMAN_INPUT_WINDOW_MS,
  60_000
);

/** Max round cap before score-based winner selection. */
export const KINGDOM_MAX_ROUNDS = toPositiveInt(
  process.env.KINGDOM_MAX_ROUNDS,
  15
);
