"use client";

/**
 * Resource Overview Component
 * 
 * Displays all resource pools (Automation, Workspace, Billing) 
 * using the new hierarchical resource status types.
 * 
 * Automatically adapts to the context type:
 * - Personal: Shows owned resources
 * - Organization: Shows shared pools + allocation summary
 * - Department: Shows allocated resources + member distribution
 * - Member: Shows individual allocations
 * 
 * @module components/resources/resource-overview
 */

import type {
  OrgDeptResourceStatus,
  OrgMemberResourceStatus,
  OrgResourceStatus,
  PersonalResourceStatus,
} from "@/shared/types/resources";
import {
  Bot,
  Cpu,
  CreditCard,
  Database,
  FolderTree,
  GitBranch,
  HardDrive,
  ImageIcon,
  MemoryStick,
  MessageSquare,
  Server,
  Users,
  Zap
} from "lucide-react";
import type { ResourceStatus } from "./resource-context";
import { ResourcePoolCard, type ResourcePoolItem } from "./resource-pool-card";

// =============================================
// Type guards
// =============================================

function isPersonal(s: ResourceStatus): s is PersonalResourceStatus {
  return s.context === "personal";
}

function isOrg(s: ResourceStatus): s is OrgResourceStatus {
  return s.context === "organization";
}

function isDept(s: ResourceStatus): s is OrgDeptResourceStatus {
  return s.context === "department";
}

function isMember(s: ResourceStatus): s is OrgMemberResourceStatus {
  return s.context === "member";
}

// =============================================
// Props
// =============================================

export interface ResourceOverviewProps {
  /** Resource status to display */
  status: ResourceStatus;
  /** Show workspace pool (even if null) */
  showWorkspace?: boolean;
  /** Additional class names */
  className?: string;
}

// =============================================
// Personal Resource Overview
// =============================================

function PersonalOverview({ status }: { status: PersonalResourceStatus }) {
  const { automation, workspace, billing } = status;
  
  // Automation Pool Items - Counts (how many exist)
  const automationCountItems: ResourcePoolItem[] = [
    {
      label: "Gateways",
      icon: Server,
      current: automation.gateways.count.used,
      limit: automation.gateways.count.limit,
    },
    {
      label: "Plugins",
      icon: Database,
      current: automation.plugins.count.used,
      limit: automation.plugins.count.limit,
    },
    {
      label: "Workflows",
      icon: GitBranch,
      current: automation.workflows.count.used,
      limit: automation.workflows.count.limit,
    },
  ];
  
  // Automation Pool Items - Usage Metrics (consumption tracking)
  const automationUsageItems: ResourcePoolItem[] = [
    {
      label: "Gateway Requests",
      icon: Zap,
      current: automation.gateways.metrics.requests.current,
      limit: automation.gateways.metrics.requests.limit,
      period: automation.gateways.metrics.requests.period,
      resetsAt: automation.gateways.metrics.requests.resetsAt,
    },
    {
      label: "Plugin Executions",
      icon: Cpu,
      current: automation.plugins.metrics.executions.current,
      limit: automation.plugins.metrics.executions.limit,
      period: automation.plugins.metrics.executions.period,
      resetsAt: automation.plugins.metrics.executions.resetsAt,
    },
    {
      label: "Workflow Runs",
      icon: Cpu,
      current: automation.workflows.metrics.runs.current,
      limit: automation.workflows.metrics.runs.limit,
      period: automation.workflows.metrics.runs.period,
      resetsAt: automation.workflows.metrics.runs.resetsAt,
    },
  ];
  
  // Workspace Pool Items (if available)
  const workspaceItems: ResourcePoolItem[] = workspace ? [
    {
      label: "RAM",
      icon: MemoryStick,
      current: workspace.compute.ram.allocated,
      limit: workspace.compute.ram.limit,
      unit: workspace.compute.ram.unit,
    },
    {
      label: "CPU",
      icon: Cpu,
      current: workspace.compute.cpu.allocated,
      limit: workspace.compute.cpu.limit,
      unit: workspace.compute.cpu.unit,
    },
    {
      label: "Storage",
      icon: HardDrive,
      current: workspace.storage.allocation.allocated,
      limit: workspace.storage.allocation.limit,
      unit: workspace.storage.allocation.unit,
    },
  ] : [];
  
  // Billing Pool Items
  const billingItems: ResourcePoolItem[] = [
    {
      label: "AI Credits",
      icon: Bot,
      current: billing.credits.usage.ai.total.current,
      limit: billing.credits.usage.ai.total.limit,
      period: billing.credits.usage.ai.total.period,
      resetsAt: billing.credits.resetsAt,
    },
    {
      label: "↳ Chat",
      icon: MessageSquare,
      current: billing.credits.usage.ai.chat.current,
      limit: billing.credits.usage.ai.chat.limit,
    },
    {
      label: "↳ Images",
      icon: ImageIcon,
      current: billing.credits.usage.ai.images.current,
      limit: billing.credits.usage.ai.images.limit,
    },
    {
      label: "Seats",
      icon: Users,
      current: billing.subscription.seats.used,
      limit: billing.subscription.seats.limit,
    },
  ];

  return (
    <div className="space-y-6">
      <ResourcePoolCard
        title="Automation"
        description="Your gateways, plugins, and workflows"
        icon={Zap}
        items={automationCountItems}
      />
      
      <ResourcePoolCard
        title="Automation Usage"
        description="Request and execution metrics this period"
        icon={Cpu}
        items={automationUsageItems}
      />
      
      {workspace ? (
        <ResourcePoolCard
          title="Workspace"
          description="Compute resources for dedicated execution"
          icon={Server}
          items={workspaceItems}
          columns={3}
        />
      ) : (
        <ResourcePoolCard
          title="Workspace"
          description="Serverless execution mode - no dedicated workspace"
          icon={Server}
          items={[]}
          badge="SERVERLESS"
        />
      )}
      
      <ResourcePoolCard
        title="Billing"
        description="Credits and subscription"
        icon={CreditCard}
        items={billingItems}
      />
    </div>
  );
}

