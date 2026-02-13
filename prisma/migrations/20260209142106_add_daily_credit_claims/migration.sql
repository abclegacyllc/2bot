-- AlterTable
ALTER TABLE "credit_wallets" ADD COLUMN     "last_claimed_at" TIMESTAMP(3),
ADD COLUMN     "monthly_claimed_total" INTEGER NOT NULL DEFAULT 0;
