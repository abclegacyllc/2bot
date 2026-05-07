/**
 * Org-scoped project studio layout — re-exports the personal-scoped layout.
 *
 * Auth context auto-switches to "organization" because the URL begins with
 * `/organizations/[orgSlug]/...` (handled by AuthProvider). Every API call
 * inside `useProjectStudio()` therefore picks up the right `x-organization-id`
 * header automatically — no scope plumbing needed.
 */

export { default } from "@/app/studio/[projectId]/layout";
