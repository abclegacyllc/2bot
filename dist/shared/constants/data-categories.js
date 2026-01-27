"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TENANT_TABLE_DOMAINS = exports.TENANT_TABLES = exports.PLATFORM_TABLES = void 0;
exports.isTenantTable = isTenantTable;
exports.isPlatformTable = isPlatformTable;
exports.getTableCategory = getTableCategory;
exports.getTenantTablesForDomain = getTenantTablesForDomain;
// ===========================================
// Platform Tables
// ===========================================
/**
 * Platform tables - always in main database
 * These handle identity, billing, and platform operations
 */
exports.PLATFORM_TABLES = [
    // Identity & Auth
    'User', // Identity (email, password, role)
    'Session', // Auth sessions
    'PasswordResetToken', // Password reset tokens
    // Organization (metadata only - operational data is tenant)
    'Organization', // Org registry
    'Membership', // User-Org relationships
    'Department', // Dept metadata
    // Billing & Subscriptions
    'Plan', // Plan definitions
    'Subscription', // Billing subscriptions
    'Invoice', // Billing invoices
    'Payment', // Payment records
    // Platform Operations
    'AuditLog', // Platform-wide audit (security)
    'SupportTicket', // Support system
    'FAQ', // Help content
    // Shared Definitions (used by tenants but defined at platform level)
    'Plugin', // Plugin definitions (not installations)
];
// ===========================================
// Tenant Tables
// ===========================================
/**
 * Tenant tables - can be isolated per user/org
 * These contain operational data that scales with usage
 */
exports.TENANT_TABLES = [
    // Gateway System
    'Gateway', // User's bot/AI connections
    'GatewayCredential', // Encrypted credentials
    // Plugin System
    'UserPlugin', // Installed plugins (tenant-specific)
    // Workflow System (Phase 5+)
    'Workflow', // Workflow definitions
    'WorkflowStep', // Workflow steps
    'WorkflowRun', // Execution history
    'WorkflowStepRun', // Step execution details
    // Messaging (High Volume)
    'Message', // Chat messages
    'Conversation', // Chat threads
    // Analytics & Metrics
    'AnalyticsEvent', // Usage analytics
    'ResourceUsage', // Quota tracking
    // Credits & Usage
    'CreditBalance', // User credits
    'CreditTransaction', // Credit history
    // User Preferences
    'UserTheme', // Theme preferences
    'UserWidget', // Widget configs
    'DashboardLayout', // Dashboard layout
];
// ===========================================
// Helper Functions
// ===========================================
/**
 * Check if a table is tenant-isolatable
 * Tenant tables can potentially be stored in isolated databases
 */
function isTenantTable(table) {
    return exports.TENANT_TABLES.includes(table);
}
/**
 * Check if a table must stay in platform DB
 * Platform tables are never isolated - they're shared across all tenants
 */
function isPlatformTable(table) {
    return exports.PLATFORM_TABLES.includes(table);
}
/**
 * Get the category of a table
 */
function getTableCategory(table) {
    if (isPlatformTable(table))
        return 'platform';
    if (isTenantTable(table))
        return 'tenant';
    return 'unknown';
}
/**
 * Get all tenant tables for a specific domain
 */
exports.TENANT_TABLE_DOMAINS = {
    gateway: ['Gateway', 'GatewayCredential'],
    plugin: ['UserPlugin'],
    workflow: ['Workflow', 'WorkflowStep', 'WorkflowRun', 'WorkflowStepRun'],
    messaging: ['Message', 'Conversation'],
    analytics: ['AnalyticsEvent', 'ResourceUsage'],
    credits: ['CreditBalance', 'CreditTransaction'],
    preferences: ['UserTheme', 'UserWidget', 'DashboardLayout'],
};
/**
 * Get tenant tables for a specific domain
 */
function getTenantTablesForDomain(domain) {
    return exports.TENANT_TABLE_DOMAINS[domain];
}
//# sourceMappingURL=data-categories.js.map