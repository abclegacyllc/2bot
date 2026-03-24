"use client";

/**
 * Installed Plugins Page
 *
 * Shows all plugins installed by the current user across their bots,
 * with the ability to toggle, configure, and uninstall.
 *
 * @module app/(dashboard)/marketplace/installed/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    ArrowLeft,
    Package,
    Power,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface InstalledPlugin {
  id: string;
  pluginId: string;
  pluginSlug: string;
  pluginName: string;
  pluginDescription: string;
  pluginIcon: string | null;
  pluginCategory: string;
  gatewayId: string | null;
  gatewayName: string | null;
  gatewayType: string | null;
  gatewayStatus: string | null;
  isEnabled: boolean;
  executionCount: number;
  lastExecutedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export default function InstalledPluginsPage() {
  const { token } = useAuth();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  const fetchInstalled = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch(apiUrl("/plugins/installed"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load installed plugins");
      const data = await res.json();
      setPlugins(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInstalled();
  }, [fetchInstalled]);

  const handleToggle = async (id: string, enabled: boolean) => {
    if (!token) return;
    setTogglingId(id);
    try {
      const res = await fetch(apiUrl(`/plugins/installed/${id}/toggle`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setPlugins((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isEnabled: enabled } : p))
        );
      } else {
        setError("Failed to toggle plugin. Please try again.");
      }
    } catch {
      setError("Failed to toggle plugin. Please try again.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleUninstall = async (id: string, name: string) => {
    if (!token) return;
    if (!confirm(`Uninstall "${name}"? This will remove the plugin from this bot.`)) return;
    setUninstallingId(id);
    try {
      const res = await fetch(apiUrl(`/plugins/installed/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPlugins((prev) => prev.filter((p) => p.id !== id));
      } else {
        setError("Failed to uninstall plugin. Please try again.");
      }
    } catch {
      setError("Failed to uninstall plugin. Please try again.");
    } finally {
      setUninstallingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group by gateway (bot)
  const byGateway = plugins.reduce<Record<string, InstalledPlugin[]>>((acc, p) => {
    const key = p.gatewayId || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5 sm:h-6 sm:w-6" />
            Installed Plugins
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage plugins installed on your bots
          </p>
        </div>
        <Link href="/marketplace">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Browse Marketplace
          </Button>
        </Link>
      </div>

      {plugins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No plugins installed yet.</p>
            <Link href="/marketplace" className="text-sm text-emerald-600 hover:underline mt-2 inline-block">
              Browse the marketplace
            </Link>
          </CardContent>
        </Card>
      ) : (
        Object.entries(byGateway).map(([gatewayId, gatewayPlugins]) => {
          const first = gatewayPlugins[0];
          return (
            <Card key={gatewayId}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Power className="h-4 w-4" />
                  {first?.gatewayName || "Unknown Bot"}
                </CardTitle>
                <CardDescription>{first?.gatewayType} &middot; {gatewayPlugins.length} plugin{gatewayPlugins.length !== 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {gatewayPlugins.map((p) => (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/marketplace/${p.pluginSlug}`}
                            className="text-sm font-medium hover:underline truncate"
                          >
                            {p.pluginName}
                          </Link>
                          <Badge
                            variant={p.isEnabled ? "default" : "secondary"}
                            className="text-xs shrink-0"
                          >
                            {p.isEnabled ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {p.pluginDescription}
                        </p>
                        {p.executionCount > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.executionCount} executions
                            {p.lastExecutedAt && (
                              <> &middot; Last: {new Date(p.lastExecutedAt).toLocaleDateString()}</>
                            )}
                          </p>
                        )}
                        {p.lastError && (
                          <p className="text-xs text-red-500 truncate mt-0.5">
                            Error: {p.lastError}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Switch
                          checked={p.isEnabled}
                          onCheckedChange={(checked) => handleToggle(p.id, checked)}
                          disabled={togglingId === p.id}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => handleUninstall(p.id, p.pluginName)}
                          disabled={uninstallingId === p.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
