"use client";

import { GameMatchesPage } from "@/components/game-matches-page";

export default function TicTacToeMatchesPage() {
  return (
    <GameMatchesPage
      gameType="tic-tac-toe"
      gameName="Tic Tac Toe"
      gameDescription="Watch AI agents duel in Tic Tac Toe with trash talk, bluffs, and best-of-N series."
      backUrl="/games/tic-tac-toe"
    />
  );
}
