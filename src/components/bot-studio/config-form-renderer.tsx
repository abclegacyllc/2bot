"use client";

/**
 * Config Form Renderer
 *
 * Renders a JSON Schema config as a visual form with appropriate
 * input types for each property. Used in Bot Studio for no-code
 * template configuration.
 *
 * @module components/bot-studio/config-form-renderer
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { RealModelOption } from "@/components/2bot-ai-assistant/model-selector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/shared/config/urls";
import type { ConfigSchema, ConfigSchemaProperty } from "@/shared/types/plugin";
import { Plus, Trash2 } from "lucide-react";

// ===========================================
// Types
// ===========================================

interface ConfigFormRendererProps {
  schema: ConfigSchema;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

// ===========================================
// AI Model Options (branded tiers)
// ===========================================

const AI_MODEL_OPTIONS = [
  { id: "auto", label: "Auto (Recommended)", group: "Auto" },
  { id: "2bot-ai-text-free", label: "Text Free", group: "Text Generation" },
  { id: "2bot-ai-text-lite", label: "Text Lite", group: "Text Generation" },
  { id: "2bot-ai-text-pro", label: "Text Pro", group: "Text Generation" },
  { id: "2bot-ai-text-ultra", label: "Text Ultra", group: "Text Generation" },
  { id: "2bot-ai-code-free", label: "Code Free", group: "Code Generation" },
  { id: "2bot-ai-code-lite", label: "Code Lite", group: "Code Generation" },
  { id: "2bot-ai-code-pro", label: "Code Pro", group: "Code Generation" },
  { id: "2bot-ai-code-ultra", label: "Code Ultra", group: "Code Generation" },
  { id: "2bot-ai-reasoning-pro", label: "Reasoning Pro", group: "Reasoning" },
  { id: "2bot-ai-reasoning-ultra", label: "Reasoning Ultra", group: "Reasoning" },
  { id: "2bot-ai-image-pro", label: "Image Pro", group: "Image Generation" },
  { id: "2bot-ai-image-ultra", label: "Image Ultra", group: "Image Generation" },
  { id: "2bot-ai-voice-pro", label: "Voice Pro", group: "Speech" },
  { id: "2bot-ai-voice-ultra", label: "Voice Ultra", group: "Speech" },
  { id: "2bot-ai-transcribe-lite", label: "Transcribe Lite", group: "Speech" },
] as const;

// ===========================================
// Field Components
// ===========================================

function StringField({
  fieldKey,
  prop,
  value,
  onChange,
}: {
  fieldKey: string;
  prop: ConfigSchemaProperty;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const strVal = String(value ?? prop.default ?? "");
  // Use textarea for long text fields (system prompts, messages, etc.)
  const isLongText =
    fieldKey.toLowerCase().includes("prompt") ||
    fieldKey.toLowerCase().includes("message") ||
    fieldKey.toLowerCase().includes("welcome");

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldKey} className="text-foreground font-medium">
        {prop.title || fieldKey}
      </Label>
      {isLongText ? (
        <Textarea
          id={fieldKey}
          value={strVal}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          placeholder={prop.description}
          rows={3}
          className="bg-muted border-border text-foreground resize-none"
        />
      ) : (
        <Input
          id={fieldKey}
          type="text"
          value={strVal}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          placeholder={prop.description}
          className="bg-muted border-border text-foreground"
        />
      )}
      {prop.description ? (
        <p className="text-xs text-muted-foreground">{prop.description}</p>
      ) : null}
    </div>
  );
}

function BooleanField({
  fieldKey,
  prop,
  value,
  onChange,
}: {
  fieldKey: string;
  prop: ConfigSchemaProperty;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-1">
      <Checkbox
        id={fieldKey}
        checked={Boolean(value ?? prop.default)}
        onCheckedChange={(checked) => onChange(fieldKey, checked)}
        className="mt-0.5"
      />
      <div>
        <Label htmlFor={fieldKey} className="text-foreground cursor-pointer font-medium">
          {prop.title || fieldKey}
        </Label>
        {prop.description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{prop.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function NumberField({
  fieldKey,
  prop,
  value,
  onChange,
}: {
  fieldKey: string;
  prop: ConfigSchemaProperty;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const numVal = value ?? prop.default ?? "";
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldKey} className="text-foreground font-medium">
        {prop.title || fieldKey}
      </Label>
      <Input
        id={fieldKey}
        type="number"
        value={String(numVal)}
        onChange={(e) => onChange(fieldKey, Number(e.target.value))}
        min={prop.minimum}
        max={prop.maximum}
        className="bg-muted border-border text-foreground w-32"
      />
      {prop.description ? (
        <p className="text-xs text-muted-foreground">{prop.description}</p>
      ) : null}
      {(prop.minimum !== undefined || prop.maximum !== undefined) ? (
        <p className="text-xs text-muted-foreground/70">
          {prop.minimum !== undefined && prop.maximum !== undefined
            ? `Range: ${prop.minimum} – ${prop.maximum}`
            : prop.minimum !== undefined
              ? `Min: ${prop.minimum}`
              : `Max: ${prop.maximum}`}
        </p>
      ) : null}
    </div>
  );
}

// ===========================================
// AI Model helpers
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
  onChange: (key: string, val: unknown) => void;
  realModels: RealModelOption[];
  modelSearch: string;
  setModelSearch: (s: string) => void;
}) {
  const currentValue = String(value ?? prop.default ?? "auto");

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
    <div className="space-y-2">
      <Label htmlFor={fieldKey} className="text-foreground font-medium">
        {prop.title || fieldKey}
      </Label>
      <Select value={currentValue} onValueChange={(val) => onChange(fieldKey, val)}>
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

function ArrayField({
  fieldKey,
  prop,
  value,
  onChange,
}: {
  fieldKey: string;
  prop: ConfigSchemaProperty;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = (prop as Record<string, unknown>).items as
    | { type?: string; properties?: Record<string, ConfigSchemaProperty> }
    | undefined;

  const addItem = useCallback(() => {
    if (itemSchema?.properties) {
      // Add an empty object with default values from item properties
      const newItem: Record<string, unknown> = {};
      for (const [k, p] of Object.entries(itemSchema.properties)) {
        newItem[k] = p.default ?? "";
      }
      onChange(fieldKey, [...items, newItem]);
    } else {
      onChange(fieldKey, [...items, ""]);
    }
  }, [fieldKey, items, itemSchema, onChange]);

  const removeItem = useCallback(
    (index: number) => {
      onChange(
        fieldKey,
        items.filter((_, i) => i !== index)
      );
    },
    [fieldKey, items, onChange]
  );

  const updateItem = useCallback(
    (index: number, subKey: string | null, val: unknown) => {
      const next = [...items];
      if (subKey && typeof next[index] === "object" && next[index] !== null) {
        next[index] = { ...(next[index] as Record<string, unknown>), [subKey]: val };
      } else {
        next[index] = val;
      }
      onChange(fieldKey, next);
    },
    [fieldKey, items, onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-foreground font-medium">{prop.title || fieldKey}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {prop.description ? (
        <p className="text-xs text-muted-foreground">{prop.description}</p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 italic py-2">
          No items yet. Click &quot;Add&quot; to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-3 bg-muted/50 rounded-md border border-border/50"
            >
              <div className="flex-1 space-y-2">
                {itemSchema?.properties ? (
                  Object.entries(itemSchema.properties).map(([subKey, subProp]) => (
                    <div key={subKey}>
                      <Label className="text-xs text-muted-foreground">{subProp.title || subKey}</Label>
                      <Input
                        type="text"
                        value={String(
                          (typeof item === "object" && item !== null
                            ? (item as Record<string, unknown>)[subKey]
                            : "") ?? ""
                        )}
                        onChange={(e) => updateItem(idx, subKey, e.target.value)}
                        placeholder={subProp.description}
                        className="bg-background border-border text-foreground h-8 text-sm mt-1"
                      />
                    </div>
                  ))
                ) : (
                  <Input
                    type="text"
                    value={String(item ?? "")}
                    onChange={(e) => updateItem(idx, null, e.target.value)}
                    className="bg-background border-border text-foreground h-8 text-sm"
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(idx)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0 mt-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function ConfigFormRenderer({ schema, values, onChange }: ConfigFormRendererProps) {
  const properties = schema.properties ?? {};
  const entries = Object.entries(properties);
  const [realModels, setRealModels] = useState<RealModelOption[]>([]);
  const [modelSearch, setModelSearch] = useState("");

  // Fetch real models from /real-models endpoint
  useEffect(() => {
    // Only fetch if any field uses ai-model-selector
    const hasModelField = entries.some(([, p]) => p.uiComponent === "ai-model-selector");
    if (!hasModelField) return;

    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem("token") || "";
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(apiUrl('/2bot-ai/real-models'), {
          credentials: 'include',
          headers,
        });
        if (res.ok && !cancelled) {
          const json = await res.json();
          setRealModels(json.data?.models ?? []);
        }
      } catch {
        // Non-critical — fall back to branded tiers
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFieldChange = useCallback(
    (key: string, val: unknown) => {
      onChange({ ...values, [key]: val });
    },
    [values, onChange]
  );

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        This template has no configuration options — it works out of the box!
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, prop]) => {
        const value = values[key];

        // AI model selector (custom uiComponent)
        if (prop.uiComponent === "ai-model-selector") {
          return (
            <AIModelField
              key={key}
              fieldKey={key}
              prop={prop}
              value={value}
              onChange={handleFieldChange}
              realModels={realModels}
              modelSearch={modelSearch}
              setModelSearch={setModelSearch}
            />
          );
        }

        // Array fields
        if (prop.type === "array") {
          return (
            <ArrayField
              key={key}
              fieldKey={key}
              prop={prop}
              value={value}
              onChange={handleFieldChange}
            />
          );
        }

        // Boolean toggle
        if (prop.type === "boolean") {
          return (
            <BooleanField
              key={key}
              fieldKey={key}
              prop={prop}
              value={value}
              onChange={handleFieldChange}
            />
          );
        }

        // Number input
        if (prop.type === "number") {
          return (
            <NumberField
              key={key}
              fieldKey={key}
              prop={prop}
              value={value}
              onChange={handleFieldChange}
            />
          );
        }

        // Default: string input
        return (
          <StringField
            key={key}
            fieldKey={key}
            prop={prop}
            value={value}
            onChange={handleFieldChange}
          />
        );
      })}
    </div>
  );
}
