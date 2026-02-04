/**
 * Organization Plan Limits Utilities
 *
 * Functions to check resource limits for organizations based on their subscription plan.
 * Organizations have shared resource pools that can be allocated to departments and members.
 *
 * @module lib/org-plan-limits
 */

import { prisma } from "@/lib/prisma";
import { getOrgPlanLimits, type OrgPlanType } from "@/shared/constants/org-plans";
import type { ServiceContext } from "@/shared/types/context";
import type { LimitCheckResult } from "./plan-limits";

/**
 * Organization-specific PlanLimitError
 */
export class OrgPlanLimitError extends Error {
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
    this.name = "OrgPlanLimitError";
    this.resource = resource;
    this.current = current;
    this.max = max;
    this.upgradeUrl = "/organizations/billing/upgrade";
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
 * Get organization plan from context
 */
async function getOrgPlan(organizationId: string): Promise<OrgPlanType> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  return org.plan as OrgPlanType;
}

/**
 * Check if a limit value means unlimited (-1)
 */
function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/**
 * Check organization gateway creation limit
 */
export async function checkOrgGatewayLimit(ctx: ServiceContext): Promise<LimitCheckResult> {
  if (!ctx.organizationId) {
    throw new Error("Organization context required");
  }

  const plan = await getOrgPlan(ctx.organizationId);
  const limits = getOrgPlanLimits(plan);
  const max = limits.sharedGateways;

  // Unlimited check
  if (isUnlimited(max)) {
    return { allowed: true, current: 0, max: -1, remaining: -1 };
  }

  const current = await prisma.gateway.count({
    where: { organizationId: ctx.organizationId },
  });

  return {
    allowed: current < max,
    current,
    max,
    remaining: Math.max(0, max - current),
  };
}

/**
 * Check organization plugin installation limit
 */
export async function checkOrgPluginLimit(ctx: ServiceContext): Promise<LimitCheckResult> {
  if (!ctx.organizationId) {
    throw new Error("Organization context required");
  }

  const plan = await getOrgPlan(ctx.organizationId);
  const limits = getOrgPlanLimits(plan);
  const max = limits.sharedPlugins;

  // Unlimited check
  if (isUnlimited(max)) {
    return { allowed: true, current: 0, max: -1, remaining: -1 };
  }

  const current = await prisma.userPlugin.count({
    where: { organizationId: ctx.organizationId },
  });

  return {
    allowed: current < max,
    current,
    max,
    remaining: Math.max(0, max - current),
  };
}

/**
 * Check organization workflow creation limit
 */
export async function checkOrgWorkflowLimit(ctx: ServiceContext): Promise<LimitCheckResult> {
  if (!ctx.organizationId) {
    throw new Error("Organization context required");
  }

  const plan = await getOrgPlan(ctx.organizationId);
  const limits = getOrgPlanLimits(plan);
  const max = limits.sharedWorkflows;

  // Unlimited check
  if (isUnlimited(max)) {
    return { allowed: true, current: 0, max: -1, remaining: -1 };
  }

  const current = await prisma.workflow.count({
    where: { organizationId: ctx.organizationId },
  });

  return {
    allowed: current < max,
    current,
    max,
    remaining: Math.max(0, max - current),
  };
}

/**
 * Get all organization resource usage
 */
export async function getOrgResourceUsage(ctx: ServiceContext): Promise<{
  gateways: LimitCheckResult;
  plugins: LimitCheckResult;
  workflows: LimitCheckResult;
  plan: OrgPlanType;
}> {
  if (!ctx.organizationId) {
    throw new Error("Organization context required");
  }

  const plan = await getOrgPlan(ctx.organizationId);

  const [gateways, plugins, workflows] = await Promise.all([
    checkOrgGatewayLimit(ctx),
    checkOrgPluginLimit(ctx),
    checkOrgWorkflowLimit(ctx),
  ]);

  return {
    gateways,
    plugins,
    workflows,
    plan,
  };
}

/**
 * Enforce organization gateway limit - throws OrgPlanLimitError if limit reached
 */
export async function enforceOrgGatewayLimit(ctx: ServiceContext): Promise<void> {
  const limit = await checkOrgGatewayLimit(ctx);

  if (!limit.allowed) {
    const plan = await getOrgPlan(ctx.organizationId!);
    throw new OrgPlanLimitError(
      `Organization gateway limit reached (${limit.current}/${limit.max}). Upgrade your organization plan to create more gateways.`,
      "gateways",
      limit.current,
      limit.max
    );
  }
}

/**
 * Enforce organization plugin limit - throws OrgPlanLimitError if limit reached
 */
export async function enforceOrgPluginLimit(ctx: ServiceContext): Promise<void> {
  const limit = await checkOrgPluginLimit(ctx);

  if (!limit.allowed) {
    const plan = await getOrgPlan(ctx.organizationId!);
    throw new OrgPlanLimitError(
      `Organization plugin limit reached (${limit.current}/${limit.max}). Upgrade your organization plan to install more plugins.`,
      "plugins",
      limit.current,
      limit.max
    );
  }
}

/**
 * Enforce organization workflow limit - throws OrgPlanLimitError if limit reached
 */
export async function enforceOrgWorkflowLimit(ctx: ServiceContext): Promise<void> {
  const limit = await checkOrgWorkflowLimit(ctx);

  if (!limit.allowed) {
    const plan = await getOrgPlan(ctx.organizationId!);
    throw new OrgPlanLimitError(
      `Workflow limit reached (${limit.current}/${limit.max}). Upgrade your organization plan to create more workflows.`,
      "workflows",
      limit.current,
      limit.max
    );
  }
}
