/**
 * Plan Limits Utilities
 *
 * Functions to check resource limits based on subscription plan.
 * Used before creating gateways, plugins, etc to enforce plan limits.
 *
 * @module lib/plan-limits
 */

import { prisma } from "@/lib/prisma";
import { getPlanLimits, type PlanType } from "@/shared/constants/plans";
import type { ServiceContext } from "@/shared/types/context";

/**
 * Result of a limit check
 */
export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  max: number;
  remaining: number;
}

/**
 * Custom error for plan limit violations
 */
export class PlanLimitError extends Error {
  readonly resource: string;
  readonly current: number;
  readonly max: number;
  readonly upgradeUrl: string;

  constructor(
    message: string,
    resource: string,
    current: number,
    max: number
  ) {
    super(message);
    this.name = "PlanLimitError";
    this.resource = resource;
    this.current = current;
    this.max = max;
    this.upgradeUrl = "/billing/upgrade";
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      resource: this.resource,
      current: this.current,
      max: this.max,
      upgradeUrl: this.upgradeUrl,
    };
  }
}

/**
 * Build the where clause for counting resources based on context
 */
function buildOwnerFilter(ctx: ServiceContext): { userId?: string; organizationId: string | null } {
  if (ctx.isOrgContext() && ctx.organizationId) {
    return { organizationId: ctx.organizationId };
  }
  return { userId: ctx.userId, organizationId: null };
}

/**
 * Check if a limit value means unlimited (-1)
 */
function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/**
 * Check gateway creation limit for current context
 */
export async function checkGatewayLimit(ctx: ServiceContext): Promise<LimitCheckResult> {
  const limits = getPlanLimits(ctx.effectivePlan);
  const max = limits.gateways;

  // Unlimited check
  if (isUnlimited(max)) {
    return { allowed: true, current: 0, max: -1, remaining: -1 };
  }

  const filter = buildOwnerFilter(ctx);
  const current = await prisma.gateway.count({ where: filter });

  return {
    allowed: current < max,
    current,
    max,
    remaining: Math.max(0, max - current),
  };
}

/**
 * Check plugin installation limit for current context
 */
export async function checkPluginLimit(ctx: ServiceContext): Promise<LimitCheckResult> {
  const limits = getPlanLimits(ctx.effectivePlan);
  const max = limits.plugins;

  // Unlimited check
  if (isUnlimited(max)) {
    return { allowed: true, current: 0, max: -1, remaining: -1 };
  }

  const filter = buildOwnerFilter(ctx);
  const current = await prisma.userPlugin.count({ where: filter });

  return {
    allowed: current < max,
    current,
    max,
    remaining: Math.max(0, max - current),
  };
}

/**
 * Check daily execution limit for current context
 * Note: Uses executionsPerMonth from plan limits (converted to approximate daily)
 * For more precise tracking, use the quota service
 */
export async function checkExecutionLimit(ctx: ServiceContext): Promise<LimitCheckResult> {
  const limits = getPlanLimits(ctx.effectivePlan);
  
  // executionsPerMonth - convert to approximate daily (null = unlimited)
  const monthlyLimit = limits.executionsPerMonth;
  
  // Unlimited check
  if (monthlyLimit === null || monthlyLimit === -1) {
    return { allowed: true, current: 0, max: -1, remaining: -1 };
  }
  
  // Approximate daily limit (monthly / 30)
  const max = Math.ceil(monthlyLimit / 30);

  // TODO: Implement actual execution tracking when PluginExecution model is added
  // For now, return a stub that assumes no executions today
  const current = 0;

  return {
    allowed: current < max,
    current,
    max,
    remaining: Math.max(0, max - current),
  };
}

/**
 * Get all resource usage for current context
 * Useful for displaying in billing UI
 */
export async function getResourceUsage(ctx: ServiceContext): Promise<{
  gateways: LimitCheckResult;
  plugins: LimitCheckResult;
  executionsToday: LimitCheckResult;
  plan: PlanType;
}> {
  const [gateways, plugins, executionsToday] = await Promise.all([
    checkGatewayLimit(ctx),
    checkPluginLimit(ctx),
    checkExecutionLimit(ctx),
  ]);

  return {
    gateways,
    plugins,
    executionsToday,
    plan: ctx.effectivePlan,
  };
}

/**
 * Enforce gateway limit - throws PlanLimitError if limit reached
 */
export async function enforceGatewayLimit(ctx: ServiceContext): Promise<void> {
  const limit = await checkGatewayLimit(ctx);

  if (!limit.allowed) {
    throw new PlanLimitError(
      `Gateway limit reached (${limit.current}/${limit.max}). Upgrade your plan to create more gateways.`,
      "gateways",
      limit.current,
      limit.max
    );
  }
}

/**
 * Enforce plugin limit - throws PlanLimitError if limit reached
 */
export async function enforcePluginLimit(ctx: ServiceContext): Promise<void> {
  const limit = await checkPluginLimit(ctx);

  if (!limit.allowed) {
    throw new PlanLimitError(
      `Plugin limit reached (${limit.current}/${limit.max}). Upgrade your plan to install more plugins.`,
      "plugins",
      limit.current,
      limit.max
    );
  }
}

/**
 * Enforce execution limit - throws PlanLimitError if limit reached
 */
export async function enforceExecutionLimit(ctx: ServiceContext): Promise<void> {
  const limit = await checkExecutionLimit(ctx);

  if (!limit.allowed) {
    throw new PlanLimitError(
      `Daily execution limit reached (${limit.current}/${limit.max}). Upgrade your plan for more executions.`,
      "executions",
      limit.current,
      limit.max
    );
  }
}
