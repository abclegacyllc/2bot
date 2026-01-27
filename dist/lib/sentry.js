"use strict";
/**
 * Sentry Utilities
 *
 * Helper functions for Sentry error tracking:
 * - Set user context
 * - Capture errors with context
 * - Add breadcrumbs
 *
 * @module lib/sentry
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSentryUser = setSentryUser;
exports.clearSentryUser = clearSentryUser;
exports.setSentryOrganization = setSentryOrganization;
exports.clearSentryOrganization = clearSentryOrganization;
exports.captureError = captureError;
exports.addBreadcrumb = addBreadcrumb;
exports.captureMessage = captureMessage;
exports.startTransaction = startTransaction;
const Sentry = __importStar(require("@sentry/nextjs"));
/**
 * Set the current user context in Sentry.
 * Call this after user login to attach user info to all errors.
 */
function setSentryUser(user) {
    Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.name,
    });
    // Add plan as a tag for filtering
    if (user.plan) {
        Sentry.setTag("user.plan", user.plan);
    }
}
/**
 * Clear the user context (call on logout).
 */
function clearSentryUser() {
    Sentry.setUser(null);
}
/**
 * Set the organization context.
 * Call this when user switches to org context.
 */
function setSentryOrganization(org) {
    Sentry.setTag("organization.id", org.id);
    Sentry.setTag("organization.name", org.name);
    if (org.plan) {
        Sentry.setTag("organization.plan", org.plan);
    }
}
/**
 * Clear organization context.
 */
function clearSentryOrganization() {
    Sentry.setTag("organization.id", undefined);
    Sentry.setTag("organization.name", undefined);
    Sentry.setTag("organization.plan", undefined);
}
/**
 * Capture an error with additional context.
 */
function captureError(error, context) {
    Sentry.withScope((scope) => {
        if (context?.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value);
            });
        }
        if (context?.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
        }
        if (context?.level) {
            scope.setLevel(context.level);
        }
        Sentry.captureException(error);
    });
}
/**
 * Add a breadcrumb for debugging.
 * Breadcrumbs help trace the user's path before an error.
 */
function addBreadcrumb(message, category, data, level = "info") {
    Sentry.addBreadcrumb({
        message,
        category,
        data,
        level,
        timestamp: Date.now() / 1000,
    });
}
/**
 * Capture a message (non-error event).
 */
function captureMessage(message, level = "info") {
    Sentry.captureMessage(message, level);
}
/**
 * Start a transaction for performance monitoring.
 * Returns a function to finish the transaction.
 */
function startTransaction(name, op) {
    const transaction = Sentry.startInactiveSpan({
        name,
        op,
    });
    return () => {
        transaction?.end();
    };
}
//# sourceMappingURL=sentry.js.map