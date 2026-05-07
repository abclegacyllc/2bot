"use client";

/**
 * Path C, Phase 7.4 — shared loader for the workflow + user-plugin pickers
 * used inside resource Create/Edit dialogs.
 *
 * Keeps both dialogs in sync (same fetch, same loading model) without
 * coupling them or duplicating fetch logic.
 */

import {
    getInstalledPlugins,
    getWorkflows,
    type WorkflowListItem,
} from "@/lib/api-client";
import type { UserPlugin } from "@/shared/types/plugin";
import { useEffect, useState } from "react";

export interface ResourceTargets {
  workflows: WorkflowListItem[];
  userPlugins: UserPlugin[];
  loading: boolean;
  error: string | null;
}

export function useResourceTargets(
  open: boolean,
  token: string | null,
): ResourceTargets {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [userPlugins, setUserPlugins] = useState<UserPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [wfRes, upRes] = await Promise.all([
          getWorkflows({}, token ?? undefined),
          getInstalledPlugins(token ?? undefined),
        ]);
        if (cancelled) return;
        if (wfRes.success && wfRes.data) setWorkflows(wfRes.data);
        if (upRes.success && upRes.data) setUserPlugins(upRes.data);
        if (!wfRes.success && !upRes.success) {
          setError("Failed to load workflows and plugins");
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  return { workflows, userPlugins, loading, error };
}
