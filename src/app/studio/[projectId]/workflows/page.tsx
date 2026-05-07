"use client";

/**
 * Studio › Workflows tab — list workflows owned by this project.
 *
 * Derived from the topology (project-scoped). Phase 3 will add the workflow
 * editor at `/studio/[projectId]/workflows/[wfId]`.
 */

import { useProjectStudio } from "@/components/studio/project-studio-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudioBasePath } from "@/hooks/use-studio-base-path";
import { Loader2, RefreshCw, Workflow as WorkflowIcon } from "lucide-react";
import Link from "next/link";

export default function WorkflowsTabPage() {
  const { projectId, topology, isLoading, error, refresh } = useProjectStudio();
  const base = useStudioBasePath(projectId);

  const workflows = (topology?.nodes ?? []).filter((n) => n.kind === "WORKFLOW");

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <WorkflowIcon className="h-6 w-6" />
            Workflows
          </h1>
          <p className="text-sm text-muted-foreground">
            Workflows attached to this project. Click to open the editor.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading && workflows.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading workflows…
        </div>
      ) : null}

      {!isLoading && workflows.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No workflows yet. Create one from the Architecture tab via the chat
          builder.
        </div>
      ) : null}

      <div className="space-y-2">
        {workflows.map((n) => {
          if (n.kind !== "WORKFLOW") return null;
          return (
            <Link
              key={n.id}
              href={`${base}/workflows/${encodeURIComponent(n.refId)}`}
              className="flex items-center justify-between gap-4 rounded-md border p-3 transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{n.label}</span>
                  <Badge variant="outline">{n.data.triggerType}</Badge>
                  <Badge variant={n.data.isEnabled ? "default" : "secondary"}>
                    {n.data.status}
                  </Badge>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {n.data.slug}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
