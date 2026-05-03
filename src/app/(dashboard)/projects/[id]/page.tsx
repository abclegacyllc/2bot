"use client";

/**
 * Project detail page — Wave 1
 *
 * Read-only summary of a single project. Wave 2 will add canvas/version
 * sub-views and inline editing.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProject } from "@/hooks/use-project";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";

const FEATURE_CHAT_FIRST_ENABLED =
  (process.env.NEXT_PUBLIC_FEATURE_CHAT_FIRST ?? "disabled").toLowerCase() === "enabled";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? null;
  const { project, isLoading, error } = useProject(projectId);

  if (!FEATURE_CHAT_FIRST_ENABLED) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Projects
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading && !project ? (
        <p className="text-sm text-muted-foreground">Loading project…</p>
      ) : null}

      {project ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">/{project.slug}</span>
              {project.description ? ` — ${project.description}` : null}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Kind</div>
                <Badge variant="outline">{project.kind}</Badge>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Status</div>
                <Badge>{project.status}</Badge>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Default</div>
                <span>{project.isDefault ? "Yes" : "No"}</span>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Active version</div>
                <span className="font-mono text-xs">
                  {project.activeVersionId ?? "—"}
                </span>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs uppercase text-muted-foreground">Created</div>
                <span>{new Date(project.createdAt).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Canvases, gateways, and version history will appear here in Wave&nbsp;2.
          </p>
        </>
      ) : null}
    </div>
  );
}
