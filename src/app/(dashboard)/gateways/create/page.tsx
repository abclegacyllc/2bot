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
import { apiUrl } from "@/shared/config/urls";
import type { GatewayType } from "@prisma/client";

// Icons
const BotIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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

const GATEWAY_TYPES = [
  {
    type: "TELEGRAM_BOT" as GatewayType,
    name: "Telegram Bot",
    description: "Connect a Telegram bot to receive and send messages",
    icon: BotIcon,
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

  const typeLabel = selectedType === "TELEGRAM_BOT" ? "Telegram Bot" : "Bot";

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
