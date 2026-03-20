/**
 * AI Visual Cursor — Render Component
 *
 * The floating cursor element that users see moving across the dashboard.
 * Renders:
 *   - Animated cursor icon (pointer/click/typing indicators)
 *   - Label tooltip showing what the agent is doing + progress (Step X/Y)
 *   - Highlight ring on targeted elements
 *   - Secret input dialog (with Escape to dismiss)
 *   - Progress toast messages
 *
 * Mounted in the dashboard layout as a fixed overlay.
 *
 * @module components/cursor/cursor
 */

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Bot,
  Check,
  Eye,
  Loader2,
  MousePointer2,
  Pencil,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useCursorOptional } from "./cursor-provider";
import type { CursorMode } from "./cursor.types";

// ===========================================
// Cursor Icon per Mode
// ===========================================

function CursorIcon({ mode }: { mode: CursorMode }) {
  switch (mode) {
    case "moving":
    case "pointing":
      return <MousePointer2 className="h-5 w-5 text-primary" />;
    case "clicking":
      return <MousePointer2 className="h-5 w-5 text-primary scale-75 transition-transform" />;
    case "typing":
      return <Pencil className="h-5 w-5 text-blue-500" />;
    case "thinking":
      return <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />;
    case "success":
      return <Check className="h-5 w-5 text-green-500" />;
    case "error":
      return <X className="h-5 w-5 text-red-500" />;
    default:
      return null;
  }
}

// ===========================================
// Highlight Ring
// ===========================================

function HighlightRing({ target }: { target: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = document.querySelector(`[data-ai-target="${target}"]`);
    if (!el) return;

    const update = () => setRect(el.getBoundingClientRect());
    update();

    // Update on scroll/resize
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("scroll", update, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
    };
  }, [target]);

  if (!rect) return null;

  return (
    <div
      className="fixed pointer-events-none z-[9998] rounded-lg transition-all duration-300"
      style={{
        left: rect.left - 4,
        top: rect.top - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        boxShadow: "0 0 0 2px hsl(var(--primary) / 0.6), 0 0 20px 4px hsl(var(--primary) / 0.15)",
      }}
    >
      {/* Pulse ring */}
      <div className="absolute inset-0 rounded-lg animate-pulse border-2 border-primary/40" />
    </div>
  );
}

// ===========================================
// Pulse Overlay — page-level or element-targeted glow
// ===========================================

function PulseOverlay({ target }: { target: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const isPage = target === "__page__";

  useEffect(() => {
    if (isPage) return;
    const el = document.querySelector(`[data-ai-target="${target}"]`);
    if (!el) return;
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
    };
  }, [target, isPage]);

  if (isPage) {
    // Full page content area pulse
    return (
      <div
        className="fixed inset-0 pointer-events-none z-[9996]"
        style={{
          background: "radial-gradient(ellipse at center, hsl(var(--primary) / 0.06) 0%, transparent 70%)",
          animation: "cursor-page-pulse 2s ease-in-out infinite",
        }}
      />
    );
  }

  if (!rect) return null;

  return (
    <div
      className="fixed pointer-events-none z-[9996] rounded-xl"
      style={{
        left: rect.left - 8,
        top: rect.top - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        boxShadow: "0 0 0 3px hsl(var(--primary) / 0.4), 0 0 30px 8px hsl(var(--primary) / 0.12)",
        animation: "cursor-element-pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ===========================================
// Spotlight Overlay — dim everything except target
// ===========================================

function SpotlightOverlay({ target }: { target: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const isPage = target === "__page__";

  useEffect(() => {
    if (isPage) return;
    const el = document.querySelector(`[data-ai-target="${target}"]`);
    if (!el) return;
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
    };
  }, [target, isPage]);

  // Page spotlight: light vignette dims edges
  if (isPage) {
    return (
      <div
        className="fixed inset-0 pointer-events-none z-[9997] transition-opacity duration-500"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%)",
        }}
      />
    );
  }

  if (!rect) return null;

  // Element spotlight: dark overlay with a cutout hole
  const pad = 12;
  return (
    <div className="fixed inset-0 pointer-events-none z-[9997] transition-opacity duration-500">
      <svg width="100%" height="100%" className="absolute inset-0">
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - pad}
              y={rect.top - pad}
              width={rect.width + pad * 2}
              height={rect.height + pad * 2}
              rx={12}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.25)"
          mask="url(#spotlight-mask)"
        />
      </svg>
      {/* Glow ring around the cutout */}
      <div
        className="absolute rounded-xl"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 2px hsl(var(--primary) / 0.5), 0 0 24px 4px hsl(var(--primary) / 0.1)",
        }}
      />
    </div>
  );
}

// ===========================================
// Secret Input Dialog
// ===========================================

