/**
 * 2Bot AI Assistant Widget - Model Selector
 *
 * Dropdown to select AI model for chat.
 * Shows model capabilities, badges, and pricing.
 *
 * @module components/2bot-ai-assistant/model-selector
 */

"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AlertTriangle, Brain, Eye, Sparkles, Zap } from "lucide-react";

/**
 * Format per-token pricing for display
 * Converts tiny per-token values to readable "per 1K tokens" format
 */
function formatPricing(inputPerToken?: number, outputPerToken?: number): string {
  if (!inputPerToken && !outputPerToken) return "Free";
  
  // Convert per-token to per-1K for readability
  const inputPer1k = (inputPerToken || 0) * 1000;
  const outputPer1k = (outputPerToken || 0) * 1000;
  
  // Format nicely
  const formatValue = (v: number) => {
    if (v >= 1) return v.toFixed(2);
    if (v >= 0.01) return v.toFixed(3);
    return v.toFixed(4);
  };
  
  return `${formatValue(inputPer1k)}/${formatValue(outputPer1k)} credits/1K tokens`;
}

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

export interface ModelOption {
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

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  openai: <Sparkles className="h-3 w-3" />,
  anthropic: <Brain className="h-3 w-3" />,
};

// Capability level to dots (like OpenAI shows)
function CapabilityDots({ level }: { level?: string }) {
  const levelMap: Record<string, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    highest: 4,
  };
  const filled = levelMap[level || "medium"] || 2;

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            i <= filled ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

function ModelBadge({ badge }: { badge: string }) {
  const badgeColors: Record<string, string> = {
    FAST: "bg-green-500/20 text-green-600 dark:text-green-400",
    REASONING: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
    BEST: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    HD: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    NEW: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
  };

  return (
    <span className={cn(
      "text-[9px] px-1 py-0.5 rounded font-medium",
      badgeColors[badge] || "bg-muted text-muted-foreground"
    )}>
      {badge}
    </span>
  );
}

export function ModelSelector({ models, value, onChange, disabled, compact }: ModelSelectorProps) {
  const selectedModel = models.find((m) => m.id === value);

  return (
    <TooltipProvider>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn(
          "text-xs",
          compact ? "w-[140px] h-7" : "w-[180px] h-8"
        )}>
          <SelectValue>
            <div className="flex items-center gap-1.5">
              {PROVIDER_ICONS[selectedModel?.provider || "openai"]}
              <span className={cn(compact && "truncate")}>{selectedModel?.name || "Select model"}</span>
              {selectedModel?.badge && !compact && (
                <ModelBadge badge={selectedModel.badge} />
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="w-[320px]">
          {models.map((model) => (
            <Tooltip key={model.id}>
              <TooltipTrigger asChild>
                <SelectItem
                  value={model.id}
                  className={cn(model.deprecated && "opacity-60")}
                >
                  <div className="flex items-start gap-2 py-1">
                    <div className="mt-0.5">{PROVIDER_ICONS[model.provider]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{model.name}</span>
                        {model.badge && <ModelBadge badge={model.badge} />}
                        {model.deprecated && (
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatPricing(model.creditsPerInputToken, model.creditsPerOutputToken)}
                      </div>
                      {/* Capability indicators */}
                      {model.capabilities && (
                        <div className="flex items-center gap-3 mt-1">
                          {model.capabilities.canAnalyzeImages && (
                            <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                              <Eye className="h-2.5 w-2.5" />
                              <span>Vision</span>
                            </div>
                          )}
                          {model.capabilities.reasoning && (
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                              <Zap className="h-2.5 w-2.5" />
                              <CapabilityDots level={model.capabilities.reasoning} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </SelectItem>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="text-xs">{model.description}</p>
                {model.deprecated && model.deprecationMessage && (
                  <p className="text-xs text-amber-500 mt-1">
                    ⚠️ {model.deprecationMessage}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}
