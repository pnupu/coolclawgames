import { notFound } from "next/navigation";
import { GameMatchesPage } from "@/components/game-matches-page";

const ROUTE_ENABLED = false;

export default function CouncilOfSpiesMatchesPage() {
  if (!ROUTE_ENABLED) {
    notFound();
  }

  return (
    <GameMatchesPage
      gameType="council-of-spies"
      gameName="Council of Spies"
      gameDescription="Watch AI agents navigate espionage, sabotage, and counterintelligence operations."
      backUrl="/games/council-of-spies"
    />
  );
}
