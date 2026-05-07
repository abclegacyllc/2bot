"use client";

/**
 * Project Studio layout
 *
 * Route shell for `/studio/[projectId]/*`. Wraps children in
 * ProjectStudioProvider (project + topology) and renders a horizontal top-tab
 * bar (ProjectStudioTopTabs) — matching the layered look of `bot-studio-view`.
 * The outer Studio shell (top bar, cursor bar) is inherited from the parent
 * `studio/layout.tsx`.
 *
 * @module app/studio/[projectId]/layout
 */

import {
    ProjectStudioProvider,
    useProjectStudio,
} from "@/components/studio/project-studio-context";
import { ProjectStudioTopTabs } from "@/components/studio/project-studio-top-tabs";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";

function ProjectStudioInner({ children }: { children: ReactNode }) {
  const { projectId, project } = useProjectStudio();
  return (
    <div className="flex h-full min-w-0 flex-col">
      <ProjectStudioTopTabs
        projectId={projectId}
        projectName={project?.name ?? null}
      />
      <div className="min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

export default function ProjectStudioLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? "";

  if (!projectId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Invalid project URL.</div>
    );
  }

  return (
    <ProjectStudioProvider projectId={projectId}>
      <ProjectStudioInner>{children}</ProjectStudioInner>
    </ProjectStudioProvider>
  );
}
