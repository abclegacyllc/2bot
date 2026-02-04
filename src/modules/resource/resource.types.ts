/**
 * Resource Module Types
 * 
 * Re-exports all types from @/shared/types/resources and adds
 * module-specific types for services.
 * 
 * ============================================================
 * ARCHITECTURE: 4 Resource Status Types
 * ============================================================
 * 
 * ROOT CONTEXTS (independent):
 *   • PersonalResourceStatus  → user owns directly
 *   • OrgResourceStatus       → org owns shared pools
 * 
 * ORG SUB-CONTEXTS (within org only):
 *   • OrgDeptResourceStatus   → allocated FROM org
 *   • OrgMemberResourceStatus → allocated FROM dept
 * 
 * ============================================================
 * 
 * @module modules/resource/resource.types
 */

// ===========================================
// Re-export ALL types from shared resources
// ===========================================

export * from '@/shared/types/resources';

// ===========================================
// Service-specific Types
// ===========================================

/**
 * Resource types for counting (things you CREATE)
 */
export enum CountableResourceType {
  GATEWAY = 'gateway',
  PLUGIN = 'plugin',
  WORKFLOW = 'workflow',
  DEPARTMENT = 'department',
  MEMBER = 'member',
}

/**
 * Resource types for usage tracking (things you CONSUME)
 */
export enum UsageResourceType {
  WORKFLOW_RUNS = 'workflow_runs',
  WORKFLOW_STEPS = 'workflow_steps',
  GATEWAY_REQUESTS = 'gateway_requests',
  PLUGIN_EXECUTIONS = 'plugin_executions',
  CREDITS_TOTAL = 'credits_total',
  CREDITS_AI = 'credits_ai',
  CREDITS_MARKETPLACE = 'credits_marketplace',
}

/**
 * Resource types for infrastructure (things you ALLOCATE)
 */
export enum InfraResourceType {
  RAM = 'ram',
  CPU = 'cpu',
  STORAGE = 'storage',
}

/**
 * All resource types combined
 */
export type AnyResourceType = CountableResourceType | UsageResourceType | InfraResourceType;

// ===========================================
// Service Input/Output Types
// ===========================================

/**
 * Owner context for resource operations
 */
export interface ResourceOwner {
  /** Context type */
  type: 'personal' | 'organization' | 'department' | 'member';
  /** User ID (for personal or member) */
  userId?: string;
  /** Organization ID (for org, dept, member) */
  organizationId?: string;
  /** Department ID (for dept, member) */
  departmentId?: string;
}

/**
 * Result of checking if resource can be used
 */
export interface ResourceCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Current usage/count */
  current: number;
  /** Limit (null = unlimited) */
  limit: number | null;
  /** Resource type that was checked */
  resource: AnyResourceType;
  /** Human-readable message */
  message?: string;
}

/**
 * Period types for usage history
 */
export type PeriodType = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

/**
 * Usage record for history
 */
export interface UsageRecord {
  periodStart: Date;
  periodType: PeriodType;
  workflowRuns: number;
  workflowSteps: number;
  gatewayRequests: number;
  pluginExecutions: number;
  creditsUsed: number;
  errors: number;
}

// ===========================================
// Allocation Input Types
// ===========================================

/**
 * Department allocation input (from org pool)
 */
export interface DeptAllocationInput {
  /** Max gateways for this dept (null = no limit/inherit) */
  maxGateways?: number | null;
  /** Max plugins for this dept */
  maxPlugins?: number | null;
  /** Max workflows for this dept */
  maxWorkflows?: number | null;
  /** Credit budget for this dept */
  creditBudget?: number | null;
  /** RAM allocation in MB */
  ramMb?: number | null;
  /** CPU allocation in cores */
  cpuCores?: number | null;
  /** Storage allocation in MB */
  storageMb?: number | null;
}

/**
 * Member allocation input (from dept allocation)
 */
export interface MemberAllocationInput {
  /** Max gateways for this member */
  maxGateways?: number | null;
  /** Max workflows for this member */
  maxWorkflows?: number | null;
  /** Credit budget for this member */
  creditBudget?: number | null;
  /** RAM allocation in MB */
  ramMb?: number | null;
  /** CPU cores allocation */
  cpuCores?: number | null;
  /** Storage allocation in MB */
  storageMb?: number | null;
}

// ===========================================
// Enforcement Types
// ===========================================

/**
 * Allocation mode for resource enforcement
 * 
 * This is the NEW resource module's allocation mode.
 * NOT dependent on Prisma schema - Prisma will be migrated to match this.
 */
export enum ResourceAllocationMode {
  /** Soft cap - warn but allow exceeding */
  SOFT_CAP = 'SOFT_CAP',
  /** Hard cap - block when limit reached */
  HARD_CAP = 'HARD_CAP',
  /** Reserved - guaranteed minimum allocation */
  RESERVED = 'RESERVED',
}

/**
 * Where the limit comes from in the hierarchy
 */
export type LimitSource = 'member' | 'department' | 'organization' | 'plan';

/**
 * Effective limit after hierarchy resolution
 */
export interface EffectiveLimit {
  /** The limit value */
  limit: number | null;
  /** Where this limit came from */
  source: LimitSource;
  /** Allocation mode */
  mode: ResourceAllocationMode;
}

/**
 * Result of enforcement check
 */
export interface EnforcementResult {
  /** Whether allowed */
  allowed: boolean;
  /** Current count */
  current: number;
  /** Effective limit applied */
  effectiveLimit: EffectiveLimit;
  /** Warning if soft cap exceeded */
  warning?: string;
  /** Error if hard cap exceeded */
  error?: string;
}
