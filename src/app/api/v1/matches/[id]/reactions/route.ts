import { NextResponse } from "next/server";
import { getOrCreateViewerId, getViewerIdFromRequest } from "@/lib/viewer-id";
import { prisma } from "@/lib/prisma";
import type { ApiError } from "@/types/api";

/** Allowed emoji reactions */
const ALLOWED_EMOJIS = new Set(["fire", "laugh", "skull", "100", "eyes", "clap"]);

/** Rate limit: max reaction toggles per minute per IP */
const MAX_REACTIONS_PER_MIN = 30;
const reactionTimestamps = new Map<string, number[]>();

function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkReactionRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = reactionTimestamps.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < 60_000);
  if (recent.length >= MAX_REACTIONS_PER_MIN) return false;
  recent.push(now);
  reactionTimestamps.set(ip, recent);
  return true;
}

/** POST -- toggle an emoji reaction on a match */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  const ip = getIp(request);
  if (!checkReactionRateLimit(ip)) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded",
        hint: `Max ${MAX_REACTIONS_PER_MIN} reactions per minute.`,
      } satisfies ApiError,
      { status: 429 }
    );
  }

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" } satisfies ApiError,
      { status: 400 }
    );
  }

  const emoji = body.emoji?.trim().toLowerCase();
  if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid emoji",
        hint: `Allowed emojis: ${[...ALLOWED_EMOJIS].join(", ")}`,
      } satisfies ApiError,
      { status: 400 }
    );
  }

  // Get or create viewer ID from cookie
  const viewerId = await getOrCreateViewerId();

  try {
    // Toggle: check if reaction already exists
    const existing = await prisma.reaction.findUnique({
      where: {
        matchId_viewerId_emoji: { matchId, viewerId, emoji },
      },
    });

    if (existing) {
      // Remove reaction
      await prisma.reaction.delete({ where: { id: existing.id } });
      return NextResponse.json({
        success: true,
        action: "removed",
        emoji,
      });
    } else {
      // Add reaction
      await prisma.reaction.create({
        data: { matchId, emoji, viewerId },
      });
      return NextResponse.json({
        success: true,
        action: "added",
        emoji,
      });
    }
  } catch (err) {
    console.error("[reactions] Failed to toggle reaction:", err);
    return NextResponse.json(
      { success: false, error: "Failed to toggle reaction" } satisfies ApiError,
      { status: 500 }
    );
  }
}

/** GET -- get reaction counts for a match */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  // Read viewer ID from cookie (don't create one for GET)
  const viewerId = getViewerIdFromRequest(request);

  try {
    // Get all reactions for this match grouped by emoji
    const allReactions = await prisma.reaction.groupBy({
      by: ["emoji"],
      where: { matchId },
      _count: { emoji: true },
    });

    const reactions: Record<string, number> = {};
    for (const r of allReactions) {
      reactions[r.emoji] = r._count.emoji;
    }

    // Get this viewer's reactions if they have a cookie
    let viewerReactions: string[] = [];
    if (viewerId) {
      const mine = await prisma.reaction.findMany({
        where: { matchId, viewerId },
        select: { emoji: true },
      });
      viewerReactions = mine.map((r) => r.emoji);
    }

    return NextResponse.json({
      success: true,
      reactions,
      viewer_reactions: viewerReactions,
    });
  } catch (err) {
    console.error("[reactions] Failed to fetch reactions:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch reactions" } satisfies ApiError,
      { status: 500 }
    );
  }
}
