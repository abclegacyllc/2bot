/**
 * Smart Plugin Suggestions Engine
 *
 * Analyzes a user's installed plugins, gateway types, event coverage,
 * and usage patterns to recommend complementary plugins and bot templates.
 *
 * @module modules/plugin/plugin-suggestions
 */

import type { GatewayType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ServiceContext } from "@/shared/types/context";
import type { PluginCategory } from "./plugin.types";

// ===========================================
// Types
// ===========================================

export interface PluginSuggestion {
  /** What is being suggested */
  type: "plugin" | "bot-template";
  /** Plugin slug or bot-template ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Why we're suggesting it */
  reason: string;
  /** Suggestion priority (higher = more relevant) */
  score: number;
  /** Icon for display */
  icon: string | null;
  /** Category of the plugin (null for templates) */
  category: string | null;
  /** Tags for display */
  tags: string[];
}

// ===========================================
// Complementary category relationships
// ===========================================

/**
 * Categories that pair well together. If a user has plugins in category A,
 * suggest plugins from category B.
 */
const COMPLEMENTARY_CATEGORIES: Record<string, PluginCategory[]> = {
  messaging: ["analytics", "moderation"],
  general: ["analytics", "utilities"],
  analytics: ["messaging", "general"],
  moderation: ["analytics", "messaging"],
  automation: ["analytics", "utilities"],
  utilities: ["automation", "general"],
};

// ===========================================
// Suggestion Engine
// ===========================================

/**
 * Generate plugin suggestions for a user.
 *
 * Rules:
 * 1. If user has no plugins at all → suggest beginner bot templates
 * 2. If user has AI/chat but no analytics → suggest analytics plugins
 * 3. If user has only "responder" plugins → suggest "observer" plugins
 * 4. Category-based complementary suggestions
 * 5. If user has a gateway with no plugins → suggest plugins for that gateway type
 *
 * @returns Up to `limit` suggestions, scored and sorted by relevance
 */
