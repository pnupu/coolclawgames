#!/usr/bin/env npx tsx
// ============================================================
// Werewolf Engine Test -- exercises the full game loop in-memory
// Run: npx tsx --tsconfig tsconfig.test.json test-werewolf.ts
// ============================================================

import {
  createWerewolfMatch,
  processAction,
  getPlayerView,
  getSpectatorView,
  handleTimeout,
} from "@/engine/game-engine";
import type { GameState, Action } from "@/types/game";
import type { WerewolfPhase } from "@/types/werewolf";

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

// ── Test helpers ──────────────────────────────────────────

const PLAYERS = [
  { agentId: "a1", agentName: "Alice" },
  { agentId: "a2", agentName: "Bob" },
  { agentId: "a3", agentName: "Charlie" },
  { agentId: "a4", agentName: "Diana" },
  { agentId: "a5", agentName: "Eve" },
];

function findByRole(state: GameState, role: string) {
  return state.players.filter((p) => p.role === role);
}

function alive(state: GameState) {
  return state.players.filter((p) => p.alive);
}

// ── 1. Match Creation ─────────────────────────────────────

section("1. Match Creation");

const state0 = createWerewolfMatch("test-match-1", PLAYERS);
assert(state0.matchId === "test-match-1", "matchId set correctly");
assert(state0.gameType === "werewolf", "gameType is werewolf");
assert(state0.status === "in_progress", "status is in_progress");
assert(state0.phase === "day_discussion", "starts in day_discussion");
assert(state0.round === 1, "starts at round 1");
assert(state0.players.length === 5, "has 5 players");
assert(state0.events.length === 2, "has game_started + phase_change events");
assert(state0.turnOrder.length === 5, "turn order has 5 entries");
assert(state0.currentTurnIndex === 0, "turn index starts at 0");

// Check role distribution: 1 werewolf, 2 villagers, 1 seer, 1 doctor (5-player config)
const wolves = findByRole(state0, "werewolf");
const seers = findByRole(state0, "seer");
const doctors = findByRole(state0, "doctor");
const villagers = findByRole(state0, "villager");
assert(wolves.length === 1, `1 werewolf assigned (got ${wolves.length})`);
assert(seers.length === 1, `1 seer assigned (got ${seers.length})`);
assert(doctors.length === 1, `1 doctor assigned (got ${doctors.length})`);
assert(villagers.length === 2, `2 villagers assigned (got ${villagers.length})`);

// ── 2. Player View ────────────────────────────────────────

section("2. Player View");

const firstSpeaker = state0.turnOrder[0];
const view0 = getPlayerView(state0, firstSpeaker);
assert(view0.match_id === "test-match-1", "view has correct match_id");
assert(view0.status === "in_progress", "view status is in_progress");
assert(view0.phase === "day_discussion", "view phase is day_discussion");
assert(view0.your_turn === true, "first speaker's turn");
assert(view0.available_actions.includes("speak"), "can speak");
assert(view0.alive_players.length === 5, "all 5 alive");

const secondPlayer = state0.turnOrder[1];
const view1 = getPlayerView(state0, secondPlayer);
assert(view1.your_turn === false, "second player not their turn yet");
assert(view1.available_actions.length === 0, "no actions for non-active player");

// Wolf private info
const wolfPlayer = wolves[0];
const wolfView = getPlayerView(state0, wolfPlayer.agentId);
assert(wolfView.your_role === "werewolf", "wolf sees own role");
// With 5 players only 1 wolf, so fellow_wolves should be empty
assert(
  Array.isArray(wolfView.private_info.fellow_wolves),
  "wolf has fellow_wolves in private_info"
);

// ── 3. Spectator View ─────────────────────────────────────

section("3. Spectator View");

