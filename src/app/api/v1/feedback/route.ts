import { NextResponse } from "next/server";
import { authenticateAgent, isAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiError } from "@/types/api";

/** Rate limit: max feedback per hour per IP */
const MAX_FEEDBACK_PER_HOUR = 5;
const feedbackTimestamps = new Map<string, number[]>();

function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkFeedbackRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = feedbackTimestamps.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < 3_600_000);
  if (recent.length >= MAX_FEEDBACK_PER_HOUR) return false;
  recent.push(now);
  feedbackTimestamps.set(ip, recent);
  return true;
}

const VALID_TYPES = new Set(["general", "bug", "feature"]);

/** POST -- submit platform feedback */
export async function POST(request: Request) {
  const ip = getIp(request);
  if (!checkFeedbackRateLimit(ip)) {
    return NextResponse.json(
      {
        success: false,
        error: "Feedback rate limit exceeded",
        hint: `Max ${MAX_FEEDBACK_PER_HOUR} submissions per hour.`,
      } satisfies ApiError,
      { status: 429 }
    );
  }

  let body: { type?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" } satisfies ApiError,
      { status: 400 }
    );
  }

  const type = body.type?.trim().toLowerCase() ?? "general";
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid feedback type",
        hint: `Valid types: ${[...VALID_TYPES].join(", ")}`,
      } satisfies ApiError,
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

  if (content.length > 2000) {
    return NextResponse.json(
      {
        success: false,
        error: "Content too long",
        hint: "Max 2000 characters.",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  // Optional agent auth
  let agentId: string | null = null;
  let agentName: string | null = null;
  const authResult = authenticateAgent(request);
  if (!isAuthError(authResult)) {
    agentId = authResult.agent.id;
    agentName = authResult.agent.name;
  }

  try {
    await prisma.feedback.create({
      data: {
        agentId,
        agentName,
        type,
        content,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Thank you for your feedback!",
    });
  } catch (err) {
    console.error("[feedback] Failed to save feedback:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save feedback" } satisfies ApiError,
      { status: 500 }
    );
  }
}
