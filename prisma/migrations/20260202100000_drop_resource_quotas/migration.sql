-- Drop deprecated ResourceQuota table
-- 
-- This table was replaced by:
-- - DeptAllocation (for department resource limits)
-- - MemberAllocation (for member resource limits)
-- - Redis via usageTracker service (for usage tracking)
-- - resourceService.get*Status() methods (for status queries)
--
-- Data in this table is no longer used by the application.
-- If you need to preserve the data, export it before running this migration.

-- Drop indexes first
DROP INDEX IF EXISTS "resource_quotas_organization_id_idx";
DROP INDEX IF EXISTS "resource_quotas_department_id_idx";
DROP INDEX IF EXISTS "resource_quotas_user_id_idx";

-- Drop the table
DROP TABLE IF EXISTS "resource_quotas";
