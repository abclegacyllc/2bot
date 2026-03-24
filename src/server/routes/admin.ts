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
import { twoBotAIUsageService } from "@/modules/2bot-ai-provider/2bot-ai-usage.service";
import type { PricingAuditReport } from "@/modules/2bot-ai-provider/pricing-monitor";
import { getLastAuditReport, getRegisteredProviders, runPricingAudit } from "@/modules/2bot-ai-provider/pricing-monitor";
import { workspaceService } from '@/modules/workspace';
import { workspaceAuditService } from '@/modules/workspace/workspace-audit.service';
import { workspaceMetricsService } from '@/modules/workspace/workspace-metrics.service';
import { egressProxyService } from '@/modules/workspace/workspace-squid.service';
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext } from "@/shared/types/context";
import type { Request, Response } from "express";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requirePermission } from "../middleware/role";
import { adminMarketplaceRouter } from "./admin-marketplace";

export const adminRouter = Router();

// All admin routes require authentication
// Specific permissions are checked per route
adminRouter.use(requireAuth);

// Mount admin sub-routers
adminRouter.use("/marketplace", adminMarketplaceRouter);

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
  requirePermission('admin:stats:read'),
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
  requirePermission('admin:users:read'),
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
// GET /api/admin/users/:id - Get Single User
// ===========================================

adminRouter.get(
  "/users/:id",
  requirePermission('admin:users:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<AdminUser & {
    creditWallet: { id: string; balance: number; monthlyAllocation: number; monthlyUsed: number } | null;
    sessions: Array<{ id: string; createdAt: Date; expiresAt: Date }>;
    isActive: boolean;
    lockedUntil: Date | null;
    failedLoginCount: number;
  }>>) => {
    const { id } = req.params;
    const userId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_USER_ID", message: "User ID is required" },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: { gateways: true },
        },
        creditWallet: {
          select: {
            id: true,
            balance: true,
            monthlyAllocation: true,
            monthlyUsed: true,
          },
        },
        sessions: {
          where: { expiresAt: { gt: new Date() } },
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        gatewayCount: user._count.gateways,
        isActive: user.isActive,
        lockedUntil: user.lockedUntil,
        failedLoginCount: user.failedLoginCount,
        creditWallet: user.creditWallet,
        sessions: user.sessions,
      },
    });
  })
);

// ===========================================
// PATCH /api/admin/users/:id - Update User
// ===========================================

adminRouter.patch(
  "/users/:id",
  requirePermission('admin:users:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ user: AdminUser }>>) => {
    const { id } = req.params;
    const userId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
    const { role, plan, isActive } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_USER_ID", message: "User ID is required" },
      });
    }

    // Validate inputs
    const validRoles = ['MEMBER', 'DEVELOPER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'];
    const validPlans = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ROLE", message: "Invalid role specified" },
      });
    }

    if (plan && !validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PLAN", message: "Invalid plan specified" },
      });
    }

    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ACTIVE_STATUS", message: "isActive must be a boolean" },
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    // Update user
    const updateData: Record<string, unknown> = {};
    if (role) updateData.role = role;
    if (plan) updateData.plan = plan;
    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        _count: {
          select: { gateways: true },
        },
      },
    });

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          plan: user.plan,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          gatewayCount: user._count.gateways,
        },
      },
    });
  })
);

// ===========================================
// POST /api/admin/users/:id/unlock - Unlock Account
// ===========================================

adminRouter.post(
  "/users/:id/unlock",
  requirePermission('admin:users:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ success: true }>>) => {
    const { id } = req.params;
    const userId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_USER_ID", message: "User ID is required" },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: null,
        failedLoginCount: 0,
      },
    });

    return res.json({ success: true, data: { success: true } });
  })
);

// ===========================================
// DELETE /api/admin/users/:id - Soft Delete User
// ===========================================

adminRouter.delete(
  "/users/:id",
  requirePermission('admin:users:delete'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ success: true }>>) => {
    const { id } = req.params;
    const userId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_USER_ID", message: "User ID is required" },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    // Soft delete (set deletedAt timestamp)
    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({ success: true, data: { success: true } });
  })
);

// ===========================================
// GET /api/admin/audit-logs - List Audit Logs
// ===========================================

