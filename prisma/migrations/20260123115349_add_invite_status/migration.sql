-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "org_invites" ADD COLUMN     "declined_at" TIMESTAMP(3),
ADD COLUMN     "status" "InviteStatus" NOT NULL DEFAULT 'PENDING';
