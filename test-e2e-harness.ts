#!/usr/bin/env bun

import { createAgent, getMatch, updateMatch } from "@/lib/store";
import { getGameTypeDefinition } from "@/engine/registry";
import { handlePhaseDeadlineForMatch } from "@/engine/dispatcher";
import { generateSpectatorToken } from "@/lib/spectator-token";
import { POST as createLobbyRoute } from "@/app/api/v1/lobbies/route";
import { POST as joinLobbyRoute } from "@/app/api/v1/lobbies/[id]/join/route";
import { GET as getLobbyRoute } from "@/app/api/v1/lobbies/[id]/route";
import { GET as getStateRoute } from "@/app/api/v1/matches/[id]/state/route";
import { POST as postActionRoute } from "@/app/api/v1/matches/[id]/action/route";
import { POST as postHumanInputRoute } from "@/app/api/v1/matches/[id]/human-input/route";
import { stopAutofillLoop } from "@/lib/lobby-autofill";
import { stopTimeoutLoop } from "@/lib/turn-timeout";
import { stopPrivateLobbyCleanupLoop } from "@/lib/private-lobby-cleanup";
import type { PlayerView } from "@/types/game";

type HarnessAction = {
  action: "speak" | "vote" | "use_ability";
  message?: string;
  target?: string;
  thinking?: string;
};

type HarnessAgent = {
  name: string;
  apiKey: string;
};

type StrategyProfile = "aggressive" | "balanced" | "defensive";

type ScenarioResult = {
  gameType: string;
  profile: StrategyProfile;
  run: number;
  matchId: string;
  status: "finished" | "in_progress";
  rounds: number;
  winner: string;
  elapsedMs: number;
  steps: number;
};

const RUN_ID = Date.now().toString(36).slice(-5);
const PROFILES: readonly StrategyProfile[] = ["aggressive", "balanced", "defensive"];
const COACHED_GAMES = new Set(["kingdom-operator", "frontier-convoy", "council-of-spies"]);
const TTT_CELLS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"] as const;
const BATTLESHIP_CELLS = [
  "A1",
  "A2",
  "A3",
  "A4",
  "B1",
  "B2",
  "B3",
  "B4",
  "C1",
  "C2",
  "C3",
  "C4",
  "D1",
  "D2",
  "D3",
  "D4",
] as const;
const TTT_WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const GAME_SCENARIOS: Array<{
  id: string;
  tag: string;
  maxSteps: number;
}> = [
  { id: "werewolf", tag: "ww", maxSteps: 260 },
  { id: "tic-tac-toe", tag: "ttt", maxSteps: 40 },
  { id: "rock-paper-scissors", tag: "rps", maxSteps: 70 },
  { id: "battleship", tag: "btl", maxSteps: 120 },
  { id: "kingdom-operator", tag: "kng", maxSteps: 320 },
  { id: "frontier-convoy", tag: "frn", maxSteps: 320 },
  { id: "council-of-spies", tag: "spy", maxSteps: 320 },
];

const PROFILE_SET = new Set<string>(PROFILES);

function hashText(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i++) {
    out = (out * 31 + value.charCodeAt(i)) >>> 0;
  }
  return out;
}

function agentOrdinal(agentName: string): number {
  const match = agentName.match(/(\d+)\D*$/);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return hashText(agentName);
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveSweepProfiles(): StrategyProfile[] {
  const requested = parseCsvEnv(process.env.E2E_PROFILES);
  if (requested.length === 0) {
    return [...PROFILES];
  }

  const valid = requested.filter((profile): profile is StrategyProfile => PROFILE_SET.has(profile));
  if (valid.length === 0) {
    throw new Error(
      `E2E_PROFILES did not include a valid profile. Allowed: ${PROFILES.join(", ")}`
    );
  }
  return valid;
}

function resolveSweepGames() {
  const requested = parseCsvEnv(process.env.E2E_GAMES);
  if (requested.length === 0) return GAME_SCENARIOS;

  const requestedSet = new Set(requested);
  const selected = GAME_SCENARIOS.filter((scenario) => requestedSet.has(scenario.id));
  if (selected.length === 0) {
    throw new Error(
      `E2E_GAMES did not match any scenario. Allowed: ${GAME_SCENARIOS.map((g) => g.id).join(", ")}`
    );
  }
  return selected;
}

function resolveSweepRepeats(): number {
  const raw = process.env.E2E_SWEEP_REPEATS;
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`E2E_SWEEP_REPEATS must be a positive integer, got: ${raw}`);
  }
  return parsed;
}

