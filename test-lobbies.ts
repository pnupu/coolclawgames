#!/usr/bin/env bun

import { createAgent, getLobby, updateLobby } from "@/lib/store";
import { POST as createLobbyRoute, GET as listLobbiesRoute } from "@/app/api/v1/lobbies/route";
import { POST as joinLobbyRoute } from "@/app/api/v1/lobbies/[id]/join/route";
import {
  cleanupInactivePrivateLobbies,
  stopPrivateLobbyCleanupLoop,
} from "@/lib/private-lobby-cleanup";
import { stopAutofillLoop } from "@/lib/lobby-autofill";
import { stopTimeoutLoop } from "@/lib/turn-timeout";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n═══ ${title} ═══`);
}

function authHeaders(apiKey: string, withJson = false): HeadersInit {
  return withJson
    ? {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }
    : {
        Authorization: `Bearer ${apiKey}`,
      };
}

async function main() {
  section("1. Private Lobby Creation");

  const creator = await createAgent(`creator_${Date.now()}`, "test creator");
  const createRes = await createLobbyRoute(
    new Request("http://localhost/api/v1/lobbies", {
      method: "POST",
      headers: authHeaders(creator.apiKey, true),
      body: JSON.stringify({
        game_type: "tic-tac-toe",
        is_private: true,
      }),
    })
  );

  const createJson = (await createRes.json()) as {
    success?: boolean;
    lobby?: {
      id: string;
      is_private: boolean;
      invite_code?: string;
      status: string;
    };
  };

  assert(createRes.status === 201, `private lobby create returns 201 (got ${createRes.status})`);
  assert(createJson.success === true, "private lobby create success true");
  assert(createJson.lobby?.is_private === true, "created lobby marked private");
  assert(typeof createJson.lobby?.invite_code === "string", "invite code returned");

  const privateLobbyId = createJson.lobby!.id;
  const privateInviteCode = createJson.lobby!.invite_code!;

  section("2. Private Lobby Hidden From Listing");

  const listRes = await listLobbiesRoute();
  const listJson = (await listRes.json()) as {
    success?: boolean;
    lobbies?: Array<{ id: string; is_private?: boolean }>;
  };

  assert(listJson.success === true, "lobby listing success true");
  assert(
    !(listJson.lobbies ?? []).some((l) => l.id === privateLobbyId),
    "private lobby not returned in lobby listing"
  );

  section("3. Private Join Requires Invite Code");

  const joiner = await createAgent(`joiner_${Date.now()}`, "test joiner");

  const joinNoCodeRes = await joinLobbyRoute(
    new Request(`http://localhost/api/v1/lobbies/${privateLobbyId}/join`, {
      method: "POST",
      headers: authHeaders(joiner.apiKey),
    }),
    { params: Promise.resolve({ id: privateLobbyId }) }
  );
  assert(joinNoCodeRes.status === 403, `join without code rejected (got ${joinNoCodeRes.status})`);

  const joinWithCodeRes = await joinLobbyRoute(
    new Request(`http://localhost/api/v1/lobbies/${privateLobbyId}/join`, {
      method: "POST",
      headers: authHeaders(joiner.apiKey, true),
      body: JSON.stringify({ invite_code: privateInviteCode }),
    }),
    { params: Promise.resolve({ id: privateLobbyId }) }
  );
  const joinWithCodeJson = (await joinWithCodeRes.json()) as {
    success?: boolean;
    lobby?: { status: string; match_id?: string };
  };
  assert(joinWithCodeRes.status === 200, `join with code accepted (got ${joinWithCodeRes.status})`);
  assert(joinWithCodeJson.success === true, "join with code success true");
  assert(joinWithCodeJson.lobby?.status === "started", "private lobby auto-started at min players");

  section("4. Join By Invite Code Path");

  const creator2 = await createAgent(`creator2_${Date.now()}`, "test creator 2");
  const createRes2 = await createLobbyRoute(
    new Request("http://localhost/api/v1/lobbies", {
      method: "POST",
      headers: authHeaders(creator2.apiKey, true),
      body: JSON.stringify({
        game_type: "rock-paper-scissors",
        is_private: true,
      }),
    })
  );
  const createJson2 = (await createRes2.json()) as {
    success?: boolean;
    lobby?: { id: string; invite_code?: string };
  };

  const joiner2 = await createAgent(`joiner2_${Date.now()}`, "test joiner 2");
  const inviteCode2 = createJson2.lobby?.invite_code ?? "";
  const joinByCodePathRes = await joinLobbyRoute(
    new Request(`http://localhost/api/v1/lobbies/${inviteCode2}/join`, {
      method: "POST",
      headers: authHeaders(joiner2.apiKey),
    }),
    { params: Promise.resolve({ id: inviteCode2 }) }
  );

  const joinByCodePathJson = (await joinByCodePathRes.json()) as {
    success?: boolean;
    lobby?: { status: string };
  };
  assert(joinByCodePathRes.status === 200, `join by invite code path accepted (got ${joinByCodePathRes.status})`);
  assert(joinByCodePathJson.success === true, "join by invite code path success true");

  section("5. Inactive Private Lobby Cleanup");

  const creator3 = await createAgent(`creator3_${Date.now()}`, "test creator 3");
  const staleCreateRes = await createLobbyRoute(
    new Request("http://localhost/api/v1/lobbies", {
      method: "POST",
      headers: authHeaders(creator3.apiKey, true),
      body: JSON.stringify({
        game_type: "werewolf",
        is_private: true,
      }),
    })
  );
  const staleCreateJson = (await staleCreateRes.json()) as {
    lobby?: { id: string };
  };
  const staleLobbyId = staleCreateJson.lobby!.id;

  updateLobby(staleLobbyId, {
    last_activity_at: Date.now() - 31 * 60 * 1000,
  });

  const deletedCount = cleanupInactivePrivateLobbies();
  assert(deletedCount >= 1, `cleanup removed stale private lobby (deleted=${deletedCount})`);
  assert(!getLobby(staleLobbyId), "stale private lobby deleted from store");

  section("6. Public Lobby Still Listed");

  const creator4 = await createAgent(`creator4_${Date.now()}`, "test creator 4");
  const publicCreateRes = await createLobbyRoute(
    new Request("http://localhost/api/v1/lobbies", {
      method: "POST",
      headers: authHeaders(creator4.apiKey, true),
      body: JSON.stringify({
        game_type: "werewolf",
      }),
    })
  );
  const publicCreateJson = (await publicCreateRes.json()) as {
    lobby?: { id: string; is_private: boolean };
  };
  assert(publicCreateJson.lobby?.is_private === false, "public lobby marked non-private");

  const listAfterPublicRes = await listLobbiesRoute();
  const listAfterPublicJson = (await listAfterPublicRes.json()) as {
    lobbies?: Array<{ id: string }>;
  };
  assert(
    (listAfterPublicJson.lobbies ?? []).some((l) => l.id === publicCreateJson.lobby?.id),
    "public lobby appears in listing"
  );

  stopAutofillLoop();
  stopTimeoutLoop();
  stopPrivateLobbyCleanupLoop();

  section("RESULTS");
  console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) process.exit(1);
  console.log("\n  All tests passed!\n");
}

main().catch((err) => {
  stopAutofillLoop();
  stopTimeoutLoop();
  stopPrivateLobbyCleanupLoop();
  console.error("Unhandled test error:", err);
  process.exit(1);
});
