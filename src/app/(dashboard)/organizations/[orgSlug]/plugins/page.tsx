"use client";

/**
 * Organization Installed Plugins Page
 *
 * Displays the organization's installed plugins with enable/disable toggle,
 * configuration options, and uninstall functionality.
 *
 * @module app/(dashboard)/organizations/[orgSlug]/plugins
 */

import { useCallback, useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { ConfigModal } from "@/components/plugins/config-modal";
import { PluginIcon } from "@/components/plugins/plugin-icon";
import { useAuth } from "@/components/providers/auth-provider";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { useOrganization } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import type { UserPlugin } from "@/shared/types/plugin";
import { ExternalLink, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ===========================================
// Update Plugin Dialog
// ===========================================

interface UpdatePluginDialogProps {
  plugin: UserPlugin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  onUpdated: () => void;
}

function UpdatePluginDialog({ plugin, open, onOpenChange, token, onUpdated }: UpdatePluginDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form when plugin changes
  useEffect(() => {
    if (plugin) {
      setName(plugin.pluginName);
      setDescription(plugin.pluginDescription);
      setCategory(plugin.pluginCategory || "general");
      setError(null);
    }
  }, [plugin]);

  const handleSave = async () => {
    if (!plugin || !token) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/plugins/custom/${plugin.pluginId}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          category: category || undefined,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to update plugin");
      }
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plugin");
    } finally {
      setSaving(false);
    }
  };

  const categories = ["general", "analytics", "messaging", "automation", "moderation", "utilities"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Update Plugin</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Update the metadata for <strong>{plugin?.pluginName}</strong>. This changes the name, description, and category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error ? (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-900/50 text-red-400 text-sm">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Plugin name"
              className="bg-background border-border text-foreground"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this plugin do?"
              className="bg-background border-border text-foreground min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Category</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  type="button"
                  variant={category === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory(cat)}
                  className={
                    category === cat
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "border-border text-foreground hover:bg-muted"
                  }
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  onUpdatePlugin: (plugin: UserPlugin) => void;
  onViewSource: (plugin: UserPlugin) => void;
  isUpdating: boolean;
  canManagePlugins: boolean;
}

function PluginCard({ plugin, onToggle, onConfigure, onUninstall, onUpdatePlugin, onViewSource, isUpdating, canManagePlugins }: PluginCardProps) {
  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <PluginIcon icon={plugin.pluginIcon} name={plugin.pluginName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-foreground text-lg">{plugin.pluginName}</CardTitle>
              {plugin.authorType === "USER" ? (
                <span className="px-2 py-0.5 rounded text-xs bg-purple-900/50 text-purple-300">
                  Custom
                </span>
              ) : null}
              {(plugin.entryFile?.split('/').length ?? 0) > 2 ? (
                <span className="px-2 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300">
                  📁 Multi-file
                </span>
              ) : null}
            </div>
            <CardDescription className="text-muted-foreground mt-1">
              {plugin.pluginDescription}
            </CardDescription>
          </div>
          {/* Enable/Disable Toggle */}
          {canManagePlugins ? <div className="flex items-center gap-2">
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
              {isUpdating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-muted-foreground" />
              ) : (
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    plugin.isEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              )}
            </button>
          </div> : null}
          {!canManagePlugins && (
            <span className="text-xs text-muted-foreground">
              {plugin.isEnabled ? "Enabled" : "Disabled"}
            </span>
          )}
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
        {canManagePlugins ? <div className="flex gap-2 pt-2">
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
              onClick={() => onUpdatePlugin(plugin)}
              disabled={isUpdating}
              className="border-purple-900/50 text-purple-400 hover:bg-purple-900/20"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Update Plugin
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewSource(plugin)}
              disabled={isUpdating}
              className="border-blue-900/50 text-blue-400 hover:bg-blue-900/20"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Source
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
          </div> : null}

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
  const { orgId, orgSlug, orgName, isFound, isLoading: orgLoading } = useOrganization();
  const { can } = useOrgPermissions();
  const router = useRouter();
  const [plugins, setPlugins] = useState<UserPlugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [configuringPlugin, setConfiguringPlugin] = useState<UserPlugin | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [uninstallId, setUninstallId] = useState<string | null>(null);
  const [updatePlugin, setUpdatePlugin] = useState<UserPlugin | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Permission checks
  const canConfigurePlugins = can("org:plugins:configure");
  const canUninstallPlugins = can("org:plugins:uninstall");
  const canManagePlugins = canConfigurePlugins || canUninstallPlugins;

  // Fetch org's installed plugins
  const fetchPlugins = useCallback(async () => {
    if (!orgId) return;
    
    try {
      const response = await fetch(apiUrl(`/orgs/${orgId}/plugins`), {
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
  }, [token, orgId]);

  useEffect(() => {
    if (isFound && orgId) {
      fetchPlugins();
    }
  }, [isFound, orgId, fetchPlugins]);

  // Toggle plugin enabled state
  const handleToggle = async (id: string, enabled: boolean) => {
    if (!orgId) return;
    
    setUpdatingId(id);
    try {
      const response = await fetch(apiUrl(`/orgs/${orgId}/plugins/${id}/toggle`), {
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
    if (!configuringPlugin || !orgId) return;

    setIsSavingConfig(true);
    try {
      const response = await fetch(apiUrl(`/orgs/${orgId}/plugins/${configuringPlugin.id}/config`), {
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
    setUninstallId(null);
    if (!orgId) return;

    setUpdatingId(id);
    try {
      const response = await fetch(apiUrl(`/orgs/${orgId}/plugins/${id}`), {
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

  // Org loading state
  if (orgLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  // Org not found
  if (!isFound || !orgId) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Card className="max-w-md mx-auto border-border bg-card/50">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">Organization not found</h3>
            <p className="text-muted-foreground mb-4">
              The organization you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
            </p>
            <Link href="/">
              <Button variant="outline" className="border-border">
                ← Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{orgName ? `${orgName} - ` : ""}Installed Plugins</h1>
            <p className="text-muted-foreground mt-1">
              Manage installed plugins and configurations
            </p>
          </div>
          <Button
            onClick={() => router.push("/plugins")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Browse Plugins
          </Button>
        </div>

        {/* Search & Filters */}
        {plugins.length > 0 ? (
          <div className="space-y-3">
            <Input
              placeholder="Search installed plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-muted border-border text-foreground max-w-sm"
            />
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
                className={selectedCategory === null ? "bg-muted" : "border-border text-foreground hover:bg-muted"}
              >
                All
              </Button>
              {["analytics", "messaging", "automation", "moderation", "utilities", "general"].map((cat) => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                  className={selectedCategory === cat ? "bg-muted" : "border-border text-foreground hover:bg-muted"}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

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
                onClick={() => router.push("/plugins")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Browse Available Plugins
              </Button>
            </CardContent>
          </Card>
        ) : (() => {
          const query = searchQuery.toLowerCase().trim();
          const filtered = plugins.filter((p) => {
            if (selectedCategory && p.pluginCategory !== selectedCategory) return false;
            if (query) {
              return (
                p.pluginName.toLowerCase().includes(query) ||
                p.pluginDescription.toLowerCase().includes(query) ||
                p.pluginSlug.toLowerCase().includes(query)
              );
            }
            return true;
          });
          return filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No plugins match your search</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-border text-foreground"
                onClick={() => { setSearchQuery(""); setSelectedCategory(null); }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  onToggle={handleToggle}
                  onConfigure={setConfiguringPlugin}
                  onUninstall={(id) => setUninstallId(id)}
                  onUpdatePlugin={setUpdatePlugin}
                  onViewSource={(p) => router.push(`/organizations/${orgSlug}/workspace?focus=${p.entryFile || `plugins/${p.pluginSlug}.js`}`)}
                  isUpdating={updatingId === plugin.id}
                  canManagePlugins={canManagePlugins}
                />
              ))}
            </div>
          );
        })()}

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
          token={token || undefined}
          organizationId={orgId}
        />
      ) : null}

      {/* Update Plugin Dialog */}
      <UpdatePluginDialog
        plugin={updatePlugin}
        open={!!updatePlugin}
        onOpenChange={(open) => { if (!open) setUpdatePlugin(null); }}
        token={token}
        onUpdated={fetchPlugins}
      />

      {/* Uninstall Confirmation Dialog */}
      <AlertDialog open={!!uninstallId} onOpenChange={(open) => { if (!open) setUninstallId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall Plugin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to uninstall this plugin? This will remove all configuration and data associated with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => uninstallId && handleUninstall(uninstallId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
