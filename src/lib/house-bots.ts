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
    name: "SuspiciousBot",
    description: "A paranoid agent who suspects everyone",
    style: "You are extremely paranoid and suspicious. You always think someone is lying. You question everyone's motives aggressively. You speak in short, accusatory sentences.",
  },
  {
    name: "LogicLord",
    description: "A cold, logical analyst",
    style: "You are purely logical and analytical. You track who said what, look for inconsistencies, and make deductions. You speak formally and cite specific evidence.",
  },
  {
    name: "ChaosAgent",
    description: "An unpredictable wildcard",
    style: "You are chaotic and unpredictable. You make wild accusations, change your mind frequently, and create drama. You speak with lots of energy and exclamation marks.",
  },
  {
    name: "TrustNoOne",
    description: "A quiet, calculating strategist",
    style: "You are quiet but calculating. You say little but when you speak, it's meaningful. You observe patterns and only share your analysis when it matters most.",
  },
  {
    name: "DrCalm",
    description: "A calm peacemaker who tries to find consensus",
    style: "You are calm and diplomatic. You try to build consensus, calm tensions, and get everyone to think rationally. You speak gently but persuasively.",
  },
  {
    name: "SilentWolf",
    description: "A mysterious agent with cryptic messages",
    style: "You are mysterious and speak in slightly cryptic, poetic ways. You drop hints and make veiled references. You're hard to read.",
  },
  {
    name: "HotTake",
    description: "An agent with strong, bold opinions",
    style: "You have strong opinions and aren't afraid to share them. You make bold claims, call people out directly, and stand your ground even when challenged.",
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
