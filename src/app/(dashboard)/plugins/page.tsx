"use client";

/**
 * Available Plugins Page
 *
 * Displays the plugin catalog with install/uninstall actions.
 * Users can browse, search, and install plugins from this page.
 *
 * @module app/(dashboard)/plugins
 */

import { useCallback, useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
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
import { apiUrl } from "@/shared/config/urls";
import { ExternalLink, Loader2, Pencil } from "lucide-react";

import type { InstalledPlugin, PluginListItem } from "@/shared/types/plugin";

import { PluginIcon } from "@/components/plugins/plugin-icon";
import { useRouter } from "next/navigation";

// ===========================================
// Update Plugin Dialog
// ===========================================

interface UpdatePluginDialogProps {
  plugin: PluginListItem | null;
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
      setName(plugin.name);
      setDescription(plugin.description);
      setCategory(plugin.category || "general");
      setError(null);
    }
  }, [plugin]);

  const handleSave = async () => {
    if (!plugin || !token) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/plugins/custom/${plugin.id}`), {
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
            Update the metadata for <strong>{plugin?.name}</strong>. This changes the name, description, and category shown in the plugin catalog.
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
  plugin: PluginListItem;
  isInstalled: boolean;
  isInstalling: boolean;
  onUninstall: (slug: string) => void;
  onUpdate: (plugin: PluginListItem) => void;
}

function PluginCard({ plugin, isInstalled, isInstalling, onUninstall, onUpdate }: PluginCardProps) {
  const router = useRouter();

  return (
    <Card className="border-border bg-card/50 hover:bg-card/70 transition-colors" data-ai-target={`store-plugin-${plugin.slug}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <PluginIcon icon={plugin.icon} name={plugin.name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle
                className="text-foreground text-lg cursor-pointer hover:underline"
                onClick={() => router.push(`/plugins/${plugin.slug}`)}
              >
                {plugin.name}
              </CardTitle>
              {plugin.isBuiltin ? (
                <span className="px-2 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300">
                  Built-in
                </span>
              ) : null}
              {plugin.authorType === "USER" ? (
                <span className="px-2 py-0.5 rounded text-xs bg-purple-900/50 text-purple-300">
                  Custom
                </span>
              ) : null}
            </div>
            <CardDescription className="text-muted-foreground mt-1">
              {plugin.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Tags */}
        {plugin.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {plugin.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {plugin.tags.length > 4 ? (
              <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                +{plugin.tags.length - 4}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Metadata row */}
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <span>v{plugin.version}</span>
          <span className="capitalize">{plugin.category}</span>
        </div>

        {/* Required gateways */}
        {plugin.requiredGateways.length > 0 ? (
          <div className="text-xs text-muted-foreground mb-4">
            Requires: {plugin.requiredGateways.join(", ")}
          </div>
        ) : null}

        {/* Action buttons */}
        {isInstalled ? (
          <div className="space-y-2">
            {/* Custom plugin actions: Update Plugin + View Source */}
            {plugin.authorType === "USER" ? (
              <>
                <Button
                  variant="outline"
                  className="w-full border-purple-900/50 text-purple-300 hover:bg-purple-900/20 hover:text-purple-200"
                  onClick={() => onUpdate(plugin)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Update Plugin
                </Button>
                <button
                  type="button"
                  onClick={() => router.push(`/workspace?focus=plugins/${plugin.slug}/index.js`)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Source Code
                </button>
              </>
            ) : null}
            <Button
              variant="outline"
              className="w-full border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-300"
              onClick={() => onUninstall(plugin.slug)}
              disabled={isInstalling}
            >
              {isInstalling ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Removing...</> : "Uninstall"}
            </Button>
          </div>
        ) : (
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-foreground"
            onClick={() => router.push("/bots")}
          >
            Go to My Bots to install
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================
// Main Page Content
// ===========================================

function PluginsContent() {
  const { token, context } = useAuth();
  const router = useRouter();
  const [plugins, setPlugins] = useState<PluginListItem[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<Map<string, InstalledPlugin>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [updatePlugin, setUpdatePlugin] = useState<PluginListItem | null>(null);

  // Determine if in organization context
  const isOrgContext = context.type === "organization" && !!context.organizationId;
  const orgId = context.organizationId;
  // Categories for filtering (B4 — action-oriented labels)
  const categories = ["analytics", "messaging", "automation", "moderation", "utilities", "general"];
  const CATEGORY_LABELS: Record<string, string> = {
    messaging: "💬 Reply & Chat",
    analytics: "📊 Track & Analyze",
    automation: "⚡ Automate Tasks",
    moderation: "🛡️ Moderate Content",
    utilities: "🔧 Tools & Utilities",
    general: "🔌 Other",
  };

  // Fetch available plugins
  const fetchPlugins = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (selectedCategory) params.set("category", selectedCategory);

      const response = await fetch(apiUrl(`/plugins?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch plugins");
      }

      const result = await response.json();
      setPlugins(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plugins");
    }
  }, [token, searchQuery, selectedCategory]);

  // Fetch user's/org's installed plugins
  const fetchInstalledPlugins = useCallback(async () => {
    try {
      // Use org endpoint if in org context, otherwise use personal endpoint
      const pluginsEndpoint = isOrgContext && orgId
        ? apiUrl(`/orgs/${orgId}/plugins`)
        : apiUrl("/plugins/installed");
      
      const response = await fetch(pluginsEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch installed plugins");
      }

      const result = await response.json();
      const installed = new Map<string, InstalledPlugin>();
      for (const up of result.data || []) {
        // API returns SafeUserPlugin with pluginSlug, not plugin.slug
        installed.set(up.pluginSlug, {
          id: up.id,
          pluginId: up.pluginId,
          enabled: up.isEnabled,
        });
      }
      setInstalledPlugins(installed);
    } catch (err) {
      console.error("Failed to fetch installed plugins:", err);
    }
  }, [token, isOrgContext, orgId]);

  // Initial load
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await Promise.all([fetchPlugins(), fetchInstalledPlugins()]);
      setIsLoading(false);
    }
    load();
  }, [fetchPlugins, fetchInstalledPlugins]);

  // Uninstall plugin
  const handleUninstall = async (slug: string) => {
    const installed = installedPlugins.get(slug);
    if (!installed) return;

    setInstallingSlug(slug);
    try {
      // Use org endpoint if in org context, otherwise use personal endpoint
      const uninstallEndpoint = isOrgContext && orgId
        ? apiUrl(`/orgs/${orgId}/plugins/${installed.id}`)
        : apiUrl(`/plugins/installed/${installed.id}`);

      const response = await fetch(uninstallEndpoint, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to uninstall plugin");
      }

      // Refresh installed plugins
      await fetchInstalledPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to uninstall plugin");
    } finally {
      setInstallingSlug(null);
    }
  };

  // Filter plugins by search
  const filteredPlugins = plugins.filter((plugin) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      plugin.name.toLowerCase().includes(query) ||
      plugin.description.toLowerCase().includes(query) ||
      plugin.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Plugins</h1>
            <p className="text-muted-foreground mt-1">
              Browse available plugins for your bots
            </p>
          </div>
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

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className={
                selectedCategory === null
                  ? "bg-muted"
                  : "border-border text-foreground hover:bg-muted"
              }
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className={
                  selectedCategory === category
                    ? "bg-muted"
                    : "border-border text-foreground hover:bg-muted"
                }
              >
                {CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Plugin grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border bg-card/50 animate-pulse">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 bg-muted rounded w-3/4" />
                      <div className="h-4 bg-muted rounded w-full" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-10 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-muted-foreground">No plugins found</p>
            {searchQuery || selectedCategory ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-border text-foreground"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory(null);
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-ai-target="plugin-store-list">
            {filteredPlugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                isInstalled={installedPlugins.has(plugin.slug)}
                isInstalling={installingSlug === plugin.slug}
                onUninstall={handleUninstall}
                onUpdate={setUpdatePlugin}
              />
            ))}
          </div>
        )}

        {/* Stats + Developer link (B6) */}
        <div className="text-center space-y-2">
          <div className="text-sm text-muted-foreground">
            {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? "s" : ""} available
            {installedPlugins.size > 0 ? ` • ${installedPlugins.size} installed` : ""}
          </div>
          <p className="text-xs text-muted-foreground">
            Are you a developer?{" "}
            <button
              type="button"
              onClick={() => router.push("/plugins/create")}
              className="text-emerald-400 hover:underline"
            >
              Create custom plugins →
            </button>
          </p>
        </div>
      </div>

      {/* Update Plugin Dialog */}
      <UpdatePluginDialog
        plugin={updatePlugin}
        open={!!updatePlugin}
        onOpenChange={(open) => { if (!open) setUpdatePlugin(null); }}
        token={token}
        onUpdated={() => {
          fetchPlugins();
          setUpdatePlugin(null);
        }}
      />
    </div>
  );
}

// ===========================================
// Page Export
// ===========================================

export default function PluginsPage() {
  return (
    <ProtectedRoute>
      <PluginsContent />
    </ProtectedRoute>
  );
}

//
