"use client";

/**
 * Visual Workflow Canvas
 *
 * n8n-style node graph builder using @xyflow/react.
 * Renders workflow steps as a vertical DAG with a trigger node,
 * step nodes, and an add-step node. Supports drag-and-drop from
 * the plugin sidebar, node drag reordering, right-click context
 * menus, inline insert buttons, and keyboard shortcuts.
 *
 * @module components/bot-studio/workflow-canvas
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { WorkflowStepItem } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowDown,
  Clock,
  Copy,
  GripVertical,
  MapPin,
  Plus,
  Puzzle,
  Radio,
  Settings2,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLUGIN_DRAG_TYPE } from "./workflow-plugin-sidebar";

// ===========================================
// Constants
// ===========================================

const NODE_WIDTH = 300;
const NODE_GAP_Y = 120;
const TRIGGER_Y = 60;
const FIRST_STEP_Y = TRIGGER_Y + NODE_GAP_Y + 20;

// ===========================================
// Types
// ===========================================

interface WorkflowCanvasProps {
  steps: WorkflowStepItem[];
  selectedStepId: string | null;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  /** Map of stepId → error message from the last workflow run */
  stepErrors?: Record<string, string>;
  onSelectStep: (step: WorkflowStepItem) => void;
  onAddStep: (afterOrder: number) => void;
  onDeleteStep: (stepId: string) => Promise<void>;
  onMoveStep: (stepId: string, newOrder: number) => Promise<void>;
  onDropPlugin?: (pluginId: string, pluginName: string, afterOrder: number) => void;
  onDuplicateStep?: (step: WorkflowStepItem) => void;
  onClickTrigger?: () => void;
  isDisabled?: boolean;
}

// Custom node data types
type TriggerNodeData = {
  label: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  onClickTrigger?: () => void;
};

type StepNodeData = {
  step: WorkflowStepItem;
  index: number;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  totalSteps: number;
  /** Error message from the last run for this step */
  stepError?: string;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onInsertBefore: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isDisabled?: boolean;
};

type AddNodeData = {
  onAdd: () => void;
  isDisabled?: boolean;
};

// ===========================================
// Context Menu State
// ===========================================

interface ContextMenuState {
  x: number;
  y: number;
  step: WorkflowStepItem;
  handlers: {
    onSelect: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onInsertBefore: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
  };
  isFirst: boolean;
  isLast: boolean;
}

// ===========================================
// Trigger Type Labels
// ===========================================

const TRIGGER_LABELS: Record<string, string> = {
  BOT_MESSAGE: "When a message arrives",
  TELEGRAM_MESSAGE: "When a Telegram message arrives",
  DISCORD_MESSAGE: "When a Discord message arrives",
  DISCORD_COMMAND: "When a Discord command is used",
  SLACK_MESSAGE: "When a Slack message arrives",
  SLACK_COMMAND: "When a Slack command is used",
  WHATSAPP_MESSAGE: "When a WhatsApp message arrives",
  WEBHOOK: "When a webhook is called",
  SCHEDULE: "On a schedule",
  MANUAL: "Run manually",
};

const TRIGGER_COLORS: Record<string, string> = {
  BOT_MESSAGE: "border-emerald-500/60 bg-emerald-500/10",
  TELEGRAM_MESSAGE: "border-sky-500/60 bg-sky-500/10",
  DISCORD_MESSAGE: "border-indigo-500/60 bg-indigo-500/10",
  DISCORD_COMMAND: "border-indigo-500/60 bg-indigo-500/10",
  SLACK_MESSAGE: "border-purple-500/60 bg-purple-500/10",
  SLACK_COMMAND: "border-purple-500/60 bg-purple-500/10",
  WHATSAPP_MESSAGE: "border-green-500/60 bg-green-500/10",
  WEBHOOK: "border-orange-500/60 bg-orange-500/10",
  SCHEDULE: "border-amber-500/60 bg-amber-500/10",
  MANUAL: "border-zinc-500/60 bg-zinc-500/10",
};

// ===========================================
// Custom Node: Trigger
// ===========================================

