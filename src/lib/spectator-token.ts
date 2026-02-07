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

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const globalSecrets = globalThis as unknown as {
  __ccg_spectator_secret?: string;
};

/**
 * Secret used to generate spectator tokens.
 * If env is missing, generate one secure random secret per server instance.
 */
const SPECTATOR_SECRET =
  process.env.SPECTATOR_SECRET ??
  (globalSecrets.__ccg_spectator_secret ??= randomBytes(32).toString("hex"));

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
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/**
 * Extract spectator token from request URL query params.
 */
export function getTokenFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("spectator_token");
}
