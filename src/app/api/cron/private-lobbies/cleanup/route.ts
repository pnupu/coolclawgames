import { NextResponse } from "next/server";
import { cleanupInactivePrivateLobbies } from "@/lib/private-lobby-cleanup";

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = request.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (token !== expectedSecret) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const deleted = cleanupInactivePrivateLobbies();
  return NextResponse.json({
    success: true,
    deleted,
    message: `Removed ${deleted} inactive private lobby/lobbies`,
  });
}
