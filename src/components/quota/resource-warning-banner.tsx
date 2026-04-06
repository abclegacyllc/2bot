"use client";

/**
 * Resource Warning Banner (Connected)
 *
 * Reads the current user's resource status via `useResourceStatus()`,
 * finds the resource closest to its limit, and renders a
 * `UsageWarningBanner` if any resource is ≥ 80 %.
 *
 * Drop this into the dashboard layout to show global warnings.
 *
 * @module components/quota/resource-warning-banner
 */

import { isOrgStatus, isPersonalStatus, useResourceStatus } from "@/components/resources/use-resource-status";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { UsageWarningBanner, getWarningLevel } from "./usage-warning-banner";

interface ResourceWarning {
  resource: string;
  percentage: number;
  current: number;
  limit: number;
  resetsAt?: Date;
}

interface ResourceWarningBannerProps {
  /** Organization ID — when set, reads org-level resources instead of personal */
  orgId?: string;
  className?: string;
}

/**
 * Extract the single highest-warning resource from the resource status.
 */
function extractHighestWarning(
  status: ReturnType<typeof useResourceStatus>["status"]
): ResourceWarning | null {
  if (!status) return null;

  const candidates: ResourceWarning[] = [];

  const push = (
    label: string,
    used: number,
    limit: number | null,
    percentage: number,
    resetsAt?: string | null,
  ) => {
    if (limit === null || limit === undefined || limit === -1) return; // unlimited — skip
    if (percentage < 80) return;
    candidates.push({
      resource: label,
      percentage,
      current: used,
      limit,
      resetsAt: resetsAt ? new Date(resetsAt) : undefined,
    });
  };

  if (isPersonalStatus(status) || isOrgStatus(status)) {
    const a = status.automation;
    push("gateways", a.gateways.count.used, a.gateways.count.limit, a.gateways.count.percentage);
    push("plugins", a.plugins.count.used, a.plugins.count.limit, a.plugins.count.percentage);
    push("workflows", a.workflows.count.used, a.workflows.count.limit, a.workflows.count.percentage);
    push(
      "workflow runs",
      a.workflows.metrics.runs.current,
      a.workflows.metrics.runs.limit,
      a.workflows.metrics.runs.percentage,
      a.workflows.metrics.runs.resetsAt,
    );

    const credits = status.billing.credits;
    if (credits.monthlyBudget !== null && credits.monthlyBudget !== undefined && credits.monthlyBudget > 0) {
      push(
        "AI credits",
        credits.usage.total.current,
        credits.usage.total.limit,
        credits.usage.total.percentage,
        credits.resetsAt,
      );
    }
  }

  if (candidates.length === 0) return null;

  // Return the resource with the highest percentage (most critical)
  candidates.sort((a, b) => b.percentage - a.percentage);
  return candidates[0] ?? null;
}

export function ResourceWarningBanner({ orgId, className }: ResourceWarningBannerProps) {
  const { status } = useResourceStatus({
    orgId,
    refreshInterval: 60_000, // re-check every minute
  });
  const router = useRouter();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const handleUpgrade = useCallback(() => {
    router.push(orgId ? `/organizations/${orgId}/billing/upgrade` : "/billing/upgrade");
  }, [router, orgId]);

  const warning = extractHighestWarning(status);

  // Nothing to warn about, or user dismissed this specific resource
  if (!warning || dismissed === warning.resource) return null;

  // Don't render if below threshold (double-check)
  if (!getWarningLevel(warning.percentage)) return null;

  return (
    <UsageWarningBanner
      resource={warning.resource}
      percentage={warning.percentage}
      current={warning.current}
      limit={warning.limit}
      resetsAt={warning.resetsAt}
      onUpgrade={handleUpgrade}
      onDismiss={() => setDismissed(warning.resource)}
      className={className}
    />
  );
}