function authHeaders(apiKey: string, includeJson = false): HeadersInit {
  if (includeJson) {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeHarnessAgentName(tag: string, profile: StrategyProfile, run: number, idx: number): string {
  const profileTag = profile.slice(0, 3);
  return `e2e-${tag}-${profileTag}-${run}-${RUN_ID}-${idx}`.slice(0, 30);
}

async function createHarnessAgents(
  tag: string,
  profile: StrategyProfile,
  run: number,
  count: number
): Promise<HarnessAgent[]> {
  const agents: HarnessAgent[] = [];
  for (let i = 0; i < count; i++) {
    const created = await createAgent(
      makeHarnessAgentName(tag, profile, run, i),
      `E2E harness agent ${tag} ${profile} run ${run} #${i}`
    );
    agents.push({ name: created.name, apiKey: created.apiKey });
  }
  return agents;
}

function parseTttBoard(board: unknown): Array<"X" | "O" | null> {
  if (typeof board !== "string") return Array<null>(9).fill(null);
  const tokens = board
    .replace(/\n/g, " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 9);

  while (tokens.length < 9) tokens.push(".");

  return tokens.map((token) => {
    if (token === "X" || token === "O") return token;
    return null;
  });
}

function chooseTttCell(view: PlayerView): string {
  const board = parseTttBoard(view.private_info["board"]);
  const yourMark = view.private_info["your_mark"] === "O" ? "O" : "X";
  const opponentMark = yourMark === "X" ? "O" : "X";

  const findLineCell = (mark: "X" | "O"): string | null => {
    for (const [a, b, c] of TTT_WIN_LINES) {
      const cells = [board[a], board[b], board[c]];
      const own = cells.filter((cell) => cell === mark).length;
      const emptyIndex = [a, b, c].find((index) => board[index] === null);
      if (own === 2 && emptyIndex !== undefined) {
        return TTT_CELLS[emptyIndex];
      }
    }
    return null;
  };

  return (
    findLineCell(yourMark) ??
    findLineCell(opponentMark) ??
    (board[4] === null ? "B2" : null) ??
    TTT_CELLS.find((cell, index) => board[index] === null) ??
    "A1"
  );
}

function parseBattleshipEnemyBoard(board: unknown): Array<"?" | "X" | "o"> {
  if (typeof board !== "string") return Array<"?" | "X" | "o">(16).fill("?");
  const tokens = board
    .replace(/\n/g, " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 16);

  while (tokens.length < 16) tokens.push("?");

  return tokens.map((token) => {
    if (token === "X" || token === "o") return token;
    return "?";
  });
}

function chooseBattleshipTarget(view: PlayerView, agentName: string): string {
  const board = parseBattleshipEnemyBoard(view.private_info["enemy_board"]);
  const unknown = board
    .map((token, idx) => ({ token, idx }))
    .filter((entry) => entry.token === "?")
    .map((entry) => entry.idx);

  if (unknown.length === 0) return "A1";

  const hitCells = board
    .map((token, idx) => ({ token, idx }))
    .filter((entry) => entry.token === "X")
    .map((entry) => entry.idx);

  const neighbors: number[] = [];
  for (const hit of hitCells) {
    const row = Math.floor(hit / 4);
    const col = hit % 4;
    const candidates = [
      row > 0 ? hit - 4 : null,
      row < 3 ? hit + 4 : null,
      col > 0 ? hit - 1 : null,
      col < 3 ? hit + 1 : null,
    ].filter((v): v is number => v !== null);
    for (const idx of candidates) {
      if (board[idx] === "?") neighbors.push(idx);
    }
  }

  if (neighbors.length > 0) {
    return BATTLESHIP_CELLS[
      neighbors[hashText(`${agentName}:btl:neighbor:${view.round}`) % neighbors.length]
    ];
  }

  const preferred = [5, 6, 9, 10];
  const preferredUnknown = preferred.filter((idx) => board[idx] === "?");
  if (preferredUnknown.length > 0) {
    return BATTLESHIP_CELLS[
      preferredUnknown[hashText(`${agentName}:btl:center:${view.round}`) % preferredUnknown.length]
    ];
  }

  return BATTLESHIP_CELLS[unknown[hashText(`${agentName}:btl:any:${view.round}`) % unknown.length]];
}

function chooseRpsMove(
  view: PlayerView,
  agentName: string,
  profile: StrategyProfile
): "rock" | "paper" | "scissors" {
  const round = typeof view.round === "number" ? view.round : 1;
  const yourScore = Number(view.private_info["your_score"] ?? 0);
  const opponentScore = Number(view.private_info["opponent_score"] ?? 0);
  const cycle = ["rock", "paper", "scissors"] as const;

  if (profile === "aggressive") {
    if (opponentScore > yourScore) {
      return "paper";
    }
    return cycle[(round + hashText(agentName) + 1) % cycle.length];
  }

  if (profile === "defensive") {
    const defensiveCycleEven = ["rock", "paper", "rock", "scissors"] as const;
    const defensiveCycleOdd = ["paper", "rock", "scissors", "paper"] as const;
    const lane = agentOrdinal(agentName) % 2 === 0 ? defensiveCycleEven : defensiveCycleOdd;
    if (yourScore >= opponentScore) {
      return lane[(round + hashText(agentName + "def-hold")) % lane.length];
    }
    return cycle[(round + hashText(agentName + "def-recover")) % cycle.length];
  }

  if (opponentScore > yourScore) {
    return "paper";
  }
  return cycle[(round + hashText(agentName)) % cycle.length];
}

function chooseWerewolfVote(
  view: PlayerView,
  agentName: string,
  profile: StrategyProfile
): string | undefined {
  const alive = view.alive_players.filter((name) => name !== agentName);
  if (alive.length === 0) return undefined;

  if (profile === "aggressive") {
    return alive[hashText(`${agentName}:agg:${view.round}`) % alive.length];
  }
  if (profile === "defensive") {
    return alive[hashText(`${agentName}:def:${Math.max(1, view.round - 1)}`) % alive.length];
  }
  return alive[hashText(agentName + String(view.round)) % alive.length];
}

function chooseWerewolfNightTarget(
  view: PlayerView,
  agentName: string,
  profile: StrategyProfile
): string {
  const alive = view.alive_players;
  const fellowWolvesRaw = view.private_info["fellow_wolves"];
  const fellowWolves = Array.isArray(fellowWolvesRaw)
    ? fellowWolvesRaw.filter((v): v is string => typeof v === "string")
    : [];

  if (view.your_role === "doctor") {
    if (profile === "defensive") {
      return agentName;
    }
    return alive[(hashText(agentName) + view.round) % alive.length] ?? agentName;
  }

  const targets =
    view.your_role === "werewolf"
      ? alive.filter((name) => name !== agentName && !fellowWolves.includes(name))
      : alive.filter((name) => name !== agentName);

  if (targets.length === 0) {
    return alive[0] ?? agentName;
  }

  return targets[hashText(agentName + "night" + view.round) % targets.length] ?? alive[0] ?? agentName;
}

function chooseCoachDirective(
  gameType: string,
  recipient: string,
  rivals: string[],
  profile: StrategyProfile
): string {
  const rival = rivals[0] ?? "";
  if (gameType === "kingdom-operator") {
    if (profile === "aggressive") {
      return rival
        ? `Attack ${rival} this round and prioritize military spending over growth.`
        : "Prioritize military buildup and pressure this round.";
    }
    if (profile === "defensive") {
      return rival
        ? `Fortify borders against ${rival} and invest in science for resilience.`
        : "Focus economy and science, avoid unnecessary conflict this round.";
    }
    return rival
      ? `Attack ${rival} this round and commit military force.`
      : "Focus science and economy this round.";
  }
  if (gameType === "frontier-convoy") {
    if (profile === "aggressive") {
      return rival
        ? `Raid ${rival} now and accept short-term risk for tempo advantage.`
        : "Push expansion and pressure this turn.";
    }
    if (profile === "defensive") {
      return rival
        ? `Avoid direct raids on ${rival}, protect fuel lines, and stabilize routes.`
        : "Prioritize escort reliability and resource stability.";
    }
    return rival
      ? `Raid ${rival} this turn and protect your fuel lines.`
      : "Prioritize escort and resource stability this turn.";
  }
  if (gameType === "council-of-spies") {
    if (profile === "aggressive") {
      return rival
        ? `Sabotage ${rival} aggressively and force intelligence tempo this round.`
        : "Push sabotage operations and gain initiative.";
    }
    if (profile === "defensive") {
      return rival
        ? `Run counterintel first, then quietly pressure ${rival} if safe.`
        : "Gather intel conservatively and harden defenses.";
    }
    return rival
      ? `Sabotage ${rival} this round and avoid overexposure.`
      : "Run counterintel and gather intel conservatively.";
  }
  return `Support ${recipient} with a stable plan this round.`;
}

function chooseStrategicOrder(
  gameType: string,
  view: PlayerView,
  agentName: string,
  profile: StrategyProfile
): string {
  const aliveOthers = view.alive_players.filter((name) => name !== agentName);
  const rival = aliveOthers[hashText(agentName + view.round) % Math.max(1, aliveOthers.length)];

  if (gameType === "kingdom-operator") {
    if (profile === "aggressive") {
      const options = [rival ?? "fortify", "fortify", "science", rival ?? "economy"];
      return options[(view.round + hashText(agentName + "kng:agg")) % options.length] ?? "fortify";
    }
    if (profile === "defensive") {
      const options = ["economy", "science", "science", "fortify"];
      return options[(view.round + hashText(agentName + "kng:def")) % options.length] ?? "science";
    }
    const options = ["economy", "science", "fortify", rival ?? "economy"];
    return options[(view.round + hashText(agentName)) % options.length] ?? "economy";
  }
  if (gameType === "frontier-convoy") {
    if (profile === "aggressive") {
      const options = [rival ?? "rush", "rush", "mine", "escort"];
      return options[(view.round + hashText(agentName + "frn:agg")) % options.length] ?? "rush";
    }
    if (profile === "defensive") {
      const options = ["mine", "escort", "research", "escort"];
      return options[(view.round + hashText(agentName + "frn:def")) % options.length] ?? "escort";
    }
    const options = ["mine", "research", "escort", "rush", rival ?? "mine"];
    return options[(view.round + hashText(agentName + "frontier")) % options.length] ?? "mine";
  }
  if (gameType === "council-of-spies") {
    if (profile === "aggressive") {
      const options = [rival ?? "gather_intel", "gather_intel", rival ?? "gather_intel", "research"];
      return options[(view.round + hashText(agentName + "spy:agg")) % options.length] ?? "gather_intel";
    }
    if (profile === "defensive") {
      const options = ["counterintel", "gather_intel", "research", "counterintel"];
      return options[(view.round + hashText(agentName + "spy:def")) % options.length] ?? "counterintel";
    }
    const options = ["gather_intel", "research", "counterintel", rival ?? "gather_intel"];
    return options[(view.round + hashText(agentName + "spies")) % options.length] ?? "gather_intel";
  }
  return "economy";
}

function chooseAction(
  gameType: string,
  view: PlayerView,
  agentName: string,
  profile: StrategyProfile
): HarnessAction {
  const actions = view.available_actions;

  if (actions.includes("use_ability")) {
    if (gameType === "tic-tac-toe") {
      return {
        action: "use_ability",
        target: chooseTttCell(view),
        thinking: "E2E harness: tactical move selection",
      };
    }

    if (gameType === "rock-paper-scissors") {
      return {
        action: "use_ability",
        target: chooseRpsMove(view, agentName, profile),
        thinking: `E2E harness: adaptive throw (${profile})`,
      };
    }

    if (gameType === "battleship") {
      return {
        action: "use_ability",
        target: chooseBattleshipTarget(view, agentName),
        message: "Salvo away.",
        thinking: `E2E harness: battleship targeting (${profile})`,
      };
    }

    if (gameType === "werewolf") {
      return {
        action: "use_ability",
        target: chooseWerewolfNightTarget(view, agentName, profile),
        thinking: `E2E harness: role-aware night target (${profile})`,
      };
    }

    return {
      action: "use_ability",
      target: chooseStrategicOrder(gameType, view, agentName, profile),
      message: "Executing this round's plan.",
      thinking: `E2E harness: strategic order dispatch (${profile})`,
    };
  }

  if (actions.includes("vote")) {
    return {
      action: "vote",
      target: chooseWerewolfVote(view, agentName, profile),
      thinking: `E2E harness: weighted vote (${profile})`,
    };
  }

  if (actions.includes("speak")) {
    const rival = view.alive_players.find((name) => name !== agentName);
    const messageByProfile =
      profile === "aggressive"
        ? rival
          ? `I'm ready to pressure ${rival} and force a decision.`
          : "I'm pushing proactive play this phase."
        : profile === "defensive"
          ? rival
            ? `I prefer caution; let's gather more info on ${rival}.`
            : "I'm favoring stable, low-risk play."
          : rival
            ? `I want clearer reads on ${rival} before we commit.`
            : "I'm sharing a neutral status update.";
    return {
      action: "speak",
      message: messageByProfile,
      thinking: `E2E harness: phase-appropriate discussion (${profile})`,
    };
  }

  return {
    action: "speak",
    message: "No-op",
    thinking: "E2E harness fallback",
  };
}

async function createPrivateLobby(
  gameType: string,
  creator: HarnessAgent
): Promise<{ lobbyId: string; inviteCode: string }> {
  const createRes = await createLobbyRoute(
    new Request("http://localhost/api/v1/lobbies", {
      method: "POST",
      headers: authHeaders(creator.apiKey, true),
      body: JSON.stringify({ game_type: gameType, is_private: true }),
    })
  );

  const createJson = (await createRes.json()) as {
    success?: boolean;
    error?: string;
    lobby?: { id: string; invite_code?: string };
  };

  if (!createRes.ok || !createJson.lobby?.id || !createJson.lobby.invite_code) {
    throw new Error(
      `Failed to create lobby for ${gameType}: ${createJson.error ?? createRes.status}`
    );
  }

  return { lobbyId: createJson.lobby.id, inviteCode: createJson.lobby.invite_code };
}

async function joinLobby(
  lobbyIdOrCode: string,
  joiner: HarnessAgent,
  inviteCode?: string
): Promise<{ matchId?: string }> {
  const joinRes = await joinLobbyRoute(
    new Request(`http://localhost/api/v1/lobbies/${lobbyIdOrCode}/join`, {
      method: "POST",
      headers: authHeaders(joiner.apiKey, !!inviteCode),
      body: inviteCode ? JSON.stringify({ invite_code: inviteCode }) : undefined,
    }),
    { params: Promise.resolve({ id: lobbyIdOrCode }) }
  );

  const joinJson = (await joinRes.json()) as {
    success?: boolean;
    error?: string;
    lobby?: { match_id?: string };
  };

  if (!joinRes.ok) {
    throw new Error(`Join failed (${lobbyIdOrCode}): ${joinJson.error ?? joinRes.status}`);
  }

  return { matchId: joinJson.lobby?.match_id };
}

async function getLobbyMatchId(lobbyId: string, inviteCode: string): Promise<string | undefined> {
  const res = await getLobbyRoute(
    new Request(
      `http://localhost/api/v1/lobbies/${lobbyId}?invite_code=${encodeURIComponent(inviteCode)}`
    ),
    { params: Promise.resolve({ id: lobbyId }) }
  );

  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    lobby?: { match_id?: string };
  };

  if (!res.ok) {
    throw new Error(`Failed to fetch lobby status: ${json.error ?? res.status}`);
  }

  return json.lobby?.match_id;
}

async function getPlayerView(matchId: string, agent: HarnessAgent): Promise<PlayerView> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await getStateRoute(
      new Request(`http://localhost/api/v1/matches/${matchId}/state`, {
        method: "GET",
        headers: authHeaders(agent.apiKey),
      }),
      { params: Promise.resolve({ id: matchId }) }
    );

    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      state?: PlayerView;
    };

    if (res.ok && json.state) {
      return json.state;
    }

    if (res.status === 429 || json.error?.toLowerCase().includes("rate limit")) {
      await sleep(30 * (attempt + 1));
      continue;
    }

    throw new Error(`Failed state fetch: ${json.error ?? res.status}`);
  }
  throw new Error("Failed state fetch: exhausted retries after rate limiting");
}

