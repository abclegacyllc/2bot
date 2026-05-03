"use client";

/**
 * Project versions page — Wave 3
 *
 * Lists `ProjectVersion` rows for a project (newest first), shows
 * STAGING / ACTIVE / ROLLED_BACK status, and exposes Activate / Rollback
 * actions wired to the api-client helpers.
 *
 * Gated by NEXT_PUBLIC_FEATURE_CHAT_FIRST. Calls notFound() when off so
 * the route is invisible until the flag is flipped on.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import {
  activateProjectVersion,
  listProjectVersions,
  rollbackProjectVersion,
  type ProjectVersionListItem,
  type ProjectVersionStatus,
} from "@/lib/api-client";
import { Loader2, RefreshCw, RotateCcw, Zap } from "lucide-react";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const FEATURE_CHAT_FIRST_ENABLED =
  (process.env.NEXT_PUBLIC_FEATURE_CHAT_FIRST ?? "disabled").toLowerCase() === "enabled";

const STATUS_VARIANT: Record<
  ProjectVersionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ACTIVE: "default",
  STAGING: "secondary",
  ROLLED_BACK: "outline",
};

export default function ProjectVersionsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const { token } = useAuth();

  const [versions, setVersions] = useState<ProjectVersionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!FEATURE_CHAT_FIRST_ENABLED) {
    notFound();
  }

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listProjectVersions(projectId, token ?? undefined);
      if (res.success && res.data) {
        setVersions(res.data);
      } else {
        setError(res.error?.message || "Failed to load versions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleActivate = async (versionId: string) => {
    setPendingId(versionId);
    try {
      const res = await activateProjectVersion(projectId, versionId, token ?? undefined);
      if (!res.success) {
        setError(res.error?.message || "Activation failed");
      } else {
        await refresh();
      }
    } finally {
      setPendingId(null);
    }
  };

  const handleRollback = async (versionId: string) => {
    const reason = window.prompt("Reason for rollback?")?.trim();
    if (!reason) return;
    setPendingId(versionId);
    try {
      const res = await rollbackProjectVersion(
        projectId,
        versionId,
        reason,
        token ?? undefined,
      );
      if (!res.success) {
        setError(res.error?.message || "Rollback failed");
      } else {
        await refresh();
      }
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Versions</h1>
          <p className="text-sm text-muted-foreground">
            Each apply of a BuildSpec creates a STAGING version. Activate to promote;
            roll back to revert to a previous snapshot.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!loading && versions.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No versions yet. Use the AI builder or apply a BuildSpec to create one.
        </div>
      ) : null}

      <div className="space-y-2">
        {versions.map((v) => {
          const isPending = pendingId === v.id;
          return (
            <div
              key={v.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">v{v.versionNumber}</span>
                  <Badge variant={STATUS_VARIANT[v.status]}>{v.status}</Badge>
                  {v.source ? (
                    <span className="text-xs text-muted-foreground">
                      via {v.source}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Created {new Date(v.createdAt).toLocaleString()}
                  {v.rolledBackAt ? (
                    <>
                      {" • Rolled back "}
                      {new Date(v.rolledBackAt).toLocaleString()}
                      {v.rollbackReason ? ` (${v.rollbackReason})` : ""}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {v.status === "STAGING" ? (
                  <Button
                    size="sm"
                    onClick={() => void handleActivate(v.id)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Activate
                  </Button>
                ) : null}
                {v.status !== "ACTIVE" && v.status !== "STAGING" ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRollback(v.id)}
                    disabled={isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Rollback
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
