"use client";

/**
 * WorkflowTab — The canvas-centric workflow editor tab.
 *
 * This is the centerpiece of the 2Bot Studio: a full-height canvas
 * with trigger editor, step editor sidebar, plugin catalog sidebar,
 * test execution trace, test chat, and run history.
 *
 * @module components/studio/workflow-tab
 */

import { useState } from "react";

import { AddStepDialog } from "@/components/bot-studio/add-step-dialog";
import { WorkflowCanvas } from "@/components/bot-studio/workflow-canvas";
import { WorkflowPluginSidebar } from "@/components/bot-studio/workflow-plugin-sidebar";
import { WorkflowRunHistory } from "@/components/bot-studio/workflow-run-history";
import { WorkflowStepEditor, type StepEditorData } from "@/components/bot-studio/workflow-step-editor";
import { WorkflowTriggerEditor } from "@/components/bot-studio/workflow-trigger-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";


import type { GatewayOption, PreflightReport, WorkflowListItem, WorkflowStepItem } from "@/lib/api-client";
import type { ConfigSchema, PluginListItem, PluginSchemaSet, UserPlugin } from "@/shared/types/plugin";

import {
    ChevronRight,
    LayoutGrid,
    List,
    Loader2,
    PanelLeft,
    PanelRight,
    Plus,
    Zap,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

const TRIGGER_LABELS: Record<string, string> = {
  BOT_MESSAGE: "When a message arrives",
  TELEGRAM_MESSAGE: "When a Telegram message arrives",
  DISCORD_MESSAGE: "When a Discord message arrives",
  SLACK_MESSAGE: "When a Slack message arrives",
  WHATSAPP_MESSAGE: "When a WhatsApp message arrives",
  WEBHOOK: "When a webhook is called",
  SCHEDULE: "On a schedule",
  MANUAL: "Run manually",
};

interface WorkflowTabProps {
  gateway: GatewayOption;
  workflow: WorkflowListItem | null;
  isLoadingWorkflow: boolean;
  selectedStepId: string | null;
  selectedStep: WorkflowStepItem | null;
  showTriggerEditor: boolean;
  viewMode: "canvas" | "list";
  stepRunStatuses: Record<string, { status: string; durationMs?: number; error?: string }>;
  isTestingWorkflow: boolean;
  /** Preflight report from the most recent Quick / Standard / Deep test */
  preflightReport?: PreflightReport | null;
  stepConfigSchema: ConfigSchema | null;
  allPluginSchemas?: Record<string, PluginSchemaSet>;
  showAddStep: boolean;
  gatewayPlugins: UserPlugin[];
  token: string | null;
  organizationId?: string;

  onSelectStep: (step: WorkflowStepItem) => void;
  onAddStep: (afterOrder: number) => void;
  onDeleteStep: (stepId: string) => Promise<void>;
  onMoveStep: (stepId: string, newOrder: number) => Promise<void>;
  onDropPlugin: (pluginId: string, pluginName: string, pluginSlug: string, afterOrder: number) => Promise<void>;
  onDuplicateStep: (step: WorkflowStepItem) => Promise<void>;
  onToggleStepEnabled: (stepId: string, isEnabled: boolean) => Promise<void>;
  onClickTrigger: () => void;
  onSaveTrigger: (data: { triggerType?: string; triggerConfig?: Record<string, unknown> }) => Promise<void>;
  onSaveStep: (stepId: string, data: StepEditorData) => Promise<void>;
  onTestWorkflow: () => void;
  onRetryWorkflow: () => Promise<void>;
  onPluginSelected: (plugin: PluginListItem) => void;
  onCloseAddStep: () => void;
  onCloseTriggerEditor: () => void;
  onSetSelectedStepId: (id: string | null) => void;
  onSetViewMode: (mode: "canvas" | "list") => void;
  fetchWorkflow: () => void;
  onSaveNodePosition?: (stepId: string, positionX: number, positionY: number) => Promise<void>;
  onAddEdge?: (sourceStepId: string | null, targetStepId: string) => Promise<void>;
  onDeleteEdge?: (edgeId: string) => Promise<void>;
}

// =============================================================================
// Component
// =============================================================================

export function WorkflowTab({
  gateway,
  workflow,
  isLoadingWorkflow,
  selectedStepId,
  selectedStep,
  showTriggerEditor,
  viewMode,
  stepRunStatuses,
  isTestingWorkflow,
  preflightReport,
  stepConfigSchema,
  allPluginSchemas,
  showAddStep,
  gatewayPlugins: _gatewayPlugins,
  token,
  organizationId,

  onSelectStep,
  onAddStep,
  onDeleteStep,
  onMoveStep,
  onDropPlugin,
  onDuplicateStep,
  onToggleStepEnabled,
  onClickTrigger,
  onSaveTrigger,
  onSaveStep,
  onTestWorkflow: _onTestWorkflow,
  onRetryWorkflow,
  onPluginSelected,
  onCloseAddStep,
  onCloseTriggerEditor,
  onSetSelectedStepId,
  onSetViewMode,
  fetchWorkflow,
  onSaveNodePosition,
  onAddEdge,
  onDeleteEdge,
}: WorkflowTabProps) {
  const [showPluginSidebar, setShowPluginSidebar] = useState(false);
  const [showRunHistory, setShowRunHistory] = useState(false);

  // Loading state
  if (isLoadingWorkflow) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (!workflow) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Failed to load workflow</p>
          <Button variant="outline" size="sm" onClick={fetchWorkflow}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const hasStepResults = Object.keys(stepRunStatuses).length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* ===== Execution Trace Bar (visible during/after test) ===== */}
      {hasStepResults ? (
        <div className="flex-shrink-0 border-b border-border bg-card/40 px-4 py-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              {isTestingWorkflow ? "Running..." : "Last Test Result"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px]"
              onClick={() => {/* stepRunStatuses is controlled by parent */}}
            >
              Dismiss
            </Button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {workflow.steps
              .sort((a, b) => a.order - b.order)
              .map((step, idx) => {
                const rs = stepRunStatuses[step.id];
                const rsStatus = rs?.status?.toLowerCase();
                const statusColor = !rs
                  ? "bg-zinc-500/20 text-zinc-400"
                  : rsStatus === "completed"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : rsStatus === "failed"
                      ? "bg-red-500/20 text-red-400"
                      : rsStatus === "skipped"
                        ? "bg-zinc-500/20 text-zinc-400"
                        : "bg-sky-500/20 text-sky-400";
                const statusIcon = !rs
                  ? "○"
                  : rsStatus === "completed"
                    ? "✓"
                    : rsStatus === "failed"
                      ? "✗"
                      : rsStatus === "skipped"
                        ? "⊘"
                        : "⟳";
                return (
                  <div key={step.id} className="flex items-center gap-1">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor}`}>
                      {statusIcon} {step.name || step.pluginSlug || `Step ${idx + 1}`}
                      {rs?.durationMs !== undefined && (
                        <span className="opacity-70">
                          {rs.durationMs < 1000 ? `${rs.durationMs}ms` : `${(rs.durationMs / 1000).toFixed(1)}s`}
                        </span>
                      )}
                    </span>
                    {idx < workflow.steps.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}

      {/* ===== Main Canvas Area ===== */}
      <div className="flex-1 flex min-h-0">
        {/* Plugin catalog sidebar (left, optional) */}
        {showPluginSidebar && viewMode === "canvas" ? (
          <div className="w-56 shrink-0 border-r border-border bg-background overflow-hidden">
            <WorkflowPluginSidebar
              gatewayType={gateway.type}
              token={token}
            />
          </div>
        ) : null}

        {/* Canvas / List view */}
        <div className="flex-1 min-w-0 relative">
          {/* Toolbar: view toggle + sidebar toggles */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm"
              onClick={() => onSetViewMode(viewMode === "canvas" ? "list" : "canvas")}
              title={viewMode === "canvas" ? "Switch to list view" : "Switch to canvas view"}
            >
              {viewMode === "canvas" ? (
                <List className="h-3.5 w-3.5" />
              ) : (
                <LayoutGrid className="h-3.5 w-3.5" />
              )}
            </Button>
            {viewMode === "canvas" && (
              <Button
                variant={showPluginSidebar ? "secondary" : "outline"}
                size="sm"
                className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm"
                onClick={() => setShowPluginSidebar((v) => !v)}
                title={showPluginSidebar ? "Hide plugin catalog" : "Show plugin catalog"}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Right-side toolbar: run history toggle */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <Button
              variant={showRunHistory ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs bg-background/80 backdrop-blur-sm gap-1"
              onClick={() => setShowRunHistory((v) => !v)}
            >
              <PanelRight className="h-3.5 w-3.5" />
              Runs
            </Button>
          </div>

          {viewMode === "canvas" ? (
            <WorkflowCanvas
              workflowId={workflow.id}
              steps={workflow.steps}
              edges={workflow.edges ?? []}
              selectedStepId={selectedStepId}
              triggerType={workflow.triggerType}
              triggerConfig={workflow.triggerConfig}
              stepRunStatuses={stepRunStatuses}
              preflightReport={preflightReport}
              onSelectStep={onSelectStep}
              onAddStep={onAddStep}
              onDeleteStep={onDeleteStep}
              onMoveStep={onMoveStep}
              onDropPlugin={onDropPlugin}
              onDuplicateStep={onDuplicateStep}
              onToggleStepEnabled={onToggleStepEnabled}
              onClickTrigger={onClickTrigger}
              pluginSchemas={allPluginSchemas}
              onSaveStep={onSaveStep}
              onSaveNodePosition={onSaveNodePosition}
              onAddEdge={onAddEdge}
              onDeleteEdge={onDeleteEdge}
            />
          ) : null}

          {viewMode !== "canvas" ? (
            <div className="rounded-lg border border-border bg-background/50 p-4 space-y-2 h-full overflow-y-auto">
              {/* Trigger */}
              <button
                className="w-full text-left rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 hover:bg-emerald-500/10 transition-colors"
                onClick={onClickTrigger}
              >
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Trigger</p>
                <p className="text-sm font-medium text-foreground">
                  {TRIGGER_LABELS[workflow.triggerType] ?? workflow.triggerType}
                </p>
              </button>

              {/* Steps */}
              {workflow.steps
                .sort((a, b) => a.order - b.order)
                .map((step, idx) => (
                  <button
                    key={step.id}
                    className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                      step.isEnabled === false
                        ? "border-dashed border-zinc-500/40 opacity-50"
                        : step.id === selectedStepId
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border hover:border-emerald-500/40 hover:bg-muted/50"
                    }`}
                    onClick={() => onSelectStep(step)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0 font-bold">{idx + 1}</Badge>
                      <span className="text-sm font-medium text-foreground truncate">
                        {step.name || step.pluginName || step.pluginSlug}
                      </span>
                      {step.isEnabled === false && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-zinc-500 border-zinc-500/30 border-dashed ml-auto shrink-0">
                          Disabled
                        </Badge>
                      )}
                      {step.condition ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-500 border-amber-500/30 ml-auto shrink-0">
                          Condition
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                ))}

              {workflow.steps.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No steps yet. Add a step to get started.
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-dashed w-full"
                onClick={() => {
                  const last = workflow.steps.reduce((max, s) => (s.order > max ? s.order : max), -1);
                  onAddStep(last + 1);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add a step
              </Button>
            </div>
          ) : null}
        </div>

        {/* Step editor sidebar (right) */}
        {selectedStep ? (
          <div className="w-80 shrink-0 border-l border-border overflow-y-auto bg-background">
            <WorkflowStepEditor
              key={selectedStep.id}
              step={selectedStep}
              configSchema={stepConfigSchema}
              onSave={onSaveStep}
              onToggleEnabled={onToggleStepEnabled}
              onClose={() => onSetSelectedStepId(null)}
              previousSteps={workflow.steps
                .filter((s) => s.order < selectedStep.order)
                .sort((a, b) => a.order - b.order)}
            />
          </div>
        ) : showTriggerEditor ? (
          <div className="w-80 shrink-0 border-l border-border overflow-y-auto bg-background">
            <WorkflowTriggerEditor
              triggerType={workflow.triggerType}
              triggerConfig={workflow.triggerConfig}
              gatewayType={gateway.type}
              onSave={onSaveTrigger}
              onClose={onCloseTriggerEditor}
            />
          </div>
        ) : showRunHistory ? (
          <div className="w-80 shrink-0 border-l border-border overflow-y-auto bg-background">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Run History</h3>
            </div>
            <WorkflowRunHistory
              workflowId={workflow.id}
              token={token}
              organizationId={organizationId}
              onRetry={onRetryWorkflow}
            />
          </div>
        ) : null}
      </div>

      {/* Add Step Dialog */}
      <AddStepDialog
        open={showAddStep}
        onClose={onCloseAddStep}
        onSelect={onPluginSelected}
        gatewayType={gateway.type}
        token={token}
      />
    </div>
  );
}
