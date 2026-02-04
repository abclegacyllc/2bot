/**
 * Resource Hierarchy Types
 * 
 * ============================================================
 * 🔑 KEY CONCEPT: 4 RESOURCE STATUS TYPES
 * ============================================================
 * 
 * ROOT CONTEXTS (can exist independently):
 *   • 'personal'     → PersonalResourceStatus (user owns directly)
 *   • 'organization' → OrgResourceStatus (org owns shared pools)
 * 
 * ORG SUB-CONTEXTS (ONLY exist within organization):
 *   • 'department'   → OrgDeptResourceStatus (allocated FROM org)
 *   • 'member'       → OrgMemberResourceStatus (allocated FROM dept)
 * 
 * ⚠️  IMPORTANT: 'department' and 'member' are NOT standalone.
 *     They ALWAYS have organizationId because they exist WITHIN an org.
 * 
 * ============================================================
 * 
 * PERSONAL CONTEXT (User owns resources directly)
 * ```
 * Personal Account
 * ├── AUTOMATION (direct ownership)
 * │   ├── Gateways [owned] → requests
 * │   ├── Plugins [owned] → executions
 * │   └── Workflows [owned] → runs, steps
 * │
 * ├── WORKSPACE (if paid plan)
 * │   └── Compute + Storage
 * │
 * └── BILLING
 *     ├── Credits (AI, marketplace)
 *     └── Subscription (plan features)
 * ```
 * 
 * ORGANIZATION CONTEXT (Shared + Allocated pools)
 * ```
 * Organization (SHARED POOLS)
 * ├── AUTOMATION POOL
 * │   ├── Gateways [shared] → requests
 * │   ├── Plugins [shared] → executions  
 * │   └── Workflows [shared] → runs
 * │
 * ├── WORKSPACE POOL (if paid plan)
 * │   └── Compute + Storage [shared]
 * │
 * ├── BILLING
 * │   ├── Credits [shared budget]
 * │   └── Subscription (seats, features)
 * │
 * └── ALLOCATIONS (distributed to departments/members)
 *     ├── Department Allocations (ORG SUB-CONTEXT)
 *     │   └── Allocated FROM org pool
 *     │
 *     └── Member Allocations (ORG SUB-CONTEXT)
 *         └── Allocated FROM department
 * ```
 * 
 * @module shared/types/resources
 */

// ===========================================
// BASE TYPES
// ===========================================

/**
 * Count-based quota for discrete resources
 * Use for: Gateways, Plugins, Workflows, Departments, Members
 */
export interface CountQuota {
  used: number;
  limit: number | null;  // null = unlimited
  percentage: number;    // 0-100
  isUnlimited: boolean;
}

/**
 * Usage-based metric for consumption tracking
 * Use for: Workflow runs, API calls, AI tokens
 */
export interface UsageMetric {
  current: number;
  limit: number | null;
  period: 'hourly' | 'daily' | 'monthly';
  resetsAt: string | null;
  percentage: number;
  isUnlimited: boolean;
}

/**
 * Allocation-based resource for infrastructure
 * Use for: RAM, CPU, Storage
 */
export interface AllocationQuota {
  allocated: number;     // Current allocation
  limit: number | null;  // Max allowed
  unit: 'MB' | 'GB' | 'cores' | 'vCPU';
  percentage: number;
  isUnlimited: boolean;
}

// ===========================================
// AUTOMATION POOL
// Core automation resources and their metrics
// ===========================================

/**
 * Gateway resource with usage metrics
 */
export interface GatewayResource {
  /** How many gateways exist */
  count: CountQuota;
  /** Gateway usage metrics */
  metrics: {
    /** HTTP requests processed (monitoring) */
    requests: UsageMetric;
  };
}

/**
 * Plugin resource with usage metrics
 */
export interface PluginResource {
  /** How many plugins installed */
  count: CountQuota;
  /** Plugin usage metrics */
  metrics: {
    /** Plugin executions per period */
    executions: UsageMetric;
  };
}

/**
 * Workflow resource with usage metrics
 */
