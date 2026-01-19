"use client";

/**
 * Available Plugins Page
 *
 * Displays the plugin catalog with install/uninstall actions.
 * Users can browse, search, and install plugins from this page.
 *
 * @module app/dashboard/plugins
 */

import { useCallback, useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ===========================================
// Types
// ===========================================

interface PluginListItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  icon: string | null;
  category: string;
  tags: string[];
  requiredGateways: string[];
  isBuiltin: boolean;
}

interface InstalledPlugin {
  id: string;
  pluginId: string;
  enabled: boolean;
}

// ===========================================
// Icon Component
// ===========================================

function PluginIcon({ icon }: { icon: string | null; name: string }) {
  // Map icon names to emoji (simple approach)
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
    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">
      {emoji}
    </div>
  );
}

// ===========================================
// Plugin Card Component
// ===========================================

interface PluginCardProps {
  plugin: PluginListItem;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
}

function PluginCard({ plugin, isInstalled, isInstalling, onInstall, onUninstall }: PluginCardProps) {
  return (
    <Card className="border-border bg-card/50 hover:bg-card/70 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <PluginIcon icon={plugin.icon} name={plugin.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-foreground text-lg">{plugin.name}</CardTitle>
              {plugin.isBuiltin ? (
                <span className="px-2 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300">
                  Built-in
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

        {/* Action button */}
        {isInstalled ? (
          <Button
            variant="outline"
            className="w-full border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            onClick={() => onUninstall(plugin.slug)}
            disabled={isInstalling}
          >
            {isInstalling ? "Removing..." : "Uninstall"}
          </Button>
        ) : (
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-foreground"
            onClick={() => onInstall(plugin.slug)}
            disabled={isInstalling}
          >
            {isInstalling ? "Installing..." : "Install"}
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
  const { token } = useAuth();
  const [plugins, setPlugins] = useState<PluginListItem[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<Map<string, InstalledPlugin>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  // Categories for filtering
  const categories = ["analytics", "messaging", "automation", "moderation", "utilities", "general"];

  // Fetch available plugins
  const fetchPlugins = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (selectedCategory) params.set("category", selectedCategory);

      const response = await fetch(`/api/plugins?${params.toString()}`, {
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

  // Fetch user's installed plugins
  const fetchInstalledPlugins = useCallback(async () => {
    try {
      const response = await fetch("/api/plugins/user/plugins", {
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
  }, [token]);

  // Initial load
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await Promise.all([fetchPlugins(), fetchInstalledPlugins()]);
      setIsLoading(false);
    }
    load();
  }, [fetchPlugins, fetchInstalledPlugins]);

  // Install plugin
  const handleInstall = async (slug: string) => {
    setInstallingSlug(slug);
    try {
      const response = await fetch("/api/plugins/user/plugins/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slug, config: {} }),
      })

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to install plugin");
      }

      // Refresh installed plugins
      await fetchInstalledPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install plugin");
    } finally {
      setInstallingSlug(null);
    }
  };

  // Uninstall plugin
  const handleUninstall = async (slug: string) => {
    const installed = installedPlugins.get(slug);
    if (!installed) return;

    setInstallingSlug(slug);
    try {
      const response = await fetch(`/api/plugins/user/plugins/${installed.id}`, {
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
        <div>
          <h1 className="text-3xl font-bold text-foreground">Available Plugins</h1>
          <p className="text-muted-foreground mt-1">
            Browse and install plugins to extend your bot&apos;s capabilities
          </p>
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
                {category.charAt(0).toUpperCase() + category.slice(1)}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                isInstalled={installedPlugins.has(plugin.slug)}
                isInstalling={installingSlug === plugin.slug}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
              />
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="text-center text-sm text-muted-foreground">
          {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? "s" : ""} available
          {installedPlugins.size > 0 ? ` • ${installedPlugins.size} installed` : ""}
        </div>
      </div>
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
