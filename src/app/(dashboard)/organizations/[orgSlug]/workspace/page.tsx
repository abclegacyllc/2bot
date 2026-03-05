"use client";

/**
 * Organization Workspace Dashboard
 *
 * Same workspace IDE experience but in organization context.
 * Redirects to the main workspace page component with org context
 * handled by the auth provider's context switcher.
 *
 * @module app/(dashboard)/organizations/[orgSlug]/workspace/page
 */

import WorkspacePage from "@/app/(dashboard)/workspace/page";

export default function OrgWorkspacePage() {
  return <WorkspacePage />;
}
