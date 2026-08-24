-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT IF EXISTS "DirectMessage_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT IF EXISTS "DirectMessage_receiver_id_fkey";

-- DropForeignKey
ALTER TABLE "_RoomToUser" DROP CONSTRAINT IF EXISTS "_RoomToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "_RoomToUser" DROP CONSTRAINT IF EXISTS "_RoomToUser_B_fkey";

-- DropForeignKey
ALTER TABLE "RoomMessage" DROP CONSTRAINT IF EXISTS "RoomMessage_room_id_fkey";

-- DropForeignKey
ALTER TABLE "RoomMessage" DROP CONSTRAINT IF EXISTS "RoomMessage_user_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "DirectMessage";

-- DropTable
DROP TABLE IF EXISTS "_RoomToUser";

-- AlterTable
ALTER TABLE "RoomMessage" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE "RoomMessage" ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoomMember" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RoomMember_user_id_room_id_key" ON "RoomMember"("user_id", "room_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoomMember_room_id_joined_at_idx" ON "RoomMember"("room_id", "joined_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoomMember_user_id_idx" ON "RoomMember"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoomMessage_room_id_sent_at_idx" ON "RoomMessage"("room_id", "sent_at");

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMessage" ADD CONSTRAINT "RoomMessage_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMessage" ADD CONSTRAINT "RoomMessage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
