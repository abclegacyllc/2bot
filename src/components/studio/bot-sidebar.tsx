"use client";

/**
 * Bot Sidebar
 *
 * Left panel for the 2Bot Studio showing:
 * - Bot (gateway) list with status indicators
 * - Create bot button
 * - Collapsible with icon strip at bottom
 *
 * @module components/studio/bot-sidebar
 */

import { useStudio } from "@/app/studio/layout";
import { CreateBotWizard } from "@/components/bot-studio/create-bot-wizard";
import { PlatformIcon } from "@/components/bot-studio/platform-icons";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    ChevronLeft,
    ChevronRight,
    LogOut,
    MessageSquare,
    Plus,
    Settings,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

// =============================================================================
// Helpers
// =============================================================================

const GATEWAY_TYPE_SHORT: Record<string, string> = {
  TELEGRAM_BOT: "Telegram",
  DISCORD_BOT: "Discord",
  SLACK_BOT: "Slack",
  WHATSAPP_BOT: "WhatsApp",
};

// =============================================================================
// Component
// =============================================================================

export function BotSidebar() {
  const {
    gateways,
    plugins,
    selectedBotId,
    selectBot,
    refresh,
    isLoading,
    sidebarCollapsed,
    toggleSidebar,
  } = useStudio();
  const { token, context } = useAuth();
  const organizationId =
    context.type === "organization" ? context.organizationId : undefined;

  const [showCreateWizard, setShowCreateWizard] = useState(false);

  // Count plugins per gateway
  const pluginCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of plugins) {
      if (p.gatewayId) {
        counts.set(p.gatewayId, (counts.get(p.gatewayId) ?? 0) + 1);
      }
    }
    return counts;
  }, [plugins]);

  return (
    <>
      <aside
        className={cn(
          "flex-shrink-0 h-full glass border-r border-border flex flex-col transition-all duration-200",
          sidebarCollapsed ? "w-14" : "w-60"
        )}
      >
        {/* Header: Title + Create */}
        <div className="h-11 flex items-center justify-between px-3 border-b border-border flex-shrink-0">
          {!sidebarCollapsed && (
            <span className="text-sm font-semibold text-foreground truncate">
              Bots
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {!sidebarCollapsed && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCreateWizard(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Create Bot</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Bot List */}
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {isLoading ? (
              // Loading skeletons
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md p-2",
                    sidebarCollapsed ? "justify-center" : ""
                  )}
                >
                  <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  )}
                </div>
              ))
            ) : gateways.length === 0 ? (
              // Empty state
              !sidebarCollapsed && (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-muted-foreground mb-3">
                    No bots yet
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() => setShowCreateWizard(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Create your first bot
                  </Button>
                </div>
              )
            ) : (
              // Bot items
              gateways.map((gw) => {
                const isSelected = gw.id === selectedBotId;
                const isConnected = gw.status === "CONNECTED";
                const pCount = pluginCounts.get(gw.id) ?? 0;
                const typeLabel = GATEWAY_TYPE_SHORT[gw.type] ?? gw.type;

                const item = (
                  <button
                    key={gw.id}
                    onClick={() => selectBot(gw.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-md p-2 transition-colors text-left group",
                      isSelected
                        ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      sidebarCollapsed && "justify-center px-0"
                    )}
                  >
                    {/* Bot icon with status dot */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-md flex items-center justify-center",
                          isSelected
                            ? "bg-[var(--primary)]/20"
                            : "bg-muted/60"
                        )}
                      >
                        <PlatformIcon
                          type={gw.type}
                          className="h-4 w-4"
                        />
                      </div>
                      {/* Status dot */}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                          isConnected
                            ? "bg-emerald-500"
                            : "bg-zinc-500"
                        )}
                      />
                    </div>

                    {/* Bot name + meta */}
                    {!sidebarCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">
                          {gw.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                          {typeLabel}
                          {pCount > 0 && ` · ${pCount} plugin${pCount !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    )}
                  </button>
                );

                // Wrap in tooltip when collapsed
                if (sidebarCollapsed) {
                  return (
                    <TooltipProvider key={gw.id} delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>{item}</TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          <p className="font-medium">{gw.name}</p>
                          <p className="text-muted-foreground">
                            {isConnected ? "Online" : "Offline"} · {typeLabel}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                }

                return item;
              })
            )}
          </div>
        </ScrollArea>

        {/* Bottom Icon Strip */}
        <div className="border-t border-border p-1.5 flex-shrink-0">
          <div
            className={cn(
              "flex gap-0.5",
              sidebarCollapsed ? "flex-col items-center" : "items-center"
            )}
          >
            <SidebarIconButton
              icon={Users}
              label="Team"
              href={
                context.type === "organization" && context.organizationSlug
                  ? `/organizations/${context.organizationSlug}/members`
                  : "/settings"
              }
              collapsed={sidebarCollapsed}
            />
            <SidebarIconButton
              icon={MessageSquare}
              label="Messages"
              href="/2bot-ai"
              collapsed={sidebarCollapsed}
            />
            <SidebarIconButton
              icon={Settings}
              label="Settings"
              href="/settings"
              collapsed={sidebarCollapsed}
            />
            <SidebarIconButton
              icon={LogOut}
              label="Dashboard"
              href="/"
              collapsed={sidebarCollapsed}
            />
          </div>
        </div>
      </aside>

      {/* Create Bot Wizard */}
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
    </>
  );
}

// =============================================================================
// Sidebar Icon Button
// =============================================================================

function SidebarIconButton({
  icon: Icon,
  label,
  href,
  collapsed,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  collapsed: boolean;
}) {
  const btn = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      asChild
    >
      <Link href={href}>
        <Icon className="h-4 w-4" />
      </Link>
    </Button>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