export interface WorkflowResource {
  /** How many workflows exist */
  count: CountQuota;
  /** Workflow usage metrics */
  metrics: {
    /** Workflow executions per period (BILLING METRIC) */
    runs: UsageMetric;
    /** Total steps executed (for step-based billing if needed) */
    steps: UsageMetric;
  };
}

/**
 * Complete automation pool
 */
export interface AutomationPool {
  gateways: GatewayResource;
  plugins: PluginResource;
  workflows: WorkflowResource;
}

// ===========================================
// WORKSPACE POOL
// Infrastructure resources for workspace mode
// ===========================================

/**
 * Compute resources (RAM + CPU bundled)
 */
export interface ComputeResource {
  ram: AllocationQuota;
  cpu: AllocationQuota;
}

/**
 * Storage resource
 */
export interface StorageResource {
  /** Workspace/container storage */
  allocation: AllocationQuota;
}

/**
 * Complete workspace pool (null for serverless mode)
 */
export interface WorkspacePool {
  compute: ComputeResource;
  storage: StorageResource;
  /** Container count if applicable */
  containers?: CountQuota;
}

// ===========================================
// BILLING POOL
// Financial and subscription resources
// ===========================================

/**
 * AI usage breakdown within credits
 * 
 * These are all SUB-METRICS of Credits:
 * - credits.usage.ai.chat (CREDITS_AI_CHAT)
 * - credits.usage.ai.images (CREDITS_AI_IMAGES)
 * - etc.
 */
export interface AIUsageBreakdown {
  /** AI chat token usage (credits consumed) */
  chat: UsageMetric;
  /** AI image generation usage (credits consumed) */
  images: UsageMetric;
  /** Text-to-speech usage (credits consumed) */
  tts: UsageMetric;
  /** Speech-to-text usage (credits consumed) */
  stt: UsageMetric;
  /** Total AI credits used */
  total: UsageMetric;
}

/**
 * Credits/wallet resource with breakdown
 * 
 * HIERARCHY:
 * credits (main resource)
 * └── usage (metrics)
 *     ├── ai (breakdown of AI credit usage)
 *     │   ├── chat
 *     │   ├── images
 *     │   ├── tts
 *     │   ├── stt
 *     │   └── total
 *     ├── marketplace (marketplace credit usage)
 *     └── total (all credits used)
 */
export interface CreditsResource {
  /** Current balance */
  balance: number;
  /** Monthly budget (null = pay-as-you-go) */
  monthlyBudget: number | null;
  /** 
   * Usage breakdown (all are SUB-METRICS of credits)
   * Access pattern: credits.usage.ai.chat, credits.usage.marketplace
   */
  usage: {
    /** AI API consumption (grouped breakdown) */
    ai: AIUsageBreakdown;
    /** Marketplace purchases (single metric) */
    marketplace: UsageMetric;
    /** Total credits used across all categories */
    total: UsageMetric;
  };
  /** Reset date for monthly plans */
  resetsAt: string | null;
}

/**
 * Subscription resource
 */
export interface SubscriptionResource {
  /** Team seats */
  seats: CountQuota;
  /** Departments (for org plans) */
  departments: CountQuota;
  /** Current plan name */
  plan: string;
  /** Plan type */
  planType: string;
  /** Available features */
  features: {
    sso: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
    auditLogs: boolean;
    apiAccess: boolean;
    dedicatedDatabase: boolean;
  };
}

/**
 * Complete billing pool
 */
export interface BillingPool {
  credits: CreditsResource;
  subscription: SubscriptionResource;
}

// ===========================================
// CONTEXT TYPES
// ===========================================
// 
// 4 RESOURCE STATUS TYPES:
// ┌─────────────────────────────────────────────────────────────┐
// │  PersonalResourceStatus    → 'personal' (ROOT)              │
// │  OrgResourceStatus         → 'organization' (ROOT)          │
// │  OrgDeptResourceStatus     → 'department' (within org)      │
// │  OrgMemberResourceStatus   → 'member' (within org/dept)     │
// └─────────────────────────────────────────────────────────────┘
//
// NOTE: OrgDept and OrgMember are NOT standalone.
// They only exist within an organization context.
// ===========================================

