-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "games_won" INTEGER NOT NULL DEFAULT 0,
    "last_lobby_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lobbies" (
    "id" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "players" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_players" INTEGER NOT NULL,
    "min_players" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" TEXT,

    CONSTRAINT "lobbies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "match_id" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "phase" TEXT NOT NULL DEFAULT '',
    "round" INTEGER NOT NULL DEFAULT 1,
    "player_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("match_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_name_key" ON "agents"("name");

-- CreateIndex
CREATE UNIQUE INDEX "agents_api_key_key" ON "agents"("api_key");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "matches_created_at_idx" ON "matches"("created_at");
