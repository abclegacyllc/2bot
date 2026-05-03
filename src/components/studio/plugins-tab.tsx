"use client";

/**
 * PluginsTab — Plugin management within the Studio.
 *
 * Shows installed plugins for this bot with enable/disable, configure,
 * and uninstall actions. Add Plugin sheet opens from here.
 *
 * @module components/studio/plugins-tab
 */

import { AddPluginPanel } from "@/components/bot-studio/add-plugin-panel";
import { ConfigModal } from "@/components/plugins/config-modal";
import { PluginIcon } from "@/components/plugins/plugin-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

import type { GatewayOption, WorkflowListItem } from "@/lib/api-client";
import { updateInstalledPlugin as apiUpdateInstalledPlugin } from "@/lib/api-client";
import type { UserPlugin } from "@/shared/types/plugin";

import {
    AlertCircle,
    ArrowUpCircle,
    Check,
    Loader2,
    Plug,
    Plus,
    RefreshCw,
    Settings,
    Trash2,
} from "lucide-react";

import { useState } from "react";

// =============================================================================
// Types
// =============================================================================

interface PluginsTabProps {
  gateway: GatewayOption;
  plugins: UserPlugin[];
  workflow: WorkflowListItem | null;
  installedSlugs: Set<string>;
  showAddPlugin: boolean;
  configuringPlugin: UserPlugin | null;
  isSavingConfig: boolean;
  togglingPluginId: string | null;
  uninstallingPluginId: string | null;
  token: string | null;
  organizationId?: string;

  onTogglePlugin: (userPluginId: string, checked: boolean) => void;
  onUninstallPlugin: (userPluginId: string, pluginName: string) => void;
  onConfigurePlugin: (plugin: UserPlugin) => void;
  onSavePluginConfig: (config: Record<string, unknown>) => void;
  onCloseConfig: () => void;
  onShowAddPlugin: () => void;
  onCloseAddPlugin: () => void;
  onPluginInstalled: (info?: { pluginId: string; pluginName: string }) => void;
}

// =============================================================================
// Component
// =============================================================================

export function PluginsTab({
  gateway,
  plugins,
  workflow,
  installedSlugs,
  showAddPlugin,
  configuringPlugin,
  isSavingConfig,
  togglingPluginId,
  uninstallingPluginId,
  token,
  organizationId,

  onTogglePlugin,
  onUninstallPlugin,
  onConfigurePlugin,
  onSavePluginConfig,
  onCloseConfig,
  onShowAddPlugin,
  onCloseAddPlugin,
  onPluginInstalled,
}: PluginsTabProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function handleUpdate(userPluginId: string) {
    if (!token) return;
    setUpdatingId(userPluginId);
    try {
      await apiUpdateInstalledPlugin(userPluginId, token);
      // Optimistically trigger parent refresh via the installed callback
      // (studio layout polls every 30s, but bump now for snappy UX).
      onPluginInstalled();
    } catch (err) {
      console.error("Failed to update plugin", err);
    } finally {
      setUpdatingId(null);
    }
  }

  // Sort plugins by their workflow step order
  const sortedPlugins = [...plugins]
    .map((p) => {
      const step = workflow?.steps.find((s) => s.pluginId === p.pluginId);
      return { plugin: p, order: step?.order ?? 999, step };
    })
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Installed Plugins
            <span className="text-muted-foreground font-normal ml-1.5">
              ({plugins.length})
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plugins are automatically added as workflow steps when installed.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={onShowAddPlugin}
        >
          <Plus className="h-3.5 w-3.5" /> Add Plugin
        </Button>
      </div>

      {/* Plugin List */}
      {plugins.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10">
            <div className="text-center">
              <Plug className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                No plugins installed yet — add one to get started!
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onShowAddPlugin}
              >
                <Plus className="h-3.5 w-3.5" /> Browse Plugins
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedPlugins.map(({ plugin: p, step }, idx) => (
            <Card key={p.id} className={`bg-card/60 ${p.isEnabled === false ? "opacity-60" : ""}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  {/* Left: icon + info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0 font-bold tabular-nums">
                      {idx + 1}
                    </Badge>
                    <PluginIcon icon={p.pluginIcon} name={p.pluginName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {p.pluginName}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {p.pluginDescription || p.pluginCategory}
                      </p>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {p.needsRestore ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] gap-1 text-orange-400 border-orange-500/40 cursor-default"
                        title="Container was wiped — reinstall this plugin from the Marketplace to restore it"
                      >
                        <RefreshCw className="h-3 w-3" /> Reinstall needed
                      </Badge>
                    ) : null}
                    {p.needsUpdate ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 text-sky-400 border-sky-500/40 hover:bg-sky-500/10"
                        onClick={() => handleUpdate(p.id)}
                        disabled={updatingId === p.id}
                        title={
                          p.installedVersion
                            ? `Installed v${p.installedVersion} — new version available`
                            : "A new version is available"
                        }
                      >
                        {updatingId === p.id ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Updating...</>
                        ) : (
                          <><ArrowUpCircle className="h-3 w-3" /> Update</>
                        )}
                      </Button>
                    ) : null}
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
                    {p.executionCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {p.executionCount} run{p.executionCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => onConfigurePlugin(p)}
                    >
                      <Settings className="h-3 w-3" /> Configure
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      onClick={() => onUninstallPlugin(p.id, p.pluginName)}
                      disabled={uninstallingPluginId === p.id}
                    >
                      {uninstallingPluginId === p.id ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Removing...</>
                      ) : (
                        <><Trash2 className="h-3 w-3" /> Remove</>
                      )}
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {p.isEnabled ? "On" : "Off"}
                      </span>
                      <Switch
                        checked={p.isEnabled}
                        onCheckedChange={(checked) => onTogglePlugin(p.id, checked)}
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

      {/* Add Plugin Sheet */}
      <Sheet open={showAddPlugin} onOpenChange={(open) => !open && onCloseAddPlugin()}>
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
              onClose={onCloseAddPlugin}
              onInstalled={onPluginInstalled}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Plugin Config Modal */}
      {configuringPlugin ? (
        <ConfigModal
          plugin={configuringPlugin}
          onClose={onCloseConfig}
          onSave={onSavePluginConfig}
          isSaving={isSavingConfig}
          token={token ?? undefined}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}
