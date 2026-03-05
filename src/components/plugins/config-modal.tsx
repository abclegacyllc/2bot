"use client";

/**
 * Config Modal Component
 *
 * Modal dialog for editing plugin configuration.
 * Fetches the actual config schema from the plugin details endpoint
 * and renders dynamic form fields based on the schema.
 *
 * @module components/plugins/config-modal
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GatewayOption } from "@/lib/api-client";
import { getOrgGateways, getPluginBySlug, getUserGateways } from "@/lib/api-client";
import { apiUrl } from "@/shared/config/urls";
import type { ConfigSchema, ConfigSchemaProperty, UserPlugin } from "@/shared/types/plugin";

// ===========================================
// AI Model Options for ui-component selector
// ===========================================

const AI_MODEL_OPTIONS = [
  // Text Generation
  { id: "2bot-ai-text-free", label: "Text Free", group: "Text Generation" },
  { id: "2bot-ai-text-lite", label: "Text Lite", group: "Text Generation" },
  { id: "2bot-ai-text-pro", label: "Text Pro", group: "Text Generation" },
  { id: "2bot-ai-text-ultra", label: "Text Ultra", group: "Text Generation" },
  // Code Generation
  { id: "2bot-ai-code-free", label: "Code Free", group: "Code Generation" },
  { id: "2bot-ai-code-lite", label: "Code Lite", group: "Code Generation" },
  { id: "2bot-ai-code-pro", label: "Code Pro", group: "Code Generation" },
  { id: "2bot-ai-code-ultra", label: "Code Ultra", group: "Code Generation" },
  // Reasoning
  { id: "2bot-ai-reasoning-pro", label: "Reasoning Pro", group: "Reasoning" },
  { id: "2bot-ai-reasoning-ultra", label: "Reasoning Ultra", group: "Reasoning" },
  // Image Generation
  { id: "2bot-ai-image-pro", label: "Image Pro", group: "Image Generation" },
  { id: "2bot-ai-image-ultra", label: "Image Ultra", group: "Image Generation" },
  // Speech Synthesis
  { id: "2bot-ai-voice-pro", label: "Voice Pro", group: "Speech" },
  { id: "2bot-ai-voice-ultra", label: "Voice Ultra", group: "Speech" },
  // Speech Recognition
  { id: "2bot-ai-transcribe-lite", label: "Transcribe Lite", group: "Speech" },
] as const;

// ===========================================
// Types
// ===========================================

interface ConfigModalProps {
  plugin: UserPlugin;
  onClose: () => void;
  onSave: (config: Record<string, unknown>, gatewayId?: string | null, storageQuotaMb?: number) => void;
  isSaving: boolean;
  token?: string;
  organizationId?: string | null;
}

// ===========================================
// Component
// ===========================================

export function ConfigModal({ plugin, onClose, onSave, isSaving, token, organizationId }: ConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(plugin.config);
  const [schema, setSchema] = useState<ConfigSchema>({ properties: {} });
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);
  const [gateways, setGateways] = useState<GatewayOption[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(plugin.gatewayId);
  const [storageQuotaMb, setStorageQuotaMb] = useState<number>(plugin.storageQuotaMb ?? 50);
  const [storageUsage, setStorageUsage] = useState<{ keyCount: number; totalBytes: number } | null>(null);
  const needsGateway = plugin.requiredGateways && plugin.requiredGateways.length > 0;

  // Fetch the actual config schema from the plugin details endpoint
  const fetchSchema = useCallback(async () => {
    try {
      const result = await getPluginBySlug(plugin.pluginSlug, token);
      if (result.success && result.data?.configSchema) {
        setSchema(result.data.configSchema);
      }
    } catch {
      // If we can't fetch schema, fall back to empty
      console.error("Failed to fetch plugin schema");
    } finally {
      setIsLoadingSchema(false);
    }
  }, [plugin.pluginSlug, token]);

  // Fetch available gateways for the gateway selector
  // Always fetch — even plugins without requiredGateways can optionally bind a gateway
  const fetchGateways = useCallback(async () => {
    try {
      const result = organizationId
        ? await getOrgGateways(organizationId, token)
        : await getUserGateways(token);
      if (result.success && result.data) {
        // Filter to matching gateway types if plugin specifies required types
        const matching = needsGateway
          ? result.data.filter((g) => plugin.requiredGateways.includes(g.type))
          : result.data;
        setGateways(matching);
      }
    } catch {
      console.error("Failed to fetch gateways");
    }
  }, [needsGateway, organizationId, token, plugin.requiredGateways]);

  // Fetch storage usage stats for this plugin
  const fetchStorageUsage = useCallback(async () => {
    try {
      const baseUrl = organizationId
        ? apiUrl(`/orgs/${organizationId}/plugins/storage-stats`)
        : apiUrl('/plugins/storage-stats');
      const res = await fetch(baseUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data?.plugins) {
        // Match by pluginSlug in the pluginFile path
        const match = (json.data.plugins as Array<{ pluginFile: string; keyCount: number; totalBytes: number }>)
          .find((p) => p.pluginFile.includes(plugin.pluginSlug));
        if (match) {
          setStorageUsage({ keyCount: match.keyCount, totalBytes: match.totalBytes });
        }
      }
    } catch {
      // Non-critical — just don't show usage stats
    }
  }, [organizationId, token, plugin.pluginSlug]);

  useEffect(() => {
    fetchSchema();
    fetchGateways();
    fetchStorageUsage();
  }, [fetchSchema, fetchGateways, fetchStorageUsage]);

  const handleChange = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Always pass gateway selection — even plugins without requiredGateways can optionally bind one
    const gwChanged = selectedGatewayId !== plugin.gatewayId;
    onSave(config, gwChanged ? selectedGatewayId : undefined, storageQuotaMb !== (plugin.storageQuotaMb ?? 50) ? storageQuotaMb : undefined);
  };

  const renderField = (key: string, prop: ConfigSchemaProperty) => {
    const value = config[key] ?? prop.default;

    // AI Model Selector — custom uiComponent
    if (prop.uiComponent === "ai-model-selector") {
      // If enum is set, only show models in that list; otherwise show all
      const allowedModels = prop.enum
        ? AI_MODEL_OPTIONS.filter((m) => (prop.enum as string[]).includes(m.id))
        : AI_MODEL_OPTIONS;

      // Group models by category
      const groups = Array.from(new Set(allowedModels.map((m) => m.group)));

      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="text-foreground">
            {prop.title || key}
          </Label>
          <Select
            value={String(value ?? "")}
            onValueChange={(val) => handleChange(key, val)}
          >
            <SelectTrigger className="w-full bg-muted border-border text-foreground">
              <SelectValue placeholder="Select an AI model" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <div key={group}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group}</div>
                  {allowedModels
                    .filter((m) => m.group === group)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          {prop.description ? (
            <p className="text-xs text-muted-foreground">{prop.description}</p>
          ) : null}
        </div>
      );
    }

    if (prop.type === "boolean") {
      return (
        <div key={key} className="flex items-center gap-3">
          <Checkbox
            id={key}
            checked={Boolean(value)}
            onCheckedChange={(checked) => handleChange(key, checked)}
          />
          <Label htmlFor={key} className="text-foreground cursor-pointer">
            {prop.title || key}
          </Label>
          {prop.description ? (
            <span className="text-xs text-muted-foreground">{prop.description}</span>
          ) : null}
        </div>
      );
    }

    if (prop.type === "number") {
      return (
        <div key={key} className="space-y-2">
          <Label htmlFor={key} className="text-foreground">
            {prop.title || key}
          </Label>
          <Input
            id={key}
            type="number"
            value={String(value ?? "")}
            onChange={(e) => handleChange(key, Number(e.target.value))}
            min={prop.minimum}
            max={prop.maximum}
            className="bg-muted border-border text-foreground"
          />
          {prop.description ? (
            <p className="text-xs text-muted-foreground">{prop.description}</p>
          ) : null}
        </div>
      );
    }

    // Default: string input
    return (
      <div key={key} className="space-y-2">
        <Label htmlFor={key} className="text-foreground">
          {prop.title || key}
        </Label>
        <Input
          id={key}
          type="text"
          value={String(value ?? "")}
          onChange={(e) => handleChange(key, e.target.value)}
          className="bg-muted border-border text-foreground"
        />
        {prop.description ? (
          <p className="text-xs text-muted-foreground">{prop.description}</p>
        ) : null}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure {plugin.pluginName}</DialogTitle>
          <DialogDescription>Update plugin settings</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Gateway Selector — always shown, required types highlighted */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Gateway{needsGateway ? (
                  <span className="text-xs text-muted-foreground ml-1">(required: {plugin.requiredGateways.join(", ")})</span>
                ) : (
                  <span className="text-xs text-muted-foreground ml-1">(optional)</span>
                )}
              </Label>
              {gateways.length === 0 ? (
                needsGateway ? (
                  <p className="text-sm text-yellow-400">
                    No matching gateways found. Create a {plugin.requiredGateways.join(" or ")} gateway first.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No gateways available. Create one in the Gateways page to connect.
                  </p>
                )
              ) : (
                <Select
                  value={selectedGatewayId ?? "__none__"}
                  onValueChange={(val) => setSelectedGatewayId(val === "__none__" ? null : val)}
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder="— No gateway selected —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No gateway selected —</SelectItem>
                    {gateways.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.type}) — {g.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Storage Quota */}
            <div className="space-y-2">
              <Label htmlFor="storageQuota" className="text-foreground">
                Storage Quota (MB)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="storageQuota"
                  type="number"
                  value={storageQuotaMb}
                  onChange={(e) => setStorageQuotaMb(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
                  min={0}
                  max={500}
                  className="bg-muted border-border text-foreground w-24"
                />
                <span className="text-xs text-muted-foreground">
                  {storageQuotaMb === 0 ? "Unlimited" : `${storageQuotaMb} MB max`}
                </span>
              </div>
              {storageUsage ? (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    Current usage: <span className="text-foreground font-medium">{storageUsage.keyCount}</span> keys,{" "}
                    <span className="text-foreground font-medium">
                      {storageUsage.totalBytes < 1024
                        ? `${storageUsage.totalBytes} B`
                        : storageUsage.totalBytes < 1024 * 1024
                          ? `${(storageUsage.totalBytes / 1024).toFixed(1)} KB`
                          : `${(storageUsage.totalBytes / 1024 / 1024).toFixed(2)} MB`}
                    </span>
                  </span>
                  {storageQuotaMb > 0 ? (
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          storageUsage.totalBytes / (storageQuotaMb * 1024 * 1024) > 0.9
                            ? "bg-red-500"
                            : storageUsage.totalBytes / (storageQuotaMb * 1024 * 1024) > 0.7
                              ? "bg-yellow-500"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, (storageUsage.totalBytes / (storageQuotaMb * 1024 * 1024)) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Local key-value storage limit for this plugin. Set 0 for unlimited.
              </p>
            </div>

            {/* Config Fields */}
            {isLoadingSchema ? (
              <div className="space-y-3">
                <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
              </div>
            ) : schema.properties && Object.keys(schema.properties).length > 0 ? (
              Object.entries(schema.properties).map(([key, prop]) =>
                renderField(key, prop)
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                This plugin has no configurable options.
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-border text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || isLoadingSchema}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
