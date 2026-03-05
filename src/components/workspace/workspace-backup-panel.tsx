"use client";

/**
 * Workspace Backup Panel
 *
 * UI for creating, listing, restoring, and deleting workspace backups.
 * Connects to the existing backup API routes.
 *
 * @module components/workspace/workspace-backup-panel
 */

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiUrl } from "@/shared/config/urls";
import { Archive, Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// ===========================================
// Types
// ===========================================

interface BackupInfo {
  id: string;
  containerDbId: string;
  containerName: string;
  filename: string;
  sizeBytes: number;
  sizeMb: number;
  createdAt: string;
}

interface WorkspaceBackupPanelProps {
  containerId: string | null;
  containerStatus?: string;
}

// ===========================================
// Helpers
// ===========================================

function formatSize(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ===========================================
// Component
// ===========================================

export function WorkspaceBackupPanel({ containerId, containerStatus }: WorkspaceBackupPanelProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchBackups = useCallback(async () => {
    if (!containerId) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/workspace/${containerId}/backup`), { headers });
      if (res.ok) {
        const json = await res.json();
        setBackups(json.data ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch backups:", err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleCreate = useCallback(async () => {
    if (!containerId) return;
    setCreating(true);
    try {
      const res = await fetch(apiUrl(`/workspace/${containerId}/backup`), {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Backup created successfully");
        await fetchBackups();
      } else {
        toast.error(json.data?.error ?? "Backup failed");
      }
    } catch (err) {
      toast.error(`Backup failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCreating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, fetchBackups]);

  const handleRestore = useCallback(async (backupId: string) => {
    if (!containerId) return;
    setRestoringId(backupId);
    try {
      const res = await fetch(apiUrl(`/workspace/${containerId}/backup/restore`), {
        method: "POST",
        headers,
        body: JSON.stringify({ backupId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Backup restored successfully");
      } else {
        toast.error(json.data?.error ?? "Restore failed");
      }
    } catch (err) {
      toast.error(`Restore failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRestoringId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  const handleDelete = useCallback(async (backupId: string) => {
    if (!containerId) return;
    try {
      const res = await fetch(apiUrl(`/workspace/${containerId}/backup/${backupId}`), {
        method: "DELETE",
        headers,
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Backup deleted");
        await fetchBackups();
      } else {
        toast.error(json.data?.error ?? "Delete failed");
      }
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, fetchBackups]);

  if (!containerId) return null;

  const isStopped = containerStatus === "STOPPED";

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Archive className="h-4 w-4 text-blue-400" />
              Backups
            </CardTitle>
            <CardDescription className="text-xs">
              Create and restore workspace snapshots
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="h-8"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            Create Backup
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && backups.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : backups.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No backups yet. Create one to save your workspace state.
          </p>
        ) : (
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between px-3 py-2 rounded border border-border/50 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono truncate">{backup.filename}</div>
                      <div className="text-muted-foreground">
                        {formatDate(backup.createdAt)} &middot; {formatSize(backup.sizeMb)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          disabled={!isStopped || restoringId === backup.id}
                        >
                          {restoringId === backup.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Restore
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will replace your current workspace files with the backup from{" "}
                            <strong>{formatDate(backup.createdAt)}</strong>.
                            {!isStopped ? " Stop the workspace first to restore." : " This action cannot be undone."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          {isStopped ? (
                            <AlertDialogAction
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={() => handleRestore(backup.id)}
                            >
                              Yes, Restore
                            </AlertDialogAction>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Stop workspace first
                            </Badge>
                          )}
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDelete(backup.id)}
                      title="Delete backup"
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
