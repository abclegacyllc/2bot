"use client";

/**
 * Plugin Detail Page
 *
 * Non-code, user-friendly view of a plugin with description,
 * configuration preview, install stats, and "Add to Bot" CTA.
 *
 * @module app/(dashboard)/plugins/[id]
 */

import { useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { PluginIcon } from "@/components/plugins/plugin-icon";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPluginBySlug } from "@/lib/api-client";
import type { PluginDefinition } from "@/shared/types/plugin";
import { ArrowLeft, Download, Loader2, Star } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

// ===========================================
// Category Display Labels
// ===========================================

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  messaging: { label: "Reply & Chat", icon: "💬" },
  analytics: { label: "Track & Analyze", icon: "📊" },
  automation: { label: "Automate Tasks", icon: "⚡" },
  moderation: { label: "Moderate Content", icon: "🛡️" },
  utilities: { label: "Tools & Utilities", icon: "🔧" },
  general: { label: "Other", icon: "🔌" },
};

// ===========================================
// Config Preview
// ===========================================

interface ConfigPreviewProps {
  configSchema: PluginDefinition["configSchema"];
}

function ConfigPreview({ configSchema }: ConfigPreviewProps) {
  const properties = configSchema?.properties;
  if (!properties || Object.keys(properties).length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This plugin works out of the box — no configuration needed.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(properties).map(([key, prop]) => (
        <div key={key} className="flex items-start gap-3 p-2 rounded-md bg-muted/30">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {prop.title || key}
            </p>
            {prop.description ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {prop.description}
              </p>
            ) : null}
          </div>
          <div className="shrink-0">
            {prop.default !== undefined ? (
              <Badge variant="outline" className="text-[10px]">
                Default: {String(prop.default)}
              </Badge>
            ) : prop.type ? (
              <Badge variant="secondary" className="text-[10px]">
                {prop.type}
              </Badge>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

function PluginDetailContent() {
  const { id: slug } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [plugin, setPlugin] = useState<PluginDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    getPluginBySlug(slug, token ?? undefined).then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        setPlugin(result.data);
      } else {
        setError(result.error?.message ?? "Plugin not found");
      }
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug, token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !plugin) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-3xl mx-auto text-center py-20">
          <p className="text-lg text-muted-foreground">{error ?? "Plugin not found"}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/plugins")}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Plugins
          </Button>
        </div>
      </div>
    );
  }

  const catEntry = CATEGORY_LABELS[plugin.category];
  const catLabel = catEntry
    ? `${catEntry.icon} ${catEntry.label}`
    : plugin.category.charAt(0).toUpperCase() + plugin.category.slice(1);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground -ml-2"
          onClick={() => router.push("/plugins")}
        >
          <ArrowLeft className="h-4 w-4" /> All Plugins
        </Button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <PluginIcon icon={plugin.icon} name={plugin.name} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground">{plugin.name}</h1>
            <p className="text-muted-foreground mt-1">{plugin.description}</p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {catLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">v{plugin.version}</span>
              {plugin.isBuiltin ? (
                <Badge className="text-xs bg-blue-900/50 text-blue-300 border-0">
                  Built-in
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Download className="h-4 w-4" />
            <span>{plugin.installCount} install{plugin.installCount !== 1 ? "s" : ""}</span>
          </div>
          {plugin.reviewCount > 0 ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Star className="h-4 w-4 text-yellow-500" />
              <span>
                {plugin.avgRating.toFixed(1)} ({plugin.reviewCount} review{plugin.reviewCount !== 1 ? "s" : ""})
              </span>
            </div>
          ) : null}
        </div>

        {/* CTA */}
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-foreground"
          onClick={() => router.push("/bots")}
        >
          Go to My Bots to install
        </Button>

        {/* Tags */}
        {plugin.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {plugin.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        {/* Required Gateways */}
        {plugin.requiredGateways.length > 0 ? (
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Supported Platforms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {plugin.requiredGateways.map((gw) => (
                  <Badge key={gw} variant="secondary" className="text-xs">
                    {gw.replace(/_/g, " ").replace(/\bBOT\b/, "").trim()}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card/50">
            <CardContent className="py-3">
              <p className="text-sm text-muted-foreground">
                Works with all platforms
              </p>
            </CardContent>
          </Card>
        )}

        {/* Configuration Options */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Configuration Options</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfigPreview configSchema={plugin.configSchema} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===========================================
// Page Export
// ===========================================

export default function PluginDetailPage() {
  return (
    <ProtectedRoute>
      <PluginDetailContent />
    </ProtectedRoute>
  );
}
