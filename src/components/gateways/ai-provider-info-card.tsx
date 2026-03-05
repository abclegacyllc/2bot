"use client";

/**
 * AI Provider Info Card
 *
 * Displays AI provider details: provider name, default model,
 * available models list — fetched from the /info endpoint.
 *
 * @module components/gateways/ai-provider-info-card
 */

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiUrl } from "@/shared/config/urls";

// ─── Types ────────────────────────────────────────────

interface AIProviderInfo {
  provider: string;
  providerName: string;
  defaultModel: string;
  availableModels?: string[];
  lastValidatedAt?: string;
}

// ─── Icons ────────────────────────────────────────────

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const LoadingIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// ─── Provider Colors ──────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-green-600/20 text-green-400 border-green-600/30",
  anthropic: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  deepseek: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30",
  grok: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  gemini: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  mistral: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  groq: "bg-rose-600/20 text-rose-400 border-rose-600/30",
  ollama: "bg-gray-600/20 text-gray-400 border-gray-600/30",
};

function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? "bg-muted text-muted-foreground border-border";
}

// ─── Component ────────────────────────────────────────

interface AIProviderInfoCardProps {
  gatewayId: string;
  token: string | null;
  status: string;
}

export function AIProviderInfoCard({ gatewayId, token, status }: AIProviderInfoCardProps) {
  const [info, setInfo] = useState<AIProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = status === "CONNECTED";

  const fetchInfo = useCallback(async (live = false) => {
    if (!token) return;

    try {
      setError(null);
      const url = live
        ? apiUrl(`/gateways/${gatewayId}/info?live=true`)
        : apiUrl(`/gateways/${gatewayId}/info`);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to fetch provider info");
      }

      const data = await response.json();
      setInfo(data.data?.metadata ?? data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, gatewayId]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInfo(true);
  };

  if (loading) {
    return (
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground text-lg">Provider Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
            <div className="h-4 w-40 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !info) {
    return (
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground text-lg">Provider Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); fetchInfo(); }}
            className="mt-3 border-border"
          >
            <RefreshIcon />
            <span className="ml-2">Retry</span>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!info) return null;

  const modelCount = info.availableModels?.length ?? 0;

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-foreground text-lg">Provider Info</CardTitle>
          <CardDescription className="text-muted-foreground">
            AI provider configuration and available models
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || !isConnected}
          className="border-border text-foreground"
          title={isConnected ? "Refresh from provider (live)" : "Connect gateway to refresh"}
        >
          {refreshing ? <LoadingIcon /> : <RefreshIcon />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Provider Badge */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border">
          <div className={`w-12 h-12 rounded-full border flex items-center justify-center font-bold text-lg ${getProviderColor(info.provider)}`}>
            {info.providerName[0]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{info.providerName}</span>
              <Badge variant="secondary" className="text-xs">{info.provider}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Default model: <span className="text-foreground font-mono text-xs">{info.defaultModel}</span>
            </p>
          </div>
        </div>

        {/* Available Models */}
        {info.availableModels && info.availableModels.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Available Models
              </span>
              <span className="text-xs text-muted-foreground">{modelCount} models</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {info.availableModels.map((model) => (
                <Badge
                  key={model}
                  variant={model === info.defaultModel ? "default" : "outline"}
                  className="text-xs font-mono"
                >
                  {model}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Validation Time */}
        {info.lastValidatedAt && (
          <p className="text-xs text-muted-foreground">
            Last validated: {new Date(info.lastValidatedAt).toLocaleString()}
          </p>
        )}

        {error && (
          <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
