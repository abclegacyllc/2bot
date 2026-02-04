-- Add credit usage tracking to department allocations
-- This enables enforcing creditBudget limits per department
ALTER TABLE "dept_allocations" ADD COLUMN "credit_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dept_allocations" ADD COLUMN "credit_reset_at" TIMESTAMP(3);

-- Add credit usage tracking to member allocations
-- This enables enforcing creditBudget limits per member
ALTER TABLE "member_allocations" ADD COLUMN "credit_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "member_allocations" ADD COLUMN "credit_reset_at" TIMESTAMP(3);

-- Add department tracking to AI usage for budget attribution
-- This allows tracking which department consumed credits
ALTER TABLE "ai_usage" ADD COLUMN "department_id" TEXT;

-- Index for efficient department budget queries
CREATE INDEX "ai_usage_department_id_billing_period_idx" ON "ai_usage"("department_id", "billing_period");
