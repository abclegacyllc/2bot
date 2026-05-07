"use client";

/**
 * Studio › Plugins tab — list plugins attached to this project.
 *
 * Derived from project topology. Click-through opens the existing plugin
 * editor at `/plugins/[id]` (legacy route — Phase 5 may relocate).
 */

import { useProjectStudio } from "@/components/studio/project-studio-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plug, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function PluginsTabPage() {
  const { topology, isLoading, error, refresh } = useProjectStudio();

  const plugins = (topology?.nodes ?? []).filter((n) => n.kind === "PLUGIN");

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Plug className="h-6 w-6" />
            Plugins
          </h1>
          <p className="text-sm text-muted-foreground">
            Plugins installed in this project.
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

      {isLoading && plugins.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading plugins…
        </div>
      ) : null}

      {!isLoading && plugins.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No plugins installed in this project.
        </div>
      ) : null}

      <div className="space-y-2">
        {plugins.map((n) => {
          if (n.kind !== "PLUGIN") return null;
          return (
            <Link
              key={n.id}
              href={`/plugins/${encodeURIComponent(n.refId)}`}
              className="flex items-center justify-between gap-4 rounded-md border p-3 transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{n.label}</span>
                  <Badge variant={n.data.isEnabled ? "default" : "secondary"}>
                    {n.data.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {n.data.pluginSlug}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
