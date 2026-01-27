"use strict";
/**
 * Execution Tracker Types
 *
 * Types for tracking workflow/API executions and usage limits.
 *
 * @module modules/quota/execution-tracker.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WARNING_THRESHOLDS = void 0;
exports.getCurrentPeriodStart = getCurrentPeriodStart;
exports.getCurrentPeriodEnd = getCurrentPeriodEnd;
exports.getNextPeriodStart = getNextPeriodStart;
// Warning thresholds
exports.WARNING_THRESHOLDS = {
    WARNING: 80, // 80% - show warning
    CRITICAL: 95, // 95% - critical warning
    BLOCKED: 100, // 100% - blocked
};
// ===========================================
// Period Helpers
// ===========================================
/**
 * Get the start of the current billing month
 */
function getCurrentPeriodStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}
/**
 * Get the end of the current billing month
 */
function getCurrentPeriodEnd() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}
/**
 * Get the start of the next billing month
 */
function getNextPeriodStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}
//# sourceMappingURL=execution-tracker.types.js.map