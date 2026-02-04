"use client";

/**
 * Credits Usage Breakdown
 *
 * Shows credit usage breakdown by category (AI, Marketplace, etc.)
 * and for AI usage, additional breakdown by action and model.
 *
 * @module components/credits/credits-usage-breakdown
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CreditUsageCategory } from "@/modules/credits";
import { Bot, PieChart, ShoppingBag, Sparkles, Zap } from "lucide-react";

export interface UsageBreakdown {
  byCategory: Record<CreditUsageCategory, number>;
  aiUsage?: {
    byCapability: Record<string, number>;
    byModel: Record<string, number>;
  };
}

export interface CreditsUsageBreakdownProps {
  data: UsageBreakdown;
  loading?: boolean;
  className?: string;
}

/**
 * Get human-readable label for AI capability
 * Maps capability codes to user-friendly names
 */
function getCapabilityLabel(capability: string): string {
  const labels: Record<string, string> = {
    // New capability names
    "text-generation": "Text Generation",
    "image-generation": "Image Generation",
    "speech-synthesis": "Speech Synthesis (TTS)",
    "speech-recognition": "Speech Recognition (STT)",
    "text-embedding": "Text Embedding",
    "image-understanding": "Image Understanding",
    "video-generation": "Video Generation",
    "video-understanding": "Video Understanding",
    "code-generation": "Code Generation",
    "code-execution": "Code Execution",
    "tool-use": "Tool Use",
    "web-browsing": "Web Browsing",
    "file-processing": "File Processing",
    // Legacy action names (fallback)
    chat: "Chat",
    image: "Image",
    tts: "Text-to-Speech",
    stt: "Speech-to-Text",
    embedding: "Embedding",
    vision: "Vision",
  };
  return labels[capability] || capability.charAt(0).toUpperCase() + capability.slice(1).replace(/-/g, " ");
}

/**
 * Format credits for display
 */
function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`;
  }
  return credits.toLocaleString();
}

/**
 * Get icon for category
 */
function getCategoryIcon(category: CreditUsageCategory) {
  const icons: Record<CreditUsageCategory, typeof Bot> = {
    ai_usage: Bot,
    marketplace: ShoppingBag,
    premium_feature: Sparkles,
    subscription: Zap,
    transfer: Zap,
    other: PieChart,
  };
  return icons[category];
}

/**
 * Get label for category
 */
function getCategoryLabel(category: CreditUsageCategory): string {
  const labels: Record<CreditUsageCategory, string> = {
    ai_usage: "2Bot AI",
    marketplace: "Marketplace",
    premium_feature: "Premium Features",
    subscription: "Subscriptions",
    transfer: "Transfers",
    other: "Other",
  };
  return labels[category];
}

/**
 * Get color for category
 */
function getCategoryColor(category: CreditUsageCategory): string {
  const colors: Record<CreditUsageCategory, string> = {
    ai_usage: "bg-blue-500",
    marketplace: "bg-purple-500",
    premium_feature: "bg-amber-500",
    subscription: "bg-green-500",
    transfer: "bg-cyan-500",
    other: "bg-gray-500",
  };
  return colors[category];
}

/**
 * Simple horizontal bar
 */
function BreakdownBar({
  items,
  total,
  getLabel,
  getColor,
}: {
  items: Array<{ key: string; value: number }>;
  total: number;
  getLabel: (key: string) => string;
  getColor?: (key: string) => string;
}) {
  if (items.length === 0 || total === 0) {
    return (
      <div className="text-sm text-muted-foreground">No usage data</div>
    );
  }

  // Sort by value descending
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const colors = ["bg-primary", "bg-primary/80", "bg-primary/60", "bg-primary/40", "bg-primary/20"];

  return (
    <div className="space-y-2">
      {sorted.slice(0, 5).map((item, i) => {
        const percent = (item.value / total) * 100;
        const color = getColor?.(item.key) || colors[i % colors.length];

        return (
          <div key={item.key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="truncate">{getLabel(item.key)}</span>
              <span className="text-muted-foreground">
                {formatCredits(item.value)}
              </span>
            </div>
            <Progress
              value={percent}
              className="h-2"
              // @ts-ignore - custom color prop
              indicatorClassName={color}
            />
          </div>
        );
      })}
      {sorted.length > 5 && (
        <p className="text-xs text-muted-foreground">
          +{sorted.length - 5} more
        </p>
      )}
    </div>
  );
}

export function CreditsUsageBreakdown({
  data,
  loading = false,
  className,
}: CreditsUsageBreakdownProps) {
  if (loading) {
    return (
      <div className={cn("grid gap-4 md:grid-cols-2", className)}>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate totals
  const categoryTotal = Object.values(data.byCategory).reduce((a, b) => a + b, 0);
  const categoryItems = Object.entries(data.byCategory)
    .filter(([_, v]) => v > 0)
    .map(([k, v]) => ({ key: k as CreditUsageCategory, value: v }));

  // AI breakdown by capability
  const aiCapabilityData = data.aiUsage?.byCapability || {};
  const aiCapabilityTotal = Object.values(aiCapabilityData).reduce((a, b) => a + b, 0);
  const aiModelTotal = data.aiUsage
    ? Object.values(data.aiUsage.byModel).reduce((a, b) => a + b, 0)
    : 0;
  // Always using capability names now
  const isUsingCapabilities = true;

  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      {/* By Category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PieChart className="h-4 w-4" />
            By Category
          </CardTitle>
          <CardDescription>
            Total: {formatCredits(categoryTotal)} credits
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">No usage data</div>
          ) : (
            <div className="space-y-3">
              {categoryItems.map((item) => {
                const Icon = getCategoryIcon(item.key);
                const percent = (item.value / categoryTotal) * 100;

                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {getCategoryLabel(item.key)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatCredits(item.value)} ({percent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full transition-all", getCategoryColor(item.key))}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Usage Breakdown (if available) */}
      {data.aiUsage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" />
              AI Usage Breakdown
            </CardTitle>
            <CardDescription>
              By capability and model
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* By Capability (or legacy Action) */}
            <div>
              <h4 className="mb-2 text-sm font-medium">
                {isUsingCapabilities ? "By Capability" : "By Action"}
              </h4>
              <BreakdownBar
                items={Object.entries(aiCapabilityData).map(([k, v]) => ({
                  key: k,
                  value: v,
                }))}
                total={aiCapabilityTotal}
                getLabel={getCapabilityLabel}
              />
            </div>

            {/* By Model */}
            <div>
              <h4 className="mb-2 text-sm font-medium">By Model</h4>
              <BreakdownBar
                items={Object.entries(data.aiUsage.byModel).map(([k, v]) => ({
                  key: k,
                  value: v,
                }))}
                total={aiModelTotal}
                getLabel={(k) => k}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
