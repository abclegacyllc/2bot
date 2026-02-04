"use client";

/**
 * useResourceStatus Hook
 * 
 * Fetches resource status from the v2 API endpoint.
 * Returns the appropriate status type based on context.
 * 
 * Usage:
 * ```tsx
 * // Personal context
 * const { status, isLoading, error, refresh } = useResourceStatus();
 * 
 * // Organization context
 * const { status, isLoading, error, refresh } = useResourceStatus({ orgId: "org-123" });
 * 
 * // Department context
 * const { status, isLoading, error, refresh } = useResourceStatus({ 
 *   orgId: "org-123", 
 *   deptId: "dept-456" 
 * });
 * 
 * // Member context
 * const { status, isLoading, error, refresh } = useResourceStatus({ 
 *   orgId: "org-123", 
 *   deptId: "dept-456", 
 *   memberId: "user-789" 
 * });
 * ```
 * 
 * @module components/resources/use-resource-status
 */

import { useAuth } from "@/components/providers/auth-provider";
import { apiUrl } from "@/shared/config/urls";
import type {
  OrgDeptResourceStatus,
  OrgMemberResourceStatus,
  OrgResourceStatus,
  PersonalResourceStatus,
} from "@/shared/types/resources";
import { useCallback } from "react";
import useSWR from "swr";
import type { ResourceContextValue, ResourceStatus } from "./resource-context";

/**
 * Options for useResourceStatus hook
 */
export interface UseResourceStatusOptions {
  /** Organization ID for org/dept/member context */
  orgId?: string;
  /** Department ID for dept/member context */
  deptId?: string;
  /** Member ID for member context */
  memberId?: string;
  /** Refresh interval in milliseconds (0 to disable) */
  refreshInterval?: number;
}

/**
 * API response type
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Build the API URL based on context
 */
function buildApiUrl(options: UseResourceStatusOptions): string {
  const params = new URLSearchParams();
  
  if (options.orgId) params.set("orgId", options.orgId);
  if (options.deptId) params.set("deptId", options.deptId);
  if (options.memberId) params.set("memberId", options.memberId);
  
  const queryString = params.toString();
  return apiUrl(`/resources/status${queryString ? `?${queryString}` : ""}`);
}

/**
 * Create a fetcher with auth token
 */
function createFetcher(token: string | null) {
  return async (url: string): Promise<ResourceStatus> => {
    const headers: HeadersInit = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Failed to fetch" }));
      throw new Error(error.error || error.message || "Failed to fetch resource status");
    }
    
    const data: ApiResponse<ResourceStatus> = await res.json();
    return data.data;
  };
}

/**
 * Hook to fetch resource status
 * 
 * @param options Context options (orgId, deptId, memberId)
 * @returns Resource status, loading state, error, and refresh function
 */
export function useResourceStatus(
  options: UseResourceStatusOptions = {}
): ResourceContextValue {
  const { token } = useAuth();
  
  const url = token ? buildApiUrl(options) : null;
  const fetcher = createFetcher(token);
  
  const { data, error, isLoading, mutate } = useSWR<ResourceStatus, Error>(
    url,
    fetcher,
    {
      refreshInterval: options.refreshInterval ?? 0,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  );
  
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);
  
  return {
    status: data ?? null,
    isLoading,
    error: error ?? null,
    refresh,
  };
}

// =============================================
// Type guards for narrowing status types
// =============================================

/**
 * Check if status is PersonalResourceStatus
 */
export function isPersonalStatus(
  status: ResourceStatus | null
): status is PersonalResourceStatus {
  return status?.context === "personal";
}

/**
 * Check if status is OrgResourceStatus
 */
export function isOrgStatus(
  status: ResourceStatus | null
): status is OrgResourceStatus {
  return status?.context === "organization";
}

/**
 * Check if status is OrgDeptResourceStatus
 */
export function isOrgDeptStatus(
  status: ResourceStatus | null
): status is OrgDeptResourceStatus {
  return status?.context === "department";
}

/**
 * Check if status is OrgMemberResourceStatus
 */
export function isOrgMemberStatus(
  status: ResourceStatus | null
): status is OrgMemberResourceStatus {
  return status?.context === "member";
}
