-- Add ORG_FREE to OrgPlan enum (was missing from previous migrations)
ALTER TYPE "OrgPlan" ADD VALUE IF NOT EXISTS 'ORG_FREE';

-- Update default value to ORG_FREE (was incorrectly set to ORG_STARTER)
ALTER TABLE "organizations" ALTER COLUMN "org_plan" SET DEFAULT 'ORG_FREE'::"OrgPlan";
