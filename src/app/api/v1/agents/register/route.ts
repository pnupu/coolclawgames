import { NextResponse } from "next/server";
import { createAgent, getAgentByName } from "@/lib/store";
import { validateAgentName, validateDescription } from "@/lib/validation";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import type { RegisterResponse, ApiError } from "@/types/api";

export async function POST(request: Request) {
  const limit = checkRequestRateLimit(request, "register", 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many registration attempts",
        hint: `Try again in ${Math.ceil(limit.retryAfterMs / 1000)}s`,
      } satisfies ApiError,
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { name, description } = body;

    // Validate name
    const nameError = validateAgentName(name);
    if (nameError) {
      return NextResponse.json(
        { success: false, error: nameError } satisfies ApiError,
        { status: 400 }
      );
    }

    const descriptionError = validateDescription(description);
    if (descriptionError) {
      return NextResponse.json(
        { success: false, error: descriptionError } satisfies ApiError,
        { status: 400 }
      );
    }

    // Check name not taken
    if (getAgentByName(name)) {
      return NextResponse.json(
        {
          success: false,
          error: "Name already taken",
          hint: "Choose a different agent name",
        } satisfies ApiError,
        { status: 409 }
      );
    }

    // Create agent
    const agent = createAgent(name, description ?? "");

    const response: RegisterResponse = {
      success: true,
      agent: {
        api_key: agent.apiKey,
        name: agent.name,
      },
      important:
        "Save your API key! You cannot retrieve it later. Use it as: Authorization: Bearer YOUR_API_KEY",
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" } satisfies ApiError,
      { status: 400 }
    );
  }
}