const spec0 = getSpectatorView(state0);
assert(spec0.match_id === "test-match-1", "spectator view has match_id");
assert(spec0.players.length === 5, "spectator sees all 5 players");
assert(spec0.players.every((p) => p.role !== ""), "spectator sees all roles");
assert(spec0.events.length === 2, "spectator sees all events");

// ── 4. Discussion Phase (speak actions) ───────────────────

section("4. Discussion Phase -- Round 1");

let state = state0;
const aliveTurnOrder = state.turnOrder.filter((id) =>
  state.players.find((p) => p.agentId === id && p.alive)
);

// Have each player speak in order
for (let i = 0; i < aliveTurnOrder.length; i++) {
  const playerId = aliveTurnOrder[i];
  const playerName = state.players.find((p) => p.agentId === playerId)!.agentName;
  const action: Action = {
    action: "speak",
    message: `Hello, I'm ${playerName} and I suspect someone!`,
    thinking: `Analyzing the situation as ${playerName}...`,
  };
  state = processAction(state, playerId, action);
  assert(
    state.events[state.events.length - 1].type === "player_speak" ||
    state.events[state.events.length - 1].type === "phase_change",
    `${playerName} spoke successfully`
  );
}

// After all 5 spoke in round 1, should still be in discussion (DISCUSSION_ROUNDS = 2)
assert(state.phase === "day_discussion", "still in discussion after round 1");
assert(state.currentTurnIndex === 0, "turn index reset for round 2");

section("4b. Discussion Phase -- Round 2");

const aliveTurnOrder2 = state.turnOrder.filter((id) =>
  state.players.find((p) => p.agentId === id && p.alive)
);

for (let i = 0; i < aliveTurnOrder2.length; i++) {
  const playerId = aliveTurnOrder2[i];
  const playerName = state.players.find((p) => p.agentId === playerId)!.agentName;
  const action: Action = {
    action: "speak",
    message: `Round 2: ${playerName} elaborates further.`,
    thinking: `Second round reasoning...`,
  };
  state = processAction(state, playerId, action);
}

// After round 2, should transition to day_vote
assert(state.phase === "day_vote", `transitioned to day_vote (got ${state.phase})`);

// ── 5. Voting Phase ───────────────────────────────────────

section("5. Voting Phase");

const votePlayers = state.players.filter((p) => p.alive);

// Find a non-wolf target for voting
const nonWolves = state.players.filter((p) => p.role !== "werewolf" && p.alive);
const voteTarget = nonWolves[0].agentId;

// Have all players vote for the same target (to guarantee elimination)
for (const voter of votePlayers) {
  if (voter.agentId === voteTarget) {
    // Target votes for someone else
    const otherTarget = votePlayers.find(
      (p) => p.agentId !== voteTarget && p.agentId !== voter.agentId
    )!;
    state = processAction(state, voter.agentId, {
      action: "vote",
      target: otherTarget.agentId,
      thinking: "Self-preservation vote",
    });
  } else {
    state = processAction(state, voter.agentId, {
      action: "vote",
      target: voteTarget,
      thinking: `I think ${nonWolves[0].agentName} is suspicious.`,
    });
  }
}

// After all votes, should resolve and transition
const eliminatedPlayer = state.players.find((p) => p.agentId === voteTarget);
assert(eliminatedPlayer?.alive === false, `${eliminatedPlayer?.agentName} was eliminated`);
assert(alive(state).length === 4, "4 players alive after elimination");

// Check events
const voteResultEvents = state.events.filter((e) => e.type === "vote_result");
assert(voteResultEvents.length >= 1, "vote_result event created");

const eliminatedEvents = state.events.filter((e) => e.type === "player_eliminated");
assert(eliminatedEvents.length >= 1, "player_eliminated event created");

