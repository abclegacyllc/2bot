"use client";

/**
 * BotStudioView — Tabbed bot editor for the 2Bot Studio.
 *
 * Tabs: Overview | Workflow | Analytics | Settings
 *
 * Hosts all workflow state management extracted from bot-detail-view.tsx,
 * distributing concerns across tab panels.
 *
 * @module components/studio/bot-studio-view
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStudio } from "@/app/studio/layout";
import { WorkflowRunHistory } from "@/components/bot-studio/workflow-run-history";
import { WorkflowTestChat } from "@/components/bot-studio/workflow-test-chat";
import { CursorStudioBar } from "@/components/cursor/cursor-studio-bar";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { useAuth } from "@/components/providers/auth-provider";
import { OverviewTab } from "@/components/studio/overview-tab";
import { SettingsTab } from "@/components/studio/settings-tab";
import { WorkflowTab } from "@/components/studio/workflow-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { StepEditorData } from "@/components/bot-studio/workflow-step-editor";
import { useWorkflowUndo } from "@/hooks/use-workflow-undo";
import type {
    GatewayOption,
    WorkflowListItem,
    WorkflowStepItem,
} from "@/lib/api-client";
import {
    addWorkflowStep,
    createWorkflow,
    deleteWorkflowStep,
    getPluginBySlug,
    getWorkflowRunDetail,
    getWorkflows,
    installPluginToBot,
    installPluginToBotOrg,
    togglePlugin,
    triggerWorkflow,
    uninstallPlugin,
    uninstallPluginOrg,
    updatePluginConfig,
    updateWorkflow,
    updateWorkflowStep,
} from "@/lib/api-client";
import type { ConfigSchema, PluginListItem, UserPlugin } from "@/shared/types/plugin";

import {
    Activity,
    BarChart3,
    Loader2,
    Play,
    Settings,
    Workflow,
    Zap,
} from "lucide-react";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

export interface BotStudioViewProps {
  gateway: GatewayOption;
  plugins: UserPlugin[];
}

// =============================================================================
// Constants
// =============================================================================

const TABS = ["overview", "workflow", "analytics", "settings"] as const;
type TabValue = (typeof TABS)[number];

const TAB_ICONS: Record<TabValue, React.ReactNode> = {
  overview: <Activity className="h-3.5 w-3.5" />,
  workflow: <Workflow className="h-3.5 w-3.5" />,
  analytics: <BarChart3 className="h-3.5 w-3.5" />,
  settings: <Settings className="h-3.5 w-3.5" />,
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; tooltip: string }> = {
  ACTIVE: { label: "Active", variant: "default", tooltip: "Workflow is active and will process triggers" },
  DRAFT: { label: "Draft", variant: "secondary", tooltip: "Workflow is in draft — activate to go live" },
  PAUSED: { label: "Paused", variant: "outline", tooltip: "Workflow is paused" },
  FAILED: { label: "Failed", variant: "destructive", tooltip: "Workflow encountered an error" },
};

/** Map gateway type to a default workflow trigger type */
function defaultTriggerType(gatewayType: string): string {
  switch (gatewayType) {
    case "TELEGRAM_BOT":
      return "TELEGRAM_MESSAGE";
    case "DISCORD_BOT":
      return "DISCORD_MESSAGE";
    case "SLACK_BOT":
      return "SLACK_MESSAGE";
    case "WHATSAPP_BOT":
      return "WHATSAPP_MESSAGE";
    default:
      return "BOT_MESSAGE";
  }
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

const GATEWAY_TYPE_LABEL: Record<string, string> = {
  TELEGRAM_BOT: "Telegram Bot",
  DISCORD_BOT: "Discord Bot",
  SLACK_BOT: "Slack Bot",
  WHATSAPP_BOT: "WhatsApp Bot",
};

// =============================================================================
// Component
// =============================================================================

export function BotStudioView({ gateway, plugins: gatewayPlugins }: BotStudioViewProps) {
  const { token, user, context } = useAuth();
  const { refresh: studioRefresh } = useStudio();
  const router = useRouter();
  const searchParams = useSearchParams();

  const organizationId =
    context.type === "organization" ? context.organizationId : undefined;

  // =========================================================================
  // Tab state — persisted in URL search params
  // =========================================================================

  const activeTab = (searchParams.get("tab") as TabValue) || "workflow";
  const setActiveTab = useCallback(
    (tab: TabValue) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // =========================================================================
  // Workflow state (extracted from bot-detail-view.tsx)
  // =========================================================================

  const [workflow, setWorkflow] = useState<WorkflowListItem | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [insertAtOrder, setInsertAtOrder] = useState(0);
  const [showTriggerEditor, setShowTriggerEditor] = useState(false);
  const [viewMode, setViewMode] = useState<"canvas" | "list">("canvas");
  const [stepRunStatuses, setStepRunStatuses] = useState<Record<string, { status: string; durationMs?: number }>>({});
  const [isTestingWorkflow, setIsTestingWorkflow] = useState(false);
  const [isTogglingWorkflow, setIsTogglingWorkflow] = useState(false);

  // Plugin management state
  const [_pendingWorkflowAdd, _setPendingWorkflowAdd] = useState<{ pluginId: string; pluginName: string } | null>(null);
  const [stepConfigSchema, setStepConfigSchema] = useState<ConfigSchema | null>(null);

  // Auto-created workflow ref
  const autoCreatedRef = useRef(false);

  // =========================================================================
  // Selected step (derived)
  // =========================================================================

  const selectedStep = useMemo(
    () => (selectedStepId ? workflow?.steps.find((s) => s.id === selectedStepId) ?? null : null),
    [selectedStepId, workflow]
  );

  // Fetch plugin config schema when a step is selected
  useEffect(() => {
    const slug = selectedStep?.pluginSlug;
    if (!slug) {
      setStepConfigSchema(null);
      return;
    }
    let cancelled = false;
    getPluginBySlug(slug, token ?? undefined).then((res) => {
      if (!cancelled) {
        setStepConfigSchema(res.data?.configSchema ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [selectedStep?.pluginSlug, token]);

  const installedSlugs = useMemo(
    () => new Set(gatewayPlugins.map((p) => p.pluginSlug)),
    [gatewayPlugins]
  );

  const typeLabel = GATEWAY_TYPE_LABEL[gateway.type] ?? gateway.type;

  // =========================================================================
  // Fetch Workflow
  // =========================================================================

  const fetchWorkflow = useCallback(async () => {
    if (!token) return;
    setIsLoadingWorkflow(true);
    try {
      const result = await getWorkflows({ gatewayId: gateway.id, organizationId }, token ?? undefined);
      if (result.success && result.data && result.data.length > 0) {
        setWorkflow(result.data[0] ?? null);
      } else if (!autoCreatedRef.current) {
        autoCreatedRef.current = true;
        const slug = generateSlug(gateway.name);
        const createResult = await createWorkflow(
          {
            gatewayId: gateway.id,
            name: `${gateway.name} Workflow`,
            slug,
            triggerType: defaultTriggerType(gateway.type),
          },
          { organizationId },
          token
        );
        if (createResult.success && createResult.data) {
          setWorkflow(createResult.data);
        }
      }
    } catch {
      // handled in UI
    } finally {
      setIsLoadingWorkflow(false);
    }
  }, [token, gateway.id, gateway.name, gateway.type, organizationId]);

  // Undo support
  const { pushUndo } = useWorkflowUndo({
    workflowId: workflow?.id,
    organizationId,
    token,
    fetchWorkflow,
  });

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // =========================================================================
  // Auto-sync installed plugins to workflow steps
  // =========================================================================

  useEffect(() => {
    if (!workflow || !token || gatewayPlugins.length === 0) return;

    const missingPlugins = gatewayPlugins.filter(
      (p) => p.isEnabled && !workflow.steps.some((s) => s.pluginId === p.pluginId)
    );

    if (missingPlugins.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const mp of missingPlugins) {
        if (cancelled) break;
        const lastOrder = workflow.steps.reduce((max, s) => (s.order > max ? s.order : max), -1);
        await addWorkflowStep(
          workflow.id,
          { order: lastOrder + 1, pluginId: mp.pluginId, name: mp.pluginName },
          { organizationId },
          token
        ).catch(() => {});
      }
      if (!cancelled) {
        fetchWorkflow();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayPlugins.length, workflow?.id]);

  // =========================================================================
  // Workflow handlers
  // =========================================================================

  const handleToggleEnabled = useCallback(
    async (checked: boolean) => {
      if (!workflow) return;
      setIsTogglingWorkflow(true);
      try {
        const result = await updateWorkflow(
          workflow.id,
          { isEnabled: checked },
          { organizationId },
          token ?? undefined
        );
        if (result.success && result.data) {
          setWorkflow(result.data);
          toast.success(checked ? "Workflow enabled" : "Workflow disabled");
        } else {
          toast.error("Failed to toggle workflow");
        }
      } catch {
        toast.error("Failed to toggle workflow");
      } finally {
        setIsTogglingWorkflow(false);
      }
    },
    [workflow, organizationId, token]
  );

  const handleActivate = useCallback(async () => {
    if (!workflow) return;
    const newStatus = workflow.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    try {
      const result = await updateWorkflow(
        workflow.id,
        { status: newStatus },
        { organizationId },
        token ?? undefined
      );
      if (result.success && result.data) {
        setWorkflow(result.data);
        toast.success(newStatus === "ACTIVE" ? "Workflow activated" : "Workflow set to draft");
      } else {
        toast.error("Failed to update workflow status");
      }
    } catch {
      toast.error("Failed to update workflow status");
    }
  }, [workflow, organizationId, token]);

  // =========================================================================
  // Step handlers
  // =========================================================================

  const handleAddStep = useCallback((afterOrder: number) => {
    setInsertAtOrder(afterOrder);
    setShowAddStep(true);
  }, []);

  /**
   * Ensure a plugin is installed (has a user_plugin record) for this gateway.
   * If already installed, this is a no-op. Otherwise installs it so it appears
   * in the Plugins tab alongside its workflow step.
   */
  const ensurePluginInstalled = useCallback(
    async (pluginSlug: string) => {
      if (installedSlugs.has(pluginSlug)) return;
      const install = organizationId
        ? installPluginToBotOrg(organizationId, pluginSlug, gateway.id, {}, token ?? undefined)
        : installPluginToBot(pluginSlug, gateway.id, {}, token ?? undefined);
      const res = await install;
      if (res.success) {
        studioRefresh();
      }
    },
    [installedSlugs, organizationId, gateway.id, token, studioRefresh]
  );

  const handlePluginSelected = useCallback(
    async (plugin: PluginListItem) => {
      if (!workflow) return;
      setShowAddStep(false);
      try {
        await ensurePluginInstalled(plugin.slug);
        const result = await addWorkflowStep(
          workflow.id,
          { order: insertAtOrder, pluginId: plugin.id, name: plugin.name },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          if (result.data) pushUndo({ type: "add", workflowId: workflow.id, stepId: result.data.id });
          toast.success(`Step "${plugin.name}" added`);
          await fetchWorkflow();
        } else {
          toast.error("Failed to add step");
        }
      } catch {
        toast.error("Failed to add step");
      }
    },
    [workflow, insertAtOrder, organizationId, token, fetchWorkflow, pushUndo, ensurePluginInstalled]
  );

  const handleMoveStep = useCallback(
    async (stepId: string, newOrder: number) => {
      if (!workflow) return;
      const step = workflow.steps.find((s) => s.id === stepId);
      if (!step || step.order === newOrder) return;
      try {
        const result = await updateWorkflowStep(
          workflow.id,
          stepId,
          { order: newOrder },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          pushUndo({ type: "move", workflowId: workflow.id, stepId, oldOrder: step.order });
          await fetchWorkflow();
        } else {
          toast.error("Failed to reorder step");
        }
      } catch {
        toast.error("Failed to reorder step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow, pushUndo]
  );

  const handleDeleteStep = useCallback(
    async (stepId: string) => {
      if (!workflow) return;
      const step = workflow.steps.find((s) => s.id === stepId);
      if (!confirm("Remove this step? This will also uninstall the plugin from your bot.")) return;
      try {
        const result = await deleteWorkflowStep(workflow.id, stepId, { organizationId }, token ?? undefined);
        if (result.success) {
          if (step) pushUndo({ type: "delete", workflowId: workflow.id, step });
          if (selectedStepId === stepId) setSelectedStepId(null);
          // Sync: uninstall the plugin
          if (step) {
            const up = gatewayPlugins.find((p) => p.pluginId === step.pluginId);
            if (up) {
              const uninstallResult = organizationId
                ? await uninstallPluginOrg(organizationId, up.id, token ?? undefined)
                : await uninstallPlugin(up.id, token ?? undefined);
              if (uninstallResult.success) studioRefresh();
            }
          }
          toast.success("Step and plugin removed");
          await fetchWorkflow();
        } else {
          toast.error("Failed to remove step");
        }
      } catch {
        toast.error("Failed to remove step");
      }
    },
    [workflow, selectedStepId, organizationId, token, fetchWorkflow, gatewayPlugins, studioRefresh, pushUndo]
  );

  const handleSaveStep = useCallback(
    async (stepId: string, data: StepEditorData) => {
      if (!workflow) return;
      try {
        const result = await updateWorkflowStep(
          workflow.id,
          stepId,
          {
            name: data.name,
            inputMapping: data.inputMapping,
            config: data.config,
            onError: data.onError,
            maxRetries: data.maxRetries,
            condition: data.condition,
          },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          // Sync step config back to plugin
          if (data.config) {
            const step = workflow.steps.find((s) => s.id === stepId);
            const up = gatewayPlugins.find((p) => p.pluginId === step?.pluginId);
            if (up) {
              await updatePluginConfig(up.id, { config: data.config }, token ?? undefined).catch(() => {});
              studioRefresh();
            }
          }
          toast.success("Step saved");
          await fetchWorkflow();
        } else {
          toast.error("Failed to save step");
        }
      } catch {
        toast.error("Failed to save step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow, gatewayPlugins, studioRefresh]
  );

  const handleToggleStepEnabled = useCallback(
    async (stepId: string, isEnabled: boolean) => {
      if (!workflow) return;
      try {
        const result = await updateWorkflowStep(
          workflow.id,
          stepId,
          { isEnabled },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          pushUndo({ type: "toggle", workflowId: workflow.id, stepId, wasEnabled: !isEnabled });
          toast.success(isEnabled ? "Step enabled" : "Step disabled");
          await fetchWorkflow();
          // Sync to plugin
          const step = workflow.steps.find((s) => s.id === stepId);
          if (step) {
            const up = gatewayPlugins.find((p) => p.pluginId === step.pluginId);
            if (up) {
              await togglePlugin(up.id, isEnabled, token ?? undefined);
              studioRefresh();
            }
          }
        } else {
          toast.error("Failed to toggle step");
        }
      } catch {
        toast.error("Failed to toggle step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow, gatewayPlugins, studioRefresh, pushUndo]
  );

  const handleDropPlugin = useCallback(
    async (pluginId: string, pluginName: string, pluginSlug: string, afterOrder: number) => {
      if (!workflow) return;
      try {
        if (pluginSlug) await ensurePluginInstalled(pluginSlug);
        const result = await addWorkflowStep(
          workflow.id,
          { order: afterOrder, pluginId, name: pluginName },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          toast.success(`Step "${pluginName}" added`);
          await fetchWorkflow();
        } else {
          toast.error("Failed to add step");
        }
      } catch {
        toast.error("Failed to add step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow, ensurePluginInstalled]
  );

  const handleDuplicateStep = useCallback(
    async (step: WorkflowStepItem) => {
      if (!workflow) return;
      try {
        const lastStep = workflow.steps.reduce((max, s) => (s.order > max ? s.order : max), -1);
        const result = await addWorkflowStep(
          workflow.id,
          {
            order: lastStep + 1,
            pluginId: step.pluginId,
            name: step.name ? `${step.name} (copy)` : undefined,
            inputMapping: step.inputMapping,
            config: step.config as Record<string, unknown> | undefined,
            onError: step.onError,
            maxRetries: step.maxRetries,
          },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          toast.success("Step duplicated");
          await fetchWorkflow();
        } else {
          toast.error("Failed to duplicate step");
        }
      } catch {
        toast.error("Failed to duplicate step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow]
  );

  const handleSelectStep = useCallback((step: WorkflowStepItem) => {
    setSelectedStepId(step.id);
    setShowTriggerEditor(false);
  }, []);

  const handleClickTrigger = useCallback(() => {
    setSelectedStepId(null);
    setShowTriggerEditor(true);
  }, []);

  const handleSaveTrigger = useCallback(
    async (data: { triggerType?: string; triggerConfig?: Record<string, unknown> }) => {
      if (!workflow) return;
      const result = await updateWorkflow(workflow.id, data, { organizationId }, token ?? undefined);
      if (result.success && result.data) {
        setWorkflow(result.data);
        toast.success("Trigger settings saved");
      } else {
        toast.error("Failed to save trigger settings");
      }
    },
    [workflow, organizationId, token]
  );

  // =========================================================================
  // Test workflow
  // =========================================================================

  const handleTestWorkflow = useCallback(async () => {
    if (!workflow) return;
    setIsTestingWorkflow(true);
    setStepRunStatuses({});
    try {
      const result = await triggerWorkflow(workflow.id, {}, { organizationId }, token ?? undefined);
      if (!result.success || !result.data?.runId) {
        toast.error(result.error?.message ?? "Failed to trigger workflow");
        setIsTestingWorkflow(false);
        return;
      }
      const runId = result.data.runId;
      toast.success("Workflow triggered — watching execution...");

      let attempts = 0;
      const poll = async () => {
        attempts++;
        const detail = await getWorkflowRunDetail(workflow.id, runId, { organizationId }, token ?? undefined);
        if (detail.success && detail.data) {
          const statuses: Record<string, { status: string; durationMs?: number }> = {};
          for (const sr of detail.data.stepRuns) {
            const step = workflow.steps.find((s) => s.order === sr.stepOrder);
            if (step) {
              statuses[step.id] = { status: sr.status.toLowerCase(), durationMs: sr.durationMs ?? undefined };
            }
          }
          setStepRunStatuses(statuses);

          if (detail.data.status === "completed" || detail.data.status === "COMPLETED") {
            toast.success(`Workflow completed in ${detail.data.durationMs ?? 0}ms`);
            setIsTestingWorkflow(false);
            return;
          }
          if (detail.data.status === "failed" || detail.data.status === "FAILED") {
            toast.error(`Workflow failed: ${detail.data.error ?? "Unknown error"}`);
            setIsTestingWorkflow(false);
            return;
          }
        }
        if (attempts < 40) {
          setTimeout(poll, 1500);
        } else {
          toast.info("Still running — check run history for results");
          setIsTestingWorkflow(false);
        }
      };
      setTimeout(poll, 1000);
    } catch {
      toast.error("Failed to test workflow");
      setIsTestingWorkflow(false);
    }
  }, [workflow, organizationId, token]);

  const handleRetryWorkflow = useCallback(async () => {
    if (!workflow) return;
    try {
      const result = await triggerWorkflow(workflow.id, {}, { organizationId }, token ?? undefined);
      if (result.success) {
        toast.success("Workflow re-triggered");
      } else {
        toast.error(result.error?.message ?? "Failed to retry workflow");
      }
    } catch {
      toast.error("Failed to retry workflow");
    }
  }, [workflow, organizationId, token]);

  // =========================================================================
  // Status bar info
  // =========================================================================

  const statusInfo = (STATUS_LABELS[workflow?.status ?? "DRAFT"] ?? STATUS_LABELS.DRAFT) as { label: string; variant: "default" | "secondary" | "destructive" | "outline"; tooltip: string };

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="h-full flex flex-col">
      {/* ===== Header Bar ===== */}
      <div className="flex-shrink-0 border-b border-border bg-card/30 px-4 py-2">
        {/* Breadcrumb */}
        <Breadcrumbs
          items={[{ label: "Studio", href: "/studio" }]}
          current={gateway.name}
          className="mb-1.5"
        />
        <div className="flex items-center justify-between">
          {/* Left: Bot name + status */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">
              {gateway.name}
            </h1>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {typeLabel}
            </Badge>
            {workflow ? (
              <Badge variant={statusInfo.variant} className="text-[10px] shrink-0" title={statusInfo.tooltip}>
                {statusInfo.label}
              </Badge>
            ) : null}
            {workflow?.steps ? (
              <span className="text-xs text-muted-foreground shrink-0">
                {workflow.steps.length} step{workflow.steps.length !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {workflow ? (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleTestWorkflow}
                  disabled={isTestingWorkflow || !workflow.steps.length}
                  className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700"
                >
                  {isTestingWorkflow ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {isTestingWorkflow ? "Running..." : "Test"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleActivate}
                  className="gap-1.5 text-xs h-8"
                >
                  <Play className="h-3.5 w-3.5" />
                  {workflow.status === "ACTIVE" ? "Set Draft" : "Activate"}
                </Button>
                <div className="flex items-center gap-2 pl-2 border-l border-border">
                  <span className="text-xs text-muted-foreground">
                    {workflow.isEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={workflow.isEnabled}
                    onCheckedChange={handleToggleEnabled}
                    disabled={isTogglingWorkflow}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ===== Tabs ===== */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-border bg-card/20 px-4 flex items-center">
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="relative h-9 rounded-none border-b-2 border-transparent px-3 text-xs font-medium data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none gap-1.5 capitalize"
              >
                {TAB_ICONS[tab]}
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Inline test chat — right side of tab bar */}
          {workflow?.triggerType === "BOT_MESSAGE" ? (
            <div className="ml-auto">
              <WorkflowTestChat
                workflowId={workflow.id}
                token={token}
                organizationId={organizationId}
                variant="inline"
              />
            </div>
          ) : null}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="overview" className="h-full m-0 overflow-auto p-4">
            <OverviewTab
              gateway={gateway}
              workflow={workflow}
              plugins={gatewayPlugins}
              isLoadingWorkflow={isLoadingWorkflow}
              statusInfo={statusInfo}
              onSwitchTab={(tab: string) => setActiveTab(tab as TabValue)}
            />
          </TabsContent>

          <TabsContent value="workflow" className="h-full m-0">
            <WorkflowTab
              gateway={gateway}
              workflow={workflow}
              isLoadingWorkflow={isLoadingWorkflow}
              selectedStepId={selectedStepId}
              selectedStep={selectedStep}
              showTriggerEditor={showTriggerEditor}
              viewMode={viewMode}
              stepRunStatuses={stepRunStatuses}
              isTestingWorkflow={isTestingWorkflow}
              stepConfigSchema={stepConfigSchema}
              showAddStep={showAddStep}
              gatewayPlugins={gatewayPlugins}
              token={token}
              organizationId={organizationId}
              onSelectStep={handleSelectStep}
              onAddStep={handleAddStep}
              onDeleteStep={handleDeleteStep}
              onMoveStep={handleMoveStep}
              onDropPlugin={handleDropPlugin}
              onDuplicateStep={handleDuplicateStep}
              onToggleStepEnabled={handleToggleStepEnabled}
              onClickTrigger={handleClickTrigger}
              onSaveTrigger={handleSaveTrigger}
              onSaveStep={handleSaveStep}
              onTestWorkflow={handleTestWorkflow}
              onRetryWorkflow={handleRetryWorkflow}
              onPluginSelected={handlePluginSelected}
              onCloseAddStep={() => setShowAddStep(false)}
              onCloseTriggerEditor={() => setShowTriggerEditor(false)}
              onSetSelectedStepId={setSelectedStepId}
              onSetViewMode={setViewMode}
              fetchWorkflow={fetchWorkflow}
            />
          </TabsContent>

          <TabsContent value="analytics" className="h-full m-0 overflow-auto p-4">
            {workflow ? (
              <WorkflowRunHistory
                workflowId={workflow.id}
                token={token}
                organizationId={organizationId}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No workflow yet</p>
                  <p className="text-xs mt-1">Analytics will appear once a workflow is created</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="h-full m-0 overflow-auto p-4">
            <SettingsTab
              gateway={gateway}
              token={token}
              organizationId={organizationId}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* ===== Cursor Studio Bar — persistent across all tabs ===== */}
      <div className="flex-shrink-0 relative">
        <CursorStudioBar
          token={token}
          userId={user?.id}
          organizationId={organizationId}
          workflow={workflow}
          botName={gateway.name}
          fetchWorkflow={fetchWorkflow}
          activeTab={activeTab}
        />
      </div>
    </div>
  );
}
