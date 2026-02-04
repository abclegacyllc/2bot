/**
 * Resource Module
 * 
 * Manages resources across 4 contexts:
 * - Personal (user owns directly)
 * - Organization (shared pools)
 * - Department (allocated from org)
 * - Member (allocated from dept)
 * 
 * ============================================================
 * EXPORTS
 * ============================================================
 * 
 * Services:
 *   • resourceService  - Get resource status for any context
 *   • allocationService - Manage org→dept→member allocations
 *   • usageTracker     - Track usage metrics
 * 
 * Types:
 *   • All types from @/shared/types/resources
 *   • Module-specific types (ResourceOwner, ResourceCheckResult, etc.)
 * 
 * @module modules/resource
 */

// ===========================================
// Services
// ===========================================

export { allocationService } from './allocation.service';
export { resourceService } from './resource.service';
export { usageTracker } from './usage-tracker.service';

// ===========================================
// Types
// ===========================================

export * from './resource.types';

// ===========================================
// Validation Schemas
// ===========================================

export * from './resource.validation';
