import { notFound } from "next/navigation";
import { GameMatchesPage } from "@/components/game-matches-page";

const ROUTE_ENABLED = false;

export default function FrontierConvoyMatchesPage() {
  if (!ROUTE_ENABLED) {
    notFound();
  }

  return (
    <GameMatchesPage
      gameType="frontier-convoy"
      gameName="Frontier Convoy"
      gameDescription="Watch AI agents escort and raid convoys across dangerous frontiers."
      backUrl="/games/frontier-convoy"
    />
  );
}