adminRouter.get(
  "/audit-logs",
  requirePermission('admin:audit-logs:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    logs: Array<{
      id: string;
      userId: string | null;
      organizationId: string | null;
      action: string;
      resource: string;
      resourceId: string | null;
      metadata: unknown;
      ipAddress: string | null;
      userAgent: string | null;
      status: string;
      createdAt: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>>) => {
    const {
      page = "1",
      limit = "50",
      action,
      resource,
      userId,
      status,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};
    
    if (action && typeof action === 'string') {
      where.action = { contains: action, mode: 'insensitive' };
    }
    if (resource && typeof resource === 'string') {
      where.resource = resource;
    }
    if (userId && typeof userId === 'string') {
      where.userId = userId;
    }
    if (status && typeof status === 'string') {
      where.status = status;
    }
    
    // Date range filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate && typeof startDate === 'string') {
        (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
      }
      if (endDate && typeof endDate === 'string') {
        (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limitNum,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
    });
  })
);

// ===========================================
// CREDIT MANAGEMENT ROUTES
// ===========================================

// GET /api/admin/credits/wallets - List All Credit Wallets
adminRouter.get(
  "/credits/wallets",
  requirePermission('admin:credits:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    wallets: Array<{
      id: string;
      userId: string | null;
      organizationId: string | null;
      balance: number;
      lifetime: number;
      monthlyAllocation: number;
      monthlyUsed: number;
      createdAt: Date;
      user?: { id: string; email: string; name: string | null };
      organization?: { id: string; name: string; slug: string };
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>>) => {
    const {
      page = "1",
      limit = "50",
      search,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    
    if (search && typeof search === 'string') {
      where.OR = [
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { organization: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [wallets, total] = await Promise.all([
      prisma.creditWallet.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limitNum,
        skip,
      }),
      prisma.creditWallet.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    // Map wallets to convert null to undefined for optional fields
    const mappedWallets = wallets.map(w => ({
      id: w.id,
      userId: w.userId,
      organizationId: w.organizationId,
      balance: w.balance,
      lifetime: w.lifetime,
      monthlyAllocation: w.monthlyAllocation,
      monthlyUsed: w.monthlyUsed,
      createdAt: w.createdAt,
      user: w.user || undefined,
      organization: w.organization || undefined,
    }));

    return res.json({
      success: true,
      data: {
        wallets: mappedWallets,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
    });
  })
);

// GET /api/admin/credits/transactions - List All Credit Transactions
adminRouter.get(
  "/credits/transactions",
  requirePermission('admin:credits:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    transactions: Array<{
      id: string;
      creditWalletId: string | null;
      type: string;
      amount: number;
      balanceAfter: number;
      description: string;
      metadata: unknown;
      createdAt: Date;
      creditWallet?: {
        id: string;
        user: { id: string; email: string } | null;
        organization: { id: string; name: string } | null;
      } | null;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>>) => {
    const {
      page = "1",
      limit = "50",
      type,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    
    if (type && typeof type === 'string') {
      where.type = type;
    }
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate && typeof startDate === 'string') {
        (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
      }
      if (endDate && typeof endDate === 'string') {
        (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        include: {
          creditWallet: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  email: true,
                },
              },
              organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limitNum,
        skip,
      }),
      prisma.creditTransaction.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
    });
  })
);

// POST /api/admin/credits/grant - Grant Credits
adminRouter.post(
  "/credits/grant",
  requirePermission('admin:credits:grant'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ transaction: { id: string } }>>) => {
    const { userId, organizationId, amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_AMOUNT", message: "Amount must be positive" },
      });
    }

    if (!userId && !organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_TARGET", message: "userId or organizationId required" },
      });
    }

    if (userId && organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_TARGET", message: "Specify either userId or organizationId, not both" },
      });
    }

    // Find or create wallet
    let wallet = await prisma.creditWallet.findFirst({
      where: userId ? { userId } : { organizationId },
    });

    if (!wallet) {
      wallet = await prisma.creditWallet.create({
        data: {
          userId: userId || null,
          organizationId: organizationId || null,
          balance: 0,
          lifetime: 0,
        },
      });
    }

    // Create transaction
    const transaction = await prisma.creditTransaction.create({
      data: {
        creditWalletId: wallet.id,
        type: 'grant',
        amount: amount,
        balanceAfter: wallet.balance + amount,
        description: description || 'Admin credit grant',
        metadata: { grantedBy: 'admin' },
      },
    });

    // Update wallet
    await prisma.creditWallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance + amount,
        lifetime: wallet.lifetime + amount,
      },
    });

    return res.json({
      success: true,
      data: { transaction: { id: transaction.id } },
    });
  })
);

