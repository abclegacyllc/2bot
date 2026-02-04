-- Remove legacy quota fields from Department and DepartmentMember
-- These fields have been migrated to DeptAllocation and MemberAllocation tables

-- Run the data migration script BEFORE applying this migration:
-- npx tsx scripts/migrate-legacy-quotas.ts

-- Drop legacy columns from departments table
ALTER TABLE "departments" DROP COLUMN IF EXISTS "max_workflows";
ALTER TABLE "departments" DROP COLUMN IF EXISTS "max_plugins";
ALTER TABLE "departments" DROP COLUMN IF EXISTS "max_workflow_runs";
ALTER TABLE "departments" DROP COLUMN IF EXISTS "max_storage";

-- Drop legacy columns from department_members table
ALTER TABLE "department_members" DROP COLUMN IF EXISTS "max_workflows";
ALTER TABLE "department_members" DROP COLUMN IF EXISTS "max_plugins";
