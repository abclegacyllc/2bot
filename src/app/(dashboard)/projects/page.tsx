"use client";

/**
 * Projects list page
 *
 * Renders the user's (or current org's) projects as a grid of cards.
 * Always-on after the unified Studio rollout; cards link directly into
 * `/studio/[id]` (or the org-scoped variant).
 */

import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { ProjectCard } from "@/components/dashboard/project-card";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-project";
import { FolderPlus, RefreshCw } from "lucide-react";

export default function ProjectsPage() {
  const { context } = useAuth();
  const { projects, isLoading, error, refresh } = useProjects();

  const orgSlug = context.type === "organization" ? context.organizationSlug : null;
  const hrefBase = orgSlug ? `/organizations/${orgSlug}/studio` : "/studio";

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            A project groups gateways, plugins, and canvases that ship together.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <CreateProjectDialog
            trigger={
              <Button size="sm">
                <FolderPlus className="mr-2 h-4 w-4" />
                New project
              </Button>
            }
            onCreated={() => void refresh()}
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!isLoading && projects.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No projects yet. A default project will be created automatically when
            you add your first bot, workflow, or plugin.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} hrefBase={hrefBase} />
        ))}
      </div>
    </div>
  );
}
