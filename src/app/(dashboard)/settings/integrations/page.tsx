"use client";

/**
 * MCP Integrations Page
 *
 * Lets users manage their MCP (Model Context Protocol) server connections.
 * Stdio servers run inside the workspace container via bridge.
 * SSE servers are external HTTP endpoints.
 *
 * @module app/(dashboard)/settings/integrations/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiUrl } from "@/shared/config/urls";
import { Loader2, Plus, ServerIcon, Trash2, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MCPServer {
  id: string;
  name: string;
  transportType: "stdio" | "sse";
  config: {
    transportType: "stdio";
    command: string;
    args: string[];
    env?: Record<string, string>;
  } | {
    transportType: "sse";
    url: string;
    headers?: Record<string, string>;
  };
  isEnabled: boolean;
  status: string;
  lastError: string | null;
  createdAt: string;
}

const EMPTY_FORM = {
  name: "",
  transportType: "stdio" as "stdio" | "sse",
  command: "",
  args: "",
  sseUrl: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const { token } = useAuth();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editServer, setEditServer] = useState<MCPServer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch ──
  const loadServers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl("/mcp/servers"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load MCP servers");
      const json = await res.json() as { success: boolean; data: MCPServer[] };
      setServers(json.data ?? []);
    } catch {
      toast.error("Failed to load MCP integrations");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadServers(); }, [loadServers]);

  // ── Populate form when editing ──
  useEffect(() => {
    if (editServer) {
      const cfg = editServer.config;
      setForm({
        name: editServer.name,
        transportType: editServer.transportType,
        command: cfg.transportType === "stdio" ? cfg.command : "",
        args: cfg.transportType === "stdio" ? (cfg.args ?? []).join(" ") : "",
        sseUrl: cfg.transportType === "sse" ? cfg.url : "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editServer]);

  // ── Save (create or update) ──
  const handleSave = async () => {
    if (!token || !form.name.trim()) return;

    const config =
      form.transportType === "stdio"
        ? {
            transportType: "stdio" as const,
            command: form.command.trim(),
            args: form.args
              .split(/\s+/)
              .map((a) => a.trim())
              .filter(Boolean),
          }
        : {
            transportType: "sse" as const,
            url: form.sseUrl.trim(),
          };

    if (form.transportType === "stdio" && !config.command) {
      toast.error("Command is required for stdio servers");
      return;
    }
    if (form.transportType === "sse" && !(config as { url: string }).url) {
      toast.error("URL is required for SSE servers");
      return;
    }

    setIsSaving(true);
    try {
      const url = editServer
        ? apiUrl(`/mcp/servers/${editServer.id}`)
        : apiUrl("/mcp/servers");
      const method = editServer ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: form.name.trim(), config }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to save");
      }

      toast.success(editServer ? "MCP server updated" : "MCP server added");
      setShowAddDialog(false);
      setEditServer(null);
      void loadServers();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to save MCP server");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Toggle enabled ──
  const handleToggle = async (server: MCPServer) => {
    if (!token) return;
    try {
      await fetch(apiUrl(`/mcp/servers/${server.id}`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isEnabled: !server.isEnabled }),
      });
      void loadServers();
    } catch {
      toast.error("Failed to update server");
    }
  };

  // ── Delete ──
  const handleDelete = async (id: string) => {
    if (!token) return;
    setDeletingId(id);
    try {
      const res = await fetch(apiUrl(`/mcp/servers/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("MCP server removed");
      void loadServers();
    } catch {
      toast.error("Failed to delete MCP server");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Status badge ──
  function statusBadge(status: string) {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      connected: "default",
      disconnected: "secondary",
      error: "destructive",
    };
    return (
      <Badge variant={variants[status] ?? "outline"} className="text-xs capitalize">
        {status}
      </Badge>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">MCP Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect external tools to your AI assistant via the Model Context Protocol.
          </p>
        </div>
        <Button onClick={() => { setEditServer(null); setShowAddDialog(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Server
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <ServerIcon className="h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">No MCP servers configured</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Add a stdio or SSE MCP server to give your AI assistant access to external tools like
              databases, file systems, and APIs.
            </p>
            <Button variant="outline" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add your first server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => (
            <Card key={server.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                    <CardTitle className="text-base truncate">{server.name}</CardTitle>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {server.transportType}
                    </Badge>
                    {statusBadge(server.status)}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={server.isEnabled}
                      onCheckedChange={() => void handleToggle(server)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setEditServer(server); setShowAddDialog(true); }}
                    >
                      <span className="sr-only">Edit</span>
                      <Wrench className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deletingId === server.id}
                      onClick={() => void handleDelete(server.id)}
                    >
                      {deletingId === server.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                {server.config.transportType === "stdio" && (
                  <CardDescription className="text-xs font-mono truncate">
                    {server.config.command} {(server.config.args ?? []).join(" ")}
                  </CardDescription>
                )}
                {server.config.transportType === "sse" && (
                  <CardDescription className="text-xs font-mono truncate">
                    {server.config.url}
                  </CardDescription>
                )}
              </CardHeader>
              {Boolean(server.lastError) && (
                <CardContent className="pt-0">
                  <p className="text-xs text-destructive truncate">{server.lastError}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setEditServer(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editServer ? "Edit MCP Server" : "Add MCP Server"}</DialogTitle>
            <DialogDescription>
              Configure an MCP server to give your AI assistant extra tools.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name">Name</Label>
              <Input
                id="mcp-name"
                placeholder="e.g. Filesystem Tools"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Transport</Label>
              <Select
                value={form.transportType}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, transportType: v as "stdio" | "sse" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">
                    stdio — runs inside your workspace container
                  </SelectItem>
                  <SelectItem value="sse">
                    SSE — connects to an external HTTP endpoint
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.transportType === "stdio" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-command">Command</Label>
                  <Input
                    id="mcp-command"
                    placeholder="e.g. npx"
                    value={form.command}
                    onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-args">Arguments (space-separated)</Label>
                  <Input
                    id="mcp-args"
                    placeholder="e.g. -y @modelcontextprotocol/server-filesystem /workspace"
                    value={form.args}
                    onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
                  />
                </div>
              </>
            )}

            {form.transportType === "sse" && (
              <div className="space-y-1.5">
                <Label htmlFor="mcp-url">SSE URL</Label>
                <Input
                  id="mcp-url"
                  placeholder="https://mcp.example.com/sse"
                  value={form.sseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, sseUrl: e.target.value }))}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowAddDialog(false); setEditServer(null); }}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editServer ? "Save changes" : "Add server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
