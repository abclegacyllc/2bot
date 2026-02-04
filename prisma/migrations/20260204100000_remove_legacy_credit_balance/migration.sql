-- Remove legacy CreditBalance model
-- The credit_balances table is replaced by credit_wallets which supports both personal and org credits

-- Step 1: Remove foreign key constraint from credit_transactions
ALTER TABLE "credit_transactions" DROP CONSTRAINT IF EXISTS "credit_transactions_credit_balance_id_fkey";

-- Step 2: Drop the index on credit_balance_id
DROP INDEX IF EXISTS "credit_transactions_credit_balance_id_idx";

-- Step 3: Remove the credit_balance_id column from credit_transactions
ALTER TABLE "credit_transactions" DROP COLUMN IF EXISTS "credit_balance_id";

-- Step 4: Drop the legacy credit_balances table
DROP TABLE IF EXISTS "credit_balances";
