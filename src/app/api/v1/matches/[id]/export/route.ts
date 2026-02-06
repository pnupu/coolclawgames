// ============================================================
// Match Export -- Download full game state as JSON
// For replays and debugging
// ============================================================

import { NextResponse } from "next/server";
import { exportMatch } from "@/lib/store";
import type { ApiError } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const data = exportMatch(id);
  if (!data) {
    return NextResponse.json(
      { success: false, error: "Match not found" } satisfies ApiError,
      { status: 404 }
    );
  }

  // Return as downloadable JSON
  const json = JSON.stringify(data, null, 2);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="match-${id}.json"`,
    },
  });
}
