"use client";

/**
 * Studio › Workflow editor (Phase 3 bridge).
 *
 * `/studio/[projectId]/workflows/[wfId]` resolves the workflow's owning
 * Gateway from the project topology and forwards to the existing bot
 * studio editor at `/studio/bot/[gatewayId]?workflowId=[wfId]`.
 *
 * This bridge keeps a stable, project-scoped URL for workflow editing
 * without duplicating the ~1700 LOC `BotDetailView`. A future iteration
 * can replace the redirect with an inline editor while keeping the same
 * URL contract.
 */

import { useProjectStudio } from "@/components/studio/project-studio-context";
import { Button } from "@/components/ui/button";
import { useStudioBasePath } from "@/hooks/use-studio-base-path";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function WorkflowEditorBridgePage() {
  const params = useParams<{ projectId: string; wfId: string }>();
  const projectId = params?.projectId ?? "";
  const wfId = params?.wfId ?? "";
  const router = useRouter();
  const base = useStudioBasePath(projectId);
  const { topology, isLoading, error } = useProjectStudio();

  /** Find the gateway connected to this workflow via WORKFLOW_TO_GATEWAY edge. */
  const gatewayId = useMemo<string | null>(() => {
    if (!topology) return null;
    const workflowNodeId = `workflow:${wfId}`;
    const edge = topology.edges.find(
      (e) =>
        e.kind === "WORKFLOW_TO_GATEWAY" &&
        (e.source === workflowNodeId || e.target === workflowNodeId),
    );
    if (!edge) return null;
    const otherId = edge.source === workflowNodeId ? edge.target : edge.source;
    if (!otherId.startsWith("gateway:")) return null;
    const node = topology.nodes.find(
      (n) => n.id === otherId && n.kind === "GATEWAY",
    );
    return node?.refId ?? null;
  }, [topology, wfId]);

  const workflowExists = useMemo<boolean>(() => {
    if (!topology) return false;
    return topology.nodes.some(
      (n) => n.kind === "WORKFLOW" && n.refId === wfId,
    );
  }, [topology, wfId]);

  useEffect(() => {
    if (gatewayId) {
      router.replace(
        `/studio/bot/${encodeURIComponent(gatewayId)}?workflowId=${encodeURIComponent(wfId)}`,
      );
    }
  }, [gatewayId, router, wfId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading workflow…
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${base}/workflows`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Workflows
          </Link>
        </Button>
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!workflowExists) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${base}/workflows`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Workflows
          </Link>
        </Button>
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Workflow not found in this project.
        </div>
      </div>
    );
  }

  if (!gatewayId) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${base}/workflows`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Workflows
          </Link>
        </Button>
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          This workflow is not yet connected to a gateway. Open the
          Architecture canvas and link it to a gateway, then return here to
          edit.
        </div>
      </div>
    );
  }

  // Redirect in flight.
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Opening editor…
    </div>
  );
}
