/**
 * Support AI Cost Tracking Service
 *
 * Tracks real API costs for the platform-funded support AI assistant.
 * All costs here are RAW API costs (no 3x margin) since the platform absorbs them.
 *
 * Cost formula: creditsCharged / 300 = real API cost in USD
 * (Because: creditsPerToken = API_cost_per_token × 300, and $1 = 100 credits)
 *
 * @module modules/support/support-ai-cost.service
 */

import { prisma } from "@/lib/prisma";

// ===========================================
// Constants
// ===========================================

/** Margin multiplier used in credit pricing (3x markup × 100 credits/$) */
const CREDIT_TO_USD_DIVISOR = 300;

// ===========================================
// Types
// ===========================================

export interface SupportAICostInput {
  userId?: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  creditsCharged: number; // Credits from the AI response (with margin)
}

export interface SupportAICostSummary {
  /** Current billing period (e.g. "2026-02") */
  currentPeriod: string;
  /** Stats for current billing period */
  current: PeriodCostStats;
  /** Stats for previous billing period */
  previous: PeriodCostStats;
  /** All-time totals */
  allTime: PeriodCostStats;
  /** Daily breakdown for current period */
  dailyBreakdown: DailyCostEntry[];
  /** Per-model breakdown for current period */
  modelBreakdown: ModelCostEntry[];
}

export interface PeriodCostStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalApiCostUsd: number;
  totalCreditsCharged: number;
  avgCostPerRequest: number;
}

export interface DailyCostEntry {
  date: string;
  requests: number;
  apiCostUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelCostEntry {
  model: string;
  provider: string;
  requests: number;
  apiCostUsd: number;
  inputTokens: number;
  outputTokens: number;
}

// ===========================================
// Service Functions
// ===========================================

/**
 * Log a support AI interaction cost
 */
export async function logSupportAICost(input: SupportAICostInput): Promise<void> {
  const now = new Date();
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const apiCostUsd = input.creditsCharged / CREDIT_TO_USD_DIVISOR;

  await prisma.supportAICost.create({
    data: {
      userId: input.userId || null,
      model: input.model,
      provider: input.provider,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      apiCostUsd,
      creditsCharged: input.creditsCharged,
      billingPeriod,
    },
  });
}

/**
 * Get full cost summary for admin dashboard
 */
export async function getSupportAICostSummary(): Promise<SupportAICostSummary> {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Previous period
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  // Run all queries in parallel
  const [currentStats, previousStats, allTimeStats, dailyRaw, modelRaw] = await Promise.all([
    getStatsForPeriod(currentPeriod),
    getStatsForPeriod(previousPeriod),
    getStatsAllTime(),
    getDailyBreakdown(currentPeriod),
    getModelBreakdown(currentPeriod),
  ]);

  return {
    currentPeriod,
    current: currentStats,
    previous: previousStats,
    allTime: allTimeStats,
    dailyBreakdown: dailyRaw,
    modelBreakdown: modelRaw,
  };
}

// ===========================================
// Internal Helpers
// ===========================================

async function getStatsForPeriod(billingPeriod: string): Promise<PeriodCostStats> {
  const result = await prisma.supportAICost.aggregate({
    where: { billingPeriod },
    _count: true,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      apiCostUsd: true,
      creditsCharged: true,
    },
  });

  const totalRequests = result._count;
  const totalApiCostUsd = result._sum.apiCostUsd ?? 0;

  return {
    totalRequests,
    totalInputTokens: result._sum.inputTokens ?? 0,
    totalOutputTokens: result._sum.outputTokens ?? 0,
    totalApiCostUsd,
    totalCreditsCharged: result._sum.creditsCharged ?? 0,
    avgCostPerRequest: totalRequests > 0 ? totalApiCostUsd / totalRequests : 0,
  };
}

async function getStatsAllTime(): Promise<PeriodCostStats> {
  const result = await prisma.supportAICost.aggregate({
    _count: true,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      apiCostUsd: true,
      creditsCharged: true,
    },
  });

  const totalRequests = result._count;
  const totalApiCostUsd = result._sum.apiCostUsd ?? 0;

  return {
    totalRequests,
    totalInputTokens: result._sum.inputTokens ?? 0,
    totalOutputTokens: result._sum.outputTokens ?? 0,
    totalApiCostUsd,
    totalCreditsCharged: result._sum.creditsCharged ?? 0,
    avgCostPerRequest: totalRequests > 0 ? totalApiCostUsd / totalRequests : 0,
  };
}

async function getDailyBreakdown(billingPeriod: string): Promise<DailyCostEntry[]> {
  // Fetch all costs for the period and aggregate by date in code
  const costs = await prisma.supportAICost.findMany({
    where: { billingPeriod },
    select: {
      createdAt: true,
      apiCostUsd: true,
      inputTokens: true,
      outputTokens: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const byDate = new Map<string, DailyCostEntry>();
  for (const cost of costs) {
    const date = cost.createdAt.toISOString().split("T")[0] ?? "";
    const existing = byDate.get(date);
    if (existing) {
      existing.requests += 1;
      existing.apiCostUsd += cost.apiCostUsd;
      existing.inputTokens += cost.inputTokens;
      existing.outputTokens += cost.outputTokens;
    } else {
      byDate.set(date, {
        date,
        requests: 1,
        apiCostUsd: cost.apiCostUsd,
        inputTokens: cost.inputTokens,
        outputTokens: cost.outputTokens,
      });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getModelBreakdown(billingPeriod: string): Promise<ModelCostEntry[]> {
  const costs = await prisma.supportAICost.groupBy({
    by: ["model", "provider"],
    where: { billingPeriod },
    _count: true,
    _sum: {
      apiCostUsd: true,
      inputTokens: true,
      outputTokens: true,
    },
  });

  return costs
    .map((c) => ({
      model: c.model,
      provider: c.provider,
      requests: c._count,
      apiCostUsd: c._sum.apiCostUsd ?? 0,
      inputTokens: c._sum.inputTokens ?? 0,
      outputTokens: c._sum.outputTokens ?? 0,
    }))
    .sort((a, b) => b.apiCostUsd - a.apiCostUsd);
}
