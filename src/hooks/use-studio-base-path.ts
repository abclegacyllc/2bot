"use client";

/**
 * useStudioBasePath
 *
 * Returns the URL prefix for the current project studio shell, so links
 * and router.push() calls stay within the right scope tree:
 *
 *   - `/studio/[projectId]` for personal scope
 *   - `/organizations/[orgSlug]/studio/[projectId]` for org scope
 *
 * The org branch is detected from `usePathname()`, which mirrors how the
 * AuthProvider auto-switches `useAuth().context` for org URLs.
 */

import { usePathname } from "next/navigation";

export function useStudioBasePath(projectId: string): string {
  const pathname = usePathname();
  const orgMatch = pathname.match(/^\/organizations\/([^/]+)\//);
  if (orgMatch) {
    return `/organizations/${orgMatch[1]}/studio/${projectId}`;
  }
  return `/studio/${projectId}`;
}