export async function getPluginSuggestions(
  ctx: ServiceContext,
  limit = 5,
): Promise<PluginSuggestion[]> {
  const suggestions: PluginSuggestion[] = [];

  // Gather user's current state
  const [installedPlugins, userGateways] = await Promise.all([
    prisma.userPlugin.findMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      },
      include: {
        plugin: {
          select: {
            id: true,
            slug: true,
            name: true,
            category: true,
            tags: true,
            requiredGateways: true,
            eventTypes: true,
            eventRole: true,
          },
        },
        gateway: { select: { id: true, type: true } },
      },
    }),
    prisma.gateway.findMany({
      where: {
        ...(ctx.organizationId
          ? { organizationId: ctx.organizationId }
          : { userId: ctx.userId, organizationId: null }),
      },
      select: { id: true, type: true, name: true },
    }),
  ]);

  const installedSlugs = new Set(installedPlugins.map((p) => p.plugin.slug));
  const installedCategories = new Set(
    installedPlugins.map((p) => p.plugin.category),
  );
  const gatewayTypesWithPlugins = new Set(
    installedPlugins
      .filter((p): p is typeof p & { gateway: NonNullable<typeof p.gateway> } => p.gateway !== null && p.gateway !== undefined)
      .map((p) => p.gateway.type),
  );

  // Rule 1: No plugins at all → suggest beginner bot templates
  if (installedPlugins.length === 0) {
    const { getBotTemplateList } = await import("./bot-templates");
    const templates = getBotTemplateList();
    const beginnerTemplates = templates.filter((t) => t.difficulty === "beginner");

    for (const t of beginnerTemplates) {
      suggestions.push({
        type: "bot-template",
        id: t.id,
        name: t.name,
        reason: "Great starting point — installs a pre-configured plugin combo with one click",
        score: 100,
        icon: t.icon,
        category: null,
        tags: t.tags,
      });
    }
  }

  // Rule 2: Has messaging/general plugins but no analytics → suggest analytics
  if (
    (installedCategories.has("messaging") || installedCategories.has("general")) &&
    !installedCategories.has("analytics")
  ) {
    const analyticsPlugins = await prisma.plugin.findMany({
      where: {
        isActive: true,
        category: "analytics",
        slug: { notIn: [...installedSlugs] },
        OR: [{ isBuiltin: true }, { isPublic: true }],
      },
      select: { slug: true, name: true, icon: true, tags: true },
      take: 2,
    });

    for (const p of analyticsPlugins) {
      suggestions.push({
        type: "plugin",
        id: p.slug,
        name: p.name,
        reason: "You have chat plugins but no analytics — track your bot's engagement",
        score: 80,
        icon: p.icon,
        category: "analytics",
        tags: p.tags,
      });
    }
  }

  // Rule 3: Only responder plugins → suggest observer plugins
  const roles = installedPlugins.map((p) => p.plugin.eventRole ?? "responder");
  const hasResponder = roles.some((r) => r === "responder");
  const hasObserver = roles.some((r) => r === "observer");

  if (hasResponder && !hasObserver && installedPlugins.length > 0) {
    const observerPlugins = await prisma.plugin.findMany({
      where: {
        isActive: true,
        eventRole: "observer",
        slug: { notIn: [...installedSlugs] },
        OR: [{ isBuiltin: true }, { isPublic: true }],
      },
      select: { slug: true, name: true, icon: true, category: true, tags: true },
      take: 2,
    });

    for (const p of observerPlugins) {
      suggestions.push({
        type: "plugin",
        id: p.slug,
        name: p.name,
        reason:
          "All your plugins respond to events — add an observer to monitor without interfering",
        score: 60,
        icon: p.icon,
        category: p.category,
        tags: p.tags,
      });
    }
  }

  // Rule 4: Category-based complementary suggestions
  for (const cat of installedCategories) {
    const complements = COMPLEMENTARY_CATEGORIES[cat] ?? [];
    const missing = complements.filter((c) => !installedCategories.has(c));

    if (missing.length === 0) continue;

    const complementPlugins = await prisma.plugin.findMany({
      where: {
        isActive: true,
        category: { in: missing },
        slug: { notIn: [...installedSlugs] },
        OR: [{ isBuiltin: true }, { isPublic: true }],
      },
      select: { slug: true, name: true, icon: true, category: true, tags: true },
      take: 2,
    });

    for (const p of complementPlugins) {
      // Skip duplicates already in suggestions
      if (suggestions.some((s) => s.id === p.slug)) continue;
      suggestions.push({
        type: "plugin",
        id: p.slug,
        name: p.name,
        reason: `Pairs well with your ${cat} plugins`,
        score: 40,
        icon: p.icon,
        category: p.category,
        tags: p.tags,
      });
    }
  }

  // Rule 5: Gateway with no plugins → suggest plugins for that gateway type
  for (const gw of userGateways) {
    if (gatewayTypesWithPlugins.has(gw.type)) continue;

    const gwPlugins = await prisma.plugin.findMany({
      where: {
        isActive: true,
        requiredGateways: { has: gw.type },
        slug: { notIn: [...installedSlugs] },
        OR: [{ isBuiltin: true }, { isPublic: true }],
      },
      select: { slug: true, name: true, icon: true, category: true, tags: true },
      take: 2,
    });

    for (const p of gwPlugins) {
      if (suggestions.some((s) => s.id === p.slug)) continue;
      suggestions.push({
        type: "plugin",
        id: p.slug,
        name: p.name,
        reason: `Your "${gw.name}" bot has no plugins yet`,
        score: 70,
        icon: p.icon,
        category: p.category,
        tags: p.tags,
      });
    }

    // Also suggest bot templates for the gateway type
    if (installedPlugins.length === 0) continue; // already handled in Rule 1
    const { getBotTemplatesByGateway } = await import("./bot-templates");
    const gwTemplates = getBotTemplatesByGateway(gw.type as GatewayType);
    for (const t of gwTemplates.slice(0, 1)) {
      if (suggestions.some((s) => s.id === t.id)) continue;
      suggestions.push({
        type: "bot-template",
        id: t.id,
        name: t.name,
        reason: `Quick-start template for your "${gw.name}" bot`,
        score: 65,
        icon: t.icon,
        category: null,
        tags: t.tags,
      });
    }
  }

  // De-duplicate, sort by score descending, and return top N
  const seen = new Set<string>();
  const deduped = suggestions.filter((s) => {
    const key = `${s.type}:${s.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit);
}
