"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
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
import type { GatewayOption } from "@/lib/api-client";
import {
    addWorkflowStep,
    createOrgGateway,
    createUserGateway,
    createWorkflow,
    getInstalledPlugins,
    getPluginCatalog,
} from "@/lib/api-client";
import type {
    PluginListItem,
} from "@/shared/types/plugin";
import {
    ArrowRight,
    Bot,
    Check,
    Loader2,
    Puzzle,
    Search,
    SkipForward,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  DiscordIcon,
  SlackIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "./platform-icons";

// ===========================================
// Types
// ===========================================

type WizardStep = "bot-info" | "add-workflow-step";

type PlatformType = "TELEGRAM_BOT" | "DISCORD_BOT" | "SLACK_BOT" | "WHATSAPP_BOT";

interface PlatformOption {
  id: PlatformType;
  name: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const PLATFORMS: PlatformOption[] = [
  {
    id: "TELEGRAM_BOT",
    name: "Telegram",
    description: "Connect a Telegram bot via BotFather token",
    icon: TelegramIcon,
  },
  {
    id: "DISCORD_BOT",
    name: "Discord",
    description: "Connect a Discord bot via application credentials",
    icon: DiscordIcon,
  },
  {
    id: "SLACK_BOT",
    name: "Slack",
    description: "Connect a Slack bot via OAuth token",
    icon: SlackIcon,
  },
  {
    id: "WHATSAPP_BOT",
    name: "WhatsApp",
    description: "Connect via WhatsApp Cloud API",
    icon: WhatsAppIcon,
  },
];

interface CreateBotWizardProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  organizationId?: string;
  onCreated: () => void;
}

// ===========================================
// Helpers
// ===========================================

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function defaultTriggerType(gatewayType: string): string {
  switch (gatewayType) {
    case "TELEGRAM_BOT":
    case "DISCORD_BOT":
    case "SLACK_BOT":
    case "WHATSAPP_BOT":
      return "BOT_MESSAGE";
    default:
      return "MANUAL";
  }
}

// ===========================================
// Component
// ===========================================

export function CreateBotWizard({
  open,
  onClose,
  token,
  organizationId,
  onCreated,
}: CreateBotWizardProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>("bot-info");

  // Step 1: Bot Info
  const [botName, setBotName] = useState("");
  const [platform, setPlatform] = useState<PlatformType>("TELEGRAM_BOT");
  // Telegram fields
  const [botToken, setBotToken] = useState("");
  // Discord fields
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [discordAppId, setDiscordAppId] = useState("");
  const [discordPublicKey, setDiscordPublicKey] = useState("");
  // Slack fields
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackSigningSecret, setSlackSigningSecret] = useState("");
  // WhatsApp fields
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waAppSecret, setWaAppSecret] = useState("");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waVerifyToken, setWaVerifyToken] = useState("");
  const [isCreatingGateway, setIsCreatingGateway] = useState(false);
  const [createdGateway, setCreatedGateway] = useState<GatewayOption | null>(null);

  // Step 2: Add Workflow Step
  const [availablePlugins, setAvailablePlugins] = useState<PluginListItem[]>([]);
  const [isLoadingPlugins, setIsLoadingPlugins] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [isAddingStep, setIsAddingStep] = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setStep("bot-info");
      setBotName("");
      setPlatform("TELEGRAM_BOT");
      setBotToken("");
      setDiscordBotToken("");
      setDiscordAppId("");
      setDiscordPublicKey("");
      setSlackBotToken("");
      setSlackSigningSecret("");
      setWaAccessToken("");
      setWaAppSecret("");
      setWaPhoneNumberId("");
      setWaBusinessAccountId("");
      setWaVerifyToken("");
      setCreatedGateway(null);
      setAvailablePlugins([]);
      setSearchQuery("");
      setSelectedPluginId(null);
    }
  }, [open]);

  // Fetch plugins when entering step 2
  useEffect(() => {
    if (step !== "add-workflow-step" || availablePlugins.length > 0) return;
    setIsLoadingPlugins(true);
    const authToken = token ?? undefined;
    Promise.all([
      getPluginCatalog(undefined, authToken),
      getInstalledPlugins(authToken),
    ])
      .then(([catalogResult, installedResult]) => {
        const merged: PluginListItem[] = [];
        const seenPluginIds = new Set<string>();

        // Add user's installed plugins first
        if (installedResult.success && installedResult.data) {
          for (const up of installedResult.data) {
            if (!seenPluginIds.has(up.pluginId)) {
              seenPluginIds.add(up.pluginId);
              merged.push({
                id: up.pluginId,
                slug: up.pluginSlug,
                name: up.pluginName,
                description: up.pluginDescription,
                version: "1.0.0",
                icon: up.pluginIcon,
                category: up.pluginCategory,
                tags: [],
                requiredGateways: up.requiredGateways,
                isBuiltin: up.authorType === "SYSTEM",
                authorType: up.authorType ?? "USER",
                isPublic: false,
              });
            }
          }
        }

        // Add catalog plugins not already listed
        if (catalogResult.success && catalogResult.data) {
          for (const p of catalogResult.data) {
            if (!seenPluginIds.has(p.id)) {
              seenPluginIds.add(p.id);
              merged.push(p);
            }
          }
        }

        // Filter to plugins compatible with this gateway type
        const gatewayType = createdGateway?.type;
        const compatible = gatewayType
          ? merged.filter(
              (p) =>
                p.requiredGateways.length === 0 ||
                p.requiredGateways.includes(gatewayType)
            )
          : merged;
        setAvailablePlugins(compatible);
      })
      .finally(() => setIsLoadingPlugins(false));
  }, [step, token, createdGateway, availablePlugins.length]);

  // Filter plugins by search
  const filteredPlugins = searchQuery.trim()
    ? availablePlugins.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availablePlugins;

  // Step 1: Create Gateway
  const handleCreateGateway = useCallback(async () => {
    if (!botName.trim()) return;
    setIsCreatingGateway(true);
    try {
      let payload: { name: string; type: PlatformType; credentials: Record<string, string> };

      if (platform === "TELEGRAM_BOT") {
        if (!botToken.trim()) return;
        payload = {
          name: botName.trim(),
          type: "TELEGRAM_BOT",
          credentials: { botToken: botToken.trim() },
        };
      } else if (platform === "DISCORD_BOT") {
        if (!discordBotToken.trim() || !discordAppId.trim() || !discordPublicKey.trim()) return;
        payload = {
          name: botName.trim(),
          type: "DISCORD_BOT",
          credentials: {
            botToken: discordBotToken.trim(),
            applicationId: discordAppId.trim(),
            publicKey: discordPublicKey.trim(),
          },
        };
      } else if (platform === "SLACK_BOT") {
        if (!slackBotToken.trim() || !slackSigningSecret.trim()) return;
        payload = {
          name: botName.trim(),
          type: "SLACK_BOT",
          credentials: {
            botToken: slackBotToken.trim(),
            signingSecret: slackSigningSecret.trim(),
          },
        };
      } else {
        // WHATSAPP_BOT
        if (!waAccessToken.trim() || !waAppSecret.trim() || !waPhoneNumberId.trim() || !waVerifyToken.trim()) return;
        payload = {
          name: botName.trim(),
          type: "WHATSAPP_BOT",
          credentials: {
            accessToken: waAccessToken.trim(),
            appSecret: waAppSecret.trim(),
            phoneNumberId: waPhoneNumberId.trim(),
            ...(waBusinessAccountId.trim() ? { businessAccountId: waBusinessAccountId.trim() } : {}),
            verifyToken: waVerifyToken.trim(),
          },
        };
      }

      const result = organizationId
        ? await createOrgGateway(organizationId, payload, token ?? undefined)
        : await createUserGateway(payload, token ?? undefined);

      if (result.success && result.data) {
        setCreatedGateway(result.data);
        toast.success(`Bot "${botName}" created!`);
        setStep("add-workflow-step");
      } else {
        toast.error(result.error?.message || "Failed to create bot");
      }
    } catch {
      toast.error("Failed to create bot. Please try again.");
    } finally {
      setIsCreatingGateway(false);
    }
  }, [botName, platform, botToken, discordBotToken, discordAppId, discordPublicKey, slackBotToken, slackSigningSecret, waAccessToken, waAppSecret, waPhoneNumberId, waBusinessAccountId, waVerifyToken, token, organizationId]);

  // Step 2: Add selected plugin as a workflow step
  const handleAddWorkflowStep = useCallback(async () => {
    if (!selectedPluginId || !createdGateway) return;
    setIsAddingStep(true);
    try {
      // Create a workflow for this gateway
      const slug = generateSlug(botName || createdGateway.name);
      const workflowResult = await createWorkflow(
        {
          name: `${createdGateway.name} Workflow`,
          slug,
          triggerType: defaultTriggerType(createdGateway.type),
          triggerConfig: {},
          gatewayId: createdGateway.id,
        },
        { organizationId },
        token ?? undefined
      );

      if (!workflowResult.success || !workflowResult.data) {
        toast.error(workflowResult.error?.message || "Failed to create workflow");
        return;
      }

      // Add the selected plugin as step 1
      const stepResult = await addWorkflowStep(
        workflowResult.data.id,
        {
          order: 0,
          pluginId: selectedPluginId,
          name: availablePlugins.find((p) => p.id === selectedPluginId)?.name,
        },
        { organizationId },
        token ?? undefined
      );

      if (stepResult.success) {
        toast.success("Workflow step added!");
        onClose();
        onCreated();
      } else {
        toast.error(stepResult.error?.message || "Failed to add workflow step");
      }
    } catch {
      toast.error("Failed to set up workflow. Please try again.");
    } finally {
      setIsAddingStep(false);
    }
  }, [selectedPluginId, createdGateway, botName, organizationId, token, availablePlugins, onClose, onCreated]);

  // Step 2: Skip → close wizard
  const handleSkip = useCallback(() => {
    onClose();
    onCreated();
  }, [onClose, onCreated]);

  const isValidBotToken = /^\d+:[A-Za-z0-9_-]+$/.test(botToken.trim());
  const isValidDiscordCreds =
    discordBotToken.trim().length > 0 &&
    /^\d{17,20}$/.test(discordAppId.trim()) &&
    /^[0-9a-f]{64}$/i.test(discordPublicKey.trim());

  const isValidSlackCreds =
    slackBotToken.trim().startsWith("xoxb-") &&
    slackSigningSecret.trim().length >= 20;

  const isValidWhatsAppCreds =
    waAccessToken.trim().length > 0 &&
    waAppSecret.trim().length > 0 &&
    /^\d+$/.test(waPhoneNumberId.trim()) &&
    waVerifyToken.trim().length > 0;

  const canCreate = botName.trim() &&
    (platform === "TELEGRAM_BOT" ? isValidBotToken :
     platform === "DISCORD_BOT" ? isValidDiscordCreds :
     platform === "SLACK_BOT" ? isValidSlackCreds : isValidWhatsAppCreds);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* Step 1: Bot Info */}
        {step === "bot-info" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-emerald-500" />
                Create a new Bot
              </DialogTitle>
              <DialogDescription>
                Choose a platform and connect your bot.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="bot-name" className="text-foreground font-medium">
                  Bot Name
                </Label>
                <Input
                  id="bot-name"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder="My Awesome Bot"
                  className="bg-muted border-border text-foreground"
                />
              </div>

              {/* Platform Selection */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Platform</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                        platform === p.id
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border bg-muted hover:border-muted-foreground/30"
                      }`}
                    >
                      <p.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Telegram Fields */}
              {platform === "TELEGRAM_BOT" && (
                <div className="space-y-2">
                  <Label htmlFor="bot-token" className="text-foreground font-medium">
                    Telegram Bot Token
                    <span className="text-xs text-destructive ml-1">*required</span>
                  </Label>
                  <Input
                    id="bot-token"
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                    className="bg-muted border-border text-foreground font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get this from{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-500 underline"
                    >
                      @BotFather
                    </a>{" "}
                    on Telegram.
                  </p>
                </div>
              )}

              {/* Discord Fields */}
              {platform === "DISCORD_BOT" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="discord-bot-token" className="text-foreground font-medium">
                      Bot Token
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="discord-bot-token"
                      type="password"
                      value={discordBotToken}
                      onChange={(e) => setDiscordBotToken(e.target.value)}
                      placeholder="MTIz...your-bot-token"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discord-app-id" className="text-foreground font-medium">
                      Application ID
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="discord-app-id"
                      value={discordAppId}
                      onChange={(e) => setDiscordAppId(e.target.value)}
                      placeholder="123456789012345678"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discord-public-key" className="text-foreground font-medium">
                      Public Key
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="discord-public-key"
                      value={discordPublicKey}
                      onChange={(e) => setDiscordPublicKey(e.target.value)}
                      placeholder="64-character hex string"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Find these in the{" "}
                    <a
                      href="https://discord.com/developers/applications"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-500 underline"
                    >
                      Discord Developer Portal
                    </a>
                    {" "}&rarr; your app &rarr; General Information.
                  </p>
                </div>
              )}

              {/* Slack Fields */}
              {platform === "SLACK_BOT" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="slack-bot-token" className="text-foreground font-medium">
                      Bot Token
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="slack-bot-token"
                      type="password"
                      value={slackBotToken}
                      onChange={(e) => setSlackBotToken(e.target.value)}
                      placeholder="xoxb-your-bot-token"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slack-signing-secret" className="text-foreground font-medium">
                      Signing Secret
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="slack-signing-secret"
                      type="password"
                      value={slackSigningSecret}
                      onChange={(e) => setSlackSigningSecret(e.target.value)}
                      placeholder="Your app signing secret"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Find these in the{" "}
                    <a
                      href="https://api.slack.com/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-500 underline"
                    >
                      Slack App Dashboard
                    </a>
                    {" "}&rarr; your app &rarr; OAuth &amp; Permissions (Bot Token) and Basic Information (Signing Secret).
                  </p>
                </div>
              )}

              {/* WhatsApp Fields */}
              {platform === "WHATSAPP_BOT" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="wa-access-token" className="text-foreground font-medium">
                      Access Token
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="wa-access-token"
                      type="password"
                      value={waAccessToken}
                      onChange={(e) => setWaAccessToken(e.target.value)}
                      placeholder="Your Meta Graph API access token"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa-app-secret" className="text-foreground font-medium">
                      App Secret
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="wa-app-secret"
                      type="password"
                      value={waAppSecret}
                      onChange={(e) => setWaAppSecret(e.target.value)}
                      placeholder="Your app secret for webhook verification"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa-phone-number-id" className="text-foreground font-medium">
                      Phone Number ID
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="wa-phone-number-id"
                      value={waPhoneNumberId}
                      onChange={(e) => setWaPhoneNumberId(e.target.value)}
                      placeholder="e.g. 123456789012345"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa-business-account-id" className="text-foreground font-medium">
                      Business Account ID
                      <span className="text-xs text-muted-foreground ml-1">(optional)</span>
                    </Label>
                    <Input
                      id="wa-business-account-id"
                      value={waBusinessAccountId}
                      onChange={(e) => setWaBusinessAccountId(e.target.value)}
                      placeholder="e.g. 123456789012345"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa-verify-token" className="text-foreground font-medium">
                      Verify Token
                      <span className="text-xs text-destructive ml-1">*required</span>
                    </Label>
                    <Input
                      id="wa-verify-token"
                      value={waVerifyToken}
                      onChange={(e) => setWaVerifyToken(e.target.value)}
                      placeholder="Custom token for webhook verification handshake"
                      className="bg-muted border-border text-foreground font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Find these in the{" "}
                    <a
                      href="https://business.facebook.com/settings/whatsapp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-500 underline"
                    >
                      Meta Business Suite
                    </a>
                    {" "}&rarr; WhatsApp &rarr; API Setup. The Verify Token is a custom string you define.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateGateway}
                disabled={
                  isCreatingGateway || !canCreate
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isCreatingGateway ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    Create Bot <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Add Workflow Step */}
        {step === "add-workflow-step" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-500" />
                Add a Workflow Step
              </DialogTitle>
              <DialogDescription>
                Choose a plugin to add as the first step in your bot&apos;s workflow. You can add more steps later.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search plugins..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-muted border-border"
                />
              </div>

              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {isLoadingPlugins ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredPlugins.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No compatible plugins found.
                  </div>
                ) : (
                  filteredPlugins.map((plugin) => {
                    const isSelected = plugin.id === selectedPluginId;
                    return (
                      <Card
                        key={plugin.id}
                        className={`cursor-pointer transition-colors border ${
                          isSelected
                            ? "border-emerald-500/50 bg-emerald-500/5"
                            : "border-border hover:bg-card"
                        }`}
                        onClick={() => setSelectedPluginId(plugin.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Puzzle className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {plugin.name}
                                </span>
                                {plugin.isBuiltin && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Built-in
                                  </Badge>
                                )}
                                {!plugin.isBuiltin && plugin.authorType === "USER" && (
                                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                                    My Plugin
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {plugin.description}
                              </p>
                            </div>
                            {isSelected && (
                              <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="gap-1.5 text-muted-foreground"
              >
                <SkipForward className="h-4 w-4" /> Skip for now
              </Button>
              <Button
                onClick={handleAddWorkflowStep}
                disabled={!selectedPluginId || isAddingStep}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isAddingStep ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Adding...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Add Step
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
