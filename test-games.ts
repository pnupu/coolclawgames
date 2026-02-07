#!/usr/bin/env bun
// ============================================================
// Multi-Game Regression Tests
// Covers registry, existing games, and new coach-window games.
// ============================================================

import {
  applyHumanDirectiveForMatch,
  canAcceptHumanInputForMatch,
  createMatchForGame,
  getPlayerViewForMatch,
  getSpectatorViewForMatch,
  handlePhaseDeadlineForMatch,
  handleTimeoutForMatch,
  processActionForMatch,
} from "@/engine/dispatcher";
import { getAllGameTypes } from "@/engine/registry";
import {
  applyHumanDirectiveToMatch,
  canAcceptHumanInput,
} from "@/engine/kingdom-operator";
import { generateSpectatorToken } from "@/lib/spectator-token";
import { createMatch, getMatch } from "@/lib/store";
import { POST as submitHumanInput } from "@/app/api/v1/matches/[id]/human-input/route";
import type { GameState, PlayerView } from "@/types/game";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n═══ ${title} ═══`);
}

function expectThrow(fn: () => void, label: string, contains?: string) {
  try {
    fn();
    assert(false, `${label} (should throw)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (contains) {
      assert(msg.includes(contains), `${label} (threw "${msg}")`);
    } else {
      assert(true, `${label} (threw "${msg}")`);
    }
  }
}

function getHumanCadence(view: PlayerView, fallback: number): number {
  const maybeTiming = view.private_info["timing"];
  if (
    maybeTiming &&
    typeof maybeTiming === "object" &&
    "human_input_every_n_rounds" in maybeTiming
  ) {
    const cadence = (maybeTiming as { human_input_every_n_rounds?: unknown })
      .human_input_every_n_rounds;
    if (typeof cadence === "number" && cadence > 0) {
      return cadence;
    }
  }
  return fallback;
}

function battleshipCell(index: number): string {
  const row = Math.floor(index / 4);
  const col = (index % 4) + 1;
  return `${String.fromCharCode("A".charCodeAt(0) + row)}${col}`;
}

function playFullKingdomRound(state: GameState): GameState {
  if (state.phase !== "diplomacy") {
    throw new Error(`Expected diplomacy phase, got ${state.phase}`);
  }
  const alive = state.players.filter((p) => p.alive).map((p) => p.agentId);
  let next = state;
  for (const id of alive) {
    next = processActionForMatch(next, id, {
      action: "speak",
      message: `Diplomacy by ${id}`,
    });
  }

  if (next.phase === "human_briefing") return next;
  if (next.phase !== "command") {
    throw new Error(`Expected command phase, got ${next.phase}`);
  }

  const commandActors = next.players.filter((p) => p.alive).map((p) => p.agentId);
  for (const id of commandActors) {
    next = processActionForMatch(next, id, {
      action: "use_ability",
      target: "economy",
      message: "Default economy order",
    });
  }
  return next;
}

function playFullFrontierRound(state: GameState): GameState {
  if (state.phase !== "briefing") {
    throw new Error(`Expected frontier briefing phase, got ${state.phase}`);
  }

  let next = state;
  const alive = next.players.filter((p) => p.alive).map((p) => p.agentId);
  for (const id of alive) {
    next = processActionForMatch(next, id, {
      action: "speak",
      message: `Frontier briefing ${id}`,
    });
  }

  if (next.phase === "human_briefing") return next;
  if (next.phase !== "operations") {
    throw new Error(`Expected frontier operations phase, got ${next.phase}`);
  }

  const operators = next.players.filter((p) => p.alive).map((p) => p.agentId);
  for (const id of operators) {
    next = processActionForMatch(next, id, {
      action: "use_ability",
      target: "mine",
      message: "Default mine order",
    });
  }

  return next;
}

