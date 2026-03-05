"use client";

/**
 * Admin Pricing Monitor Dashboard
 *
 * Live comparison of provider API prices vs our model-pricing.ts.
 * - Run audit across all providers with one click
 * - See price mismatches, new models, removed models
 * - Provider-by-provider cards with status indicators
 *
 * Future-proof: New providers appear automatically when registered
 * in the backend service.
 *
 * @module app/(admin)/admin/pricing-monitor/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminApiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Check,
    CheckCircle2,
    Clock,
    DollarSign,
    Globe,
    Image,
    Layers,
    Loader2,
    MessageSquare,
    Mic,
    Music,
    RefreshCw,
    Search,
    Shield,
    ShieldAlert,
    Sparkles,
    Trash2,
    TrendingDown,
    Type,
    Video,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

// ===========================================
// Types (mirror backend types for the UI)
// ===========================================

interface PricingAuditReport {
  timestamp: string;
  status: "ok" | "warnings" | "critical";
  summary: {
    totalProviders: number;
    totalModelsChecked: number;
    priceMismatches: number;
    newModels: number;
    removedModels: number;
    errors: number;
  };
  newModelsByType?: Record<string, number>;
  providers: ProviderAuditResult[];
}

interface ProviderAuditResult {
  providerId: string;
  providerName: string;
  supportsPricing: boolean;
  supportsCapabilities: boolean;
  status: "ok" | "error";
  error?: string;
  totalModelsFromProvider: number;
  matchedModels: number;
  priceMismatches: PriceMismatch[];
  newModels: NewModelInfo[];
  removedModels: RemovedModelInfo[];
  verifiedModels: VerifiedModelInfo[];
  unverifiableModels: UnverifiableModelInfo[];
}

interface PriceMismatch {
  modelId: string;
  displayName?: string;
  type: string;
  pricingUnit: string;
  field: "input" | "output" | "both" | "price";
  our: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    perImage?: number;
    perChar?: number;
    perMinute?: number;
  };
  provider: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    perImage?: number;
    perChar?: number;
    perMinute?: number;
  };
  diffPercent: number;
}

interface NewModelInfo {
  modelId: string;
  displayName: string;
  type: string;
  pricingUnit?: string;
  pricing?: { inputPerMTok: number; outputPerMTok: number };
  imagePricing?: { perImage: number };
  contextLength?: number;
  webPrice?: string;
  pricingSource?: "api" | "web" | "api+web";
}

interface RemovedModelInfo {
  modelId: string;
  type: string;
}

interface VerifiedModelInfo {
  modelId: string;
  displayName?: string;
  type: string;
  pricingUnit: string;
  inputPerMTok?: number;
  outputPerMTok?: number;
  perImage?: number;
  perChar?: number;
  perMinute?: number;
  verificationSource?: "api" | "web" | "api+web";
  webPrice?: string;
}

interface UnverifiableModelInfo {
  modelId: string;
  displayName?: string;
  type: string;
  ourPricingUnit: string;
  ourPrice: string;
  reason: string;
}

// ===========================================
// Helpers
// ===========================================

function formatPrice(price: number): string {
  if (price === 0) return "FREE";
  if (price < 0.001) return `$${price.toFixed(6)}`;
  if (price < 0.01) return `$${price.toFixed(5)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

/** Format pricing display based on pricing unit */
function formatPricingForModel(model: {
  pricingUnit?: string;
  inputPerMTok?: number;
  outputPerMTok?: number;
  perImage?: number;
  perChar?: number;
  perMinute?: number;
  pricing?: { inputPerMTok: number; outputPerMTok: number };
  imagePricing?: { perImage: number };
}): string {
  const unit = model.pricingUnit;
  if (unit === "per_mtok") {
    const input = model.inputPerMTok ?? model.pricing?.inputPerMTok;
    const output = model.outputPerMTok ?? model.pricing?.outputPerMTok;
    if (input !== undefined && output !== undefined) {
      return `${formatPrice(input)} / ${formatPrice(output)} /MTok`;
    }
    if (input !== undefined) return `${formatPrice(input)} /MTok`;
    return "—";
  }
  if (unit === "per_image") {
    const p = model.perImage ?? model.imagePricing?.perImage;
    return p !== undefined ? `${formatPrice(p)} /image` : "—";
  }
  if (unit === "per_char") {
    return model.perChar !== undefined ? `${formatPrice(model.perChar)} /char` : "—";
  }
  if (unit === "per_minute") {
    return model.perMinute !== undefined ? `${formatPrice(model.perMinute)} /min` : "—";
  }
  // Fallback: try legacy pricing fields
  if (model.pricing) {
    return `${formatPrice(model.pricing.inputPerMTok)} / ${formatPrice(model.pricing.outputPerMTok)} /MTok`;
  }
  if (model.imagePricing) {
    return `${formatPrice(model.imagePricing.perImage)} /image`;
  }
  return "—";
}

