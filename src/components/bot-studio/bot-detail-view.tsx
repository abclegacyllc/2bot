"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddPluginPanel } from "@/components/bot-studio/add-plugin-panel";
import { AddStepDialog } from "@/components/bot-studio/add-step-dialog";
import { WorkflowCanvas } from "@/components/bot-studio/workflow-canvas";
import { WorkflowPluginSidebar } from "@/components/bot-studio/workflow-plugin-sidebar";
import { WorkflowRunHistory } from "@/components/bot-studio/workflow-run-history";
import { WorkflowStepEditor, type StepEditorData } from "@/components/bot-studio/workflow-step-editor";
import { WorkflowTestChat } from "@/components/bot-studio/workflow-test-chat";
import { WorkflowTriggerEditor } from "@/components/bot-studio/workflow-trigger-editor";
import { ConfigModal } from "@/components/plugins/config-modal";
import { PluginIcon } from "@/components/plugins/plugin-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

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
    togglePlugin,
    triggerWorkflow,
    uninstallPlugin,
    uninstallPluginOrg,
    updatePluginConfig,
    updateWorkflow,
    updateWorkflowStep,
} from "@/lib/api-client";
import type { ConfigSchema, PluginListItem, PluginSchemaSet, UserPlugin } from "@/shared/types/plugin";
import {
    AlertCircle,
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    GripVertical,
    LayoutGrid,
    List,
    Loader2,
    PanelLeft,
    Play,
    Plug,
    Plus,
    Settings,
    Sparkles,
    Trash2,
    Wifi,
    WifiOff,
    Workflow,
    Zap,
} from "lucide-react";
import { toast } from "sonner";

// ===========================================
// Types
// ===========================================

interface BotDetailViewProps {
  gateway: GatewayOption;
  plugins: UserPlugin[];
  token: string | null;
  organizationId?: string;
  onBack: () => void;
  onRefresh: () => void;
}

// ===========================================
// Helpers
// ===========================================

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

// Trigger labels for list view (C3)
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

/** Map gateway type to a default workflow trigger type */
function defaultTriggerType(gatewayType: string): string {
  switch (gatewayType) {
    case "TELEGRAM_BOT":
    case "DISCORD_BOT":
    case "SLACK_BOT":
    case "WHATSAPP_BOT":
      return "BOT_MESSAGE";
    default:
      return "MANUAL";
  }
}

const GATEWAY_TYPE_LABEL: Record<string, string> = {
  TELEGRAM_BOT: "Telegram Bot",
  DISCORD_BOT: "Discord Bot",
  SLACK_BOT: "Slack Bot",
  WHATSAPP_BOT: "WhatsApp Bot",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; tooltip: string }> = {
  DRAFT: { label: "Draft", variant: "secondary", tooltip: "Not receiving messages yet" },
  ACTIVE: { label: "Active", variant: "default", tooltip: "Receiving and processing messages" },
  PAUSED: { label: "Paused", variant: "outline", tooltip: "Temporarily stopped — no messages will be processed" },
  ARCHIVED: { label: "Archived", variant: "destructive", tooltip: "No longer in use" },
};

// ===========================================
// Component
// ===========================================