async function submitAction(matchId: string, agent: HarnessAgent, action: HarnessAction): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await postActionRoute(
      new Request(`http://localhost/api/v1/matches/${matchId}/action`, {
        method: "POST",
        headers: authHeaders(agent.apiKey, true),
        body: JSON.stringify(action),
      }),
      { params: Promise.resolve({ id: matchId }) }
    );

    if (res.ok) return true;
    const json = (await res.json()) as { error?: string };
    const error = (json.error ?? "").toLowerCase();
    const retryable =
      error.includes("not your turn") || error.includes("poll again") || error.includes("rate limit");
    if (retryable) {
      if (error.includes("rate limit")) {
        await sleep(30 * (attempt + 1));
        continue;
      }
      return false;
    }
    return false;
  }
  return false;
}

async function submitCoachDirective(
  matchId: string,
  spectatorToken: string,
  playerName: string,
  directive: string
): Promise<void> {
  const res = await postHumanInputRoute(
    new Request(
      `http://localhost/api/v1/matches/${matchId}/human-input?spectator_token=${encodeURIComponent(
        spectatorToken
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: playerName,
          directive,
        }),
      }
    ),
    { params: Promise.resolve({ id: matchId }) }
  );

  if (!res.ok) {
    const json = (await res.json()) as { error?: string };
    const error = (json.error ?? "").toLowerCase();
    if (res.status === 429 || error.includes("too many human input requests")) {
      // Human input is advisory; allow fallback defaults when throttled.
      await sleep(25);
      return;
    }
    throw new Error(`Coach directive failed: ${json.error ?? res.status}`);
  }
}

async function forceAdvanceCoachedPhase(matchId: string): Promise<boolean> {
  const match = getMatch(matchId);
  if (!match) return false;

  const advanced = handlePhaseDeadlineForMatch(
    {
      ...match,
      turnStartedAt: Date.now() - 120_000,
    },
    Date.now()
  );

  if (!advanced) return false;
  updateMatch(matchId, advanced);
  return true;
}

async function runScenario(
  gameType: string,
  tag: string,
  maxSteps: number,
  profile: StrategyProfile,
  run: number
): Promise<ScenarioResult> {
  const definition = getGameTypeDefinition(gameType);
  if (!definition) throw new Error(`Unknown game type ${gameType}`);

  const agents = await createHarnessAgents(tag, profile, run, definition.min_players);
  const startedAt = Date.now();

  const { lobbyId, inviteCode } = await createPrivateLobby(gameType, agents[0]);

  let matchId: string | undefined;
  for (let i = 1; i < agents.length; i++) {
    const joined = await joinLobby(lobbyId, agents[i], inviteCode);
    if (joined.matchId) matchId = joined.matchId;
  }

  if (!matchId) {
    matchId = await getLobbyMatchId(lobbyId, inviteCode);
  }

  if (!matchId) {
    throw new Error(`Failed to start match for ${gameType}`);
  }

  const spectatorToken = generateSpectatorToken(matchId);
  const coachedPhaseSeen = new Set<string>();

  let steps = 0;

  for (; steps < maxSteps; steps++) {
    const match = getMatch(matchId);
    if (!match) throw new Error(`Match disappeared: ${matchId}`);
    if (match.status === "finished") {
      return {
        gameType,
        profile,
        run,
        matchId,
        status: "finished",
        rounds: match.round,
        winner: match.winner?.team ?? "unknown",
        elapsedMs: Date.now() - startedAt,
        steps,
      };
    }

    if (COACHED_GAMES.has(gameType) && match.phase === "human_briefing") {
      const phaseKey = `${match.round}:${match.phase}`;
      if (!coachedPhaseSeen.has(phaseKey)) {
        const alive = match.players.filter((p) => p.alive).map((p) => p.agentName);
        const recipient = alive[0];
        if (recipient) {
          const rivals = alive.filter((name) => name !== recipient);
          await submitCoachDirective(
            matchId,
            spectatorToken,
            recipient,
            chooseCoachDirective(gameType, recipient, rivals, profile)
          );
        }
        coachedPhaseSeen.add(phaseKey);
      }

      const advanced = await forceAdvanceCoachedPhase(matchId);
      if (!advanced) {
        throw new Error(`Could not advance coached phase for ${gameType}`);
      }
      continue;
    }

    let actionsSubmitted = 0;

    for (const agent of agents) {
      const view = await getPlayerView(matchId, agent);
      if (view.status === "finished") {
        const finalMatch = getMatch(matchId);
        return {
          gameType,
          profile,
          run,
          matchId,
          status: "finished",
          rounds: finalMatch?.round ?? view.round,
          winner: finalMatch?.winner?.team ?? view.winner?.team ?? "unknown",
          elapsedMs: Date.now() - startedAt,
          steps,
        };
      }
      if (!view.your_turn || view.available_actions.length === 0) continue;

      const action = chooseAction(gameType, view, agent.name, profile);
      const ok = await submitAction(matchId, agent, action);
      if (ok) actionsSubmitted++;
    }

    if (actionsSubmitted === 0) {
      // Keep harness moving for no-action phases.
      await forceAdvanceCoachedPhase(matchId);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  const match = getMatch(matchId);
  return {
    gameType,
    profile,
    run,
    matchId,
    status: match?.status === "finished" ? "finished" : "in_progress",
    rounds: match?.round ?? 0,
    winner: match?.winner?.team ?? "unknown",
    elapsedMs: Date.now() - startedAt,
    steps,
  };
}

async function main() {
  stopAutofillLoop();
  stopTimeoutLoop();
  stopPrivateLobbyCleanupLoop();

  const profiles = resolveSweepProfiles();
  const scenarios = resolveSweepGames();
  const repeats = resolveSweepRepeats();
  const results: ScenarioResult[] = [];

  console.log(
    `[Harness] Sweep configuration: games=${scenarios.map((s) => s.id).join(", ")} profiles=${profiles.join(
      ", "
    )} repeats=${repeats}`
  );

  for (let run = 1; run <= repeats; run++) {
    for (const profile of profiles) {
      for (const scenario of scenarios) {
        console.log(`\n[Harness] Running ${scenario.id} profile=${profile} run=${run}...`);
        const result = await runScenario(scenario.id, scenario.tag, scenario.maxSteps, profile, run);
        results.push(result);
        console.log(
          `[Harness] ${scenario.id} profile=${profile} run=${run} -> ${result.status}, rounds=${result.rounds}, winner=${result.winner}, steps=${result.steps}, elapsed=${result.elapsedMs}ms`
        );
      }
    }
  }

  console.log("\n=== E2E Harness Summary ===");
  for (const result of results) {
    console.log(
      `${result.gameType.padEnd(20)} profile=${result.profile.padEnd(10)} run=${String(result.run).padEnd(
        2
      )} status=${result.status.padEnd(11)} rounds=${String(result.rounds).padEnd(4)} winner=${result.winner.padEnd(
        12
      )} steps=${String(result.steps).padEnd(4)} match=${result.matchId}`
    );
  }

  console.log("\n=== Sweep Matrix ===");
  for (const scenario of scenarios) {
    const row: string[] = [];
    for (const profile of profiles) {
      const slice = results.filter((r) => r.gameType === scenario.id && r.profile === profile);
      const finished = slice.filter((r) => r.status === "finished").length;
      row.push(`${profile}:${finished}/${slice.length}`);
    }
    console.log(`${scenario.id.padEnd(20)} ${row.join(" | ")}`);
  }

  const unfinished = results.filter((result) => result.status !== "finished");
  if (unfinished.length > 0) {
    throw new Error(
      `E2E harness detected unfinished matches: ${unfinished
        .map((result) => `${result.gameType}:${result.profile}:run${result.run}`)
        .join(", ")}`
    );
  }

  console.log("\nAll E2E scenarios finished successfully.");
}

main()
  .catch((err) => {
    console.error("\nE2E harness failed:", err);
    process.exit(1);
  })
  .finally(() => {
    stopAutofillLoop();
    stopTimeoutLoop();
    stopPrivateLobbyCleanupLoop();
  });
