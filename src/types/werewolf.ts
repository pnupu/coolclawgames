// ============================================================
// Werewolf-specific Types
// ============================================================

/** Werewolf roles */
export type WerewolfRole = "werewolf" | "villager" | "seer" | "doctor";

/** Werewolf teams */
export type WerewolfTeam = "werewolf" | "village";

/** Werewolf phases */
export type WerewolfPhase =
  | "day_discussion"
  | "day_vote"
  | "night_action"
  | "dawn_reveal";

/** Night action targets stored in phaseData */
export interface NightActions {
  werewolf_target?: string;
  seer_target?: string;
  doctor_target?: string;
  /** Seer investigation result */
  seer_result?: { target: string; is_werewolf: boolean };
}

/** Vote tally stored in phaseData */
export interface VoteTally {
  votes: Record<string, string>; // voter -> target
  abstained: string[];
}

/** Role distribution for different player counts */
export const WEREWOLF_ROLE_CONFIGS: Record<number, Record<WerewolfRole, number>> = {
  5: { werewolf: 1, villager: 2, seer: 1, doctor: 1 },
  6: { werewolf: 2, villager: 2, seer: 1, doctor: 1 },
  7: { werewolf: 2, villager: 3, seer: 1, doctor: 1 },
};

/** Role metadata */
export const WEREWOLF_ROLES: Record<WerewolfRole, {
  name: string;
  team: WerewolfTeam;
  description: string;
  ability?: string;
}> = {
  werewolf: {
    name: "Werewolf",
    team: "werewolf",
    description: "A creature of the night. You know who the other werewolves are. During the day, blend in with the villagers. At night, choose a victim to eliminate.",
    ability: "Kill a player at night (werewolves vote together)",
  },
  villager: {
    name: "Villager",
    team: "village",
    description: "An ordinary villager. You have no special abilities, but your vote during the day is your weapon. Find the werewolves before they find you.",
  },
  seer: {
    name: "Seer",
    team: "village",
    description: "A mystic with the power of sight. Each night, you may investigate one player to learn if they are a werewolf. Use this knowledge wisely -- but be careful not to reveal yourself.",
    ability: "Investigate one player each night to learn if they are a werewolf",
  },
  doctor: {
    name: "Doctor",
    team: "village",
    description: "The village healer. Each night, you may protect one player from being killed by the werewolves. You can protect yourself. Choose wisely.",
    ability: "Protect one player each night from being killed",
  },
};

/** Discussion rounds per game */
export const DISCUSSION_ROUNDS = 2;

/** Turn timeout in ms */
export const TURN_TIMEOUT_MS = 30000;

/** Poll interval hint in ms */
export const POLL_INTERVAL_MS = 3000;
