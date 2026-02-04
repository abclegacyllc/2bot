-- Create the credit_wallets table for the new universal credits system
-- This supports both personal (userId) and organization (organizationId) wallets

-- CreateTable
CREATE TABLE "credit_wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "organization_id" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime" INTEGER NOT NULL DEFAULT 0,
    "monthly_allocation" INTEGER NOT NULL DEFAULT 0,
    "monthly_used" INTEGER NOT NULL DEFAULT 0,
    "allocation_reset_at" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint for user_id (one personal wallet per user)
CREATE UNIQUE INDEX "credit_wallets_user_id_key" ON "credit_wallets"("user_id");

-- CreateIndex: Unique constraint for organization_id (one org wallet per org)
CREATE UNIQUE INDEX "credit_wallets_organization_id_key" ON "credit_wallets"("organization_id");

-- AddForeignKey: Link to users table
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Link to organizations table
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_organization_id_fkey" 
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add the credit_wallet_id column to credit_transactions for the new wallet reference
ALTER TABLE "credit_transactions" ADD COLUMN "credit_wallet_id" TEXT;

-- CreateIndex: Index on credit_wallet_id for efficient lookups
CREATE INDEX "credit_transactions_credit_wallet_id_idx" ON "credit_transactions"("credit_wallet_id");

-- AddForeignKey: Link transactions to wallets
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_credit_wallet_id_fkey" 
    FOREIGN KEY ("credit_wallet_id") REFERENCES "credit_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing credit_balances data to credit_wallets (personal wallets only)
INSERT INTO "credit_wallets" ("id", "user_id", "balance", "lifetime", "monthly_allocation", "monthly_used", "settings", "created_at", "updated_at")
SELECT 
    "id", 
    "user_id", 
    "balance", 
    "lifetime",
    "balance" as "monthly_allocation",  -- Initialize with current balance as allocation
    0 as "monthly_used",                 -- Start with 0 used
    "settings", 
    "created_at", 
    "updated_at"
FROM "credit_balances";

-- Update credit_transactions to link to credit_wallets instead of credit_balances
UPDATE "credit_transactions" 
SET "credit_wallet_id" = "credit_balance_id"
WHERE "credit_balance_id" IS NOT NULL;

-- CreateTable: Credit rates for configurable AI pricing
CREATE TABLE "credit_rates" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "credits_per_input_token" DOUBLE PRECISION,
    "credits_per_output_token" DOUBLE PRECISION,
    "credits_per_image" INTEGER,
    "credits_per_1k_chars" INTEGER,
    "credits_per_minute" INTEGER,
    "your_cost_per_1k_input" DECIMAL(10, 6),
    "your_cost_per_1k_output" DECIMAL(10, 6),
    "your_cost_per_unit" DECIMAL(10, 6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint on action + model
CREATE UNIQUE INDEX "credit_rates_action_model_key" ON "credit_rates"("action", "model");

-- CreateIndex: Index on is_active for efficient filtering
CREATE INDEX "credit_rates_is_active_idx" ON "credit_rates"("is_active");
