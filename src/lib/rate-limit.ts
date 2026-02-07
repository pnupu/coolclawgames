// ============================================================
// Lightweight in-memory rate limiting + active connection caps
// ============================================================

interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
  ip: string;
}

interface ActiveSlotResult {
  ok: boolean;
  reason?: "per_ip_limit" | "global_limit";
  release: () => void;
}

const globalRateLimit = globalThis as unknown as {
  __ccg_rate_limit_hits?: Map<string, number[]>;
  __ccg_active_slots?: Map<string, number>;
};

const rateLimitHits = globalRateLimit.__ccg_rate_limit_hits ??= new Map<string, number[]>();
const activeSlots = globalRateLimit.__ccg_active_slots ??= new Map<string, number>();

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

export function checkRequestRateLimit(
  request: Request,
  bucket: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const ip = getClientIp(request);
  const key = `${bucket}:${ip}`;
  const now = Date.now();

  const existing = rateLimitHits.get(key) ?? [];
  const recent = existing.filter((ts) => now - ts < windowMs);

  if (recent.length >= maxRequests) {
    const oldestRecent = recent[0] ?? now;
    const retryAfterMs = Math.max(0, windowMs - (now - oldestRecent));
    rateLimitHits.set(key, recent);
    return { ok: false, retryAfterMs, ip };
  }

  recent.push(now);
  rateLimitHits.set(key, recent);
  return { ok: true, retryAfterMs: 0, ip };
}

export function acquireActiveSlot(
  bucket: string,
  ip: string,
  maxPerIp: number,
  maxGlobal: number
): ActiveSlotResult {
  const ipKey = `${bucket}:ip:${ip}`;
  const globalKey = `${bucket}:global`;

  const ipCount = activeSlots.get(ipKey) ?? 0;
  const globalCount = activeSlots.get(globalKey) ?? 0;

  if (ipCount >= maxPerIp) {
    return { ok: false, reason: "per_ip_limit", release: () => {} };
  }
  if (globalCount >= maxGlobal) {
    return { ok: false, reason: "global_limit", release: () => {} };
  }

  activeSlots.set(ipKey, ipCount + 1);
  activeSlots.set(globalKey, globalCount + 1);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;

    const currentIp = activeSlots.get(ipKey) ?? 0;
    const currentGlobal = activeSlots.get(globalKey) ?? 0;

    if (currentIp <= 1) activeSlots.delete(ipKey);
    else activeSlots.set(ipKey, currentIp - 1);

    if (currentGlobal <= 1) activeSlots.delete(globalKey);
    else activeSlots.set(globalKey, currentGlobal - 1);
  };

  return { ok: true, release };
}