// POST /api/admin/credits/refund - Refund Credits
adminRouter.post(
  "/credits/refund",
  requirePermission('admin:credits:grant'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ transaction: { id: string } }>>) => {
    const { transactionId, reason } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_TRANSACTION_ID", message: "transactionId is required" },
      });
    }

    // Find original transaction
    const originalTx = await prisma.creditTransaction.findUnique({
      where: { id: transactionId },
      include: { creditWallet: true },
    });

    if (!originalTx) {
      return res.status(404).json({
        success: false,
        error: { code: "TRANSACTION_NOT_FOUND", message: "Transaction not found" },
      });
    }

    if (!originalTx.creditWallet) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_WALLET", message: "Transaction has no associated wallet" },
      });
    }

    // Create refund transaction (reverse the amount)
    const refundAmount = -originalTx.amount;
    const transaction = await prisma.creditTransaction.create({
      data: {
        creditWalletId: originalTx.creditWalletId,
        type: 'refund',
        amount: refundAmount,
        balanceAfter: originalTx.creditWallet.balance + refundAmount,
        description: reason || `Refund of transaction ${transactionId}`,
        metadata: { refundedTransactionId: transactionId, reason },
      },
    });

    // Update wallet
    await prisma.creditWallet.update({
      where: { id: originalTx.creditWallet.id },
      data: {
        balance: originalTx.creditWallet.balance + refundAmount,
      },
    });

    return res.json({
      success: true,
      data: { transaction: { id: transaction.id } },
    });
  })
);

// GET /api/admin/credits/rates - List Credit Rates
adminRouter.get(
  "/credits/rates",
  requirePermission('admin:credits:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    rates: Array<{
      id: string;
      capability: string;
      model: string;
      creditsPerInputToken: number | null;
      creditsPerOutputToken: number | null;
      creditsPerImage: number | null;
      creditsPerChar: number | null;
      creditsPerMinute: number | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }>>) => {
    const rates = await prisma.creditRate.findMany({
      orderBy: [
        { capability: 'asc' },
        { model: 'asc' },
      ],
    });

    return res.json({
      success: true,
      data: { rates },
    });
  })
);

// PATCH /api/admin/credits/rates/:id - Update Credit Rate
adminRouter.patch(
  "/credits/rates/:id",
  requirePermission('admin:credits:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ rate: { id: string } }>>) => {
    const { id } = req.params;
    const rateId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

    if (!rateId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_RATE_ID", message: "Rate ID is required" },
      });
    }

    const {
      creditsPerInputToken,
      creditsPerOutputToken,
      creditsPerImage,
      creditsPerChar,
      creditsPerMinute,
      isActive,
    } = req.body;

    const updateData: Record<string, unknown> = {};
    
    if (creditsPerInputToken !== undefined) updateData.creditsPerInputToken = creditsPerInputToken;
    if (creditsPerOutputToken !== undefined) updateData.creditsPerOutputToken = creditsPerOutputToken;
    if (creditsPerImage !== undefined) updateData.creditsPerImage = creditsPerImage;
    if (creditsPerChar !== undefined) updateData.creditsPerChar = creditsPerChar;
    if (creditsPerMinute !== undefined) updateData.creditsPerMinute = creditsPerMinute;
    if (isActive !== undefined) updateData.isActive = isActive;

    const rate = await prisma.creditRate.update({
      where: { id: rateId },
      data: updateData,
    });

    return res.json({
      success: true,
      data: { rate: { id: rate.id } },
    });
  })
);

// ===========================================
// ORGANIZATION MANAGEMENT ROUTES
// ===========================================

