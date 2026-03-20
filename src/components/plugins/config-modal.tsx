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

import { useCallback, useEffect, useMemo, useState } from "react";

import type { RealModelOption } from "@/components/2bot-ai-assistant/model-selector";
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
// AI Model Selector Field (uses real models + branded fallback)
// ===========================================

function fmtNum(n: number): string {
  if (n === 0) return "0";
  if (n >= 100) return String(Math.round(n));
  if (n >= 1) return parseFloat(n.toFixed(1)).toString();
  if (n >= 0.01) return parseFloat(n.toFixed(2)).toString();
  return parseFloat(n.toPrecision(2)).toString();
}

function formatCredits(input: number, output: number | undefined, unit: string): string {
  if (input === 0 && (!output || output === 0)) return "Free";
  if (output !== null && output !== undefined && output > 0) return `${fmtNum(input)}/${fmtNum(output)}`;
  if (input < 0.01) return `<0.01/${unit}`;
  return `${fmtNum(input)}/${unit}`;
}

function getCreditColor(tier: string): string {
  if (tier === "free") return "text-emerald-500";
  if (tier === "lite") return "text-muted-foreground";
  if (tier === "pro") return "text-blue-500";
  return "text-amber-500";
}

/** Map capability filter from schema enum to real-models capability string */
function capabilityForEnum(enumValues?: readonly string[] | string[]): string | undefined {
  if (!enumValues || enumValues.length === 0) return undefined;
  const first = enumValues[0] as string;
  if (first.includes('-text-') || first.includes('-code-') || first.includes('-reasoning-')) return 'text-generation';
  if (first.includes('-image-')) return 'image-generation';
  if (first.includes('-voice-')) return 'speech-synthesis';
  if (first.includes('-transcribe-')) return 'speech-recognition';
  return undefined;
}

function AIModelField({
  fieldKey,
  prop,
  value,
  onChange,
  realModels,
  modelSearch,
  setModelSearch,
}: {
  fieldKey: string;
  prop: ConfigSchemaProperty;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  realModels: RealModelOption[];
  modelSearch: string;
  setModelSearch: (s: string) => void;
}) {
  const currentValue = String(value ?? "");

  // Filter real models by capability if schema specifies enum with branded IDs
  const capability = useMemo(() => capabilityForEnum(prop.enum as string[] | undefined), [prop.enum]);
  const filteredRealModels = useMemo(() => {
    let models = realModels;
    if (capability) {
      models = models.filter((m) => m.capability === capability);
    }
    if (modelSearch.trim()) {
      const q = modelSearch.toLowerCase();
      models = models.filter(
        (m) => m.displayName.toLowerCase().includes(q) || m.author.toLowerCase().includes(q)
      );
    }
    return models;
  }, [realModels, capability, modelSearch]);

  // Branded tier options as fallback
  const brandedOptions = useMemo(() => {
    if (prop.enum) {
      return AI_MODEL_OPTIONS.filter((m) => (prop.enum as string[]).includes(m.id));
    }
    return [...AI_MODEL_OPTIONS];
  }, [prop.enum]);

  const brandedGroups = useMemo(
    () => Array.from(new Set(brandedOptions.map((m) => m.group))),
    [brandedOptions]
  );

  // Find display name for currently selected value
  const selectedLabel = useMemo(() => {
    const real = realModels.find((m) => m.id === currentValue);
    if (real) return `${real.displayName} (${real.author})`;
    const branded = AI_MODEL_OPTIONS.find((m) => m.id === currentValue);
    if (branded) return branded.label;
    return currentValue || "Select an AI model";
  }, [currentValue, realModels]);

  const hasRealModels = filteredRealModels.length > 0;

  return (
    <div key={fieldKey} className="space-y-2">
      <Label htmlFor={fieldKey} className="text-foreground">
        {prop.title || fieldKey}
      </Label>
      <Select
        value={currentValue}
        onValueChange={(val) => onChange(fieldKey, val)}
      >
        <SelectTrigger className="w-full bg-muted border-border text-foreground">
          <SelectValue placeholder="Select an AI model">{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[350px]">
          {/* Search input for real models */}
          {hasRealModels && (
            <div className="px-2 py-1.5 border-b border-border/50">
              <Input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Search models..."
                className="h-7 text-xs bg-background"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Real models section */}
          {hasRealModels && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Real Models
              </div>
              {filteredRealModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="truncate">{m.displayName}</span>
                    <span className={`text-xs tabular-nums shrink-0 ${getCreditColor(m.tier)}`}>
                      {formatCredits(m.creditsInput, m.creditsOutput, m.creditUnit)}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {/* Branded tiers section (Auto modes) */}
          {!modelSearch.trim() && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {hasRealModels ? "Auto Tiers" : "AI Models"}
              </div>
              {brandedGroups.map((group) => (
                <div key={group}>
                  {brandedGroups.length > 1 && (
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">{group}</div>
                  )}
                  {brandedOptions
                    .filter((m) => m.group === group)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                </div>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
      {prop.description ? (
        <p className="text-xs text-muted-foreground">{prop.description}</p>
      ) : null}
    </div>
  );
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
  const [realModels, setRealModels] = useState<RealModelOption[]>([]);
  const [modelSearch, setModelSearch] = useState("");
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

  // Fetch real models from /real-models endpoint
  const fetchRealModels = useCallback(async () => {
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(apiUrl('/2bot-ai/real-models'), {
        credentials: 'include',
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        setRealModels(json.data?.models ?? []);
      }
    } catch {
      // Non-critical — fall back to branded tiers
    }
  }, [token]);

  useEffect(() => {
    fetchSchema();
    fetchGateways();
    fetchStorageUsage();
    fetchRealModels();
  }, [fetchSchema, fetchGateways, fetchStorageUsage, fetchRealModels]);

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
      return (
        <AIModelField
          key={key}
          fieldKey={key}
          prop={prop}
          value={value}
          onChange={handleChange}
          realModels={realModels}
          modelSearch={modelSearch}
          setModelSearch={setModelSearch}
        />
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
