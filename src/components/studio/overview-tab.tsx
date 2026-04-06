"use client";

/**
 * OverviewTab — Bot overview dashboard within the Studio.
 *
 * Shows: bot status summary, quick stats, recent activity,
 * and navigation shortcuts to other tabs.
 *
 * @module components/studio/overview-tab
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { GatewayOption, WorkflowListItem } from "@/lib/api-client";
import type { UserPlugin } from "@/shared/types/plugin";

import {
    Activity,
    ArrowRight,
    Plug,
    Wifi,
    WifiOff,
    Workflow,
    Zap,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface OverviewTabProps {
  gateway: GatewayOption;
  workflow: WorkflowListItem | null;
  plugins: UserPlugin[];
  isLoadingWorkflow: boolean;
  statusInfo: { label: string; variant: "default" | "secondary" | "destructive" | "outline"; tooltip: string };
  onSwitchTab: (tab: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function OverviewTab({
  gateway,
  workflow,
  plugins,
  isLoadingWorkflow: _isLoadingWorkflow,
  statusInfo,
  onSwitchTab,
}: OverviewTabProps) {
  const isConnected = gateway.status === "CONNECTED";
  const enabledPlugins = plugins.filter((p) => p.isEnabled);
  const stepCount = workflow?.steps?.length ?? 0;
  const executionCount = workflow?.executionCount ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-emerald-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">Status</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {isConnected ? "Online" : "Offline"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Plug className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Plugins</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {enabledPlugins.length}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / {plugins.length}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Workflow className="h-4 w-4 text-sky-500" />
              <span className="text-xs text-muted-foreground">Steps</span>
            </div>
            <p className="text-lg font-bold text-foreground">{stepCount}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Runs</span>
            </div>
            <p className="text-lg font-bold text-foreground">{executionCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Summary */}
      {workflow ? (
        <Card className="bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Workflow className="h-4 w-4 text-emerald-500" />
              Workflow
              <Badge variant={statusInfo.variant} className="text-[10px] ml-2">
                {statusInfo.label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Step pipeline preview */}
            {stepCount > 0 ? (
              <div className="flex items-center gap-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Zap className="h-3 w-3 text-emerald-500" />
                  Trigger
                </Badge>
                {workflow.steps
                  .sort((a, b) => a.order - b.order)
                  .slice(0, 6)
                  .map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-1">
                      <span className="text-muted-foreground/40">→</span>
                      <Badge
                        variant={step.isEnabled === false ? "outline" : "secondary"}
                        className={`text-[10px] ${step.isEnabled === false ? "opacity-50 border-dashed" : ""}`}
                      >
                        {step.name || step.pluginSlug || `Step ${idx + 1}`}
                      </Badge>
                    </div>
                  ))}
                {stepCount > 6 && (
                  <span className="text-xs text-muted-foreground">+{stepCount - 6} more</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No steps configured yet. Add plugins to build your workflow.
              </p>
            )}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onSwitchTab("workflow")}
            >
              Open Workflow Editor <ArrowRight className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Installed Plugins Summary */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plug className="h-4 w-4 text-purple-500" />
            Plugins
            <span className="text-muted-foreground font-normal">({plugins.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {plugins.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {plugins.slice(0, 8).map((p) => (
                  <Badge
                    key={p.id}
                    variant={p.isEnabled ? "secondary" : "outline"}
                    className={`text-[10px] ${!p.isEnabled ? "opacity-50" : ""}`}
                  >
                    {p.pluginName}
                    {!p.isEnabled && " (off)"}
                  </Badge>
                ))}
                {plugins.length > 8 && (
                  <span className="text-xs text-muted-foreground">+{plugins.length - 8} more</span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => onSwitchTab("workflow")}
              >
                Manage Plugins <ArrowRight className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                No plugins installed yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => onSwitchTab("workflow")}
              >
                Add Plugins <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-500" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onSwitchTab("workflow")}
            >
              <Workflow className="h-3 w-3" /> Edit Workflow
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onSwitchTab("workflow")}
            >
              <Plug className="h-3 w-3" /> Add Plugin
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onSwitchTab("settings")}
            >
              Bot Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
