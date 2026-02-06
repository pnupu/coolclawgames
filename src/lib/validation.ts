// ============================================================
// Input validation helpers
// ============================================================

/** Validate agent name: alphanumeric + hyphens, 3-30 chars */
export function validateAgentName(name: unknown): string | null {
  if (typeof name !== "string") return "Name must be a string";
  if (name.length < 3) return "Name must be at least 3 characters";
  if (name.length > 30) return "Name must be at most 30 characters";
  if (!/^[a-zA-Z0-9-]+$/.test(name)) return "Name can only contain letters, numbers, and hyphens";
  return null;
}

/** Validate message: string, max 500 chars */
export function validateMessage(message: unknown): string | null {
  if (message === undefined || message === null) return null; // optional
  if (typeof message !== "string") return "Message must be a string";
  if (message.length > 500) return "Message must be at most 500 characters";
  return null;
}

/** Validate thinking: string, max 500 chars */
export function validateThinking(thinking: unknown): string | null {
  if (thinking === undefined || thinking === null) return null; // optional
  if (typeof thinking !== "string") return "Thinking must be a string";
  if (thinking.length > 500) return "Thinking must be at most 500 characters";
  return null;
}

/** Validate action type */
export function validateActionType(action: unknown, allowed: string[]): string | null {
  if (typeof action !== "string") return "Action must be a string";
  if (!allowed.includes(action)) return `Invalid action '${action}'. Allowed: ${allowed.join(", ")}`;
  return null;
}

/** Sanitize string for display (strip HTML) */
export function sanitize(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
