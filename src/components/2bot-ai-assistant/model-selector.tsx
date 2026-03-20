/**
 * 2Bot AI Assistant Widget - Model Selector
 *
 * Dropdown to select AI model for chat.
 * Shows Auto mode + real model names with price multipliers.
 * Compact primary list with expandable "Other Models" section.
 *
 * @module components/2bot-ai-assistant/model-selector
 */

"use client";

import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ChevronDown, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ModelCapabilities {
  inputTypes?: string[];
  outputTypes?: string[];
  reasoning?: string;
  speed?: string;
  creativity?: string;
  canAnalyzeImages?: boolean;
  canGenerateImages?: boolean;
  supportsStreaming?: boolean;
}

/**
 * 2Bot AI Model Features (from catalog)
 */
export interface TwoBotAIModelFeatures {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  jsonMode: boolean;
  systemMessage: boolean;
  multiTurn: boolean;
  reasoning: boolean;
  codeExecution: boolean;
}

/**
 * 2Bot AI Model Tier Info
 */
export interface TwoBotAITierInfo {
  displayName: string;
  description: string;
  badgeColor: "gray" | "blue" | "purple" | "gold";
}

/**
 * Legacy model option format (from /models endpoint)
 */
export interface LegacyModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
  isDefault?: boolean;
  tier?: number;
  badge?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  capabilities?: ModelCapabilities;
}

/**
 * 2Bot AI Model option format (from /catalog endpoint)
 */
export interface TwoBotAIModelOption {
  id: string;
  displayName: string;
  description: string;
  capability: string;
  tier: "lite" | "pro" | "ultra";
  tierInfo: TwoBotAITierInfo;
  maxContextTokens: number;
  maxOutputTokens: number;
  isAvailable: boolean;
  features: TwoBotAIModelFeatures;
  tags: string[];
}

/**
 * Real model (from /real-models endpoint)
 */
export interface RealModelOption {
  id: string;
  displayName: string;
  author: string;
  capability: string;
  /** Credits per 1K input tokens (text) or per unit (image/TTS/STT) */
  creditsInput: number;
  /** Credits per 1K output tokens (text/code only) */
  creditsOutput?: number;
  /** Unit label for non-text display */
  creditUnit: string;
  /** Cost tier */
  tier: "free" | "lite" | "pro" | "ultra";
  providers: string[];
  isPreview?: boolean;
  deprecated?: boolean;
  /** Whether the model is currently healthy (not auto-disabled due to repeated failures) */
  isHealthy?: boolean;
}

/**
 * Unified model option type (supports both formats)
 */
export type ModelOption = LegacyModelOption | TwoBotAIModelOption;

/**
 * Type guard to check if model is 2Bot AI format
 */
function isTwoBotAIModel(model: ModelOption): model is TwoBotAIModelOption {
  return 'tierInfo' in model && 'displayName' in model;
}

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Show "Auto Mode" option at top for smart routing */
  showAutoMode?: boolean;
  /** Real models from /real-models endpoint */
  realModels?: RealModelOption[];
}

// Special value for Auto Mode
export const AUTO_MODE_VALUE = "auto";

/**
 * Format credits per unit for display
 */
function fmtNum(n: number): string {
  if (n === 0) return "0";
  if (n >= 100) return String(Math.round(n));
  if (n >= 1) return parseFloat(n.toFixed(1)).toString();
  if (n >= 0.01) return parseFloat(n.toFixed(2)).toString();
  return parseFloat(n.toPrecision(2)).toString();
}

function formatCredits(input: number, output: number | undefined, unit: string): string {
  if (input === 0 && (!output || output === 0)) return "Free";
  // Text/code: show input/output per 1K tokens
  if (output !== null && output !== undefined && output > 0) return `${fmtNum(input)}/${fmtNum(output)}`;
  // Non-text: show value/unit
  if (input < 0.01) return `<0.01/${unit}`;
  return `${fmtNum(input)}/${unit}`;
}

const TIER_ORDER = ["free", "lite", "pro", "ultra"] as const;
const TIER_META: Record<string, { label: string; color: string }> = {
  free:  { label: "Free",  color: "text-emerald-400" },
  lite:  { label: "Lite",  color: "text-foreground/60" },
  pro:   { label: "Pro",   color: "text-blue-400" },
  ultra: { label: "Ultra", color: "text-amber-400" },
};

/**
 * Get credit color class based on tier
 */
function getCreditColor(tier: string): string {
  return TIER_META[tier]?.color ?? "text-foreground/60";
}