/** Color-coded type badge with icon */
const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; colors: string }> = {
  chat:       { label: "Chat",        icon: MessageSquare, colors: "border-blue-500/30 text-blue-400 bg-blue-500/10" },
  image:      { label: "Image",       icon: Image,         colors: "border-purple-500/30 text-purple-400 bg-purple-500/10" },
  video:      { label: "Video",       icon: Video,         colors: "border-pink-500/30 text-pink-400 bg-pink-500/10" },
  audio:      { label: "Audio",       icon: Music,         colors: "border-orange-500/30 text-orange-400 bg-orange-500/10" },
  transcribe: { label: "Speech",      icon: Mic,           colors: "border-orange-500/30 text-orange-400 bg-orange-500/10" },
  embedding:  { label: "Embedding",   icon: Sparkles,      colors: "border-cyan-500/30 text-cyan-400 bg-cyan-500/10" },
  moderation: { label: "Moderation",  icon: Shield,        colors: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10" },
  rerank:     { label: "Rerank",      icon: ArrowUp,       colors: "border-teal-500/30 text-teal-400 bg-teal-500/10" },
  code:       { label: "Code",        icon: Type,          colors: "border-green-500/30 text-green-400 bg-green-500/10" },
  language:   { label: "Language",    icon: Globe,         colors: "border-indigo-500/30 text-indigo-400 bg-indigo-500/10" },
  unknown:    { label: "Unknown",     icon: Search,        colors: "border-zinc-500/30 text-zinc-400 bg-zinc-500/10" },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.unknown;
  if (!cfg) return <Badge variant="outline" className="text-xs border-zinc-500/30 text-zinc-400 bg-zinc-500/10">{type}</Badge>;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-xs gap-1 ${cfg.colors}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ===========================================
// Author mapping — normalize slugs to clean names + favicon URLs
// ===========================================

const AUTHOR_MAP: Record<string, { name: string; favicon?: string }> = {
  // Major labs
  "google":           { name: "Google",       favicon: "https://www.google.com/favicon.ico" },
  "openai":           { name: "OpenAI",       favicon: "https://openai.com/favicon.ico" },
  "meta-llama":       { name: "Meta",         favicon: "https://about.meta.com/favicon.ico" },
  "facebook":         { name: "Meta",         favicon: "https://about.meta.com/favicon.ico" },
  "anthropic":        { name: "Anthropic",    favicon: "https://anthropic.com/favicon.ico" },
  "mistralai":        { name: "Mistral",      favicon: "https://mistral.ai/favicon.ico" },
  // Chinese AI leaders
  "Qwen":             { name: "Qwen",         favicon: "https://qwen.ai/favicon.ico" },
  "deepseek-ai":      { name: "DeepSeek",     favicon: "https://www.deepseek.com/favicon.ico" },
  "Alibaba-NLP":      { name: "Alibaba",      favicon: "https://www.alibaba.com/favicon.ico" },
  "BAAI":             { name: "BAAI" },
  "ByteDance":        { name: "ByteDance" },
  "ByteDance-Seed":   { name: "ByteDance" },
  "minimax":          { name: "MiniMax" },
  "MiniMaxAI":        { name: "MiniMax" },
  "moonshotai":       { name: "Moonshot" },
  // Image / Video specialists
  "black-forest-labs": { name: "BFL",          favicon: "https://blackforestlabs.ai/favicon.ico" },
  "stabilityai":      { name: "Stability AI",  favicon: "https://stability.ai/favicon.ico" },
  "ideogram":         { name: "Ideogram" },
  "HiDream-ai":       { name: "HiDream" },
  "Lykon":            { name: "Lykon" },
  "RunDiffusion":     { name: "RunDiffusion" },
  "Rundiffusion":     { name: "RunDiffusion" },
  "pixverse":         { name: "PixVerse" },
  "vidu":             { name: "Vidu" },
  "kwaivgI":          { name: "Kling" },
  // Audio
  "cartesia":         { name: "Cartesia" },
  "hexgrad":          { name: "Hexgrad" },
  "rime-labs":        { name: "Rime" },
  // Code & Research
  "codellama":        { name: "Meta",         favicon: "https://about.meta.com/favicon.ico" },
  "nvidia":           { name: "NVIDIA",       favicon: "https://www.nvidia.com/favicon.ico" },
  "nim":              { name: "NVIDIA",       favicon: "https://www.nvidia.com/favicon.ico" },
  "Salesforce":       { name: "Salesforce" },
  "salesforce":       { name: "Salesforce" },
  "ServiceNow-AI":    { name: "ServiceNow" },
  "allenai":          { name: "Allen AI" },
  "NousResearch":     { name: "Nous Research" },
  "upstage":          { name: "Upstage" },
  "intfloat":         { name: "intfloat" },
  "mixedbread-ai":    { name: "Mixedbread" },
  "Wan-AI":           { name: "Wan AI" },
  "togethercomputer": { name: "Together AI" },
  "Virtue-AI":        { name: "Virtue AI" },
  "arcee-ai":         { name: "Arcee AI" },
  "arize-ai":         { name: "Arize AI" },
  "canopylabs":       { name: "Canopy Labs" },
  "decagon":          { name: "Decagon" },
  "deepcogito":       { name: "DeepCogito" },
  "essentialai":      { name: "Essential AI" },
  "agentica-org":     { name: "Agentica" },
  "sarvamai":         { name: "Sarvam AI" },
  "smarterdx":        { name: "SmarterDx" },
  "marin-community":  { name: "Marin" },
  "rica40325":        { name: "Rica" },
  // Anthropic models (the slug IS the model ID for Anthropic models without org prefix)
  "claude-3-5-haiku-20241022":     { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-3-5-sonnet-20241022":    { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-3-7-sonnet-20250219":    { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-3-haiku-20240307":       { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-3-opus-20240229":        { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-haiku-4-5-20251001":     { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-opus-4-1-20250805":      { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-opus-4-20250514":        { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-opus-4-5-20251101":      { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-opus-4-6":               { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-sonnet-4-20250514":      { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "claude-sonnet-4-5-20250929":    { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" },
  "zai-org":          { name: "ZAI" },
};

function resolveAuthor(slug: string): { name: string; favicon?: string } {
  // Direct lookup
  if (AUTHOR_MAP[slug]) return AUTHOR_MAP[slug];
  // Claude model IDs start with "claude-"
  if (slug.startsWith("claude-")) return { name: "Anthropic", favicon: "https://anthropic.com/favicon.ico" };
  // Capitalize first letter as fallback
  return { name: slug.charAt(0).toUpperCase() + slug.slice(1) };
}

function AuthorDisplay({ slug }: { slug: string }) {
  const { name, favicon } = resolveAuthor(slug);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={favicon}
          alt=""
          className="h-3.5 w-3.5 rounded-sm object-contain"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <span className="h-3.5 w-3.5 rounded-sm bg-muted-foreground/20 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
          {name.charAt(0)}
        </span>
      )}
      <span className="text-xs text-foreground">{name}</span>
    </span>
  );
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getStatusColor(status: "ok" | "warnings" | "critical" | "error"): string {
  switch (status) {
    case "ok": return "bg-green-500/10 text-green-500 border-green-500/20";
    case "warnings": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "critical": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "error": return "bg-red-500/10 text-red-500 border-red-500/20";
  }
}

function getStatusIcon(status: "ok" | "warnings" | "critical" | "error") {
  switch (status) {
    case "ok": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "warnings": return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case "critical": return <ShieldAlert className="h-5 w-5 text-red-500" />;
    case "error": return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

function DiffBadge({ percent }: { percent: number }) {
  if (Math.abs(percent) < 0.1) return null;
  const isUp = percent > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-red-400" : "text-green-400"}`}>
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(percent).toFixed(1)}%
    </span>
  );
}

// ===========================================
// Unified Model View — types & helpers
// ===========================================

interface UnifiedModelRow {
  id: string;
  modelId: string;
  displayName: string;
  author: string;
  type: string;
  provider: string;
  status: "verified" | "mismatch" | "new" | "removed" | "unverifiable";
  pricingUnit: string;
  ourPriceNum: number | null;
  ourPrice: string;
  providerPriceNum: number | null;
  providerPrice: string;
  webPrice: string;
  diffPercent: number | null;
  contextLength: number | null;
  pricingSource?: "api" | "web" | "api+web";
}

type SortField = "status" | "provider" | "author" | "model" | "type" | "ourPrice" | "providerPrice" | "diff" | "context";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {
  mismatch: 0,
  unverifiable: 1,
  removed: 2,
  new: 3,
  verified: 4,
};

function extractAuthor(modelId: string): string {
  const slash = modelId.indexOf("/");
  const slug = slash > 0 ? modelId.substring(0, slash) : modelId;
  return resolveAuthor(slug).name;
}

function getPrimaryPriceNum(model: {
  inputPerMTok?: number;
  outputPerMTok?: number;
  perImage?: number;
  perChar?: number;
  perMinute?: number;
  pricing?: { inputPerMTok: number; outputPerMTok: number };
  imagePricing?: { perImage: number };
}): number | null {
  if (model.inputPerMTok !== undefined) return model.inputPerMTok;
  if (model.pricing?.inputPerMTok !== undefined) return model.pricing.inputPerMTok;
  if (model.perImage !== undefined) return model.perImage;
  if (model.imagePricing?.perImage !== undefined) return model.imagePricing.perImage;
  if (model.perChar !== undefined) return model.perChar;
  if (model.perMinute !== undefined) return model.perMinute;
  return null;
}

function getMismatchPrimaryPrice(side: PriceMismatch["our"] | PriceMismatch["provider"]): number | null {
  return side.inputPerMTok ?? side.perImage ?? side.perChar ?? side.perMinute ?? null;
}

function formatMismatchSide(m: PriceMismatch, side: "our" | "provider"): string {
  const s = m[side];
  if (m.pricingUnit === "per_mtok") {
    if (s.inputPerMTok !== undefined && s.outputPerMTok !== undefined) {
      return `${formatPrice(s.inputPerMTok)} / ${formatPrice(s.outputPerMTok)} /MTok`;
    }
    return s.inputPerMTok !== undefined ? `${formatPrice(s.inputPerMTok)} /MTok` : "—";
  }
  if (m.pricingUnit === "per_image" && s.perImage !== undefined) return `${formatPrice(s.perImage)} /img`;
  if (m.pricingUnit === "per_char" && s.perChar !== undefined) return `${formatPrice(s.perChar)} /1Mch`;
  if (m.pricingUnit === "per_minute" && s.perMinute !== undefined) return `${formatPrice(s.perMinute)} /min`;
  return "—";
}

function flattenToUnifiedRows(report: PricingAuditReport): UnifiedModelRow[] {
  const rows: UnifiedModelRow[] = [];

  for (const prov of report.providers) {
    if (prov.status === "error") continue;
    const provName = prov.providerName;

    // Verified models
    for (const m of prov.verifiedModels) {
      const priceNum = getPrimaryPriceNum(m);
      rows.push({
        id: `${prov.providerId}:${m.modelId}:v`,
        modelId: m.modelId,
        displayName: m.displayName || m.modelId.split("/").pop() || m.modelId,
        author: extractAuthor(m.modelId),
        type: m.type,
        provider: provName,
        status: "verified",
        pricingUnit: m.pricingUnit,
        ourPriceNum: priceNum,
        ourPrice: formatPricingForModel(m),
        providerPriceNum: priceNum,
        providerPrice: formatPricingForModel(m),
        webPrice: m.webPrice || "—",
        diffPercent: 0,
        contextLength: null,
        pricingSource: m.verificationSource,
      });
    }

    // Mismatches
    for (const m of prov.priceMismatches) {
      const ourNum = getMismatchPrimaryPrice(m.our);
      const provNum = getMismatchPrimaryPrice(m.provider);
      rows.push({
        id: `${prov.providerId}:${m.modelId}:m`,
        modelId: m.modelId,
        displayName: m.displayName || m.modelId.split("/").pop() || m.modelId,
        author: extractAuthor(m.modelId),
        type: m.type,
        provider: provName,
        status: "mismatch",
        pricingUnit: m.pricingUnit,
        ourPriceNum: ourNum,
        ourPrice: formatMismatchSide(m, "our"),
        providerPriceNum: provNum,
        providerPrice: formatMismatchSide(m, "provider"),
        webPrice: "—",
        diffPercent: m.diffPercent,
        contextLength: null,
      });
    }

    // New models
    for (const m of prov.newModels) {
      const provNum = getPrimaryPriceNum(m);
      rows.push({
        id: `${prov.providerId}:${m.modelId}:n`,
        modelId: m.modelId,
        displayName: m.displayName || m.modelId.split("/").pop() || m.modelId,
        author: extractAuthor(m.modelId),
        type: m.type,
        provider: provName,
        status: "new",
        pricingUnit: m.pricingUnit || "unknown",
        ourPriceNum: null,
        ourPrice: "—",
        providerPriceNum: provNum,
        providerPrice: formatPricingForModel(m),
        webPrice: m.webPrice || "—",
        diffPercent: null,
        contextLength: m.contextLength || null,
        pricingSource: m.pricingSource,
      });
    }

    // Removed
    for (const m of prov.removedModels) {
      rows.push({
        id: `${prov.providerId}:${m.modelId}:r`,
        modelId: m.modelId,
        displayName: m.modelId.split("/").pop() || m.modelId,
        author: extractAuthor(m.modelId),
        type: m.type,
        provider: provName,
        status: "removed",
        pricingUnit: "unknown",
        ourPriceNum: null,
        ourPrice: "—",
        providerPriceNum: null,
        providerPrice: "—",
        webPrice: "—",
        diffPercent: null,
        contextLength: null,
      });
    }

    // Unverifiable
    for (const m of prov.unverifiableModels) {
      rows.push({
        id: `${prov.providerId}:${m.modelId}:u`,
        modelId: m.modelId,
        displayName: m.displayName || m.modelId.split("/").pop() || m.modelId,
        author: extractAuthor(m.modelId),
        type: m.type,
        provider: provName,
        status: "unverifiable",
        pricingUnit: m.ourPricingUnit,
        ourPriceNum: null,
        ourPrice: m.ourPrice,
        providerPriceNum: null,
        providerPrice: "—",
        webPrice: "—",
        diffPercent: null,
        contextLength: null,
      });
    }
  }

  return rows;
}

function sortUnifiedRows(rows: UnifiedModelRow[], field: SortField, dir: SortDir): UnifiedModelRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "status": cmp = (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5); break;
      case "provider": cmp = a.provider.localeCompare(b.provider); break;
      case "author": cmp = a.author.localeCompare(b.author); break;
      case "model": cmp = a.modelId.localeCompare(b.modelId); break;
      case "type": cmp = a.type.localeCompare(b.type); break;
      case "ourPrice": cmp = (a.ourPriceNum ?? -1) - (b.ourPriceNum ?? -1); break;
      case "providerPrice": cmp = (a.providerPriceNum ?? -1) - (b.providerPriceNum ?? -1); break;
      case "diff": cmp = (a.diffPercent ?? 0) - (b.diffPercent ?? 0); break;
      case "context": cmp = (a.contextLength ?? 0) - (b.contextLength ?? 0); break;
      default: cmp = 0;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ===========================================
// Cross-Provider Comparison — canonical name matching
// ===========================================

/**
 * Extract a canonical "model family" name from provider-specific model IDs.
 * E.g. Together's `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8`,
 *      Fireworks' `accounts/fireworks/models/deepseek-v3p1`,
 *      OpenRouter's `meta-llama/llama-4-maverick`
 * all become `llama-4-maverick`.
 */
function getModelFamily(modelId: string): string {
  let name = modelId;

  // Remove provider-specific prefixes
  name = name.replace(/^accounts\/fireworks\/models\//, "");
  name = name.replace(/^accounts\/[^/]+\/models\//, "");

  // Take last segment after /
  const slash = name.lastIndexOf("/");
  if (slash >= 0) name = name.substring(slash + 1);

  // Lowercase
  name = name.toLowerCase();

  // Remove common training/serving suffixes (order matters — longest first)
  const suffixes = [
    "-instruct-turbo", "-instruct-basic", "-instruct",
    "-turbo", "-fp8", "-fp16", "-bf16", "-int4", "-int8",
    "-it", "-hf", "-free", "-preview", "-basic",
    "-thinking", "-thinker",
  ];
  for (const s of suffixes) {
    if (name.endsWith(s)) name = name.slice(0, -s.length);
  }

  // Normalize dots → dashes (FLUX.1 → flux-1)
  name = name.replace(/\./g, "-");

  // Remove date suffixes (-20250514, -0324, -2411, -2507, -2512)
  name = name.replace(/-20\d{6}$/, "").replace(/-\d{4}$/, "");

  // Normalize version separators: 3p1 → 3.1, v3p1 → v3.1
  name = name.replace(/(\d)p(\d)/g, "$1.$2");

  // Normalize letter→digit boundaries: llama4 → llama-4, qwen3 → qwen-3
  // Skip 'v' prefix (v3 stays v3), 'x' (8x22b), 'e' (128e is a param count)
  name = name.replace(/([a-uw-z])(\d)/g, "$1-$2");

  // Remove parameter-size suffixes: -17b, -128e, -9b, -8x22b, -671b, etc.
  name = name.replace(/-\d+x?\d*[bme]/g, "");

  // Remove repeated/trailing dashes
  name = name.replace(/-{2,}/g, "-").replace(/-$/, "").replace(/^-/, "");

  return name;
}

// Manual override mapping for models that don't normalize cleanly
const CANONICAL_OVERRIDES: Record<string, string> = {
  // DeepSeek variations
  "deepseek-chat-v3": "deepseek-v3",
  "deepseek-v3p1": "deepseek-v3",
  // FLUX variations
  "flux-1-schnell": "flux-1-schnell",
  "flux-1-dev": "flux-1-dev",
  // Claude models (different date suffixes)
  "claude-opus-4-6": "claude-opus-4.6",
  "claude-sonnet-4-5": "claude-sonnet-4.5",
  "claude-haiku-4-5": "claude-haiku-4.5",
  "claude-sonnet-4": "claude-sonnet-4",
  "claude-opus-4": "claude-opus-4",
  "claude-opus-4-1": "claude-opus-4.1",
  "claude-opus-4-5": "claude-opus-4.5",
  "claude-3-5-sonnet": "claude-3.5-sonnet",
  "claude-3-5-haiku": "claude-3.5-haiku",
  "claude-3-haiku": "claude-3-haiku",
  "claude-3-opus": "claude-3-opus",
  "claude-3-7-sonnet": "claude-3.7-sonnet",
};

function getCanonicalName(modelId: string): string {
  const family = getModelFamily(modelId);
  return CANONICAL_OVERRIDES[family] || family;
}

/** A group of the same logical model offered by multiple providers */
interface CrossProviderGroup {
  canonicalName: string;
  displayName: string;
  author: string;
  type: string;
  /** Provider → row data */
  providers: Map<string, UnifiedModelRow>;
  /** Number of providers offering this model */
  providerCount: number;
  /** Best (lowest) input price per MTok across providers, or null */
  bestInputPrice: number | null;
  /** Which provider has the best price */
  bestProvider: string | null;
  /** Whether we use this model (have it in our pricing) */
  isOurs: boolean;
}

function buildCrossProviderGroups(rows: UnifiedModelRow[], minProviders = 2): CrossProviderGroup[] {
  const groupMap = new Map<string, CrossProviderGroup>();

  for (const row of rows) {
    const canonical = getCanonicalName(row.modelId);

    let group = groupMap.get(canonical);
    if (!group) {
      group = {
        canonicalName: canonical,
        displayName: row.displayName,
        author: row.author,
        type: row.type,
        providers: new Map(),
        providerCount: 0,
        bestInputPrice: null,
        bestProvider: null,
        isOurs: false,
      };
      groupMap.set(canonical, group);
    }

    // Prefer the better display name
    if (row.displayName.length > group.displayName.length) {
      group.displayName = row.displayName;
    }

    // Track whether any row is "ours" (verified, mismatch, unverifiable, removed)
    if (row.status !== "new") group.isOurs = true;

    group.providers.set(row.provider, row);
    group.providerCount = group.providers.size;

    // Track best price
    const price = row.providerPriceNum ?? row.ourPriceNum;
    if (price !== null && price >= 0) {
      if (group.bestInputPrice === null || price < group.bestInputPrice) {
        group.bestInputPrice = price;
        group.bestProvider = row.provider;
      }
    }
  }

  // Filter by minimum number of providers
  const filtered = [...groupMap.values()].filter(g => g.providerCount >= minProviders);

  // Sort: models we use first, then by provider count desc
  filtered.sort((a, b) => {
    if (a.isOurs !== b.isOurs) return a.isOurs ? -1 : 1;
    if (a.providerCount !== b.providerCount) return b.providerCount - a.providerCount;
    return a.canonicalName.localeCompare(b.canonicalName);
  });

  return filtered;
}

// ===========================================
// Main Page Component
// ===========================================

export default function AdminPricingMonitorPage() {
  const { token } = useAuth();
  const [report, setReport] = useState<PricingAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  // Check for cached report on mount
  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(adminApiUrl("/pricing-monitor/status"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data) setReport(data.data);
      }
    } catch {
      // Silently ignore — no cached report
    } finally {
      setInitialLoad(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Run a fresh audit
  const runAudit = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(adminApiUrl("/pricing-monitor/run"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setReport(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run audit");
    } finally {
      setLoading(false);
    }
  }, [token]);

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading pricing monitor...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-500" />
            Provider Price Monitor
          </h1>
          <p className="text-muted-foreground">
            Live comparison of provider API prices vs our model-pricing.ts
          </p>
        </div>
        <Button
          onClick={runAudit}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Run Audit
            </>
          )}
        </Button>
      </div>

      {error !== null && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400">
              <XCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No report yet */}
      {report === null && !loading && (
        <Card className="border-dashed">
          <CardContent className="pt-12 pb-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Audit Report</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Click &quot;Run Audit&quot; to compare all provider prices against our system.
              The audit queries each provider&apos;s API in real-time.
            </p>
            <Button
              onClick={runAudit}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Run First Audit
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report */}
      {report !== null && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard
              label="Status"
              value={report.status.toUpperCase()}
              icon={getStatusIcon(report.status)}
              className={getStatusColor(report.status)}
            />
            <SummaryCard
              label="Models Checked"
              value={report.summary.totalModelsChecked.toString()}
              icon={<Check className="h-5 w-5 text-blue-500" />}
              className="bg-blue-500/10 text-blue-400 border-blue-500/20"
            />
            <SummaryCard
              label="Price Mismatches"
              value={report.summary.priceMismatches.toString()}
              icon={<ShieldAlert className="h-5 w-5 text-red-500" />}
              className={report.summary.priceMismatches > 0
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-green-500/10 text-green-400 border-green-500/20"}
            />
            <SummaryCard
              label="New Models"
              value={report.summary.newModels.toString()}
              icon={<Sparkles className="h-5 w-5 text-blue-500" />}
              className={report.summary.newModels > 0
                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                : "bg-muted text-muted-foreground border-border"}
            />
            <SummaryCard
              label="Removed"
              value={report.summary.removedModels.toString()}
              icon={<Trash2 className="h-5 w-5 text-yellow-500" />}
              className={report.summary.removedModels > 0
                ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                : "bg-muted text-muted-foreground border-border"}
            />
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Last checked: {formatTimestamp(report.timestamp)}
          </div>

          {/* Provider Errors */}
          {report.providers.filter(p => p.status === "error").map(p => (
            <Card key={p.providerId} className="border-red-500/30">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">{p.providerName}</span>
                  <span className="text-muted-foreground text-sm">— {p.error}</span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Unified Model Table */}
          <Tabs defaultValue="our-models" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="our-models" className="gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Our Models
              </TabsTrigger>
              <TabsTrigger value="cross-provider" className="gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Cross-Provider
              </TabsTrigger>
              <TabsTrigger value="new-models" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                New Models
              </TabsTrigger>
              <TabsTrigger value="all-models" className="gap-1.5">
                <Search className="h-3.5 w-3.5" />
                All Models
              </TabsTrigger>
            </TabsList>

            <TabsContent value="our-models" className="mt-4">
              <OurModelsTable report={report} />
            </TabsContent>

            <TabsContent value="cross-provider" className="mt-4">
              <CrossProviderTable report={report} />
            </TabsContent>

            <TabsContent value="new-models" className="mt-4">
              <NewModelsTable report={report} />
            </TabsContent>

            <TabsContent value="all-models" className="mt-4">
              <UnifiedModelTable report={report} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ===========================================
// Sub-components
// ===========================================

function SummaryCard({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  className: string;
}) {
  return (
    <Card className={`border ${className}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium opacity-70">{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Our Models Table — only models in our pricing config
// ===========================================

function OurModelsTable({ report }: { report: PricingAuditReport }) {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const allRows = useMemo(() => flattenToUnifiedRows(report), [report]);

  // "Our models" = everything except status "new" (new = available but not in our config)
  const ourRows = useMemo(() => allRows.filter(r => r.status !== "new"), [allRows]);

  const providers = useMemo(() => [...new Set(ourRows.map(r => r.provider))].sort(), [ourRows]);
  const types = useMemo(() => [...new Set(ourRows.map(r => r.type))].sort(), [ourRows]);

  const rows = useMemo(() => {
    let result = ourRows;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        r.modelId.toLowerCase().includes(s) ||
        r.displayName.toLowerCase().includes(s) ||
        r.author.toLowerCase().includes(s)
      );
    }
    if (providerFilter !== "all") result = result.filter(r => r.provider === providerFilter);
    if (typeFilter !== "all") result = result.filter(r => r.type === typeFilter);
    return sortUnifiedRows(result, sortField, sortDir);
  }, [ourRows, search, providerFilter, typeFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  // Count by status
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of ourRows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [ourRows]);

  // Count mismatches where we're overpaying (provider price < our price)
  const savingsCount = useMemo(() =>
    ourRows.filter(r => r.status === "mismatch" && r.diffPercent !== null && r.diffPercent > 0).length
  , [ourRows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-500" />
            Our Configured Models ({ourRows.length})
          </span>
          {savingsCount > 0 && (
            <Badge className="bg-yellow-500/15 text-yellow-400 text-xs gap-1">
              <TrendingDown className="h-3 w-3" />
              {savingsCount} price update{savingsCount !== 1 ? "s" : ""} needed
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Models in our pricing config — shows verification status against provider APIs
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-400">
            ✓ Verified: {statusCounts.verified || 0}
          </span>
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400">
            ⚠ Mismatched: {statusCounts.mismatch || 0}
          </span>
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400">
            ? Unverifiable: {statusCounts.unverifiable || 0}
          </span>
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-yellow-500/10 text-yellow-400">
            ✗ Removed: {statusCounts.removed || 0}
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search model, author..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={providerFilter}
            onChange={e => setProviderFilter(e.target.value)}
            className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Types</option>
            {types.map(t => <option key={t} value={t}>{TYPE_CONFIG[t]?.label || t}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortableHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Provider" field="provider" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Author" field="author" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Model" field="model" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type" field="type" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Our Price" field="ourPrice" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Provider $" field="providerPrice" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Web $</th>
                <SortableHeader label="Diff" field="diff" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className={`border-b border-border/50 hover:bg-muted/30 ${
                    row.status === "mismatch" ? "bg-red-500/5" :
                    row.status === "removed" ? "bg-yellow-500/5" : ""
                  }`}
                >
                  <td className="py-1.5 px-2"><ModelStatusBadge status={row.status} /></td>
                  <td className="py-1.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{row.provider}</td>
                  <td className="py-1.5 px-2"><AuthorDisplay slug={row.modelId.split("/")[0] || row.author} /></td>
                  <td className="py-1.5 px-2 max-w-[280px]">
                    <div className="text-sm text-foreground truncate font-medium" title={row.modelId}>{row.displayName}</div>
                  </td>
                  <td className="py-1.5 px-2"><TypeBadge type={row.type} /></td>
                  <td className="py-1.5 px-2 text-right font-mono text-xs text-foreground whitespace-nowrap">{row.ourPrice}</td>
                  <td className={`py-1.5 px-2 text-right font-mono text-xs whitespace-nowrap ${
                    row.status === "mismatch" ? "text-red-400 font-semibold" : "text-foreground"
                  }`}>{row.providerPrice}</td>
                  <td className="py-1.5 px-2 text-right text-xs whitespace-nowrap">
                    {row.webPrice !== "—" ? <span className="text-blue-400">{row.webPrice}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {row.diffPercent !== null && row.diffPercent !== 0
                      ? <DiffBadge percent={row.diffPercent} />
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No models match the current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// New Models Table — models available from providers but not in our config
// ===========================================

function NewModelsTable({ report }: { report: PricingAuditReport }) {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("providerPrice");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const allRows = useMemo(() => flattenToUnifiedRows(report), [report]);

  // "New models" = status "new" — available from providers but not in our pricing config
  const newRows = useMemo(() => allRows.filter(r => r.status === "new"), [allRows]);

  const providers = useMemo(() => [...new Set(newRows.map(r => r.provider))].sort(), [newRows]);
  const types = useMemo(() => [...new Set(newRows.map(r => r.type))].sort(), [newRows]);

  // Cross-provider comparison for new models
  const crossProviderGroups = useMemo(() => buildCrossProviderGroups(newRows, 1), [newRows]);

  const rows = useMemo(() => {
    let result = newRows;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        r.modelId.toLowerCase().includes(s) ||
        r.displayName.toLowerCase().includes(s) ||
        r.author.toLowerCase().includes(s)
      );
    }
    if (providerFilter !== "all") result = result.filter(r => r.provider === providerFilter);
    if (typeFilter !== "all") result = result.filter(r => r.type === typeFilter);
    return sortUnifiedRows(result, sortField, sortDir);
  }, [newRows, search, providerFilter, typeFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  // Count with pricing data available
  const withPricing = useMemo(() => newRows.filter(r => r.providerPriceNum !== null && r.providerPriceNum > 0).length, [newRows]);

  // Count available from 2+ providers
  const multiProvider = useMemo(() => crossProviderGroups.filter(g => g.providerCount >= 2).length, [crossProviderGroups]);

  // Count by provider
  const providerCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of newRows) c[r.provider] = (c[r.provider] || 0) + 1;
    return c;
  }, [newRows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            New Models Available ({newRows.length})
          </span>
          <div className="flex gap-2">
            <Badge className="bg-blue-500/15 text-blue-400 text-xs">
              {withPricing} with pricing
            </Badge>
            {multiProvider > 0 && (
              <Badge className="bg-purple-500/15 text-purple-400 text-xs">
                {multiProvider} multi-provider
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Models from provider APIs not yet in our pricing config — candidates for addition
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Provider counts */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(providerCounts).sort((a, b) => b[1] - a[1]).map(([prov, count]) => (
            <button
              key={prov}
              onClick={() => setProviderFilter(providerFilter === prov ? "all" : prov)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                providerFilter === prov
                  ? "bg-foreground/10 text-foreground ring-1 ring-foreground/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={PROVIDER_COLORS[prov] || ""}>{prov}</span> {count}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search model, author..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Types</option>
            {types.map(t => <option key={t} value={t}>{TYPE_CONFIG[t]?.label || t}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortableHeader label="Provider" field="provider" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Author" field="author" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Model" field="model" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type" field="type" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Price" field="providerPrice" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Ctx" field="context" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                <th className="py-2 px-2 text-right text-muted-foreground font-medium text-xs">Also On</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                // Find if this model is available from other providers
                const canonical = getCanonicalName(row.modelId);
                const group = crossProviderGroups.find(g => g.canonicalName === canonical);
                const otherProviders = group
                  ? [...group.providers.keys()].filter(p => p !== row.provider)
                  : [];

                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 hover:bg-muted/30"
                  >
                    <td className="py-1.5 px-2 text-xs whitespace-nowrap">
                      <span className={PROVIDER_COLORS[row.provider] || "text-muted-foreground"}>{row.provider}</span>
                    </td>
                    <td className="py-1.5 px-2"><AuthorDisplay slug={row.modelId.split("/")[0] || row.author} /></td>
                    <td className="py-1.5 px-2 max-w-[280px]">
                      <div className="text-sm text-foreground truncate font-medium" title={row.modelId}>{row.displayName}</div>
                    </td>
                    <td className="py-1.5 px-2"><TypeBadge type={row.type} /></td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs text-foreground whitespace-nowrap">
                      {row.providerPrice !== "—" ? row.providerPrice : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {row.contextLength ? `${(row.contextLength / 1024).toFixed(0)}K` : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs">
                      {otherProviders.length > 0 ? (
                        <span className="text-purple-400">
                          {otherProviders.map(p => p.replace(" AI", "")).join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No new models match the current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Cross-Provider Comparison Table
// ===========================================

const PROVIDER_COLS = ["OpenAI", "Anthropic", "Together AI", "Fireworks AI", "OpenRouter"] as const;

const PROVIDER_COLORS: Record<string, string> = {
  "OpenAI": "text-green-400",
  "Anthropic": "text-orange-400",
  "Together AI": "text-blue-400",
  "Fireworks AI": "text-red-400",
  "OpenRouter": "text-purple-400",
};

function CrossProviderTable({ report }: { report: PricingAuditReport }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showOursOnly, setShowOursOnly] = useState(false);
  const [showSingleProvider, setShowSingleProvider] = useState(false);

  const allRows = useMemo(() => flattenToUnifiedRows(report), [report]);
  const groups = useMemo(
    () => buildCrossProviderGroups(allRows, showSingleProvider ? 1 : 2),
    [allRows, showSingleProvider]
  );

  const types = useMemo(() => [...new Set(groups.map(g => g.type))].sort(), [groups]);

  // Which providers actually appear in the data
  const activeProviders = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) for (const p of g.providers.keys()) s.add(p);
    return PROVIDER_COLS.filter(p => s.has(p));
  }, [groups]);

  const filteredGroups = useMemo(() => {
    let result = groups;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(g =>
        g.canonicalName.toLowerCase().includes(s) ||
        g.displayName.toLowerCase().includes(s) ||
        g.author.toLowerCase().includes(s)
      );
    }
    if (typeFilter !== "all") result = result.filter(g => g.type === typeFilter);
    if (showOursOnly) result = result.filter(g => g.isOurs);
    return result;
  }, [groups, search, typeFilter, showOursOnly]);

  // Compute savings opportunities: models we use from a provider but there's a cheaper one
  const savingsOpportunities = useMemo(() => {
    const opps: { group: CrossProviderGroup; currentProvider: string; currentPrice: number; bestPrice: number; savings: number }[] = [];
    for (const g of groups) {
      if (!g.isOurs || g.bestInputPrice === null) continue;
      // Find the provider we're currently using
      for (const [provName, row] of g.providers) {
        if (row.status === "new") continue; // not ours
        const ourPrice = row.ourPriceNum ?? row.providerPriceNum;
        if (ourPrice !== null && g.bestInputPrice !== null && ourPrice > g.bestInputPrice * 1.05) {
          opps.push({
            group: g,
            currentProvider: provName,
            currentPrice: ourPrice,
            bestPrice: g.bestInputPrice,
            savings: ((ourPrice - g.bestInputPrice) / ourPrice) * 100,
          });
        }
      }
    }
    return opps.sort((a, b) => b.savings - a.savings);
  }, [groups]);

  return (
    <div className="space-y-4">
      {/* Savings Opportunities Banner */}
      {savingsOpportunities.length > 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">
                {savingsOpportunities.length} savings opportunit{savingsOpportunities.length === 1 ? "y" : "ies"} found
              </span>
            </div>
            <div className="space-y-1">
              {savingsOpportunities.slice(0, 5).map(opp => (
                <div key={opp.group.canonicalName} className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="text-foreground font-medium">{opp.group.displayName}</span>
                  <span>→ switch from {opp.currentProvider} to</span>
                  <span className="text-green-400 font-medium">{opp.group.bestProvider}</span>
                  <span className="text-green-400">({opp.savings.toFixed(0)}% cheaper)</span>
                </div>
              ))}
              {savingsOpportunities.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  +{savingsOpportunities.length - 5} more...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-500" />
              Cross-Provider Comparison ({filteredGroups.length} model families)
            </span>
            <span className="text-xs text-muted-foreground font-normal">
              Same model, different provider pricing
            </span>
          </CardTitle>
          <CardDescription>
            Compare prices side by side across providers. Green = cheapest for that model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search model family..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Types</option>
              {types.map(t => <option key={t} value={t}>{TYPE_CONFIG[t]?.label || t}</option>)}
            </select>
            <button
              onClick={() => setShowOursOnly(!showOursOnly)}
              className={`px-3 py-2 rounded-md text-xs font-medium transition-colors border ${
                showOursOnly
                  ? "bg-green-500/15 text-green-400 border-green-500/30"
                  : "text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Our models only
            </button>
            <button
              onClick={() => setShowSingleProvider(!showSingleProvider)}
              className={`px-3 py-2 rounded-md text-xs font-medium transition-colors border ${
                showSingleProvider
                  ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                  : "text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Include single-provider
            </button>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 px-2 text-left text-muted-foreground font-medium text-xs w-[200px]">Model</th>
                  <th className="py-2 px-2 text-left text-muted-foreground font-medium text-xs">Author</th>
                  <th className="py-2 px-2 text-left text-muted-foreground font-medium text-xs">Type</th>
                  {activeProviders.map(p => (
                    <th key={p} className={`py-2 px-2 text-right font-medium text-xs ${PROVIDER_COLORS[p] || "text-muted-foreground"}`}>
                      {p.replace(" AI", "")}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-right text-muted-foreground font-medium text-xs">Best</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map(group => {
                  return (
                    <tr
                      key={group.canonicalName}
                      className={`border-b border-border/50 hover:bg-muted/30 ${group.isOurs ? "" : "opacity-60"}`}
                    >
                      <td className="py-2 px-2 max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          {group.isOurs && (
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" title="In our pricing config" />
                          )}
                          <span className="text-sm text-foreground truncate font-medium" title={group.canonicalName}>
                            {group.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <AuthorDisplay slug={group.author} />
                      </td>
                      <td className="py-2 px-2">
                        <TypeBadge type={group.type} />
                      </td>
                      {activeProviders.map(provName => {
                        const row = group.providers.get(provName);
                        if (!row) return <td key={provName} className="py-2 px-2 text-right text-xs text-muted-foreground/30">—</td>;
                        const price = row.providerPriceNum ?? row.ourPriceNum;
                        const isBest = price !== null && group.bestInputPrice !== null && price <= group.bestInputPrice && group.providerCount > 1;
                        const isOurModel = row.status !== "new";
                        return (
                          <td key={provName} className={`py-2 px-2 text-right font-mono text-xs whitespace-nowrap ${
                            isBest ? "text-green-400 font-semibold" : "text-foreground"
                          }`}>
                            <div className="flex flex-col items-end gap-0.5">
                              <span>{row.providerPrice !== "—" ? row.providerPrice : row.ourPrice}</span>
                              {isOurModel && (
                                <span className="text-[9px] text-green-500/60 font-sans font-normal">using</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-right">
                        {group.bestProvider && group.providerCount > 1 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 whitespace-nowrap">
                            {group.bestProvider.replace(" AI", "")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredGroups.length === 0 && (
                  <tr>
                    <td colSpan={activeProviders.length + 4} className="py-8 text-center text-muted-foreground">
                      No cross-provider models found matching filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> = In our pricing config
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-green-400 font-semibold font-mono">$0.15</span> = Cheapest provider
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-green-500/60 text-[9px]">using</span> = We use this model from this provider
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UnifiedModelTable({ report }: { report: PricingAuditReport }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const allRows = useMemo(() => flattenToUnifiedRows(report), [report]);

  const types = useMemo(() => [...new Set(allRows.map(r => r.type))].sort(), [allRows]);
  const authors = useMemo(() => [...new Set(allRows.map(r => r.author))].sort(), [allRows]);
  const providers = useMemo(() => [...new Set(allRows.map(r => r.provider))].sort(), [allRows]);

  const rows = useMemo(() => {
    let result = allRows;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        r.modelId.toLowerCase().includes(s) ||
        r.displayName.toLowerCase().includes(s) ||
        r.author.toLowerCase().includes(s)
      );
    }
    if (typeFilter !== "all") result = result.filter(r => r.type === typeFilter);
    if (statusFilter !== "all") result = result.filter(r => r.status === statusFilter);
    if (authorFilter !== "all") result = result.filter(r => r.author === authorFilter);
    if (providerFilter !== "all") result = result.filter(r => r.provider === providerFilter);
    return sortUnifiedRows(result, sortField, sortDir);
  }, [allRows, search, typeFilter, statusFilter, authorFilter, providerFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setAuthorFilter("all");
    setProviderFilter("all");
  };

  const hasFilters = search || typeFilter !== "all" || statusFilter !== "all" || authorFilter !== "all" || providerFilter !== "all";

  // Status counts for quick-filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of allRows) counts[r.status] = (counts[r.status] || 0) + 1;
    return counts;
  }, [allRows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-500" />
            All Models ({rows.length}{hasFilters ? ` of ${allRows.length}` : ""})
          </span>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground">
              Clear filters
            </Button>
          ) : null}
        </CardTitle>
        <CardDescription>
          Unified view across all providers — click column headers to sort
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Status quick-filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setStatusFilter(statusFilter === "all" ? "all" : "all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === "all" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            All {allRows.length}
          </button>
          {(["mismatch", "unverifiable", "new", "verified", "removed"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? "bg-foreground/10 text-foreground ring-1 ring-foreground/20" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ModelStatusBadge status={s} /> {statusCounts[s] || 0}
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search model, author..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={authorFilter}
            onChange={e => setAuthorFilter(e.target.value)}
            className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Authors</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select
            value={providerFilter}
            onChange={e => setProviderFilter(e.target.value)}
            className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Types</option>
            {types.map(t => <option key={t} value={t}>{TYPE_CONFIG[t]?.label || t}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortableHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Provider" field="provider" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Author" field="author" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Model" field="model" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type" field="type" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Our Price" field="ourPrice" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Provider $" field="providerPrice" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Web $</th>
                <SortableHeader label="Diff" field="diff" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Ctx" field="context" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className={`border-b border-border/50 hover:bg-muted/30 ${
                    row.status === "mismatch" ? "bg-red-500/5" :
                    row.status === "removed" ? "bg-yellow-500/5" :
                    row.status === "new" ? "bg-blue-500/[0.02]" : ""
                  }`}
                >
                  <td className="py-1.5 px-2">
                    <ModelStatusBadge status={row.status} />
                  </td>
                  <td className="py-1.5 px-2 text-xs text-muted-foreground whitespace-nowrap">
                    {row.provider}
                  </td>
                  <td className="py-1.5 px-2">
                    <AuthorDisplay slug={row.modelId.split("/")[0] || row.author} />
                  </td>
                  <td className="py-1.5 px-2 max-w-[280px]">
                    <div className="text-sm text-foreground truncate font-medium" title={row.modelId}>
                      {row.displayName}
                    </div>
                  </td>
                  <td className="py-1.5 px-2">
                    <TypeBadge type={row.type} />
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-xs text-foreground whitespace-nowrap">
                    {row.ourPrice}
                  </td>
                  <td className={`py-1.5 px-2 text-right font-mono text-xs whitespace-nowrap ${
                    row.status === "mismatch" ? "text-red-400 font-semibold" : "text-foreground"
                  }`}>
                    {row.providerPrice}
                  </td>
                  <td className="py-1.5 px-2 text-right text-xs whitespace-nowrap">
                    {row.webPrice !== "—" ? (
                      <span className="text-blue-400">{row.webPrice}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {row.diffPercent !== null && row.diffPercent !== 0
                      ? <DiffBadge percent={row.diffPercent} />
                      : <span className="text-muted-foreground text-xs">—</span>
                    }
                  </td>
                  <td className="py-1.5 px-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                    {row.contextLength ? `${(row.contextLength / 1024).toFixed(0)}K` : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No models match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableHeader({ label, field, current, dir, onSort, align = "left" }: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (field: SortField) => void;
  align?: "left" | "right" | "center";
}) {
  const active = field === current;
  return (
    <th
      className={`py-2 px-2 text-muted-foreground font-medium text-xs cursor-pointer hover:text-foreground select-none transition-colors ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${active ? "text-foreground" : ""}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (dir === "asc"
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />
        ) : null}
      </span>
    </th>
  );
}

function ModelStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "verified":
      return <Badge className="bg-green-500/15 text-green-400 text-[10px] px-1.5 py-0">✓ OK</Badge>;
    case "mismatch":
      return <Badge className="bg-red-500/15 text-red-400 text-[10px] px-1.5 py-0">⚠ Diff</Badge>;
    case "new":
      return <Badge className="bg-blue-500/15 text-blue-400 text-[10px] px-1.5 py-0">★ New</Badge>;
    case "removed":
      return <Badge className="bg-yellow-500/15 text-yellow-400 text-[10px] px-1.5 py-0">✗ Gone</Badge>;
    case "unverifiable":
      return <Badge className="bg-amber-500/15 text-amber-400 text-[10px] px-1.5 py-0">? N/A</Badge>;
    default:
      return null;
  }
}


