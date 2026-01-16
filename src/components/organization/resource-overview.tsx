"use client";

/**
 * Resource Overview Component
 *
 * Displays organization-wide resource usage with progress bars.
 *
 * @module components/organization/resource-overview
 */

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Activity, HardDrive, Puzzle, Router, Workflow } from "lucide-react";

// Types for quota status
interface QuotaItem {
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
}

interface QuotaStatus {
  workflows: QuotaItem;
  plugins: QuotaItem;
  apiCalls: QuotaItem & { resetsAt: string | null };
  storage: QuotaItem;
  gateways: QuotaItem;
}

interface ResourceOverviewProps {
  quotaStatus: QuotaStatus;
}

// Helper to format numbers
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Helper to format storage (MB)
function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

// Helper to get progress color class
function getProgressColor(percentage: number): string {
  if (percentage >= 90) return "bg-red-500";
  if (percentage >= 75) return "bg-amber-500";
  return "bg-primary";
}

// Resource row component
interface ResourceRowProps {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
  formatUsed?: (val: number) => string;
  formatLimit?: (val: number) => string;
  subtitle?: string;
}

function ResourceRow({
  icon,
  label,
  used,
  limit,
  percentage,
  isUnlimited,
  formatUsed = formatNumber,
  formatLimit = formatNumber,
  subtitle,
}: ResourceRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {formatUsed(used)} / {isUnlimited ? "∞" : formatLimit(limit ?? 0)}
          </span>
          {!isUnlimited && (
            <span
              className={cn(
                "text-xs",
                percentage >= 90
                  ? "text-red-500"
                  : percentage >= 75
                    ? "text-amber-500"
                    : "text-muted-foreground"
              )}
            >
              ({percentage}%)
            </span>
          )}
        </div>
      </div>
      <Progress
        value={isUnlimited ? 0 : percentage}
        className="h-2"
        style={
          {
            "--progress-indicator": getProgressColor(percentage),
          } as React.CSSProperties
        }
      />
      {Boolean(subtitle) && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

export function ResourceOverview({ quotaStatus }: ResourceOverviewProps) {
  // Format API call reset time
  const apiResetTime = quotaStatus.apiCalls.resetsAt
    ? new Date(quotaStatus.apiCalls.resetsAt).toLocaleTimeString()
    : null;

  return (
    <div className="space-y-4">
      <ResourceRow
        icon={<Workflow className="h-4 w-4" />}
        label="Workflows"
        used={quotaStatus.workflows.used}
        limit={quotaStatus.workflows.limit}
        percentage={quotaStatus.workflows.percentage}
        isUnlimited={quotaStatus.workflows.isUnlimited}
      />

      <ResourceRow
        icon={<Puzzle className="h-4 w-4" />}
        label="Plugins"
        used={quotaStatus.plugins.used}
        limit={quotaStatus.plugins.limit}
        percentage={quotaStatus.plugins.percentage}
        isUnlimited={quotaStatus.plugins.isUnlimited}
      />

      <ResourceRow
        icon={<Activity className="h-4 w-4" />}
        label="API Calls (Daily)"
        used={quotaStatus.apiCalls.used}
        limit={quotaStatus.apiCalls.limit}
        percentage={quotaStatus.apiCalls.percentage}
        isUnlimited={quotaStatus.apiCalls.isUnlimited}
        subtitle={apiResetTime ? `Resets at ${apiResetTime}` : undefined}
      />

      <ResourceRow
        icon={<HardDrive className="h-4 w-4" />}
        label="Storage"
        used={quotaStatus.storage.used}
        limit={quotaStatus.storage.limit}
        percentage={quotaStatus.storage.percentage}
        isUnlimited={quotaStatus.storage.isUnlimited}
        formatUsed={formatStorage}
        formatLimit={formatStorage}
      />

      <ResourceRow
        icon={<Router className="h-4 w-4" />}
        label="Gateways"
        used={quotaStatus.gateways.used}
        limit={quotaStatus.gateways.limit}
        percentage={quotaStatus.gateways.percentage}
        isUnlimited={quotaStatus.gateways.isUnlimited}
      />
    </div>
  );
}
