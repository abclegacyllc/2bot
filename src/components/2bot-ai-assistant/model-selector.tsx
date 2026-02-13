/**
 * 2Bot AI Assistant Widget - Model Selector
 *
 * Dropdown to select AI model for chat.
 * Shows 2Bot AI branded models with tier badges.
 * Provider details are hidden from users.
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
import { AlertTriangle, Boxes, Brain, Crown, Eye, Sparkles, Star, Zap } from "lucide-react";

/**
 * Format per-token pricing for display
 * Converts tiny per-token values to readable "per 1K tokens" format
 */
function _formatPricing(inputPerToken?: number, outputPerToken?: number): string {
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
 * Unified model option type (supports both formats)
 */
export type ModelOption = LegacyModelOption | TwoBotAIModelOption;

/**
 * Type guard to check if model is 2Bot AI format
 */
function isTwoBotAIModel(model: ModelOption): model is TwoBotAIModelOption {
  return 'tierInfo' in model && 'displayName' in model;
}

/**
 * Get display name for a model
 */
function getModelDisplayName(model: ModelOption): string {
  if (isTwoBotAIModel(model)) {
    return model.displayName;
  }
  return model.name;
}

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Show "Auto Mode" option at top for smart routing */
  showAutoMode?: boolean;
}

// Special value for Auto Mode
export const AUTO_MODE_VALUE = "auto";

// Legacy provider icons (for backward compatibility)
const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  openai: <Sparkles className="h-3 w-3" />,
  anthropic: <Brain className="h-3 w-3" />,
  together: <Boxes className="h-3 w-3" />,
};

// 2Bot AI tier icons
const TIER_ICONS: Record<string, React.ReactNode> = {
  lite: <Zap className="h-3 w-3" />,
  pro: <Star className="h-3 w-3" />,
  ultra: <Crown className="h-3 w-3" />,
};

// Tier badge colors
const TIER_BADGE_COLORS: Record<string, string> = {
  gray: "bg-gray-500/20 text-gray-600 dark:text-gray-400",
  blue: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  gold: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
};

// Capability level indicator dots
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

/**
 * Legacy badge component (for old model format)
 */
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

/**
 * 2Bot AI Tier Badge component
 */
function TierBadge({ tier, tierInfo }: { tier: string; tierInfo: TwoBotAITierInfo }) {
  return (
    <span className={cn(
      "text-[9px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5",
      TIER_BADGE_COLORS[tierInfo.badgeColor] || "bg-muted text-muted-foreground"
    )}>
      {TIER_ICONS[tier]}
      {tierInfo.displayName}
    </span>
  );
}

