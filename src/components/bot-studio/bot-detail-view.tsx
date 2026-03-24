"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AddPluginPanel } from "@/components/bot-studio/add-plugin-panel";
import { AddStepDialog } from "@/components/bot-studio/add-step-dialog";
import { WorkflowCanvas } from "@/components/bot-studio/workflow-canvas";
import { WorkflowPluginSidebar } from "@/components/bot-studio/workflow-plugin-sidebar";
import { WorkflowRunHistory } from "@/components/bot-studio/workflow-run-history";
import { WorkflowStepEditor, type StepEditorData } from "@/components/bot-studio/workflow-step-editor";
import { WorkflowTriggerEditor } from "@/components/bot-studio/workflow-trigger-editor";
import { ConfigModal } from "@/components/plugins/config-modal";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
    getWorkflows,
    togglePlugin,
    triggerWorkflow,
    uninstallPlugin,
    uninstallPluginOrg,
    updateGateway,
    updatePluginConfig,
    updateWorkflow,
    updateWorkflowStep,
} from "@/lib/api-client";
import type { ConfigSchema, PluginListItem, UserPlugin } from "@/shared/types/plugin";
import {
    AlertCircle,
    ArrowLeft,
    Check,
    ChevronRight,
    HelpCircle,
    LayoutGrid,
    List,
    Loader2,
    PanelLeftClose,
    PanelLeftOpen,
    Play,
    Plug,
    Plus,
    Settings,
    Trash2,
    Wifi,
    WifiOff,
    Workflow,
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
// Guided Tour (F2)
// ===========================================

const TOUR_STEPS = [
  {
    title: "This is what starts your workflow",
    description: "Click the trigger node on the canvas to configure when your workflow runs — on a new message, webhook, schedule, or manual trigger.",
    icon: "⚡",
  },
  {
    title: "Add steps to process the message",
    description: "Drag plugins from the sidebar or click \"+ Add a step\" to build your automation pipeline. Each step processes data in order.",
    icon: "🧩",
  },
  {
    title: "See results here",
    description: "After you activate your workflow and trigger it, the run history below will show results, timing, and any errors for each step.",
    icon: "📊",
  },
] as const;

function GuidedTour({ isFirstTime, onDismiss }: { isFirstTime: boolean; onDismiss?: () => void }) {
  const [tourStep, setTourStep] = useState(0);

  // Simple help card when not first-time
  if (!isFirstTime) {
    return (
      <Card className="border-border bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ChevronRight className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">How workflows work</p>
              <p className="text-xs text-muted-foreground mt-1">
                When your bot receives a message, it flows through each step in order.
                Every step is a plugin that processes the data — and any step can reply back to the user.
                Click <span className="font-medium text-foreground">+ Add a step</span> on the canvas, or drag a plugin from the sidebar.
              </p>
            </div>
            {onDismiss ? (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={onDismiss}>
                <span className="text-xs text-muted-foreground">×</span>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  const current = TOUR_STEPS[tourStep]!;
  const isLast = tourStep === TOUR_STEPS.length - 1;

  return (
    <Card className="border-border bg-emerald-500/5 border-emerald-500/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">{current.icon}</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{current.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{current.description}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`h-1.5 rounded-full transition-all ${
                  i === tourStep ? "w-4 bg-emerald-500" : "w-1.5 bg-muted-foreground/30"
                }`}
                onClick={() => setTourStep(i)}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {tourStep > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setTourStep(tourStep - 1)}>
                Back
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              className="h-6 text-[11px] px-3 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (isLast) {
                  setTourStep(0); // Reset for next time
                } else {
                  setTourStep(tourStep + 1);
                }
              }}
            >
              {isLast ? "Got it!" : "Next"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
  // Gateway mode state
  const [mode, setMode] = useState<string>(gateway.mode ?? "plugin");

  // Workflow state
  const [workflow, setWorkflow] = useState<WorkflowListItem | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(true);
  const [isTogglingWorkflow, setIsTogglingWorkflow] = useState(false);

  // Step editor state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Add step dialog state
  const [showAddStep, setShowAddStep] = useState(false);
  const [insertAtOrder, setInsertAtOrder] = useState(0);

  // Mode toggle confirmation
  const [showModeConfirm, setShowModeConfirm] = useState(false);

  // Trigger editor state
  const [showTriggerEditor, setShowTriggerEditor] = useState(false);

  // Help overlay state
  const [showHelp, setShowHelp] = useState(false);

  // Canvas vs list view toggle
  const [viewMode, setViewMode] = useState<"canvas" | "list">("canvas");

  // Plugin sidebar toggle (collapsed by default to give canvas more space)
  const [showPluginSidebar, setShowPluginSidebar] = useState(false);

  // Auto-expand plugin sidebar the first time when there are no steps
  const sidebarAutoShown = useRef(false);

  // Guard against double auto-creation
  const autoCreateAttempted = useRef(false);

  const typeLabel = GATEWAY_TYPE_LABEL[gateway.type] ?? gateway.type;
  const selectedStep = workflow?.steps.find((s) => s.id === selectedStepId) ?? null;

  // Auto-expand sidebar when canvas is empty (first time only)
  useEffect(() => {
    if (workflow && workflow.steps.length === 0 && !sidebarAutoShown.current) {
      sidebarAutoShown.current = true;
      setShowPluginSidebar(true);
    }
  }, [workflow]);

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

  const handleToggleMode = useCallback(async () => {
    setShowModeConfirm(true);
  }, []);

  const handleConfirmModeSwitch = useCallback(async () => {
    setShowModeConfirm(false);
    const newMode = mode === "plugin" ? "workflow" : "plugin";
    try {
      const result = await updateGateway(gateway.id, { mode: newMode }, token ?? undefined);
      if (result.success) {
        setMode(newMode);
        toast.success(`Bot switched to ${newMode} mode`);
      } else {
        toast.error(result.error?.message ?? "Failed to switch mode");
      }
    } catch {
      toast.error("Failed to switch mode");
    }
  }, [gateway.id, mode, token]);

  // ===========================================
  // Plugin toggle
  // ===========================================

  const [togglingPluginId, setTogglingPluginId] = useState<string | null>(null);

  const handleTogglePlugin = useCallback(
    async (pluginId: string, enabled: boolean) => {
      setTogglingPluginId(pluginId);
      try {
        const result = await togglePlugin(pluginId, enabled, token ?? undefined);
        if (result.success) {
          toast.success(enabled ? "Plugin enabled" : "Plugin disabled");
          onRefresh();
        } else {
          toast.error(result.error?.message ?? "Failed to toggle plugin");
        }
      } catch {
        toast.error("Failed to toggle plugin");
      } finally {
        setTogglingPluginId(null);
      }
    },
    [token, onRefresh]
  );

  // ===========================================
  // Plugin uninstall
  // ===========================================

  const [uninstallingPluginId, setUninstallingPluginId] = useState<string | null>(null);

  const handleUninstallPlugin = useCallback(
    async (pluginId: string, pluginName: string) => {
      if (!confirm(`Uninstall "${pluginName}"? This will remove it from your bot.`)) return;
      setUninstallingPluginId(pluginId);
      try {
        const result = organizationId
          ? await uninstallPluginOrg(organizationId, pluginId, token ?? undefined)
          : await uninstallPlugin(pluginId, token ?? undefined);
        if (result.success) {
          toast.success("Plugin uninstalled");
          onRefresh();
        } else {
          toast.error(result.error?.message ?? "Failed to uninstall plugin");
        }
      } catch {
        toast.error("Failed to uninstall plugin");
      } finally {
        setUninstallingPluginId(null);
      }
    },
    [token, organizationId, onRefresh]
  );

  // Add plugin browse panel state
  const [showAddPlugin, setShowAddPlugin] = useState(false);

  // Filter plugins belonging to this gateway
  const gatewayPlugins = plugins.filter((p) => p.gatewayId === gateway.id);
  const otherPlugins = plugins.filter((p) => !p.gatewayId || p.gatewayId !== gateway.id);
  const installedSlugs = new Set(gatewayPlugins.map((p) => p.pluginSlug));

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
          toast.success("Plugin configuration saved");
          setConfiguringPlugin(null);
          onRefresh();
        } else {
          toast.error(result.error?.message ?? "Failed to save configuration");
        }
      } catch {
        toast.error("Failed to save configuration");
      } finally {
        setIsSavingConfig(false);
      }
    },
    [configuringPlugin, token, onRefresh]
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
          toast.success(`Step "${plugin.name}" added`);
          await fetchWorkflow();
        } else {
          toast.error("Failed to add step");
        }
      } catch {
        toast.error("Failed to add step");
      }
    },
    [workflow, insertAtOrder, organizationId, token, fetchWorkflow]
  );

  const handleMoveStep = useCallback(
    async (stepId: string, newOrder: number) => {
      if (!workflow) return;
      try {
        const result = await updateWorkflowStep(
          workflow.id,
          stepId,
          { order: newOrder },
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          await fetchWorkflow();
        } else {
          toast.error("Failed to reorder step");
        }
      } catch {
        toast.error("Failed to reorder step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow]
  );

  const handleDeleteStep = useCallback(
    async (stepId: string) => {
      if (!workflow) return;
      try {
        const result = await deleteWorkflowStep(
          workflow.id,
          stepId,
          { organizationId },
          token ?? undefined
        );
        if (result.success) {
          if (selectedStepId === stepId) setSelectedStepId(null);
          toast.success("Step removed");
          await fetchWorkflow();
        } else {
          toast.error("Failed to remove step");
        }
      } catch {
        toast.error("Failed to remove step");
      }
    },
    [workflow, selectedStepId, organizationId, token, fetchWorkflow]
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
          toast.success("Step saved");
          await fetchWorkflow();
        } else {
          toast.error("Failed to save step");
        }
      } catch {
        toast.error("Failed to save step");
      }
    },
    [workflow, organizationId, token, fetchWorkflow]
  );

  const handleSelectStep = useCallback((step: WorkflowStepItem) => {
    setSelectedStepId(step.id);
    setShowTriggerEditor(false);
  }, []);

  const handleDropPlugin = useCallback(
    async (pluginId: string, pluginName: string, afterOrder: number) => {
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
              <Badge
                variant={mode === "workflow" ? "default" : "outline"}
                className="text-xs"
              >
                {mode === "workflow" ? "Workflow Mode" : "Plugin Mode"}
              </Badge>
              <span className="text-sm text-muted-foreground">{typeLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content based on mode */}
      {mode === "plugin" ? (
        /* Plugin mode — show installed plugins */
        <div className="space-y-4">
          {/* Gateway plugins */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Plugins on this bot
              <span className="text-muted-foreground font-normal ml-1.5">
                ({gatewayPlugins.length})
              </span>
            </h3>
            {gatewayPlugins.length === 0 ? (
              <Card className="border-border bg-card/50 border-dashed">
                <CardContent className="py-6">
                  <div className="text-center mb-4">
                    <Plug className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No plugins installed yet — add one to get started!
                    </p>
                  </div>
                  <AddPluginPanel
                    gatewayId={gateway.id}
                    gatewayType={gateway.type}
                    installedSlugs={installedSlugs}
                    token={token}
                    organizationId={organizationId}
                    onClose={() => {}}
                    onInstalled={onRefresh}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {gatewayPlugins.map((p) => (
                  <Card key={p.id} className="border-border bg-card/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-lg">
                            {p.pluginIcon ?? "🔌"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {p.pluginName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.pluginDescription || p.pluginCategory}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {p.lastError ? (
                            p.processStatus === "running" ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] gap-1 text-amber-400 border-amber-500/30"
                                title={`Auto-recovered from: ${p.lastError}`}
                              >
                                <Check className="h-3 w-3" /> Auto-recovered
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
                ))}
              </div>
            )}
          </div>

          {/* Other plugins (not connected to this gateway) */}
          {otherPlugins.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                Other installed plugins
                <span className="font-normal ml-1.5">({otherPlugins.length})</span>
              </h3>
              <div className="grid gap-2">
                {otherPlugins.map((p) => (
                  <Card key={p.id} className="border-border bg-card/30 opacity-70">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0 text-sm">
                          {p.pluginIcon ?? "🔌"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {p.pluginName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.gatewayName ? `Connected to ${p.gatewayName}` : "Not connected"}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                          {p.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          {/* Add Plugin button + browse panel */}
          {gatewayPlugins.length > 0 && !showAddPlugin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-dashed w-full"
              onClick={() => setShowAddPlugin(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Add Plugin
            </Button>
          )}

          {showAddPlugin && gatewayPlugins.length > 0 ? (
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <AddPluginPanel
                  gatewayId={gateway.id}
                  gatewayType={gateway.type}
                  installedSlugs={installedSlugs}
                  token={token}
                  organizationId={organizationId}
                  onClose={() => setShowAddPlugin(false)}
                  onInstalled={() => { setShowAddPlugin(false); onRefresh(); }}
                />
              </CardContent>
            </Card>
          ) : null}

          {/* Advanced: Build Workflow (B8) */}
          <Card className="border-border bg-muted/30 border-dashed">
            <CardContent className="p-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Advanced:</span>{" "}
                Chain multiple plugins into an automation pipeline with the workflow builder.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs shrink-0 gap-1.5"
                onClick={handleToggleMode}
              >
                <Workflow className="h-3.5 w-3.5" /> Build Workflow
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : isLoadingWorkflow ? (
        <Card className="border-border bg-card/50">
          <CardContent className="py-10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : workflow ? (
        <>
          {/* Back to simple plugins (B8) */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
            onClick={handleToggleMode}
          >
            <Plug className="h-3.5 w-3.5" /> ← Back to simple plugins
          </Button>

          {/* Workflow status bar */}
          <Card className="border-border bg-card/80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Workflow className="h-5 w-5 text-emerald-500" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {workflow.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
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

                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHelp((v) => !v)}
                    className="h-7 w-7 p-0"
                    title="How workflows work"
                  >
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
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

          {/* Data flow explanation / Guided tour (F2) */}
          {(workflow.steps.length === 0 || showHelp) ? (
            <GuidedTour
              isFirstTime={workflow.steps.length === 0 && workflow.executionCount === 0}
              onDismiss={workflow.steps.length > 0 ? () => setShowHelp(false) : undefined}
            />
          ) : null}

          {/* Workflow Builder */}
          <div className="flex gap-4">
            {/* Collapsible plugin sidebar */}
            <div className={`shrink-0 transition-all duration-200 ${showPluginSidebar ? "w-56" : "w-0 overflow-hidden"}`}>
              {showPluginSidebar ? (
                <Card className="border-border bg-card/50 h-[500px] overflow-hidden">
                  <WorkflowPluginSidebar
                    gatewayType={gateway.type}
                    token={token}
                  />
                </Card>
              ) : null}
            </div>

            {/* Canvas + Editor */}
            <div className="flex-1 min-w-0">
              <div className="flex gap-4">
                {/* Canvas — takes available space */}
                <div className="flex-1 min-w-0 relative">
                  {/* Sidebar toggle + View toggle buttons */}
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className={`gap-1.5 text-xs h-7 bg-background/80 backdrop-blur-sm ${
                        !showPluginSidebar && workflow.steps.length === 0 ? "animate-pulse border-emerald-500 text-emerald-500" : ""
                      }`}
                      onClick={() => setShowPluginSidebar(!showPluginSidebar)}
                      title={!showPluginSidebar ? "Drag plugins here to add steps" : undefined}
                    >
                      {showPluginSidebar ? (
                        <><PanelLeftClose className="h-3.5 w-3.5" /> Hide Plugins</>
                      ) : (
                        <><PanelLeftOpen className="h-3.5 w-3.5" /> Plugins</>
                      )}
                    </Button>
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
                  </div>

                  {viewMode === "canvas" ? (
                    <WorkflowCanvas
                    steps={workflow.steps}
                    selectedStepId={selectedStepId}
                    triggerType={workflow.triggerType}
                    triggerConfig={workflow.triggerConfig}
                    onSelectStep={handleSelectStep}
                    onAddStep={handleAddStep}
                    onDeleteStep={handleDeleteStep}
                    onMoveStep={handleMoveStep}
                    onDropPlugin={handleDropPlugin}
                    onDuplicateStep={handleDuplicateStep}
                    onClickTrigger={handleClickTrigger}
                  />
                  ) : (
                    /* C3: Compact list view */
                    <div className="rounded-lg border border-border bg-background/50 p-4 space-y-2" style={{ minHeight: 400 }}>
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
                              step.id === selectedStepId
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-border hover:border-emerald-500/40 hover:bg-muted/50"
                            }`}
                            onClick={() => handleSelectStep(step)}
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0 font-bold">{idx + 1}</Badge>
                              <span className="text-sm font-medium text-foreground truncate">{step.name || step.pluginName || step.pluginSlug}</span>
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

                {/* Step editor — slides in when a step is selected */}
                {selectedStep ? (
                  <div className="w-80 shrink-0">
                    <WorkflowStepEditor
                      key={selectedStep.id}
                      step={selectedStep}
                      configSchema={stepConfigSchema}
                      onSave={handleSaveStep}
                      onClose={() => setSelectedStepId(null)}
                      previousSteps={workflow?.steps
                        .filter((s) => s.order < selectedStep.order)
                        .sort((a, b) => a.order - b.order)}
                    />
                  </div>
                ) : showTriggerEditor && workflow ? (
                  <div className="w-80 shrink-0">
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
            </div>
          </div>

          {/* Run History */}
          <WorkflowRunHistory
            workflowId={workflow.id}
            token={token}
            organizationId={organizationId}
            onRetry={handleRetryWorkflow}
          />
        </>
      ) : (
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
      )}

      {/* Add Step Dialog */}
      <AddStepDialog
        open={showAddStep}
        onClose={() => setShowAddStep(false)}
        onSelect={handlePluginSelected}
        gatewayType={gateway.type}
        token={token}
      />

      {/* Mode Switch Confirmation Dialog */}
      <AlertDialog open={showModeConfirm} onOpenChange={setShowModeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch to {mode === "plugin" ? "Workflow" : "Plugin"} Mode?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {mode === "plugin" ? (
                  <>
                    <p>
                      <span className="font-medium text-foreground">What changes:</span> Incoming messages will flow through your workflow steps instead of going directly to plugins.
                    </p>
                    <p>Your standalone plugins will stop receiving messages until you switch back.</p>
                    <p className="text-[11px]">
                      <span className="font-medium text-foreground">Tip:</span> Make sure you have at least one step in your workflow before activating it.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <span className="font-medium text-foreground">What changes:</span> Incoming messages will go directly to your installed plugins instead of flowing through the workflow.
                    </p>
                    <p>Your workflow will stop processing messages until you switch back. No data will be lost.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmModeSwitch}>
              Switch to {mode === "plugin" ? "Workflow" : "Plugin"} Mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
