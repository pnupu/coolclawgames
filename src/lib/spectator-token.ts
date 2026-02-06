// ============================================================
// Spectator Token -- prevents agents from cheating
// ============================================================
//
// The spectator website needs to see all roles and thinking.
// But agents could call the same API endpoints to cheat.
//
// Solution: server-generated HMAC token passed to the frontend.
// Without a valid token, the API returns a censored view.
// ============================================================

import { createHmac } from "crypto";

/**
 * Secret used to generate spectator tokens.
 * Falls back to a random value per server instance (still works for single-instance).
 */
const SPECTATOR_SECRET =
  process.env.SPECTATOR_SECRET ||
  process.env.MISTRAL_API_KEY ||
  `fallback-${Date.now()}-${Math.random()}`;

/**
 * Generate a spectator token for a given match.
 * This token is embedded in the frontend page and passed to SSE/polling.
 */
export function generateSpectatorToken(matchId: string): string {
  const hmac = createHmac("sha256", SPECTATOR_SECRET);
  hmac.update(`spectator:${matchId}`);
  return hmac.digest("hex").slice(0, 32);
}

/**
 * Validate a spectator token for a given match.
 */
export function validateSpectatorToken(
  matchId: string,
  token: string | null
): boolean {
  if (!token) return false;
  const expected = generateSpectatorToken(matchId);
  // Constant-time comparison to prevent timing attacks
  if (token.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Extract spectator token from request URL query params.
 */
export function getTokenFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("spectator_token");
}
