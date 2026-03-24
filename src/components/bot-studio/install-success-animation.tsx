"use client";

/**
 * Install Success Animation (C1 + C2)
 *
 * Three-step progress indicator shown after a plugin is installed.
 * Checks appear sequentially: Installed → Running → Ready.
 * Includes "Test it now" prompt for Telegram bots.
 *
 * @module components/bot-studio/install-success-animation
 */

import { Check, ExternalLink, Loader2 } from "lucide-react";

// ===========================================
// Types
// ===========================================

export type SuccessPhase = "installed" | "running" | "ready";

interface InstallSuccessAnimationProps {
  pluginName: string;
  phase: SuccessPhase;
  botUsername?: string;
  gatewayType?: string;
}

// ===========================================
// Component
// ===========================================

const STEPS: { key: SuccessPhase; label: string }[] = [
  { key: "installed", label: "Installed" },
  { key: "running", label: "Running" },
  { key: "ready", label: "Ready to receive messages" },
];

const PHASE_INDEX: Record<SuccessPhase, number> = {
  installed: 0,
  running: 1,
  ready: 2,
};

export function InstallSuccessAnimation({
  pluginName: _pluginName,
  phase,
  botUsername,
  gatewayType,
}: InstallSuccessAnimationProps) {
  const currentIdx = PHASE_INDEX[phase];

  return (
    <div className="mt-2 space-y-1.5">
      {STEPS.map((step, i) => {
        if (i > currentIdx + 1) return null; // Don't show steps more than 1 ahead

        const isInProgress = i === currentIdx + 1;

        if (isInProgress) {
          return (
            <div
              key={step.key}
              className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400/60" />
              <span>{step.label}...</span>
            </div>
          );
        }

        return (
          <div
            key={step.key}
            className="flex items-center gap-2 text-xs text-emerald-400"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{step.label}</span>
          </div>
        );
      })}

      {/* Test it prompt (C2) — shown when all 3 checks complete */}
      {phase === "ready" && (
        <div className="mt-2 pt-2 border-t border-border/50">
          {botUsername ? (
            <a
              href={`https://t.me/${encodeURIComponent(botUsername)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open Telegram and send a message to test! →
            </a>
          ) : gatewayType?.includes("DISCORD") ? (
            <p className="text-xs text-muted-foreground">
              Send a message in your Discord server to test!
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Send a message to your bot to see it in action!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