/**
 * All resource context types
 * - 'personal': Individual user owns resources directly
 * - 'organization': Company/team owns shared pools
 * - 'department': Manager view of allocated resources (within org)
 * - 'member': Individual view of allocated resources (within org/dept)
 * 
 * Use type guards to narrow: isPersonalContext(), isOrgContext(), 
 * isOrgDeptContext(), isOrgMemberContext()
 */
export type ResourceContext = 'personal' | 'organization' | 'department' | 'member';

/**
 * Complete resource status for Personal accounts
 * Personal users own resources directly - no allocation hierarchy
 */
export interface PersonalResourceStatus {
  /** Context indicator */
  context: 'personal';
  
  /** User ID */
  userId: string;
  
  /** User's plan */
  plan: string;
  
  /** Execution mode determines workspace availability */
  executionMode: 'SERVERLESS' | 'WORKSPACE';
  
  /** Core automation resources (OWNED directly) */
  automation: AutomationPool;
  
  /** Infrastructure resources (null for serverless) */
  workspace: WorkspacePool | null;
  
  /** Financial resources */
  billing: BillingPool;
  
  /** Data retention */
  historyDays: number;
}

/**
 * Complete resource status for Organizations
 * Organizations have SHARED pools that can be ALLOCATED to departments/members
 */
export interface OrgResourceStatus {
  /** Context indicator */
  context: 'organization';
  
  /** Organization ID */
  organizationId: string;
  
  /** Organization's plan */
  plan: string;
  
  /** Execution mode */
  executionMode: 'SERVERLESS' | 'WORKSPACE';
  
  /** SHARED automation pool (total available to org) */
  automation: AutomationPool;
  
  /** SHARED infrastructure pool (null for ORG_FREE) */
  workspace: WorkspacePool | null;
  
  /** Financial resources */
  billing: BillingPool;
  
  /** Allocation summary: how much is distributed to departments */
  allocations: OrgAllocationSummary;
  
  /** Data retention */
  historyDays: number;
}

/**
 * Summary of how org resources are allocated
 */
export interface OrgAllocationSummary {
  /** Total allocated to departments */
  allocated: {
    gateways: number;
    plugins: number;
    workflows: number;
    creditBudget: number;
    ramMb: number;
    cpuCores: number;
    storageMb: number;
  };
  /** Remaining unallocated */
  unallocated: {
    gateways: number | null;  // null = unlimited
    plugins: number | null;
    workflows: number | null;
    creditBudget: number | null;
    ramMb: number | null;
    cpuCores: number | null;
    storageMb: number | null;
  };
  /** Number of departments */
  departmentCount: number;
  /** Number of members */
  memberCount: number;
}

/**
 * Department resource status (allocated FROM org pool)
 * 
 * HIERARCHY: Organization → Department → Member
 * This ONLY exists within an organization.
 * A department cannot exist without an organization.
 * 
 * Departments get ALLOCATED resources from org's shared pool.
 */
export interface OrgDeptResourceStatus {
  /** Context indicator */
  context: 'department';
  
  /** IDs */
  organizationId: string;
  departmentId: string;
  departmentName: string;
  isActive: boolean;
  
  /** ALLOCATED automation resources (from org pool) */
  automation: {
    gateways: AllocatedResource;
    plugins: AllocatedResource;
    workflows: AllocatedResource;
  };
  
  /** ALLOCATED workspace resources (from org pool) */
  workspace: {
    ram: AllocatedResource;
    cpu: AllocatedResource;
    storage: AllocatedResource;
  } | null;
  
  /** ALLOCATED budget (from org credits) */
  budget: {
    credits: AllocatedResource;
  };
  
  /** Usage metrics within this department */
  usage: {
    workflowRuns: UsageMetric;
    pluginExecutions: UsageMetric;
    gatewayRequests: UsageMetric;
  };
  
  /** Sub-allocation summary: how much is distributed to members */
  memberAllocations: DeptAllocationSummary;
}

/**
 * Resource that has been allocated from a parent pool
 */
