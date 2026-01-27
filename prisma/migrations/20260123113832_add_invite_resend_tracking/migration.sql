-- AlterTable
ALTER TABLE "org_invites" ADD COLUMN     "last_resent_at" TIMESTAMP(3),
ADD COLUMN     "resend_count" INTEGER NOT NULL DEFAULT 0;
