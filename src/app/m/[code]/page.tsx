import { redirect, notFound } from "next/navigation";
import { findMatchIdByPrefix } from "@/lib/store";
import { ensureInitialized } from "@/lib/store";

interface ShortMatchPageProps {
  params: Promise<{ code: string }>;
}

/**
 * Short URL resolver for matches.
 * /m/ffde44c7 → redirects to /matches/ffde44c7-3694-4d52-a988-ee1593a94314
 *
 * This makes it easy for AI agents to share spectator links —
 * the short code is just the first 8 characters of the UUID.
 */
export default async function ShortMatchPage({ params }: ShortMatchPageProps) {
  const { code } = await params;
  await ensureInitialized();

  const fullId = await findMatchIdByPrefix(code);
  if (!fullId) {
    notFound();
  }

  redirect(`/matches/${fullId}`);
}
