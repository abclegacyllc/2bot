/**
 * Resource Components Index
 * 
 * UI components for displaying hierarchical resource status
 * using the new resource type system from Phase 2.
 * 
 * @module components/resources
 */

// Core Components
export { ResourceItemBar } from './resource-item-bar';
export { ResourceOverview } from './resource-overview';
export { ResourcePoolCard } from './resource-pool-card';

// Context Views
export { DeptResourceView } from './dept-resource-view';
export { MemberResourceView } from './member-resource-view';

// Context & Hooks
export { ResourceContext, ResourceProvider, useResourceContext } from './resource-context';
export { isOrgDeptStatus, isOrgMemberStatus, isOrgStatus, isPersonalStatus, useResourceStatus } from './use-resource-status';

// Types
export type { DeptResourceViewProps } from './dept-resource-view';
export type { MemberResourceViewProps } from './member-resource-view';
export type { ResourceContextValue, ResourceStatus } from './resource-context';
export type { ResourceItemBarProps, WarningLevel } from './resource-item-bar';
export type { ResourceOverviewProps } from './resource-overview';
export type { ResourcePoolCardProps, ResourcePoolItem } from './resource-pool-card';
export type { UseResourceStatusOptions } from './use-resource-status';

