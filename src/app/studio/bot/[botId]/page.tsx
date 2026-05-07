"use client";

/**
 * Bot Studio Page — Individual Bot
 *
 * Renders the tabbed bot studio interface for a selected bot (gateway).
 * Tabs: Overview | Workflow | Plugins | Analytics | Settings
 *
 * @module app/studio/[botId]/page
 */

import { useStudio } from "@/app/studio/layout";
import { BotStudioView } from "@/components/studio/bot-studio-view";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function BotStudioPage() {
  const params = useParams();
  const router = useRouter();
  const botId = params.botId as string;
  const { gateways, plugins, isLoading } = useStudio();

  // Find the gateway for this bot
  const gateway = useMemo(
    () => gateways.find((gw) => gw.id === botId),
    [gateways, botId]
  );

  // Find plugins for this gateway
  const botPlugins = useMemo(
    () => plugins.filter((p) => p.gatewayId === botId),
    [plugins, botId]
  );

  // Redirect back if bot not found (after loading completes)
  useEffect(() => {
    if (!isLoading && !gateway && gateways.length > 0) {
      router.replace("/studio");
    }
  }, [isLoading, gateway, gateways.length, router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
          <p className="text-sm text-muted-foreground">Loading bot...</p>
        </div>
      </div>
    );
  }

  // Not found
  if (!gateway) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Bot not found</p>
      </div>
    );
  }

  return (
    <BotStudioView
      gateway={gateway}
      plugins={botPlugins}
    />
  );
}
