"use strict";
/**
 * Invites Routes (Public-facing)
 *
 * These routes handle /api/invites/* which are called directly from the frontend
 * and from nginx in production (where /api/* goes to Express).
 *
 * @module server/routes/invites
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitesRouter = void 0;
const express_1 = require("express");
const organization_1 = require("@/modules/organization");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.invitesRouter = (0, express_1.Router)();
/**
 * Helper to get path parameter safely
 */
function getPathParam(req, param) {
    const value = req.params[param];
    if (!value || typeof value !== "string") {
        throw new Error(`Missing path parameter: ${param}`);
    }
    return value;
}
/**
 * GET /api/invites/:token
 *
 * Get pending invite details by token (public - no auth required)
 * Used to display invite info before user registers/accepts
 *
 * @param {string} token - Invite token
 */
exports.invitesRouter.get("/:token", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const token = getPathParam(req, "token");
    const invite = await organization_1.organizationService.getInviteByToken(token);
    if (!invite) {
        res.status(404).json({
            success: false,
            error: "Invitation not found or has expired",
        });
        return;
    }
    res.json({
        success: true,
        data: invite,
    });
}));
/**
 * POST /api/invites/:token/accept
 *
 * Accept a pending invite after user has registered/logged in
 *
 * @param {string} token - Invite token
 */
exports.invitesRouter.post("/:token/accept", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const token = getPathParam(req, "token");
    if (!req.user) {
        res.status(401).json({
            success: false,
            error: "Authentication required",
        });
        return;
    }
    const ctx = (0, context_1.createServiceContext)({
        userId: req.user.id,
        role: req.user.role,
        plan: req.user.plan,
    }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
    }, { contextType: "personal", effectivePlan: req.user.plan });
    const membership = await organization_1.organizationService.acceptPendingInvite(ctx, token);
    res.json({
        success: true,
        data: membership,
    });
}));
/**
 * POST /api/invites/:token/decline
 *
 * Decline a pending invite (public - no auth required)
 * Allows users to decline without creating an account
 *
 * @param {string} token - Invite token
 * @body {string} [email] - Email for verification (optional)
 */
exports.invitesRouter.post("/:token/decline", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const token = getPathParam(req, "token");
    const email = req.body?.email;
    const result = await organization_1.organizationService.declinePendingInvite(token, email);
    res.json({
        success: true,
        data: result,
    });
}));
//# sourceMappingURL=invites.js.map