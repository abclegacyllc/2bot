"use client";

/**
 * Studio › Resources tab — typed `ProjectResource` rows grouped by kind.
 *
 * Reuses CreateResourceDialog / EditResourceDialog from the legacy
 * `(dashboard)/projects/[id]/resources/` folder so we don't duplicate dialog
 * markup. Phase 5 will relocate the dialogs into `components/` and delete the
 * legacy route.
 */

import { useAuth } from "@/components/providers/auth-provider";
import { useProjectStudio } from "@/components/studio/project-studio-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    listProjectResources,
    type ProjectResource,
    type ProjectResourceKind,
    type ProjectResourceStatus,
} from "@/lib/api-client";
import { Layers, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CreateResourceDialog } from "@/components/project-resources/CreateResourceDialog";
import { EditResourceDialog } from "@/components/project-resources/EditResourceDialog";

const STATUS_VARIANT: Record<
  ProjectResourceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ACTIVE: "default",
  PAUSED: "secondary",
  ERROR: "destructive",
  ARCHIVED: "outline",
};

const KIND_LABEL: Record<ProjectResourceKind, string> = {
  GATEWAY_BOT: "Bot Gateway",
  HTTP_ROUTE: "HTTP Route",
  SCHEDULE: "Schedule",
  SECRET: "Secret",
  EXTERNAL_API: "External API",
  DATABASE: "Database",
  KV_STORE: "KV Store",
  OBJECT_STORE: "Object Store",
};

export default function ResourcesTabPage() {
  const { projectId, refresh: refreshStudio } = useProjectStudio();
  const { token } = useAuth();

  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectResource | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listProjectResources(projectId, {}, token ?? undefined);
      if (res.success && res.data) {
        setResources(res.data);
      } else {
        setError(res.error?.message || "Failed to load resources");
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

  const onMutated = useCallback(() => {
    void refresh();
    void refreshStudio();
  }, [refresh, refreshStudio]);

  const byKind = resources.reduce<Record<string, ProjectResource[]>>((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {});
  const kinds = Object.keys(byKind).sort() as ProjectResourceKind[];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Layers className="h-6 w-6" />
            Resources
          </h1>
          <p className="text-sm text-muted-foreground">
            All typed resources owned by this project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New resource
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && resources.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading resources…
        </div>
      ) : null}

      {!loading && resources.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No resources yet. Create a Gateway to see your first GATEWAY_BOT
          resource here.
        </div>
      ) : null}

      <div className="space-y-6">
        {kinds.map((kind) => (
          <section key={kind} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {KIND_LABEL[kind] ?? kind}
            </h2>
            <div className="space-y-2">
              {(byKind[kind] ?? []).map((r) => {
                const editable =
                  r.kind === "HTTP_ROUTE" ||
                  r.kind === "SCHEDULE" ||
                  r.kind === "SECRET";
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-4 rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {r.name}
                        </span>
                        <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{r.slug}</span>
                        {r.gatewayId ? (
                          <span> • gateway {r.gatewayId.slice(0, 10)}…</span>
                        ) : null}
                        <span>
                          {" "}
                          • Created {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {editable ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <CreateResourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        token={token ?? null}
        onCreated={onMutated}
      />

      <EditResourceDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        projectId={projectId}
        resource={editing}
        token={token ?? null}
        onSaved={onMutated}
      />
    </div>
  );
}
