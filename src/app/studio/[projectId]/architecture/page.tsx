"use client";

/**
 * Studio › Architecture tab — read-only canvas.
 *
 * Reuses `ArchitectureCanvas`. Topology comes from the surrounding
 * `ProjectStudioProvider` so the canvas refreshes when any tab triggers
 * `refresh()`. The chat-to-build surface is now the persistent CursorStudioBar
 * in **Build** mode — see `cursor-studio-bar.tsx` and the `builder` agent.
 */

import { ArchitectureCanvas } from "@/components/project-architecture/architecture-canvas";
import { useProjectStudio } from "@/components/studio/project-studio-context";
import { Button } from "@/components/ui/button";
import { useStudioBasePath } from "@/hooks/use-studio-base-path";
import type { TopologyNode } from "@/lib/api-client";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export default function ArchitectureTabPage() {
  const { projectId, project, topology, isLoading, error, refresh } =
    useProjectStudio();
  const router = useRouter();
  const base = useStudioBasePath(projectId);

  const handleSelectNode = useCallback(
    (node: TopologyNode) => {
      switch (node.kind) {
        case "WORKFLOW":
          router.push(
            `${base}/workflows/${encodeURIComponent(node.refId)}`,
          );
          return;
        case "PLUGIN":
          router.push(`${base}/plugins`);
          return;
        case "GATEWAY":
          router.push(`${base}/gateways`);
          return;
        case "HTTP_ROUTE":
        case "SCHEDULE":
        case "SECRET":
        case "EXTERNAL_API":
        case "DATABASE":
          router.push(`${base}/resources`);
          return;
        default: {
          const _exhaustive: never = node;
          void _exhaustive;
          return;
        }
      }
    },
    [base, router],
  );

  const handleExport = useCallback(() => {
    if (!topology) return;
    const blob = new Blob([JSON.stringify(topology, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${topology.project.slug}-architecture.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [topology]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b p-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {project?.name ?? "Architecture"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {topology
              ? `${topology.counts.nodes} nodes · ${topology.counts.edges} edges`
              : "Project topology"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!topology}
            title="Export the current architecture as JSON"
          >
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </div>

      {error ? (
        <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading && !topology ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading architecture…
        </div>
      ) : (
        <div className="flex-1">
          <ArchitectureCanvas
            topology={topology}
            onSelectNode={handleSelectNode}
          />
        </div>
      )}
    </div>
  );
}