// Game should either be finished (if wolf eliminated) or move to night
if (state.status === "finished") {
  console.log("\n  Game ended after vote (all wolves eliminated).");
  assert(state.winner?.team === "village", "village wins if wolf was eliminated");
} else {
  assert(state.phase === "night_action", `transitioned to night_action (got ${state.phase})`);

  // ── 6. Night Phase ────────────────────────────────────────

  section("6. Night Phase");

  // Find alive night-role players
  const aliveWolves = state.players.filter(
    (p) => p.alive && p.role === "werewolf"
  );
  const aliveSeer = state.players.find(
    (p) => p.alive && p.role === "seer"
  );
  const aliveDoctor = state.players.find(
    (p) => p.alive && p.role === "doctor"
  );

  // Wolf targets someone
  if (aliveWolves.length > 0) {
    const wolfTarget = state.players.find(
      (p) => p.alive && p.role !== "werewolf"
    )!;
    state = processAction(state, aliveWolves[0].agentId, {
      action: "use_ability",
      target: wolfTarget.agentId,
      thinking: "Eliminating a villager tonight.",
    });
    assert(
      state.events.some((e) => e.type === "player_ability" && e.actor === aliveWolves[0].agentId),
      "wolf ability event created"
    );
  }

  // Seer investigates
  if (aliveSeer) {
    const seerTarget = state.players.find(
      (p) => p.alive && p.agentId !== aliveSeer.agentId
    )!;
    state = processAction(state, aliveSeer.agentId, {
      action: "use_ability",
      target: seerTarget.agentId,
      thinking: "Let me investigate this person.",
    });
    assert(
      state.events.some((e) => e.type === "player_ability" && e.actor === aliveSeer.agentId),
      "seer ability event created"
    );
  }

  // Doctor protects
  if (aliveDoctor) {
    const protectTarget = state.players.find((p) => p.alive)!;
    state = processAction(state, aliveDoctor.agentId, {
      action: "use_ability",
      target: protectTarget.agentId,
      thinking: "Protecting someone tonight.",
    });
    assert(
      state.events.some((e) => e.type === "player_ability" && e.actor === aliveDoctor.agentId),
      "doctor ability event created"
    );
  }

  // After all night actions, should resolve and transition
  const nightResults = state.events.filter((e) => e.type === "night_result");
  assert(nightResults.length >= 1, "night_result event created");

  if (state.status !== "finished") {
    assert(
      state.phase === "day_discussion",
      `transitioned back to day_discussion (got ${state.phase})`
    );
    assert(state.round === 2, `round advanced to 2 (got ${state.round})`);
  }
}

// ── 7. Timeout Handling ─────────────────────────────────────

section("7. Timeout Handling");

// Create a fresh match for timeout tests
const stateT = createWerewolfMatch("test-timeout", PLAYERS);
const firstPlayer = stateT.turnOrder[0];

const timedOutState = handleTimeout(stateT, firstPlayer);
assert(
  timedOutState.events.some((e) => e.type === "player_silent"),
  "timeout creates player_silent event"
);
assert(
  timedOutState.currentTurnIndex === 1,
  "turn advances after timeout"
);

// ── 8. Invalid Actions ──────────────────────────────────────

section("8. Invalid Actions");

const stateI = createWerewolfMatch("test-invalid", PLAYERS);

// Wrong player tries to speak
const wrongPlayer = stateI.turnOrder[1]; // not their turn
try {
  processAction(stateI, wrongPlayer, {
    action: "speak",
    message: "I shouldn't be able to speak!",
  });
  assert(false, "should throw for wrong player speaking");
} catch (e: unknown) {
  assert(
    (e as Error).message.includes("not your turn"),
    `rejected wrong player speaking: "${(e as Error).message}"`
  );
}

// Dead player tries to act
const stateD = createWerewolfMatch("test-dead", PLAYERS);
// Manually kill a player for this test
const deadPlayerState: GameState = {
  ...stateD,
  players: stateD.players.map((p, i) =>
    i === 0 ? { ...p, alive: false } : p
  ),
};
const deadPlayer = deadPlayerState.players[0];
try {
  processAction(deadPlayerState, deadPlayer.agentId, {
    action: "speak",
    message: "I'm dead!",
  });
  assert(false, "should throw for dead player");
} catch (e: unknown) {
  assert(true, `rejected dead player: "${(e as Error).message}"`);
}

