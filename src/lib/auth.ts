// ============================================================
// Auth helpers -- bearer token extraction + validation
// ============================================================

import { getAgentByKey, checkRateLimit, ensureInitialized, type StoredAgent } from "./store";

export interface AuthResult {
  agent: StoredAgent;
}

export interface AuthError {
  status: number;
  error: string;
  hint: string;
}

/**
 * Extract and validate agent from Authorization header.
 * Returns the agent or an error object.
 * Awaits store initialization on first call to prevent race conditions.
 */
export async function authenticateAgent(
  request: Request
): Promise<AuthResult | AuthError> {
  // Ensure the in-memory store is loaded from DB before checking keys
  await ensureInitialized();
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return {
      status: 401,
      error: "Missing Authorization header",
      hint: "Include 'Authorization: Bearer YOUR_API_KEY' in your request",
    };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return {
      status: 401,
      error: "Invalid Authorization format",
      hint: "Use 'Authorization: Bearer YOUR_API_KEY'",
    };
  }

  const apiKey = parts[1];
  const agent = getAgentByKey(apiKey);

  if (!agent) {
    return {
      status: 401,
      error: "Invalid API key",
      hint: "Register first with POST /api/v1/agents/register",
    };
  }

  const bypassRateLimit =
    process.env.CCG_BYPASS_RATE_LIMIT === "1" || process.env.NODE_ENV === "test";

  if (!bypassRateLimit && !checkRateLimit(agent)) {
    return {
      status: 429,
      error: "Rate limit exceeded",
      hint: "Max 100 requests per minute. Slow down.",
    };
  }

  return { agent };
}

/** Type guard for auth errors */
export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return "status" in result;
}
