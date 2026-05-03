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

import { useCallback, useEffect, useRef, useState } from "react";

import { PluginIcon } from "@/components/plugins/plugin-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PluginHealthEntry } from "@/lib/api-client";
import {
    createCustomPlugin,
    getPluginCatalog,
    getPluginHealth,
    installPluginToBot,
    installPluginToBotOrg,
} from "@/lib/api-client";
import type { PluginListItem } from "@/shared/types/plugin";
import { Code2, Github, Loader2, Plus, Search, Sparkles, Store, X } from "lucide-react";
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
// Default plugin code template
// ===========================================

const DEFAULT_PLUGIN_CODE = `'use strict';

const { storage, gateway } = require('/bridge-agent/plugin-sdk');

async function main() {
  console.log('[my-plugin] Plugin started');

  // Your plugin code here
}

main().catch(err => {
  console.error('[my-plugin] Fatal error:', err);
  process.exit(1);
});
`;

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
  onInstalled: (info?: { pluginId: string; pluginName: string }) => void;
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
  const [activeTab, setActiveTab] = useState<"browse" | "create">("browse");

  // Create plugin state
  const [createMode, setCreateMode] = useState<"pick" | "ai" | "manual">("pick");
  const [pluginName, setPluginName] = useState("");
  const [pluginDescription, setPluginDescription] = useState("");
  const [pluginCode, setPluginCode] = useState(DEFAULT_PLUGIN_CODE);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // AI generation state
  const [aiRepoUrl, setAiRepoUrl] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiProgressLog, setAiProgressLog] = useState<string[]>([]);
  const aiAbortRef = useRef<(() => void) | null>(null);
  const aiLogEndRef = useRef<HTMLDivElement>(null);

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

        // Installed (first check)
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

        // Running (second check)
        setInstallProgress({ slug, phase: "running" });
        await new Promise((r) => setTimeout(r, 800));

        // Ready (third check + test it prompt)
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
        const pluginId = result.data?.pluginId;
        onInstalled(pluginId ? { pluginId, pluginName } : undefined);
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

  // ===========================================
  // Create Plugin Handlers
  // ===========================================

  const slugify = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleCreateManual = useCallback(async () => {
    if (!pluginName.trim()) {
      setCreateError("Plugin name is required");
      return;
    }
    setIsCreating(true);
    setCreateError(null);

    const slug = slugify(pluginName);
    try {
      const result = await createCustomPlugin(
        {
          slug,
          name: pluginName.trim(),
          description: pluginDescription.trim() || `Custom plugin for ${pluginName}`,
          category: "general",
          code: pluginCode,
          gatewayId,
        },
        token ?? undefined,
      );

      if (!result.success) {
        setCreateError(result.error?.message ?? "Failed to create plugin");
        return;
      }

      toast.success(`${pluginName} created and added to your bot!`);
      setCreateMode("pick");
      setPluginName("");
      setPluginDescription("");
      setPluginCode(DEFAULT_PLUGIN_CODE);
      const createdPluginId = result.data?.pluginId;
      onInstalled(createdPluginId ? { pluginId: createdPluginId, pluginName: pluginName.trim() } : undefined);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create plugin");
    } finally {
      setIsCreating(false);
    }
  }, [pluginName, pluginDescription, pluginCode, gatewayId, token, onInstalled]);

  const handleAIGenerate = useCallback(async () => {
    if (!aiRepoUrl.trim()) {
      setCreateError("GitHub URL is required");
      return;
    }
    try {
      const url = new URL(aiRepoUrl.trim());
      if (url.protocol !== "https:") {
        setCreateError("Only HTTPS URLs are supported");
        return;
      }
    } catch {
      setCreateError("Please enter a valid URL");
      return;
    }

    setIsGenerating(true);
    setCreateError(null);
    setAiProgressLog(["Starting AI repo analysis..."]);

    try {
      const authToken = localStorage.getItem("token") || "";
      const { streamWorker } = await import("@/components/cursor/cursor-brain");

      const cleanup = streamWorker(
        {
          message: aiDescription.trim()
            ? `Analyze this GitHub repo and create a 2Bot plugin from it: ${aiRepoUrl.trim()}. Description: ${aiDescription.trim()}`
            : `Analyze this GitHub repo and create a 2Bot plugin from it: ${aiRepoUrl.trim()}`,
          mode: "analyze-repo",
          repoUrl: aiRepoUrl.trim(),
          description: aiDescription.trim() || undefined,
        },
        authToken,
        (event) => {
          const type = event.type as string;
          if (type === "status") {
            setAiProgressLog((prev) => [...prev, event.message as string]);
          } else if (type === "worker_start") {
            setAiProgressLog((prev) => [...prev, `${event.displayName as string} started`]);
          } else if (type === "thinking" && (event.text as string)?.length > 10) {
            setAiProgressLog((prev) => [...prev, `Thinking: ${(event.text as string).slice(0, 100)}...`]);
          } else if (type === "tool_start") {
            const toolName = (event.tool as string || "").replace(/_/g, " ");
            setAiProgressLog((prev) => [...prev, `Using tool: ${toolName}`]);
          } else if (type === "tool_result") {
            if (!(event.success as boolean)) {
              setAiProgressLog((prev) => [...prev, `Issue: ${(event.summary as string)?.slice(0, 80)}`]);
            }
          } else if (type === "code_preview") {
            setAiProgressLog((prev) => [...prev, `Writing file: ${event.file as string}`]);
          } else if (type === "hand_off") {
            setAiProgressLog((prev) => [...prev, `Handing off to ${event.toDisplayName as string}...`]);
          } else if (type === "done") {
            if (event.success) {
              setAiProgressLog((prev) => [...prev, `Plugin created successfully!`]);
              toast.success("Plugin generated and added to your bot!");
              const donePluginId = event.pluginId as string | undefined;
              const donePluginName = (event.pluginName as string | undefined) ?? aiRepoUrl.split("/").pop() ?? "Plugin";
              setTimeout(() => {
                setIsGenerating(false);
                onInstalled(donePluginId ? { pluginId: donePluginId, pluginName: donePluginName } : undefined);
              }, 1500);
            } else {
              setCreateError(event.summary as string || "Plugin generation failed");
            }
          }
          setTimeout(() => aiLogEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        },
        () => {
          setIsGenerating(false);
          aiAbortRef.current = null;
        },
        (errMsg) => {
          setCreateError(errMsg);
          setIsGenerating(false);
          aiAbortRef.current = null;
        },
      );

      aiAbortRef.current = cleanup;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to start AI generation");
      setIsGenerating(false);
    }
  }, [aiRepoUrl, aiDescription, onInstalled]);

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

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        <button
          onClick={() => setActiveTab("browse")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "browse"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Store className="h-3.5 w-3.5" /> Browse
        </button>
        <button
          onClick={() => { setActiveTab("create"); setCreateMode("pick"); setCreateError(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Plus className="h-3.5 w-3.5" /> Create
        </button>
      </div>

      {/* ── Browse Tab ── */}
      {activeTab === "browse" ? (
        <>
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

          {/* Recommended section */}
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
        </>
      ) : null}

      {/* ── Create Tab ── */}
      {activeTab === "create" ? (
        <>
          {/* Error display */}
          {createError ? (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {createError}
            </div>
          ) : null}

          {/* Mode picker */}
          {createMode === "pick" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Choose how to create your plugin
              </p>
              <button
                onClick={() => { setCreateMode("ai"); setCreateError(null); }}
                className="w-full text-left p-3 rounded-lg border border-border hover:border-purple-500/40 hover:bg-purple-500/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">AI Generate from GitHub</p>
                    <p className="text-xs text-muted-foreground">
                      Paste a repo URL — AI analyzes it and builds a plugin
                    </p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setCreateMode("manual"); setCreateError(null); }}
                className="w-full text-left p-3 rounded-lg border border-border hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Code2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Write Code Manually</p>
                    <p className="text-xs text-muted-foreground">
                      Start from a template and write your own plugin code
                    </p>
                  </div>
                </div>
              </button>
            </div>
          ) : null}

          {/* AI Generate mode */}
          {createMode === "ai" ? (
            <div className="space-y-3">
              <button
                onClick={() => { setCreateMode("pick"); setCreateError(null); setAiProgressLog([]); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                &larr; Back
              </button>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">AI Generate from GitHub</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Repository URL</label>
                <div className="relative">
                  <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={aiRepoUrl}
                    onChange={(e) => setAiRepoUrl(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    className="pl-9 h-8 text-sm"
                    disabled={isGenerating}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  What should the plugin do? <span className="opacity-50">(optional)</span>
                </label>
                <textarea
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="e.g., Monitor new issues and send notifications to Telegram"
                  rows={2}
                  disabled={isGenerating}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              {/* AI progress log */}
              {aiProgressLog.length > 0 ? (
                <div className="bg-muted/50 rounded-lg p-3 max-h-[200px] overflow-y-auto font-mono text-[11px] space-y-1">
                  {aiProgressLog.map((line, i) => (
                    <div key={i} className="text-muted-foreground">{line}</div>
                  ))}
                  <div ref={aiLogEndRef} />
                </div>
              ) : null}

              <div className="flex gap-2">
                {isGenerating ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 h-8 text-xs"
                    onClick={() => { aiAbortRef.current?.(); setIsGenerating(false); }}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs bg-purple-600 hover:bg-purple-700 gap-1"
                    onClick={handleAIGenerate}
                    disabled={!aiRepoUrl.trim()}
                  >
                    <Sparkles className="h-3 w-3" /> Generate Plugin
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {/* Manual create mode */}
          {createMode === "manual" ? (
            <div className="space-y-3">
              <button
                onClick={() => { setCreateMode("pick"); setCreateError(null); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                &larr; Back
              </button>
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Create Plugin</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Plugin Name</label>
                <Input
                  value={pluginName}
                  onChange={(e) => setPluginName(e.target.value)}
                  placeholder="My Custom Plugin"
                  className="h-8 text-sm"
                  disabled={isCreating}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Description <span className="opacity-50">(optional)</span>
                </label>
                <Input
                  value={pluginDescription}
                  onChange={(e) => setPluginDescription(e.target.value)}
                  placeholder="What does this plugin do?"
                  className="h-8 text-sm"
                  disabled={isCreating}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Plugin Code</label>
                <textarea
                  value={pluginCode}
                  onChange={(e) => setPluginCode(e.target.value)}
                  rows={8}
                  disabled={isCreating}
                  className="w-full rounded-lg border bg-muted/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  You can edit the code later in Workspace
                </p>
              </div>
              <Button
                size="sm"
                className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 gap-1"
                onClick={handleCreateManual}
                disabled={isCreating || !pluginName.trim()}
              >
                {isCreating ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Creating...</>
                ) : (
                  <><Plus className="h-3 w-3" /> Create &amp; Add to Bot</>
                )}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
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


