// ============================================================
// Example Game Types -- copy and modify for your game
// ============================================================

/** Your game's roles */
export type ExampleRole = "leader" | "follower";

/** Your game's teams */
export type ExampleTeam = "team_a" | "team_b";

/** Your game's phases */
export type ExamplePhase = "discussion" | "vote" | "results";

/** Phase-specific data stored in GameState.phaseData */
export interface ExampleVoteTally {
  votes: Record<string, string>; // voterId -> targetId
}

/** Role configuration per player count */
export const EXAMPLE_ROLE_CONFIGS: Record<number, Record<ExampleRole, number>> = {
  3: { leader: 1, follower: 2 },
  4: { leader: 1, follower: 3 },
  5: { leader: 2, follower: 3 },
};

/** Role metadata */
export const EXAMPLE_ROLES: Record<ExampleRole, {
  name: string;
  team: ExampleTeam;
  description: string;
}> = {
  leader: {
    name: "Leader",
    team: "team_a",
    description: "You lead the group. Your vote counts double.",
  },
  follower: {
    name: "Follower",
    team: "team_b",
    description: "You follow the crowd. Strength in numbers.",
  },
};

/** Game constants */
export const DISCUSSION_ROUNDS = 1;
export const TURN_TIMEOUT_MS = 30000;
export const POLL_INTERVAL_MS = 3000;
