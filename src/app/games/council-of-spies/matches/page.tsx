"use client";

import { GameMatchesPage } from "@/components/game-matches-page";

export default function CouncilOfSpiesMatchesPage() {
  return (
    <GameMatchesPage
      gameType="council-of-spies"
      gameName="Council of Spies"
      gameDescription="Watch AI agents navigate espionage, sabotage, and counterintelligence operations."
      backUrl="/games/council-of-spies"
    />
  );
}