// =============================================
// Organization Resource Overview
// =============================================

function OrgOverview({ status }: { status: OrgResourceStatus }) {
  const { automation, workspace, billing, allocations } = status;
  
  // Automation Pool Items - Counts (how many exist)
  const automationCountItems: ResourcePoolItem[] = [
    {
      label: "Shared Gateways",
      icon: Server,
      current: automation.gateways.count.used,
      limit: automation.gateways.count.limit,
    },
    {
      label: "Shared Plugins",
      icon: Database,
      current: automation.plugins.count.used,
      limit: automation.plugins.count.limit,
    },
    {
      label: "Shared Workflows",
      icon: GitBranch,
      current: automation.workflows.count.used,
      limit: automation.workflows.count.limit,
    },
  ];
  
  // Automation Pool Items - Usage Metrics (consumption tracking)
  const automationUsageItems: ResourcePoolItem[] = [
    {
      label: "Gateway Requests",
      icon: Zap,
      current: automation.gateways.metrics.requests.current,
      limit: automation.gateways.metrics.requests.limit,
      period: automation.gateways.metrics.requests.period,
      resetsAt: automation.gateways.metrics.requests.resetsAt,
    },
    {
      label: "Plugin Executions",
      icon: Cpu,
      current: automation.plugins.metrics.executions.current,
      limit: automation.plugins.metrics.executions.limit,
      period: automation.plugins.metrics.executions.period,
      resetsAt: automation.plugins.metrics.executions.resetsAt,
    },
    {
      label: "Workflow Runs",
      icon: Cpu,
      current: automation.workflows.metrics.runs.current,
      limit: automation.workflows.metrics.runs.limit,
      period: automation.workflows.metrics.runs.period,
      resetsAt: automation.workflows.metrics.runs.resetsAt,
    },
  ];
  
  // Workspace Pool Items (if available)
  const workspaceItems: ResourcePoolItem[] = workspace ? [
    {
      label: "RAM Pool",
      icon: MemoryStick,
      current: allocations.allocated.ramMb,
      limit: workspace.compute.ram.limit,
      unit: "MB",
    },
    {
      label: "CPU Pool",
      icon: Cpu,
      current: allocations.allocated.cpuCores,
      limit: workspace.compute.cpu.limit,
      unit: "cores",
    },
    {
      label: "Storage Pool",
      icon: HardDrive,
      current: workspace.storage.allocation.allocated,
      limit: workspace.storage.allocation.limit,
      unit: workspace.storage.allocation.unit,
    },
  ] : [];
  
  // Billing Pool Items
  const billingItems: ResourcePoolItem[] = [
    {
      label: "AI Credits",
      icon: Bot,
      current: billing.credits.usage.ai.total.current,
      limit: billing.credits.usage.ai.total.limit,
      period: billing.credits.usage.ai.total.period,
      resetsAt: billing.credits.resetsAt,
    },
    {
      label: "↳ Chat",
      icon: MessageSquare,
      current: billing.credits.usage.ai.chat.current,
      limit: billing.credits.usage.ai.chat.limit,
    },
    {
      label: "↳ Images",
      icon: ImageIcon,
      current: billing.credits.usage.ai.images.current,
      limit: billing.credits.usage.ai.images.limit,
    },
    {
      label: "Seats",
      icon: Users,
      current: billing.subscription.seats.used,
      limit: billing.subscription.seats.limit,
    },
    {
      label: "Departments",
      icon: FolderTree,
      current: billing.subscription.departments.used,
      limit: billing.subscription.departments.limit,
    },
  ];

  return (
    <div className="space-y-6">
      <ResourcePoolCard
        title="Automation Pool"
        description={`Shared resources for ${allocations.memberCount} members in ${allocations.departmentCount} departments`}
        icon={Zap}
        items={automationCountItems}
      />
      
      <ResourcePoolCard
        title="Automation Usage"
        description="Organization-wide request and execution metrics"
        icon={Cpu}
        items={automationUsageItems}
      />
      
      {workspace ? (
        <ResourcePoolCard
          title="Workspace Pool"
          description="Shared compute resources"
          icon={Server}
          items={workspaceItems}
          columns={3}
        />
      ) : (
        <ResourcePoolCard
          title="Workspace"
          description="Serverless execution mode"
          icon={Server}
          items={[]}
          badge="SERVERLESS"
        />
      )}
      
      <ResourcePoolCard
        title="Billing"
        description="Credits and subscription"
        icon={CreditCard}
        items={billingItems}
      />
    </div>
  );
}

