"use client";

/**
 * Add Plugin Panel
 *
 * In-context plugin browse panel shown inside BotDetailView.
 * Fetches catalog filtered by gateway type, supports one-click install
 * with progress animation, and shows recommended plugins for empty bots.
 *
 * @module components/bot-studio/add-plugin-panel
 */

import { useCallback, useEffect, useState } from "react";

import { PluginIcon } from "@/components/plugins/plugin-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PluginHealthEntry } from "@/lib/api-client";
import {
    getPluginCatalog,
    getPluginHealth,
    installPluginToBot,
    installPluginToBotOrg,
} from "@/lib/api-client";
import type { PluginListItem } from "@/shared/types/plugin";
import { Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
    InstallSuccessAnimation,
    type SuccessPhase,
} from "@/components/bot-studio/install-success-animation";

// ===========================================
// Category Display Labels (B4)
// ===========================================

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  messaging: { label: "Reply & Chat", icon: "💬" },
  analytics: { label: "Track & Analyze", icon: "📊" },
  automation: { label: "Automate Tasks", icon: "⚡" },
  moderation: { label: "Moderate Content", icon: "🛡️" },
  utilities: { label: "Tools & Utilities", icon: "🔧" },
  general: { label: "Other", icon: "🔌" },
};

function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug]?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

// ===========================================
// Recommended plugins per gateway type (B5)
// ===========================================

const RECOMMENDED_SLUGS: Record<string, string[]> = {
  TELEGRAM_BOT: ["ai-chat-bot", "command-bot", "channel-analytics"],
  DISCORD_BOT: ["ai-chat-bot", "command-bot", "auto-responder"],
  SLACK_BOT: ["ai-chat-bot", "auto-responder"],
  WHATSAPP_BOT: ["ai-chat-bot", "auto-responder"],
};

// Hidden from browse (developer tools)
const HIDDEN_SLUGS = new Set(["blank", "storage-demo"]);

// ===========================================
// Install Progress States (B2)
// ===========================================

type InstallPhase = "deploying" | "installed" | "running" | "ready" | "error";

interface InstallProgress {
  slug: string;
  phase: InstallPhase;
  error?: string;
}

// ===========================================
// Types
// ===========================================

interface AddPluginPanelProps {
  gatewayId: string;
  gatewayType: string;
  gatewayMetadata?: Record<string, unknown> | null;
  installedSlugs: Set<string>;
  token: string | null;
  organizationId?: string;
  onClose: () => void;
  onInstalled: () => void;
}

// ===========================================
// Component
// ===========================================

