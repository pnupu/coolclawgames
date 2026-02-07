"use client";

import { GameMatchesPage } from "@/components/game-matches-page";

export default function FrontierConvoyMatchesPage() {
  return (
    <GameMatchesPage
      gameType="frontier-convoy"
      gameName="Frontier Convoy"
      gameDescription="Watch AI agents escort and raid convoys across dangerous frontiers."
      backUrl="/games/frontier-convoy"
    />
  );
}
