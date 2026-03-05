"use client";

/**
 * Telegram Bot Profile Card
 *
 * Displays and allows editing of Telegram bot profile:
 * identity, name, description, short description, commands.
 *
 * @module components/gateways/telegram-bot-profile-card
 */

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/shared/config/urls";

// ─── Types ────────────────────────────────────────────

interface TelegramIdentity {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

interface BotCommand {
  command: string;
  description: string;
}

interface BotProfile {
  identity: TelegramIdentity | null;
  name: string | null;
  description: string | null;
  shortDescription: string | null;
  commands: BotCommand[];
}

// ─── Icons ────────────────────────────────────────────

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const LoadingIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// ─── Component ────────────────────────────────────────

interface TelegramBotProfileCardProps {
  gatewayId: string;
  token: string | null;
  status: string;
}

export function TelegramBotProfileCard({ gatewayId, token, status }: TelegramBotProfileCardProps) {
  const [profile, setProfile] = useState<BotProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode states
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editShortDescription, setEditShortDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Commands editing
  const [editingCommands, setEditingCommands] = useState(false);
  const [draftCommands, setDraftCommands] = useState<BotCommand[]>([]);

  const isConnected = status === "CONNECTED";

  const fetchProfile = useCallback(async () => {
    if (!token || !isConnected) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await fetch(
        apiUrl(`/gateways/${gatewayId}/telegram/profile`),
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to fetch profile");
      }

      const data = await response.json();
      setProfile(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [token, gatewayId, isConnected]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const startEdit = (field: string) => {
    if (!profile) return;
    setEditingField(field);
    setSaveSuccess(null);
    if (field === "name") setEditName(profile.name ?? "");
    if (field === "description") setEditDescription(profile.description ?? "");
    if (field === "shortDescription") setEditShortDescription(profile.shortDescription ?? "");
  };

  const cancelEdit = () => {
    setEditingField(null);
  };

  const saveField = async (field: string, value: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true);
    setSaveSuccess(null);

    try {
      const response = await fetch(
        apiUrl(`/gateways/${gatewayId}/telegram/profile`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(value),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to save");
      }

      setEditingField(null);
      setSaveSuccess(field);
      setTimeout(() => setSaveSuccess(null), 3000);
      // Refresh profile data
      await fetchProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const saveCommands = async () => {
    // Filter out empty commands
    const cleanCommands = draftCommands.filter(
      (cmd) => cmd.command.trim() && cmd.description.trim()
    );
    await saveField("commands", { commands: cleanCommands });
    setEditingCommands(false);
  };

  if (!isConnected) {
    return (
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground text-lg">Bot Profile</CardTitle>
          <CardDescription className="text-muted-foreground">
            Connect the gateway to view and edit bot profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Gateway must be connected to fetch bot profile data from Telegram.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground text-lg">Bot Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-40 bg-muted rounded" />
            <div className="h-4 w-64 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !profile) {
    return (
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground text-lg">Bot Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProfile}
            className="mt-3 border-border"
          >
            <RefreshIcon />
            <span className="ml-2">Retry</span>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!profile) return null;

  const identity = profile.identity;

  return (
    <div className="space-y-6">
      {/* Bot Identity Card */}
      <Card className="border-border bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-lg">Bot Profile</CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your Telegram bot&apos;s public profile
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProfile}
            className="border-border text-foreground"
          >
            <RefreshIcon />
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Identity Header */}
          {identity && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-lg">
                {identity.first_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">
                    {identity.first_name}
                    {identity.last_name ? ` ${identity.last_name}` : ""}
                  </span>
                  <Badge variant="secondary" className="text-xs">Bot</Badge>
                </div>
                {identity.username && (
                  <p className="text-sm text-muted-foreground">@{identity.username}</p>
                )}
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {identity.can_join_groups && (
                    <Badge variant="outline" className="text-xs">Groups</Badge>
                  )}
                  {identity.can_read_all_group_messages && (
                    <Badge variant="outline" className="text-xs">Read Messages</Badge>
                  )}
                  {identity.supports_inline_queries && (
                    <Badge variant="outline" className="text-xs">Inline</Badge>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                ID: {identity.id}
              </div>
            </div>
          )}

          {/* Display Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm font-medium">Display Name</Label>
              {editingField !== "name" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit("name")}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  <EditIcon />
                </Button>
              )}
            </div>
            {editingField === "name" ? (
              <div className="flex gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Bot display name (0-64 chars)"
                  maxLength={64}
                  className="bg-card border-border text-foreground flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => saveField("name", { name: editName })}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? <LoadingIcon /> : <CheckIcon />}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit} className="border-border">
                  <XIcon />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {profile.name || <span className="italic">Not set</span>}
                {saveSuccess === "name" && (
                  <span className="ml-2 text-green-400 text-xs">Saved!</span>
                )}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm font-medium">Description</Label>
              {editingField !== "description" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit("description")}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  <EditIcon />
                </Button>
              )}
            </div>
            {editingField === "description" ? (
              <div className="space-y-2">
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Bot description shown in empty chat (0-512 chars)"
                  maxLength={512}
                  rows={3}
                  className="bg-card border-border text-foreground"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveField("description", { description: editDescription })}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? <LoadingIcon /> : <CheckIcon />}
                    <span className="ml-1">Save</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit} className="border-border">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {profile.description || <span className="italic">Not set</span>}
                {saveSuccess === "description" && (
                  <span className="ml-2 text-green-400 text-xs">Saved!</span>
                )}
              </p>
            )}
          </div>

          {/* Short Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm font-medium">Short Description</Label>
              {editingField !== "shortDescription" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit("shortDescription")}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  <EditIcon />
                </Button>
              )}
            </div>
            {editingField === "shortDescription" ? (
              <div className="space-y-2">
                <Input
                  value={editShortDescription}
                  onChange={(e) => setEditShortDescription(e.target.value)}
                  placeholder="Short bio shown on profile (0-120 chars)"
                  maxLength={120}
                  className="bg-card border-border text-foreground"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveField("shortDescription", { shortDescription: editShortDescription })}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? <LoadingIcon /> : <CheckIcon />}
                    <span className="ml-1">Save</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit} className="border-border">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {profile.shortDescription || <span className="italic">Not set</span>}
                {saveSuccess === "shortDescription" && (
                  <span className="ml-2 text-green-400 text-xs">Saved!</span>
                )}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commands Card */}
      <Card className="border-border bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-lg">Bot Commands</CardTitle>
            <CardDescription className="text-muted-foreground">
              Commands shown in the bot menu
            </CardDescription>
          </div>
          {!editingCommands && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraftCommands(
                  profile.commands?.length
                    ? [...(profile.commands as BotCommand[])]
                    : [{ command: "", description: "" }]
                );
                setEditingCommands(true);
                setSaveSuccess(null);
              }}
              className="border-border text-foreground"
            >
              <EditIcon />
              <span className="ml-1.5">Edit</span>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editingCommands ? (
            <div className="space-y-3">
              {draftCommands.map((cmd, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={cmd.command}
                      onChange={(e) => {
                        const updated = [...draftCommands];
                        updated[i] = { command: e.target.value.replace(/^\//, "").replace(/\s/g, ""), description: updated[i]!.description };
                        setDraftCommands(updated);
                      }}
                      placeholder="command"
                      className="bg-card border-border text-foreground font-mono text-sm"
                    />
                  </div>
                  <div className="flex-[2] space-y-1">
                    <Input
                      value={cmd.description}
                      onChange={(e) => {
                        const updated = [...draftCommands];
                        updated[i] = { command: updated[i]!.command, description: e.target.value };
                        setDraftCommands(updated);
                      }}
                      placeholder="Description"
                      className="bg-card border-border text-foreground text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraftCommands(draftCommands.filter((_, j) => j !== i));
                    }}
                    className="text-red-400 hover:text-red-300 h-9 px-2"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraftCommands([...draftCommands, { command: "", description: "" }])}
                className="border-border text-foreground"
              >
                <PlusIcon />
                <span className="ml-1.5">Add Command</span>
              </Button>

              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  size="sm"
                  onClick={saveCommands}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? <LoadingIcon /> : <CheckIcon />}
                  <span className="ml-1">Save Commands</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingCommands(false)}
                  className="border-border"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {profile.commands && (profile.commands as BotCommand[]).length > 0 ? (
                <div className="space-y-2">
                  {(profile.commands as BotCommand[]).map((cmd, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border"
                    >
                      <code className="text-sm text-blue-400 font-mono">/{cmd.command}</code>
                      <span className="text-sm text-muted-foreground">&mdash;</span>
                      <span className="text-sm text-foreground">{cmd.description}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No commands configured</p>
              )}
              {saveSuccess === "commands" && (
                <p className="text-green-400 text-xs mt-2">Commands saved!</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