export function AddPluginPanel({
  gatewayId,
  gatewayType,
  gatewayMetadata,
  installedSlugs,
  token,
  organizationId,
  onClose,
  onInstalled,
}: AddPluginPanelProps) {
  const [plugins, setPlugins] = useState<PluginListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

  // Fetch plugin catalog filtered by gateway type
  useEffect(() => {
    let cancelled = false;

    getPluginCatalog(undefined, token ?? undefined).then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        // Filter to compatible plugins and hide developer tools
        const compatible = result.data.filter(
          (p) =>
            !HIDDEN_SLUGS.has(p.slug) &&
            (p.requiredGateways.length === 0 || p.requiredGateways.includes(gatewayType))
        );
        setPlugins(compatible);
      }
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, gatewayType]);

  // Filter plugins
  const filtered = plugins.filter((p) => {
    if (selectedCategory && p.category !== selectedCategory) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  // Get unique categories from available plugins
  const categories = [...new Set(filtered.map((p) => p.category))].sort();

  // Recommended plugins for this gateway type
  const recommendedSlugs = RECOMMENDED_SLUGS[gatewayType] ?? [];
  const recommended = plugins.filter(
    (p) => recommendedSlugs.includes(p.slug) && !installedSlugs.has(p.slug)
  );

  // Install handler with progress animation (B2)
  const handleInstall = useCallback(
    async (slug: string) => {
      setInstallProgress({ slug, phase: "deploying" });

      try {
        const result = organizationId
          ? await installPluginToBotOrg(organizationId, slug, gatewayId, {}, token ?? undefined)
          : await installPluginToBot(slug, gatewayId, {}, token ?? undefined);

        if (!result.success) {
          setInstallProgress({ slug, phase: "error", error: result.error?.message ?? "Install failed" });
          toast.error(result.error?.message ?? "Failed to install plugin");
          return;
        }

        // Phase 2: Installed (first check)
        setInstallProgress({ slug, phase: "installed" });

        // Poll health for up to 5 seconds
        let confirmed = false;
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const healthResult = await getPluginHealth(token ?? undefined);
            if (healthResult.success && healthResult.data) {
              const entry = (healthResult.data as PluginHealthEntry[]).find(
                (h) => h.pluginSlug === slug
              );
              if (entry?.processRunning) {
                confirmed = true;
                break;
              }
            }
          } catch {
            // Continue polling
          }
        }

        // Phase 3: Running (second check)
        setInstallProgress({ slug, phase: "running" });
        await new Promise((r) => setTimeout(r, 800));

        // Phase 4: Ready (third check + test it prompt)
        setInstallProgress({ slug, phase: "ready" });

        const pluginName = plugins.find((p) => p.slug === slug)?.name ?? slug;
        if (confirmed) {
          toast.success(`${pluginName} is running!`);
        } else {
          toast.success(`${pluginName} installed — starting up in background`);
        }

        // Show success animation for 3s, then refresh
        await new Promise((r) => setTimeout(r, 3000));
        setInstallProgress(null);
        onInstalled();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Install failed";
        setInstallProgress({ slug, phase: "error", error: msg });
        toast.error(msg);
      }
    },
    [gatewayId, token, organizationId, plugins, onInstalled]
  );

  // Bot username for "test it" link
  const botUsername = gatewayMetadata
    ? (gatewayMetadata as Record<string, unknown>).username as string | undefined
    : undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Add Plugin to Bot
        </h3>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-8 text-sm bg-muted border-border"
        />
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              className="h-6 text-[11px] px-2 gap-1"
              onClick={() => setSelectedCategory(cat)}
            >
              {CATEGORY_LABELS[cat]?.icon} {categoryLabel(cat)}
            </Button>
          ))}
        </div>
      )}

      {/* Recommended section (when no search active and plugins available) */}
      {!searchQuery && !selectedCategory && recommended.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Recommended for your bot
          </p>
          <div className="space-y-2">
            {recommended.map((plugin) => (
              <PluginInstallCard
                key={plugin.id}
                plugin={plugin}
                isInstalled={installedSlugs.has(plugin.slug)}
                installProgress={installProgress?.slug === plugin.slug ? installProgress : null}
                onInstall={handleInstall}
                botUsername={botUsername}
                isRecommended
              />
            ))}
          </div>
          {filtered.length > recommended.length && (
            <p className="text-xs text-muted-foreground mt-3 mb-1">
              All plugins
            </p>
          )}
        </div>
      )}

      {/* Plugin list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">No plugins found</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {filtered.map((plugin) => (
            <PluginInstallCard
              key={plugin.id}
              plugin={plugin}
              isInstalled={installedSlugs.has(plugin.slug)}
              installProgress={installProgress?.slug === plugin.slug ? installProgress : null}
              onInstall={handleInstall}
              botUsername={botUsername}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================
// Plugin Install Card
// ===========================================

interface PluginInstallCardProps {
  plugin: PluginListItem;
  isInstalled: boolean;
  installProgress: InstallProgress | null;
  onInstall: (slug: string) => void;
  botUsername?: string;
  isRecommended?: boolean;
}

function PluginInstallCard({
  plugin,
  isInstalled,
  installProgress,
  onInstall,
  botUsername,
  isRecommended,
}: PluginInstallCardProps) {
  const isInstalling = !!installProgress;
  const phase = installProgress?.phase;
  const showSuccessAnimation =
    phase === "installed" || phase === "running" || phase === "ready";

  return (
    <Card
      className={`border-border transition-colors ${
        isRecommended ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card/50 hover:bg-card/70"
      }`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <PluginIcon icon={plugin.icon} name={plugin.name} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground truncate">
                {plugin.name}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">
                {categoryLabel(plugin.category)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {plugin.description}
            </p>
          </div>

          {/* Action button */}
          <div className="shrink-0">
            {isInstalled && !isInstalling ? (
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                Installed
              </Badge>
            ) : phase === "deploying" ? (
              <Badge variant="secondary" className="text-[10px] gap-1 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" /> Deploying...
              </Badge>
            ) : phase === "error" ? (
              <Badge variant="destructive" className="text-[10px]">
                Failed
              </Badge>
            ) : isInstalling ? null : (
              <Button
                size="sm"
                className="h-7 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 gap-1"
                onClick={() => onInstall(plugin.slug)}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            )}
          </div>
        </div>

        {/* Three-check success animation (C1 + C2) */}
        {showSuccessAnimation ? (
          <InstallSuccessAnimation
            pluginName={plugin.name}
            phase={phase as SuccessPhase}
            botUsername={botUsername}
            gatewayType={plugin.requiredGateways[0]}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}


