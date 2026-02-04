-- Float Credits with Pending Accumulation
-- This migration:
-- 1. Adds pendingCredits column to credit_wallets for accumulating fractional credits
-- 2. Converts credits_used in ai_usage from INT to FLOAT for precise tracking

-- Step 1: Add pending_credits column to credit_wallets
ALTER TABLE "credit_wallets" ADD COLUMN "pending_credits" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Step 2: Convert credits_used from INT to FLOAT in ai_usage
-- This preserves existing integer values as floats (e.g., 1 -> 1.0)
ALTER TABLE "ai_usage" ALTER COLUMN "credits_used" TYPE DOUBLE PRECISION USING "credits_used"::DOUBLE PRECISION;
