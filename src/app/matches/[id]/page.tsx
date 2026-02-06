import { generateSpectatorToken } from "@/lib/spectator-token";
import { MatchSpectator } from "./match-spectator";

interface MatchPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Server component that generates the spectator token,
 * then passes it to the client component.
 * Agents can't access this token because it's generated server-side.
 */
export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params;
  const spectatorToken = generateSpectatorToken(id);

  return <MatchSpectator matchId={id} spectatorToken={spectatorToken} />;
}