// GET /api/admin/organizations - List All Organizations
adminRouter.get(
  "/organizations",
  requirePermission('admin:organizations:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    organizations: Array<{
      id: string;
      name: string;
      slug: string;
      plan: string;
      isActive: boolean;
      createdAt: Date;
      memberCount: number;
      departmentCount: number;
      gatewayCount: number;
      creditBalance: number;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>>) => {
    const {
      page = "1",
      limit = "20",
      search,
      plan,
      isActive,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};
    
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (plan && typeof plan === 'string') {
      where.plan = plan;
    }
    if (isActive !== undefined && typeof isActive === 'string') {
      where.isActive = isActive === 'true';
    }

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          _count: {
            select: {
              memberships: true,
              departments: true,
              gateways: true,
            },
          },
          creditWallet: {
            select: {
              balance: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip,
      }),
      prisma.organization.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    const organizations = orgs.map(org => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      isActive: org.isActive,
      createdAt: org.createdAt,
      memberCount: org._count.memberships,
      departmentCount: org._count.departments,
      gatewayCount: org._count.gateways,
      creditBalance: org.creditWallet?.balance ?? 0,
    }));

    return res.json({
      success: true,
      data: {
        organizations,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
    });
  })
);

// GET /api/admin/organizations/:id - Get Organization Detail
adminRouter.get(
  "/organizations/:id",
  requirePermission('admin:organizations:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    organization: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
      owner: {
        id: string;
        email: string;
        name: string | null;
      } | null;
      creditWallet: {
        id: string;
        balance: number;
        lifetime: number;
        monthlyAllocation: number;
        monthlyUsed: number;
      } | null;
      members: Array<{
        id: string;
        userId: string;
        role: string;
        status: string;
        joinedAt: Date | null;
        user: {
          id: string;
          email: string;
          name: string | null;
        };
      }>;
      departments: Array<{
        id: string;
        name: string;
        memberCount: number;
      }>;
      gateways: Array<{
        id: string;
        name: string;
        type: string;
        status: string;
      }>;
    };
  }>>) => {
    const { id } = req.params;
    const orgId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ORG_ID", message: "Organization ID is required" },
      });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        creditWallet: {
          select: {
            id: true,
            balance: true,
            lifetime: true,
            monthlyAllocation: true,
            monthlyUsed: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
        departments: {
          include: {
            _count: {
              select: { members: true },
            },
          },
          orderBy: { name: 'asc' },
        },
        gateways: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: { code: "ORG_NOT_FOUND", message: "Organization not found" },
      });
    }

    // Find owner from memberships
    const ownerMembership = org.memberships.find(m => m.role === 'ORG_OWNER');

    const organization = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      isActive: org.isActive,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      owner: ownerMembership ? {
        id: ownerMembership.user.id,
        email: ownerMembership.user.email,
        name: ownerMembership.user.name,
      } : null,
      creditWallet: org.creditWallet,
      members: org.memberships.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
      departments: org.departments.map(d => ({
        id: d.id,
        name: d.name,
        memberCount: d._count.members,
      })),
      gateways: org.gateways,
    };

    return res.json({
      success: true,
      data: { organization },
    });
  })
);

// PATCH /api/admin/organizations/:id - Update Organization
adminRouter.patch(
  "/organizations/:id",
  requirePermission('admin:organizations:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ success: boolean }>>) => {
    const { id } = req.params;
    const orgId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ORG_ID", message: "Organization ID is required" },
      });
    }

    const { plan, isActive } = req.body;

    const updateData: Record<string, unknown> = {};
    if (plan !== undefined) updateData.plan = plan;
    if (isActive !== undefined) updateData.isActive = isActive;

    await prisma.organization.update({
      where: { id: orgId },
      data: updateData,
    });

    return res.json({ success: true, data: { success: true } });
  })
);

// POST /api/admin/organizations/:id/suspend - Suspend Organization
adminRouter.post(
  "/organizations/:id/suspend",
  requirePermission('admin:organizations:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ 
    suspendedOrg: boolean; 
    suspendedMembers: number;
  }>>) => {
    const { id } = req.params;
    const orgId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
    const { reason } = req.body;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ORG_ID", message: "Organization ID is required" },
      });
    }

    // Suspend organization
    await prisma.organization.update({
      where: { id: orgId },
      data: { isActive: false },
    });

    // Get all members
    const members = await prisma.membership.findMany({
      where: { organizationId: orgId },
      select: { userId: true },
    });

    // Suspend all member accounts
    const suspendedCount = await prisma.user.updateMany({
      where: {
        id: { in: members.map(m => m.userId) },
      },
      data: { isActive: false },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'organization.suspend',
        resource: 'organization',
        resourceId: orgId,
        status: 'success',
        metadata: {
          reason,
          suspendedMembers: suspendedCount.count,
          suspendedBy: 'admin',
        },
      },
    });

    return res.json({
      success: true,
      data: {
        suspendedOrg: true,
        suspendedMembers: suspendedCount.count,
      },
    });
  })
);

