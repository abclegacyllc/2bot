"use client";

/**
 * Studio › Gateways tab — list gateways (bots) attached to this project.
 *
 * Derived from project topology. Click-through opens the legacy bot editor
 * at `/studio/bot/[botId]` until Phase 3 retires it.
 */

import { useProjectStudio } from "@/components/studio/project-studio-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Router as RouterIcon } from "lucide-react";
import Link from "next/link";

export default function GatewaysTabPage() {
  const { topology, isLoading, error, refresh } = useProjectStudio();

  const gateways = (topology?.nodes ?? []).filter((n) => n.kind === "GATEWAY");

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <RouterIcon className="h-6 w-6" />
            Gateways
          </h1>
          <p className="text-sm text-muted-foreground">
            Bot gateways owned by this project.
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

      {isLoading && gateways.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading gateways…
        </div>
      ) : null}

      {!isLoading && gateways.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No gateways yet.
        </div>
      ) : null}

      <div className="space-y-2">
        {gateways.map((n) => {
          if (n.kind !== "GATEWAY") return null;
          return (
            <Link
              key={n.id}
              href={`/studio/bot/${encodeURIComponent(n.refId)}`}
              className="flex items-center justify-between gap-4 rounded-md border p-3 transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{n.label}</span>
                  <Badge variant="outline">{n.data.type}</Badge>
                  <Badge variant={n.data.status === "CONNECTED" ? "default" : "secondary"}>
                    {n.data.status}
                  </Badge>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
