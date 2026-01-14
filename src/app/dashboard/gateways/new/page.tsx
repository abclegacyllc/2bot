"use client";

/**
 * Add Gateway Page
 *
 * Multi-step form for creating new gateways.
 * Step 1: Select gateway type
 * Step 2: Enter credentials and configuration
 *
 * @module app/dashboard/gateways/new
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AI_PROVIDERS, type AIProvider as AIProviderType } from "@/modules/gateway/gateway.types";
import type { GatewayType } from "@prisma/client";

// Icons
const BotIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const AIIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const LoadingIcon = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

/**
 * Gateway type options
 */
const GATEWAY_TYPES = [
  {
    type: "TELEGRAM_BOT" as GatewayType,
    name: "Telegram Bot",
    description: "Connect a Telegram bot to receive and send messages",
    icon: BotIcon,
  },
  {
    type: "AI" as GatewayType,
    name: "AI Provider",
    description: "Connect AI providers like OpenAI, Anthropic, or others",
    icon: AIIcon,
  },
] as const;

/**
 * Type selector step
 */
function TypeSelector({
  onSelect,
}: {
  onSelect: (type: GatewayType) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-white">Choose Gateway Type</h2>
        <p className="text-slate-400 mt-1">
          Select the type of gateway you want to connect
        </p>
      </div>

      <div className="grid gap-4">
        {GATEWAY_TYPES.map((gt) => (
          <button
            key={gt.type}
            onClick={() => onSelect(gt.type)}
            className="flex items-start gap-4 p-4 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-colors text-left group"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-blue-400 transition-colors">
              <gt.icon />
            </div>
            <div>
              <h3 className="font-medium text-white group-hover:text-blue-400 transition-colors">
                {gt.name}
              </h3>
              <p className="text-sm text-slate-500">{gt.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Telegram Bot form
 */
function TelegramBotForm({
  onSubmit,
  onBack,
  loading,
  error,
}: {
  onSubmit: (data: { name: string; botToken: string }) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, botToken });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-white">Add Telegram Bot</h2>
          <p className="text-slate-400 text-sm">
            Get your bot token from{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              @BotFather
            </a>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-white">
            Gateway Name
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Telegram Bot"
            required
            className="bg-slate-900 border-slate-800 text-white placeholder:text-slate-500"
          />
          <p className="text-xs text-slate-500">
            A friendly name to identify this gateway
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="botToken" className="text-white">
            Bot Token
          </Label>
          <Input
            id="botToken"
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            required
            pattern="\d+:[A-Za-z0-9_-]{35}"
            className="bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 font-mono"
          />
          <p className="text-xs text-slate-500">
            Format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="border-slate-700 text-slate-300"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={loading || !name || !botToken}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {loading ? <LoadingIcon /> : <CheckIcon />}
          <span className="ml-2">{loading ? "Creating..." : "Create Gateway"}</span>
        </Button>
      </div>
    </form>
  );
}

/**
 * AI Provider form
 */
function AIProviderForm({
  onSubmit,
  onBack,
  loading,
  error,
}: {
  onSubmit: (data: {
    name: string;
    provider: AIProviderType;
    apiKey: string;
    baseUrl?: string;
    model?: string;
  }) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<AIProviderType>("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");

  const providerInfo = AI_PROVIDERS[provider];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      provider,
      apiKey,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-white">Add AI Provider</h2>
          <p className="text-slate-400 text-sm">
            Connect an AI provider for text generation
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-white">
            Gateway Name
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My AI Gateway"
            required
            className="bg-slate-900 border-slate-800 text-white placeholder:text-slate-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="provider" className="text-white">
            AI Provider
          </Label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AIProviderType)}
            className="w-full h-10 px-3 rounded-md bg-slate-900 border border-slate-800 text-white"
          >
            {Object.entries(AI_PROVIDERS).map(([key, info]) => (
              <option key={key} value={key}>
                {info.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey" className="text-white">
            API Key
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            required
            className="bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 font-mono"
          />
        </div>

        {providerInfo.requiresBaseUrl && (
          <div className="space-y-2">
            <Label htmlFor="baseUrl" className="text-white">
              Base URL
            </Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              required={providerInfo.requiresBaseUrl}
              className="bg-slate-900 border-slate-800 text-white placeholder:text-slate-500"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="model" className="text-white">
            Default Model{" "}
            <span className="text-slate-500 font-normal">(optional)</span>
          </Label>
          <Input
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "openai" ? "gpt-4" : ""}
            className="bg-slate-900 border-slate-800 text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="border-slate-700 text-slate-300"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={loading || !name || !apiKey}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {loading ? <LoadingIcon /> : <CheckIcon />}
          <span className="ml-2">{loading ? "Creating..." : "Create Gateway"}</span>
        </Button>
      </div>
    </form>
  );
}

/**
 * Add Gateway page content
 */
function AddGatewayContent() {
  const router = useRouter();
  const { token } = useAuth();
  const [step, setStep] = useState<"type" | "form">("type");
  const [selectedType, setSelectedType] = useState<GatewayType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeSelect = (type: GatewayType) => {
    setSelectedType(type);
    setStep("form");
    setError(null);
  };

  const handleBack = () => {
    setStep("type");
    setSelectedType(null);
    setError(null);
  };

  const createGateway = async (data: {
    type: GatewayType;
    name: string;
    credentials: Record<string, unknown>;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:3001/api/gateways", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to create gateway");
      }

      // Redirect to gateway list
      router.push("/dashboard/gateways");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramSubmit = (data: { name: string; botToken: string }) => {
    createGateway({
      type: "TELEGRAM_BOT",
      name: data.name,
      credentials: { botToken: data.botToken },
    });
  };

  const handleAISubmit = (data: {
    name: string;
    provider: AIProviderType;
    apiKey: string;
    baseUrl?: string;
    model?: string;
  }) => {
    createGateway({
      type: "AI",
      name: data.name,
      credentials: {
        provider: data.provider,
        apiKey: data.apiKey,
        baseUrl: data.baseUrl,
        model: data.model,
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-lg mx-auto">
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="p-6">
            {step === "type" && <TypeSelector onSelect={handleTypeSelect} />}
            {step === "form" && selectedType === "TELEGRAM_BOT" && (
              <TelegramBotForm
                onSubmit={handleTelegramSubmit}
                onBack={handleBack}
                loading={loading}
                error={error}
              />
            )}
            {step === "form" && selectedType === "AI" && (
              <AIProviderForm
                onSubmit={handleAISubmit}
                onBack={handleBack}
                loading={loading}
                error={error}
              />
            )}
          </CardContent>
        </Card>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link
            href="/dashboard/gateways"
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel and return to gateways
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Add Gateway page with auth protection
 */
export default function AddGatewayPage() {
  return (
    <ProtectedRoute>
      <AddGatewayContent />
    </ProtectedRoute>
  );
}
