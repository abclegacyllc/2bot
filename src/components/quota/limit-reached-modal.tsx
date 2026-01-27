"use client";

/**
 * Limit Reached Modal Component
 *
 * A modal dialog shown when a user hits their resource limit.
 * Displays the blocked resource, current usage, and upgrade options.
 *
 * @module components/quota/limit-reached-modal
 */

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, ArrowRight, Clock, XCircle, Zap } from "lucide-react";
import Link from "next/link";

type ResourceType =
  | "executions"
  | "gateways"
  | "plugins"
  | "workflows"
  | "storage"
  | "team_members";

interface LimitReachedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceType;
  current: number;
  limit: number;
  resetsAt?: Date;
  currentPlan?: string;
  suggestedPlan?: string;
  suggestedLimit?: number | null;
  pricingUrl?: string;
  onUpgrade?: () => void;
}

// Resource display names
const RESOURCE_NAMES: Record<ResourceType, string> = {
  executions: "monthly executions",
  gateways: "AI gateways",
  plugins: "plugins",
  workflows: "workflows",
  storage: "storage",
  team_members: "team members",
};

// Resource-specific help text
const RESOURCE_HELP: Record<ResourceType, string> = {
  executions:
    "Each time a workflow runs or an API call is made, it counts as an execution.",
  gateways:
    "Gateways connect your workflows to AI providers like OpenAI, Anthropic, etc.",
  plugins:
    "Plugins extend your workspace with additional functionality and integrations.",
  workflows: "Workflows automate tasks by chaining AI operations together.",
  storage: "Storage is used for logs, files, and workflow artifacts.",
  team_members: "Team members can collaborate on workflows and share resources.",
};

// Format reset time
function formatResetTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "later today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return `in ${diffDays} days`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// Format limit number
function formatLimit(limit: number | null | undefined): string {
  if (limit === null || limit === undefined || limit === -1) return "Unlimited";
  if (limit >= 1_000_000) return `${(limit / 1_000_000).toFixed(0)}M`;
  if (limit >= 1_000) return `${(limit / 1_000).toFixed(0)}K`;
  return limit.toLocaleString();
}

export function LimitReachedModal({
  open,
  onOpenChange,
  resource,
  current,
  limit,
  resetsAt,
  currentPlan = "Free",
  suggestedPlan,
  suggestedLimit,
  pricingUrl = "/billing",
  onUpgrade,
}: LimitReachedModalProps) {
  const resourceName = RESOURCE_NAMES[resource];
  const helpText = RESOURCE_HELP[resource];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <DialogTitle className="text-left">Limit Reached</DialogTitle>
              <DialogDescription className="text-left">
                You&apos;ve used all your {resourceName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Usage indicator */}
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  {current.toLocaleString()} / {limit.toLocaleString()}
                </span>
              </div>
              <span className="text-sm text-red-600 dark:text-red-400">
                100% used
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-red-200 dark:bg-red-800">
              <div className="h-full w-full rounded-full bg-red-500" />
            </div>
          </div>

          {/* Help text */}
          <p className="text-sm text-muted-foreground">{helpText}</p>

          {/* Reset time */}
          {resetsAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Your {resourceName} reset {formatResetTime(resetsAt)}
              </span>
            </div>
          )}

          {/* Upgrade comparison */}
          {suggestedPlan && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  Upgrade to {suggestedPlan}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 text-center">
                  <p className="text-xs text-muted-foreground">{currentPlan}</p>
                  <p className="text-lg font-bold">{formatLimit(limit)}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-primary">{suggestedPlan}</p>
                  <p className="text-lg font-bold text-primary">
                    {formatLimit(suggestedLimit)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link href={pricingUrl} className="w-full">
            <Button
              className="w-full"
              onClick={() => {
                onUpgrade?.();
                onOpenChange(false);
              }}
            >
              <Zap className="mr-2 h-4 w-4" />
              Upgrade Now
            </Button>
          </Link>
          {resetsAt && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Wait for reset ({formatResetTime(resetsAt)})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
