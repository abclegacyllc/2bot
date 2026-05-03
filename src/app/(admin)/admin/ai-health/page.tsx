"use client";

/**
 * Admin AI Provider Health Dashboard
 *
 * Real-time monitoring of AI provider health:
 * - Provider status (configured, healthy, latency)
 * - Circuit breaker status (tripped providers, cooldowns)
 * - Per-model health (disabled models, failure counts)
 * - Alert history (provider down/recovered events)
 *
 * @module app/(admin)/admin/ai-health/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApiUrl } from "@/shared/config/urls";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

interface ProviderHealth {
  hasApiKey: boolean;
  configured: boolean;
  healthy: boolean;
  lastChecked?: string;
  latencyMs?: number;
  error?: string;
}

interface CircuitBreakerStatus {
  provider: string;
  healthy: boolean;
  recentFailures: number;
  uniqueFailedModels: number;
  disabledAt?: string;
  cooldownExpiresAt?: string;
  worstCategory?: string;
  lastError?: string;
  lastFailedModel?: string;
}

interface ModelHealthEntry {
  modelId: string;
  healthy: boolean;
  recentFailures: number;
  disabledAt?: string;
  lastError?: string;
}

interface AlertEntry {
  id: number;
  type: "provider_down" | "provider_recovered";
  provider: string;
  category?: string;
  error?: string;
  failureCount?: number;
  cooldownMinutes?: number;
  timestamp: string;
  acknowledged: boolean;
}

interface AlertSummary {
  totalAlerts: number;
  unacknowledged: number;
  providersDown: string[];
}

interface ProviderBalanceInfo {
  provider: string;
  supported: boolean;
  balanceUsd: number | null;
  usedUsd: number | null;
  limitUsd: number | null;
  isFreeTier?: boolean;
  note?: string;
  error?: string;
  lastChecked: string;
}

interface ModelProbeResult {
  modelId: string;
  providerModelId: string;
  provider: string;
  available: boolean;
  error?: string;
  latencyMs: number;
  method: string;
}

interface ProbeReport {
  provider: string;
  totalModels: number;
  availableModels: number;
  unavailableModels: number;
  results: ModelProbeResult[];
  durationMs: number;
  timestamp: string;
}

interface ModelProviderStatus {
  provider: string;
  providerModelId: string;
  available: boolean;
  error?: string;
  method: string;
}

interface ModelCentricProbe {
  modelId: string;
  displayName: string;
  capability: string;
  providers: ModelProviderStatus[];
  availableCount: number;
  totalProviders: number;
}

interface HealthData {
  providers: Record<string, ProviderHealth>;
  circuitBreakers: CircuitBreakerStatus[];
  modelHealth: ModelHealthEntry[];
  alerts: AlertSummary;
  recentAlerts: AlertEntry[];
}

const PROVIDER_DISPLAY: Record<
  string,
  { name: string; color: string; icon: string }
> = {
  openai: { name: "OpenAI", color: "text-green-400", icon: "🟢" },
  anthropic: { name: "Anthropic", color: "text-orange-400", icon: "🟠" },
  google: { name: "Google Vertex AI", color: "text-blue-400", icon: "🔵" },
  together: { name: "Together AI", color: "text-purple-400", icon: "🟣" },
  fireworks: { name: "Fireworks AI", color: "text-red-400", icon: "🔴" },
  openrouter: { name: "OpenRouter", color: "text-cyan-400", icon: "🔷" },
};

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  transient: { label: "Transient", color: "bg-yellow-500/10 text-yellow-500" },
  billing: { label: "Billing / Credits", color: "bg-red-500/10 text-red-500" },
  auth: { label: "Authentication", color: "bg-red-600/10 text-red-400" },
  model_unavailable: {
    label: "Model Unavailable",
    color: "bg-orange-500/10 text-orange-500",
  },
};

// ===========================================
// Component
// ===========================================

export default function AdminAIHealthPage() {
  const { token } = useAuth();
  const [data, setData] = useState<HealthData | null>(null);
  const [balances, setBalances] = useState<ProviderBalanceInfo[]>([]);
  const [probeReports, setProbeReports] = useState<ProbeReport[]>([]);
  const [probeByModel, setProbeByModel] = useState<ModelCentricProbe[]>([]);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [probing, setProbing] = useState(false);
  const [resettingProvider, setResettingProvider] = useState<string | null>(
    null
  );

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [healthRes, balanceRes] = await Promise.all([
        fetch(adminApiUrl("/ai-health"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(adminApiUrl("/ai-health/balances"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (healthRes.ok) {
        const json = await healthRes.json();
        setData(json.data);
      }
      if (balanceRes.ok) {
        const json = await balanceRes.json();
        setBalances(json.data?.balances ?? []);
      }
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRecheck = async () => {
    if (!token) return;
    setRechecking(true);
    try {
      await fetch(adminApiUrl("/ai-health/recheck"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData();
    } finally {
      setRechecking(false);
    }
  };

  const handleReset = async (provider: string) => {
    if (!token) return;
    setResettingProvider(provider);
    try {
      await fetch(adminApiUrl(`/ai-health/reset/${provider}`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData();
    } finally {
      setResettingProvider(null);
    }
  };

  const handleAcknowledge = async (alertId: number) => {
    if (!token) return;
    try {
      await fetch(adminApiUrl("/ai-health/acknowledge"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alertId }),
      });
      await fetchData();
    } catch {
      // ignore
    }
  };

  const handleProbeModels = async () => {
    if (!token) return;
    setProbing(true);
    try {
      const res = await fetch(adminApiUrl("/ai-health/probe-models"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const json = await res.json();
        setProbeReports(json.data?.reports ?? []);
        setProbeByModel(json.data?.byModel ?? []);
      }
    } finally {
      setProbing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Failed to load AI health data
      </div>
    );
  }

  const healthyProviders = Object.entries(data.providers).filter(
    ([, p]) => p.hasApiKey && p.healthy
  ).length;
  const configuredProviders = Object.entries(data.providers).filter(
    ([, p]) => p.hasApiKey
  ).length;
  const unhealthyConfigured = Object.entries(data.providers).filter(
    ([, p]) => p.hasApiKey && !p.healthy
  ).length;
  const trippedBreakers = data.circuitBreakers.filter((c) => !c.healthy).length;
  const unhealthyModels = data.modelHealth.filter((m) => !m.healthy).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Provider Health</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of AI provider status, circuit breakers, and
            alerts
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecheck}
          disabled={rechecking}
        >
          {rechecking ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Re-check All
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Providers</CardDescription>
            <CardTitle className="text-2xl">
              {unhealthyConfigured > 0 ? (
                <span className="text-red-500">{healthyProviders}/{configuredProviders}</span>
              ) : (
                <span className="text-green-500">{healthyProviders}/{configuredProviders}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Server className="h-4 w-4" />
              <span>
                {unhealthyConfigured > 0
                  ? `${unhealthyConfigured} provider${unhealthyConfigured > 1 ? "s" : ""} with issues`
                  : "healthy / with API keys"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Circuit Breakers</CardDescription>
            <CardTitle className="text-2xl">
              {trippedBreakers > 0 ? (
                <span className="text-red-500">{trippedBreakers} tripped</span>
              ) : (
                <span className="text-green-500">All clear</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
              <span>provider-level protection</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Model Health</CardDescription>
            <CardTitle className="text-2xl">
              {unhealthyModels > 0 ? (
                <span className="text-orange-500">
                  {unhealthyModels} disabled
                </span>
              ) : (
                <span className="text-green-500">All healthy</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>auto-disabled models</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alerts</CardDescription>
            <CardTitle className="text-2xl">
              {data.alerts.unacknowledged > 0 ? (
                <span className="text-red-500">
                  {data.alerts.unacknowledged} new
                </span>
              ) : (
                <span className="text-green-500">None</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>unacknowledged</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Status Table */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
          <CardDescription>
            API key validation and circuit breaker state for each provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Provider</th>
                  <th className="pb-2 pr-4">API Key</th>
                  <th className="pb-2 pr-4">Circuit</th>
                  <th className="pb-2 pr-4">Failures</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Last Error</th>
                  <th className="pb-2 pr-4">Latency</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.circuitBreakers.map((cb) => {
                  const provider = data.providers[cb.provider];
                  const display = PROVIDER_DISPLAY[cb.provider] || {
                    name: cb.provider,
                    color: "text-gray-400",
                    icon: "⚪",
                  };

                  return (
                    <tr key={cb.provider} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <span className={`font-medium ${display.color}`}>
                          {display.icon} {display.name}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {!provider?.hasApiKey ? (
                          <Badge variant="outline" className="text-gray-500">
                            No API key
                          </Badge>
                        ) : provider.healthy ? (
                          <Badge
                            variant="outline"
                            className="text-green-500 border-green-500/30"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Valid
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-red-500 border-red-500/30"
                            title={provider.error || "Health check failed"}
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Unhealthy
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {cb.healthy ? (
                          <Badge
                            variant="outline"
                            className="text-green-500 border-green-500/30"
                          >
                            Closed
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-red-500 border-red-500/30"
                          >
                            OPEN
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {cb.recentFailures > 0 ? (
                          <span className="text-orange-400">
                            {cb.recentFailures} ({cb.uniqueFailedModels} models)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {cb.worstCategory ? (
                          <Badge
                            className={
                              CATEGORY_LABELS[cb.worstCategory]?.color ||
                              "bg-gray-500/10"
                            }
                          >
                            {CATEGORY_LABELS[cb.worstCategory]?.label ||
                              cb.worstCategory}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 max-w-[200px]">
                        {(() => {
                          const errorMsg = cb.lastError || (provider?.hasApiKey && !provider?.healthy ? provider?.error : null);
                          if (!errorMsg) return <span className="text-muted-foreground">—</span>;
                          return (
                            <span
                              className="text-red-400 truncate block text-xs"
                              title={errorMsg}
                            >
                              {errorMsg.slice(0, 80)}
                              {errorMsg.length > 80 ? "…" : ""}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-xs">
                        {provider?.latencyMs ? (
                          <span
                            className={
                              provider.latencyMs > 5000
                                ? "text-red-400"
                                : provider.latencyMs > 2000
                                  ? "text-yellow-400"
                                  : "text-green-400"
                            }
                          >
                            {provider.latencyMs}ms
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        {!cb.healthy && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReset(cb.provider)}
                            disabled={resettingProvider === cb.provider}
                            title="Reset circuit breaker"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Provider Account Balances */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Provider Account Balances
          </CardTitle>
          <CardDescription>
            Remaining credits / balance on external AI provider accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {balances.map((b) => {
              const display = PROVIDER_DISPLAY[b.provider] || { name: b.provider, color: "text-gray-400", icon: "⚪" };
              return (
                <div key={b.provider} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-medium ${display.color}`}>{display.icon} {display.name}</span>
                    {b.isFreeTier && (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-xs">
                        Free tier
                      </Badge>
                    )}
                  </div>
                  {!b.supported ? (
                    <div className="text-sm text-muted-foreground">{b.note || "No balance API available"}</div>
                  ) : b.error ? (
                    <div className="text-sm text-red-400">{b.error}</div>
                  ) : (
                    <div className="space-y-1">
                      {b.balanceUsd !== null && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Remaining</span>
                          <span className={`font-semibold tabular-nums ${b.balanceUsd < 1 ? "text-red-400" : b.balanceUsd < 10 ? "text-yellow-400" : "text-green-400"}`}>
                            ${b.balanceUsd.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {b.usedUsd !== null && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Used</span>
                          <span className="font-medium tabular-nums text-foreground">${b.usedUsd.toFixed(4)}</span>
                        </div>
                      )}
                      {b.limitUsd !== null && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Limit</span>
                          <span className="font-medium tabular-nums text-foreground">${b.limitUsd.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Model Availability Probe */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Model Availability Probe
            </CardTitle>
            <CardDescription>
              Check if individual models are available in provider catalogs. Together AI, OpenRouter, OpenAI, and Fireworks models are checked via catalog APIs.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleProbeModels}
            disabled={probing}
          >
            {probing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            {probing ? "Probing..." : "Probe All Models"}
          </Button>
        </CardHeader>
        <CardContent>
          {probeByModel.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Click &quot;Probe All Models&quot; to check individual model availability across all providers.
            </p>
          ) : (
            <div className="space-y-6">
              {/* Summary stats */}
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">
                  Total models: <strong className="text-foreground">{probeByModel.length}</strong>
                </span>
                <span className="text-muted-foreground">
                  With issues: <strong className="text-red-400">{probeByModel.filter((m) => m.availableCount < m.totalProviders).length}</strong>
                </span>
                <span className="text-muted-foreground">
                  Fully available: <strong className="text-green-400">{probeByModel.filter((m) => m.availableCount === m.totalProviders).length}</strong>
                </span>
              </div>

              {/* Model-centric table — models with issues first */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground text-xs">
                      <th className="pb-2 pr-3">Model</th>
                      <th className="pb-2 pr-3">Capability</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2">Provider Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probeByModel.map((model) => {
                      const hasIssues = model.availableCount < model.totalProviders;
                      const allSkipped = model.providers.every((p) => p.method === "skipped");
                      return (
                        <tr key={model.modelId} className={`border-b last:border-0 ${hasIssues ? "bg-red-500/5" : ""}`}>
                          <td className="py-3 pr-3">
                            <div>
                              <div className="font-medium text-foreground">{model.displayName}</div>
                              <div className="text-xs text-muted-foreground font-mono">{model.modelId}</div>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant="outline" className="text-xs">
                              {model.capability}
                            </Badge>
                          </td>
                          <td className="py-3 pr-3">
                            {allSkipped ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : hasIssues ? (
                              <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">
                                {model.availableCount}/{model.totalProviders}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
                                {model.availableCount}/{model.totalProviders}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {model.providers.map((ps) => {
                                const pd = PROVIDER_DISPLAY[ps.provider] || { name: ps.provider, color: "text-gray-400", icon: "⚪" };
                                const shortName = pd.name.replace(" AI", "").replace("Google Vertex ", "Vertex ");
                                if (ps.method === "skipped") {
                                  return (
                                    <span key={ps.provider} className="text-xs text-muted-foreground" title="No catalog API — assumed available">
                                      {shortName}: <span className="text-yellow-500">assumed</span>
                                    </span>
                                  );
                                }
                                return (
                                  <span key={ps.provider} className="text-xs" title={ps.error || ""}>
                                    {shortName}: {ps.available ? (
                                      <span className="text-green-400">✓</span>
                                    ) : (
                                      <span className="text-red-400">✗</span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Provider summary */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Provider Summary</h4>
                <div className="flex flex-wrap gap-3">
                  {probeReports.map((report) => {
                    const display = PROVIDER_DISPLAY[report.provider] || { name: report.provider, color: "text-gray-400", icon: "⚪" };
                    const hasIssues = report.unavailableModels > 0;
                    const isSkipped = report.results[0]?.method === "skipped";
                    return (
                      <div key={report.provider} className={`px-3 py-2 rounded-lg border text-xs ${hasIssues ? "border-red-500/20 bg-red-500/5" : "border-green-500/20 bg-green-500/5"}`}>
                        <span className={display.color}>{display.icon} {display.name}</span>
                        {isSkipped ? (
                          <span className="text-muted-foreground ml-2">(skipped)</span>
                        ) : (
                          <span className={`ml-2 ${hasIssues ? "text-red-400" : "text-green-400"}`}>
                            {report.availableModels}/{report.totalModels}
                          </span>
                        )}
                        <span className="text-muted-foreground ml-1">{report.durationMs}ms</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disabled Models (auto-disabled from runtime failures) */}
      {data.modelHealth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Disabled Models ({data.modelHealth.filter((m) => !m.healthy).length}
              )
            </CardTitle>
            <CardDescription>
              Models auto-disabled after repeated failures. They auto-recover
              after cooldown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Model</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Failures</th>
                    <th className="pb-2 pr-4">Disabled At</th>
                    <th className="pb-2">Last Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.modelHealth.map((m) => (
                    <tr key={m.modelId} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">
                        {m.modelId}
                      </td>
                      <td className="py-2 pr-4">
                        {m.healthy ? (
                          <Badge
                            variant="outline"
                            className="text-yellow-500 border-yellow-500/30"
                          >
                            Recovering
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-red-500 border-red-500/30"
                          >
                            Disabled
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {m.recentFailures}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {m.disabledAt
                          ? new Date(m.disabledAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2 text-xs text-red-400 max-w-[300px] truncate">
                        {m.lastError || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert History */}
      <Card>
        <CardHeader>
          <CardTitle>
            Recent Alerts
            {data.alerts.unacknowledged > 0 && (
              <Badge className="ml-2 bg-red-500/10 text-red-500">
                {data.alerts.unacknowledged} new
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Provider health events — down/recovered transitions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentAlerts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No alerts recorded yet. Alerts appear when providers go down or
              recover.
            </p>
          ) : (
            <div className="space-y-2">
              {data.recentAlerts.map((alert) => {
                const display = PROVIDER_DISPLAY[alert.provider] || {
                  name: alert.provider,
                  color: "text-gray-400",
                  icon: "⚪",
                };

                return (
                  <div
                    key={`${alert.id}-${alert.timestamp}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      alert.type === "provider_down"
                        ? "border-red-500/20 bg-red-500/5"
                        : "border-green-500/20 bg-green-500/5"
                    } ${alert.acknowledged ? "opacity-60" : ""}`}
                  >
                    {alert.type === "provider_down" ? (
                      <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${display.color}`}>
                          {display.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {alert.type === "provider_down" ? "went down" : "recovered"}
                        </span>
                        {alert.category && (
                          <Badge
                            className={`text-[10px] ${
                              CATEGORY_LABELS[alert.category]?.color ||
                              "bg-gray-500/10"
                            }`}
                          >
                            {CATEGORY_LABELS[alert.category]?.label ||
                              alert.category}
                          </Badge>
                        )}
                        {alert.cooldownMinutes && (
                          <span className="text-muted-foreground text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {alert.cooldownMinutes}min cooldown
                          </span>
                        )}
                      </div>
                      {alert.error && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {alert.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                      {!alert.acknowledged &&
                        alert.type === "provider_down" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            Ack
                          </Button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
