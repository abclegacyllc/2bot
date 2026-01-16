/**
 * Data Categories for Multi-Tenant Architecture
 *
 * Defines which tables contain platform data vs tenant (operational) data.
 * This separation enables future database isolation without code changes.
 *
 * PLATFORM: Business/identity data - always in main database
 * TENANT: Operational data - can be isolated per user/org in future
 *
 * @module shared/constants/data-categories
 */

// ===========================================
// Platform Tables
// ===========================================

/**
 * Platform tables - always in main database
 * These handle identity, billing, and platform operations
 */
export const PLATFORM_TABLES = [
  // Identity & Auth
  'User',              // Identity (email, password, role)
  'Session',           // Auth sessions
  'PasswordResetToken', // Password reset tokens

  // Organization (metadata only - operational data is tenant)
  'Organization',      // Org registry
  'Membership',        // User-Org relationships
  'Department',        // Dept metadata

  // Billing & Subscriptions
  'Plan',              // Plan definitions
  'Subscription',      // Billing subscriptions
  'Invoice',           // Billing invoices
  'Payment',           // Payment records

  // Platform Operations
  'AuditLog',          // Platform-wide audit (security)
  'SupportTicket',     // Support system
  'FAQ',               // Help content

  // Shared Definitions (used by tenants but defined at platform level)
  'Plugin',            // Plugin definitions (not installations)
] as const;

// ===========================================
// Tenant Tables
// ===========================================

/**
 * Tenant tables - can be isolated per user/org
 * These contain operational data that scales with usage
 */
export const TENANT_TABLES = [
  // Gateway System
  'Gateway',            // User's bot/AI connections
  'GatewayCredential',  // Encrypted credentials

  // Plugin System
  'UserPlugin',         // Installed plugins (tenant-specific)

  // Workflow System (Phase 5+)
  'Workflow',           // Workflow definitions
  'WorkflowStep',       // Workflow steps
  'WorkflowRun',        // Execution history
  'WorkflowStepRun',    // Step execution details

  // Messaging (High Volume)
  'Message',            // Chat messages
  'Conversation',       // Chat threads

  // Analytics & Metrics
  'AnalyticsEvent',     // Usage analytics
  'ResourceUsage',      // Quota tracking

  // Credits & Usage
  'CreditBalance',      // User credits
  'CreditTransaction',  // Credit history

  // User Preferences
  'UserTheme',          // Theme preferences
  'UserWidget',         // Widget configs
  'DashboardLayout',    // Dashboard layout
] as const;

// ===========================================
// Types
// ===========================================

export type PlatformTable = (typeof PLATFORM_TABLES)[number];
export type TenantTable = (typeof TENANT_TABLES)[number];
export type AllTable = PlatformTable | TenantTable;

// ===========================================
// Helper Functions
// ===========================================

/**
 * Check if a table is tenant-isolatable
 * Tenant tables can potentially be stored in isolated databases
 */
export function isTenantTable(table: string): table is TenantTable {
  return (TENANT_TABLES as readonly string[]).includes(table);
}

/**
 * Check if a table must stay in platform DB
 * Platform tables are never isolated - they're shared across all tenants
 */
export function isPlatformTable(table: string): table is PlatformTable {
  return (PLATFORM_TABLES as readonly string[]).includes(table);
}

/**
 * Get the category of a table
 */
export function getTableCategory(table: string): 'platform' | 'tenant' | 'unknown' {
  if (isPlatformTable(table)) return 'platform';
  if (isTenantTable(table)) return 'tenant';
  return 'unknown';
}

/**
 * Get all tenant tables for a specific domain
 */
export const TENANT_TABLE_DOMAINS = {
  gateway: ['Gateway', 'GatewayCredential'] as const,
  plugin: ['UserPlugin'] as const,
  workflow: ['Workflow', 'WorkflowStep', 'WorkflowRun', 'WorkflowStepRun'] as const,
  messaging: ['Message', 'Conversation'] as const,
  analytics: ['AnalyticsEvent', 'ResourceUsage'] as const,
  credits: ['CreditBalance', 'CreditTransaction'] as const,
  preferences: ['UserTheme', 'UserWidget', 'DashboardLayout'] as const,
} as const;

export type TenantDomain = keyof typeof TENANT_TABLE_DOMAINS;

/**
 * Get tenant tables for a specific domain
 */
export function getTenantTablesForDomain(domain: TenantDomain): readonly TenantTable[] {
  return TENANT_TABLE_DOMAINS[domain];
}
