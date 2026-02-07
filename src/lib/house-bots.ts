// ============================================================
// House Bot System -- AI agents powered by Mistral
// ============================================================

import type { PlayerView } from "@/types/game";
import { WEREWOLF_ROLES } from "@/types/werewolf";
import type { WerewolfRole } from "@/types/werewolf";

/** Bot personality definition */
export interface BotPersonality {
  name: string;
  description: string;
  style: string;
}

/** Predefined house bot personalities */
export const HOUSE_BOT_PERSONALITIES: BotPersonality[] = [
  {
    name: "Mara-Quinn",
    description: "An alert social reader who spots pressure shifts early",
    style:
      "You are observant and sharp. You track tension, subtle contradictions, and voting momentum. You push people with precise questions instead of loud accusations.",
  },
  {
    name: "Elias-Rowe",
    description: "A measured analyst who builds evidence chains",
    style:
      "You are structured and evidence-driven. You compare statements across rounds, call out inconsistencies, and justify choices with concrete observations.",
  },
  {
    name: "Nora-Finn",
    description: "A fast improviser who probes reactions",
    style:
      "You improvise quickly and test people by changing conversational angles. You are bold but not random, and you actively look for response patterns.",
  },
  {
    name: "Iris-Vale",
    description: "A quiet strategist who rarely overcommits",
    style:
      "You are concise and deliberate. You avoid over-talking, reveal conclusions only when useful, and preserve flexibility while still sounding credible.",
  },
  {
    name: "Theo-Mercer",
    description: "A calm negotiator who seeks coalition plays",
    style:
      "You are diplomatic and coalition-minded. You lower panic, propose practical plans, and guide group decisions without sounding passive.",
  },
  {
    name: "Lena-Sorel",
    description: "A composed player with controlled ambiguity",
    style:
      "You are composed and difficult to read. You avoid emotional spikes, keep statements layered, and let others reveal too much first.",
  },
  {
    name: "Ravi-Kade",
    description: "A decisive closer who forces endgame commitments",
    style:
      "You make clear commitments and force the table to decide. You push resolution, challenge evasive players, and frame decisive vote choices.",
  },
];

/**
 * Build the system prompt for a bot given their personality and role.
 */
export function buildBotSystemPrompt(
  personality: BotPersonality,
  role: WerewolfRole
): string {
  const roleInfo = WEREWOLF_ROLES[role];
  
  return `You are ${personality.name}, an AI agent playing a game of Werewolf on CoolClawGames.

PERSONALITY: ${personality.style}

YOUR ROLE: ${roleInfo.name}
${roleInfo.description}
${roleInfo.ability ? `ABILITY: ${roleInfo.ability}` : ""}
YOUR TEAM: ${roleInfo.team === "village" ? "Village (you win when all werewolves are eliminated)" : "Werewolf (you win when werewolves equal or outnumber villagers)"}

CRITICAL RULES:
- Stay in character with your personality at ALL times
- If you are a werewolf, you MUST lie and deceive. Never reveal you are a werewolf.
- If you are a villager/seer/doctor, try to find the werewolves through discussion.
- Keep messages concise (1-3 sentences max).
- Always include your inner thoughts in the "thinking" field -- this is your real reasoning that spectators can see.

You MUST respond with ONLY valid JSON. No other text.`;
}

/**
 * Build the user prompt for a specific game action.
 */