// ===========================================
// AI USAGE DASHBOARD ROUTES
// ===========================================

// GET /api/admin/ai-usage - Platform-wide AI Usage
adminRouter.get(
  "/ai-usage",
  requirePermission('admin:ai-usage:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    period: string;
    totalRequests: number;
    totalCredits: number;
    byCapability: Array<{ capability: string; requests: number; credits: number }>;
    byModel: Array<{ model: string; requests: number; credits: number }>;
    byProvider: Array<{ provider: string; requests: number; credits: number }>;
  }>>) => {
    const { period } = req.query;
    
    const usage = await twoBotAIUsageService.getAggregatedUsage(period as string | undefined);
    
    return res.json({
      success: true,
      data: usage,
    });
  })
);

// GET /api/admin/ai-usage/breakdown - Detailed Breakdown
adminRouter.get(
  "/ai-usage/breakdown",
  requirePermission('admin:ai-usage:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    byModel: Array<{
      model: string;
      capability: string;
      requests: number;
      credits: number;
    }>;
    byUser: Array<{
      userId: string;
      userEmail: string;
      userName: string | null;
      requests: number;
      credits: number;
    }>;
    byOrganization: Array<{
      organizationId: string;
      organizationName: string;
      requests: number;
      credits: number;
    }>;
  }>>) => {
    const { period, limit = "10" } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const billingPeriod = period as string;

    // Get top models
    const modelStats = await prisma.aIUsage.groupBy({
      by: ["model", "capability"],
      where: billingPeriod ? { billingPeriod, source: "2bot" } : { source: "2bot" },
      _count: { id: true },
      _sum: { creditsUsed: true },
      orderBy: { _sum: { creditsUsed: "desc" } },
      take: limitNum * 2, // Get more models to show variety
    });

    const byModel = modelStats.map((stat) => ({
      model: stat.model,
      capability: stat.capability,
      requests: stat._count.id,
      credits: stat._sum.creditsUsed || 0,
    }));

    // Get top users
    const userStats = await prisma.aIUsage.groupBy({
      by: ["userId"],
      where: billingPeriod ? { billingPeriod, source: "2bot" } : { source: "2bot" },
      _count: { id: true },
      _sum: { creditsUsed: true },
      orderBy: { _sum: { creditsUsed: "desc" } },
      take: limitNum,
    });

    const byUser = await Promise.all(
      userStats.map(async (stat) => {
        const user = await prisma.user.findUnique({
          where: { id: stat.userId },
          select: { email: true, name: true },
        });

        return {
          userId: stat.userId,
          userEmail: user?.email || "Unknown",
          userName: user?.name || null,
          requests: stat._count.id,
          credits: stat._sum.creditsUsed || 0,
        };
      })
    );

    // Get top organizations
    const orgStats = await prisma.aIUsage.groupBy({
      by: ["organizationId"],
      where: billingPeriod
        ? { organizationId: { not: null }, billingPeriod, source: "2bot" }
        : { organizationId: { not: null }, source: "2bot" },
      _count: { id: true },
      _sum: { creditsUsed: true },
      orderBy: { _sum: { creditsUsed: "desc" } },
      take: limitNum,
    });

    const byOrganization = await Promise.all(
      orgStats
        .filter((stat): stat is typeof stat & { organizationId: string } => stat.organizationId !== null)
        .map(async (stat) => {
          const org = await prisma.organization.findUnique({
            where: { id: stat.organizationId },
            select: { name: true },
          });

          return {
            organizationId: stat.organizationId,
            organizationName: org?.name || "Unknown",
            requests: stat._count.id,
            credits: stat._sum.creditsUsed || 0,
          };
        })
    );

    return res.json({
      success: true,
      data: {
        byModel,
        byUser,
        byOrganization,
      },
    });
  })
);