/**
 * Model row in the selector dropdown
 */
function ModelRow({
  model,
  isSelected,
  onClick,
}: {
  model: RealModelOption;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent/50 rounded-sm transition-colors",
        isSelected && "bg-accent/30"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isSelected ? (
          <Check className="h-3 w-3 text-foreground shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className={cn("truncate", isSelected && "font-medium")}>
          {model.displayName}
        </span>
        {model.isPreview && (
          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
        )}
      </div>
      <span className={cn("text-xs tabular-nums shrink-0 ml-2", getCreditColor(model.tier))}>
        {formatCredits(model.creditsInput, model.creditsOutput, model.creditUnit)}
      </span>
    </button>
  );
}

export function ModelSelector({ models, value, onChange, disabled, compact, showAutoMode, realModels }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset search when dropdown closes
  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      // Small delay to let the popover render
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  // Find the currently selected real model
  const selectedRealModel = useMemo(() =>
    realModels?.find((m) => m.id === value),
    [realModels, value]
  );

  // Find the selected catalog model (legacy support)
  const selectedCatalogModel = useMemo(() =>
    models.find((m) => m.id === value),
    [models, value]
  );

  const isAutoMode = value === AUTO_MODE_VALUE;

  // Filter real models by search
  const filteredRealModels = useMemo(() => {
    if (!realModels) return [];
    // Filter out unhealthy models (auto-disabled due to repeated failures)
    const healthy = realModels.filter((m) => m.isHealthy !== false);
    const q = search.toLowerCase().trim();
    if (!q) return healthy;
    return healthy.filter((m) =>
      m.displayName.toLowerCase().includes(q) ||
      m.author.toLowerCase().includes(q)
    );
  }, [realModels, search]);

  // Group models by author/provider (preserving server sort within each group)
  const authorGroups = useMemo(() => {
    const order: string[] = [];
    const groups: Record<string, RealModelOption[]> = {};
    for (const m of filteredRealModels) {
      if (!groups[m.author]) {
        groups[m.author] = [];
        order.push(m.author);
      }
      groups[m.author]!.push(m);
    }
    return { order, groups };
  }, [filteredRealModels]);

  // Get display name for the trigger button
  const triggerLabel = useMemo(() => {
    if (isAutoMode) return "Auto";
    if (selectedRealModel) return selectedRealModel.displayName;
    if (selectedCatalogModel) {
      return isTwoBotAIModel(selectedCatalogModel)
        ? selectedCatalogModel.displayName.replace("2Bot AI ", "")
        : (selectedCatalogModel as LegacyModelOption).name;
    }
    return "Select model";
  }, [isAutoMode, selectedRealModel, selectedCatalogModel]);

  const handleSelect = useCallback((modelId: string) => {
    onChange(modelId);
    setOpen(false);
  }, [onChange]);

  // When search is active, show all matching models flat (no sections)
  const isSearching = search.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            "text-xs gap-1 px-2",
            compact ? "h-7" : "h-8"
          )}
        >
          {isAutoMode && <Sparkles className="h-3 w-3 text-green-500" />}
          <span className="truncate max-w-[140px]">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0 overflow-hidden"
        align="start"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[350px] overflow-y-auto py-1">
          {/* Auto Mode option */}
          {showAutoMode && !isSearching && (
            <button
              type="button"
              onClick={() => handleSelect(AUTO_MODE_VALUE)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent/50 rounded-sm transition-colors",
                isAutoMode && "bg-accent/30"
              )}
            >
              <div className="flex items-center gap-2">
                {isAutoMode ? (
                  <Check className="h-3 w-3 text-foreground shrink-0" />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <Sparkles className="h-3 w-3 text-green-500" />
                <span className={cn(isAutoMode && "font-medium")}>Auto</span>
              </div>
              <span className="text-xs text-emerald-400">10% discount</span>
            </button>
          )}

          {/* Search results (flat list) */}
          {isSearching ? (
            filteredRealModels.length > 0 ? (
              filteredRealModels.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  isSelected={value === model.id}
                  onClick={() => handleSelect(model.id)}
                />
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No models found
              </div>
            )
          ) : (
            /* Provider-grouped model list */
            authorGroups.order.map((author) => {
              const models = authorGroups.groups[author];
              if (!models || models.length === 0) return null;
              return (
                <div key={author}>
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {author}
                  </div>
                  {models.map((model) => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      isSelected={value === model.id}
                      onClick={() => handleSelect(model.id)}
                    />
                  ))}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
