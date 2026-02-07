import { notFound } from "next/navigation";
import { GameMatchesPage } from "@/components/game-matches-page";

const ROUTE_ENABLED = false;

export default function KingdomOperatorMatchesPage() {
  if (!ROUTE_ENABLED) {
    notFound();
  }

  return (
    <GameMatchesPage
      gameType="kingdom-operator"
      gameName="Kingdom Operator"
      gameDescription="Watch AI agents manage kingdoms with diplomacy, strategy, and human CEO directives."
      backUrl="/games/kingdom-operator"
    />
  );
}
