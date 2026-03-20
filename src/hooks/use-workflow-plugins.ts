"use client";

/**
 * Shared hook for fetching and merging workflow-compatible plugins.
 *
 * Used by both WorkflowPluginSidebar and AddStepDialog to avoid
 * duplicating the same fetch + merge + filter logic.
 *
 * @module hooks/use-workflow-plugins
 */

import { useEffect, useState } from "react";

import { getInstalledPlugins, getPluginCatalog } from "@/lib/api-client";
import type { PluginListItem } from "@/shared/types/plugin";

interface UseWorkflowPluginsOptions {
  gatewayType: string;
  token: string | null;
  /** Only fetch when true (default: true). Useful for dialog open state. */
  enabled?: boolean;
}

interface UseWorkflowPluginsResult {
  plugins: PluginListItem[];
  isLoading: boolean;
  error: string | null;
}

export function useWorkflowPlugins({
  gatewayType,
  token,
  enabled = true,
}: UseWorkflowPluginsOptions): UseWorkflowPluginsResult {
  const [plugins, setPlugins] = useState<PluginListItem[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const authToken = token ?? undefined;
    Promise.all([
      getPluginCatalog(undefined, authToken),
      getInstalledPlugins(authToken),
    ])
      .then(([catalogResult, installedResult]) => {
        if (cancelled) return;
        const merged: PluginListItem[] = [];
        const seenPluginIds = new Set<string>();

        // Add user's installed plugins first
        if (installedResult.success && installedResult.data) {
          for (const up of installedResult.data) {
            if (!seenPluginIds.has(up.pluginId)) {
              seenPluginIds.add(up.pluginId);
              merged.push({
                id: up.pluginId,
                slug: up.pluginSlug,
                name: up.pluginName,
                description: up.pluginDescription,
                version: "1.0.0",
                icon: up.pluginIcon,
                category: up.pluginCategory,
                tags: [],
                requiredGateways: up.requiredGateways,
                isBuiltin: up.authorType === "SYSTEM",
                authorType: up.authorType ?? "USER",
                isPublic: false,
              });
            }
          }
        }

        // Add catalog plugins that aren't already in the list
        if (catalogResult.success && catalogResult.data) {
          for (const p of catalogResult.data) {
            if (!seenPluginIds.has(p.id)) {
              seenPluginIds.add(p.id);
              merged.push(p);
            }
          }
        }

        // Filter to plugins compatible with this gateway type
        const compatible = merged.filter(
          (p) =>
            p.requiredGateways.length === 0 ||
            p.requiredGateways.includes(gatewayType)
        );
        setPlugins(compatible);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load plugins");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, gatewayType, enabled]);

  return { plugins, isLoading, error };
}
