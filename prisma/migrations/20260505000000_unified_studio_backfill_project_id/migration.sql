-- =============================================================================
-- Backfill nullable project_id FKs and make them NOT NULL
--
-- Phase 5 of the unified Studio refactor. Up to this migration the
-- `projectId` columns on `gateways`, `workflows`, and `user_plugins` were
-- nullable to allow incremental rollout. The unified Studio now makes
-- "every resource lives in a Project" a hard invariant.
--
-- Strategy:
--   1. For every (user_id, organization_id) tuple that still has orphan
--      rows, ensure a default Project exists (creating "Default" if needed).
--   2. Backfill orphan rows to point at that default Project.
--   3. Switch the three columns to NOT NULL.
--   4. Replace `ON DELETE SET NULL` (which would now violate NOT NULL) with
--      `ON DELETE CASCADE`. Deleting a Project cascades to its gateways /
--      workflows / plugin installs, mirroring the existing
--      `project_resources -> projects` relation.
-- =============================================================================

-- 1. Create default Projects for any orphan tuples that lack one.
INSERT INTO projects (
  id,
  user_id,
  organization_id,
  name,
  slug,
  kind,
  status,
  is_default,
  created_at,
  updated_at
)
SELECT DISTINCT
  'p' || replace(gen_random_uuid()::text, '-', ''),
  t.user_id,
  t.organization_id,
  'Default',
  'default',
  'HYBRID'::"ProjectKind",
  'ACTIVE'::"ProjectStatus",
  TRUE,
  NOW(),
  NOW()
FROM (
  SELECT user_id, organization_id FROM gateways      WHERE project_id IS NULL
  UNION
  SELECT user_id, organization_id FROM workflows     WHERE project_id IS NULL
  UNION
  SELECT user_id, organization_id FROM user_plugins  WHERE project_id IS NULL
) t
WHERE NOT EXISTS (
  SELECT 1 FROM projects p
  WHERE p.user_id = t.user_id
    AND p.organization_id IS NOT DISTINCT FROM t.organization_id
    AND p.is_default = TRUE
);

-- 2a. Backfill gateways.project_id
UPDATE gateways g
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.user_id = g.user_id
    AND p.organization_id IS NOT DISTINCT FROM g.organization_id
    AND p.is_default = TRUE
  LIMIT 1
)
WHERE g.project_id IS NULL;

-- 2b. Backfill workflows.project_id
UPDATE workflows w
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.user_id = w.user_id
    AND p.organization_id IS NOT DISTINCT FROM w.organization_id
    AND p.is_default = TRUE
  LIMIT 1
)
WHERE w.project_id IS NULL;

-- 2c. Backfill user_plugins.project_id
UPDATE user_plugins u
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.user_id = u.user_id
    AND p.organization_id IS NOT DISTINCT FROM u.organization_id
    AND p.is_default = TRUE
  LIMIT 1
)
WHERE u.project_id IS NULL;

-- 3. Enforce NOT NULL.
ALTER TABLE gateways     ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE workflows    ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE user_plugins ALTER COLUMN project_id SET NOT NULL;

-- 4. Tighten ON DELETE behaviour: SET NULL → CASCADE (column is now NOT NULL).
ALTER TABLE gateways
  DROP CONSTRAINT IF EXISTS gateways_project_id_fkey,
  ADD  CONSTRAINT gateways_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE workflows
  DROP CONSTRAINT IF EXISTS workflows_project_id_fkey,
  ADD  CONSTRAINT workflows_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE user_plugins
  DROP CONSTRAINT IF EXISTS user_plugins_project_id_fkey,
  ADD  CONSTRAINT user_plugins_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE;
