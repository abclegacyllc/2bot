"use client";

/**
 * Custom xyflow node components for the Project Architecture Canvas.
 *
 * One node component per `TopologyNodeKind`. Visual style mirrors the
 * Workflow DAG (`bot-studio/workflow-canvas.tsx`) so the two surfaces
 * feel like one product. Each node:
 *
 *   - has a left "target" handle and a right "source" handle
 *   - shows the kind icon, label, and 1–2 lines of metadata
 *   - colours follow the existing palette (emerald / sky / amber / …)
 *
 * No business logic lives here — props.data is the strongly-typed
 * payload from `getProjectTopology` plus a `onSelect` callback.
 *
 * @module components/project-architecture/nodes
 */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
    Bot,
    Cable,
    Calendar,
    Database,
    Globe,
    KeyRound,
    Puzzle,
    Workflow as WorkflowIcon,
    type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
    DatabaseNode as TopologyDatabaseNode,
    ExternalApiNode as TopologyExternalApiNode,
    GatewayNode as TopologyGatewayNode,
    HttpRouteNode as TopologyHttpRouteNode,
    TopologyNodeKind,
    PluginNode as TopologyPluginNode,
    ScheduleNode as TopologyScheduleNode,
    SecretNode as TopologySecretNode,
    WorkflowNode as TopologyWorkflowNode,
} from "@/lib/api-client";

import {
    ARCHITECTURE_NODE_HEIGHT,
    ARCHITECTURE_NODE_WIDTH,
} from "./auto-layout";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * xyflow's `Node<TData>` constraint requires `TData extends Record<string, unknown>`.
 * Topology node types are interfaces, which are not implicitly assignable to that
 * constraint, so we declare a wrapper alias with an index signature and cast at
 * the boundary (`toFlowNode` in `architecture-canvas.tsx`).
 */
export type ArchitectureNodeData = Record<string, unknown> & {
  onSelect?: () => void;
};

type WithSelect<T> = T & { onSelect?: () => void };

const KIND_STYLES: Record<
  TopologyNodeKind,
  { className: string; icon: LucideIcon; label: string }
> = {
  GATEWAY: {
    className: "border-sky-500/60 bg-sky-500/10",
    icon: Bot,
    label: "Gateway",
  },
  WORKFLOW: {
    className: "border-emerald-500/60 bg-emerald-500/10",
    icon: WorkflowIcon,
    label: "Workflow",
  },
  PLUGIN: {
    className: "border-violet-500/60 bg-violet-500/10",
    icon: Puzzle,
    label: "Plugin",
  },
  HTTP_ROUTE: {
    className: "border-orange-500/60 bg-orange-500/10",
    icon: Globe,
    label: "HTTP Route",
  },
  SCHEDULE: {
    className: "border-amber-500/60 bg-amber-500/10",
    icon: Calendar,
    label: "Schedule",
  },
  SECRET: {
    className: "border-zinc-500/60 bg-zinc-500/10",
    icon: KeyRound,
    label: "Secret",
  },
  EXTERNAL_API: {
    className: "border-cyan-500/60 bg-cyan-500/10",
    icon: Cable,
    label: "External API",
  },
  DATABASE: {
    className: "border-rose-500/60 bg-rose-500/10",
    icon: Database,
    label: "Database",
  },
};

const HANDLE_BASE = "!w-3 !h-3 !border-2 !border-background";

interface NodeShellProps {
  kind: TopologyNodeKind;
  label: string;
  /** 1-2 lines of metadata under the label. */
  meta?: React.ReactNode;
  /** Top-right small badge (e.g. status). */
  badge?: React.ReactNode;
  onSelect?: () => void;
  /** Hide the left target handle (e.g. on root SECRET nodes). */
  hideTarget?: boolean;
  /** Hide the right source handle (e.g. on terminal GATEWAY nodes that emit nothing inward). */
  hideSource?: boolean;
}

function NodeShell({
  kind,
  label,
  meta,
  badge,
  onSelect,
  hideTarget,
  hideSource,
}: NodeShellProps) {
  const style = KIND_STYLES[kind];
  const Icon = style.icon;
  return (
    <div
      className={`rounded-lg border-2 ${style.className} px-3 py-2 shadow-sm transition-shadow hover:shadow-md ${
        onSelect ? "cursor-pointer" : ""
      }`}
      style={{ width: ARCHITECTURE_NODE_WIDTH, minHeight: ARCHITECTURE_NODE_HEIGHT }}
      onClick={onSelect}
    >
      {!hideTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className={HANDLE_BASE}
          style={{ backgroundColor: "var(--canvas-accent, #10b981)" }}
        />
      ) : null}
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {style.label}
          </p>
          <p className="truncate text-sm font-semibold text-foreground" title={label}>
            {label}
          </p>
        </div>
        {badge}
      </div>
      {meta ? (
        <div className="mt-1.5 space-y-0.5 pl-9 text-[11px] text-muted-foreground">
          {meta}
        </div>
      ) : null}
      {!hideSource ? (
        <Handle
          type="source"
          position={Position.Right}
          className={HANDLE_BASE}
          style={{ backgroundColor: "var(--canvas-accent, #10b981)" }}
        />
      ) : null}
    </div>
  );
}

