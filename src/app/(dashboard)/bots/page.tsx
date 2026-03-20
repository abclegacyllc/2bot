"use client";

/**
 * Bots Page — Bot-Centric Architecture
 *
 * Core concept: Bot = Gateway. Each gateway is presented as a "Bot",
 * and each bot owns workflows with ordered plugin steps.
 *
 * Plugin discovery is done inside the workflow editor (add-step dialog).
 *
 * @module app/(dashboard)/bots
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { BotCard, type BotData } from "@/components/bot-studio/bot-card";
import { BotDetailView } from "@/components/bot-studio/bot-detail-view";
import { CreateBotWizard } from "@/components/bot-studio/create-bot-wizard";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";
import type { GatewayOption } from "@/lib/api-client";
import {
    getOrgGateways,
    getUserGateways
} from "@/lib/api-client";
import { apiUrl } from "@/shared/config/urls";
import type {
    UserPlugin,
} from "@/shared/types/plugin";
import {
    Bot,
    Plus,
    RefreshCw,
} from "lucide-react";

// ===========================================
// Constants
// ===========================================

// ===========================================
// Helpers
// ===========================================

/** Group plugins by gatewayId. Plugins without a gateway go under "__unbound__". */
function groupPluginsByGateway(
  gateways: GatewayOption[],
  plugins: UserPlugin[]
): BotData[] {
  const pluginsByGateway = new Map<string, UserPlugin[]>();

  for (const plugin of plugins) {
    const key = plugin.gatewayId ?? "__unbound__";
    const list = pluginsByGateway.get(key) ?? [];
    list.push(plugin);
    pluginsByGateway.set(key, list);
  }

  const bots: BotData[] = [];

  // Create a BotData for each gateway
  for (const gw of gateways) {
    bots.push({
      gateway: gw,
      plugins: pluginsByGateway.get(gw.id) ?? [],
    });
    pluginsByGateway.delete(gw.id);
  }

  // Unbound plugins shown as a virtual "Unassigned" bot
  const unbound = pluginsByGateway.get("__unbound__");
  if (unbound && unbound.length > 0) {
    bots.push({
      gateway: {
        id: "__unbound__",
        name: "Unassigned Plugins",
        type: "TELEGRAM_BOT",
        status: "DISCONNECTED",
      },
      plugins: unbound,
    });
  }

  return bots;
}

// ===========================================
// Main Page
// ===========================================

export default function BotsPage() {
  const { token, context } = useAuth();
  const organizationId =
    context.type === "organization" ? context.organizationId : undefined;

  // Bot data state
  const [gateways, setGateways] = useState<GatewayOption[]>([]);
  const [plugins, setPlugins] = useState<UserPlugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create wizard
  const [showCreateWizard, setShowCreateWizard] = useState(false);

  // Detail view
  const [selectedBot, setSelectedBot] = useState<BotData | null>(null);

  // ===========================================
  // Data Fetching
  // ===========================================

  const fetchBotData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch gateways and plugins in parallel
      const [gatewayResult, pluginsRes] = await Promise.all([
        organizationId
          ? getOrgGateways(organizationId, token ?? undefined)
          : getUserGateways(token ?? undefined),
        fetch(
          organizationId
            ? apiUrl(`/orgs/${organizationId}/plugins`)
            : apiUrl("/plugins/installed"),
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        ),
      ]);

      if (gatewayResult.success && gatewayResult.data) {
        setGateways(gatewayResult.data);
      }

      if (pluginsRes.ok) {
        const json = await pluginsRes.json();
        setPlugins(json.data ?? []);
      }
    } catch {
      // Best-effort load
    } finally {
      setIsLoading(false);
    }
  }, [token, organizationId]);

  useEffect(() => {
    fetchBotData();
  }, [fetchBotData]);

  // ===========================================
  // Derived Data
  // ===========================================

  const bots = useMemo(
    () => groupPluginsByGateway(gateways, plugins),
    [gateways, plugins]
  );

  // Keep selected bot in sync after refresh
  useEffect(() => {
    if (selectedBot) {
      const updated = bots.find((b) => b.gateway.id === selectedBot.gateway.id);
      if (updated) {
        setSelectedBot(updated);
      }
    }
  }, [bots, selectedBot]);

  // ===========================================
  // Handlers
  // ===========================================

  const handleBotCreated = useCallback(() => {
    fetchBotData();
  }, [fetchBotData]);

  const handleSelectBot = useCallback((bot: BotData) => {
    setSelectedBot(bot);
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setSelectedBot(null);
  }, []);

  // ===========================================
  // Render
  // ===========================================

  // If viewing a bot detail, show the detail view instead of tabs
  if (selectedBot) {
    return (
      <ProtectedRoute>
        <div className="p-6 max-w-7xl mx-auto">
          <BotDetailView
            gateway={selectedBot.gateway}
            plugins={selectedBot.plugins}
            token={token}
            organizationId={organizationId}
            onBack={handleBackFromDetail}
            onRefresh={fetchBotData}
          />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="p-6 max-w-7xl mx-auto" data-ai-target="bots-overview">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="h-6 w-6 text-emerald-500" />
              Bots
            </h1>
            <p className="text-muted-foreground mt-1">
              Create and manage your bots — no coding required.
            </p>
          </div>
          <Button
            onClick={() => setShowCreateWizard(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <Plus className="h-4 w-4" /> Create Bot
          </Button>
        </div>

        {/* Bot List */}
        <div className="space-y-4">
          {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="border-border bg-card/50 animate-pulse">
                    <CardHeader>
                      <div className="h-5 bg-muted rounded w-2/3" />
                      <div className="h-4 bg-muted rounded w-full mt-2" />
                    </CardHeader>
                    <CardContent>
                      <div className="h-8 bg-muted rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : bots.length === 0 ? (
              <div className="text-center py-16">
                <Bot className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No bots yet
                </h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Create your first bot to get started. Connect a Telegram bot
                  token and add plugins like auto-reply, AI chat, and more.
                </p>
                <Button
                  onClick={() => setShowCreateWizard(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Create Your First Bot
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {bots.length} bot{bots.length !== 1 ? "s" : ""}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchBotData}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bots.map((bot) => (
                    <BotCard
                      key={bot.gateway.id}
                      bot={bot}
                      onSelect={handleSelectBot}
                    />
                  ))}
                </div>
              </>
            )}
        </div>

        {/* Create Bot Wizard */}
        <CreateBotWizard
          open={showCreateWizard}
          onClose={() => setShowCreateWizard(false)}
          token={token}
          organizationId={organizationId}
          onCreated={handleBotCreated}
        />
      </div>
    </ProtectedRoute>
  );
}