export interface AllocatedResource {
  /** Amount allocated to this entity */
  allocated: number | null;  // null = no explicit allocation (uses parent default)
  /** Amount currently used */
  used: number;
  /** Parent's limit (for reference) */
  parentLimit: number | null;
  /** Percentage of allocation used */
  percentage: number;
  /** Whether allocation is unlimited */
  isUnlimited: boolean;
}

/**
 * Summary of department's member allocations
 */
export interface DeptAllocationSummary {
  /** Total allocated to members */
  allocated: {
    gateways: number;
    workflows: number;
    creditBudget: number;
    ramMb: number;
  };
  /** Remaining for department's direct use or future members */
  unallocated: {
    gateways: number | null;
    workflows: number | null;
    creditBudget: number | null;
    ramMb: number | null;
  };
  /** Number of members in department */
  memberCount: number;
}

/**
 * Member resource status (allocated FROM department's allocation)
 * 
 * HIERARCHY: Organization → Department → Member
 * This ONLY exists within an organization.
 * A member ALWAYS has both organizationId and departmentId.
 * 
 * Members get ALLOCATED resources from their department's allocation.
 */
export interface OrgMemberResourceStatus {
  /** Context indicator */
  context: 'member';
  
  /** IDs */
  organizationId: string;
  departmentId: string;
  userId: string;
  memberName: string;
  role: string;
  
  /** ALLOCATED automation resources (from department) */
  automation: {
    gateways: AllocatedResource;
    workflows: AllocatedResource;
    // Note: Plugins typically not allocated per-member
  };
  
  /** ALLOCATED workspace resources (from department) */
  workspace: {
    ram: AllocatedResource;
    cpu: AllocatedResource;
    storage: AllocatedResource;
  } | null;
  
  /** ALLOCATED budget (from department credits) */
  budget: {
    credits: AllocatedResource;
  };
  
  /** Personal usage metrics */
  usage: {
    workflowRuns: UsageMetric;
    gatewayRequests: UsageMetric;
  };
}

// ===========================================
// UNIFIED RESOURCE STATUS (Union Type)
// ===========================================
// 
// All 4 resource status types:
// ┌─────────────────────────────────────────────┐
// │ PersonalResourceStatus    (ROOT)            │
// │ OrgResourceStatus         (ROOT)            │
// │ OrgDeptResourceStatus     (within org)      │
// │ OrgMemberResourceStatus   (within org/dept) │
// └─────────────────────────────────────────────┘
// ===========================================

/**
 * Unified resource status - can be any of the 4 contexts
 * Use type guards to narrow: isPersonalContext(), isOrgContext(), 
 * isOrgDeptContext(), isOrgMemberContext()
 */
export type ResourceStatus = 
  | PersonalResourceStatus 
  | OrgResourceStatus 
  | OrgDeptResourceStatus 
  | OrgMemberResourceStatus;

// ===========================================
// TYPE GUARDS
// ===========================================
// 
// 4 type guards for 4 resource status types:
//   • isPersonalContext()   → PersonalResourceStatus
//   • isOrgContext()        → OrgResourceStatus
//   • isOrgDeptContext()    → OrgDeptResourceStatus
//   • isOrgMemberContext()  → OrgMemberResourceStatus
// ===========================================

/**
 * Type guard for personal context
 * Personal users own resources directly - no organization
 */
export function isPersonalContext(status: ResourceStatus): status is PersonalResourceStatus {
  return status.context === 'personal';
}

/**
 * Type guard for organization context
 * Organization owns shared pools - can have departments/members
 */
export function isOrgContext(status: ResourceStatus): status is OrgResourceStatus {
  return status.context === 'organization';
}

/**
 * Type guard for organization department context
 * Departments get ALLOCATED resources from organization pool
 * ALWAYS has organizationId
 */
export function isOrgDeptContext(status: ResourceStatus): status is OrgDeptResourceStatus {
  return status.context === 'department';
}

/**
 * Type guard for organization member context
 * Members get ALLOCATED resources from department
 * ALWAYS has organizationId AND departmentId
 */
export function isOrgMemberContext(status: ResourceStatus): status is OrgMemberResourceStatus {
  return status.context === 'member';
}

