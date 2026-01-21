"use client";

/**
 * My Plugins Page
 *
 * Displays the user's installed plugins with enable/disable toggle,
 * configuration options, and uninstall functionality.
 *
 * @module app/dashboard/my-plugins
 */

import { useCallback, useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ===========================================
// Types
// ===========================================

interface UserPlugin {
  id: string;
  pluginId: string;
  pluginSlug: string;
  pluginName: string;
  pluginDescription: string;
  pluginIcon: string | null;
  pluginCategory: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  gatewayId: string | null;
  executionCount: number;
  lastExecutedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConfigSchema {
  type?: string;
  properties?: Record<string, ConfigSchemaProperty>;
  required?: string[];
}

interface ConfigSchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

// ===========================================
// Icon Component
// ===========================================

function PluginIcon({ icon }: { icon: string | null; name: string }) {
  const iconMap: Record<string, string> = {
    "chart-bar": "📊",
    analytics: "📈",
    message: "💬",
    automation: "⚙️",
    moderation: "🛡️",
    utilities: "🔧",
  };

  const emoji = icon ? iconMap[icon] || "🔌" : "🔌";

  return (
    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl">
      {emoji}
    </div>
  );
}

// ===========================================
// Config Modal Component
// ===========================================

interface ConfigModalProps {
  plugin: UserPlugin;
  onClose: () => void;
  onSave: (config: Record<string, unknown>) => void;
  isSaving: boolean;
}

function ConfigModal({ plugin, onClose, onSave, isSaving }: ConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(plugin.config);
  // Config schema would need to be fetched from the plugin details endpoint if needed
  const schema: ConfigSchema = { properties: {} };

  const handleChange = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(config);
  };

  const renderField = (key: string, prop: ConfigSchemaProperty) => {
    const value = config[key] ?? prop.default;

    if (prop.type === "boolean") {
      return (
        <div key={key} className="flex items-center gap-3">
          <Checkbox
            id={key}
            checked={Boolean(value)}
            onCheckedChange={(checked) => handleChange(key, checked)}
          />
          <Label htmlFor={key} className="text-foreground cursor-pointer">
            {key}
          </Label>
          {prop.description ? (
            <span className="text-xs text-muted-foreground">{prop.description}</span>
          ) : null}
        </div>
      );
    }

    if (prop.type === "number") {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="text-foreground">
            {key}
          </Label>
          <Input
            id={key}
            type="number"
            value={String(value ?? "")}
            onChange={(e) => handleChange(key, Number(e.target.value))}
            min={prop.minimum}
            max={prop.maximum}
            className="bg-muted border-border text-foreground"
          />
          {prop.description ? (
            <p className="text-xs text-muted-foreground">{prop.description}</p>
          ) : null}
        </div>
      );
    }

    // Default: string input
    return (
      <div key={key} className="space-y-2">
        <Label htmlFor={key} className="text-foreground">
          {key}
        </Label>
        <Input
          id={key}
          type="text"
          value={String(value ?? "")}
          onChange={(e) => handleChange(key, e.target.value)}
          className="bg-muted border-border text-foreground"
        />
        {prop.description ? (
          <p className="text-xs text-muted-foreground">{prop.description}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            Configure {plugin.pluginName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Update plugin settings
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {schema.properties && Object.keys(schema.properties).length > 0 ? (
              Object.entries(schema.properties).map(([key, prop]) =>
                renderField(key, prop)
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                This plugin has no configurable options.
              </p>
            )}
          </div>
          <div className="p-6 border-t border-border flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-border text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===========================================
// Plugin Card Component
// ===========================================

interface PluginCardProps {
  plugin: UserPlugin;
  onToggle: (id: string, enabled: boolean) => void;
  onConfigure: (plugin: UserPlugin) => void;
  onUninstall: (id: string) => void;
  isUpdating: boolean;
}

function PluginCard({ plugin, onToggle, onConfigure, onUninstall, isUpdating }: PluginCardProps) {
  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <PluginIcon icon={plugin.pluginIcon} name={plugin.pluginName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-foreground text-lg">{plugin.pluginName}</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground mt-1">
              {plugin.pluginDescription}
            </CardDescription>
          </div>
          {/* Enable/Disable Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {plugin.isEnabled ? "Enabled" : "Disabled"}
            </span>
            <button
              onClick={() => onToggle(plugin.id, !plugin.isEnabled)}
              disabled={isUpdating}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                plugin.isEnabled ? "bg-emerald-600" : "bg-muted"
              } ${isUpdating ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  plugin.isEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm">
          <div className="text-muted-foreground">
            <span className="text-foreground font-medium">{plugin.executionCount}</span> executions
          </div>
          {plugin.lastExecutedAt ? (
            <div className="text-muted-foreground">
              Last run:{" "}
              <span className="text-muted-foreground">
                {new Date(plugin.lastExecutedAt).toLocaleDateString()}
              </span>
            </div>
          ) : (
            <div className="text-muted-foreground">Never executed</div>
          )}
        </div>

        {/* Error message */}
        {plugin.lastError ? (
          <div className="p-2 rounded bg-red-900/20 border border-red-900/50 text-red-400 text-sm">
            <span className="font-medium">Last error:</span> {plugin.lastError}
          </div>
        ) : null}

        {/* Category badge */}
        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
            {plugin.pluginCategory}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfigure(plugin)}
            disabled={isUpdating}
            className="flex-1 border-border text-foreground hover:bg-muted"
          >
            Configure
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUninstall(plugin.id)}
            disabled={isUpdating}
            className="border-red-900/50 text-red-400 hover:bg-red-900/20"
          >
            Uninstall
          </Button>
        </div>

        {/* Install date */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{plugin.pluginCategory}</span>
          <span>Installed {new Date(plugin.createdAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Main Page Content
// ===========================================

function MyPluginsContent() {
  const { token } = useAuth();
  const [plugins, setPlugins] = useState<UserPlugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [configuringPlugin, setConfiguringPlugin] = useState<UserPlugin | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Fetch user's installed plugins
  // Using URL-based routes (Phase 6.7) - /api/user/plugins for personal plugins
  const fetchPlugins = useCallback(async () => {
    try {
      const response = await fetch("/api/user/plugins", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch plugins");
      }

      const result = await response.json();
      setPlugins(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plugins");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Toggle plugin enabled state
  const handleToggle = async (id: string, enabled: boolean) => {
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/plugins/user/plugins/${id}/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      })

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to update plugin");
      }

      // Update local state
      setPlugins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plugin");
    } finally {
      setUpdatingId(null);
    }
  };

  // Save plugin configuration
  const handleSaveConfig = async (config: Record<string, unknown>) => {
    if (!configuringPlugin) return;

    setIsSavingConfig(true);
    try {
      const response = await fetch(`/api/plugins/user/plugins/${configuringPlugin.id}/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ config }),
      })

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to save config");
      }

      // Update local state
      setPlugins((prev) =>
        prev.map((p) =>
          p.id === configuringPlugin.id ? { ...p, config } : p
        )
      );
      setConfiguringPlugin(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Uninstall plugin
  const handleUninstall = async (id: string) => {
    if (!confirm("Are you sure you want to uninstall this plugin?")) return;

    setUpdatingId(id);
    try {
      const response = await fetch(`/api/plugins/user/plugins/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to uninstall plugin");
      }

      // Remove from local state
      setPlugins((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to uninstall plugin");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Plugins</h1>
            <p className="text-muted-foreground mt-1">
              Manage your installed plugins and configurations
            </p>
          </div>
          <Button
            onClick={() => window.location.href = "/dashboard/plugins"}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Browse Plugins
          </Button>
        </div>

        {/* Error message */}
        {error ? (
          <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/50 text-red-400">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Plugin list */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i} className="border-border bg-card/50 animate-pulse">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 bg-muted rounded w-1/3" />
                      <div className="h-4 bg-muted rounded w-2/3" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : plugins.length === 0 ? (
          <Card className="border-border bg-card/50">
            <CardContent className="py-12 text-center">
              <div className="text-4xl mb-4">🔌</div>
              <p className="text-muted-foreground mb-4">You haven&apos;t installed any plugins yet</p>
              <Button
                onClick={() => window.location.href = "/dashboard/plugins"}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Browse Available Plugins
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {plugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onToggle={handleToggle}
                onConfigure={setConfiguringPlugin}
                onUninstall={handleUninstall}
                isUpdating={updatingId === plugin.id}
              />
            ))}
          </div>
        )}

        {/* Stats */}
        {plugins.length > 0 ? (
          <div className="text-center text-sm text-muted-foreground">
            {plugins.length} plugin{plugins.length !== 1 ? "s" : ""} installed
            {" • "}
            {plugins.filter((p) => p.isEnabled).length} enabled
          </div>
        ) : null}
      </div>

      {/* Config Modal */}
      {configuringPlugin ? (
        <ConfigModal
          plugin={configuringPlugin}
          onClose={() => setConfiguringPlugin(null)}
          onSave={handleSaveConfig}
          isSaving={isSavingConfig}
        />
      ) : null}
    </div>
  );
}

// ===========================================
// Page Export
// ===========================================

export default function MyPluginsPage() {
  return (
    <ProtectedRoute>
      <MyPluginsContent />
    </ProtectedRoute>
  );
}
