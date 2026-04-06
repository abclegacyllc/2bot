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

import {
    Background,
    BackgroundVariant,
    BaseEdge,
    Controls,
    Handle,
    MarkerType,
    MiniMap,
    Panel,
    Position,
    ReactFlow,
    getSmoothStepPath,
    useEdgesState,
    useNodesState,
    useReactFlow,
    type Edge,
    type EdgeProps,
    type EdgeTypes,
    type Node,
    type NodeProps,
    type NodeTypes,
    type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PluginCodeGraph } from "@/components/bot-studio/plugin-code-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import type { WorkflowStepItem } from "@/lib/api-client";
import { apiUrl } from "@/shared/config/urls";
import type { WorkspaceFileEntry } from "@/shared/types/workspace";
import {
    AlertCircle,
    ArrowDown,
    ArrowLeft,
    BarChart3,
    Bot,
    CheckCircle2,
    Clock,
    Cloud,
    Code,
    Copy,
    FileText,
    Globe,
    GripVertical,
    Image,
    Loader2,
    MapPin,
    MessageCircle,
    MessageSquare,
    Plus,
    Power,
    Puzzle,
    Radio,
    Repeat,
    Search,
    Settings2,
    Shield,
    SkipForward,
    Terminal,
    Timer,
    Trash2,
    XCircle,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { PLUGIN_DRAG_TYPE } from "./workflow-plugin-sidebar";

// Dynamically import Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Loading editor...
    </div>
  ),
});

function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    json: "json", md: "markdown",
    yaml: "yaml", yml: "yaml",
    html: "html", css: "css",
    py: "python", sh: "shell",
  };
  return langMap[ext || ""] || "plaintext";
}

// ===========================================
// Constants
// ===========================================

const NODE_WIDTH = 300;
const NODE_GAP_Y = 150;
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
  /** Map of stepId → last run status for execution overlay (P2) */
  stepRunStatuses?: Record<string, { status: string; durationMs?: number }>;
  onSelectStep: (step: WorkflowStepItem) => void;
  onAddStep: (afterOrder: number) => void;
  onDeleteStep: (stepId: string) => Promise<void>;
  onMoveStep: (stepId: string, newOrder: number) => Promise<void>;
  onDropPlugin?: (pluginId: string, pluginName: string, pluginSlug: string, afterOrder: number) => void;
  onDuplicateStep?: (step: WorkflowStepItem) => void;
  onToggleStepEnabled?: (stepId: string, isEnabled: boolean) => Promise<void>;
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
  /** Last run execution status for this step (P2 overlay) */
  runStatus?: { status: string; durationMs?: number };
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onInsertBefore: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleEnabled: () => void;
  isDisabled?: boolean;
};

type AddNodeData = {
  onAdd: () => void;
  hasSteps: boolean;
  isDisabled?: boolean;
};

type BotOutputNodeData = {
  label: string;
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
    onToggleEnabled: () => void;
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
      style={{ width: NODE_WIDTH, animation: "trigger-breathe 3s ease-in-out infinite" }}
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
        <Radio className="h-4 w-4 text-[var(--canvas-accent)] animate-pulse" />
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
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: "var(--canvas-accent, #10b981)" }} />
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/60 font-mono whitespace-nowrap pointer-events-none">
        trigger data
      </div>
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

// Plugin slug → icon mapping
const PLUGIN_ICONS: Record<string, LucideIcon> = {
  "ai-chat-bot": Bot,
  "ai-image-bot": Image,
  "analytics": BarChart3,
  "api-service": Globe,
  "auto-responder": Repeat,
  "blank": FileText,
  "command-bot": Terminal,
  "echo-bot": MessageCircle,
  "multi-file-bot": FileText,
  "scheduled-reporter": Timer,
  "storage-demo": Code,
  "weather-bot": Cloud,
};