export function ModelSelector({ models, value, onChange, disabled, compact, showAutoMode }: ModelSelectorProps) {
  const isAutoMode = value === AUTO_MODE_VALUE;
  const selectedModel = models.find((m) => m.id === value);
  const isTwoBotAI = selectedModel && isTwoBotAIModel(selectedModel);

  return (
    <TooltipProvider>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn(
          "text-xs",
          compact ? "w-[160px] h-7" : "w-[200px] h-8"
        )}>
          <SelectValue>
            <div className="flex items-center gap-1.5">
              {isAutoMode ? (
                <>
                  <Sparkles className="h-3 w-3 text-green-500" />
                  <span className={cn(compact && "truncate")}>Auto Mode</span>
                  {!compact && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-green-500/20 text-green-600 dark:text-green-400">
                      Smart
                    </span>
                  )}
                </>
              ) : isTwoBotAI ? (
                <>
                  {TIER_ICONS[selectedModel.tier]}
                  <span className={cn(compact && "truncate")}>
                    {selectedModel.displayName.replace("2Bot AI ", "")}
                  </span>
                  {!compact && (
                    <TierBadge tier={selectedModel.tier} tierInfo={selectedModel.tierInfo} />
                  )}
                </>
              ) : selectedModel ? (
                <>
                  {PROVIDER_ICONS[(selectedModel as LegacyModelOption).provider || "openai"]}
                  <span className={cn(compact && "truncate")}>
                    {(selectedModel as LegacyModelOption).name || "Select model"}
                  </span>
                  {(selectedModel as LegacyModelOption).badge && !compact ? <ModelBadge badge={(selectedModel as LegacyModelOption).badge ?? ""} /> : null}
                </>
              ) : (
                <span>Select model</span>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="w-[340px]">
          {/* Auto Mode Option */}
          {showAutoMode ? <Tooltip>
              <TooltipTrigger asChild>
                <SelectItem value={AUTO_MODE_VALUE} className="border-b mb-1">
                  <div className="flex items-start gap-2 py-1">
                    <div className="mt-0.5">
                      <Sparkles className="h-3 w-3 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">Auto Mode</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-green-500/20 text-green-600 dark:text-green-400">
                          Recommended
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Smart routing picks the best model for each message
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                        <span>💰 Saves credits on simple queries</span>
                      </div>
                    </div>
                  </div>
                </SelectItem>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px]">
                <p className="text-xs font-medium">🧠 Smart Routing</p>
                <p className="text-xs text-muted-foreground mt-1">
                  AI analyzes your message and picks the optimal model - uses Lite for simple questions, Pro/Ultra for complex tasks.
                </p>
              </TooltipContent>
            </Tooltip> : null}
          
          {models.map((model) => {
            const is2BotAI = isTwoBotAIModel(model);
            const isDeprecated = is2BotAI ? !model.isAvailable : (model as LegacyModelOption).deprecated;
            
            return (
              <Tooltip key={model.id}>
                <TooltipTrigger asChild>
                  <SelectItem
                    value={model.id}
                    className={cn(isDeprecated && "opacity-60")}
                  >
                    <div className="flex items-start gap-2 py-1">
                      <div className="mt-0.5">
                        {is2BotAI 
                          ? TIER_ICONS[model.tier]
                          : PROVIDER_ICONS[(model as LegacyModelOption).provider]
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">
                            {getModelDisplayName(model)}
                          </span>
                          {is2BotAI ? (
                            <TierBadge tier={model.tier} tierInfo={model.tierInfo} />
                          ) : (model as LegacyModelOption).badge && (
                            <ModelBadge badge={(model as LegacyModelOption).badge ?? ""} />
                          )}
                          {isDeprecated ? <AlertTriangle className="h-3 w-3 text-amber-500" /> : null}
                        </div>
                        
                        {/* Description */}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {model.description}
                        </div>
                        
                        {/* Feature indicators for 2Bot AI models */}
                        {is2BotAI ? <div className="flex items-center gap-2 mt-1.5">
                            {model.features.vision ? <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                                <Eye className="h-2.5 w-2.5" />
                                <span>Vision</span>
                              </div> : null}
                            {model.features.reasoning ? <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                                <Brain className="h-2.5 w-2.5" />
                                <span>Reasoning</span>
                              </div> : null}
                            {model.features.codeExecution ? <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                                <Zap className="h-2.5 w-2.5" />
                                <span>Code</span>
                              </div> : null}
                          </div> : null}
                        
                        {/* Legacy capability indicators */}
                        {!is2BotAI && (model as LegacyModelOption).capabilities ? <div className="flex items-center gap-3 mt-1">
                            {(model as LegacyModelOption).capabilities?.canAnalyzeImages ? <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                                <Eye className="h-2.5 w-2.5" />
                                <span>Vision</span>
                              </div> : null}
                            {(model as LegacyModelOption).capabilities?.reasoning ? <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                <Zap className="h-2.5 w-2.5" />
                                <CapabilityDots level={(model as LegacyModelOption).capabilities?.reasoning} />
                              </div> : null}
                          </div> : null}
                      </div>
                    </div>
                  </SelectItem>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px]">
                  {is2BotAI ? (
                    <>
                      <p className="text-xs font-medium">{model.displayName}</p>
                      <p className="text-xs text-muted-foreground mt-1">{model.tierInfo.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {model.tags.map((tag) => (
                          <span key={tag} className="text-[9px] bg-muted px-1 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs">{model.description}</p>
                      {(model as LegacyModelOption).deprecated && (model as LegacyModelOption).deprecationMessage ? <p className="text-xs text-amber-500 mt-1">
                          ⚠️ {(model as LegacyModelOption).deprecationMessage}
                        </p> : null}
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}
