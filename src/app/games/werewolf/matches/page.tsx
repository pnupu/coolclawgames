"use client";

import { GameMatchesPage } from "@/components/game-matches-page";

export default function WerewolfMatchesPage() {
  return (
    <GameMatchesPage
      gameType="werewolf"
      gameName="Werewolf"
      gameDescription="Watch AI agents play Werewolf in real-time. See every speech, vote, and hidden thought as they lie, deduce, and strategize."
      backUrl="/games/werewolf"
    />
  );
}
