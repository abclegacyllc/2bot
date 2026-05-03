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
    getBezierPath,
    Handle,
    MarkerType,
    MiniMap,
    Panel,
    Position,
    ReactFlow,
    useEdgesState,
    useNodesState,
    useReactFlow,
    type Connection,
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
import { toast } from "sonner";

import { ConfigFormRenderer } from "@/components/bot-studio/config-form-renderer";
import { PluginCodeGraph } from "@/components/bot-studio/plugin-code-graph";
import type { StepEditorData } from "@/components/bot-studio/workflow-step-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/hooks/use-workspace";
import type { PreflightReport, WorkflowEdgeItem, WorkflowStepItem } from "@/lib/api-client";
import { parseStackFiles } from "@/lib/stack-trace-parser";
import { apiUrl } from "@/shared/config/urls";
import type { ConfigSchema, PluginSchemaSet } from "@/shared/types/plugin";
import type { WorkspaceFileEntry } from "@/shared/types/workspace";
import {
    AlertCircle,
    ArrowDown,
    ArrowLeft,
    ArrowUpRight,
    BarChart3,
    Bot,
    CheckCircle2,
    ChevronDown,
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
    Save,
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

const NODE_WIDTH = 380;
const NODE_GAP_X = 180;  // horizontal gap between steps (left→right layout)
const TRIGGER_X = 40;
const TRIGGER_Y = 60;
const FIRST_STEP_X = TRIGGER_X + NODE_WIDTH + NODE_GAP_X;
const STEP_Y = TRIGGER_Y;  // All steps at same Y baseline

// Trigger output field labels by trigger type (for display in node, NOT separate handles)
const CHAT_TRIGGER_FIELDS = ["message", "chatId", "userId", "source"];

const TRIGGER_OUTPUT_FIELDS: Record<string, string[]> = {
  BOT_MESSAGE: CHAT_TRIGGER_FIELDS,
  TELEGRAM_MESSAGE: CHAT_TRIGGER_FIELDS,
  DISCORD_MESSAGE: CHAT_TRIGGER_FIELDS,
  DISCORD_COMMAND: CHAT_TRIGGER_FIELDS,
  SLACK_MESSAGE: CHAT_TRIGGER_FIELDS,
  SLACK_COMMAND: CHAT_TRIGGER_FIELDS,
  WHATSAPP_MESSAGE: CHAT_TRIGGER_FIELDS,
  WEBHOOK: ["body", "headers", "method"],
  SCHEDULE: ["timestamp", "cron"],
  MANUAL: ["data"],
};

/** Get display labels for a plugin's input fields */
function getInputFieldLabels(
  inputSchema?: ConfigSchema,
  inputMapping?: Record<string, string>,
): string[] {
  const props = inputSchema?.properties ?? {};
  if (Object.keys(props).length > 0) {
    return Object.entries(props).map(([key, p]) => (p as { title?: string }).title || key);
  }
  const mappingKeys = Object.keys(inputMapping ?? {});
  if (mappingKeys.length > 0) return mappingKeys;
  return ["data"];
}

/** Get display labels for a plugin's output fields */
function getOutputFieldLabels(outputSchema?: ConfigSchema): string[] {
  const props = outputSchema?.properties ?? {};
  if (Object.keys(props).length > 0) {
    return Object.entries(props).map(([key, p]) => (p as { title?: string }).title || key);
  }
  return ["output"];
}

// ===========================================
// Types
// ===========================================

interface WorkflowCanvasProps {
  workflowId: string;
  steps: WorkflowStepItem[];
  edges: WorkflowEdgeItem[];
  selectedStepId: string | null;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  /** Map of stepId → error message from the last workflow run */
  stepErrors?: Record<string, string>;
  /** Map of stepId → last run status for execution overlay (P2) */
  stepRunStatuses?: Record<string, { status: string; durationMs?: number; error?: string }>;
  /** Preflight report from Quick / Standard / Deep test — drives per-node Layer-1 badges */
  preflightReport?: PreflightReport | null;
  onSelectStep: (step: WorkflowStepItem) => void;
  onAddStep: (afterOrder: number) => void;
  onDeleteStep: (stepId: string) => Promise<void>;
  onMoveStep: (stepId: string, newOrder: number) => Promise<void>;
  onDropPlugin?: (pluginId: string, pluginName: string, pluginSlug: string, afterOrder: number) => void;
  onDuplicateStep?: (step: WorkflowStepItem) => void;
  onToggleStepEnabled?: (stepId: string, isEnabled: boolean) => Promise<void>;
  onClickTrigger?: () => void;
  isDisabled?: boolean;
  /** Plugin schemas keyed by slug — configSchema + inputSchema + outputSchema */
  pluginSchemas?: Record<string, PluginSchemaSet>;
  /** Save step callback — same as WorkflowStepEditor.onSave */
  onSaveStep?: (stepId: string, data: StepEditorData) => Promise<void>;
  /** Save node position after drag */
  onSaveNodePosition?: (stepId: string, positionX: number, positionY: number) => Promise<void>;
  /** Add a graph edge (connection) */
  onAddEdge?: (sourceStepId: string | null, targetStepId: string) => Promise<void>;
  /** Delete a graph edge */
  onDeleteEdge?: (edgeId: string) => Promise<void>;
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
  /** Layer-1 preflight result for this step — shown as a top-left badge */
  preflightStatus?: { ok: boolean; errorCount: number; warningCount: number } | null;
  /** Plugin config schema for inline editing */
  configSchema?: ConfigSchema;
  /** Plugin input port schema — what data this step accepts */
  inputSchema?: ConfigSchema;
  /** Plugin output port schema — what data this step produces */
  outputSchema?: ConfigSchema;
  /** Previous steps for variable references */
  previousSteps?: WorkflowStepItem[];
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onInsertBefore: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleEnabled: () => void;
  onSaveStep?: (stepId: string, data: StepEditorData) => Promise<void>;
  onOpenPlugin?: () => void;
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
  const outputFields = TRIGGER_OUTPUT_FIELDS[data.triggerType] ?? ["data"];

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
      {/* Output field detail — shows what data the trigger provides */}
      <div className="mt-1.5 border-t border-white/10 pt-1.5 px-1">
        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-0.5">Outputs</p>
        <div className="flex flex-wrap gap-1">
          {outputFields.map((f) => (
            <span key={f} className="text-[9px] font-mono text-emerald-400/80 bg-emerald-500/10 rounded px-1.5 py-0.5">{f}</span>
          ))}
        </div>
      </div>
      {/* Single output handle — the event bundle */}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-background" style={{ backgroundColor: "var(--canvas-accent, #10b981)" }} />
    </div>
  );
}

function _stepSummary(step: WorkflowStepItem): string | null {
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
// Custom Node: Workflow Step — inline settings
// ===========================================

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const {
    step, index, isSelected, isFirst, isLast,
    onSelect, onDelete, onDuplicate, onInsertBefore,
    onMoveUp, onMoveDown, onToggleEnabled,
    isDisabled, stepError, runStatus, preflightStatus,
    configSchema, inputSchema, outputSchema, onSaveStep,
    onOpenPlugin,
  } = data;

  const stepDisabled = step.isEnabled === false;
  const stepIconElement = useMemo(
    () => createElement(getStepIcon(step), { className: "h-3.5 w-3.5 text-[var(--canvas-accent)] shrink-0" }),
    [step]
  );

  const hasCondition = Boolean(step.condition);
  const inputCount = Object.keys(step.inputMapping ?? {}).length;

  // ---- I/O field labels — dynamic from plugin schemas ----
  const inputFieldLabels = useMemo(
    () => getInputFieldLabels(inputSchema, step.inputMapping as Record<string, string> | undefined),
    [inputSchema, step.inputMapping],
  );

  const outputFieldLabels = useMemo(
    () => getOutputFieldLabels(outputSchema),
    [outputSchema],
  );

  // ---- Inline config editing state ----
  const configProps = configSchema?.properties ?? {};
  const hasConfigFields = Object.keys(configProps).length > 0;

  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(
    () => ({ ...(step.config as Record<string, unknown> ?? {}) })
  );
  // Sync local config when external step.config changes (e.g. after save or side-panel edit)
  const lastSyncedRef = useRef(JSON.stringify(step.config ?? {}));
  useEffect(() => {
    const next = JSON.stringify(step.config ?? {});
    if (next !== lastSyncedRef.current) {
      lastSyncedRef.current = next;
      setLocalConfig({ ...(step.config as Record<string, unknown> ?? {}) });
    }
  }, [step.config]);

  // ---- Additional-settings state ----
  const [showAdditional, setShowAdditional] = useState(false);
  const [localOnError, setLocalOnError] = useState(step.onError ?? "stop");
  const [localMaxRetries, setLocalMaxRetries] = useState(step.maxRetries ?? 3);
  const gatewayEnabled = Boolean((step.config as Record<string, unknown>)?.gatewayActionsEnabled);
  const [localGateway, setLocalGateway] = useState(gatewayEnabled);

  // Re-sync additional settings when step changes
  useEffect(() => {
    setLocalOnError(step.onError ?? "stop");
    setLocalMaxRetries(step.maxRetries ?? 3);
    setLocalGateway(Boolean((step.config as Record<string, unknown>)?.gatewayActionsEnabled));
  }, [step.onError, step.maxRetries, step.config]);

  // ---- Dirty detection ----
  const isDirty = useMemo(() => {
    const origCfg = step.config as Record<string, unknown> ?? {};
    if (JSON.stringify(localConfig) !== JSON.stringify(origCfg)) return true;
    if (localOnError !== (step.onError ?? "stop")) return true;
    if (localOnError === "retry" && localMaxRetries !== (step.maxRetries ?? 3)) return true;
    if (localGateway !== gatewayEnabled) return true;
    return false;
  }, [localConfig, localOnError, localMaxRetries, localGateway, step.config, step.onError, step.maxRetries, gatewayEnabled]);

  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!onSaveStep || !isDirty) return;
    setSaving(true);
    try {
      const mergedConfig = { ...localConfig };
      if (localGateway !== gatewayEnabled) {
        mergedConfig.gatewayActionsEnabled = localGateway;
      }
      await onSaveStep(step.id, {
        config: mergedConfig,
        onError: localOnError,
        maxRetries: localOnError === "retry" ? localMaxRetries : undefined,
      });
      toast.success("Step saved");
    } catch {
      toast.error("Failed to save step");
    } finally {
      setSaving(false);
    }
  }, [onSaveStep, isDirty, localConfig, localGateway, gatewayEnabled, localOnError, localMaxRetries, step.id]);

  // ---- Layer-1 preflight badge (top-left) ----
  const preflightBadge = preflightStatus ? (
    preflightStatus.errorCount > 0 ? (
      <div className="absolute -top-2 -left-2 z-10 flex items-center gap-0.5 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm">
        <AlertCircle className="h-2.5 w-2.5" />
        {preflightStatus.errorCount} err
      </div>
    ) : preflightStatus.warningCount > 0 ? (
      <div className="absolute -top-2 -left-2 z-10 flex items-center gap-0.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm">
        <AlertCircle className="h-2.5 w-2.5" />
        {preflightStatus.warningCount} warn
      </div>
    ) : (
      <div className="absolute -top-2 -left-2 z-10 flex items-center gap-0.5 bg-emerald-600 text-white rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm">
        <CheckCircle2 className="h-2.5 w-2.5" /> OK
      </div>
    )
  ) : null;

  // ---- Run status overlay (top-right) ----
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
      {/* Layer-1 preflight badge — top-left */}
      {preflightBadge}
      {/* Conditional diamond marker */}
      {hasCondition ? (
        <div className="absolute -left-3.5 top-1/2 -translate-y-1/2 z-10">
          <div className="w-4 h-4 rotate-45 bg-amber-500 border-2 border-background rounded-sm shadow-sm" />
        </div>
      ) : null}

      {/* Single input handle */}
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-background" style={{ backgroundColor: "#38bdf8" }} />

      {/* Single output handle */}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-background" style={{ backgroundColor: "var(--canvas-accent, #10b981)" }} />

      {/* Run status overlay */}
      {runStatusIcon}

      {/* Drag grip indicator */}
      <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* ── Header ── */}
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
          {onOpenPlugin ? (
            <button
              className="flex items-center justify-center h-6 w-6 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onOpenPlugin(); }}
              title="Go to plugin page"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {step.name && step.pluginSlug ? (
          <p className="text-[10px] text-muted-foreground mt-0.5 ml-8 truncate">
            {step.pluginSlug}
          </p>
        ) : null}
      </div>

      {/* ── Compact status badges ── */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 flex-wrap">
        {stepDisabled ? (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-zinc-500 border-zinc-500/30 border-dashed">Disabled</Badge>
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

      {/* ── Inline Plugin Config ── */}
      {hasConfigFields && !stepDisabled ? (
        <div
          className="px-3 pb-2 nodrag nowheel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-t border-border/50 pt-2">
            <ConfigFormRenderer
              schema={configSchema!}
              values={localConfig}
              onChange={setLocalConfig}
            />
          </div>
        </div>
      ) : null}

      {/* ── Additional Settings toggle ── */}
      {!stepDisabled ? (
        <div className="px-3 pb-1 nodrag" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
            onClick={() => setShowAdditional((v) => !v)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showAdditional ? "rotate-0" : "-rotate-90"}`} />
            <span className="font-medium">Additional Settings</span>
          </button>

          {showAdditional ? (
            <div className="mt-2 space-y-3 border-t border-border/40 pt-2 nowheel">
              {/* On Error */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">On Error</Label>
                <Select value={localOnError} onValueChange={setLocalOnError}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stop">Stop workflow</SelectItem>
                    <SelectItem value="continue">Skip &amp; continue</SelectItem>
                    <SelectItem value="retry">Retry</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Max Retries (only when retry) */}
              {localOnError === "retry" ? (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Max Retries</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={localMaxRetries}
                    onChange={(e) => setLocalMaxRetries(Number(e.target.value) || 1)}
                    className="h-7 text-xs w-20"
                  />
                </div>
              ) : null}

              {/* Gateway actions toggle */}
              {step.gatewayId ? (
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Allow reply to user</Label>
                  <Switch
                    checked={localGateway}
                    onCheckedChange={setLocalGateway}
                    className="scale-75 origin-right"
                  />
                </div>
              ) : null}

              {/* Input mapping summary */}
              {inputCount > 0 ? (
                <p className="text-[10px] text-muted-foreground italic">
                  {inputCount} input mapping{inputCount !== 1 ? "s" : ""} — edit in side panel
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Save bar — visible when dirty ── */}
      {isDirty && !stepDisabled ? (
        <div className="px-3 pb-2 nodrag" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            className="w-full h-7 text-xs gap-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save changes
          </Button>
        </div>
      ) : null}

      {/* ── Action bar — visible on hover or when selected ── */}
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

      {/* ── I/O field chips — shows what data flows in/out ── */}
      {!stepDisabled ? (
        <div className="px-3 pb-2 flex gap-3">
          {/* Inputs */}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-0.5">In</p>
            <div className="flex flex-wrap gap-0.5">
              {inputFieldLabels.map((f) => (
                <span key={f} className="text-[8px] font-mono text-sky-400/80 bg-sky-500/10 rounded px-1 py-0">{f}</span>
              ))}
            </div>
          </div>
          {/* Outputs */}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-0.5">Out</p>
            <div className="flex flex-wrap gap-0.5">
              {outputFieldLabels.map((f) => (
                <span key={f} className="text-[8px] font-mono text-emerald-400/80 bg-emerald-500/10 rounded px-1 py-0">{f}</span>
              ))}
            </div>
          </div>
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
      <Handle type="target" position={Position.Left} className="!bg-sky-500 !w-2.5 !h-2.5 !border-2 !border-background" />
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
  selected,
}: EdgeProps<Edge<{ onDelete?: () => void }>>) {
  const [edgePath, _labelX, _labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Selected = yellow highlight with glow
  const edgeStyle = selected
    ? { ...style, stroke: "#f59e0b", strokeWidth: 3, filter: "drop-shadow(0 0 4px rgba(245,158,11,0.4))" }
    : style;

  return (
    <g>
      {/* Invisible wider hit area for click/select */}
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
        style={edgeStyle}
        markerEnd={markerEnd}
        label={label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
      {/* Disconnect buttons at source & target ends — only when selected */}
      {selected && data?.onDelete ? (
        <>
          {/* × near source (output side) */}
          <foreignObject
            x={sourceX + 8}
            y={sourceY - 10}
            width={20}
            height={20}
            className="overflow-visible"
          >
            <button
              className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md cursor-pointer hover:bg-red-600 transition-colors"
              onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
              title="Disconnect"
            >
              <XCircle className="h-3 w-3" />
            </button>
          </foreignObject>
          {/* × near target (input side) */}
          <foreignObject
            x={targetX - 28}
            y={targetY - 10}
            width={20}
            height={20}
            className="overflow-visible"
          >
            <button
              className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md cursor-pointer hover:bg-red-600 transition-colors"
              onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
              title="Disconnect"
            >
              <XCircle className="h-3 w-3" />
            </button>
          </foreignObject>
        </>
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
  workflowId: _workflowId,
  steps,
  edges: workflowEdges,
  selectedStepId,
  triggerType,
  triggerConfig,
  stepErrors,
  stepRunStatuses,
  preflightReport,
  onSelectStep,
  onAddStep,
  onDeleteStep,
  onMoveStep,
  onDropPlugin,
  onDuplicateStep,
  onToggleStepEnabled,
  onClickTrigger,
  isDisabled,
  pluginSchemas,
  onSaveStep,
  onSaveNodePosition,
  onAddEdge,
  onDeleteEdge,
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
        // Strip the raw FS path from the error message — show a user-friendly hint instead.
        const rawMsg = err instanceof Error ? err.message : "";
        const isFileMissing = /not found|ENOENT|no such file/i.test(rawMsg);
        if (!cancelled) setCodeError(
          isFileMissing
            ? "Plugin file not found on workspace. The container may have restarted — try reopening the workspace."
            : rawMsg || "Failed to load plugin files"
        );
      } finally {
        if (!cancelled) setCodeLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [layer2Step?.id, layer2Step?.entryFile, workspace?.id, wsReadFile]);

  const handleOpenPlugin = useCallback(
    (step: WorkflowStepItem) => {
      if (step.entryFile) {
        setLayer2Step(step);
      }
    },
    []
  );

  /**
   * Layer-2 per-file status map, keyed by the same relative path that
   * `PluginCodeGraph` uses internally (e.g. `index.js`, `commands/convert.js`).
   *
   * Derivation rules:
   *   - No run yet for this step           → empty map (no badges)
   *   - Run completed                      → every loaded file marked "ok"
   *   - Run failed without parsable stack  → only entry file marked "error"
   *   - Run failed with parsable stack     → files in stack marked "error",
   *                                          all other files marked "ok"
   *                                          (they ran before the throw)
   *
   * Stack file paths are relativised against the layer-2 step's plugin
   * directory so they line up with the keys used in the file graph.
   */
  const layer2FileStatuses = useMemo<Map<string, "ok" | "error"> | undefined>(() => {
    if (!layer2Step || !codeFiles || codeFiles.size === 0) return undefined;
    const runStatus = stepRunStatuses?.[layer2Step.id];
    if (!runStatus) return undefined;
    const status = runStatus.status?.toLowerCase();
    if (status !== "completed" && status !== "failed") return undefined;

    const map = new Map<string, "ok" | "error">();
    if (status === "completed") {
      for (const path of codeFiles.keys()) map.set(path, "ok");
      return map;
    }

    // FAILED — locate the failing file(s).
    const entryDir = layer2Step.entryFile?.includes("/")
      ? layer2Step.entryFile.substring(0, layer2Step.entryFile.lastIndexOf("/"))
      : "";
    const refs = parseStackFiles(runStatus.error);
    const failed = new Set<string>();
    for (const ref of refs) {
      // Strip plugin directory prefix to align with codeFiles map keys
      let rel = ref.file;
      if (entryDir && rel.startsWith(entryDir + "/")) {
        rel = rel.slice(entryDir.length + 1);
      } else if (entryDir && rel === entryDir) {
        continue;
      }
      // Single-file plugins live directly under plugins/ — accept matching basename
      if (codeFiles.has(rel)) {
        failed.add(rel);
      } else {
        // Fallback: match by basename (handles bundler-mangled paths)
        const base = rel.split("/").pop();
        if (base) {
          for (const key of codeFiles.keys()) {
            if (key === base || key.endsWith("/" + base)) failed.add(key);
          }
        }
      }
    }

    if (failed.size === 0) {
      // No parsable stack — fall back to flagging the entry file only.
      const entryRelative = layer2Step.entryFile && entryDir
        ? layer2Step.entryFile.substring(entryDir.length + 1)
        : layer2Step.entryFile ?? "";
      if (entryRelative && codeFiles.has(entryRelative)) failed.add(entryRelative);
    }

    for (const path of codeFiles.keys()) {
      map.set(path, failed.has(path) ? "error" : "ok");
    }
    return map;
  }, [layer2Step, codeFiles, stepRunStatuses]);

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

    // Trigger node — positioned at left
    nodes.push({
      id: "trigger",
      type: "trigger",
      position: { x: TRIGGER_X, y: TRIGGER_Y },
      data: {
        label: "Trigger",
        triggerType,
        triggerConfig,
        onClickTrigger,
      } satisfies TriggerNodeData,
      draggable: false,
      selectable: false,
    });

    // Step nodes — use saved positions (graph layout) or fallback to left→right
    sortedSteps.forEach((step, idx) => {
      const nodeId = `step-${step.id}`;
      // Use saved positions if available, otherwise compute from order
      const nodeX = step.positionX > 0 ? step.positionX : FIRST_STEP_X + idx * (NODE_WIDTH + NODE_GAP_X);
      const nodeY = step.positionY > 0 ? step.positionY : STEP_Y;
      const handlers = stepHandlers[idx];
      const pluginSchema = pluginSchemas?.[step.pluginSlug ?? ""];

      nodes.push({
        id: nodeId,
        type: "step",
        position: { x: nodeX, y: nodeY },
        data: {
          step,
          index: idx,
          isSelected: step.id === selectedStepId,
          isFirst: idx === 0,
          isLast: idx === sortedSteps.length - 1,
          totalSteps: sortedSteps.length,
          stepError: stepErrors?.[step.id],
          runStatus: stepRunStatuses?.[step.id],
          preflightStatus: (() => {
            if (!preflightReport?.steps) return null;
            const sr = preflightReport.steps.find((r) => r.stepOrder === step.order);
            if (!sr) return null;
            const errorCount = sr.problems.filter((p) => p.severity === "error").length;
            const warningCount = sr.problems.filter((p) => p.severity === "warning").length;
            return { ok: errorCount === 0, errorCount, warningCount };
          })(),
          configSchema: pluginSchema?.configSchema,
          inputSchema: pluginSchema?.inputSchema,
          outputSchema: pluginSchema?.outputSchema,
          onSelect: handlers?.onSelect ?? (() => {}),
          onDelete: handlers?.onDelete ?? (() => {}),
          onDuplicate: handlers?.onDuplicate ?? (() => {}),
          onInsertBefore: handlers?.onInsertBefore ?? (() => {}),
          onMoveUp: handlers?.onMoveUp ?? (() => {}),
          onMoveDown: handlers?.onMoveDown ?? (() => {}),
          onToggleEnabled: handlers?.onToggleEnabled ?? (() => {}),
          onSaveStep,
          onOpenPlugin: step.entryFile ? () => handleOpenPlugin(step) : undefined,
          isDisabled,
        } satisfies StepNodeData,
        draggable: !isDisabled,
      });
    });

    // Build edges from WorkflowEdgeItem[] data
    if (workflowEdges.length > 0) {
      for (const we of workflowEdges) {
        const sourceId = we.sourceStepId ? `step-${we.sourceStepId}` : "trigger";
        const targetId = `step-${we.targetStepId}`;
        const targetStep = sortedSteps.find((s) => s.id === we.targetStepId);
        const stepIsDisabled = targetStep?.isEnabled === false;

        const inputKeys = Object.keys(targetStep?.inputMapping ?? {});
        let edgeLabel: string | undefined;
        if (stepIsDisabled) {
          edgeLabel = "skipped";
        } else if (inputKeys.length > 0) {
          edgeLabel = `${inputKeys.length} input${inputKeys.length !== 1 ? "s" : ""} mapped`;
        }

        const edgeId = we.id;
        edges.push({
          id: edgeId,
          source: sourceId,
          target: targetId,
          type: "insertBetween",
          selectable: !isDisabled,
          animated: !stepIsDisabled && targetStep?.condition !== null && targetStep?.condition !== undefined,
          label: edgeLabel,
          data: {
            onDelete: isDisabled ? undefined : () => onDeleteEdge?.(edgeId),
          },
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
      }
    } else {
      // Fallback: no edges saved yet → derive linearly from step order
      sortedSteps.forEach((step, idx) => {
        const nodeId = `step-${step.id}`;
        const prevStep = sortedSteps[idx - 1];
        const sourceId = idx === 0 || !prevStep ? "trigger" : `step-${prevStep.id}`;
        const stepIsDisabled = step.isEnabled === false;

        const inputKeys = Object.keys(step.inputMapping ?? {});
        let edgeLabel: string | undefined;
        if (stepIsDisabled) {
          edgeLabel = "skipped";
        } else if (inputKeys.length > 0) {
          edgeLabel = `${inputKeys.length} input${inputKeys.length !== 1 ? "s" : ""} mapped`;
        }

        edges.push({
          id: `e-${sourceId}-${nodeId}`,
          source: sourceId,
          target: nodeId,
          type: "insertBetween",
          animated: !stepIsDisabled && step.condition !== null && step.condition !== undefined,
          label: edgeLabel,
          data: { onDelete: undefined },
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
    }

    // Bot output node — show "Reply to user" for BOT_MESSAGE workflows
    const isBotMessage = triggerType === "BOT_MESSAGE";
    const lastStep = sortedSteps[sortedSteps.length - 1];
    // For graph layout, find the rightmost node position
    const maxX = sortedSteps.reduce((mx, s, i) => {
      const sx = s.positionX > 0 ? s.positionX : FIRST_STEP_X + i * (NODE_WIDTH + NODE_GAP_X);
      return Math.max(mx, sx);
    }, FIRST_STEP_X);
    const afterLastX = maxX + NODE_WIDTH + NODE_GAP_X;

    if (isBotMessage && sortedSteps.length > 0 && lastStep) {
      const botOutputX = afterLastX;
      nodes.push({
        id: "bot-output",
        type: "botOutput",
        position: { x: botOutputX, y: STEP_Y },
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
        type: "default",
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

    // Add-step node — positioned after the last node in the chain
    const addNodeX = (() => {
      if (isBotMessage && sortedSteps.length > 0) return afterLastX + NODE_WIDTH + NODE_GAP_X;
      if (sortedSteps.length > 0) return afterLastX;
      return FIRST_STEP_X;
    })();

    nodes.push({
      id: "add-step",
      type: "addStep",
      position: { x: addNodeX, y: STEP_Y + 40 },
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
  }, [sortedSteps, selectedStepId, triggerType, triggerConfig, stepErrors, stepRunStatuses, preflightReport, stepHandlers, onAddStep, onClickTrigger, isDisabled, pluginSchemas, onSaveStep, workflowEdges, onDeleteEdge, handleOpenPlugin]);

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

  // Node drag stop — save new position to backend
  const handleNodeDragStop: OnNodeDrag<Node> = useCallback(
    (_event, node) => {
      if (node.type !== "step" || !node.id.startsWith("step-")) return;
      const stepId = node.id.replace("step-", "");
      onSaveNodePosition?.(stepId, node.position.x, node.position.y);
    },
    [onSaveNodePosition]
  );

  // Handle new edge connections — user draws a line between nodes
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!onAddEdge || isDisabled) return;
      const sourceStepId = connection.source === "trigger" ? null : connection.source?.replace("step-", "") ?? null;
      const targetStepId = connection.target?.replace("step-", "");
      if (!targetStepId) return;
      // Persist to backend (UI refreshes from backend state)
      onAddEdge(sourceStepId, targetStepId);
    },
    [onAddEdge, isDisabled]
  );

  // Handle edge deletions
  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (!onDeleteEdge || isDisabled) return;
      for (const edge of deletedEdges) {
        // Only delete backend edges (they have UUID ids, not synthetic "e-" ids)
        if (!edge.id.startsWith("e-")) {
          onDeleteEdge(edge.id);
        }
      }
    },
    [onDeleteEdge, isDisabled]
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
                    {layer2Step.entryFile
                      // Strip new-format prefix: bots/{platform}/{gwId}/plugins/
                      .replace(/^bots\/[^/]+\/[^/]+\/plugins\//, "")
                      // Strip old-format prefix: bots/{gwId}/plugins/
                      .replace(/^bots\/[^/]+\/plugins\//, "")
                      // Strip flat prefix: plugins/
                      .replace(/^plugins\//, "")}
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
                fileStatuses={layer2FileStatuses}
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
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            onNodeClick={handleNodeClick}
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
            nodesConnectable={!isDisabled}
            edgesFocusable={!isDisabled}
            elementsSelectable
            deleteKeyCode={["Backspace", "Delete"]}
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
