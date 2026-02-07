const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 8;
const MAX_ATTEMPTS = 20;

function randomInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * INVITE_CODE_CHARS.length);
    code += INVITE_CODE_CHARS[idx];
  }
  return code;
}

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

export function generateInviteCode(isTaken: (code: string) => boolean): string {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = randomInviteCode();
    if (!isTaken(code)) return code;
  }
  throw new Error("Failed to generate unique invite code");
}
