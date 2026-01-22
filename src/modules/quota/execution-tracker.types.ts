/**
 * Execution Tracker Types
 *
 * Types for tracking workflow/API executions and usage limits.
 *
 * @module modules/quota/execution-tracker.types
 */

// ===========================================
// Warning Levels
// ===========================================

export type WarningLevel = 'none' | 'warning' | 'critical' | 'blocked';

// Warning thresholds
export const WARNING_THRESHOLDS = {
  WARNING: 80,   // 80% - show warning
  CRITICAL: 95,  // 95% - critical warning
  BLOCKED: 100,  // 100% - blocked
} as const;

// ===========================================
// Execution Count
// ===========================================

export interface ExecutionCount {
  current: number;
  limit: number | null;      // null = unlimited (workspace mode)
  percentage: number;        // 0-100
  periodStart: Date;
  periodEnd: Date;
  isServerless: boolean;     // true = has execution limits
}

// ===========================================
// Can Execute Result
// ===========================================

export interface CanExecuteResult {
  allowed: boolean;
  reason?: 'limit_reached' | 'soft_cap' | 'hard_cap';
  warningLevel: WarningLevel;
  current: number;
  limit: number | null;
  message?: string;
}

// ===========================================
// Track Result
// ===========================================

export interface TrackResult {
  success: boolean;
  newCount: number;
  warningLevel: WarningLevel;
  message?: string;
}

// ===========================================
// Usage Summary
// ===========================================

export interface UsageSummary {
  executions: ExecutionCount;
  gateways: ExecutionResourceUsage;
  workflows: ExecutionResourceUsage;
  plugins: ExecutionResourceUsage;
  aiTokens: ExecutionResourceUsage;
  storage: ExecutionResourceUsage;
}

export interface ExecutionResourceUsage {
  current: number;
  limit: number | null;
  percentage: number;
  warningLevel: WarningLevel;
}

// ===========================================
// Period Helpers
// ===========================================

/**
 * Get the start of the current billing month
 */
export function getCurrentPeriodStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get the end of the current billing month
 */
export function getCurrentPeriodEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get the start of the next billing month
 */
export function getNextPeriodStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}
