/**
 * Resource Types
 * 
 * Shared type definitions for resource status.
 * Used by useResourceStatus hook and ResourceOverview component.
 * 
 * @module components/resources/resource-context
 */

import type {
    OrgDeptResourceStatus,
    OrgMemberResourceStatus,
    OrgResourceStatus,
    PersonalResourceStatus,
} from "@/shared/types/resources";

/**
 * Union of all resource status types
 */
export type ResourceStatus = 
  | PersonalResourceStatus 
  | OrgResourceStatus 
  | OrgDeptResourceStatus 
  | OrgMemberResourceStatus;

/**
 * Resource context value — return type for useResourceStatus hook
 */
export interface ResourceContextValue {
  /** Current resource status (null while loading) */
  status: ResourceStatus | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh the resource status */
  refresh: () => Promise<void>;
}