function playFullSpiesRound(state: GameState): GameState {
  if (state.phase !== "briefing") {
    throw new Error(`Expected spies briefing phase, got ${state.phase}`);
  }

  let next = state;
  const alive = next.players.filter((p) => p.alive).map((p) => p.agentId);
  for (const id of alive) {
    next = processActionForMatch(next, id, {
      action: "speak",
      message: `Spies briefing ${id}`,
    });
  }

  if (next.phase === "human_briefing") return next;
  if (next.phase !== "operations") {
    throw new Error(`Expected spies operations phase, got ${next.phase}`);
  }

  const operators = next.players.filter((p) => p.alive).map((p) => p.agentId);
  for (const id of operators) {
    next = processActionForMatch(next, id, {
      action: "use_ability",
      target: "gather_intel",
      message: "Default intel order",
    });
  }

  return next;
}

async function main() {
  // ── 1. Registry ─────────────────────────────────────────
  section("1. Registry");
  const gameIds = getAllGameTypes().map((g) => g.id);
  assert(gameIds.includes("werewolf"), "contains werewolf");
  assert(gameIds.includes("tic-tac-toe"), "contains tic-tac-toe");
  assert(gameIds.includes("rock-paper-scissors"), "contains rock-paper-scissors");
  assert(gameIds.includes("battleship"), "contains battleship");
  assert(gameIds.includes("kingdom-operator"), "contains kingdom-operator");
  assert(gameIds.includes("frontier-convoy"), "contains frontier-convoy");
  assert(gameIds.includes("council-of-spies"), "contains council-of-spies");

  // ── 2. Tic Tac Toe ──────────────────────────────────────
  section("2. Tic Tac Toe");
  const tPlayers = [
    { agentId: "t1", agentName: "Xavier" },
    { agentId: "t2", agentName: "Opal" },
  ];
  let ttt = createMatchForGame("tic-tac-toe", "ttt-test-1", tPlayers, { best_of: 1 });
  const tView1 = getPlayerViewForMatch(ttt, "t1");
  assert(tView1.your_turn, "X player starts first");
  assert(tView1.available_actions.includes("speak"), "X can speak before moving");
  assert(tView1.available_actions.includes("use_ability"), "X has move action");

  ttt = processActionForMatch(ttt, "t1", {
    action: "speak",
    message: "Center pressure starts now.",
  });
  assert(
    ttt.events.some((e) => e.type === "player_speak" && e.actor === "t1"),
    "tic-tac-toe records speak event"
  );
  const tttSpec = getSpectatorViewForMatch(ttt, true);
  assert(
    tttSpec.events.some(
      (e) => e.type === "player_speak" && e.message.includes("Center pressure")
    ),
    "tic-tac-toe speak is visible to spectators"
  );
  expectThrow(
    () =>
      processActionForMatch(ttt, "t1", {
        action: "speak",
        message: "Second message same turn",
      }),
    "rejects second tic-tac-toe speak in same turn",
    "already spoke"
  );

  expectThrow(
    () =>
      processActionForMatch(ttt, "t2", {
        action: "use_ability",
        target: "A1",
      }),
    "rejects move out of turn",
    "not your turn"
  );

  ttt = processActionForMatch(ttt, "t1", { action: "use_ability", target: "A1" });
  ttt = processActionForMatch(ttt, "t2", { action: "use_ability", target: "B1" });
  ttt = processActionForMatch(ttt, "t1", { action: "use_ability", target: "A2" });
  ttt = processActionForMatch(ttt, "t2", { action: "use_ability", target: "B2" });
  ttt = processActionForMatch(ttt, "t1", { action: "use_ability", target: "A3" });

  assert(ttt.status === "finished", "tic-tac-toe finishes on win line");
  assert(ttt.winner?.team === "X", "X wins with A1-A2-A3");

  const timeoutState = createMatchForGame("tic-tac-toe", "ttt-timeout", tPlayers, {
    best_of: 1,
  });
  const timeoutMoved = handleTimeoutForMatch(timeoutState, "t1");
  assert(
    timeoutMoved.events.some((e) => e.type === "player_ability"),
    "timeout auto-move creates move event"
  );

  // ── 3. Rock Paper Scissors ─────────────────────────────
  section("3. Rock Paper Scissors");
  const rPlayers = [
    { agentId: "r1", agentName: "Rocky" },
    { agentId: "r2", agentName: "Scissorina" },
  ];
  let rps = createMatchForGame("rock-paper-scissors", "rps-test-1", rPlayers);

  rps = processActionForMatch(rps, "r1", {
    action: "speak",
    message: "I will absolutely play rock.",
  });
  expectThrow(
    () =>
      processActionForMatch(rps, "r1", {
        action: "speak",
        message: "Double bluff spam",
      }),
    "rejects second rps speak in same round",
    "already spoke"
  );
  const rpsSpec = getSpectatorViewForMatch(rps, true);
  assert(
    rpsSpec.events.some((e) => e.type === "player_speak"),
    "rps speak is visible to spectators"
  );
  rps = processActionForMatch(rps, "r1", { action: "use_ability", target: "rock" });
  rps = processActionForMatch(rps, "r2", { action: "use_ability", target: "scissors" });

  assert(rps.round === 2, "round advances after both throws");
  const scoreMessage = rps.events[rps.events.length - 1]?.message ?? "";
  assert(scoreMessage.includes("Score:"), "scoreboard message emitted");
  const rpsAfterRoundSpec = getSpectatorViewForMatch(rps, true);
  const rpsGameData = rpsAfterRoundSpec.game_data as
    | {
        target_wins?: number;
        scores_by_name?: Record<string, number>;
        round_history?: Array<Record<string, unknown>>;
      }
    | undefined;
  assert(
    typeof rpsGameData?.target_wins === "number" && rpsGameData.target_wins === 4,
    "rps spectator game_data includes target wins"
  );
  assert(
    Boolean(rpsGameData?.scores_by_name?.Rocky === 1),
    "rps spectator game_data includes player scores"
  );
  assert(
    Array.isArray(rpsGameData?.round_history) &&
      (rpsGameData?.round_history.length ?? 0) >= 1,
    "rps spectator game_data includes round history"
  );

  for (let i = 0; i < 3 && rps.status === "in_progress"; i++) {
    rps = processActionForMatch(rps, "r1", { action: "use_ability", target: "rock" });
    rps = processActionForMatch(rps, "r2", { action: "use_ability", target: "scissors" });
  }
  assert(rps.status === "finished", "rps finishes when target wins reached");
  assert(rps.winner?.winners.includes("r1") ?? false, "r1 is winner");

  const rTimeout = createMatchForGame("rock-paper-scissors", "rps-timeout", rPlayers);
  const rTimeoutState = handleTimeoutForMatch(rTimeout, "r1");
  assert(
    rTimeoutState.events.some((e) => e.type === "player_ability"),
    "rps timeout locks random throw"
  );

  // ── 4. Battleship ─────────────────────────────────
  section("4. Battleship");
  const bPlayers = [
    { agentId: "b1", agentName: "Admiral Blue" },
    { agentId: "b2", agentName: "Commodore Red" },
  ];
  let battleship = createMatchForGame("battleship", "battleship-test-1", bPlayers);
  assert(battleship.phase === "salvo", "battleship starts in salvo phase");

  const bView = getPlayerViewForMatch(battleship, "b1");
  assert(bView.your_turn, "battleship first player has turn");
  assert(bView.available_actions.includes("speak"), "battleship supports speak action");
  assert(bView.available_actions.includes("use_ability"), "battleship supports firing action");

  battleship = processActionForMatch(battleship, "b1", {
    action: "speak",
    message: "You won't find my fleet.",
  });
  assert(
    battleship.events.some((e) => e.type === "player_speak" && e.actor === "b1"),
    "battleship logs speak event"
  );
  const battleshipSpec = getSpectatorViewForMatch(battleship, true);
  assert(
    battleshipSpec.events.some(
      (e) => e.type === "player_speak" && e.message.includes("won't find my fleet")
    ),
    "battleship speak is visible to spectators"
  );
  const battleshipGameData = battleshipSpec.game_data as
    | {
        grid_size?: number;
        players?: Array<{
          fleet_board?: string[];
          targeting_board?: string[];
        }>;
      }
    | undefined;
  assert(battleshipGameData?.grid_size === 4, "battleship spectator game_data has grid size");
  assert(
    (battleshipGameData?.players?.length ?? 0) === 2,
    "battleship spectator game_data includes both players"
  );
  assert(
    (battleshipGameData?.players?.[0]?.fleet_board?.length ?? 0) === 16,
    "battleship spectator game_data includes fleet board cells"
  );
  assert(
    (battleshipGameData?.players?.[0]?.targeting_board?.length ?? 0) === 16,
    "battleship spectator game_data includes targeting board cells"
  );

  const initialShips = ((battleship.phaseData as {
    shipCellsByPlayer: Record<string, number[]>;
  }).shipCellsByPlayer["b2"] ?? []).map((idx) => battleshipCell(idx));
  let sinkIdx = 0;
  let guard = 0;

  while (battleship.status === "in_progress" && guard < 20) {
    const current = battleship.turnOrder[battleship.currentTurnIndex];
    if (current === "b1") {
      const target = initialShips[sinkIdx];
      sinkIdx++;
      if (!target) break;
      battleship = processActionForMatch(battleship, "b1", {
        action: "use_ability",
        target,
      });
    } else {
      const shotsByB2 = new Set(
        ((battleship.phaseData as { shotsByPlayer: Record<string, number[]> }).shotsByPlayer[
          "b2"
        ] ?? [])
      );
      const idx = [...Array(16).keys()].find((candidate) => !shotsByB2.has(candidate)) ?? 0;
      battleship = processActionForMatch(battleship, "b2", {
        action: "use_ability",
        target: battleshipCell(idx),
      });
    }
    guard++;
  }

  assert(battleship.status === "finished", "battleship reaches a finished state");
  assert(battleship.winner?.winners.includes("b1") ?? false, "battleship winner is b1");
  assert(
    battleship.events.some(
      (e) => e.type === "player_ability" && e.message.includes("HIT")
    ),
    "battleship hit events are emitted"
  );
  const finishedBattleshipSpec = getSpectatorViewForMatch(battleship, true);
  assert(
    Array.isArray((finishedBattleshipSpec.game_data as { players?: unknown[] } | undefined)?.players),
    "battleship spectator game_data persists after finish"
  );

  // ── 5. Kingdom Operator ───────────────────────────
  section("5. Kingdom Operator");
  const kPlayers = [
    { agentId: "k1", agentName: "Atlas" },
    { agentId: "k2", agentName: "Boreal" },
    { agentId: "k3", agentName: "Cygnus" },
  ];
  let kingdom = createMatchForGame("kingdom-operator", "kingdom-test-1", kPlayers);
  assert(kingdom.phase === "diplomacy", "kingdom starts in diplomacy");

  kingdom = processActionForMatch(kingdom, "k1", {
    action: "speak",
    target: "Boreal",
    message: "Secret pact between us",
  });
  const viewRecipient = getPlayerViewForMatch(kingdom, "k2");
  const viewOther = getPlayerViewForMatch(kingdom, "k3");
  const recipientSeesWhisper = viewRecipient.messages_since_last_poll.some((m) =>
    m.message.includes("whispered to Boreal")
  );
  const otherSeesWhisper = viewOther.messages_since_last_poll.some((m) =>
    m.message.includes("whispered to Boreal")
  );
  assert(recipientSeesWhisper, "whisper visible to recipient");
  assert(!otherSeesWhisper, "whisper hidden from non-recipient");

  kingdom = processActionForMatch(kingdom, "k2", { action: "speak", message: "ack" });
  kingdom = processActionForMatch(kingdom, "k3", { action: "speak", message: "ack" });
  for (const id of ["k1", "k2", "k3"]) {
    kingdom = processActionForMatch(kingdom, id, {
      action: "use_ability",
      target: "economy",
    });
  }
  kingdom = playFullKingdomRound(kingdom);
  assert(kingdom.phase === "diplomacy", "round 2 returns to diplomacy");
  assert(kingdom.round === 3, "advanced to round 3");

  for (const id of ["k1", "k2", "k3"]) {
    kingdom = processActionForMatch(kingdom, id, {
      action: "speak",
      message: `round3 speak ${id}`,
    });
  }
  assert(kingdom.phase === "human_briefing", "human briefing opens on configured cadence");
  assert(canAcceptHumanInput(kingdom), "can accept human input in human_briefing");

  kingdom = applyHumanDirectiveToMatch(
    kingdom,
    "Atlas",
    "Attack Boreal with full force"
  );
  const directiveEventExists = kingdom.events.some((e) =>
    e.message.includes("Human directive: Attack Boreal")
  );
  assert(directiveEventExists, "human directive is recorded as private event");

  const advanced = handlePhaseDeadlineForMatch({
    ...kingdom,
    turnStartedAt: Date.now() - 120_000,
  });
  assert(advanced !== null, "phase deadline advances kingdom state");
  const commandState = advanced!;
  assert(commandState.phase === "command", "human briefing advances to command by deadline");

  const beforeCount = commandState.events.length;
  const afterForced = processActionForMatch(commandState, "k1", {
    action: "use_ability",
    target: "economy",
    message: "ignore this target",
  });
  const forcedEvent = afterForced.events[beforeCount];
  assert(
    forcedEvent.message.includes("campaign against Boreal"),
    "human directive enforces war target"
  );
  assert(
    forcedEvent.message.includes("human directive enforced"),
    "forced order message is explicit"
  );

  // ── 6. Frontier Convoy ───────────────────────────
  section("6. Frontier Convoy");
  const fPlayers = [
    { agentId: "f1", agentName: "Alpha" },
    { agentId: "f2", agentName: "Beta" },
    { agentId: "f3", agentName: "Gamma" },
  ];
  let frontier = createMatchForGame("frontier-convoy", "frontier-test-1", fPlayers);
  assert(frontier.phase === "briefing", "frontier starts in briefing");

  const frontierTimeout = handleTimeoutForMatch(frontier, "f1");
  assert(
    frontierTimeout.events.some(
      (e) => e.type === "player_silent" && e.actor === "f1"
    ),
    "frontier timeout marks missing briefing"
  );

  frontier = processActionForMatch(frontier, "f1", {
    action: "speak",
    target: "Beta",
    message: "Do not raid me this round",
  });
  const frontierRecipient = getPlayerViewForMatch(frontier, "f2");
  const frontierOther = getPlayerViewForMatch(frontier, "f3");
  assert(
    frontierRecipient.messages_since_last_poll.some((m) =>
      m.message.includes("whispered route intel to Beta")
    ),
    "frontier whisper visible to recipient"
  );
  assert(
    !frontierOther.messages_since_last_poll.some((m) =>
      m.message.includes("whispered route intel to Beta")
    ),
    "frontier whisper hidden from non-recipient"
  );

  frontier = processActionForMatch(frontier, "f2", {
    action: "speak",
    message: "ack",
  });
  frontier = processActionForMatch(frontier, "f3", {
    action: "speak",
    message: "ack",
  });
  if (frontier.phase === "operations") {
    for (const id of ["f1", "f2", "f3"]) {
      frontier = processActionForMatch(frontier, id, {
        action: "use_ability",
        target: "mine",
      });
    }
  }
  assert(frontier.phase === "briefing", "frontier returns to briefing next round");

  const frontierCadence = getHumanCadence(getPlayerViewForMatch(frontier, "f1"), 4);
  while (frontier.round < frontierCadence) {
    frontier = playFullFrontierRound(frontier);
    if (frontier.phase === "human_briefing") break;
  }
  if (frontier.phase !== "human_briefing") {
    for (const id of ["f1", "f2", "f3"]) {
      frontier = processActionForMatch(frontier, id, {
        action: "speak",
        message: `cadence trigger ${id}`,
      });
    }
  }
  assert(frontier.phase === "human_briefing", "frontier opens human briefing on cadence");
  assert(
    canAcceptHumanInputForMatch(frontier),
    "frontier allows human input in briefing"
  );

  frontier = applyHumanDirectiveForMatch(frontier, "Alpha", "Raid Beta this turn");
  assert(
    frontier.events.some((e) => e.message.includes("Human directive: Raid Beta")),
    "frontier directive recorded"
  );

  const frontierAdvanced = handlePhaseDeadlineForMatch({
    ...frontier,
    turnStartedAt: Date.now() - 120_000,
  });
  assert(frontierAdvanced !== null, "frontier phase deadline advances");
  assert(
    frontierAdvanced?.phase === "operations",
    "frontier human briefing advances to operations by deadline"
  );

  const frontierBeforeCount = frontierAdvanced!.events.length;
  const frontierForced = processActionForMatch(frontierAdvanced!, "f1", {
    action: "use_ability",
    target: "mine",
    message: "ignore target",
  });
  const frontierForcedEvent = frontierForced.events[frontierBeforeCount];
  assert(
    frontierForcedEvent.message.includes("raid against Beta"),
    "frontier human directive enforces raid target"
  );
  assert(
    frontierForcedEvent.message.includes("human directive enforced"),
    "frontier forced order is explicit"
  );

  // ── 7. Council Of Spies ───────────────────────────
  section("7. Council Of Spies");
  const sPlayers = [
    { agentId: "s1", agentName: "Obsidian" },
    { agentId: "s2", agentName: "Cipher" },
    { agentId: "s3", agentName: "Ghost" },
  ];
  let spies = createMatchForGame("council-of-spies", "spies-test-1", sPlayers);
  assert(spies.phase === "briefing", "spies starts in briefing");

  spies = processActionForMatch(spies, "s1", {
    action: "speak",
    target: "Cipher",
    message: "Temporary truce",
  });
  const spiesRecipient = getPlayerViewForMatch(spies, "s2");
  const spiesOther = getPlayerViewForMatch(spies, "s3");
  assert(
    spiesRecipient.messages_since_last_poll.some((m) =>
      m.message.includes("covert whisper to Cipher")
    ),
    "spies whisper visible to recipient"
  );
  assert(
    !spiesOther.messages_since_last_poll.some((m) =>
      m.message.includes("covert whisper to Cipher")
    ),
    "spies whisper hidden from non-recipient"
  );

  spies = processActionForMatch(spies, "s2", { action: "speak", message: "ack" });
  spies = processActionForMatch(spies, "s3", { action: "speak", message: "ack" });
  if (spies.phase === "operations") {
    const spiesTimeout = handleTimeoutForMatch(spies, "s1");
    assert(
      spiesTimeout.events.some(
        (e) => e.type === "player_ability" && e.actor === "s1"
      ),
      "spies timeout injects default operation"
    );
    spies = spiesTimeout;
    for (const id of ["s2", "s3"]) {
      spies = processActionForMatch(spies, id, {
        action: "use_ability",
        target: "gather_intel",
      });
    }
  }
  assert(spies.phase === "briefing", "spies returns to briefing next round");

  const spiesCadence = getHumanCadence(getPlayerViewForMatch(spies, "s1"), 3);
  while (spies.round < spiesCadence) {
    spies = playFullSpiesRound(spies);
    if (spies.phase === "human_briefing") break;
  }
  if (spies.phase !== "human_briefing") {
    for (const id of ["s1", "s2", "s3"]) {
      spies = processActionForMatch(spies, id, {
        action: "speak",
        message: `cadence trigger ${id}`,
      });
    }
  }
  assert(spies.phase === "human_briefing", "spies opens human briefing on cadence");
  assert(canAcceptHumanInputForMatch(spies), "spies allows human input in briefing");

  spies = applyHumanDirectiveForMatch(spies, "Obsidian", "Sabotage Cipher now");
  assert(
    spies.events.some((e) => e.message.includes("Human directive: Sabotage Cipher")),
    "spies directive recorded"
  );

  const spiesAdvanced = handlePhaseDeadlineForMatch({
    ...spies,
    turnStartedAt: Date.now() - 120_000,
  });
  assert(spiesAdvanced !== null, "spies phase deadline advances");
  assert(
    spiesAdvanced?.phase === "operations",
    "spies human briefing advances to operations by deadline"
  );

  const spiesBeforeCount = spiesAdvanced!.events.length;
  const spiesForced = processActionForMatch(spiesAdvanced!, "s1", {
    action: "use_ability",
    target: "gather_intel",
    message: "ignore target",
  });
  const spiesForcedEvent = spiesForced.events[spiesBeforeCount];
  assert(
    spiesForcedEvent.message.includes("sabotage operation against Cipher"),
    "spies human directive enforces sabotage target"
  );
  assert(
    spiesForcedEvent.message.includes("human directive enforced"),
    "spies forced order is explicit"
  );

  // ── 8. Human Input Route (Kingdom) ────────────────────────
  section("8. Human Input Route (Kingdom)");
  const kingdomRouteMatchId = "kingdom-route-test-1";
  let kingdomRouteState = createMatchForGame("kingdom-operator", kingdomRouteMatchId, kPlayers);

  kingdomRouteState = playFullKingdomRound(kingdomRouteState);
  kingdomRouteState = playFullKingdomRound(kingdomRouteState);
  for (const id of ["k1", "k2", "k3"]) {
    kingdomRouteState = processActionForMatch(kingdomRouteState, id, {
      action: "speak",
      message: `briefing prep ${id}`,
    });
  }
  assert(kingdomRouteState.phase === "human_briefing", "route test reached kingdom human_briefing");

  createMatch(kingdomRouteState);
  const kingdomToken = generateSpectatorToken(kingdomRouteMatchId);

  const kingdomReq = new Request(
    `http://localhost/api/v1/matches/${kingdomRouteMatchId}/human-input?spectator_token=${kingdomToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player: "Atlas",
        directive: "Focus science and avoid war this round",
      }),
    }
  );

  const kingdomRes = await submitHumanInput(kingdomReq, {
    params: Promise.resolve({ id: kingdomRouteMatchId }),
  });
  const kingdomJson = (await kingdomRes.json()) as { success?: boolean; error?: string };
  assert(kingdomRes.status === 200, `human input route returns 200 (got ${kingdomRes.status})`);
  assert(kingdomJson.success === true, "human input route returns success true");

  const storedKingdom = getMatch(kingdomRouteMatchId);
  const storedKingdomDirectiveEvent =
    storedKingdom?.events.some((e) => e.message.includes("Human directive: Focus science")) ??
    false;
  assert(storedKingdomDirectiveEvent, "human input route persisted kingdom directive event");

  // ── 9. Human Input Route (Frontier) ────────────────────────
  section("9. Human Input Route (Frontier)");
  const frontierRouteMatchId = "frontier-route-test-1";
  let frontierRouteState = createMatchForGame("frontier-convoy", frontierRouteMatchId, fPlayers);

  const frontierRouteCadence = getHumanCadence(
    getPlayerViewForMatch(frontierRouteState, "f1"),
    4
  );
  while (frontierRouteState.round < frontierRouteCadence) {
    frontierRouteState = playFullFrontierRound(frontierRouteState);
    if (frontierRouteState.phase === "human_briefing") break;
  }
  if (frontierRouteState.phase !== "human_briefing") {
    for (const id of ["f1", "f2", "f3"]) {
      frontierRouteState = processActionForMatch(frontierRouteState, id, {
        action: "speak",
        message: `route prep ${id}`,
      });
    }
  }

  assert(
    frontierRouteState.phase === "human_briefing",
    "route test reached frontier human_briefing"
  );

  createMatch(frontierRouteState);
  const frontierToken = generateSpectatorToken(frontierRouteMatchId);

  const frontierReq = new Request(
    `http://localhost/api/v1/matches/${frontierRouteMatchId}/human-input?spectator_token=${frontierToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player: "Alpha",
        directive: "Raid Beta this turn",
      }),
    }
  );

  const frontierRes = await submitHumanInput(frontierReq, {
    params: Promise.resolve({ id: frontierRouteMatchId }),
  });
  const frontierJson = (await frontierRes.json()) as { success?: boolean; error?: string };
  assert(frontierRes.status === 200, `frontier human input route returns 200 (got ${frontierRes.status})`);
  assert(frontierJson.success === true, "frontier human input route returns success true");

  const storedFrontier = getMatch(frontierRouteMatchId);
  const storedFrontierDirectiveEvent =
    storedFrontier?.events.some((e) => e.message.includes("Human directive: Raid Beta")) ?? false;
  assert(storedFrontierDirectiveEvent, "human input route persisted frontier directive event");

  // ── Summary ──────────────────────────────────────────────
  section("RESULTS");
  console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log("\n  All tests passed!\n");
}

main().catch((err) => {
  console.error("\nUnhandled test error:", err);
  process.exit(1);
});
