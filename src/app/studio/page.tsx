"use client";

/**
 * Studio Home Page
 *
 * Landing page when no bot is selected.
 * - Has bots → shows bot cards for user to pick one.
 * - No bots  → onboarding prompt to create first bot.
 *
 * @module app/studio/page
 */

import { useStudio } from "@/app/studio/layout";
import { CreateBotWizard } from "@/components/bot-studio/create-bot-wizard";
import { PlatformIcon } from "@/components/bot-studio/platform-icons";
import { CursorStudioBar } from "@/components/cursor/cursor-studio-bar";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Plus, Sparkles, Workflow } from "lucide-react";
import { useState } from "react";

export default function StudioHomePage() {
  const { gateways, isLoading, selectBot, refresh } = useStudio();
  const { token, user, context } = useAuth();
  const organizationId =
    context.type === "organization" ? context.organizationId : undefined;
  const [showCreateWizard, setShowCreateWizard] = useState(false);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-lg w-full text-center space-y-6">
          {/* Hero */}
          <div className="space-y-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center mb-4">
              <Workflow className="h-8 w-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome to 2Bot Studio
            </h1>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              {isLoading
                ? "Loading your bots..."
                : gateways.length > 0
                  ? "Select a bot to start building."
                  : "Create your first bot to get started."}
            </p>
          </div>

          {/* Loading */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : gateways.length > 0 ? (
            /* Bot list */
            <div className="space-y-3 mt-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Your Bots
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {gateways.map((gw) => (
                  <Card
                    key={gw.id}
                    className="border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group"
                    onClick={() => selectBot(gw.id)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-muted/60 flex items-center justify-center flex-shrink-0">
                        <PlatformIcon type={gw.type} className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-medium truncate group-hover:text-purple-400 transition-colors">
                          {gw.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {gw.status === "CONNECTED" ? "Online" : "Offline"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Create another bot */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 mt-2"
                onClick={() => setShowCreateWizard(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Create another bot
              </Button>
            </div>
          ) : (
            /* Empty state — no bots */
            <div className="space-y-4 mt-4">
              <div className="p-6 rounded-lg border border-dashed border-border">
                <Bot className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  No bots yet. Create one to start building workflows and adding
                  plugins.
                </p>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                  onClick={() => setShowCreateWizard(true)}
                >
                  <Plus className="h-4 w-4" />
                  Create a Bot
                </Button>
              </div>
            </div>
          )}

          {/* AI hint */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-6">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            <span>
              Tip: Use the Cursor bar below to ask questions or describe what you
              want to build
            </span>
          </div>
        </div>
      </div>

      {/* Cursor Studio Bar */}
      <div className="flex-shrink-0 relative">
        <CursorStudioBar
          token={token}
          userId={user?.id}
          organizationId={organizationId}
          workflow={null}
        />
      </div>

      <CreateBotWizard
        open={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        token={token}
        organizationId={organizationId}
        onCreated={() => {
          setShowCreateWizard(false);
          refresh();
        }}
      />
    </div>
  );
}
