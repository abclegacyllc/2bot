"use client";

/**
 * Project resources page — (Path C)
 *
 * Lists `ProjectResource` rows for a project, filtered by kind. 
 * only ships the GATEWAY_BOT kind — every Gateway has a paired
 * ProjectResource via the sidecar FK. Other kinds (HTTP_ROUTE, SCHEDULE,
 * SECRET, …) appear here automatically as their phases ship.
 *
 * Gated by NEXT_PUBLIC_FEATURE_CHAT_FIRST. Calls notFound() when off.
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listProjectResources,
  type ProjectResource,
  type ProjectResourceKind,
  type ProjectResourceStatus,
} from "@/lib/api-client";
import { Layers, Loader2, RefreshCw } from "lucide-react";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const FEATURE_CHAT_FIRST_ENABLED =
  (process.env.NEXT_PUBLIC_FEATURE_CHAT_FIRST ?? "disabled").toLowerCase() ===
  "enabled";

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

export default function ProjectResourcesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const { token } = useAuth();

  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!FEATURE_CHAT_FIRST_ENABLED) {
    notFound();
  }

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

  // Group by kind for visual sectioning.
  const byKind = resources.reduce<Record<string, ProjectResource[]>>(
    (acc, r) => {
      (acc[r.kind] ??= []).push(r);
      return acc;
    },
    {},
  );
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
            All typed resources owned by this project. Bots, HTTP routes,
            schedules, and more.
          </p>
        </div>
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
              {(byKind[kind] ?? []).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {r.name}
                      </span>
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {r.status}
                      </Badge>
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
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