function statusBadge(status: string): React.ReactNode {
  const lower = status.toLowerCase();
  const variant: "default" | "secondary" | "destructive" | "outline" =
    lower === "active"
      ? "default"
      : lower === "paused" || lower === "archived"
        ? "secondary"
        : lower === "error" || lower === "errored"
          ? "destructive"
          : "outline";
  return (
    <Badge variant={variant} className="text-[9px]">
      {status}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind nodes
// ─────────────────────────────────────────────────────────────────────────────

// Each per-kind node receives a generic `NodeProps` and casts `props.data`
// to its concrete topology shape. `toFlowNode` in `architecture-canvas.tsx`
// is the single boundary that injects the matching shape, so the cast is
// safe at runtime and keeps the canvas free of phantom-type acrobatics.

export function GatewayCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologyGatewayNode>;
  return (
    <NodeShell
      kind="GATEWAY"
      label={data.label}
      onSelect={data.onSelect}
      badge={statusBadge(data.data.status)}
      meta={
        <p className="font-mono">
          {data.data.type.toLowerCase().replace(/_/g, " ")}
        </p>
      }
    />
  );
}

export function WorkflowCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologyWorkflowNode>;
  return (
    <NodeShell
      kind="WORKFLOW"
      label={data.label}
      onSelect={data.onSelect}
      badge={statusBadge(data.data.status)}
      meta={
        <>
          <p className="font-mono">{data.data.triggerType.toLowerCase()}</p>
          {!data.data.isEnabled ? (
            <p className="italic text-amber-500/80">disabled</p>
          ) : null}
        </>
      }
    />
  );
}

export function PluginCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologyPluginNode>;
  return (
    <NodeShell
      kind="PLUGIN"
      label={data.label}
      onSelect={data.onSelect}
      badge={data.data.isEnabled ? null : statusBadge("paused")}
      meta={<p className="truncate font-mono">{data.data.pluginSlug}</p>}
    />
  );
}

export function HttpRouteCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologyHttpRouteNode>;
  return (
    <NodeShell
      kind="HTTP_ROUTE"
      label={data.label}
      onSelect={data.onSelect}
      hideTarget
      badge={statusBadge(data.data.status)}
      meta={
        <p className="truncate font-mono">
          {data.data.method} {data.data.path}
        </p>
      }
    />
  );
}

export function ScheduleCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologyScheduleNode>;
  return (
    <NodeShell
      kind="SCHEDULE"
      label={data.label}
      onSelect={data.onSelect}
      hideTarget
      badge={statusBadge(data.data.enabled ? data.data.status : "PAUSED")}
      meta={
        <p className="truncate font-mono" title={data.data.cron}>
          {data.data.cron}
          {data.data.timezone ? ` · ${data.data.timezone}` : ""}
        </p>
      }
    />
  );
}

export function SecretCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologySecretNode>;
  return (
    <NodeShell
      kind="SECRET"
      label={data.label}
      onSelect={data.onSelect}
      hideTarget
      badge={statusBadge(data.data.status)}
      meta={<p className="truncate font-mono">{data.data.key}</p>}
    />
  );
}

export function ExternalApiCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologyExternalApiNode>;
  return (
    <NodeShell
      kind="EXTERNAL_API"
      label={data.label}
      onSelect={data.onSelect}
      hideTarget
      badge={statusBadge(data.data.status)}
      meta={
        <>
          <p className="truncate font-mono" title={data.data.baseUrl}>
            {data.data.baseUrl}
          </p>
          <p className="text-[10px] uppercase">{data.data.authMode}</p>
        </>
      }
    />
  );
}

export function DatabaseCanvasNode(props: NodeProps<Node<ArchitectureNodeData>>) {
  const data = props.data as unknown as WithSelect<TopologyDatabaseNode>;
  return (
    <NodeShell
      kind="DATABASE"
      label={data.label}
      onSelect={data.onSelect}
      hideTarget
      badge={statusBadge(data.data.status)}
      meta={
        <p className="truncate font-mono">
          {data.data.driver.toLowerCase()} · {data.data.host}/{data.data.database}
        </p>
      }
    />
  );
}

/**
 * `nodeTypes` map ready to pass to `<ReactFlow nodeTypes={...} />`.
 * Keys are the lowercased `TopologyNodeKind` so xyflow's `type` field
 * stays human-readable in the devtools.
 */
export const ARCHITECTURE_NODE_TYPES = {
  gateway: GatewayCanvasNode,
  workflow: WorkflowCanvasNode,
  plugin: PluginCanvasNode,
  http_route: HttpRouteCanvasNode,
  schedule: ScheduleCanvasNode,
  secret: SecretCanvasNode,
  external_api: ExternalApiCanvasNode,
  database: DatabaseCanvasNode,
} as const;

export type ArchitectureNodeType = keyof typeof ARCHITECTURE_NODE_TYPES;
