"use strict";
/**
 * Admin Routes
 *
 * Platform administration endpoints for ADMIN/SUPER_ADMIN users.
 * - GET /api/admin/stats - Platform-wide statistics
 * - GET /api/admin/users - List all users
 * - GET /api/admin/gateways - List all gateways
 *
 * @module server/routes/admin
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const prisma_1 = require("@/lib/prisma");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
const role_1 = require("../middleware/role");
exports.adminRouter = (0, express_1.Router)();
// All admin routes require auth + admin role
exports.adminRouter.use(auth_1.requireAuth, role_1.requireAdmin);
/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 */
function getServiceContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    // Phase 6.7: Token simplified - context determined by URL, not token
    // Admin routes always use personal context with admin privileges
    return (0, context_1.createServiceContext)({
        userId: req.tokenPayload?.userId ?? req.user.id,
        role: req.tokenPayload?.role ?? req.user.role,
        plan: req.tokenPayload?.plan ?? req.user.plan,
    }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
    }, 
    // Admin context - personal with admin's plan
    { contextType: 'personal', effectivePlan: req.user.plan });
}
// ===========================================
// GET /api/admin/stats - Platform Statistics
// ===========================================
exports.adminRouter.get("/stats", (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Note: ctx is available but not used for stats (admin-only access)
    getServiceContext(req);
    // Calculate date ranges
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    // Parallel queries for efficiency
    const [totalUsers, activeToday, newThisWeek, subscriptionCounts, totalGateways, connectedGateways, erroredGateways, disconnectedGateways, 
    // Workflow runs as proxy for executions
    workflowRunsToday, workflowRunsThisWeek,] = await Promise.all([
        // User counts
        prisma_1.prisma.user.count(),
        prisma_1.prisma.user.count({
            where: { lastLoginAt: { gte: todayStart } },
        }),
        prisma_1.prisma.user.count({
            where: { createdAt: { gte: weekStart } },
        }),
        // Subscription counts by plan
        prisma_1.prisma.user.groupBy({
            by: ["plan"],
            _count: { plan: true },
        }),
        // Gateway counts
        prisma_1.prisma.gateway.count(),
        prisma_1.prisma.gateway.count({ where: { status: "CONNECTED" } }),
        prisma_1.prisma.gateway.count({ where: { status: "ERROR" } }),
        prisma_1.prisma.gateway.count({ where: { status: "DISCONNECTED" } }),
        // Workflow runs as proxy for executions (WorkflowRun model exists)
        prisma_1.prisma.workflowRun.count({
            where: { startedAt: { gte: todayStart } },
        }),
        prisma_1.prisma.workflowRun.count({
            where: { startedAt: { gte: weekStart } },
        }),
    ]);
    // Parse subscription counts
    const planCounts = {};
    for (const item of subscriptionCounts) {
        planCounts[item.plan] = item._count.plan;
    }
    // Calculate MRR (simplified - assumes monthly billing)
    // PRO: $20/mo, BUSINESS: $50/mo, ENTERPRISE: $200/mo
    const mrr = (planCounts["PRO"] || 0) * 2000 + // cents
        (planCounts["BUSINESS"] || 0) * 5000 +
        (planCounts["ENTERPRISE"] || 0) * 20000;
    const stats = {
        users: {
            total: totalUsers,
            activeToday,
            newThisWeek,
        },
        subscriptions: {
            free: planCounts["FREE"] || 0,
            starter: planCounts["STARTER"] || 0,
            pro: planCounts["PRO"] || 0,
            business: planCounts["BUSINESS"] || 0,
            enterprise: planCounts["ENTERPRISE"] || 0,
            mrr,
        },
        gateways: {
            total: totalGateways,
            connected: connectedGateways,
            errored: erroredGateways,
            disconnected: disconnectedGateways,
        },
        executions: {
            today: workflowRunsToday,
            thisWeek: workflowRunsThisWeek,
        },
    };
    res.json({ success: true, data: stats });
}));
// ===========================================
// GET /api/admin/users - List All Users
// ===========================================
exports.adminRouter.get("/users", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = req.query.search;
    const plan = req.query.plan;
    const role = req.query.role;
    const where = {};
    if (search) {
        where.OR = [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
        ];
    }
    if (plan) {
        where.plan = plan;
    }
    if (role) {
        where.role = role;
    }
    const [users, total] = await Promise.all([
        prisma_1.prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                plan: true,
                createdAt: true,
                lastLoginAt: true,
                _count: {
                    select: { gateways: true },
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma_1.prisma.user.count({ where }),
    ]);
    const adminUsers = users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        plan: u.plan,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        gatewayCount: u._count.gateways,
    }));
    res.json({ success: true, data: { users: adminUsers, total } });
}));
// ===========================================
// GET /api/admin/gateways - List All Gateways
// ===========================================
exports.adminRouter.get("/gateways", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status;
    const type = req.query.type;
    const search = req.query.search;
    const where = {};
    if (status) {
        where.status = status;
    }
    if (type) {
        where.type = type;
    }
    if (search) {
        where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
        ];
    }
    const [gateways, total] = await Promise.all([
        prisma_1.prisma.gateway.findMany({
            where,
            select: {
                id: true,
                name: true,
                type: true,
                status: true,
                lastError: true,
                userId: true,
                createdAt: true,
                updatedAt: true,
                user: {
                    select: { email: true },
                },
            },
            orderBy: { updatedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma_1.prisma.gateway.count({ where }),
    ]);
    const adminGateways = gateways.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        status: g.status,
        lastError: g.lastError,
        userId: g.userId,
        userEmail: g.user.email,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
    }));
    res.json({ success: true, data: { gateways: adminGateways, total } });
}));
//# sourceMappingURL=admin.js.map