// ===========================================
// GET /api/admin/gateways - List All Gateways
// ===========================================

adminRouter.get(
  "/gateways",
  requirePermission('admin:gateways:read'),
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

// ===========================================
// GET /api/admin/gateways/:id - Gateway Detail
// ===========================================

adminRouter.get(
  "/gateways/:id",
  requirePermission('admin:gateways:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    gateway: {
      id: string;
      name: string;
      type: string;
      status: string;
      lastError: string | null;
      lastErrorAt: Date | null;
      lastConnectedAt: Date | null;
      config: unknown;
      createdAt: Date;
      updatedAt: Date;
      userId: string;
      userEmail: string;
      userName: string | null;
      organizationId: string | null;
      organizationName: string | null;
      workflowCount: number;
      aiUsageCount: number;
    };
  }>>) => {
    const gatewayId = req.params.id as string;

    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        lastError: true,
        lastErrorAt: true,
        lastConnectedAt: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        organizationId: true,
        user: {
          select: { email: true, name: true },
        },
        organization: {
          select: { name: true },
        },
        _count: {
          select: {
            workflows: true,
            aiUsage: true,
          },
        },
      },
    });

    if (!gateway) {
      throw new BadRequestError(`Gateway not found: ${gatewayId}`);
    }

    res.json({
      success: true,
      data: {
        gateway: {
          id: gateway.id,
          name: gateway.name,
          type: gateway.type,
          status: gateway.status,
          lastError: gateway.lastError,
          lastErrorAt: gateway.lastErrorAt,
          lastConnectedAt: gateway.lastConnectedAt,
          config: gateway.config,
          createdAt: gateway.createdAt,
          updatedAt: gateway.updatedAt,
          userId: gateway.userId,
          userEmail: gateway.user.email,
          userName: gateway.user.name,
          organizationId: gateway.organizationId,
          organizationName: gateway.organization?.name || null,
          workflowCount: gateway._count.workflows,
          aiUsageCount: gateway._count.aiUsage,
        },
      },
    });
  })
);

// ===========================================
// PATCH /api/admin/gateways/:id - Update Gateway
// ===========================================

adminRouter.patch(
  "/gateways/:id",
  requirePermission('admin:gateways:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ gateway: { id: string; status: string; lastError: string | null } }>>) => {
    const gatewayId = req.params.id as string;
    const { status, clearError } = req.body;

    // Validate status if provided
    if (status && !["CONNECTED", "DISCONNECTED", "ERROR"].includes(status)) {
      throw new BadRequestError("Invalid status. Must be CONNECTED, DISCONNECTED, or ERROR");
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;
    }

    if (clearError) {
      updateData.lastError = null;
      updateData.lastErrorAt = null;
    }

    const gateway = await prisma.gateway.update({
      where: { id: gatewayId },
      data: updateData,
      select: {
        id: true,
        status: true,
        lastError: true,
      },
    });

    res.json({ success: true, data: { gateway } });
  })
);

// ===========================================
// POST /api/admin/gateways/:id/disconnect - Force Disconnect
// ===========================================

adminRouter.post(
  "/gateways/:id/disconnect",
  requirePermission('admin:gateways:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ gateway: { id: string; status: string } }>>) => {
    const gatewayId = req.params.id as string;

    const gateway = await prisma.gateway.update({
      where: { id: gatewayId },
      data: {
        status: "DISCONNECTED",
        lastError: "Disconnected by admin",
        lastErrorAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });

    res.json({ success: true, data: { gateway } });
  })
);

// ===========================================
// Credit Budget Reset Endpoints
// ===========================================

import { budgetResetService } from "@/modules/resource/budget-reset.service";

/**
 * POST /api/admin/credits/reset
 * Reset all credit budgets (for monthly cron job)
 * 
 * Can be called by:
 * - External cron service (Vercel Cron, Railway, etc.)
 * - Admin manual trigger
 */
