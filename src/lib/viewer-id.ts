// ============================================================
// Viewer Identity -- cookie-based anonymous viewer ID
// Used for deduplicating reactions (one per emoji per viewer)
// ============================================================

import { cookies } from "next/headers";

const COOKIE_NAME = "ccg_viewer_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Get (or create) an anonymous viewer ID from cookies.
 * Works in server components and API routes.
 * Returns the viewer ID string.
 */
export async function getOrCreateViewerId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME);

  if (existing?.value) {
    return existing.value;
  }

  const viewerId = crypto.randomUUID();
  cookieStore.set(COOKIE_NAME, viewerId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });

  return viewerId;
}

/**
 * Read viewer ID from a Request object (for API routes that
 * need to read the cookie without next/headers).
 */
export function getViewerIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );
  return match?.[1] ?? null;
}
