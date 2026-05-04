-- Add category column to credit_transactions for DB-level filtering
-- Previously category was stored only inside the metadata JSON field,
-- which made category filtering require in-memory post-processing and
-- caused incorrect pagination counts when a category filter was active.

ALTER TABLE "credit_transactions" ADD COLUMN "category" TEXT;

-- Backfill existing rows from metadata JSON
UPDATE "credit_transactions"
SET "category" = "metadata"->>'category'
WHERE "metadata" IS NOT NULL
  AND "metadata"->>'category' IS NOT NULL;

-- Index for efficient category filtering
CREATE INDEX "credit_transactions_category_idx" ON "credit_transactions"("category");