// Vote during discussion
const firstSpeakerI = stateI.turnOrder[0];
try {
  processAction(stateI, firstSpeakerI, {
    action: "vote",
    target: stateI.turnOrder[1],
  });
  assert(false, "should throw for voting during discussion");
} catch (e: unknown) {
  assert(true, `rejected vote during discussion: "${(e as Error).message}"`);
}

// ── 9. Full Game Simulation ─────────────────────────────────

section("9. Full Game Simulation (random play to completion)");

let simState = createWerewolfMatch("test-sim", PLAYERS);
let turnCount = 0;
const maxTurns = 200;

while (simState.status === "in_progress" && turnCount < maxTurns) {
  const phase = simState.phase as WerewolfPhase;
  const alivePlayers = simState.players.filter((p) => p.alive);

  if (phase === "day_discussion") {
    const turnOrder = simState.turnOrder.filter((id) =>
      simState.players.find((p) => p.agentId === id && p.alive)
    );
    const currentPlayer = turnOrder[simState.currentTurnIndex];
    if (currentPlayer) {
      simState = processAction(simState, currentPlayer, {
        action: "speak",
        message: "I have something to say.",
        thinking: "Thinking...",
      });
    } else {
      simState = handleTimeout(simState, turnOrder[0] || alivePlayers[0].agentId);
    }
  } else if (phase === "day_vote") {
    for (const p of alivePlayers) {
      if (!simState.actedThisPhase.has(p.agentId)) {
        const targets = alivePlayers.filter(
          (t) => t.agentId !== p.agentId
        );
        const target = targets[Math.floor(Math.random() * targets.length)];
        simState = processAction(simState, p.agentId, {
          action: "vote",
          target: target?.agentId,
          thinking: "Random vote",
        });
        break; // re-check state after each vote
      }
    }
  } else if (phase === "night_action") {
    for (const p of alivePlayers) {
      if (
        !simState.actedThisPhase.has(p.agentId) &&
        ["werewolf", "seer", "doctor"].includes(p.role)
      ) {
        const validTargets = alivePlayers.filter((t) => {
          if (p.role === "werewolf" && t.role === "werewolf") return false;
          if (p.role === "seer" && t.agentId === p.agentId) return false;
          return true;
        });
        const target =
          validTargets[Math.floor(Math.random() * validTargets.length)];
        if (target) {
          simState = processAction(simState, p.agentId, {
            action: "use_ability",
            target: target.agentId,
            thinking: "Night action",
          });
        }
        break; // re-check after each action
      }
    }
  } else if (phase === "dawn_reveal") {
    // This phase should auto-transition -- if stuck, something is wrong
    console.log("  WARNING: stuck in dawn_reveal, forcing timeout");
    simState = handleTimeout(simState, alivePlayers[0].agentId);
  }

  turnCount++;
}

assert(simState.status === "finished", `game completed (status: ${simState.status})`);
assert(simState.winner !== undefined, "winner is set");
assert(turnCount < maxTurns, `finished in ${turnCount} turns (under ${maxTurns} limit)`);

const finalSpec = getSpectatorView(simState);
console.log(`\n  Game ended: ${finalSpec.winner?.team} wins!`);
console.log(`  Reason: ${finalSpec.winner?.reason}`);
console.log(`  Total events: ${finalSpec.events.length}`);
console.log(`  Turns taken: ${turnCount}`);
console.log(`  Survivors: ${simState.players.filter((p) => p.alive).map((p) => `${p.agentName} (${p.role})`).join(", ")}`);

// ── Summary ─────────────────────────────────────────────────

section("RESULTS");
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n  All tests passed!\n");
}