function triggerFilterSummary(config?: Record<string, unknown>): string | null {
  if (!config) return null;
  const parts: string[] = [];
  if (typeof config.commandPrefix === "string" && config.commandPrefix) {
    parts.push(`commands: ${config.commandPrefix}`);
  }
  if (typeof config.textPattern === "string" && config.textPattern) {
    parts.push(`matching: ${config.textPattern}`);
  }
  if (typeof config.cron === "string" && config.cron) {
    parts.push(`cron: ${config.cron}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function TriggerNode({ data }: NodeProps<Node<TriggerNodeData>>) {
  const colorClass = TRIGGER_COLORS[data.triggerType] ?? "border-zinc-500/60 bg-zinc-500/10";
  const label = TRIGGER_LABELS[data.triggerType] ?? data.triggerType;
  const filterSummary = triggerFilterSummary(data.triggerConfig);

  return (
    <div
      className={`rounded-lg border-2 ${colorClass} px-4 py-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow`}
      style={{ width: NODE_WIDTH }}
      onClick={data.onClickTrigger}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-md bg-background/80 border border-border">
          <Zap className="h-4 w-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Starts when
          </p>
          <p className="text-sm font-semibold text-foreground truncate">
            {label}
          </p>
        </div>
        <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
      </div>
      {filterSummary ? (
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-9 truncate font-mono">
          {filterSummary}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 pl-9 italic">
          Click to configure filters
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-2.5 !h-2.5 !border-2 !border-background" />
    </div>
  );
}

function stepSummary(step: WorkflowStepItem): string | null {
  const parts: string[] = [];
  const inputCount = Object.keys(step.inputMapping ?? {}).length;
  if (inputCount > 0) parts.push(`${inputCount} input${inputCount !== 1 ? "s" : ""}`);
  const cfg = step.config as Record<string, unknown> | null;
  if (cfg?.gatewayActionsEnabled) parts.push("replies to user");
  if (step.condition) parts.push("conditional");
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ===========================================
// Custom Node: Workflow Step (rich)
// ===========================================

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const { step, index, isSelected, isFirst, isLast, onSelect, onDelete, onDuplicate, onInsertBefore, onMoveUp, onMoveDown, isDisabled, stepError } = data;

  const timeoutSec = typeof (step.config as Record<string, unknown> | null)?.timeoutMs === "number"
    ? Math.round(((step.config as Record<string, unknown>).timeoutMs as number) / 1000)
    : null;

  const inputCount = Object.keys(step.inputMapping ?? {}).length;
  const configCount = Object.keys(step.config ?? {}).filter((k) => k !== "timeoutMs").length;

  return (
    <div
      className={`rounded-lg border-2 transition-all cursor-pointer group relative ${
        stepError
          ? "border-red-500/60 bg-red-500/5 shadow-md shadow-red-500/10"
          : isSelected
            ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
            : "border-border bg-card hover:border-emerald-500/40 hover:shadow-md"
      } ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      style={{ width: NODE_WIDTH }}
      onClick={onSelect}
    >
      <Handle type="target" position={Position.Top} className="!bg-emerald-500 !w-2.5 !h-2.5 !border-2 !border-background" />

      {/* Drag grip indicator */}
      <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Header */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 min-w-[22px] justify-center shrink-0 font-bold"
          >
            {index + 1}
          </Badge>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Puzzle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">
              {step.name || step.pluginName || step.pluginSlug || "Unnamed Step"}
            </span>
          </div>
        </div>

        {/* Plugin slug subtitle */}
        {step.name && step.pluginSlug ? (
          <p className="text-[10px] text-muted-foreground mt-0.5 ml-8 truncate">
            {step.pluginSlug}
          </p>
        ) : null}

        {/* Step summary */}
        {(() => {
          const summary = stepSummary(step);
          return summary ? (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 ml-8 truncate italic">
              {summary}
            </p>
          ) : null;
        })()}
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
        {stepError ? (
          <Badge variant="destructive" className="text-[9px] px-1 py-0 gap-0.5" title={stepError}>
            <AlertCircle className="h-2.5 w-2.5" /> Failed
          </Badge>
        ) : null}
        {step.condition ? (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-500 border-amber-500/30">
            <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Condition
          </Badge>
        ) : null}
        {step.onError !== "stop" ? (
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {step.onError === "continue" ? "Skip on error" : `Retry ×${step.maxRetries}`}
          </Badge>
        ) : null}
        {inputCount > 0 ? (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-sky-500 border-sky-500/30">
            <MapPin className="h-2 w-2 mr-0.5" /> {inputCount} input{inputCount !== 1 ? "s" : ""}
          </Badge>
        ) : null}
        {configCount > 0 ? (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-violet-500 border-violet-500/30">
            <Settings2 className="h-2 w-2 mr-0.5" /> {configCount} setting{configCount !== 1 ? "s" : ""}
          </Badge>
        ) : null}
        {timeoutSec !== null && timeoutSec !== 60 ? (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-orange-500 border-orange-500/30">
            <Clock className="h-2 w-2 mr-0.5" /> {timeoutSec}s
          </Badge>
        ) : null}
      </div>

      {/* Action bar — visible on hover or when selected */}
      <div className={`flex items-center justify-between px-2 py-1 border-t border-border/50 ${
        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      } transition-opacity`}>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-0.5"
            onClick={(e) => { e.stopPropagation(); onInsertBefore(); }}
            disabled={isDisabled}
            title="Insert step before"
          >
            <Plus className="h-2.5 w-2.5" /> Insert
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-0.5"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            disabled={isDisabled}
            title="Duplicate step"
          >
            <Copy className="h-2.5 w-2.5" /> Duplicate
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={isFirst || isDisabled}
            title="Move up"
          >
            <ArrowDown className="h-3 w-3 rotate-180" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={isLast || isDisabled}
            title="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={isDisabled}
            title="Delete step"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-2.5 !h-2.5 !border-2 !border-background" />
    </div>
  );
}

// ===========================================
// Custom Node: Add Step
// ===========================================

function AddStepNode({ data }: NodeProps<Node<AddNodeData>>) {
  return (
    <div style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2 !border-2 !border-background" />
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-dashed hover:border-emerald-500 hover:text-emerald-500"
          onClick={data.onAdd}
          disabled={data.isDisabled}
        >
          <Plus className="h-3.5 w-3.5" /> Add a step
        </Button>
        <p className="text-[10px] text-muted-foreground/50">Choose a plugin to process data</p>
      </div>
    </div>
  );
}

// ===========================================
// Context Menu Component
// ===========================================

function CanvasContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { label: "Edit Step", icon: Settings2, action: menu.handlers.onSelect },
    { label: "Insert Before", icon: Plus, action: menu.handlers.onInsertBefore },
    { label: "Duplicate", icon: Copy, action: menu.handlers.onDuplicate },
    null, // separator
    { label: "Move Up", icon: ArrowDown, action: menu.handlers.onMoveUp, disabled: menu.isFirst, rotate: true },
    { label: "Move Down", icon: ArrowDown, action: menu.handlers.onMoveDown, disabled: menu.isLast },
    null,
    { label: "Delete", icon: Trash2, action: menu.handlers.onDelete, destructive: true },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={`sep-${i}`} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors ${
              item.disabled
                ? "opacity-40 cursor-not-allowed"
                : item.destructive
                  ? "text-red-500 hover:bg-red-500/10"
                  : "text-foreground hover:bg-muted"
            }`}
            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
            disabled={item.disabled}
          >
            <item.icon className={`h-3.5 w-3.5 ${item.rotate ? "rotate-180" : ""}`} />
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ===========================================
// Node Types Registry
// ===========================================

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  step: StepNode,
  addStep: AddStepNode,
};

// ===========================================
// Main Component
// ===========================================

export function WorkflowCanvas({
  steps,
  selectedStepId,
  triggerType,
  triggerConfig,
  stepErrors,
  onSelectStep,
  onAddStep,
  onDeleteStep,
  onMoveStep,
  onDropPlugin,
  onDuplicateStep,
  onClickTrigger,
  isDisabled,
}: WorkflowCanvasProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.order - b.order),
    [steps]
  );

  // Build handlers for each step (memoized per step list)
  const stepHandlers = useMemo(() => {
    return sortedSteps.map((step, idx) => ({
      onSelect: () => onSelectStep(step),
      onDelete: () => onDeleteStep(step.id),
      onDuplicate: () => onDuplicateStep?.(step),
      onInsertBefore: () => onAddStep(step.order),
      onMoveUp: () => {
        if (idx > 0) {
          const prev = sortedSteps[idx - 1];
          if (prev) onMoveStep(step.id, prev.order);
        }
      },
      onMoveDown: () => {
        if (idx < sortedSteps.length - 1) {
          const next = sortedSteps[idx + 1];
          if (next) onMoveStep(step.id, next.order);
        }
      },
    }));
  }, [sortedSteps, onSelectStep, onDeleteStep, onDuplicateStep, onAddStep, onMoveStep]);

  // Build nodes and edges from workflow data
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const centerX = 200;

    // Trigger node
    nodes.push({
      id: "trigger",
      type: "trigger",
      position: { x: centerX - NODE_WIDTH / 2, y: TRIGGER_Y },
      data: {
        label: "Trigger",
        triggerType,
        triggerConfig,
        onClickTrigger,
      } satisfies TriggerNodeData,
      draggable: false,
      selectable: false,
    });

    // Step nodes
    sortedSteps.forEach((step, idx) => {
      const nodeId = `step-${step.id}`;
      const y = FIRST_STEP_Y + idx * NODE_GAP_Y;
      const handlers = stepHandlers[idx];

      nodes.push({
        id: nodeId,
        type: "step",
        position: { x: centerX - NODE_WIDTH / 2, y },
        data: {
          step,
          index: idx,
          isSelected: step.id === selectedStepId,
          isFirst: idx === 0,
          isLast: idx === sortedSteps.length - 1,
          totalSteps: sortedSteps.length,
          stepError: stepErrors?.[step.id],
          onSelect: handlers?.onSelect ?? (() => {}),
          onDelete: handlers?.onDelete ?? (() => {}),
          onDuplicate: handlers?.onDuplicate ?? (() => {}),
          onInsertBefore: handlers?.onInsertBefore ?? (() => {}),
          onMoveUp: handlers?.onMoveUp ?? (() => {}),
          onMoveDown: handlers?.onMoveDown ?? (() => {}),
          isDisabled,
        } satisfies StepNodeData,
        draggable: !isDisabled,
      });

      // Edge from previous node
      const prevStep = sortedSteps[idx - 1];
      const sourceId = idx === 0 || !prevStep ? "trigger" : `step-${prevStep.id}`;
      edges.push({
        id: `e-${sourceId}-${nodeId}`,
        source: sourceId,
        target: nodeId,
        type: "smoothstep",
        animated: step.condition !== null && step.condition !== undefined,
        style: { stroke: "#10b981", strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#10b981",
          width: 20,
          height: 20,
        },
      });
    });

    // Add-step node at the bottom
    const addNodeY = sortedSteps.length === 0
      ? FIRST_STEP_Y
      : FIRST_STEP_Y + sortedSteps.length * NODE_GAP_Y;

    nodes.push({
      id: "add-step",
      type: "addStep",
      position: { x: centerX - NODE_WIDTH / 2, y: addNodeY },
      data: {
        onAdd: () => {
          const last = sortedSteps[sortedSteps.length - 1];
          onAddStep(last ? last.order + 1 : 0);
        },
        isDisabled,
      } satisfies AddNodeData,
      draggable: false,
      selectable: false,
    });

    // Edge to add-step node
    const lastStep = sortedSteps[sortedSteps.length - 1];
    const lastStepId = lastStep ? `step-${lastStep.id}` : "trigger";
    edges.push({
      id: `e-${lastStepId}-add`,
      source: lastStepId,
      target: "add-step",
      type: "smoothstep",
      style: { stroke: "#10b981", strokeWidth: 1.5, opacity: 0.4, strokeDasharray: "6 4" },
      markerEnd: {
        type: MarkerType.Arrow,
        color: "#10b981",
        width: 16,
        height: 16,
      },
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [sortedSteps, selectedStepId, triggerType, triggerConfig, stepErrors, stepHandlers, onAddStep, onClickTrigger, isDisabled]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync external data changes → internal React Flow state
  const prevNodesRef = useRef(initialNodes);
  useEffect(() => {
    if (prevNodesRef.current !== initialNodes) {
      prevNodesRef.current = initialNodes;
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "step") {
        const stepData = node.data as StepNodeData;
        stepData.onSelect();
      } else if (node.type === "trigger") {
        const triggerData = node.data as TriggerNodeData;
        triggerData.onClickTrigger?.();
      }
      setContextMenu(null);
    },
    []
  );

  // Right-click context menu
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type !== "step") return;
      event.preventDefault();
      const stepData = node.data as StepNodeData;
      const idx = stepData.index;
      const handlers = stepHandlers[idx];
      if (!handlers) return;

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        step: stepData.step,
        handlers: {
          onSelect: handlers.onSelect,
          onDelete: handlers.onDelete,
          onDuplicate: handlers.onDuplicate,
          onInsertBefore: handlers.onInsertBefore,
          onMoveUp: handlers.onMoveUp,
          onMoveDown: handlers.onMoveDown,
        },
        isFirst: idx === 0,
        isLast: idx === sortedSteps.length - 1,
      });
    },
    [stepHandlers, sortedSteps.length]
  );

  // Close context menu on pane click
  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Drop zone handlers
  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(PLUGIN_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);

      const raw = event.dataTransfer.getData(PLUGIN_DRAG_TYPE);
      if (!raw || !onDropPlugin) return;

      try {
        const plugin = JSON.parse(raw) as { id: string; name: string };
        const last = sortedSteps[sortedSteps.length - 1];
        const afterOrder = last ? last.order + 1 : 0;
        onDropPlugin(plugin.id, plugin.name, afterOrder);
      } catch {
        // Invalid drag data — ignore
      }
    },
    [onDropPlugin, sortedSteps]
  );

  // Node drag reordering — fire onMoveStep when a step node is dropped at new position
  const handleNodeDragStop: OnNodeDrag<Node> = useCallback(
    (_event, node) => {
      if (node.type !== "step" || !node.id.startsWith("step-")) return;

      const stepId = node.id.replace("step-", "");
      const draggedY = node.position.y;

      // Find the closest step slot based on Y position
      let closestIdx = 0;
      let minDist = Infinity;
      sortedSteps.forEach((_, idx) => {
        const slotY = FIRST_STEP_Y + idx * NODE_GAP_Y;
        const dist = Math.abs(draggedY - slotY);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      });

      const currentIdx = sortedSteps.findIndex((s) => s.id === stepId);
      if (currentIdx === -1 || currentIdx === closestIdx) return;

      const targetStep = sortedSteps[closestIdx];
      if (targetStep) {
        onMoveStep(stepId, targetStep.order);
      }
    },
    [sortedSteps, onMoveStep]
  );

  // Keyboard shortcuts: Delete/Backspace to delete, Escape to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        setContextMenu(null);
        // Trigger deselect by clicking nothing — parent handles via onSelectStep
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedStepId && !isDisabled) {
        e.preventDefault();
        onDeleteStep(selectedStepId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedStepId, isDisabled, onDeleteStep]);

  return (
    <div
      ref={reactFlowWrapper}
      className={`rounded-lg border overflow-hidden transition-colors relative ${
        isDragOver
          ? "border-emerald-500 bg-emerald-500/5 border-dashed"
          : "border-border bg-background/50"
      }`}
      style={{ height: "calc(100vh - 280px)", minHeight: 500 }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop visual feedback overlay */}
      {isDragOver ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-500/10 border-2 border-dashed border-emerald-500/40 rounded-lg px-6 py-3">
            <p className="text-sm font-medium text-emerald-500">
              Drop to add as new step
            </p>
          </div>
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1 }}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!isDisabled}
        nodesConnectable={false}
        elementsSelectable
        selectNodesOnDrag={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--muted-foreground))" className="opacity-20" />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!fill-foreground [&>button:hover]:!bg-muted"
        />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => {
            if (n.type === "trigger") return "hsl(142 71% 45%)";
            if (n.type === "step") return n.data?.isSelected ? "hsl(142 71% 45%)" : "hsl(var(--muted-foreground))";
            return "transparent";
          }}
          maskColor="hsl(var(--background) / 0.8)"
          className="!bg-card/80 !border-border !shadow-sm"
          pannable
          zoomable
        />
        {/* Step count & keyboard hint */}
        <Panel position="top-right" className="!m-2">
          <div className="text-[10px] text-muted-foreground bg-card/80 backdrop-blur-sm border border-border rounded px-2 py-1 space-y-0.5">
            <p>{sortedSteps.length} step{sortedSteps.length !== 1 ? "s" : ""}</p>
            <p className="opacity-60">Right-click for menu · Del to remove</p>
          </div>
        </Panel>
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && !isDisabled ? (
        <CanvasContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      ) : null}
    </div>
  );
}
