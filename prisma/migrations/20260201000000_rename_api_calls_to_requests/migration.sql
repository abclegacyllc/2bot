-- Migration: Rename api_calls to requests for clarity
-- Purpose: 
--   - api_calls → requests (monitoring metric, not billing)
--   - max_api_calls → max_workflow_runs (billing limit)
-- This aligns terminology: "requests" for monitoring, "workflow_runs" for billing

-- ============================================
-- Step 1: Rename api_calls column to requests in usage_history
-- This represents HTTP request monitoring (not billed)
-- ============================================
ALTER TABLE "usage_history" RENAME COLUMN "api_calls" TO "requests";

-- ============================================
-- Step 2: Rename max_api_calls to max_workflow_runs
-- This is the billing limit (workflow runs per month)
-- ============================================

-- In departments table
ALTER TABLE "departments" RENAME COLUMN "max_api_calls" TO "max_workflow_runs";

-- In resource_quotas table
ALTER TABLE "resource_quotas" RENAME COLUMN "max_api_calls" TO "max_workflow_runs";

-- ============================================
-- Note: workflow_runs column in usage_history stays as-is
-- It correctly represents workflow run counts for billing
-- ============================================
