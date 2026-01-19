"use client";

/**
 * Alert Settings Component
 *
 * Configuration UI for alert thresholds and notification channels.
 * Used by organization owners to customize alert behavior.
 *
 * @module components/organization/alert-settings
 */

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

interface AlertConfig {
  quotaWarningThreshold: number;
  quotaCriticalThreshold: number;
  errorRateThreshold: number;
  consecutiveFailures: number;
  dailyCostThreshold?: number;
  monthlyCostThreshold?: number;
  channels: {
    email: boolean;
    emailAddresses?: string[];
    telegram?: string;
    webhook?: string;
  };
  enabled: boolean;
}

interface AlertHistoryEntry {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
  acknowledged: boolean;
}

// ===========================================
// Component
// ===========================================

export function AlertSettings() {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<AlertConfig>>({});

  // Fetch config and history on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [configRes, historyRes] = await Promise.all([
          fetch("/api/alerts/config", {
            credentials: "include",
          }),
          fetch("/api/alerts/history?limit=10", {
            credentials: "include",
          }),
        ]);

        if (configRes.ok) {
          const data = await configRes.json();
          setConfig(data.data);
          setFormData(data.data);
        }

        if (historyRes.ok) {
          const data = await historyRes.json();
          setHistory(data.data || []);
        }
      } catch (err) {
        console.error("Failed to load alert settings:", err);
        setError("Failed to load alert settings");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/alerts/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      const data = await res.json();
      setConfig(data.data);
      setSuccess("Alert settings saved successfully");
    } catch {
      setError("Failed to save alert settings");
    } finally {
      setSaving(false);
    }
  };

  // Handle input change
  const handleChange = (field: keyof AlertConfig, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handle channel change
  const handleChannelChange = (channel: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        email: prev.channels?.email ?? config?.channels.email ?? true,
        [channel]: value,
      },
    }));
  };

  // Acknowledge alert
  const acknowledgeAlert = async (alertId: string) => {
    try {
      await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });

      setHistory((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, acknowledged: true } : a
        )
      );
    } catch {
      // Silently fail
    }
  };

  if (loading) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground mt-4">Loading alert settings...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Form */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground">Alert Configuration</CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure when and how you receive alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error/Success Messages */}
            {error ? <div className="bg-red-900/20 border border-red-800 text-red-400 p-4 rounded">
                {error}
              </div> : null}
            {success ? <div className="bg-green-900/20 border border-green-800 text-green-400 p-4 rounded">
                {success}
              </div> : null}

            {/* Enable/Disable */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enabled"
                checked={formData.enabled ?? config?.enabled ?? true}
                onCheckedChange={(checked) => handleChange("enabled", checked)}
              />
              <Label htmlFor="enabled" className="text-foreground">
                Enable alerts for this organization
              </Label>
            </div>

            {/* Threshold Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quotaWarningThreshold" className="text-foreground">
                  Warning Threshold (%)
                </Label>
                <Input
                  id="quotaWarningThreshold"
                  type="number"
                  min="1"
                  max="99"
                  value={formData.quotaWarningThreshold ?? config?.quotaWarningThreshold ?? 80}
                  onChange={(e) =>
                    handleChange("quotaWarningThreshold", parseInt(e.target.value))
                  }
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Alert when usage reaches this percentage
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quotaCriticalThreshold" className="text-foreground">
                  Critical Threshold (%)
                </Label>
                <Input
                  id="quotaCriticalThreshold"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.quotaCriticalThreshold ?? config?.quotaCriticalThreshold ?? 95}
                  onChange={(e) =>
                    handleChange("quotaCriticalThreshold", parseInt(e.target.value))
                  }
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Critical alert when usage reaches this percentage
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="errorRateThreshold" className="text-foreground">
                  Error Rate Threshold (per hour)
                </Label>
                <Input
                  id="errorRateThreshold"
                  type="number"
                  min="1"
                  value={formData.errorRateThreshold ?? config?.errorRateThreshold ?? 10}
                  onChange={(e) =>
                    handleChange("errorRateThreshold", parseInt(e.target.value))
                  }
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Alert when errors per hour exceed this number
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="consecutiveFailures" className="text-foreground">
                  Consecutive Failures
                </Label>
                <Input
                  id="consecutiveFailures"
                  type="number"
                  min="1"
                  value={formData.consecutiveFailures ?? config?.consecutiveFailures ?? 3}
                  onChange={(e) =>
                    handleChange("consecutiveFailures", parseInt(e.target.value))
                  }
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Alert after this many consecutive workflow failures
                </p>
              </div>
            </div>

            {/* Notification Channels */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Notification Channels</h3>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="emailEnabled"
                  checked={formData.channels?.email ?? config?.channels.email ?? true}
                  onCheckedChange={(checked) => handleChannelChange("email", checked)}
                />
                <Label htmlFor="emailEnabled" className="text-foreground">
                  Email notifications
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram" className="text-foreground">
                  Telegram Chat ID (optional)
                </Label>
                <Input
                  id="telegram"
                  type="text"
                  placeholder="e.g., -1001234567890"
                  value={formData.channels?.telegram ?? config?.channels.telegram ?? ""}
                  onChange={(e) => handleChannelChange("telegram", e.target.value || undefined)}
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Receive alerts via Telegram bot
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook" className="text-foreground">
                  Webhook URL (optional)
                </Label>
                <Input
                  id="webhook"
                  type="url"
                  placeholder="https://example.com/webhook"
                  value={formData.channels?.webhook ?? config?.channels.webhook ?? ""}
                  onChange={(e) => handleChannelChange("webhook", e.target.value || undefined)}
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Send alerts to a custom webhook endpoint
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Alert History */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Alerts</CardTitle>
          <CardDescription className="text-muted-foreground">
            Last 10 alerts for this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No alerts yet</p>
          ) : (
            <div className="space-y-3">
              {history.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded border ${
                    alert.severity === "critical"
                      ? "border-red-800 bg-red-900/20"
                      : alert.severity === "warning"
                      ? "border-yellow-800 bg-yellow-900/20"
                      : "border-border bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-foreground">{alert.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!alert.acknowledged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="border-border"
                      >
                        Acknowledge
                      </Button>
                    )}
                    {alert.acknowledged ? <span className="text-xs text-green-400">✓ Acknowledged</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