adminRouter.post(
  "/credits/reset",
  requirePermission('admin:credits:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ 
    organizations: number; 
    departments: number; 
    members: number; 
  }>>) => {
    // Optional: Verify cron secret if called externally
    const cronSecret = req.headers["x-cron-secret"] as string | undefined;
    const expectedSecret = process.env.CRON_SECRET;
    
    // If CRON_SECRET is set, verify it (allows both admin auth and cron secret)
    if (expectedSecret && cronSecret !== expectedSecret && !req.user) {
      throw new BadRequestError("Invalid cron secret");
    }
    
    const result = await budgetResetService.resetAllCredits();
    
    res.json({ 
      success: true, 
      data: result,
    });
  })
);

/**
 * POST /api/admin/credits/reset/:orgId
 * Reset credit budgets for a specific organization
 */
adminRouter.post(
  "/credits/reset/:orgId",
  requirePermission('admin:credits:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    departments: { count: number; skipped: number };
    members: { count: number; skipped: number };
  }>>) => {
    const orgId = req.params.orgId as string;
    
    if (!orgId) {
      throw new BadRequestError("Missing organization ID");
    }
    
    // Verify org exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    
    if (!org) {
      throw new BadRequestError(`Organization not found: ${orgId}`);
    }
    
    const result = await budgetResetService.resetAllOrgCredits(orgId);
    
    res.json({ 
      success: true, 
      data: result,
    });
  })
);

/**
 * GET /api/admin/credits/reset/status
 * Check if any credit resets are pending
 */
adminRouter.get(
  "/credits/reset/status",
  requirePermission('admin:credits:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ hasPendingResets: boolean }>>) => {
    const hasPendingResets = await budgetResetService.hasPendingResets();
    
    res.json({ 
      success: true, 
      data: { hasPendingResets },
    });
  })
);

// ===========================================
// Pricing Monitor Routes
// ===========================================

/**
 * POST /api/admin/pricing-monitor/run
 * Run a fresh pricing audit across all providers.
 * Compares live provider API data against our model-pricing.ts.
 */
adminRouter.post(
  "/pricing-monitor/run",
  requirePermission('admin:ai-usage:read'),
  asyncHandler(async (_req: Request, res: Response<ApiResponse<PricingAuditReport>>) => {
    const report = await runPricingAudit();

    res.json({
      success: true,
      data: report,
    });
  })
);

/**
 * GET /api/admin/pricing-monitor/status
 * Get the last cached audit report (if any).
 * Returns null if no audit has been run yet.
 */
adminRouter.get(
  "/pricing-monitor/status",
  requirePermission('admin:ai-usage:read'),
  asyncHandler(async (_req: Request, res: Response<ApiResponse<PricingAuditReport | null>>) => {
    const report = getLastAuditReport();

    res.json({
      success: true,
      data: report,
    });
  })
);

/**
 * GET /api/admin/pricing-monitor/providers
 * List all registered provider fetchers.
 */
adminRouter.get(
  "/pricing-monitor/providers",
  requirePermission('admin:ai-usage:read'),
  asyncHandler(async (_req: Request, res: Response<ApiResponse<ReturnType<typeof getRegisteredProviders>>>) => {
    const providers = getRegisteredProviders();

    res.json({
      success: true,
      data: providers,
    });
  })
);

// ===========================================
// WORKSPACE ADMIN ROUTES
// ===========================================

// GET /api/admin/workspaces - List all workspaces
adminRouter.get(
  "/workspaces",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getServiceContext(req);
    const workspaces = await workspaceService.adminListAll(ctx);
    res.json({ success: true, data: workspaces });
  }),
);

// POST /api/admin/workspaces/:id/force-stop - Force stop a workspace
adminRouter.post(
  "/workspaces/:id/force-stop",
  requirePermission('admin:workspaces:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getServiceContext(req);
    const result = await workspaceService.adminForceStop(ctx, req.params.id as string);
    res.json({ success: result.success, data: result });
  }),
);

// GET /api/admin/workspaces/:id/metrics - Get metrics for a container
adminRouter.get(
  "/workspaces/:id/metrics",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const containerId = req.params.id as string;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const until = req.query.until ? new Date(req.query.until as string) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const metrics = await workspaceMetricsService.getMetrics({ containerId, since, until, limit });
    res.json({ success: true, data: metrics });
  }),
);

// GET /api/admin/workspaces/:id/metrics/summary - Get metrics summary
adminRouter.get(
  "/workspaces/:id/metrics/summary",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const containerId = req.params.id as string;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const until = req.query.until ? new Date(req.query.until as string) : undefined;

    const summary = await workspaceMetricsService.getSummary(containerId, since, until);
    res.json({ success: true, data: summary });
  }),
);

