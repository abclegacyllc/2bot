"use client";

/**
 * Chat-first dashboard surface
 *
 * Dedicated chat landing page that lets a user describe what they want
 * and have Cursor propose a BuildSpec. The actual chat UX is the
 * already-mounted floating CursorPanel (bottom-right of the dashboard);
 * this page is the on-ramp / explainer for the new flow.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, MessageSquare, Sparkles } from "lucide-react";
import Link from "next/link";

export default function ChatPage() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Build with AI</h1>
        <p className="text-sm text-muted-foreground">
          Describe a workflow, gateway, or plugin in plain language. The AI
          builder will draft a BuildSpec — you review and apply with one click.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Open the chat panel (bottom-right) and describe what you want to
              build — e.g. <em>&ldquo;Create an invoice approval workflow with
              Slack notifications&rdquo;</em>.
            </li>
            <li>
              The AI proposes a <strong>BuildSpec</strong> directly in chat,
              showing the gateways, plugins, and workflows it plans to create.
            </li>
            <li>
              Review the summary and click <strong>Apply</strong>. The builder
              validates, runs smoke tests, and rolls back automatically on
              failure.
            </li>
            <li>
              On success, jump to the new project to fine-tune it.
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/projects">
            <FolderKanban className="mr-2 h-4 w-4" />
            Browse projects
          </Link>
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Use the floating chat panel to start a build.
        </span>
      </div>
    </div>
  );
}
