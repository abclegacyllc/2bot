"use client";

/**
 * Usage Overview Component
 *
 * Displays a summary of all resource usage for the current user's plan.
 * Shows executions, gateways, plugins, workflows in a grid.
 *
 * @module components/quota/usage-overview
 */

import { ResourceUsageCard } from "./resource-usage-card";
import { UsageWarningBanner } from "./usage-warning-banner";
import { cn } from "@/lib/utils";
import {
  Zap,
  Server,
  Plug,
  GitBranch,
  HardDrive,
  Clock,
  Users,
} from "lucide-react";
import { useMemo } from "react";

interface ResourceUsage {
  current: number;
  limit: number | null;
  resetsAt?: Date;
}

interface UsageOverviewProps {
  executions?: ResourceUsage;
  gateways?: ResourceUsage;
  plugins?: ResourceUsage;
  workflows?: ResourceUsage;
  storage?: ResourceUsage;
  teamMembers?: ResourceUsage;
  planName?: string;
  onUpgrade?: () => void;
  className?: string;
}

interface ResourceConfig {
  key: keyof Omit<UsageOverviewProps, "planName" | "onUpgrade" | "className">;
  label: string;
  icon: typeof Zap;
  unit?: string;
}

const RESOURCE_CONFIG: ResourceConfig[] = [
  { key: "executions", label: "Executions", icon: Zap, unit: "this month" },
  { key: "gateways", label: "AI Gateways", icon: Server },
  { key: "plugins", label: "Plugins", icon: Plug },
  { key: "workflows", label: "Workflows", icon: GitBranch },
  { key: "storage", label: "Storage", icon: HardDrive, unit: "GB" },
  { key: "teamMembers", label: "Team Members", icon: Users },
];

export function UsageOverview({
  executions,
  gateways,
  plugins,
  workflows,
  storage,
  teamMembers,
  planName = "Free",
  onUpgrade,
  className,
}: UsageOverviewProps) {
  const usageMap = { executions, gateways, plugins, workflows, storage, teamMembers };

  // Find highest usage percentage for warning banner
  const highestUsage = useMemo(() => {
    let highest = { resource: "", percentage: 0, usage: null as ResourceUsage | null };

    for (const config of RESOURCE_CONFIG) {
      const usage = usageMap[config.key] as ResourceUsage | undefined;
      if (!usage || usage.limit === null) continue;

      const percentage = usage.limit > 0 ? (usage.current / usage.limit) * 100 : 0;
      if (percentage > highest.percentage) {
        highest = { resource: config.label, percentage, usage };
      }
    }

    return highest;
  }, [usageMap]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Warning banner for highest usage */}
      {highestUsage.percentage >= 80 && highestUsage.usage && (
        <UsageWarningBanner
          resource={highestUsage.resource}
          percentage={highestUsage.percentage}
          current={highestUsage.usage.current}
          limit={highestUsage.usage.limit}
          resetsAt={highestUsage.usage.resetsAt}
          onUpgrade={onUpgrade}
        />
      )}

      {/* Plan info header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Resource Usage</h2>
          <p className="text-sm text-muted-foreground">
            Current plan: <span className="font-medium">{planName}</span>
          </p>
        </div>
        {executions?.resetsAt && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Resets {executions.resetsAt.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        )}
      </div>

      {/* Resource grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {RESOURCE_CONFIG.map((config) => {
          const usage = usageMap[config.key] as ResourceUsage | undefined;
          if (!usage) return null;

          return (
            <ResourceUsageCard
              key={config.key}
              icon={config.icon}
              label={config.label}
              current={usage.current}
              limit={usage.limit}
              unit={config.unit}
              resetsAt={usage.resetsAt}
              showUpgrade
              onUpgrade={onUpgrade}
            />
          );
        })}
      </div>
    </div>
  );
}
