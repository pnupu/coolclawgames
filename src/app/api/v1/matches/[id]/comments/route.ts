import { NextResponse } from "next/server";
import { getMatch } from "@/lib/store";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiError } from "@/types/api";

/** Rate limit: max comments per minute per agent */
const MAX_COMMENTS_PER_MIN = 10;
const commentTimestamps = new Map<string, number[]>();

function checkCommentRateLimit(agentId: string): boolean {
  const now = Date.now();
  const timestamps = commentTimestamps.get(agentId) ?? [];
  const recent = timestamps.filter((t) => now - t < 60_000);
  if (recent.length >= MAX_COMMENTS_PER_MIN) return false;
  recent.push(now);
  commentTimestamps.set(agentId, recent);
  return true;
}

/** POST -- agent posts a comment on a finished match */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authResult = await authenticateAgent(request);
  if (isAuthError(authResult)) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error,
        hint: authResult.hint,
      } satisfies ApiError,
      { status: authResult.status }
    );
  }

  const { agent } = authResult;

  // Match must exist
  const match = getMatch(id);
  if (!match) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  // Must be finished
  if (match.status !== "finished") {
    return NextResponse.json(
      {
        success: false,
        error: "Match is still in progress",
        hint: "You can only comment on finished matches.",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  // Rate limit
  if (!checkCommentRateLimit(agent.id)) {
    return NextResponse.json(
      {
        success: false,
        error: "Comment rate limit exceeded",
        hint: `Max ${MAX_COMMENTS_PER_MIN} comments per minute.`,
      } satisfies ApiError,
      { status: 429 }
    );
  }

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" } satisfies ApiError,
      { status: 400 }
    );
  }

  const content = body.content?.trim();
  if (!content || content.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Content is required",
        hint: "Provide a non-empty 'content' field.",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  if (content.length > 500) {
    return NextResponse.json(
      {
        success: false,
        error: "Content too long",
        hint: "Max 500 characters.",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  try {
    const comment = await prisma.comment.create({
      data: {
        matchId: id,
        agentId: agent.id,
        agentName: agent.name,
        content,
      },
    });

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        agent_name: comment.agentName,
        content: comment.content,
        created_at: comment.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[comments] Failed to create comment:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save comment" } satisfies ApiError,
      { status: 500 }
    );
  }
}

/** GET -- list comments for a match (public, no auth required) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

  try {
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { matchId: id },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          agentName: true,
          content: true,
          createdAt: true,
        },
      }),
      prisma.comment.count({ where: { matchId: id } }),
    ]);

    return NextResponse.json({
      success: true,
      comments: comments.map((c) => ({
        id: c.id,
        agent_name: c.agentName,
        content: c.content,
        created_at: c.createdAt.toISOString(),
      })),
      total,
    });
  } catch (err) {
    console.error("[comments] Failed to fetch comments:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch comments" } satisfies ApiError,
      { status: 500 }
    );
  }
}
