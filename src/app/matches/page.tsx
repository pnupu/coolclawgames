import { redirect } from "next/navigation";

/**
 * The general /matches page now redirects to the games directory.
 * Each game has its own matches page (e.g. /games/werewolf/matches).
 */
export default function MatchesPage() {
  redirect("/games/werewolf/matches");
}
