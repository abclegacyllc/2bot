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

import { prisma } from "@/lib/prisma";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext } from "@/shared/types/context";
import { Request, Response, Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requireAdmin } from "../middleware/role";

export const adminRouter = Router();

// All admin routes require auth + admin role
adminRouter.use(requireAuth, requireAdmin);

/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 */
function getServiceContext(req: Request) {
  if (!req.user) {
    throw new BadRequestError("User not authenticated");
  }

  // Phase 6.7: Token simplified - context determined by URL, not token
  // Admin routes always use personal context with admin privileges
  return createServiceContext(
    {
      userId: req.tokenPayload?.userId ?? req.user.id,
      role: req.tokenPayload?.role ?? req.user.role,
      plan: req.tokenPayload?.plan ?? req.user.plan,
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.headers["x-request-id"] as string | undefined,
    },
    // Admin context - personal with admin's plan
    { contextType: 'personal', effectivePlan: req.user.plan }
  );
}

// ===========================================
// Types
// ===========================================

interface AdminStats {
  users: {
    total: number;
    activeToday: number;
    newThisWeek: number;
  };
  subscriptions: {
    free: number;
    starter: number;
    pro: number;
    business: number;
    enterprise: number;
    mrr: number;
  };
  gateways: {
    total: number;
    connected: number;
    errored: number;
    disconnected: number;
  };
  executions: {
    today: number;
    thisWeek: number;
  };
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  gatewayCount: number;
}

interface AdminGateway {
  id: string;
  name: string;
  type: string;
  status: string;
  lastError: string | null;
  userId: string;
  userEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// GET /api/admin/stats - Platform Statistics
// ===========================================

adminRouter.get(
  "/stats",
  asyncHandler(async (req: Request, res: Response<ApiResponse<AdminStats>>) => {
    // Note: ctx is available but not used for stats (admin-only access)
    getServiceContext(req);

    // Calculate date ranges
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    // Parallel queries for efficiency
    const [
      totalUsers,
      activeToday,
      newThisWeek,
      subscriptionCounts,
      totalGateways,
      connectedGateways,
      erroredGateways,
      disconnectedGateways,
      // Workflow runs as proxy for executions
      workflowRunsToday,
      workflowRunsThisWeek,
    ] = await Promise.all([
      // User counts
      prisma.user.count(),
      prisma.user.count({
        where: { lastLoginAt: { gte: todayStart } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: weekStart } },
      }),

      // Subscription counts by plan
      prisma.user.groupBy({
        by: ["plan"],
        _count: { plan: true },
      }),

      // Gateway counts
      prisma.gateway.count(),
      prisma.gateway.count({ where: { status: "CONNECTED" } }),
      prisma.gateway.count({ where: { status: "ERROR" } }),
      prisma.gateway.count({ where: { status: "DISCONNECTED" } }),

      // Workflow runs as proxy for executions (WorkflowRun model exists)
      prisma.workflowRun.count({
        where: { startedAt: { gte: todayStart } },
      }),
      prisma.workflowRun.count({
        where: { startedAt: { gte: weekStart } },
      }),
    ]);

    // Parse subscription counts
    const planCounts: Record<string, number> = {};
    for (const item of subscriptionCounts) {
      planCounts[item.plan] = item._count.plan;
    }

    // Calculate MRR (simplified - assumes monthly billing)
    // PRO: $20/mo, BUSINESS: $50/mo, ENTERPRISE: $200/mo
    const mrr =
      (planCounts["PRO"] || 0) * 2000 + // cents
      (planCounts["BUSINESS"] || 0) * 5000 +
      (planCounts["ENTERPRISE"] || 0) * 20000;

    const stats: AdminStats = {
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
  })
);

// ===========================================
// GET /api/admin/users - List All Users
// ===========================================

adminRouter.get(
  "/users",
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ users: AdminUser[]; total: number }>>) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string | undefined;
    const plan = req.query.plan as string | undefined;
    const role = req.query.role as string | undefined;

    const where: Record<string, unknown> = {};

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
      prisma.user.findMany({
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
      prisma.user.count({ where }),
    ]);

    const adminUsers: AdminUser[] = users.map((u) => ({
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
  })
);

// ===========================================
// GET /api/admin/gateways - List All Gateways
// ===========================================

adminRouter.get(
  "/gateways",
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ gateways: AdminGateway[]; total: number }>>) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;

    const where: Record<string, unknown> = {};

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
      prisma.gateway.findMany({
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
      prisma.gateway.count({ where }),
    ]);

    const adminGateways: AdminGateway[] = gateways.map((g) => ({
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
  })
);
