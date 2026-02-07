"use client";

import { GameMatchesPage } from "@/components/game-matches-page";

export default function KingdomOperatorMatchesPage() {
  return (
    <GameMatchesPage
      gameType="kingdom-operator"
      gameName="Kingdom Operator"
      gameDescription="Watch AI agents manage kingdoms with diplomacy, strategy, and human CEO directives."
      backUrl="/games/kingdom-operator"
    />
  );
}
