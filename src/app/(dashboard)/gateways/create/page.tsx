"use client";

/**
 * Add Gateway Page
 *
 * Multi-step form for creating new gateways.
 * Step 1: Select gateway type
 * Step 2: Enter credentials and configuration
 *
 * @module app/(dashboard)/gateways/create
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { AI_PROVIDERS, type AIProvider as AIProviderType } from "@/modules/gateway/gateway.types";
import { apiUrl } from "@/shared/config/urls";
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
 * Custom Gateway Icon
 */
const CustomGatewayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
  {
    type: "CUSTOM_GATEWAY" as GatewayType,
    name: "Custom Gateway",
    description: "Create an inbound endpoint for external services (Stripe, GitHub, etc.)",
    icon: CustomGatewayIcon,
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
        <h2 className="text-xl font-semibold text-foreground">Choose Gateway Type</h2>
        <p className="text-muted-foreground mt-1">
          Select the type of gateway you want to connect
        </p>
      </div>

      <div className="grid gap-4">
        {GATEWAY_TYPES.map((gt) => (
          <button
            key={gt.type}
            onClick={() => onSelect(gt.type)}
            data-ai-target={`gateway-type-${gt.type.toLowerCase()}`}
            className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card/50 hover:bg-card hover:border-border transition-colors text-left group"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-blue-400 transition-colors">
              <gt.icon />
            </div>
            <div>
              <h3 className="font-medium text-foreground group-hover:text-blue-400 transition-colors">
                {gt.name}
              </h3>
              <p className="text-sm text-muted-foreground">{gt.description}</p>
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
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Add Telegram Bot</h2>
          <p className="text-muted-foreground text-sm">
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
          <Label htmlFor="name" className="text-foreground">
            Gateway Name
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Telegram Bot"
            required
            data-ai-target="gateway-name-input"
            className="bg-card border-border text-foreground placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">
            A friendly name to identify this gateway
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="botToken" className="text-foreground">
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
            data-ai-target="gateway-bot-token-input"
            className="bg-card border-border text-foreground placeholder:text-muted-foreground font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
          </p>
        </div>
      </div>

      {error ? <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div> : null}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="border-border text-foreground"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={loading || !name || !botToken}
          data-ai-target="gateway-create-btn"
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
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Add AI Provider</h2>
          <p className="text-muted-foreground text-sm">
            Connect an AI provider for text generation
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-foreground">
            Gateway Name
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My AI Gateway"
            required
            data-ai-target="gateway-ai-name-input"
            className="bg-card border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="provider" className="text-foreground">
            AI Provider
          </Label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AIProviderType)}
            data-ai-target="gateway-ai-provider-select"
            className="w-full h-10 px-3 rounded-md bg-card border border-border text-foreground"
          >
            {Object.entries(AI_PROVIDERS).map(([key, info]) => (
              <option key={key} value={key}>
                {info.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey" className="text-foreground">
            API Key
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            required
            data-ai-target="gateway-ai-apikey-input"
            className="bg-card border-border text-foreground placeholder:text-muted-foreground font-mono"
          />
        </div>

        {providerInfo.requiresBaseUrl ? <div className="space-y-2">
            <Label htmlFor="baseUrl" className="text-foreground">
              Base URL
            </Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              required={providerInfo.requiresBaseUrl}
              data-ai-target="gateway-ai-baseurl-input"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div> : null}

        <div className="space-y-2">
          <Label htmlFor="model" className="text-foreground">
            Default Model{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "openai" ? "gpt-4" : ""}
            data-ai-target="gateway-ai-model-input"
            className="bg-card border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {error ? <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div> : null}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="border-border text-foreground"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={loading || !name || !apiKey}
          data-ai-target="gateway-create-btn"
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
 * Credential presets for common integrations.
 * Each preset defines the key names a service typically needs,
 * with helpful labels and descriptions so beginners know what to paste.
 */
const CREDENTIAL_PRESETS = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Verify Stripe webhook signatures",
    keys: [
      { key: "signingSecret", label: "Webhook Signing Secret", placeholder: "whsec_...", helpUrl: "https://dashboard.stripe.com/webhooks" },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Verify GitHub webhook signatures",
    keys: [
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "your-webhook-secret", helpUrl: "https://docs.github.com/en/webhooks" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Verify Slack event requests",
    keys: [
      { key: "signingSecret", label: "Signing Secret", placeholder: "8f742231b10e...", helpUrl: "https://api.slack.com/apps" },
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Verify Shopify webhook HMAC",
    keys: [
      { key: "apiSecret", label: "API Secret Key", placeholder: "shpss_...", helpUrl: "https://shopify.dev/docs/apps/webhooks" },
    ],
  },
  {
    id: "generic-token",
    name: "API with Token",
    description: "Generic service that uses a bearer token or API key",
    keys: [
      { key: "apiKey", label: "API Key / Token", placeholder: "sk-..., tok-..., or any secret" },
    ],
  },
  {
    id: "two-keys",
    name: "API with Key + Secret",
    description: "Service that needs both an ID/key and a secret",
    keys: [
      { key: "apiKey", label: "API Key / Client ID", placeholder: "your-api-key" },
      { key: "apiSecret", label: "API Secret", placeholder: "your-api-secret" },
    ],
  },
] as const;

/**
 * Custom Gateway form with preset-based credentials
 */
function CustomGatewayForm({
  onSubmit,
  onBack,
  loading,
  error,
}: {
  onSubmit: (data: { name: string; credentials: Record<string, string> }) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ key: string; value: string; label?: string; placeholder?: string; helpUrl?: string }[]>([]);

  const handlePresetSelect = (presetId: string) => {
    if (presetId === "manual") {
      setSelectedPreset("manual");
      setCredentials([{ key: "", value: "" }]);
      return;
    }
    const preset = CREDENTIAL_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(presetId);
      setCredentials(preset.keys.map(k => ({
        key: k.key,
        value: "",
        label: k.label,
        placeholder: k.placeholder,
        helpUrl: "helpUrl" in k ? k.helpUrl : undefined,
      })));
    }
  };

  const addManualCredential = () => {
    setCredentials(prev => [...prev, { key: "", value: "" }]);
  };

  const removeCredential = (index: number) => {
    setCredentials(prev => prev.filter((_, i) => i !== index));
  };

  const updateCredential = (index: number, field: "key" | "value", val: string) => {
    setCredentials(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: val } : item
    ));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const creds: Record<string, string> = {};
    for (const { key, value } of credentials) {
      const k = key.trim();
      if (k) creds[k] = value;
    }
    onSubmit({ name: name.trim(), credentials: creds });
  };

  const isManual = selectedPreset === "manual";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-foreground">Create Custom Gateway</h2>
        <p className="text-muted-foreground mt-1">
          Set up an inbound endpoint for external services
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="gw-name" className="text-sm font-medium text-foreground">
          Gateway Name
        </label>
        <Input
          id="gw-name"
          placeholder="e.g. stripe-payments"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-ai-target="gateway-custom-name-input"
          className="bg-background border-border focus:border-blue-500"
        />
        <p className="text-xs text-muted-foreground">
          1-64 alphanumeric characters with hyphens/underscores
        </p>
      </div>

      {/* Credential Preset Selector */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          What service are you connecting?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CREDENTIAL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset.id)}
              className={`text-left p-3 rounded-lg border transition-colors ${
                selectedPreset === preset.id
                  ? "border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/30"
                  : "border-border bg-card/50 hover:bg-card hover:border-border"
              }`}
            >
              <p className="text-sm font-medium text-foreground">{preset.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
            </button>
          ))}
          {/* Manual option */}
          <button
            type="button"
            onClick={() => handlePresetSelect("manual")}
            className={`text-left p-3 rounded-lg border transition-colors col-span-2 ${
              selectedPreset === "manual"
                ? "border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/30"
                : "border-border border-dashed bg-card/30 hover:bg-card/50 hover:border-border"
            }`}
          >
            <p className="text-sm font-medium text-foreground">Custom / Manual</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enter your own key names and values</p>
          </button>
        </div>
      </div>

      {/* Credential Input Fields — shown after selecting a preset */}
      {selectedPreset && credentials.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-border bg-card/30 p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              {isManual ? "Credentials" : `${CREDENTIAL_PRESETS.find(p => p.id === selectedPreset)?.name} Credentials`}
            </label>
            {isManual ? (
              <Button
                type="button"
                variant="ghost"
                onClick={addManualCredential}
                className="text-xs text-blue-400 hover:text-blue-300 h-auto py-1 px-2"
              >
                + Add Another
              </Button>
            ) : null}
          </div>

          {credentials.map((cred, index) => (
            <div key={index} className="space-y-1.5">
              {/* For preset keys: show label; for manual: show key input */}
              {!isManual && cred.label ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{cred.label}</span>
                  {cred.helpUrl ? (
                    <a href={cred.helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                      Where to find this?
                    </a>
                  ) : null}
                </div>
              ) : null}
              <div className="flex gap-2 items-start">
                {isManual ? (
                  <Input
                    placeholder="Key name"
                    value={cred.key}
                    onChange={(e) => updateCredential(index, "key", e.target.value)}
                    className="bg-background border-border focus:border-blue-500 text-sm flex-1"
                  />
                ) : null}
                <Input
                  placeholder={cred.placeholder || "Paste secret value here"}
                  type="password"
                  value={cred.value}
                  onChange={(e) => updateCredential(index, "value", e.target.value)}
                  className={`bg-background border-border focus:border-blue-500 text-sm font-mono ${isManual ? "flex-[2]" : "w-full"}`}
                />
                {isManual && credentials.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeCredential(index)}
                    className="text-red-400 hover:text-red-300 h-9 w-9 p-0 shrink-0"
                  >
                    &times;
                  </Button>
                ) : null}
              </div>
              {!isManual ? (
                <p className="text-xs text-muted-foreground">
                  Your plugin reads this as <code className="text-emerald-400/80 bg-muted px-1 rounded">event.data.credentials.{cred.key}</code>
                </p>
              ) : null}
            </div>
          ))}

          {isManual ? (
            <p className="text-xs text-muted-foreground mt-1">
              Your plugin reads credentials via <code className="text-emerald-400/80 bg-muted px-1 rounded">event.data.credentials.yourKeyName</code>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* No credentials selected yet — optional hint */}
      {!selectedPreset ? (
        <div className="rounded-md border border-border/50 bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground text-center">
            Select a service above, or choose &quot;Custom / Manual&quot; to enter your own credentials
          </p>
        </div>
      ) : null}

      <div className="rounded-md border border-blue-900/30 bg-blue-950/20 p-3 space-y-2">
        <p className="text-xs text-blue-300">
          After creating, go to <strong>My Plugins → Configure</strong> and select this gateway in the Gateway dropdown to connect it to your plugin.
        </p>
        <p className="text-xs text-blue-300/70">
          Credentials are passed to your plugin via <code className="text-emerald-400/70 bg-muted px-1 rounded">event.data.credentials</code> on every incoming request.
        </p>
      </div>

      {error ? <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div> : null}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="border-border text-foreground"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={loading || !name.trim()}
          data-ai-target="gateway-create-btn"
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
  const { workspace: _workspace } = useWorkspace();
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
      const response = await fetch(apiUrl("/gateways"), {
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
      router.push("/gateways");
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

  const handleCustomGatewaySubmit = async (data: { name: string; credentials: Record<string, string> }) => {
    createGateway({
      type: "CUSTOM_GATEWAY" as GatewayType,
      name: data.name,
      credentials: data.credentials,
    });
  };

  const typeLabel = selectedType === "TELEGRAM_BOT" ? "Telegram Bot" : selectedType === "AI" ? "AI Provider" : "Custom Gateway";

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <PageHeader
          title={step === "type" ? "Add Gateway" : `Configure ${typeLabel}`}
          description={step === "type"
            ? "Connect a new gateway to your workspace"
            : "Enter your credentials and configuration"
          }
          breadcrumbs={[{ label: "Gateways", href: "/gateways" }]}
        />
        <Card className="border-border bg-card/50">
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
            {step === "form" && selectedType === "CUSTOM_GATEWAY" && (
              <CustomGatewayForm
                onSubmit={handleCustomGatewaySubmit}
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
            href="/gateways"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
