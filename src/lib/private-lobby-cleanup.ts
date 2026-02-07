import { deleteLobby, gameEvents, getAllLobbies } from "@/lib/store";

const PRIVATE_LOBBY_INACTIVE_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export function cleanupInactivePrivateLobbies(now = Date.now()): number {
  const stalePrivateLobbies = getAllLobbies().filter((lobby) => {
    if (!lobby.is_private) return false;
    if (lobby.status !== "waiting" && lobby.status !== "starting") return false;
    return now - lobby.last_activity_at >= PRIVATE_LOBBY_INACTIVE_MS;
  });

  for (const lobby of stalePrivateLobbies) {
    deleteLobby(lobby.id);
  }

  if (stalePrivateLobbies.length > 0) {
    gameEvents.emit("lobby:updated");
    console.log(
      `[private-lobby-cleanup] Removed ${stalePrivateLobbies.length} inactive private lobby/lobbies`
    );
  }

  return stalePrivateLobbies.length;
}

const globalCleanupState = globalThis as unknown as {
  __ccg_privateLobbyCleanupInterval?: ReturnType<typeof setInterval>;
};

export function startPrivateLobbyCleanupLoop(): void {
  if (globalCleanupState.__ccg_privateLobbyCleanupInterval) return;
  globalCleanupState.__ccg_privateLobbyCleanupInterval = setInterval(() => {
    cleanupInactivePrivateLobbies();
  }, CLEANUP_INTERVAL_MS);
  console.log("[private-lobby-cleanup] Loop started (every 5m, TTL 30m)");
}

export function stopPrivateLobbyCleanupLoop(): void {
  if (!globalCleanupState.__ccg_privateLobbyCleanupInterval) return;
  clearInterval(globalCleanupState.__ccg_privateLobbyCleanupInterval);
  globalCleanupState.__ccg_privateLobbyCleanupInterval = undefined;
}

startPrivateLobbyCleanupLoop();
