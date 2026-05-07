"use client";

/**
 * Studio › Settings tab — edit project name/description; danger zone archive.
 */

import { useAuth } from "@/components/providers/auth-provider";
import { useProjectStudio } from "@/components/studio/project-studio-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { archiveProject, updateProject } from "@/lib/api-client";
import { Loader2, Save, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SettingsTabPage() {
  const { projectId, project, isLoading, error, refresh } = useProjectStudio();
  const { token, context } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const orgId =
    context.type === "organization" ? context.organizationId ?? null : null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name ?? "");
      setDescription(project.description ?? "");
    }
  }, [project]);

  const handleSave = async () => {
    setSaving(true);
    setLocalError(null);
    try {
      const res = await updateProject(
        projectId,
        { name, description },
        { organizationId: orgId },
        token ?? undefined,
      );
      if (!res.success) {
        setLocalError(res.error?.message || "Save failed");
      } else {
        await refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (
      !window.confirm(
        "Archive this project? Active resources will be paused. This action is reversible by an administrator.",
      )
    ) {
      return;
    }
    setArchiving(true);
    setLocalError(null);
    try {
      const res = await archiveProject(
        projectId,
        { organizationId: orgId },
        token ?? undefined,
      );
      if (!res.success) {
        setLocalError(res.error?.message || "Archive failed");
      } else {
        // After archive, return to the projects list in the current scope.
        const orgMatch = pathname.match(/^\/organizations\/([^/]+)\//);
        router.push(orgMatch ? `/organizations/${orgMatch[1]}/projects` : "/projects");
      }
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Project metadata and danger zone.
        </p>
      </div>

      {(error || localError) ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {localError ?? error}
        </div>
      ) : null}

      {isLoading && !project ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {project ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="project-slug">Slug</Label>
                <Input
                  id="project-slug"
                  value={project.slug}
                  readOnly
                  disabled
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Slug is immutable.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving || name.trim() === ""}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                Danger zone
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                Archive this project. Resources will be paused.
              </div>
              <Button
                variant="destructive"
                onClick={() => void handleArchive()}
                disabled={archiving}
              >
                {archiving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Archive project
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
