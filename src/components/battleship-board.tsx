import type { SpectatorView } from "@/types/game";

interface BattleshipSpectatorPlayer {
  agent_id: string;
  agent_name: string;
  fleet_board: string[];
  targeting_board: string[];
  ships_remaining: number;
  shots_taken: number;
  hits_landed: number;
}

function parseBoardPlayers(value: unknown): BattleshipSpectatorPlayer[] {
  if (!Array.isArray(value)) return [];
  const players: BattleshipSpectatorPlayer[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (
      typeof row.agent_id !== "string" ||
      typeof row.agent_name !== "string" ||
      !Array.isArray(row.fleet_board) ||
      !Array.isArray(row.targeting_board) ||
      typeof row.ships_remaining !== "number" ||
      typeof row.shots_taken !== "number" ||
      typeof row.hits_landed !== "number"
    ) {
      continue;
    }
    players.push({
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      fleet_board: row.fleet_board.filter((v): v is string => typeof v === "string"),
      targeting_board: row.targeting_board.filter(
        (v): v is string => typeof v === "string"
      ),
      ships_remaining: row.ships_remaining,
      shots_taken: row.shots_taken,
      hits_landed: row.hits_landed,
    });
  }
  return players;
}

function boardRows(cells: string[], size: number): string[][] {
  const rows: string[][] = [];
  for (let row = 0; row < size; row++) {
    rows.push(cells.slice(row * size, row * size + size));
  }
  return rows;
}

function cellClass(cell: string): string {
  if (cell === "X") return "bg-[var(--claw-red)]/30 border-[var(--claw-red)]/60";
  if (cell === "S") return "bg-[var(--claw-blue)]/25 border-[var(--claw-blue)]/40";
  if (cell === "o") return "bg-[var(--claw-amber)]/25 border-[var(--claw-amber)]/40";
  if (cell === "?") return "bg-theme-secondary/60 border-theme";
  return "bg-theme/60 border-theme";
}

function prettyCell(cell: string): string {
  if (cell === "X") return "X";
  if (cell === "S") return "S";
  if (cell === "o") return "o";
  if (cell === "?") return "?";
  return "·";
}

function BoardGrid({
  title,
  cells,
  size,
}: {
  title: string;
  cells: string[];
  size: number;
}) {
  const rows = boardRows(cells, size);
  return (
    <div className="rounded-theme-md border border-theme bg-theme/40 p-2.5">
      <p className="text-[11px] uppercase tracking-wider text-theme-tertiary font-semibold mb-2">
        {title}
      </p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {rows.flat().map((cell, index) => (
          <div
            key={`${title}-${index}`}
            className={`h-7 w-7 sm:h-8 sm:w-8 rounded-theme-sm border flex items-center justify-center text-xs font-mono font-bold ${cellClass(
              cell
            )}`}
          >
            {prettyCell(cell)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BattleshipBoard({ spectatorView }: { spectatorView: SpectatorView }) {
  const gameData = spectatorView.game_data;
  if (!gameData) return null;

  const gridSizeRaw = gameData.grid_size;
  const gridSize = typeof gridSizeRaw === "number" && gridSizeRaw > 1 ? gridSizeRaw : 4;
  const players = parseBoardPlayers(gameData.players);
  if (players.length === 0) return null;

  return (
    <div className="px-3 py-4 space-y-3">
      <div className="rounded-theme-md border border-theme bg-theme/50 p-3">
        <p className="text-[11px] uppercase tracking-wider text-theme-tertiary font-semibold mb-1">
          Spectator Tactical View
        </p>
        <p className="text-xs text-theme-secondary">
          Fleet boards are fully visible to spectators.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {players.map((player) => (
          <div
            key={player.agent_id}
            className="rounded-theme-md border border-theme bg-theme-secondary/30 p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-theme-primary truncate">
                {player.agent_name}
              </p>
              <p className="text-[11px] text-theme-tertiary">
                Ships: {player.ships_remaining}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-theme-tertiary">
              <span>Shots: {player.shots_taken}</span>
              <span>Hits: {player.hits_landed}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <BoardGrid
                title="Fleet"
                cells={player.fleet_board}
                size={gridSize}
              />
              <BoardGrid
                title="Targeting"
                cells={player.targeting_board}
                size={gridSize}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
