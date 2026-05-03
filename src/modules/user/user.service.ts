/**
 * User Service — Centralized user data access
 *
 * Consolidates scattered prisma.user queries into a single service.
 * Pattern matches pluginService, workflowService singletons.
 *
 * @module modules/user/user.service
 */

import { prisma } from "@/lib/prisma";
import type { PlanType } from "@prisma/client";

import type { UserContext, UserWithPlan } from "./user.types";

/**
 * Get lightweight user context for prompt injection and feature gating.
 * Runs 4-5 queries in parallel for efficiency.
 */
async function getUserContext(
  userId: string,
  organizationId?: string | null,
  options?: { checkWorkspace?: boolean },
): Promise<UserContext> {
  const [user, gatewayCount, pluginCount, creditBalance, runningContainer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    }),
    prisma.gateway.count({
      where: { userId, ...(organizationId ? { organizationId } : {}) },
    }),
    prisma.userPlugin.count({
      where: { userId },
    }),
    // Credit balance — fail gracefully to avoid blocking on credit service issues
    import("@/modules/credits/2bot-ai-credit.service")
      .then((m) => m.twoBotAICreditService.getBalance(userId))
      .then((b) => b.balance)
      .catch(() => undefined),
    // Workspace status — optional, avoids extra query when caller already knows
    options?.checkWorkspace !== false
      ? prisma.workspaceContainer
          .findFirst({
            where: { userId, organizationId: organizationId ?? null, status: "RUNNING" },
            select: { id: true },
          })
          .then((c) => !!c)
      : Promise.resolve(false),
  ]);

  return {
    plan: user?.plan ?? "FREE",
    credits: creditBalance,
    gatewayCount,
    pluginCount,
    workspaceRunning: runningContainer,
  };
}

/**
 * Get user with plan information.
 */
async function getUserWithPlan(userId: string): Promise<UserWithPlan | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      plan: true,
      email: true,
      name: true,
      aiRoutingPreference: true,
    },
  });
  return user;
}

/**
 * Get just the user's plan type.
 */
async function getUserPlan(userId: string): Promise<PlanType> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  return user?.plan ?? "FREE";
}

export const userService = {
  getUserContext,
  getUserWithPlan,
  getUserPlan,
};
