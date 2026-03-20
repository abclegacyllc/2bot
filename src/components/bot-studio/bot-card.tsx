"use client";

import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import type { GatewayOption } from "@/lib/api-client";
import type { UserPlugin } from "@/shared/types/plugin";
import {
    ChevronRight,
    GitBranch,
    Puzzle,
    Wifi,
    WifiOff
} from "lucide-react";
import { PlatformIcon } from "./platform-icons";

// ===========================================
// Types
// ===========================================

export interface BotData {
  gateway: GatewayOption;
  plugins: UserPlugin[];
}

interface BotCardProps {
  bot: BotData;
  onSelect: (bot: BotData) => void;
}

// ===========================================
// Helpers
// ===========================================

const GATEWAY_TYPE_LABEL: Record<string, string> = {
  TELEGRAM_BOT: "Telegram",
  DISCORD_BOT: "Discord",
  SLACK_BOT: "Slack",
  WHATSAPP_BOT: "WhatsApp",
};

// ===========================================
// Component
// ===========================================

export function BotCard({ bot, onSelect }: BotCardProps) {
  const { gateway, plugins } = bot;
  const activeCount = plugins.filter((p) => p.isEnabled).length;
  const hasErrors = plugins.some((p) => p.lastError);
  const typeLabel = GATEWAY_TYPE_LABEL[gateway.type] ?? gateway.type;
  const wf = gateway.workflowSummary;

  return (
    <Card
      className="border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group"
      onClick={() => onSelect(bot)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <PlatformIcon type={gateway.type} className="h-6 w-6 text-muted-foreground" />
            <div>
              <CardTitle className="text-foreground text-base group-hover:text-emerald-400 transition-colors">
                {gateway.name}
              </CardTitle>
              <CardDescription className="text-xs">{typeLabel}</CardDescription>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors mt-1" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={gateway.status === "CONNECTED" ? "default" : "secondary"}
            className="text-[11px] gap-1"
          >
            {gateway.status === "CONNECTED" ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {gateway.status === "CONNECTED" ? "Online" : gateway.status.toLowerCase()}
          </Badge>
          <Badge
            variant={gateway.mode === "workflow" ? "default" : "outline"}
            className="text-[10px]"
          >
            {gateway.mode === "workflow" ? "Workflow" : "Plugin"}
          </Badge>
          {hasErrors ? (
            <Badge variant="destructive" className="text-[11px]">
              Has errors
            </Badge>
          ) : null}
        </div>

        {/* Capabilities */}
        {gateway.mode === "workflow" && wf ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {wf.stepCount} step{wf.stepCount !== 1 ? "s" : ""}
              {wf.executionCount > 0 && (
                <span className="text-muted-foreground">
                  · {wf.executionCount} run{wf.executionCount !== 1 ? "s" : ""}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1">
              <Badge
                variant={wf.status === "ACTIVE" && wf.isEnabled ? "default" : "secondary"}
                className="text-[10px]"
              >
                {wf.status === "ACTIVE" && wf.isEnabled
                  ? "Active"
                  : wf.status === "ACTIVE"
                    ? "Disabled"
                    : wf.status.charAt(0) + wf.status.slice(1).toLowerCase()}
              </Badge>
              {wf.lastError ? (
                <Badge variant="destructive" className="text-[10px]">
                  Error
                </Badge>
              ) : null}
            </div>
          </div>
        ) : plugins.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Puzzle className="h-3 w-3" />
              {plugins.length} plugin{plugins.length !== 1 ? "s" : ""}
              {activeCount > 0 && (
                <span className="text-emerald-500">({activeCount} active)</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1">
              {plugins.slice(0, 4).map((p) => (
                <Badge
                  key={p.id}
                  variant={p.isEnabled ? "outline" : "secondary"}
                  className="text-[10px] font-normal"
                >
                  {p.pluginName}
                </Badge>
              ))}
              {plugins.length > 4 && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  +{plugins.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No plugins added yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
