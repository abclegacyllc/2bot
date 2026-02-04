"use client";

/**
 * Department Resource View (V2)
 * 
 * Displays department resources using the new hierarchical resource types.
 * Shows allocated resources from org pool, usage, and member distribution.
 * 
 * @module components/resources/dept-resource-view
 */

import {
    ResourcePoolCard,
    useResourceStatus,
    type ResourcePoolItem,
} from "@/components/resources";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrgDeptResourceStatus } from "@/shared/types/resources";
import {
    AlertCircle,
    Bot,
    Cpu,
    Database,
    FolderTree,
    GitBranch,
    HardDrive,
    MemoryStick,
    RefreshCw,
    Server,
    Users,
    Zap,
} from "lucide-react";

// ===========================================
// Props
// ===========================================

export interface DeptResourceViewProps {
  /** Organization ID */
  orgId: string;
  /** Department ID */
  deptId: string;
  /** Show compact view */
  compact?: boolean;
  /** Class name */
  className?: string;
}

// ===========================================
// Loading Skeleton
// ===========================================

function DeptResourceSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-card/50">
          <div className="p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3].map((j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===========================================
// Error Display
// ===========================================

function ErrorDisplay({ 
  error, 
  onRetry 
}: { 
  error: Error | null; 
  onRetry: () => void;
}) {
  return (
    <Card className="bg-card/50 border-red-500/50">
      <CardContent className="py-8 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <p className="text-muted-foreground mb-4">
          {error?.message || "Failed to load department resources"}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Main Component
// ===========================================

export function DeptResourceView({ 
  orgId, 
  deptId, 
  compact = false,
  className,
}: DeptResourceViewProps) {
  const { status, isLoading, error, refresh } = useResourceStatus({
    orgId,
    deptId,
  });

  if (isLoading) {
    return <DeptResourceSkeleton />;
  }

  if (error || !status || status.context !== "department") {
    return <ErrorDisplay error={error} onRetry={refresh} />;
  }

  const dept = status as OrgDeptResourceStatus;
  const { automation, workspace, budget, usage, memberAllocations } = dept;

  // Allocated Resources Items
  const allocationItems: ResourcePoolItem[] = [
    {
      label: "Gateways",
      icon: Server,
      current: automation.gateways.used,
      limit: automation.gateways.allocated,
    },
    {
      label: "Plugins",
      icon: Database,
      current: automation.plugins.used,
      limit: automation.plugins.allocated,
    },
    {
      label: "Workflows",
      icon: GitBranch,
      current: automation.workflows.used,
      limit: automation.workflows.allocated,
    },
  ];

  // Usage Items - All automation usage metrics
  const usageItems: ResourcePoolItem[] = [
    {
      label: "Gateway Requests",
      icon: Zap,
      current: usage.gatewayRequests.current,
      limit: usage.gatewayRequests.limit,
      period: usage.gatewayRequests.period,
      resetsAt: usage.gatewayRequests.resetsAt,
    },
    {
      label: "Plugin Executions",
      icon: Cpu,
      current: usage.pluginExecutions.current,
      limit: usage.pluginExecutions.limit,
      period: usage.pluginExecutions.period,
      resetsAt: usage.pluginExecutions.resetsAt,
    },
    {
      label: "Workflow Runs",
      icon: GitBranch,
      current: usage.workflowRuns.current,
      limit: usage.workflowRuns.limit,
      period: usage.workflowRuns.period,
      resetsAt: usage.workflowRuns.resetsAt,
    },
    {
      label: "Credit Budget",
      icon: Bot,
      current: budget.credits.used,
      limit: budget.credits.allocated,
    },
  ];

  // Workspace Items
  const workspaceItems: ResourcePoolItem[] = workspace ? [
    {
      label: "RAM",
      icon: MemoryStick,
      current: workspace.ram.used,
      limit: workspace.ram.allocated,
      unit: "MB",
    },
    {
      label: "CPU",
      icon: Cpu,
      current: workspace.cpu.used,
      limit: workspace.cpu.allocated,
      unit: "cores",
    },
    {
      label: "Storage",
      icon: HardDrive,
      current: workspace.storage.used,
      limit: workspace.storage.allocated,
      unit: "MB",
    },
  ] : [];

  // Member Allocation Summary
  const memberSummaryItems: ResourcePoolItem[] = [
    {
      label: "Members",
      icon: Users,
      current: memberAllocations.memberCount,
      limit: null, // No limit on members within dept
    },
    {
      label: "Allocated to Members",
      icon: GitBranch,
      current: memberAllocations.allocated.workflows,
      limit: automation.workflows.allocated,
    },
    {
      label: "Budget Distributed",
      icon: Bot,
      current: memberAllocations.allocated.creditBudget,
      limit: budget.credits.allocated,
    },
  ];

  if (compact) {
    // Compact view: just allocation and usage in one card
    return (
      <ResourcePoolCard
        title={dept.departmentName}
        description={`${memberAllocations.memberCount} members`}
        icon={FolderTree}
        items={[...allocationItems.slice(0, 2), ...usageItems.slice(0, 1)]}
        badge={dept.isActive ? undefined : "INACTIVE"}
        badgeVariant={dept.isActive ? undefined : "destructive"}
        className={className}
      />
    );
  }

  return (
    <div className={`space-y-6 ${className ?? ""}`}>
      <ResourcePoolCard
        title="Allocated Resources"
        description={`Resources allocated to ${dept.departmentName} from organization pool`}
        icon={FolderTree}
        items={allocationItems}
        badge={dept.isActive ? "ACTIVE" : "INACTIVE"}
        badgeVariant={dept.isActive ? "secondary" : "destructive"}
      />

      <ResourcePoolCard
        title="Department Usage"
        description="Current usage within allocated limits"
        icon={Zap}
        items={usageItems}
      />

      {workspace && (
        <ResourcePoolCard
          title="Workspace Allocation"
          description="Compute resources for this department"
          icon={Server}
          items={workspaceItems}
          columns={3}
        />
      )}

      <ResourcePoolCard
        title="Member Distribution"
        description="How resources are allocated to members"
        icon={Users}
        items={memberSummaryItems}
      />
    </div>
  );
}
