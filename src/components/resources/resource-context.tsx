"use client";

/**
 * Resource Context
 * 
 * React context for sharing resource status across components.
 * Provides the current resource status and refresh function.
 * 
 * @module components/resources/resource-context
 */

import type {
    OrgDeptResourceStatus,
    OrgMemberResourceStatus,
    OrgResourceStatus,
    PersonalResourceStatus,
} from "@/shared/types/resources";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Union of all resource status types
 */
export type ResourceStatus = 
  | PersonalResourceStatus 
  | OrgResourceStatus 
  | OrgDeptResourceStatus 
  | OrgMemberResourceStatus;

/**
 * Resource context value
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

/**
 * Resource context
 */
export const ResourceContext = createContext<ResourceContextValue | null>(null);

/**
 * Hook to access resource context
 * @throws Error if used outside ResourceProvider
 */
export function useResourceContext(): ResourceContextValue {
  const context = useContext(ResourceContext);
  if (!context) {
    throw new Error("useResourceContext must be used within a ResourceProvider");
  }
  return context;
}

/**
 * Resource provider props
 */
export interface ResourceProviderProps {
  children: ReactNode;
  value: ResourceContextValue;
}

/**
 * Resource provider component
 */
export function ResourceProvider({ children, value }: ResourceProviderProps) {
  return (
    <ResourceContext.Provider value={value}>
      {children}
    </ResourceContext.Provider>
  );
}
