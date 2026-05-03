/**
 * ProjectCard — compact card for the Projects list page.
 *
 * @module components/dashboard/project-card
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectListItem } from "@/lib/api-client";
import { Bot, Boxes, FolderKanban, Globe, Workflow } from "lucide-react";
import Link from "next/link";

const KIND_ICON = {
  BOT: Bot,
  WEB_APP: Globe,
  AUTOMATION: Workflow,
  HYBRID: Boxes,
} as const;

const KIND_LABEL = {
  BOT: "Bot",
  WEB_APP: "Web app",
  AUTOMATION: "Automation",
  HYBRID: "Hybrid",
} as const;

const STATUS_VARIANT: Record<
  ProjectListItem["status"],
  "default" | "secondary" | "outline"
> = {
  ACTIVE: "default",
  PAUSED: "secondary",
  ARCHIVED: "outline",
};

export interface ProjectCardProps {
  project: ProjectListItem;
  hrefBase?: string; // e.g. "/projects" or "/organizations/<slug>/projects"
}

export function ProjectCard({ project, hrefBase = "/projects" }: ProjectCardProps) {
  const Icon = KIND_ICON[project.kind] ?? FolderKanban;
  const href = `${hrefBase}/${project.id}`;

  return (
    <Link href={href} className="block group">
      <Card className="h-full transition-colors group-hover:border-primary/60">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            style={project.color ? { backgroundColor: project.color, color: "white" } : undefined}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate text-base">{project.name}</CardTitle>
            <p className="truncate text-xs text-muted-foreground">/{project.slug}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
            {project.description ?? "No description."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{KIND_LABEL[project.kind]}</Badge>
            <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
            {project.isDefault ? <Badge variant="secondary">Default</Badge> : null}
            {project.activeVersionId ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                v: {project.activeVersionId.slice(0, 8)}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