// GET /api/admin/workspaces/audit - Get recent workspace audit logs
adminRouter.get(
  "/workspaces/audit",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const containerId = req.query.containerId as string | undefined;
    const logs = containerId
      ? await workspaceAuditService.getByContainer(containerId, limit)
      : await workspaceAuditService.getRecent(limit);
    res.json({ success: true, data: logs });
  }),
);

// GET /api/admin/workspaces/egress-logs - Get egress logs across all containers
adminRouter.get(
  "/workspaces/egress-logs",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const query = {
      containerId: req.query.containerId as string | undefined,
      domain: req.query.domain as string | undefined,
      action: req.query.action as 'ALLOWED' | 'BLOCKED' | 'RATE_LIMITED' | undefined,
      direction: req.query.direction as 'INBOUND' | 'OUTBOUND' | undefined,
      since: req.query.since ? new Date(req.query.since as string) : undefined,
      until: req.query.until ? new Date(req.query.until as string) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 100,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    };

    const result = await egressProxyService.getLogs(query);
    res.json({ success: true, data: result });
  }),
);

// GET /api/admin/workspaces/egress-logs/summary - Get egress summary stats
adminRouter.get(
  "/workspaces/egress-logs/summary",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const containerId = req.query.containerId as string | undefined;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    const summary = await egressProxyService.getSummary(containerId, since);
    res.json({ success: true, data: summary });
  }),
);

// GET /api/admin/workspaces/proxy-status - Get proxy container status
adminRouter.get(
  "/workspaces/proxy-status",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    const status = await egressProxyService.getProxyStatus();
    res.json({ success: true, data: status });
  }),
);

// POST /api/admin/workspaces/egress-reparse - Reparse the entire egress log
adminRouter.post(
  "/workspaces/egress-reparse",
  requirePermission('admin:workspaces:write'),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    await egressProxyService.reparseFromStart();
    res.json({ success: true, data: { message: 'Reparse triggered' } });
  }),
);

// GET /api/admin/workspaces/allowed-domains - View all user-allowed domains
adminRouter.get(
  "/workspaces/allowed-domains",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const status = req.query.status as string | undefined;
    const domains = await egressProxyService.getAllDomains(status);
    res.json({ success: true, data: domains });
  }),
);

// PATCH /api/admin/workspaces/allowed-domains/:id - Review a user's domain request
adminRouter.patch(
  "/workspaces/allowed-domains/:id",
  requirePermission('admin:workspaces:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getServiceContext(req);
    const { action, reviewNote } = req.body as { action: string; reviewNote?: string };
    if (!action || !['APPROVED', 'REJECTED', 'REVOKED'].includes(action)) {
      throw new BadRequestError('Invalid action — must be APPROVED, REJECTED, or REVOKED');
    }
    const result = await egressProxyService.reviewUserDomain(
      ctx.userId, req.params.id as string, action as 'APPROVED' | 'REJECTED' | 'REVOKED', reviewNote
    );
    res.json({ success: true, data: result });
  }),
);

// GET /api/admin/workspaces/blocked-domains - List all globally blocked domains
adminRouter.get(
  "/workspaces/blocked-domains",
  requirePermission('admin:workspaces:read'),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    const domains = await egressProxyService.getBlockedDomains();
    res.json({ success: true, data: domains });
  }),
);

// POST /api/admin/workspaces/blocked-domains - Add a globally blocked domain
adminRouter.post(
  "/workspaces/blocked-domains",
  requirePermission('admin:workspaces:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getServiceContext(req);
    const { domain, reason } = req.body as { domain: string; reason?: string };
    if (!domain) throw new BadRequestError('Domain is required');
    const result = await egressProxyService.addBlockedDomain(ctx.userId, domain, reason);
    res.json({ success: true, data: result });
  }),
);

// DELETE /api/admin/workspaces/blocked-domains/:id - Remove a globally blocked domain
adminRouter.delete(
  "/workspaces/blocked-domains/:id",
  requirePermission('admin:workspaces:write'),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    await egressProxyService.removeBlockedDomain(req.params.id as string);
    res.json({ success: true });
  }),
);
