import type { SpectatorView } from "@/types/game";

interface RoundSummary {
  round: number;
  throws_by_player: Record<string, string | null>;
  winner_name: string | null;
}

const MOVE_BADGES: Record<string, string> = {
  rock: "🪨 Rock",
  paper: "📄 Paper",
  scissors: "✂️ Scissors",
};

function normalizeRoundHistory(value: unknown): RoundSummary[] {
  if (!Array.isArray(value)) return [];
  const rounds: RoundSummary[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const round = row.round;
    const throws = row.throws_by_player;
    const winnerName = row.winner_name;
    if (typeof round !== "number" || !throws || typeof throws !== "object") {
      continue;
    }
    const throwsByPlayer: Record<string, string | null> = {};
    for (const [name, move] of Object.entries(throws as Record<string, unknown>)) {
      throwsByPlayer[name] = typeof move === "string" ? move : null;
    }
    rounds.push({
      round,
      throws_by_player: throwsByPlayer,
      winner_name: typeof winnerName === "string" ? winnerName : null,
    });
  }
  return rounds;
}

function normalizeScoreMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const scores: Record<string, number> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number") {
      scores[name] = raw;
    }
  }
  return scores;
}

function normalizeLockMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const locks: Record<string, boolean> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    locks[name] = Boolean(raw);
  }
  return locks;
}

function renderMove(move: string | null) {
  if (!move) return "—";
  return MOVE_BADGES[move] ?? move;
}

export function RockPaperScissorsBoard({
  spectatorView,
}: {
  spectatorView: SpectatorView;
}) {
  const gameData = spectatorView.game_data;
  if (!gameData) return null;

  const targetWinsRaw = gameData.target_wins;
  const bestOfRaw = gameData.best_of;
  const targetWins = typeof targetWinsRaw === "number" ? targetWinsRaw : 4;
  const bestOf =
    typeof bestOfRaw === "number" ? bestOfRaw : Math.max(1, targetWins * 2 - 1);
  const scoresByName = normalizeScoreMap(gameData.scores_by_name);
  const lockedByName = normalizeLockMap(gameData.locked_by_name);
  const history = normalizeRoundHistory(gameData.round_history);
  const players = spectatorView.players.map((p) => p.agent_name);
  const currentRound = history.length + 1;

  return (
    <div className="px-3 py-4 space-y-3">
      <div className="rounded-theme-md border border-theme bg-theme/50 p-3">
        <p className="text-[11px] uppercase tracking-wider text-theme-tertiary font-semibold mb-2">
          Series
        </p>
        <p className="text-sm text-theme-primary">
          First to <span className="font-black">{targetWins}</span> wins
          {" "}
          (best of {bestOf})
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {players.map((name) => {
          const score = scoresByName[name] ?? 0;
          const locked = lockedByName[name] ?? false;
          return (
            <div
              key={name}
              className="rounded-theme-md border border-theme bg-theme-secondary/40 p-3"
            >
              <p className="text-sm font-bold text-theme-primary truncate">{name}</p>
              <p className="text-3xl font-black text-theme-primary font-mono mt-1">
                {score}
              </p>
              {spectatorView.status === "in_progress" && (
                <p className="text-[11px] text-theme-tertiary mt-1">
                  {locked ? "Throw locked" : "Choosing throw"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-theme-md border border-theme bg-theme-secondary/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wider text-theme-tertiary font-semibold">
            Round Log
          </p>
          {spectatorView.status === "in_progress" && (
            <span className="text-[11px] text-theme-tertiary">
              Round {currentRound}
            </span>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-theme-tertiary">No rounds resolved yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {[...history].reverse().map((entry) => (
              <div
                key={entry.round}
                className="rounded-theme-sm border border-theme bg-theme/40 px-2 py-1.5 text-xs"
              >
                <p className="font-semibold text-theme-primary mb-1">
                  Round {entry.round}
                </p>
                {players.map((name) => (
                  <p key={`${entry.round}-${name}`} className="text-theme-secondary">
                    {name}: {renderMove(entry.throws_by_player[name] ?? null)}
                  </p>
                ))}
                <p className="text-theme-tertiary mt-1">
                  {entry.winner_name ? `Winner: ${entry.winner_name}` : "Result: Tie"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
