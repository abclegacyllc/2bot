"use client";

/**
 * Department Resource View Component
 *
 * Displays department-level resource usage with employee breakdown.
 * Can be used as a widget or in the manager dashboard.
 *
 * @module components/department/dept-resource-view
 */

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Activity,
    Cloud,
    Database,
    Puzzle,
    TrendingDown,
    TrendingUp,
    Users,
    Workflow,
} from "lucide-react";

// Types
interface QuotaItem {
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
}

interface DepartmentQuotaStatus {
  workflows: QuotaItem;
  plugins: QuotaItem;
  apiCalls: QuotaItem;
  storage: QuotaItem;
}

interface EmployeeSummary {
  total: number;
  active: number;
  paused: number;
}

interface DeptResourceViewProps {
  departmentName: string;
  quotaStatus: DepartmentQuotaStatus;
  employees: EmployeeSummary;
  trend?: {
    apiCallsChange: number; // percentage change from last period
    direction: "up" | "down" | "stable";
  };
  showTrend?: boolean;
  compact?: boolean;
}

// Helper functions
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatStorage(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

interface ResourceRowProps {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number | null;
  isUnlimited: boolean;
  percentage: number;
  formatFn?: (num: number) => string;
  compact?: boolean;
}

function ResourceRow({
  icon,
  label,
  used,
  limit,
  isUnlimited,
  percentage,
  formatFn = formatNumber,
  compact = false,
}: ResourceRowProps) {
  if (compact) {
    return (
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-medium">
          {formatFn(used)}/{isUnlimited ? "∞" : formatFn(limit ?? 0)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-medium">
          {formatFn(used)}/{isUnlimited ? "∞" : formatFn(limit ?? 0)}
          {!isUnlimited && (
            <span className="ml-1 text-muted-foreground">
              ({percentage.toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <Progress value={percentage} className="h-2" />
      )}
    </div>
  );
}

export function DeptResourceView({
  departmentName,
  quotaStatus,
  employees,
  trend,
  showTrend = false,
  compact = false,
}: DeptResourceViewProps) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Header with department name and employee count */}
      <div className="flex items-center justify-between">
        <span className="font-medium">{departmentName}</span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Users className="mr-1 h-3 w-3" />
            {employees.active}/{employees.total}
          </Badge>
          {employees.paused > 0 && (
            <Badge variant="destructive" className="text-xs">
              {employees.paused} paused
            </Badge>
          )}
        </div>
      </div>

      {/* Resource rows */}
      <div className={compact ? "space-y-2" : "space-y-4"}>
        <ResourceRow
          icon={<Workflow className="h-4 w-4 text-blue-500" />}
          label="Workflows"
          used={quotaStatus.workflows.used}
          limit={quotaStatus.workflows.limit}
          isUnlimited={quotaStatus.workflows.isUnlimited}
          percentage={quotaStatus.workflows.percentage}
          compact={compact}
        />

        <ResourceRow
          icon={<Puzzle className="h-4 w-4 text-purple-500" />}
          label="Plugins"
          used={quotaStatus.plugins.used}
          limit={quotaStatus.plugins.limit}
          isUnlimited={quotaStatus.plugins.isUnlimited}
          percentage={quotaStatus.plugins.percentage}
          compact={compact}
        />

        <ResourceRow
          icon={<Activity className="h-4 w-4 text-green-500" />}
          label="API Calls"
          used={quotaStatus.apiCalls.used}
          limit={quotaStatus.apiCalls.limit}
          isUnlimited={quotaStatus.apiCalls.isUnlimited}
          percentage={quotaStatus.apiCalls.percentage}
          compact={compact}
        />

        <ResourceRow
          icon={<Database className="h-4 w-4 text-amber-500" />}
          label="Storage"
          used={quotaStatus.storage.used}
          limit={quotaStatus.storage.limit}
          isUnlimited={quotaStatus.storage.isUnlimited}
          percentage={quotaStatus.storage.percentage}
          formatFn={formatStorage}
          compact={compact}
        />
      </div>

      {/* Trend indicator (optional) */}
      {Boolean(showTrend && trend) && (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2 text-sm">
          <span className="text-muted-foreground">API Usage Trend</span>
          <div className="flex items-center gap-1">
            {trend!.direction === "up" ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : trend!.direction === "down" ? (
              <TrendingDown className="h-4 w-4 text-green-500" />
            ) : (
              <Cloud className="h-4 w-4 text-muted-foreground" />
            )}
            <span
              className={
                trend!.direction === "up"
                  ? "text-red-500"
                  : trend!.direction === "down"
                    ? "text-green-500"
                    : "text-muted-foreground"
              }
            >
              {trend!.direction === "stable"
                ? "Stable"
                : `${trend!.direction === "up" ? "+" : "-"}${Math.abs(trend!.apiCallsChange)}%`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
