-- Add capability column to AIUsage and CreditRate tables
-- This supports the new universal AI capability naming system
-- The action column is deprecated but kept for backward compatibility

-- AIUsage: Add capability column (nullable to support gradual migration)
ALTER TABLE "ai_usage" ADD COLUMN "capability" TEXT;

-- Create index for queries by capability
CREATE INDEX "ai_usage_capability_created_at_idx" ON "ai_usage"("capability", "created_at");

-- CreditRate: Add capability column (nullable to support gradual migration)
ALTER TABLE "credit_rates" ADD COLUMN "capability" TEXT;

-- Create unique constraint for capability + model (nullable-safe)
CREATE UNIQUE INDEX "credit_rates_capability_model_key" ON "credit_rates"("capability", "model") WHERE "capability" IS NOT NULL;
