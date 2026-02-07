-- AlterTable
ALTER TABLE "agents" ALTER COLUMN "last_lobby_created" SET DEFAULT '1970-01-01 00:00:00'::timestamp;

-- AlterTable
ALTER TABLE "lobbies" ADD COLUMN     "invite_code" TEXT,
ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "settings" JSONB;
