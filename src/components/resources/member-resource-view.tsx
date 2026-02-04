"use client";

/**
 * Member Resource View (V2)
 * 
 * Displays member resources using the new hierarchical resource types.
 * Shows individual allocations and usage within department context.
 * 
 * @module components/resources/member-resource-view
 */

import {
    ResourcePoolCard,
    useResourceStatus,
    type ResourcePoolItem,
} from "@/components/resources";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrgMemberResourceStatus } from "@/shared/types/resources";
import {
    AlertCircle,
    Bot,
    Cpu,
    GitBranch,
    HardDrive,
    MemoryStick,
    RefreshCw,
    Server,
    User,
    Zap,
} from "lucide-react";

// ===========================================
// Props
// ===========================================

export interface MemberResourceViewProps {
  /** Organization ID */
  orgId: string;
  /** Department ID */
  deptId: string;
  /** Member user ID */
  memberId: string;
  /** Show compact view */
  compact?: boolean;
  /** Class name */
  className?: string;
}

// ===========================================
// Loading Skeleton
// ===========================================

function MemberResourceSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((i) => (
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
          {error?.message || "Failed to load member resources"}
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
// Role Display
// ===========================================

function getRoleDisplay(role: string): { label: string; variant: "default" | "secondary" } {
  switch (role) {
    case "DEPT_MANAGER":
      return { label: "Manager", variant: "default" };
    case "ORG_MEMBER":
      return { label: "Member", variant: "secondary" };
    default:
      return { label: role, variant: "secondary" };
  }
}

// ===========================================
// Main Component
// ===========================================

export function MemberResourceView({ 
  orgId, 
  deptId, 
  memberId,
  compact = false,
  className,
}: MemberResourceViewProps) {
  const { status, isLoading, error, refresh } = useResourceStatus({
    orgId,
    deptId,
    memberId,
  });

  if (isLoading) {
    return <MemberResourceSkeleton />;
  }

  if (error || !status || status.context !== "member") {
    return <ErrorDisplay error={error} onRetry={refresh} />;
  }

  const member = status as OrgMemberResourceStatus;
  const { automation, workspace, budget, usage } = member;
  const roleInfo = getRoleDisplay(member.role);

  // Allocation Items
  const allocationItems: ResourcePoolItem[] = [
    {
      label: "Gateways",
      icon: Server,
      current: automation.gateways.used,
      limit: automation.gateways.allocated,
    },
    {
      label: "Workflows",
      icon: GitBranch,
      current: automation.workflows.used,
      limit: automation.workflows.allocated,
    },
    {
      label: "Credit Budget",
      icon: Bot,
      current: budget.credits.used,
      limit: budget.credits.allocated,
    },
  ];

  // Usage Items
  const usageItems: ResourcePoolItem[] = [
    {
      label: "Workflow Runs",
      icon: Cpu,
      current: usage.workflowRuns.current,
      limit: usage.workflowRuns.limit,
      period: usage.workflowRuns.period,
      resetsAt: usage.workflowRuns.resetsAt,
    },
    {
      label: "Gateway Requests",
      icon: Zap,
      current: usage.gatewayRequests.current,
      limit: usage.gatewayRequests.limit,
      period: usage.gatewayRequests.period,
      resetsAt: usage.gatewayRequests.resetsAt,
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

  if (compact) {
    // Compact view: just allocations in one card
    return (
      <ResourcePoolCard
        title={member.memberName}
        description={roleInfo.label}
        icon={User}
        items={allocationItems}
        badge={roleInfo.label}
        badgeVariant={roleInfo.variant}
        className={className}
      />
    );
  }

  return (
    <div className={`space-y-6 ${className ?? ""}`}>
      <ResourcePoolCard
        title="Your Allocations"
        description={`Resources allocated to ${member.memberName}`}
        icon={User}
        items={allocationItems}
        badge={roleInfo.label}
        badgeVariant={roleInfo.variant}
      />

      <ResourcePoolCard
        title="Your Usage"
        description="Current usage within your allocations"
        icon={Zap}
        items={usageItems}
      />

      {workspace && (
        <ResourcePoolCard
          title="Your Workspace"
          description="Compute resources allocated to you"
          icon={Server}
          items={workspaceItems}
          columns={3}
        />
      )}
    </div>
  );
}