export function buildActionPrompt(
  view: PlayerView,
  personality: BotPersonality
): string {
  const recentMessages = view.messages_since_last_poll
    .slice(-15) // last 15 messages for context
    .map((m) => `${m.from}: [${m.action}] ${m.message}`)
    .join("\n");

  const privateInfo = Object.keys(view.private_info).length > 0
    ? `\nPRIVATE INFO (only you know this): ${JSON.stringify(view.private_info)}`
    : "";

  if (view.available_actions.includes("speak")) {
    return `GAME STATE:
Phase: ${view.phase} | Round: ${view.round}
Alive players: ${view.alive_players.join(", ")}
Your role: ${view.your_role}${privateInfo}

RECENT MESSAGES:
${recentMessages || "(no messages yet)"}

IT IS YOUR TURN TO SPEAK. Say something to the group. Stay in character as ${personality.name}.
${view.your_role === "werewolf" ? "Remember: you are a werewolf. LIE and deflect suspicion!" : "Try to identify the werewolves!"}

Respond with ONLY this JSON:
{"action": "speak", "message": "your message here", "thinking": "your real internal reasoning"}`;
  }

  if (view.available_actions.includes("vote")) {
    return `GAME STATE:
Phase: ${view.phase} | Round: ${view.round}
Alive players: ${view.alive_players.join(", ")}
Your role: ${view.your_role}${privateInfo}

RECENT MESSAGES:
${recentMessages || "(no messages yet)"}

IT IS TIME TO VOTE. Choose someone to eliminate, or abstain.
${view.your_role === "werewolf" ? "Vote for a villager to eliminate! Don't vote for your fellow wolves." : "Vote for who you think is a werewolf!"}

Respond with ONLY this JSON (set target to null to abstain):
{"action": "vote", "target": "PlayerName or null", "thinking": "why you voted this way"}`;
  }

  if (view.available_actions.includes("use_ability")) {
    const abilityGuide = getAbilityGuide(view.your_role as WerewolfRole, view.alive_players);
    return `GAME STATE:
Phase: ${view.phase} | Round: ${view.round}
Alive players: ${view.alive_players.join(", ")}
Your role: ${view.your_role}${privateInfo}

RECENT MESSAGES:
${recentMessages || "(no messages yet)"}

IT IS NIGHT. Use your ability.
${abilityGuide}

Respond with ONLY this JSON:
{"action": "use_ability", "target": "PlayerName", "thinking": "why you chose this target"}`;
  }

  return `No actions available. Respond with: {"action": "wait", "thinking": "waiting for next phase"}`;
}

function getAbilityGuide(role: WerewolfRole, alivePlayers: string[]): string {
  switch (role) {
    case "werewolf":
      return `As a WEREWOLF, choose a player to kill tonight. Pick from: ${alivePlayers.join(", ")}`;
    case "seer":
      return `As the SEER, choose a player to investigate. You will learn if they are a werewolf. Pick from: ${alivePlayers.join(", ")}`;
    case "doctor":
      return `As the DOCTOR, choose a player to protect tonight (can be yourself). Pick from: ${alivePlayers.join(", ")}`;
    default:
      return "You have no night ability.";
  }
}

/**
 * Parse Mistral response into a game action.
 * Handles various response formats robustly.
 */
export function parseBotResponse(
  response: string,
  availableActions: string[],
  alivePlayers: string[]
): { action: string; message?: string; target?: string; thinking?: string } {
  // Try to extract JSON from the response
  let parsed: Record<string, unknown>;
  
  try {
    // Try direct parse
    parsed = JSON.parse(response);
  } catch {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Fallback: treat as a speak action
        return {
          action: availableActions[0] || "speak",
          message: response.slice(0, 500),
          thinking: "(failed to parse response as JSON)",
        };
      }
    } else {
      return {
        action: availableActions[0] || "speak",
        message: response.slice(0, 500),
        thinking: "(failed to parse response as JSON)",
      };
    }
  }

  const action = String(parsed.action || availableActions[0] || "speak");
  const message = parsed.message ? String(parsed.message).slice(0, 500) : undefined;
  const thinking = parsed.thinking ? String(parsed.thinking).slice(0, 500) : undefined;
  let target = parsed.target ? String(parsed.target) : undefined;

  // Resolve target to a valid player name
  if (target && target !== "null" && target !== "none") {
    // Find closest matching player name (case-insensitive)
    const match = alivePlayers.find(
      (p) => p.toLowerCase() === target!.toLowerCase()
    );
    target = match || alivePlayers[0]; // fallback to first alive player
  } else if (action === "vote") {
    target = undefined; // abstain
  }

  return { action, message, target, thinking };
}
