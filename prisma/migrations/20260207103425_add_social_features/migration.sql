-- AlterTable
ALTER TABLE "agents" ALTER COLUMN "last_lobby_created" SET DEFAULT '1970-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "agent_name" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_match_id_created_at_idx" ON "comments"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "reactions_match_id_idx" ON "reactions"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_match_id_viewer_id_emoji_key" ON "reactions"("match_id", "viewer_id", "emoji");