// ===========================================
// RESOURCE TYPE ENUMS (SEPARATED)
// ===========================================

/**
 * Countable resources (things you CREATE)
 */
export enum CountableResource {
  GATEWAY = 'gateway',
  PLUGIN = 'plugin',
  WORKFLOW = 'workflow',
  DEPARTMENT = 'department',
  MEMBER = 'member',
}

/**
 * Usage metrics (things you CONSUME)
 * 
 * Naming convention: PARENT_metric
 * - GATEWAY_REQUESTS: requests metric of gateways
 * - WORKFLOW_RUNS: runs metric of workflows
 * - CREDITS_AI: AI usage metric of credits
 * - CREDITS_MARKETPLACE: marketplace usage metric of credits
 */
export enum UsageResource {
  // Automation metrics
  GATEWAY_REQUESTS = 'gateway_requests',
  PLUGIN_EXECUTIONS = 'plugin_executions',
  WORKFLOW_RUNS = 'workflow_runs',
  WORKFLOW_STEPS = 'workflow_steps',
  
  // Credits/billing metrics (sub-metrics of credits)
  CREDITS_AI = 'credits_ai',
  CREDITS_AI_CHAT = 'credits_ai_chat',
  CREDITS_AI_IMAGES = 'credits_ai_images',
  CREDITS_AI_TTS = 'credits_ai_tts',
  CREDITS_AI_STT = 'credits_ai_stt',
  CREDITS_MARKETPLACE = 'credits_marketplace',
  CREDITS_TOTAL = 'credits_total',
}

/**
 * Infrastructure resources (things you ALLOCATE)
 */
export enum InfraResource {
  RAM = 'ram',
  CPU = 'cpu',
  STORAGE = 'storage',
}

// ===========================================
// CONVERSION UTILITIES
// ===========================================

/**
 * Legacy quota item structure (for backward compatibility)
 * This matches the old QuotaItem interface from quota.ts
 */
export interface LegacyQuotaItem {
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
}

/**
 * Convert CountQuota to legacy QuotaItem format
 */
export function countToLegacy(quota: CountQuota): LegacyQuotaItem {
  return {
    used: quota.used,
    limit: quota.limit,
    percentage: quota.percentage,
    isUnlimited: quota.isUnlimited,
  };
}

/**
 * Convert UsageMetric to legacy QuotaItem format
 */
export function usageToLegacy(metric: UsageMetric): LegacyQuotaItem {
  return {
    used: metric.current,
    limit: metric.limit,
    percentage: metric.percentage,
    isUnlimited: metric.isUnlimited,
  };
}

/**
 * Convert AllocationQuota to legacy QuotaItem format
 */
export function allocationToLegacy(alloc: AllocationQuota): LegacyQuotaItem {
  return {
    used: alloc.allocated,
    limit: alloc.limit,
    percentage: alloc.percentage,
    isUnlimited: alloc.isUnlimited,
  };
}

// ===========================================
// UI HELPER TYPES (for future implementation)
// ===========================================

/**
 * Resource pool for dashboard display
 */
export interface ResourcePoolDisplay {
  id: 'automation' | 'workspace' | 'billing';
  title: string;
  icon: string;
  isAvailable: boolean;
  items: ResourceItemDisplay[];
}

/**
 * Individual resource item for display
 */
export interface ResourceItemDisplay {
  id: string;
  label: string;
  type: 'count' | 'usage' | 'allocation';
  value: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
  unit?: string;
  subItems?: ResourceItemDisplay[];
}

/**
 * Convert CountQuota to ResourceItemDisplay
 */
export function countToDisplay(
  id: string,
  label: string,
  quota: CountQuota
): ResourceItemDisplay {
  return {
    id,
    label,
    type: 'count',
    value: quota.used,
    limit: quota.limit,
    percentage: quota.percentage,
    isUnlimited: quota.isUnlimited,
  };
}

/**
 * Convert UsageMetric to ResourceItemDisplay
 */
export function usageToDisplay(
  id: string,
  label: string,
  metric: UsageMetric,
  unit?: string
): ResourceItemDisplay {
  return {
    id,
    label,
    type: 'usage',
    value: metric.current,
    limit: metric.limit,
    percentage: metric.percentage,
    isUnlimited: metric.isUnlimited,
    unit,
  };
}

