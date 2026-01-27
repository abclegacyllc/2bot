"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const constants_1 = require("@/shared/constants");
const errors_1 = require("@/shared/errors");
const express_1 = require("express");
const error_handler_1 = require("../middleware/error-handler");
const admin_1 = require("./admin");
const alerts_1 = require("./alerts");
const auth_1 = require("./auth");
const billing_1 = require("./billing");
const gateway_1 = require("./gateway");
const health_1 = require("./health");
const invites_1 = require("./invites");
const organization_1 = require("./organization");
const orgs_1 = require("./orgs");
const plugin_1 = require("./plugin");
const quota_1 = require("./quota");
const usage_1 = require("./usage");
const user_1 = require("./user");
const webhook_1 = require("./webhook");
exports.router = (0, express_1.Router)();
/**
 * Health check routes
 */
exports.router.use("/health", health_1.healthRouter);
/**
 * Auth routes
 */
exports.router.use("/auth", auth_1.authRouter);
/**
 * User routes (Phase 6.7) - Personal resources
 * /api/user/* for authenticated user's personal resources
 * Follows GitHub API pattern where /user/* = personal, /orgs/:id/* = organization
 */
exports.router.use("/user", user_1.userRouter);
/**
 * Organization routes (Phase 6.7) - Org resources by ID
 * /api/orgs/:orgId/* for organization-specific resources
 * Uses plural "orgs" to match GitHub API convention
 */
exports.router.use("/orgs", orgs_1.orgsRouter);
/**
 * Invites routes (Public)
 * /api/invites/:token for public invite access
 * Used directly by nginx in production
 */
exports.router.use("/invites", invites_1.invitesRouter);
/**
 * Organization routes (Phase 4) - Legacy
 * Organizations, members, invites, departments
 * Note: Consider migrating to /api/orgs/:orgId/* pattern
 */
exports.router.use("/organizations", organization_1.organizationRouter);
/**
 * Gateway routes (Phase 2)
 */
exports.router.use("/gateways", gateway_1.gatewayRouter);
/**
 * Webhook routes (Phase 2)
 * Note: No auth required - webhook auth is via gatewayId + optional secret
 */
exports.router.use("/webhooks", webhook_1.webhookRouter);
/**
 * Plugin routes (Phase 3)
 * /api/plugins - Public catalog
 * /api/plugins/user/* - User plugin management (auth required)
 */
exports.router.use("/plugins", plugin_1.pluginRouter);
/**
 * Quota routes (Phase 4)
 * Resource quota status, limits, and management
 */
exports.router.use("/quota", quota_1.quotaRouter);
/**
 * Usage routes (Phase 6.8)
 * Dashboard usage data and history
 */
exports.router.use("/usage", usage_1.usageRouter);
/**
 * Alert routes (Phase 4)
 * Alert configuration, history, and acknowledgements
 */
exports.router.use("/alerts", alerts_1.alertRouter);
/**
 * Billing routes (Phase 5)
 * Checkout, portal, subscription status
 */
exports.router.use("/billing", billing_1.billingRouter);
/**
 * Admin routes (Phase 6)
 * Platform administration and monitoring
 */
exports.router.use("/admin", admin_1.adminRouter);
/**
 * API info endpoint
 */
exports.router.get("/", (_req, res) => {
    res.json({
        success: true,
        data: {
            name: constants_1.APP_CONFIG.name,
            version: constants_1.APP_CONFIG.version,
            apiVersion: constants_1.APP_CONFIG.apiVersion,
        },
    });
});
/**
 * Error test endpoints (development only)
 */
if (process.env.NODE_ENV !== "production") {
    exports.router.get("/test-error/:type", (0, error_handler_1.asyncHandler)(async (req, _res) => {
        const { type } = req.params;
        switch (type) {
            case "bad-request":
                throw new errors_1.BadRequestError("This is a bad request test");
            case "unauthorized":
                throw new errors_1.UnauthorizedError("Authentication required");
            case "forbidden":
                throw new errors_1.ForbiddenError("You do not have permission");
            case "not-found":
                throw new errors_1.NotFoundError("Resource not found");
            case "validation":
                throw new errors_1.ValidationError("Validation failed", {
                    email: ["Email is required", "Email must be valid"],
                    password: ["Password must be at least 8 characters"],
                });
            case "rate-limit":
                throw new errors_1.RateLimitError("Too many requests", 60);
            case "internal":
                throw new Error("Unexpected internal error");
            default:
                throw new errors_1.BadRequestError(`Unknown error type: ${type}`);
        }
    }));
}
// Mount module routes here
// router.use("/users", userRoutes);    // Phase 1
// 404 handler for unmatched API routes
exports.router.use(error_handler_1.notFoundHandler);
//# sourceMappingURL=index.js.map