function SecretDialog({
  label,
  hint,
  secretId,
  onSubmit,
  onDismiss,
}: {
  label: string;
  hint?: string;
  secretId: string;
  onSubmit: (secretId: string, value: string) => void;
  onDismiss: (secretId: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape key dismisses dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss(secretId);
      }
      // Focus trap — keep Tab within the dialog
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [secretId, onDismiss]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(secretId, value.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="AI Agent needs your input" className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Eye className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Agent needs your input</h3>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>

        {/* Info badge */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 flex items-start gap-2">
          <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            This value is encrypted and stored securely. The AI agent will <strong>never see</strong> the actual
            value — it only receives a confirmation that you provided it.
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            ref={inputRef}
            type="password"
            placeholder={hint || `Enter ${label}...`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="new-password"
            aria-label={label}
            data-1p-ignore
          />
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDismiss(secretId)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!value.trim()}>
              Submit Securely
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===========================================
// Main Cursor Component
// ===========================================

export function Cursor() {
  const ctx = useCursorOptional();

  // Global Escape key to cancel the cursor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ctx?.state.active && !ctx.state.secretDialog) {
        e.preventDefault();
        ctx.cancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ctx]);

  // Don't render anything if not inside provider or not active
  if (!ctx || !ctx.state.active) return null;

  const { state, cancel, submitSecret, dismissSecret } = ctx;

  // Build progress text: "Step 3/8"
  const progressText =
    state.totalSteps > 0 && state.stepIndex > 0
      ? `Step ${state.stepIndex}/${state.totalSteps}`
      : null;

  // Viewport boundary detection for label:
  // If cursor is in the right 30% of the viewport, anchor label to the LEFT of the cursor
  // If cursor is near the bottom, move label ABOVE the cursor
  const nearRight = typeof window !== "undefined" && state.position.x > window.innerWidth * 0.7;
  const nearBottom = typeof window !== "undefined" && state.position.y > window.innerHeight - 80;

  return (
    <>
      {/* Highlight ring on targeted element */}
      {state.highlightTarget ? (
        <HighlightRing target={state.highlightTarget} />
      ) : null}

      {/* Pulse overlay */}
      {state.pulseTarget ? (
        <PulseOverlay target={state.pulseTarget} />
      ) : null}

      {/* Spotlight overlay */}
      {state.spotlightTarget ? (
        <SpotlightOverlay target={state.spotlightTarget} />
      ) : null}

      {/* Screen reader live region — announces cursor actions and mode changes */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state.label
          ? `Cursor ${state.mode}: ${state.label}${progressText ? ` (${progressText})` : ""}`
          : state.mode === "idle" ? "" : `Cursor is ${state.mode}`}
      </div>

      {/* The cursor itself — fixed overlay */}
      <div
        role="img"
        aria-hidden="true"
        className={cn(
          "fixed z-[9999] pointer-events-none",
          "transition-all ease-out",
          state.mode === "moving" ? "duration-300" : "duration-150",
        )}
        style={{
          left: state.position.x,
          top: state.position.y,
          transform: "translate(-4px, -2px)", // offset so tip of cursor aligns with position
        }}
      >
        {/* Cursor icon */}
        <div
          className={cn(
            "relative",
            state.mode === "clicking" && "scale-90 transition-transform duration-150",
          )}
        >
          <CursorIcon mode={state.mode} />

          {/* Click ripple */}
          {state.mode === "clicking" ? (
            <div className="absolute inset-0 -m-2 rounded-full bg-primary/20 animate-ping" />
          ) : null}
        </div>

        {/* Label tooltip — repositioned based on viewport proximity */}
        {state.label ? (
          <div
            className={cn(
              "absolute whitespace-nowrap",
              "bg-popover/95 backdrop-blur-sm border border-border",
              "rounded-md px-2.5 py-1 shadow-lg",
              "text-xs font-medium text-popover-foreground",
              "transition-all duration-200",
              "max-w-xs truncate",
              // Default: below-right of cursor
              !nearRight && !nearBottom && "top-7 left-2",
              // Near right edge: below-left of cursor
              nearRight && !nearBottom && "top-7 right-2",
              // Near bottom: above-right of cursor
              !nearRight && nearBottom && "bottom-7 left-2",
              // Near both edges: above-left
              nearRight && nearBottom && "bottom-7 right-2",
            )}
          >
            <div className="flex items-center gap-1.5">
              <Bot className="h-3 w-3 text-primary flex-shrink-0" />
              <span className="truncate">{state.label}</span>
              {progressText ? (
                <span className="text-muted-foreground/70 ml-1 flex-shrink-0">
                  {progressText}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Cancel button — fixed bottom-right, pointer-events enabled */}
      <div className="fixed bottom-6 right-6 z-[10000]">
        <Button
          variant="outline"
          size="sm"
          onClick={cancel}
          className="pointer-events-auto shadow-lg bg-background/90 backdrop-blur-sm gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          Cancel AI
          <kbd className="ml-1 text-[10px] text-muted-foreground/60 border rounded px-1">Esc</kbd>
        </Button>
      </div>

      {/* Secret input dialog */}
      {state.secretDialog ? (
        <SecretDialog
          label={state.secretDialog.label}
          hint={state.secretDialog.hint}
          secretId={state.secretDialog.secretId}
          onSubmit={submitSecret}
          onDismiss={dismissSecret}
        />
      ) : null}
    </>
  );
}