/**
 * Convert AllocationQuota to ResourceItemDisplay
 */
export function allocationToDisplay(
  id: string,
  label: string,
  quota: AllocationQuota
): ResourceItemDisplay {
  return {
    id,
    label,
    type: 'allocation',
    value: quota.allocated,
    limit: quota.limit,
    percentage: quota.percentage,
    isUnlimited: quota.isUnlimited,
    unit: quota.unit,
  };
}

// ===========================================
// DASHBOARD DISPLAY BUILDERS
// ===========================================

/**
 * Build dashboard display for Personal context
 */
export function buildPersonalDashboard(status: PersonalResourceStatus): ResourcePoolDisplay[] {
  return [
    {
      id: 'automation',
      title: 'Automation',
      icon: 'Workflow',
      isAvailable: true,
      items: [
        countToDisplay('gateways', 'Gateways', status.automation.gateways.count),
        countToDisplay('plugins', 'Plugins', status.automation.plugins.count),
        countToDisplay('workflows', 'Workflows', status.automation.workflows.count),
      ],
    },
    {
      id: 'workspace',
      title: 'Workspace',
      icon: 'Server',
      isAvailable: status.workspace !== null,
      items: status.workspace ? [
        allocationToDisplay('ram', 'RAM', status.workspace.compute.ram),
        allocationToDisplay('cpu', 'CPU', status.workspace.compute.cpu),
        allocationToDisplay('storage', 'Storage', status.workspace.storage.allocation),
      ] : [],
    },
    {
      id: 'billing',
      title: 'Billing',
      icon: 'CreditCard',
      isAvailable: true,
      items: [
        {
          id: 'credits',
          label: 'Credits',
          type: 'usage',
          value: status.billing.credits.balance,
          limit: status.billing.credits.monthlyBudget,
          percentage: status.billing.credits.monthlyBudget 
            ? (status.billing.credits.balance / status.billing.credits.monthlyBudget) * 100 
            : 0,
          isUnlimited: status.billing.credits.monthlyBudget === null,
        },
      ],
    },
  ];
}

/**
 * Build dashboard display for Organization context
 */
export function buildOrgDashboard(status: OrgResourceStatus): ResourcePoolDisplay[] {
  return [
    {
      id: 'automation',
      title: 'Shared Automation Pool',
      icon: 'Workflow',
      isAvailable: true,
      items: [
        countToDisplay('gateways', 'Gateways', status.automation.gateways.count),
        countToDisplay('plugins', 'Plugins', status.automation.plugins.count),
        countToDisplay('workflows', 'Workflows', status.automation.workflows.count),
      ],
    },
    {
      id: 'workspace',
      title: 'Shared Workspace Pool',
      icon: 'Server',
      isAvailable: status.workspace !== null,
      items: status.workspace ? [
        allocationToDisplay('ram', 'RAM', status.workspace.compute.ram),
        allocationToDisplay('cpu', 'CPU', status.workspace.compute.cpu),
        allocationToDisplay('storage', 'Storage', status.workspace.storage.allocation),
      ] : [],
    },
    {
      id: 'billing',
      title: 'Billing',
      icon: 'CreditCard',
      isAvailable: true,
      items: [
        countToDisplay('seats', 'Seats', status.billing.subscription.seats),
        countToDisplay('departments', 'Departments', status.billing.subscription.departments),
      ],
    },
  ];
}

// ===========================================
// BACKWARD COMPATIBILITY RE-EXPORTS
// ===========================================
// These types are re-exported from quota.ts for gradual migration

// Re-export legacy types for backward compatibility
export type {
    AvailableDepartment,
    AvailableMember, DeptAllocationRecord, OrgAllocationSummary as LegacyOrgAllocationSummary, LegacyQuotaStatus, MemberAllocationRecord, QuotaAllocation, QuotaItem, UnallocatedResources
} from './quota';

// Re-export legacy conversion functions
export {
    orgToLegacyQuotaStatus, toLegacyQuotaStatus
} from './quota';