function getStepIcon(step: WorkflowStepItem): LucideIcon {
  const slug = step.pluginSlug ?? "";
  // Direct slug match
  if (PLUGIN_ICONS[slug]) return PLUGIN_ICONS[slug];
  // Custom plugins — match the base slug (after "custom-xxx-")
  const baseSlug = slug.replace(/^custom-[a-z0-9]+-/, "");
  // Look for keyword matches in slug
  if (baseSlug.includes("weather")) return Cloud;
  if (baseSlug.includes("echo") || baseSlug.includes("reply") || baseSlug.includes("respon")) return MessageCircle;
  if (baseSlug.includes("ban") || baseSlug.includes("mod") || baseSlug.includes("filter")) return Shield;
  if (baseSlug.includes("search") || baseSlug.includes("find")) return Search;
  if (baseSlug.includes("counter") || baseSlug.includes("analyt")) return BarChart3;
  if (baseSlug.includes("image") || baseSlug.includes("photo")) return Image;
  if (baseSlug.includes("api") || baseSlug.includes("http")) return Globe;
  if (baseSlug.includes("bot") || baseSlug.includes("ai") || baseSlug.includes("chat")) return Bot;
  // Fallback to generic
  return Puzzle;
}

// ===========================================
// Custom Node: Workflow Step (rich)
// ===========================================

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const { step, index, isSelected, isFirst, isLast, onSelect, onDelete, onDuplicate, onInsertBefore, onMoveUp, onMoveDown, onToggleEnabled, isDisabled, stepError, runStatus } = data;

  const stepDisabled = step.isEnabled === false;
  const stepIconElement = useMemo(
    () => createElement(getStepIcon(step), { className: "h-3.5 w-3.5 text-[var(--canvas-accent)] shrink-0" }),
    [step]
  );

  const hasCondition = Boolean(step.condition);
  const timeoutSec = typeof (step.config as Record<string, unknown> | null)?.timeoutMs === "number"
    ? Math.round(((step.config as Record<string, unknown>).timeoutMs as number) / 1000)
    : null;

  const inputCount = Object.keys(step.inputMapping ?? {}).length;
  const configCount = Object.keys(step.config ?? {}).filter((k) => k !== "timeoutMs").length;

  // P2: Run status icon
  const runStatusIcon = runStatus ? (
    runStatus.status === "completed" ? (
      <div className="absolute -top-2 -right-2 z-10 flex items-center gap-0.5 bg-emerald-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm">
        <CheckCircle2 className="h-2.5 w-2.5" />
        {runStatus.durationMs !== undefined ? `${runStatus.durationMs < 1000 ? `${runStatus.durationMs}ms` : `${(runStatus.durationMs / 1000).toFixed(1)}s`}` : null}
      </div>
    ) : runStatus.status === "failed" ? (
      <div className="absolute -top-2 -right-2 z-10 flex items-center gap-0.5 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm">
        <XCircle className="h-2.5 w-2.5" /> Failed
      </div>
    ) : runStatus.status === "skipped" ? (
      <div className="absolute -top-2 -right-2 z-10 flex items-center gap-0.5 bg-zinc-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm">
        <SkipForward className="h-2.5 w-2.5" /> Skipped
      </div>
    ) : runStatus.status === "running" ? (
      <div className="absolute -top-2 -right-2 z-10 flex items-center gap-0.5 bg-sky-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm animate-pulse">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
      </div>
    ) : null
  ) : null;

  return (
    <div
      className={`rounded-lg border-2 transition-all cursor-pointer group relative ${
        stepDisabled
          ? "border-dashed border-zinc-500/40 bg-zinc-500/5 opacity-50"
          : stepError
            ? "border-red-500/60 bg-red-500/5 shadow-md shadow-red-500/10"
            : hasCondition && !isSelected
            ? "border-amber-500/50 bg-amber-500/5 hover:border-amber-500/70 hover:shadow-md"
            : isSelected
            ? "border-[var(--canvas-accent)] bg-[var(--canvas-accent)]/10 shadow-lg shadow-[var(--canvas-accent)]/10"
            : "border-[var(--node-border)] bg-[var(--node-bg)] hover:border-[var(--canvas-accent)]/40 hover:shadow-md"
      } ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      style={{
        width: NODE_WIDTH,
        ...(isSelected ? { animation: "node-glow-pulse 2s ease-in-out infinite" } : {}),
      }}
      onClick={onSelect}
    >
      {/* Conditional diamond marker */}
      {hasCondition ? (
        <div className="absolute -left-3.5 top-1/2 -translate-y-1/2 z-10">
          <div className="w-4 h-4 rotate-45 bg-amber-500 border-2 border-background rounded-sm shadow-sm" />
        </div>
      ) : null}
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: "var(--canvas-accent, #10b981)" }} />
      {/* Input port label */}
      {!stepDisabled ? (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/60 font-mono whitespace-nowrap pointer-events-none">
          {inputCount > 0 ? `${inputCount} mapped input${inputCount !== 1 ? "s" : ""}` : "in"}
        </div>
      ) : null}

      {/* P2: Run status overlay */}
      {runStatusIcon}

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
            {stepIconElement}
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
        {stepDisabled ? (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-zinc-500 border-zinc-500/30 border-dashed">
            Disabled
          </Badge>
        ) : null}
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
        {runStatus?.durationMs !== undefined ? (
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${
            runStatus.status === "completed" ? "text-emerald-500 border-emerald-500/30"
              : runStatus.status === "failed" ? "text-red-500 border-red-500/30"
                : "text-zinc-500 border-zinc-500/30"
          }`}>
            <Timer className="h-2 w-2 mr-0.5" />
            {runStatus.durationMs < 1000 ? `${runStatus.durationMs}ms` : `${(runStatus.durationMs / 1000).toFixed(1)}s`}
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
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${stepDisabled ? "text-zinc-400" : "text-[var(--canvas-accent)]"}`}
            onClick={(e) => { e.stopPropagation(); onToggleEnabled(); }}
            disabled={isDisabled}
            title={stepDisabled ? "Enable step" : "Disable step"}
          >
            <Power className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: "var(--canvas-accent, #10b981)" }} />
      {/* Output port label */}
      {!stepDisabled ? (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/60 font-mono whitespace-nowrap pointer-events-none">
          out
        </div>
      ) : null}
    </div>
  );
}

// ===========================================
// Custom Node: Add Step
// ===========================================

function AddStepNode({ data }: NodeProps<Node<AddNodeData>>) {
  if (!data.hasSteps) {
    // Empty state — larger CTA
    return (
      <div style={{ width: NODE_WIDTH }} className="flex flex-col items-center">
        <div className="rounded-lg border-2 border-dashed border-[var(--canvas-accent)]/30 bg-[var(--canvas-accent)]/5 px-6 py-8 text-center w-full hover:border-[var(--canvas-accent)]/50 hover:bg-[var(--canvas-accent)]/10 transition-colors">
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-[var(--canvas-accent)]/10 border border-[var(--canvas-accent)]/30 mx-auto mb-3">
            <Plus className="h-5 w-5 text-[var(--canvas-accent)]" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Add your first step</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Drop a plugin from the sidebar or click below
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-[var(--canvas-accent)]/40 text-[var(--canvas-accent)] hover:bg-[var(--canvas-accent)]/10 hover:text-[var(--canvas-accent)]"
            onClick={data.onAdd}
            disabled={data.isDisabled}
          >
            <Plus className="h-3.5 w-3.5" /> Choose a plugin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: NODE_WIDTH }}>
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-dashed hover:border-[var(--canvas-accent)] hover:text-[var(--canvas-accent)]"
          onClick={data.onAdd}
          disabled={data.isDisabled}
        >
          <Plus className="h-3.5 w-3.5" /> Add Plugin
        </Button>
        <p className="text-[10px] text-muted-foreground/50">Choose a plugin to process data</p>
      </div>
    </div>
  );
}

// ===========================================
// Custom Node: Bot Output (reply indicator)
// ===========================================

function BotOutputNode({ data }: NodeProps<Node<BotOutputNodeData>>) {
  return (
    <div
      className="rounded-lg border-2 border-sky-500/40 bg-sky-500/5 px-4 py-3 shadow-sm"
      style={{ width: NODE_WIDTH, animation: "bot-output-pulse 2.5s ease-in-out infinite" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-sky-500 !w-2.5 !h-2.5 !border-2 !border-background" />
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-md bg-sky-500/10 border border-sky-500/30">
          <MessageSquare className="h-4 w-4 text-sky-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Output
          </p>
          <p className="text-sm font-semibold text-foreground">
            {data.label}
          </p>
        </div>
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
    { label: menu.step.isEnabled === false ? "Enable Step" : "Disable Step", icon: Power, action: menu.handlers.onToggleEnabled },
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
// Auto-fit: zoom to fit when step count changes
// ===========================================

function AutoFitOnChange({ stepCount }: { stepCount: number }) {
  const { fitView } = useReactFlow();
  const prevCount = useRef(stepCount);
  useEffect((): (() => void) | void => {
    if (prevCount.current === stepCount) return;
    prevCount.current = stepCount;
    const t = setTimeout(() => fitView({ padding: 0.4, maxZoom: 1, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [stepCount, fitView]);
  return null;
}

// ===========================================
// Custom Edge: Insert-between (shows + button on hover)
// ===========================================

function InsertBetweenEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data,
}: EdgeProps<Edge<{ onInsert?: () => void }>>) {
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Invisible wider hit area for hover detection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        label={hovered ? undefined : label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
      {hovered && data?.onInsert ? (
        <foreignObject
          x={labelX - 12}
          y={labelY - 12}
          width={24}
          height={24}
          className="overflow-visible"
        >
          <button
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background shadow-md transition-all cursor-pointer"
            style={{ borderColor: "var(--canvas-accent, #10b981)", color: "var(--canvas-accent, #10b981)" }}
            onClick={(e) => {
              e.stopPropagation();
              data.onInsert?.();
            }}
            title="Insert step here"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </foreignObject>
      ) : null}
    </g>
  );
}

// ===========================================
// Node Types Registry
// ===========================================

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  step: StepNode,
  addStep: AddStepNode,
  botOutput: BotOutputNode,
};

const edgeTypes: EdgeTypes = {
  insertBetween: InsertBetweenEdge,
};

// ===========================================
// Helpers
// ===========================================

/** Flatten nested workspace file entries into a flat list */
function flattenFiles(entries: WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  const result: WorkspaceFileEntry[] = [];
  for (const entry of entries) {
    result.push(entry);
    if (entry.children) result.push(...flattenFiles(entry.children));
  }
  return result;
}

// ===========================================
// Main Component
// ===========================================

export function WorkflowCanvas({
  steps,
  selectedStepId,
  triggerType,
  triggerConfig,
  stepErrors,
  stepRunStatuses,
  onSelectStep,
  onAddStep,
  onDeleteStep,
  onMoveStep,
  onDropPlugin,
  onDuplicateStep,
  onToggleStepEnabled,
  onClickTrigger,
  isDisabled,
}: WorkflowCanvasProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // ----- Layer 2: drill-down into plugin code graph -----
  const [layer2Step, setLayer2Step] = useState<WorkflowStepItem | null>(null);
  const [codeFiles, setCodeFiles] = useState<Map<string, string> | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>();
  const { workspace, readFile: wsReadFile } = useWorkspace({ autoPoll: false });

  // ----- Layer 3: code viewer for selected file -----
  const [layer3File, setLayer3File] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  // Exit Layer 2 if the drilled-into step was deleted
  useEffect(() => {
    if (layer2Step && !steps.some((s) => s.id === layer2Step.id)) {
      setLayer2Step(null);
    }
  }, [steps, layer2Step]);

  // Reset Layer 3 when Layer 2 step changes
  useEffect(() => {
    setLayer3File(null);
  }, [layer2Step]);

  // Fetch plugin files when Layer 2 step changes
  useEffect(() => {
    if (!layer2Step?.entryFile || !workspace?.id) return;
    setCodeLoading(true);
    setCodeError(undefined);
    setCodeFiles(null);

    const entryDir = layer2Step.entryFile.includes("/")
      ? layer2Step.entryFile.substring(0, layer2Step.entryFile.lastIndexOf("/"))
      : "";
    const dirPath = entryDir || "/plugins";

    // Single-file plugins sit directly in the shared plugins/ folder.
    // Only fetch directory listing for plugins that have their own subdirectory.
    const isSingleFilePlugin = entryDir.endsWith("/plugins") || entryDir === "plugins" || entryDir === "";

    let cancelled = false;
    (async () => {
      try {
        const filesMap = new Map<string, string>();
        const entryContent = await wsReadFile(layer2Step.entryFile!);
        const entryRelative = entryDir
          ? layer2Step.entryFile!.substring(entryDir.length + 1)
          : layer2Step.entryFile!;
        filesMap.set(entryRelative, entryContent);

        if (!isSingleFilePlugin) {
          try {
            const res = await fetch(
              apiUrl(`/workspace/${workspace.id}/files?path=${encodeURIComponent("/" + dirPath)}&recursive=true`),
              { headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` } }
            );
            if (res.ok) {
              const json = await res.json() as Record<string, unknown>;
              const entries: WorkspaceFileEntry[] = (("data" in json) ? json.data : json) as WorkspaceFileEntry[];
              const codeExtensions = [".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx", ".json"];
              const fileEntries = flattenFiles(entries).filter(
                (f) => f.type === "FILE" && codeExtensions.some((ext) => f.name.endsWith(ext))
              );
              const toRead = fileEntries.slice(0, 30);
              const results = await Promise.allSettled(
                toRead.map(async (f) => {
                  const content = await wsReadFile(f.path.startsWith("/") ? f.path.slice(1) : f.path);
                  const relativePath = entryDir
                    ? f.path.replace(new RegExp(`^/?${entryDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), "")
                    : f.path;
                  return { path: relativePath, content };
                })
              );
              for (const r of results) {
                if (r.status === "fulfilled") filesMap.set(r.value.path, r.value.content);
              }
            }
          } catch {
            // Non-critical: we still have the entry file
          }
        }

        if (!cancelled) setCodeFiles(filesMap);
      } catch (err) {
        if (!cancelled) setCodeError(err instanceof Error ? err.message : "Failed to load plugin files");
      } finally {
        if (!cancelled) setCodeLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [layer2Step?.id, layer2Step?.entryFile, workspace?.id, wsReadFile]);

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "step") {
        const stepData = node.data as StepNodeData;
        if (stepData.step.entryFile) {
          setLayer2Step(stepData.step);
        }
      }
    },
    []
  );

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
      onToggleEnabled: () => onToggleStepEnabled?.(step.id, !step.isEnabled),
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
  }, [sortedSteps, onSelectStep, onDeleteStep, onDuplicateStep, onAddStep, onMoveStep, onToggleStepEnabled]);

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
          runStatus: stepRunStatuses?.[step.id],
          onSelect: handlers?.onSelect ?? (() => {}),
          onDelete: handlers?.onDelete ?? (() => {}),
          onDuplicate: handlers?.onDuplicate ?? (() => {}),
          onInsertBefore: handlers?.onInsertBefore ?? (() => {}),
          onMoveUp: handlers?.onMoveUp ?? (() => {}),
          onMoveDown: handlers?.onMoveDown ?? (() => {}),
          onToggleEnabled: handlers?.onToggleEnabled ?? (() => {}),
          isDisabled,
        } satisfies StepNodeData,
        draggable: !isDisabled,
      });

      // Edge from previous node
      const prevStep = sortedSteps[idx - 1];
      const sourceId = idx === 0 || !prevStep ? "trigger" : `step-${prevStep.id}`;
      const stepIsDisabled = step.isEnabled === false;

      // Data flow label — shows what data this step receives
      const inputKeys = Object.keys(step.inputMapping ?? {});
      let edgeLabel: string | undefined;
      if (stepIsDisabled) {
        edgeLabel = "skipped";
      } else if (inputKeys.length > 0) {
        edgeLabel = `${inputKeys.length} input${inputKeys.length !== 1 ? "s" : ""} mapped`;
      } else if (idx === 0) {
        edgeLabel = "trigger data";
      } else {
        edgeLabel = "prev.output";
      }

      edges.push({
        id: `e-${sourceId}-${nodeId}`,
        source: sourceId,
        target: nodeId,
        type: "insertBetween",
        animated: !stepIsDisabled && step.condition !== null && step.condition !== undefined,
        label: edgeLabel,
        data: { onInsert: isDisabled ? undefined : () => onAddStep(step.order) },
        labelStyle: {
          fontSize: 9,
          fontWeight: 500,
          fill: stepIsDisabled ? "#71717a" : "#6b7280",
          fontFamily: "ui-monospace, monospace",
        },
        labelBgStyle: {
          fill: "hsl(var(--background))",
          fillOpacity: 0.9,
        },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        style: stepIsDisabled
          ? { stroke: "#71717a", strokeWidth: 1.5, opacity: 0.3, strokeDasharray: "6 4" }
          : { stroke: "var(--edge-color, #10b981)", strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stepIsDisabled ? "#71717a" : "var(--edge-color, #10b981)",
          width: 18,
          height: 18,
        },
      });
    });

    // Bot output node — show "Reply to user" for BOT_MESSAGE workflows
    const isBotMessage = triggerType === "BOT_MESSAGE";
    const lastStep = sortedSteps[sortedSteps.length - 1];

    if (isBotMessage && sortedSteps.length > 0 && lastStep) {
      const botOutputY = FIRST_STEP_Y + sortedSteps.length * NODE_GAP_Y;
      nodes.push({
        id: "bot-output",
        type: "botOutput",
        position: { x: centerX - NODE_WIDTH / 2, y: botOutputY },
        data: {
          label: "Reply to user",
        } satisfies BotOutputNodeData,
        draggable: false,
        selectable: false,
      });

      edges.push({
        id: `e-step-${lastStep.id}-bot-output`,
        source: `step-${lastStep.id}`,
        target: "bot-output",
        type: "smoothstep",
        label: "response",
        labelStyle: {
          fontSize: 9,
          fontWeight: 500,
          fill: "#0ea5e9",
          fontFamily: "ui-monospace, monospace",
        },
        labelBgStyle: {
          fill: "hsl(var(--background))",
          fillOpacity: 0.9,
        },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        style: { stroke: "var(--edge-animated, #0ea5e9)", strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--edge-animated, #0ea5e9)",
          width: 18,
          height: 18,
        },
      });
    }

    // Add-step node — detached from the chain (no connecting edge)
    const addNodeY = (() => {
      const lastNodeY = isBotMessage && sortedSteps.length > 0
        ? FIRST_STEP_Y + sortedSteps.length * NODE_GAP_Y  // after bot output
        : sortedSteps.length > 0
          ? FIRST_STEP_Y + (sortedSteps.length - 1) * NODE_GAP_Y  // after last step
          : TRIGGER_Y + NODE_GAP_Y;  // after trigger
      return lastNodeY + NODE_GAP_Y + 20;
    })();

    nodes.push({
      id: "add-step",
      type: "addStep",
      position: { x: centerX - NODE_WIDTH / 2, y: addNodeY },
      data: {
        onAdd: () => {
          const last = sortedSteps[sortedSteps.length - 1];
          onAddStep(last ? last.order + 1 : 0);
        },
        hasSteps: sortedSteps.length > 0,
        isDisabled,
      } satisfies AddNodeData,
      draggable: false,
      selectable: false,
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [sortedSteps, selectedStepId, triggerType, triggerConfig, stepErrors, stepRunStatuses, stepHandlers, onAddStep, onClickTrigger, isDisabled]);

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
          onToggleEnabled: handlers.onToggleEnabled,
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
        const plugin = JSON.parse(raw) as { id: string; name: string; slug: string };
        const last = sortedSteps[sortedSteps.length - 1];
        const afterOrder = last ? last.order + 1 : 0;
        onDropPlugin(plugin.id, plugin.name, plugin.slug ?? "", afterOrder);
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
        layer2Step
          ? "border-border"
          : isDragOver
            ? "border-[var(--canvas-accent)] bg-[var(--canvas-accent)]/5 border-dashed"
            : "border-border"
      }`}
      style={{ height: "calc(100vh - 280px)", minHeight: 500, backgroundColor: "var(--canvas-bg, var(--background))" }}
      onDragOver={layer2Step ? undefined : handleDragOver}
      onDragLeave={layer2Step ? undefined : handleDragLeave}
      onDrop={layer2Step ? undefined : handleDrop}
    >
      {layer2Step ? (
        /* ========== Layer 2/3: Code Graph or Code Viewer ========== */
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/80 backdrop-blur-sm shrink-0 z-10">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => { setLayer2Step(null); setLayer3File(null); }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Workflow
            </Button>
            <span className="text-muted-foreground text-xs">/</span>
            {layer3File ? (
              <>
                <button
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => setLayer3File(null)}
                >
                  {layer2Step.name || layer2Step.pluginName || layer2Step.pluginSlug}
                </button>
                <span className="text-muted-foreground text-xs">/</span>
                <span className="text-xs font-medium truncate font-mono">{layer3File}</span>
              </>
            ) : (
              <>
                <span className="text-xs font-medium truncate">
                  {layer2Step.name || layer2Step.pluginName || layer2Step.pluginSlug}
                </span>
                {layer2Step.entryFile ? (
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                    {layer2Step.entryFile.replace(/^bots\/[^/]+\/plugins\//, "")}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {layer3File ? (
              /* ---- Layer 3: Code Viewer ---- */
              <MonacoEditor
                height="100%"
                value={codeFiles?.get(layer3File) ?? "// File content not available"}
                language={getLanguage(layer3File)}
                theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  lineNumbers: "on",
                  renderLineHighlight: "none",
                  folding: true,
                }}
              />
            ) : (
              /* ---- Layer 2: Code Graph ---- */
              <PluginCodeGraph
                files={codeFiles}
                entryFile={
                  layer2Step.entryFile?.includes("/")
                    ? layer2Step.entryFile.substring(layer2Step.entryFile.lastIndexOf("/") + 1)
                    : layer2Step.entryFile ?? ""
                }
                isLoading={codeLoading}
                error={codeError}
                onFileClick={(path) => setLayer3File(path)}
              />
            )}
          </div>
        </div>
      ) : (
        /* ========== Layer 1: Workflow Canvas ========== */
        <>
          {/* Drop visual feedback overlay */}
          {isDragOver ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="bg-[var(--canvas-accent)]/10 border-2 border-dashed border-[var(--canvas-accent)]/40 rounded-lg px-6 py-3">
                <p className="text-sm font-medium text-[var(--canvas-accent)]">
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
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onPaneClick={handlePaneClick}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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
            <Background
              variant={BackgroundVariant.Dots}
              gap={parseInt(getComputedStyle(document.documentElement).getPropertyValue("--canvas-grid-size").trim() || "16", 10)}
              size={1}
              color="var(--canvas-grid, hsl(var(--muted-foreground)))"
              className="opacity-30"
              style={{ backgroundColor: "var(--canvas-bg)" }}
            />
            <Controls
              showInteractive={false}
              className="!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!fill-foreground [&>button:hover]:!bg-muted"
            />
            <MiniMap
              nodeStrokeWidth={3}
              nodeColor={(n) => {
                if (n.type === "trigger") return "var(--canvas-accent, hsl(142 71% 45%))";
                if (n.type === "step") return n.data?.isSelected ? "var(--canvas-accent, hsl(142 71% 45%))" : "hsl(var(--muted-foreground))";
                return "transparent";
              }}
              maskColor="hsl(var(--background) / 0.8)"
              className="!bg-card/80 !border-border !shadow-sm"
              pannable
              zoomable
            />
            <AutoFitOnChange stepCount={sortedSteps.length} />
            {/* Step count & keyboard hint */}
            <Panel position="top-right" className="!m-2">
              <div className="text-[10px] text-muted-foreground bg-card/80 backdrop-blur-sm border border-border rounded px-2 py-1 space-y-0.5">
                <p>{sortedSteps.length} step{sortedSteps.length !== 1 ? "s" : ""}</p>
                <p className="opacity-60">Double-click step to view code · Right-click for menu</p>
              </div>
            </Panel>
          </ReactFlow>

          {/* Context menu */}
          {contextMenu && !isDisabled ? (
            <CanvasContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
          ) : null}
        </>
      )}
    </div>
  );
}