// =============================================
// Department Resource Overview
// =============================================

function DeptOverview({ status }: { status: OrgDeptResourceStatus }) {
  const { automation, workspace, budget, usage, memberAllocations } = status;
  
  // Allocated Resources
  const allocationItems: ResourcePoolItem[] = [
    {
      label: "Gateways Allocated",
      icon: Server,
      current: automation.gateways.used,
      limit: automation.gateways.allocated,
    },
    {
      label: "Plugins Allocated",
      icon: Database,
      current: automation.plugins.used,
      limit: automation.plugins.allocated,
    },
    {
      label: "Workflows Allocated",
      icon: GitBranch,
      current: automation.workflows.used,
      limit: automation.workflows.allocated,
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
      label: "Credit Budget",
      icon: Bot,
      current: budget.credits.used,
      limit: budget.credits.allocated,
    },
  ];
  
  // Workspace Items (if available)
  const workspaceItems: ResourcePoolItem[] = workspace ? [
    {
      label: "RAM Allocated",
      icon: MemoryStick,
      current: workspace.ram.used,
      limit: workspace.ram.allocated,
      unit: "MB",
    },
    {
      label: "CPU Allocated",
      icon: Cpu,
      current: workspace.cpu.used,
      limit: workspace.cpu.allocated,
      unit: "cores",
    },
    {
      label: "Storage Allocated",
      icon: HardDrive,
      current: workspace.storage.used,
      limit: workspace.storage.allocated,
      unit: "MB",
    },
  ] : [];

  return (
    <div className="space-y-6">
      <ResourcePoolCard
        title="Allocated Resources"
        description={`Resources allocated to ${status.departmentName}`}
        icon={FolderTree}
        items={allocationItems}
      />
      
      <ResourcePoolCard
        title="Usage"
        description={`Current usage (${memberAllocations.memberCount} members)`}
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
    </div>
  );
}

// =============================================
// Member Resource Overview
// =============================================

function MemberOverview({ status }: { status: OrgMemberResourceStatus }) {
  const { automation, workspace, budget, usage } = status;
  
  // Allocated Resources
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
  
  // Workspace Items (if available)
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

  return (
    <div className="space-y-6">
      <ResourcePoolCard
        title="Your Allocations"
        description={`Resources allocated to ${status.memberName}`}
        icon={Users}
        items={allocationItems}
      />
      
      <ResourcePoolCard
        title="Your Usage"
        description="Current usage within allocations"
        icon={Zap}
        items={usageItems}
      />
      
      {workspace && (
        <ResourcePoolCard
          title="Workspace"
          description="Your compute resources"
          icon={Server}
          items={workspaceItems}
          columns={3}
        />
      )}
    </div>
  );
}

// =============================================
// Main Component
// =============================================

export function ResourceOverview({ status, className }: ResourceOverviewProps) {
  if (isPersonal(status)) {
    return <PersonalOverview status={status} />;
  }
  
  if (isOrg(status)) {
    return <OrgOverview status={status} />;
  }
  
  if (isDept(status)) {
    return <DeptOverview status={status} />;
  }
  
  if (isMember(status)) {
    return <MemberOverview status={status} />;
  }
  
  return null;
}
