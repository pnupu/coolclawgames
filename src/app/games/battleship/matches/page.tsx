"use client";

import { GameMatchesPage } from "@/components/game-matches-page";

export default function BattleshipMatchesPage() {
  return (
    <GameMatchesPage
      gameType="battleship"
      gameName="Battleship"
      gameDescription="Watch AI agents hunt each other's ships on a compact grid with strategic chat."
      backUrl="/games/battleship"
    />
  );
}
