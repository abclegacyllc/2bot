/**
 * useOrganization Hook
 *
 * Resolves organization slug from URL to organization details.
 * Uses availableOrgs from auth context to avoid extra API calls.
 *
 * @module hooks/use-organization
 */

"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { useParams } from "next/navigation";
import { useMemo } from "react";

interface OrganizationFromSlug {
  /** Organization ID for API calls */
  orgId: string | null;
  /** Organization slug from URL */
  orgSlug: string | null;
  /** Organization name */
  orgName: string | null;
  /** User's role in this organization */
  orgRole: "ORG_OWNER" | "ORG_ADMIN" | "ORG_MEMBER" | null;
  /** Whether the org was found in available orgs */
  isFound: boolean;
  /** Whether we're still loading available orgs */
  isLoading: boolean;
}

/**
 * Hook to get organization details from URL slug.
 * 
 * Usage:
 * ```tsx
 * import { apiUrl } from "@/shared/config/urls";
 * 
 * const { orgId, orgSlug, orgName, isFound } = useOrganization();
 * 
 * // Use orgId for API calls with apiUrl()
 * fetch(apiUrl(`/orgs/${orgId}/members`))
 * ```
 */
export function useOrganization(): OrganizationFromSlug {
  const params = useParams();
  const { availableOrgs, isLoading: authLoading } = useAuth();

  // Get slug from URL params (could be [orgSlug] or [orgId] during migration)
  const slugFromUrl = (params.orgSlug || params.orgId) as string | undefined;

  const result = useMemo(() => {
    if (!slugFromUrl) {
      return {
        orgId: null,
        orgSlug: null,
        orgName: null,
        orgRole: null,
        isFound: false,
        isLoading: authLoading,
      };
    }

    // Try to find org by slug first, then by ID (for backwards compatibility)
    const org = availableOrgs.find(
      (o) => o.slug === slugFromUrl || o.id === slugFromUrl
    );

    if (!org) {
      return {
        orgId: null,
        orgSlug: slugFromUrl,
        orgName: null,
        orgRole: null,
        isFound: false,
        isLoading: authLoading,
      };
    }

    return {
      orgId: org.id,
      orgSlug: org.slug,
      orgName: org.name,
      orgRole: org.role,
      isFound: true,
      isLoading: false,
    };
  }, [slugFromUrl, availableOrgs, authLoading]);

  return result;
}

/**
 * Hook to build organization-aware URLs.
 * Uses slug for clean URLs.
 * 
 * Usage:
 * ```tsx
 * const { buildOrgUrl } = useOrgUrls();
 * 
 * // Returns "/organizations/abc-developers/members"
 * buildOrgUrl("/members")
 * ```
 */
export function useOrgUrls() {
  const { orgSlug } = useOrganization();

  const buildOrgUrl = (path: string) => {
    if (!orgSlug) return "/";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `/organizations/${orgSlug}${cleanPath}`;
  };

  return { buildOrgUrl };
}
