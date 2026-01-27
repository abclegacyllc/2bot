"use strict";
/**
 * Alert Types
 *
 * Types for the resource monitoring alert system.
 *
 * @module modules/alerts/alert.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertSeverity = exports.AlertType = void 0;
// ===========================================
// Alert Type Enum
// ===========================================
var AlertType;
(function (AlertType) {
    // Resource alerts
    AlertType["QUOTA_WARNING"] = "quota_warning";
    AlertType["QUOTA_CRITICAL"] = "quota_critical";
    AlertType["QUOTA_EXCEEDED"] = "quota_exceeded";
    // Error alerts
    AlertType["ERROR_RATE_HIGH"] = "error_rate_high";
    AlertType["WORKFLOW_FAILED"] = "workflow_failed";
    AlertType["CIRCUIT_OPEN"] = "circuit_open";
    // Cost alerts
    AlertType["COST_WARNING"] = "cost_warning";
    AlertType["COST_EXCEEDED"] = "cost_exceeded";
    // Security alerts
    AlertType["SUSPICIOUS_ACTIVITY"] = "suspicious_activity";
    AlertType["EMERGENCY_STOP"] = "emergency_stop";
})(AlertType || (exports.AlertType = AlertType = {}));
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["INFO"] = "info";
    AlertSeverity["WARNING"] = "warning";
    AlertSeverity["CRITICAL"] = "critical";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
//# sourceMappingURL=alert.types.js.map