export function BotDetailView({
  gateway,
  plugins,
  token,
  organizationId,
  onBack,
  onRefresh,
}: BotDetailViewProps) {
  // Flow editor sheet state
  const [showFlowEditor, setShowFlowEditor] = useState(false);
  const [showPluginSidebar, setShowPluginSidebar] = useState(false);
  const [flowHintDismissed, setFlowHintDismissed] = useState(() => {
    try { return localStorage.getItem(`flow-hint-${gateway.id}`) === "1"; } catch { return false; }
  });

  // Workflow state
  const [workflow, setWorkflow] = useState<WorkflowListItem | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(true);
  const [isTogglingWorkflow, setIsTogglingWorkflow] = useState(false);

  // Step editor state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Add step dialog state
  const [showAddStep, setShowAddStep] = useState(false);
  const [insertAtOrder, setInsertAtOrder] = useState(0);

  // Trigger editor state
  const [showTriggerEditor, setShowTriggerEditor] = useState(false);

  // Canvas vs list view toggle
  const [viewMode, setViewMode] = useState<"canvas" | "list">("canvas");

  // Step run statuses from last test run (for canvas overlay)
  const [stepRunStatuses, setStepRunStatuses] = useState<Record<string, { status: string; durationMs?: number; error?: string }>>({});

  // Test workflow running state
  const [isTestingWorkflow, setIsTestingWorkflow] = useState(false);

  // Post-install workflow step offer
  const [pendingWorkflowAdd, setPendingWorkflowAdd] = useState<{ pluginId: string; pluginName: string } | null>(null);

  // Guard against double auto-creation
  const autoCreateAttempted = useRef(false);

  const typeLabel = GATEWAY_TYPE_LABEL[gateway.type] ?? gateway.type;
  const selectedStep = workflow?.steps.find((s) => s.id === selectedStepId) ?? null;

  // Fetch plugin configSchema for selected step
  const [stepConfigSchema, setStepConfigSchema] = useState<ConfigSchema | null>(null);
  useEffect(() => {
    if (!selectedStep?.pluginSlug) {
      setStepConfigSchema(null);
      return;
    }
    let cancelled = false;
    getPluginBySlug(selectedStep.pluginSlug, token ?? undefined).then((res) => {
      if (!cancelled && res.success && res.data?.configSchema) {
        setStepConfigSchema(res.data.configSchema);
      } else if (!cancelled) {
        setStepConfigSchema(null);
      }
    });
    return () => { cancelled = true; };
  }, [selectedStep?.pluginSlug, token]);

  // Fetch plugin schemas for ALL workflow steps (config + input/output for canvas)
  const [allPluginSchemas, setAllPluginSchemas] = useState<Record<string, PluginSchemaSet>>({});
  const configSlugsKey = useMemo(
    () => (workflow?.steps ?? []).map((s) => s.pluginSlug).filter(Boolean).sort().join(","),
    [workflow?.steps],
  );
  useEffect(() => {
    if (!configSlugsKey) return;
    let cancelled = false;
    const slugs = [...new Set(configSlugsKey.split(","))];
    Promise.all(
      slugs.map(async (slug) => {
        try {
          const res = await getPluginBySlug(slug, token ?? undefined);
          if (res.success && res.data) {
            return {
              slug,
              schemas: {
                configSchema: res.data.configSchema,
                inputSchema: res.data.inputSchema,
                outputSchema: res.data.outputSchema,
              },
            };
          }
        } catch { /* ignore */ }
        return null;
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, PluginSchemaSet> = {};
      for (const r of results) {
        if (r) map[r.slug] = r.schemas;
      }
      setAllPluginSchemas(map);
    });
    return () => { cancelled = true; };
  }, [configSlugsKey, token]);

  // ===========================================
  // Fetch or auto-create workflow
  // ===========================================

  const fetchWorkflow = useCallback(async () => {
    setIsLoadingWorkflow(true);
    try {
      const result = await getWorkflows(
        { gatewayId: gateway.id, organizationId },
        token ?? undefined
      );
      if (result.success && result.data && result.data.length > 0) {
        const wf = result.data[0];
        if (wf) setWorkflow(wf);
        autoCreateAttempted.current = true;
      } else if (!autoCreateAttempted.current) {
        // Auto-create a DRAFT workflow for this bot
        autoCreateAttempted.current = true;
        const slug = generateSlug(gateway.name);
        const createResult = await createWorkflow(
          {
            name: `${gateway.name} Workflow`,
            slug,
            triggerType: defaultTriggerType(gateway.type),
            gatewayId: gateway.id,
          },
          { organizationId },
          token ?? undefined
        );
        if (createResult.success && createResult.data) {
          setWorkflow(createResult.data);
        }
      }
    } catch {
      toast.error("Failed to load workflow data");
    } finally {
      setIsLoadingWorkflow(false);
    }
  }, [gateway.id, gateway.name, gateway.type, organizationId, token]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // ===========================================
  // Undo / Redo support
  // ===========================================

  const { pushUndo } = useWorkflowUndo({
    workflowId: workflow?.id,
    organizationId,
    token,
    fetchWorkflow,
  });

  // ===========================================
  // Workflow status controls
  // ===========================================

  const handleToggleEnabled = useCallback(async () => {
    if (!workflow) return;
    setIsTogglingWorkflow(true);
    try {
      const result = await updateWorkflow(
        workflow.id,
        { isEnabled: !workflow.isEnabled },
        { organizationId },
        token ?? undefined
      );
      if (result.success && result.data) {
        setWorkflow(result.data);
        toast.success(
          result.data.isEnabled ? "Workflow enabled" : "Workflow disabled"
        );
      } else {
        toast.error("Failed to toggle workflow");
      }
    } catch {
      toast.error("Failed to toggle workflow");
    } finally {
      setIsTogglingWorkflow(false);
    }
  }, [workflow, organizationId, token]);

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
        toast.success(
          newStatus === "ACTIVE"
            ? "Workflow activated"
            : "Workflow moved to draft"
        );
      } else {
        toast.error("Failed to update workflow status");
      }
    } catch {
      toast.error("Failed to update workflow status");
    }
  }, [workflow, organizationId, token]);

  // ===========================================
  // Plugin data derived from props
  // ===========================================

  // Filter plugins belonging to this gateway
  const gatewayPlugins = plugins.filter((p) => p.gatewayId === gateway.id);
  const installedSlugs = new Set(gatewayPlugins.map((p) => p.pluginSlug));

  // ===========================================
  // Plugin toggle
  // ===========================================

  const [togglingPluginId, setTogglingPluginId] = useState<string | null>(null);

  const handleTogglePlugin = useCallback(
    async (userPluginId: string, enabled: boolean) => {
      setTogglingPluginId(userPluginId);
      try {
        const result = await togglePlugin(userPluginId, enabled, token ?? undefined);
        if (result.success) {
          toast.success(enabled ? "Plugin enabled" : "Plugin disabled");
          onRefresh();
          // Sync: also toggle the corresponding workflow step's isEnabled
          if (workflow) {
            const up = gatewayPlugins.find((p) => p.id === userPluginId);
            const matchingStep = up
              ? workflow.steps.find((s) => s.pluginId === up.pluginId)
              : undefined;
            if (matchingStep) {
              await updateWorkflowStep(
                workflow.id,
                matchingStep.id,
                { isEnabled: enabled },
                { organizationId },
                token ?? undefined
              );
              await fetchWorkflow();
            }
          }
        } else {
          toast.error(result.error?.message ?? "Failed to toggle plugin");
        }
      } catch {
        toast.error("Failed to toggle plugin");
      } finally {
        setTogglingPluginId(null);
      }
    },
    [token, onRefresh, workflow, gatewayPlugins, organizationId, fetchWorkflow]
  );

  // ===========================================
  // Plugin uninstall
  // ===========================================

  const [uninstallingPluginId, setUninstallingPluginId] = useState<string | null>(null);

  const handleUninstallPlugin = useCallback(
    async (userPluginId: string, pluginName: string) => {
      if (!confirm(`Uninstall "${pluginName}"? This will remove it from your bot and workflow.`)) return;
      setUninstallingPluginId(userPluginId);
      try {
        // Sync: also remove the corresponding workflow step
        if (workflow) {
          const up = gatewayPlugins.find((p) => p.id === userPluginId);
          const matchingStep = up
            ? workflow.steps.find((s) => s.pluginId === up.pluginId)
            : undefined;
          if (matchingStep) {
            await deleteWorkflowStep(
              workflow.id,
              matchingStep.id,
              { organizationId },
              token ?? undefined
            );
          }
        }
        const result = organizationId
          ? await uninstallPluginOrg(organizationId, userPluginId, token ?? undefined)
          : await uninstallPlugin(userPluginId, token ?? undefined);
        if (result.success) {
          toast.success("Plugin uninstalled");
          onRefresh();
          await fetchWorkflow();
        } else {
          toast.error(result.error?.message ?? "Failed to uninstall plugin");
        }
      } catch {
        toast.error("Failed to uninstall plugin");
      } finally {
        setUninstallingPluginId(null);
      }
    },
    [token, organizationId, onRefresh, workflow, gatewayPlugins, fetchWorkflow]
  );

  // Add plugin browse panel state
  const [showAddPlugin, setShowAddPlugin] = useState(false);

  // Compute which installed plugins are already workflow steps (by pluginId — reliable key)
  const workflowStepPluginIds = new Set(
    (workflow?.steps ?? []).map((s) => s.pluginId)
  );
  // Installed plugins not yet in the workflow
  const pluginsNotInWorkflow = gatewayPlugins.filter(
    (p) => !workflowStepPluginIds.has(p.pluginId)
  );

  // Auto-populate: sync all installed plugins into workflow as steps
  const autoSyncedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!workflow || pluginsNotInWorkflow.length === 0) return;
    // Only sync plugins we haven't already attempted
    const toSync = pluginsNotInWorkflow.filter((p) => !autoSyncedIdsRef.current.has(p.pluginId));
    if (toSync.length === 0) return;
    (async () => {
      let lastOrder = workflow.steps.reduce((max, s) => (s.order > max ? s.order : max), -1);
      for (const p of toSync) {
        lastOrder++;
        try {
          await addWorkflowStep(
            workflow.id,
            {
              order: lastOrder,
              pluginId: p.pluginId,
              name: p.pluginName,
              isEnabled: p.isEnabled,
            },
            { organizationId },
            token ?? undefined
          );
          // Only mark as synced on success
          autoSyncedIdsRef.current.add(p.pluginId);
        } catch (err) {
          console.error(`[auto-sync] Failed to add step for plugin ${p.pluginId}:`, err);
        }
      }
      await fetchWorkflow();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow?.id, pluginsNotInWorkflow.length]);

  // Plugin config modal
  const [configuringPlugin, setConfiguringPlugin] = useState<UserPlugin | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const handleSavePluginConfig = useCallback(
    async (config: Record<string, unknown>, gatewayId?: string | null, storageQuotaMb?: number) => {
      if (!configuringPlugin) return;
      setIsSavingConfig(true);
      try {
        const result = await updatePluginConfig(
          configuringPlugin.id,
          { config, gatewayId, storageQuotaMb },
          token ?? undefined
        );
        if (result.success) {
          // Sync config to matching workflow steps (plugin → step)
          if (workflow) {
            const matchingSteps = workflow.steps.filter(
              (s) => s.pluginId === configuringPlugin.pluginId
            );
            for (const step of matchingSteps) {
              await updateWorkflowStep(
                workflow.id,
                step.id,
                { config },
                { organizationId },
                token ?? undefined
              ).catch(() => {}); // best-effort sync
            }
          }
          toast.success("Plugin configuration saved");
          setConfiguringPlugin(null);
          onRefresh();
          fetchWorkflow();
        } else {
          toast.error(result.error?.message ?? "Failed to save configuration");
        }
      } catch {
        toast.error("Failed to save configuration");
      } finally {
        setIsSavingConfig(false);
      }
    },
    [configuringPlugin, token, onRefresh, workflow, organizationId, fetchWorkflow]
  );

  // ===========================================
  // Step operations
  // ===========================================

  const handleAddStep = useCallback(
    (afterOrder: number) => {
      setInsertAtOrder(afterOrder);
      setShowAddStep(true);
    },
    []
  );

  const handlePluginSelected = useCallback(
    async (plugin: PluginListItem) => {
      if (!workflow) return;
      setShowAddStep(false);
      try {
        const result = await addWorkflowStep(
          workflow.id,
          {
            order: insertAtOrder,
            pluginId: plugin.id,
            name: plugin.name,
          },
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
    [workflow, insertAtOrder, organizationId, token, fetchWorkflow, pushUndo]
  );

  const handleMoveStep = useCallback(
    async (stepId: string, newOrder: number) => {
      if (!workflow) return;
      const step = workflow.steps.find((s) => s.id === stepId);
      if (!step || step.order === newOrder) return;

      // Determine the target position name for the confirmation message
      const sortedSteps = [...workflow.steps].sort((a, b) => a.order - b.order);
      const currentIdx = sortedSteps.findIndex((s) => s.id === stepId);
      const targetIdx = sortedSteps.findIndex((s) => s.order === newOrder);
      const direction = targetIdx < currentIdx ? "up" : "down";
      const stepName = step.name || step.pluginName || step.pluginSlug || `Step ${currentIdx + 1}`;

      if (!confirm(`Move "${stepName}" ${direction} to position ${targetIdx + 1}?`)) {
        // Re-fetch to reset canvas node positions after cancelled drag
        await fetchWorkflow();
        return;
      }

      try {
        const result = await updateWorkflowStep(
          workflow.id,
          stepId,
          { order: newOrder },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          if (step) pushUndo({ type: "move", workflowId: workflow.id, stepId, oldOrder: step.order });
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
      if (!confirm(`Remove this step? This will also uninstall the plugin from your bot.`)) return;
      try {
        const result = await deleteWorkflowStep(
          workflow.id,
          stepId,
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          if (step) pushUndo({ type: "delete", workflowId: workflow.id, step });
          if (selectedStepId === stepId) setSelectedStepId(null);
          // Sync: also uninstall the corresponding plugin
          if (step) {
            const up = gatewayPlugins.find((p) => p.pluginId === step.pluginId);
            if (up) {
              const uninstallResult = organizationId
                ? await uninstallPluginOrg(organizationId, up.id, token ?? undefined)
                : await uninstallPlugin(up.id, token ?? undefined);
              if (uninstallResult.success) {
                onRefresh();
              }
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
    [workflow, selectedStepId, organizationId, token, fetchWorkflow, gatewayPlugins, onRefresh, pushUndo]
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
          // Sync step config back to the corresponding plugin (step → plugin)
          if (data.config) {
            const step = workflow.steps.find((s) => s.id === stepId);
            const up = gatewayPlugins.find((p) => p.pluginId === step?.pluginId);
            if (up) {
              await updatePluginConfig(
                up.id,
                { config: data.config },
                token ?? undefined
              ).catch(() => {}); // best-effort sync
              onRefresh();
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
    [workflow, organizationId, token, fetchWorkflow, gatewayPlugins, onRefresh]
  );

  // Toggle step enabled/disabled
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
          // Sync: also toggle the corresponding plugin's On/Off
          const step = workflow.steps.find((s) => s.id === stepId);
          if (step) {
            const up = gatewayPlugins.find((p) => p.pluginId === step.pluginId);
            if (up) {
              await togglePlugin(up.id, isEnabled, token ?? undefined);
              onRefresh();
            }
          }
        } else {
          toast.error("Failed to toggle step");
        }
      } catch {
        toast.error("Failed to toggle step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow, gatewayPlugins, onRefresh, pushUndo]
  );

  // Test workflow — trigger and poll for step results
  const handleTestWorkflow = useCallback(async () => {
    if (!workflow) return;
    setIsTestingWorkflow(true);
    setStepRunStatuses({});
    try {
      const result = await triggerWorkflow(
        workflow.id,
        {},
        { organizationId },
        token ?? undefined
      );
      if (!result.success || !result.data?.runId) {
        toast.error(result.error?.message ?? "Failed to trigger workflow");
        return;
      }
      const runId = result.data.runId;
      toast.success("Workflow triggered — watching execution...");

      // Poll every 1.5s for step-level results (max 40 attempts = 60s)
      let attempts = 0;
      const poll = async () => {
        attempts++;
        const detail = await getWorkflowRunDetail(
          workflow.id,
          runId,
          { organizationId },
          token ?? undefined
        );
        if (detail.success && detail.data) {
          const statuses: Record<string, { status: string; durationMs?: number; error?: string }> = {};
          for (const sr of detail.data.stepRuns) {
            // Map stepOrder to stepId
            const step = workflow.steps.find((s) => s.order === sr.stepOrder);
            if (step) {
              statuses[step.id] = {
                status: sr.status.toLowerCase(),
                durationMs: sr.durationMs ?? undefined,
                error: sr.error ?? undefined,
              };
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
      setTimeout(poll, 1000); // First poll after 1s
    } catch {
      toast.error("Failed to test workflow");
    } finally {
      // isTestingWorkflow set to false inside poll on completion
    }
  }, [workflow, organizationId, token]);

  const handleSelectStep = useCallback((step: WorkflowStepItem) => {
    setSelectedStepId(step.id);
    setShowTriggerEditor(false);
  }, []);

  const handleDropPlugin = useCallback(
    async (pluginId: string, pluginName: string, _pluginSlug: string, afterOrder: number) => {
      if (!workflow) return;
      try {
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
    [workflow, organizationId, token, fetchWorkflow]
  );

  /** Quick-add an installed plugin as a workflow step (appended at end) */
  const handleQuickAddStep = useCallback(
    async (pluginId: string, pluginName: string) => {
      if (!workflow) return;
      const lastOrder = workflow.steps.reduce((max, s) => (s.order > max ? s.order : max), -1);
      try {
        const result = await addWorkflowStep(
          workflow.id,
          { order: lastOrder + 1, pluginId, name: pluginName },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          toast.success(`"${pluginName}" added as workflow step`);
          await fetchWorkflow();
        } else {
          toast.error("Failed to add step");
        }
      } catch {
        toast.error("Failed to add step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow]
  );

  /** Called after a plugin is installed — auto-adds as workflow step (P5 auto-sync) */
  const handlePluginInstalled = useCallback(async (info?: { pluginId: string; pluginName: string }) => {
    setShowAddPlugin(false);
    onRefresh();
    // Auto-add installed plugin as a workflow step
    if (info && workflow) {
      // Check if plugin already exists as a step
      const alreadyInWorkflow = workflow.steps.some((s) => s.pluginId === info.pluginId);
      if (!alreadyInWorkflow) {
        await handleQuickAddStep(info.pluginId, info.pluginName);
      }
    }
  }, [onRefresh, workflow, handleQuickAddStep]);

  /** Accept the pending "add to workflow" offer */
  const handleAcceptWorkflowAdd = useCallback(async () => {
    if (!pendingWorkflowAdd) return;
    await handleQuickAddStep(pendingWorkflowAdd.pluginId, pendingWorkflowAdd.pluginName);
    setPendingWorkflowAdd(null);
  }, [pendingWorkflowAdd, handleQuickAddStep]);

  const handleDuplicateStep = useCallback(
    async (step: WorkflowStepItem) => {
      if (!workflow) return;
      try {
        const lastStep = workflow.steps.reduce(
          (max, s) => (s.order > max ? s.order : max),
          -1
        );
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

  const handleClickTrigger = useCallback(() => {
    setSelectedStepId(null);
    setShowTriggerEditor(true);
  }, []);

  const handleSaveTrigger = useCallback(
    async (data: { triggerType?: string; triggerConfig?: Record<string, unknown> }) => {
      if (!workflow) return;
      const result = await updateWorkflow(
        workflow.id,
        data,
        { organizationId },
        token ?? undefined
      );
      if (result.success && result.data) {
        setWorkflow(result.data);
        toast.success("Trigger settings saved");
      } else {
        toast.error("Failed to save trigger settings");
      }
    },
    [workflow, organizationId, token]
  );

  const handleRetryWorkflow = useCallback(async () => {
    if (!workflow) return;
    try {
      const result = await triggerWorkflow(
        workflow.id,
        {},
        { organizationId },
        token ?? undefined
      );
      if (result.success) {
        toast.success("Workflow re-triggered");
      } else {
        toast.error(result.error?.message ?? "Failed to retry workflow");
      }
    } catch {
      toast.error("Failed to retry workflow");
    }
  }, [workflow, organizationId, token]);

  // ===========================================
  // Render
  // ===========================================

  const statusInfo = STATUS_LABELS[workflow?.status ?? "DRAFT"] ?? { label: "Draft", variant: "secondary" as const, tooltip: "" };

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-muted-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to My Bots
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              {gateway.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={gateway.status === "CONNECTED" ? "default" : "secondary"}
                className="text-xs gap-1"
              >
                {gateway.status === "CONNECTED" ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {gateway.status === "CONNECTED" ? "Online" : gateway.status.toLowerCase()}
              </Badge>
              <span className="text-sm text-muted-foreground">{typeLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Unified View: Status → Trigger → Plugins → Flow Editor → Test/History */}
      <div className="space-y-4">

        {/* Workflow status bar */}
        {isLoadingWorkflow ? (
          <Card className="border-border bg-card/50">
            <CardContent className="py-6 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : workflow ? (
          <Card className="border-border bg-card/80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Workflow className="h-5 w-5 text-emerald-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusInfo.variant} className="text-[10px]" title={statusInfo.tooltip}>
                        {statusInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {workflow.steps.length} step{workflow.steps.length !== 1 ? "s" : ""}
                      </span>
                      {workflow.executionCount > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          · {workflow.executionCount} run{workflow.executionCount !== 1 ? "s" : ""}
                        </span>
                      ) : null}
                      {workflow.lastError ? (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertCircle className="h-3 w-3" /> Error
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleTestWorkflow}
                    disabled={isTestingWorkflow || workflow.steps.length === 0}
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
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
                    className="gap-1.5 text-xs"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {workflow.status === "ACTIVE" ? "Set Draft" : "Activate"}
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {workflow.isEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={workflow.isEnabled}
                      onCheckedChange={handleToggleEnabled}
                      disabled={isTogglingWorkflow}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Trigger card + inline editor */}
        {workflow ? (
          <div>
            <button
              className={`w-full text-left rounded-lg border px-4 py-3 transition-colors flex items-center justify-between ${
                showTriggerEditor
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
              }`}
              onClick={handleClickTrigger}
            >
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Zap className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-emerald-500 uppercase tracking-wide">Trigger</p>
                  <p className="text-sm font-medium text-foreground">{TRIGGER_LABELS[workflow.triggerType] ?? workflow.triggerType}</p>
                  <p className="text-xs text-muted-foreground">{gateway.name}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {showTriggerEditor ? "Editing" : "Edit"}
              </Badge>
            </button>

            {/* Inline trigger editor (collapsible) */}
            {showTriggerEditor ? (
              <div className="mt-2 rounded-lg border border-border overflow-hidden">
                <WorkflowTriggerEditor
                  triggerType={workflow.triggerType}
                  triggerConfig={workflow.triggerConfig}
                  gatewayType={gateway.type}
                  onSave={handleSaveTrigger}
                  onClose={() => setShowTriggerEditor(false)}
                />
              </div>
            ) : null}

            {/* Connector: trigger → plugins */}
            {gatewayPlugins.length > 0 ? (
              <div className="flex justify-center py-0.5">
                <div className="flex flex-col items-center">
                  <div className="w-px h-2 bg-border" />
                  <ChevronDown className="h-3 w-3 text-muted-foreground/40 -my-0.5" />
                  <div className="w-px h-2 bg-border" />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Plugin list (sorted by workflow step order) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">
              Plugins
              <span className="text-muted-foreground font-normal ml-1.5">
                ({gatewayPlugins.length})
              </span>
            </h3>
            {gatewayPlugins.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => setShowAddPlugin(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Add Plugin
              </Button>
            )}
          </div>

          {gatewayPlugins.length === 0 ? (
            <Card className="border-border bg-card/50 border-dashed">
              <CardContent className="py-6">
                <div className="text-center mb-4">
                  <Plug className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No plugins installed yet — add one to get started!
                  </p>
                </div>
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowAddPlugin(true)}
                  >
                    <Plus className="h-3.5 w-3.5" /> Browse Plugins
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-0">
              {/* Sort plugins by their workflow step order */}
              {(() => {
                const sorted = gatewayPlugins
                  .map((p) => {
                    const step = workflow?.steps.find((s) => s.pluginId === p.pluginId);
                    return { plugin: p, order: step?.order ?? 999, step };
                  })
                  .sort((a, b) => a.order - b.order);
                return sorted.map(({ plugin: p, step }, idx) => (
                  <div key={p.id}>
                    <Card className={`border-border bg-card/50 ${p.isEnabled === false ? "opacity-60" : ""}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Grip handle + reorder arrows */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                              <div className="flex flex-col">
                                <button
                                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  disabled={idx === 0}
                                  title="Move up"
                                  onClick={() => {
                                    if (!step || idx === 0) return;
                                    const prevStep = sorted[idx - 1]?.step;
                                    if (prevStep) handleMoveStep(step.id, prevStep.order);
                                  }}
                                >
                                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                </button>
                                <button
                                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  disabled={idx === sorted.length - 1}
                                  title="Move down"
                                  onClick={() => {
                                    if (!step || idx === sorted.length - 1) return;
                                    const nextStep = sorted[idx + 1]?.step;
                                    if (nextStep) handleMoveStep(step.id, nextStep.order);
                                  }}
                                >
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                </button>
                              </div>
                            </div>
                            {/* Step order badge */}
                            <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0 font-bold tabular-nums">
                              {idx + 1}
                            </Badge>
                            <PluginIcon icon={p.pluginIcon} name={p.pluginName} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {p.pluginName}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-1 max-w-md">
                                {p.pluginDescription || p.pluginCategory}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {p.lastError ? (
                              p.processStatus === "running" ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1 text-amber-400 border-amber-500/30"
                                  title={`Auto-recovered from: ${p.lastError}`}
                                >
                                  <Check className="h-3 w-3" /> Recovered
                                </Badge>
                              ) : (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] gap-1"
                                  title={p.lastError}
                                >
                                  <AlertCircle className="h-3 w-3" /> Error
                                </Badge>
                              )
                            ) : null}
                            {step?.condition ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-500 border-amber-500/30">
                                Condition
                              </Badge>
                            ) : null}
                            {p.executionCount > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {p.executionCount} run{p.executionCount !== 1 ? "s" : ""}
                              </span>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => setConfiguringPlugin(p)}
                            >
                              <Settings className="h-3 w-3" /> Configure
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              onClick={() => handleUninstallPlugin(p.id, p.pluginName)}
                              disabled={uninstallingPluginId === p.id}
                            >
                              {uninstallingPluginId === p.id
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Removing...</>
                                : <><Trash2 className="h-3 w-3" /> Remove</>
                              }
                            </Button>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {p.isEnabled ? "On" : "Off"}
                              </span>
                              <Switch
                                checked={p.isEnabled}
                                onCheckedChange={(checked) => handleTogglePlugin(p.id, checked)}
                                disabled={togglingPluginId === p.id}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    {/* Visual connector between cards */}
                    {idx < sorted.length - 1 ? (
                      <div className="flex justify-center py-0.5">
                        <div className="flex flex-col items-center">
                          <div className="w-px h-2 bg-border" />
                          <ChevronDown className="h-3 w-3 text-muted-foreground/40 -my-0.5" />
                          <div className="w-px h-2 bg-border" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Flow Editor hint (3+ plugins, dismissable) */}
        {workflow && gatewayPlugins.length >= 3 && !flowHintDismissed ? (
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Try the Flow Editor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    You have {gatewayPlugins.length} plugins — use the Flow Editor for conditions, input mapping, and error handling.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => {
                        setShowTriggerEditor(false);
                        setShowFlowEditor(true);
                      }}
                    >
                      <Workflow className="h-3 w-3" /> Open Flow Editor
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => {
                        try { localStorage.setItem(`flow-hint-${gateway.id}`, "1"); } catch { /* noop */ }
                        setFlowHintDismissed(true);
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Open Flow Editor button */}
        {workflow && workflow.steps.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 border-dashed text-muted-foreground hover:text-foreground h-9"
            onClick={() => {
              setShowTriggerEditor(false);
              setShowFlowEditor(true);
            }}
          >
            <Workflow className="h-4 w-4" /> Open Flow Editor
          </Button>
        ) : null}

        {/* Execution Trace (visible during/after test) */}
        {workflow && Object.keys(stepRunStatuses).length > 0 ? (
          <Card className="border-border">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-500" />
                  {isTestingWorkflow ? "Running..." : "Last Test Result"}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setStepRunStatuses({})}
                >
                  Clear
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
                          {rs?.durationMs !== undefined ? (
                            <span className="opacity-70">
                              {rs.durationMs < 1000 ? `${rs.durationMs}ms` : `${(rs.durationMs / 1000).toFixed(1)}s`}
                            </span>
                          ) : null}
                        </span>
                        {idx < workflow.steps.length - 1 ? (
                          <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Test Chat (message-based triggers only) */}
        {workflow?.triggerType === "BOT_MESSAGE" ? (
          <WorkflowTestChat
            workflowId={workflow.id}
            token={token}
            organizationId={organizationId}
          />
        ) : null}

        {/* Run History */}
        {workflow ? (
          <WorkflowRunHistory
            workflowId={workflow.id}
            token={token}
            organizationId={organizationId}
            onRetry={handleRetryWorkflow}
          />
        ) : null}

        {/* Workflow load error state */}
        {!isLoadingWorkflow && !workflow ? (
          <Card className="border-border bg-card/50 border-dashed">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Failed to load workflow. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={fetchWorkflow}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* ===================== FLOW EDITOR SHEET ===================== */}
      <Sheet open={showFlowEditor} onOpenChange={setShowFlowEditor}>
        <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-emerald-500" /> Flow Editor
            </SheetTitle>
            <SheetDescription>
              Visual canvas for advanced workflow editing — reorder steps, set conditions, and configure input mapping.
            </SheetDescription>
          </SheetHeader>
          {workflow ? (
            <div className="flex-1 min-h-0 flex gap-0">
              {/* Plugin catalog sidebar (drag source for canvas) */}
              {showPluginSidebar && viewMode === "canvas" ? (
                <div className="w-56 shrink-0 border-r border-border bg-background overflow-hidden">
                  <WorkflowPluginSidebar
                    gatewayType={gateway.type}
                    token={token}
                  />
                </div>
              ) : null}
              {/* Canvas area */}
              <div className="flex-1 min-w-0 relative">
                {/* Toolbar: view toggle + plugin sidebar toggle */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm"
                    onClick={() => setViewMode(viewMode === "canvas" ? "list" : "canvas")}
                    title={viewMode === "canvas" ? "Switch to list view" : "Switch to canvas view"}
                  >
                    {viewMode === "canvas" ? (
                      <List className="h-3.5 w-3.5" />
                    ) : (
                      <LayoutGrid className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {viewMode === "canvas" ? (
                    <Button
                      variant={showPluginSidebar ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm"
                      onClick={() => setShowPluginSidebar((v) => !v)}
                      title={showPluginSidebar ? "Hide plugin catalog" : "Show plugin catalog"}
                    >
                      <PanelLeft className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
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
                    onSelectStep={handleSelectStep}
                    onAddStep={handleAddStep}
                    onDeleteStep={handleDeleteStep}
                    onMoveStep={handleMoveStep}
                    onDropPlugin={handleDropPlugin}
                    onDuplicateStep={handleDuplicateStep}
                    onToggleStepEnabled={handleToggleStepEnabled}
                    onClickTrigger={handleClickTrigger}
                    pluginSchemas={allPluginSchemas}
                    onSaveStep={handleSaveStep}
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-background/50 p-4 space-y-2 h-full overflow-y-auto">
                    {/* Trigger */}
                    <button
                      className="w-full text-left rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 hover:bg-emerald-500/10 transition-colors"
                      onClick={handleClickTrigger}
                    >
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Trigger</p>
                      <p className="text-sm font-medium text-foreground">{TRIGGER_LABELS[workflow.triggerType] ?? workflow.triggerType}</p>
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
                          onClick={() => handleSelectStep(step)}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0 font-bold">{idx + 1}</Badge>
                            <span className="text-sm font-medium text-foreground truncate">{step.name || step.pluginName || step.pluginSlug}</span>
                            {step.isEnabled === false ? <Badge variant="outline" className="text-[9px] px-1 py-0 text-zinc-500 border-zinc-500/30 border-dashed ml-auto shrink-0">Disabled</Badge> : null}
                            {step.condition ? <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-500 border-amber-500/30 ml-auto shrink-0">Condition</Badge> : null}
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
                        handleAddStep(last + 1);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add a step
                    </Button>
                  </div>
                )}
              </div>

              {/* Step editor sidebar */}
              {selectedStep ? (
                <div className="w-80 shrink-0 border-l border-border overflow-y-auto">
                  <WorkflowStepEditor
                    key={selectedStep.id}
                    step={selectedStep}
                    configSchema={stepConfigSchema}
                    onSave={handleSaveStep}
                    onToggleEnabled={handleToggleStepEnabled}
                    onClose={() => setSelectedStepId(null)}
                    previousSteps={workflow?.steps
                      .filter((s) => s.order < selectedStep.order)
                      .sort((a, b) => a.order - b.order)}
                  />
                </div>
              ) : showTriggerEditor && workflow ? (
                <div className="w-80 shrink-0 border-l border-border overflow-y-auto">
                  <WorkflowTriggerEditor
                    triggerType={workflow.triggerType}
                    triggerConfig={workflow.triggerConfig}
                    gatewayType={gateway.type}
                    onSave={handleSaveTrigger}
                    onClose={() => setShowTriggerEditor(false)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Add Step Dialog */}
      <AddStepDialog
        open={showAddStep}
        onClose={() => setShowAddStep(false)}
        onSelect={handlePluginSelected}
        gatewayType={gateway.type}
        token={token}
      />

      {/* Add Plugin Sheet */}
      <Sheet open={showAddPlugin} onOpenChange={setShowAddPlugin}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Plugin</SheetTitle>
            <SheetDescription>Browse or create a plugin for this bot.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <AddPluginPanel
              gatewayId={gateway.id}
              gatewayType={gateway.type}
              installedSlugs={installedSlugs}
              token={token}
              organizationId={organizationId}
              onClose={() => setShowAddPlugin(false)}
              onInstalled={handlePluginInstalled}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Post-install: offer to add as workflow step */}
      {pendingWorkflowAdd ? (
        <div className="fixed bottom-6 right-6 z-50 bg-card border border-border rounded-lg shadow-lg p-4 max-w-sm animate-in slide-in-from-bottom-4">
          <p className="text-sm text-foreground font-medium">
            Also add &quot;{pendingWorkflowAdd.pluginName}&quot; as a workflow step?
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This will append it to your workflow pipeline so it runs in order.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleAcceptWorkflowAdd}
            >
              <Plus className="h-3 w-3" /> Add Step
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPendingWorkflowAdd(null)}
            >
              No thanks
            </Button>
          </div>
        </div>
      ) : null}

      {/* Plugin Config Modal */}
      {configuringPlugin ? (
        <ConfigModal
          plugin={configuringPlugin}
          onClose={() => setConfiguringPlugin(null)}
          onSave={handleSavePluginConfig}
          isSaving={isSavingConfig}
          token={token ?? undefined}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}
