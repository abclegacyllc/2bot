"use client";

/**
 * SettingsTab — Bot settings within the Studio.
 *
 * Shows: General info, Platform Profile (synced from Telegram/Discord/etc.),
 * connection test, and danger zone.
 *
 * @module components/studio/settings-tab
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { useStudio } from "@/app/studio/layout";
import type { GatewayOption } from "@/lib/api-client";
import { updateGateway } from "@/lib/api-client";
import { apiUrl } from "@/shared/config/urls";

import {
  AlertTriangle,
  AtSign,
  Check,
  Clock,
  Copy,
  Globe,
  ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface SettingsTabProps {
  gateway: GatewayOption;
  token: string | null;
  organizationId?: string;
}

interface PlatformProfile {
  identity?: Record<string, unknown> | null;
  name?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  commands?: Array<{ command: string; description: string }> | null;
  avatarUrl?: string | null;
}

interface GatewayInfo {
  gatewayId: string;
  gatewayType: string;
  gatewayName: string;
  status: string;
  metadata: Record<string, unknown>;
  live: Record<string, unknown> | null;
}

// =============================================================================
// Platform labels & helpers
// =============================================================================

const PLATFORM_LABELS: Record<string, string> = {
  TELEGRAM_BOT: "Telegram Bot",
  DISCORD_BOT: "Discord Bot",
  SLACK_BOT: "Slack Bot",
  WHATSAPP_BOT: "WhatsApp",
};

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// Component
// =============================================================================

export function SettingsTab({ gateway, token, organizationId: _organizationId }: SettingsTabProps) {
  const router = useRouter();
  const { refresh } = useStudio();

  // General state
  const [name, setName] = useState(gateway.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Connection test
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; error?: string } | null>(null);

  // Gateway info (metadata + live)
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

  // Telegram profile editing
  const [telegramProfile, setTelegramProfile] = useState<PlatformProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editShortDesc, setEditShortDesc] = useState("");

  const isConnected = gateway.status === "CONNECTED";
  const isTelegram = gateway.type === "TELEGRAM_BOT";

  // Reset name if gateway changes
  useEffect(() => {
    setName(gateway.name);
  }, [gateway.name]);

  // =========================================================================
  // Fetch gateway info (metadata)
  // =========================================================================

  useEffect(() => {
    let cancelled = false;
    setIsLoadingInfo(true);
    fetch(apiUrl(`/gateways/${gateway.id}/info?live=false`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) {
          setGatewayInfo(data.data);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingInfo(false); });
    return () => { cancelled = true; };
  }, [gateway.id, token]);

  // =========================================================================
  // Fetch Telegram profile
  // =========================================================================

  const fetchTelegramProfile = useCallback(async () => {
    if (!isTelegram || !token) return;
    setIsLoadingProfile(true);
    try {
      const res = await fetch(apiUrl(`/gateways/${gateway.id}/telegram/profile`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const p = data.data as PlatformProfile;
        setTelegramProfile(p);
        setEditName(p.name ?? "");
        setEditDesc(p.description ?? "");
        setEditShortDesc(p.shortDescription ?? "");
      }
    } catch {
      // silent
    } finally {
      setIsLoadingProfile(false);
    }
  }, [gateway.id, isTelegram, token]);

  useEffect(() => {
    if (isTelegram && isConnected) {
      fetchTelegramProfile();
    }
  }, [isTelegram, isConnected, fetchTelegramProfile]);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleSaveName = useCallback(async () => {
    if (!name.trim() || name === gateway.name) return;
    setIsSaving(true);
    try {
      const result = await updateGateway(
        gateway.id,
        { name: name.trim() },
        token ?? undefined
      );
      if (result.success) {
        toast.success("Bot name updated");
        refresh();
      } else {
        toast.error("Failed to update name");
      }
    } catch {
      toast.error("Failed to update name");
    } finally {
      setIsSaving(false);
    }
  }, [name, gateway.id, gateway.name, token, refresh]);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(apiUrl(`/gateways/${gateway.id}/test`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data.data);
        if (data.data.success) {
          toast.success(`Connection OK (${data.data.latency}ms)`);
          refresh();
        } else {
          toast.error(data.data.error || "Connection failed");
        }
      }
    } catch {
      toast.error("Connection test failed");
    } finally {
      setIsTesting(false);
    }
  }, [gateway.id, token, refresh]);

  const handleSaveTelegramProfile = useCallback(async () => {
    if (!token) return;
    setIsSavingProfile(true);
    try {
      const body: Record<string, unknown> = {};
      if (editName !== (telegramProfile?.name ?? "")) body.name = editName;
      if (editDesc !== (telegramProfile?.description ?? "")) body.description = editDesc;
      if (editShortDesc !== (telegramProfile?.shortDescription ?? "")) body.shortDescription = editShortDesc;

      if (Object.keys(body).length === 0) {
        toast.info("No changes to save");
        setIsSavingProfile(false);
        return;
      }

      const res = await fetch(apiUrl(`/gateways/${gateway.id}/telegram/profile`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const results = data.data?.results ?? {};
        const failed = Object.entries(results).filter(([, v]) => !(v as { success: boolean }).success);
        if (failed.length > 0) {
          toast.error(`Some fields failed: ${failed.map(([k]) => k).join(", ")}`);
        } else {
          toast.success("Telegram profile updated");
        }
        // Refresh profile
        await fetchTelegramProfile();
      } else {
        toast.error("Failed to update Telegram profile");
      }
    } catch {
      toast.error("Failed to update Telegram profile");
    } finally {
      setIsSavingProfile(false);
    }
  }, [gateway.id, token, editName, editDesc, editShortDesc, telegramProfile, fetchTelegramProfile]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Are you sure you want to delete "${gateway.name}"? This action cannot be undone. All plugins and workflows will be removed.`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(apiUrl(`/gateways/${gateway.id}`), {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        toast.success("Bot deleted");
        router.replace("/studio");
        refresh();
      } else {
        toast.error("Failed to delete bot");
      }
    } catch {
      toast.error("Failed to delete bot");
    } finally {
      setIsDeleting(false);
    }
  }, [gateway.id, gateway.name, token, router, refresh]);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(gateway.id);
    toast.success("Bot ID copied");
  }, [gateway.id]);

  // =========================================================================
  // Derived metadata values
  // =========================================================================

  const metadata = gatewayInfo?.metadata ?? {};
  const username = (metadata.username as string) ?? (metadata.botName as string) ?? null;
  const createdAt = (gatewayInfo as unknown as { createdAt?: string })?.createdAt ?? null;
  const lastConnectedAt = (metadata.lastConnectedAt as string) ?? null;

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6 max-w-2xl">
      {/* General Info */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bot Name */}
          <div className="space-y-2">
            <Label className="text-xs">Bot Name</Label>
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="max-w-sm"
                placeholder="Bot name"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveName}
                disabled={isSaving || !name.trim() || name === gateway.name}
                className="gap-1.5 text-xs shrink-0"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          </div>

          {/* Platform Type */}
          <div className="space-y-2">
            <Label className="text-xs">Platform</Label>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs gap-1.5">
                <Globe className="h-3 w-3" />
                {PLATFORM_LABELS[gateway.type] ?? gateway.type}
              </Badge>
              {username && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <AtSign className="h-3 w-3" />
                  {username}
                </Badge>
              )}
            </div>
          </div>

          {/* Bot ID */}
          <div className="space-y-2">
            <Label className="text-xs">Bot ID</Label>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                {gateway.id}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCopyId}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Status + Test */}
          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? "default" : "secondary"} className="text-xs gap-1">
                {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isConnected ? "Connected" : gateway.status.toLowerCase()}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="gap-1.5 text-xs h-7"
              >
                {isTesting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : testResult?.success ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                Test Connection
              </Button>
              {testResult && (
                <span className={`text-[11px] ${testResult.success ? "text-green-500" : "text-red-400"}`}>
                  {testResult.success ? `${testResult.latency}ms` : testResult.error}
                </span>
              )}
            </div>
          </div>

          {/* Timestamps */}
          {!isLoadingInfo && (
            <div className="flex gap-6 pt-1">
              {lastConnectedAt && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last connected {formatDate(lastConnectedAt)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Profile — Telegram */}
      {isTelegram && isConnected && (
        <Card className="bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {telegramProfile?.avatarUrl ? (
                  <Image
                    src={telegramProfile.avatarUrl}
                    alt="Bot avatar"
                    width={40}
                    height={40}
                    className="rounded-full border border-border"
                    unoptimized
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <CardTitle className="text-sm font-semibold">
                  Telegram Profile
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchTelegramProfile}
                disabled={isLoadingProfile}
                className="gap-1.5 text-xs h-7"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingProfile ? "animate-spin" : ""}`} />
                Sync
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              These settings are synced directly with Telegram. Changes here update your bot on Telegram.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingProfile ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : telegramProfile ? (
              <>
                {/* Telegram Display Name */}
                <div className="space-y-2">
                  <Label className="text-xs">Display Name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Bot display name on Telegram"
                    className="max-w-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    The name shown in chats. Different from your 2Bot name above.
                  </p>
                </div>

                {/* Short Description */}
                <div className="space-y-2">
                  <Label className="text-xs">Short Description</Label>
                  <Input
                    value={editShortDesc}
                    onChange={(e) => setEditShortDesc(e.target.value)}
                    placeholder="Brief description for bot profile"
                    maxLength={120}
                    className="max-w-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Shown in the bot&apos;s profile page. Max 120 characters.
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-xs">About / Description</Label>
                  <Textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="What does this bot do?"
                    maxLength={512}
                    rows={3}
                    className="max-w-sm resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Shown when users open the bot page. Max 512 characters.
                  </p>
                </div>

                {/* Commands (read-only display for now) */}
                {telegramProfile.commands && (telegramProfile.commands as unknown[]).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Commands</Label>
                    <div className="bg-muted/40 rounded-md p-2 space-y-1 max-w-sm">
                      {(telegramProfile.commands as Array<{ command: string; description: string }>).map((cmd, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <code className="text-purple-400 font-mono">/{cmd.command}</code>
                          <span className="text-muted-foreground">— {cmd.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Save profile */}
                <Button
                  onClick={handleSaveTelegramProfile}
                  disabled={isSavingProfile}
                  size="sm"
                  className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isSavingProfile ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save to Telegram
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Could not load Telegram profile. Make sure the bot is connected.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Platform Metadata — Discord / Slack / WhatsApp (read-only) */}
      {!isTelegram && !isLoadingInfo && gatewayInfo && Object.keys(metadata).length > 0 && (
        <Card className="bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              {gateway.type === "DISCORD_BOT" && metadata.avatar && metadata.botId ? (
                <Image
                  src={`https://cdn.discordapp.com/avatars/${metadata.botId}/${metadata.avatar}.png?size=80`}
                  alt="Bot avatar"
                  width={40}
                  height={40}
                  className="rounded-full border border-border"
                  unoptimized
                />
              ) : gateway.type === "WHATSAPP_BOT" && metadata.profilePictureUrl ? (
                <Image
                  src={String(metadata.profilePictureUrl)}
                  alt="Bot avatar"
                  width={40}
                  height={40}
                  className="rounded-full border border-border"
                  unoptimized
                />
              ) : null}
              <CardTitle className="text-sm font-semibold">
                {PLATFORM_LABELS[gateway.type] ?? gateway.type} Info
              </CardTitle>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Synced from {PLATFORM_LABELS[gateway.type] ?? "platform"} on last connection.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {Object.entries(metadata)
                .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
                .map(([key, value]) => (
                  <div key={key} className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </p>
                    <p className="text-xs font-medium truncate">{String(value)}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-red-500/20 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Deleting this bot will permanently remove all plugins, workflows, and execution history.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="gap-1.5 text-xs"
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Delete Bot
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
