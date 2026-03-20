/**
 * AI Visual Cursor — React Context Provider
 *
 * Manages the cursor state machine and action queue.
 * Every UI action from the backend goes through this provider,
 * which executes them one-by-one with smooth animations.
 *
 * Mount this at the dashboard layout level so the cursor
 * can navigate across all pages.
 *
 * @module components/cursor/cursor-provider
 */

"use client";

import { usePathname, useRouter } from "next/navigation";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

import type {
    Choreography,
    CursorContextValue,
    CursorPosition,
    CursorState,
    UIAction,
} from "./cursor.types";

// ===========================================
// Constants
// ===========================================

/** Delay between actions (ms) — controls the visual pacing */
const ACTION_GAP_MS = 150;

/** Time for cursor to animate between positions */
const MOVE_DURATION_MS = 250;

/**
 * Compute movement duration based on pixel distance.
 * Short jumps are snappy; long jumps take more time to look natural.
 */
function moveDuration(from: CursorPosition, to: CursorPosition): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 200) return 150;   // short jump — snappy
  if (dist > 600) return 400;   // long jump — give more time
  return MOVE_DURATION_MS;      // medium — default
}

/** How long the click animation plays */
const CLICK_DURATION_MS = 150;

/** Per-character typing speed (ms) */
const TYPING_SPEED_MS = 20;

/** Time to show success state before resetting */
const DONE_DISPLAY_MS = 1500;

/** Minimum time a gated highlight stays visible (ms) — prevents flash */
const GATE_MIN_VISIBLE_MS = 300;

/** Maximum time a gated highlight waits before auto-releasing (ms) */
const GATE_MAX_WAIT_MS = 30_000;

/** Max queued actions before collapsing (skip stale intermediate actions) */
const QUEUE_COLLAPSE_THRESHOLD = 4;

// ===========================================
// Default State
// ===========================================

const DEFAULT_STATE: CursorState = {
  active: false,
  mode: "idle",
  position: { x: -100, y: -100 },
  label: "",
  highlightTarget: null,
  pulseTarget: null,
  spotlightTarget: null,
  queue: [],
  currentAction: null,
  secretDialog: null,
  stepIndex: 0,
  totalSteps: 0,
};

/** Get an initial cursor position near the FAB (bottom-right area) */
function getInitialPosition(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: -100, y: -100 };
  return {
    x: window.innerWidth - 60,
    y: window.innerHeight - 120,
  };
}

// ===========================================
// Context
// ===========================================

const CursorContext = createContext<CursorContextValue | null>(null);

export function useCursor(): CursorContextValue {
  const ctx = useContext(CursorContext);
  if (!ctx) {
    throw new Error("useCursor must be used within <CursorProvider>");
  }
  return ctx;
}

/**
 * Optional hook — returns null when outside provider.
 * Useful for components that may or may not be inside the dashboard.
 */
export function useCursorOptional(): CursorContextValue | null {
  return useContext(CursorContext);
}

// ===========================================
// Provider Component
// ===========================================

export function CursorProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<CursorState>(DEFAULT_STATE);
  const processingRef = useRef(false);
  const cancelledRef = useRef(false);
  /** Tracks current cursor position for distance-based movement speed */
  const positionRef = useRef<CursorPosition>({ x: -100, y: -100 });
  /** Tracks current route to skip redundant navigations */
  const currentPathRef = useRef(pathname);
  // Keep ref in sync with pathname
  useEffect(() => { currentPathRef.current = pathname; }, [pathname]);
  /** Set synchronously in enqueue/runChoreography to prevent waitForIdle resolving too early */
  const queuedRef = useRef(false);
  const secretResolverRef = useRef<Map<string, (value: string | null) => void>>(new Map());
  const idleCallbacksRef = useRef<Array<() => void>>([]);

  // =============================================
  // Event Gate — synchronizes animations with backend
  // =============================================

  /**
   * Pending gate releases: incremented by releaseGate(), decremented by
   * gated highlight actions. When > 0, a gated highlight skips its wait
   * because the backend already finished before the animation reached it.
   */
  const pendingReleasesRef = useRef(0);

  /**
   * The resolver for the currently-waiting gated highlight.
   * Set when a gated highlight starts waiting, cleared when resolved.
   */
  const gateResolverRef = useRef<(() => void) | null>(null);

  /**
   * Release the event gate. Called by cursor-panel when tool_result arrives.
   * If a gated highlight is currently waiting, resolve it immediately.
   * If no gate is active, bank the release so the next gated action skips.
   */
  const releaseGate = useCallback(() => {
    if (gateResolverRef.current) {
      // A gated highlight is currently waiting — release it now
      gateResolverRef.current();
      gateResolverRef.current = null;
    } else {
      // No gate active — bank it for the next gated action
      pendingReleasesRef.current++;
    }
  }, []);

  /**
   * Wait for a gate release (or timeout). Used inside gated highlight actions.
   * Returns immediately if there are banked releases.
   */
  const waitForGate = useCallback(async (maxWaitMs: number): Promise<void> => {
    // Check for banked releases first
    if (pendingReleasesRef.current > 0) {
      pendingReleasesRef.current--;
      return;
    }

    // Wait for releaseGate() or timeout
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        gateResolverRef.current = null;
        resolve();
      }, maxWaitMs);

      gateResolverRef.current = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }, []);

  // =============================================
  // Queue Management
  // =============================================

  const enqueue = useCallback((action: UIAction) => {
    queuedRef.current = true; // Signal work pending BEFORE async setState
    setState((prev) => ({
      ...prev,
      active: true,
      position: prev.active ? prev.position : getInitialPosition(),
      queue: [...prev.queue, action],
    }));
  }, []);

  const runChoreography = useCallback((choreography: Choreography) => {
    queuedRef.current = true; // Signal work pending BEFORE async setState
    setState((prev) => ({
      ...prev,
      active: true,
      position: prev.active ? prev.position : getInitialPosition(),
      queue: [...prev.queue, ...choreography.steps],
      stepIndex: 0,
      totalSteps: choreography.steps.length,
    }));
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // Release any active gate
    if (gateResolverRef.current) {
      gateResolverRef.current();
      gateResolverRef.current = null;
    }
    pendingReleasesRef.current = 0;
    secretResolverRef.current.forEach((resolve) => resolve(null));
    secretResolverRef.current.clear();
    idleCallbacksRef.current = [];
    setState(DEFAULT_STATE);
  }, []);

  const submitSecret = useCallback((secretId: string, value: string) => {
    const resolver = secretResolverRef.current.get(secretId);
    if (resolver) {
      resolver(value);
      secretResolverRef.current.delete(secretId);
    }
    setState((prev) => ({
      ...prev,
      secretDialog: null,
    }));
  }, []);

  const dismissSecret = useCallback((secretId: string) => {
    const resolver = secretResolverRef.current.get(secretId);
    if (resolver) {
      resolver(null);
      secretResolverRef.current.delete(secretId);
    }
    setState((prev) => ({
      ...prev,
      secretDialog: null,
    }));
  }, []);

  // =============================================
  // Element Resolution
  // =============================================

  /**
   * Find a DOM element by its data-ai-target attribute.
   * Returns the element's center position for cursor targeting.
   */
  const resolveTarget = useCallback(
    (target: string): { element: Element; center: CursorPosition } | null => {
      // Use querySelectorAll — the sidebar is rendered twice (mobile + desktop).
      // The mobile sidebar is `lg:hidden` (display:none on desktop) which makes
      // getBoundingClientRect() return (0,0,0,0). Pick the first *visible* match.
      const candidates = document.querySelectorAll(`[data-ai-target="${target}"]`);
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue; // hidden element
        return {
          element: el,
          center: {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          },
        };
      }
      return null;
    },
    [],
  );

  /**
   * Wait for a target element to appear in the DOM (after navigation).
   * Polls every 50ms for up to 1.5 seconds.
   */
  const waitForTarget = useCallback(
    async (target: string, maxWaitMs = 1500): Promise<ReturnType<typeof resolveTarget>> => {
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        const result = resolveTarget(target);
        if (result) return result;
        await sleep(50);
      }
      return null;
    },
    [resolveTarget],
  );

  // =============================================
  // Action Executors
  // =============================================

  const executeAction = useCallback(
    async (action: UIAction): Promise<void> => {
      if (cancelledRef.current) return;

      /** Move wait: compute distance-based sleep, update positionRef */
      const moveWait = (target: CursorPosition) => {
        const dur = moveDuration(positionRef.current, target);
        positionRef.current = target;
        return sleep(dur);
      };

      setState((prev) => ({
        ...prev,
        currentAction: action,
      }));

      switch (action.action) {
        // --- Navigate to a page ---
        case "navigate": {
          // Skip navigation if already on the target page
          const targetSegment = action.path.split("/").filter(Boolean)[0] || "";
          const currentSegment = (currentPathRef.current || "").split("/").filter(Boolean).pop() || "";
          const alreadyOnPage = currentSegment === targetSegment
            || (currentPathRef.current || "").endsWith(action.path);

          if (alreadyOnPage) {
            // Already on this page — just show label, no cursor movement or navigation
            setState((prev) => ({
              ...prev,
              mode: "thinking",
              label: action.label,
            }));
            await sleep(100);
            break;
          }

          setState((prev) => ({
            ...prev,
            mode: "moving",
            label: "",
            highlightTarget: null,
          }));

          // Find the sidebar nav item for this route.
          // First try exact match, then fuzzy suffix match (handles org context
          // where /gateways → /organizations/{slug}/gateways).
          const navSuffix = action.path.replace(/\//g, "-").replace(/^-/, "") || "dashboard";
          let navTargetId = `nav-${navSuffix}`;
          let navTarget = resolveTarget(navTargetId);

          if (!navTarget) {
            // Fuzzy: find any [data-ai-target] that ends with the route suffix.
            // Use querySelectorAll and pick the first visible element (skip hidden mobile sidebar).
            const candidates = document.querySelectorAll<Element>(
              `[data-ai-target$="-${navSuffix}"], [data-ai-target="${navTargetId}"]`
            );
            for (const el of candidates) {
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) continue; // hidden
              navTargetId = el.getAttribute("data-ai-target") || navTargetId;
              navTarget = {
                element: el,
                center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
              };
              break;
            }
          }

          if (navTarget) {
            // Move cursor to the sidebar nav item first
            const navCenter = navTarget.center;
            setState((prev) => ({
              ...prev,
              position: navCenter,
              highlightTarget: navTargetId,
            }));
            await moveWait(navCenter);

            // Show label once cursor has arrived at the nav item
            setState((prev) => ({
              ...prev,
              label: action.label,
              mode: "clicking",
            }));
            await sleep(CLICK_DURATION_MS);

            // Clear highlight after click
            setState((prev) => ({ ...prev, highlightTarget: null }));
          } else {
            // No sidebar target found — just show label and navigate
            setState((prev) => ({
              ...prev,
              label: action.label,
            }));
          }

          // Actually navigate — prefer the sidebar link's href (handles org context)
          // over the choreography's hardcoded path.
          const resolvedPath =
            navTarget?.element instanceof HTMLAnchorElement
              ? new URL(navTarget.element.href).pathname
              : action.path;
          router.push(resolvedPath);
          // Wait for route to actually render — poll for page content
          // instead of hardcoded sleep to handle slow/fast transitions.
          {
            const navStart = Date.now();
            const maxWait = 2000;
            const minWait = 150;
            while (Date.now() - navStart < maxWait) {
              await sleep(80);
              const elapsed = Date.now() - navStart;
              if (elapsed >= minWait) {
                const pageTarget = document.querySelector(
                  '[data-ai-target$="-overview"], [data-ai-target$="-panel"]'
                );
                if (pageTarget) break;
              }
            }
          }
          break;
        }

        // --- Highlight an element ---
        case "highlight": {
          const found = await waitForTarget(action.target);
          if (found) {
            setState((prev) => ({
              ...prev,
              mode: "pointing",
              position: found.center,
              label: action.label,
              highlightTarget: action.target,
            }));
            await moveWait(found.center);

            if (action.gated) {
              // Event-gated: hold highlight until releaseGate() or timeout.
              // Enforce a minimum visible time so the highlight doesn't flash.
              const gateStart = Date.now();
              await waitForGate(action.durationMs || GATE_MAX_WAIT_MS);
              const elapsed = Date.now() - gateStart;
              if (elapsed < GATE_MIN_VISIBLE_MS) {
                await sleep(GATE_MIN_VISIBLE_MS - elapsed);
              }
            } else if (action.durationMs && action.durationMs > 0) {
              await sleep(action.durationMs);
            }

            setState((prev) => ({
              ...prev,
              highlightTarget: null,
            }));
          } else {
            // Element not found — show thinking state
            setState((prev) => ({
              ...prev,
              mode: "thinking",
              label: `Looking for: ${action.label}`,
            }));
            // If gated, still wait for the gate (backend is doing work)
            if (action.gated) {
              await waitForGate(action.durationMs || GATE_MAX_WAIT_MS);
            } else {
              await sleep(800);
            }
          }
          break;
        }

        // --- Click an element ---
        case "click": {
          const found = await waitForTarget(action.target);
          if (found) {
            // Move to element
            setState((prev) => ({
              ...prev,
              mode: "moving",
              position: found.center,
              label: action.label,
              highlightTarget: action.target,
            }));
            await moveWait(found.center);

            // Click animation
            setState((prev) => ({ ...prev, mode: "clicking" }));
            await sleep(CLICK_DURATION_MS);

            // Trigger actual click on the element
            if (found.element instanceof HTMLElement) {
              found.element.click();
            }
            await sleep(200);

            setState((prev) => ({
              ...prev,
              mode: "pointing",
              highlightTarget: null,
            }));
          } else {
            // Element not found — show brief thinking state and continue
            setState((prev) => ({
              ...prev,
              mode: "thinking",
              label: action.label,
            }));
            await sleep(600);
          }
          break;
        }

        // --- Fill a form field ---
        case "fill": {
          const found = await waitForTarget(action.target);
          if (found) {
            // Move to field
            setState((prev) => ({
              ...prev,
              mode: "moving",
              position: found.center,
              label: action.label,
              highlightTarget: action.target,
            }));
            await moveWait(found.center);

            // Typing animation
            setState((prev) => ({ ...prev, mode: "typing" }));

            // Set value on the input element
            const el = found.element instanceof HTMLElement ? found.element : null;
            const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
            const isEditable = el?.getAttribute("contenteditable") === "true";

            if (isInput || isEditable) {
              // Focus the field
              (el as HTMLElement).focus();

              // Type character by character (visual only — we set the full value at the end)
              const displayValue = action.sensitive ? "•".repeat(Math.min(action.value.length, 20)) : action.value;
              const typingDuration = Math.min(displayValue.length * TYPING_SPEED_MS, 1500);
              await sleep(typingDuration);

              if (isInput) {
                // Set the actual value via React-compatible input setter
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  "value",
                )?.set || Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  "value",
                )?.set;

                if (nativeInputValueSetter) {
                  nativeInputValueSetter.call(el, action.value);
                  (el as HTMLElement).dispatchEvent(new Event("input", { bubbles: true }));
                  (el as HTMLElement).dispatchEvent(new Event("change", { bubbles: true }));
                }
              } else if (isEditable) {
                // contenteditable elements (e.g. code editors)
                (el as HTMLElement).textContent = action.value;
                (el as HTMLElement).dispatchEvent(new Event("input", { bubbles: true }));
              }
            } else if (el) {
              // Fallback: try to find the first input/textarea inside the target
              const child = el.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
              if (child) {
                child.focus();
                const displayValue = action.sensitive ? "•".repeat(Math.min(action.value.length, 20)) : action.value;
                const typingDuration = Math.min(displayValue.length * TYPING_SPEED_MS, 1500);
                await sleep(typingDuration);
                const setter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype, "value"
                )?.set || Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype, "value"
                )?.set;
                if (setter) {
                  setter.call(child, action.value);
                  child.dispatchEvent(new Event("input", { bubbles: true }));
                  child.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
            }

            setState((prev) => ({
              ...prev,
              mode: "pointing",
              highlightTarget: null,
            }));
          } else {
            // Element not found — show brief thinking state and continue
            setState((prev) => ({
              ...prev,
              mode: "thinking",
              label: action.label,
            }));
            await sleep(600);
          }
          break;
        }

        // --- Scroll to element ---
        case "scroll": {
          setState((prev) => ({
            ...prev,
            mode: "moving",
            label: action.label,
          }));

          const found = await waitForTarget(action.target);
          if (found) {
            found.element.scrollIntoView({ behavior: "smooth", block: "center" });
            await sleep(500);
            setState((prev) => ({
              ...prev,
              position: found.center,
              mode: "pointing",
            }));
          }
          break;
        }

        // --- Wait / Think ---
        case "wait": {
          setState((prev) => ({
            ...prev,
            mode: "thinking",
            label: action.label,
          }));
          await sleep(action.durationMs);
          break;
        }

        // --- Toast ---
        case "toast": {
          // Show toast label — short display, don't block queue for long
          setState((prev) => ({
            ...prev,
            mode: action.variant === "success" ? "success" : action.variant === "error" ? "error" : "pointing",
            label: action.message,
          }));
          // Fire-and-forget: just yield one frame so React paints the label,
          // then move on. The label will be overwritten by the next action anyway.
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
          break;
        }

        // --- Secret request ---
        case "secret_request": {
          setState((prev) => ({
            ...prev,
            mode: "thinking",
            label: `Waiting for: ${action.label}`,
            secretDialog: action,
          }));

          // Wait for user to submit or dismiss
          await new Promise<string | null>((resolve) => {
            secretResolverRef.current.set(action.secretId, resolve);
          });
          break;
        }

        // --- Done ---
        case "done": {
          setState((prev) => ({
            ...prev,
            mode: action.success ? "success" : "error",
            label: action.label,
            highlightTarget: null,
            pulseTarget: null,
            spotlightTarget: null,
          }));
          await sleep(DONE_DISPLAY_MS);
          break;
        }

        // --- Pulse (page-level glow, works without data-ai-target) ---
        case "pulse": {
          const pulseId = action.target || "__page__";
          // Pulse is a glow effect — no cursor movement needed.
          // Just resolve to check existence, don't animate cursor to it.
          if (action.target) {
            const found = resolveTarget(action.target);
            setState((prev) => ({
              ...prev,
              mode: "thinking",
              label: action.label,
              pulseTarget: found ? pulseId : "__page__",
            }));
          } else {
            setState((prev) => ({
              ...prev,
              mode: "thinking",
              label: action.label,
              pulseTarget: "__page__",
            }));
          }

          if (action.gated) {
            const gateStart = Date.now();
            await waitForGate(action.durationMs || GATE_MAX_WAIT_MS);
            const elapsed = Date.now() - gateStart;
            if (elapsed < GATE_MIN_VISIBLE_MS) {
              await sleep(GATE_MIN_VISIBLE_MS - elapsed);
            }
          } else {
            await sleep(action.durationMs || 1500);
          }

          setState((prev) => ({ ...prev, pulseTarget: null }));
          break;
        }

        // --- Spotlight (dim everything except target area) ---
        case "spotlight": {
          const spotId = action.target || "__page__";
          if (action.target) {
            const found = await waitForTarget(action.target);
            if (found) {
              setState((prev) => ({
                ...prev,
                mode: "pointing",
                position: found.center,
                label: action.label,
                spotlightTarget: spotId,
              }));
              await moveWait(found.center);
            } else {
              setState((prev) => ({
                ...prev,
                mode: "thinking",
                label: action.label,
                spotlightTarget: "__page__",
              }));
            }
          } else {
            setState((prev) => ({
              ...prev,
              mode: "thinking",
              label: action.label,
              spotlightTarget: "__page__",
            }));
          }
          await sleep(action.durationMs || 2000);
          setState((prev) => ({ ...prev, spotlightTarget: null }));
          break;
        }
      }
    },
    [router, resolveTarget, waitForTarget, waitForGate],
  );

  // =============================================
  // Queue Processor — runs actions one by one
  // =============================================

  useEffect(() => {
    if (!state.active || state.queue.length === 0 || processingRef.current) {
      return;
    }

    processingRef.current = true;
    cancelledRef.current = false;

    const processQueue = async () => {
      queuedRef.current = false; // Processing has started — clear the queued flag

      // Minimal frame yield — let the cursor render at its initial position (bottom-right)
      // before the first action moves it.  One rAF + microtask is enough;
      // the CSS transition on the element handles the smooth entrance.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

      let stepCounter = 0;
      try {
        while (true) {
          // Get next action from queue via Promise to avoid stale closure
          const nextAction = await new Promise<UIAction | undefined>((resolve) => {
            setState((prev) => {
              if (prev.queue.length === 0) {
                resolve(undefined);
                return prev;
              }

              // Queue collapse: if too many actions are queued, the backend
              // is outpacing the UI. Keep only the last few actions to stay
              // current. Preserve navigate + the latest highlight/toast.
              let queue = prev.queue;
              if (queue.length > QUEUE_COLLAPSE_THRESHOLD) {
                // Find the last navigate and keep everything from it onward
                let lastNavIdx = -1;
                for (let i = queue.length - 1; i >= 0; i--) {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  if (queue[i]!.action === "navigate") { lastNavIdx = i; break; }
                }
                queue = lastNavIdx >= 0
                  ? queue.slice(lastNavIdx)
                  : queue.slice(-3); // Keep last 3 as fallback
              }

              const [first, ...rest] = queue;
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              resolve(first!);
              return { ...prev, queue: rest };
            });
          });

          if (!nextAction || cancelledRef.current) break;

          // Track progress (increment stepIndex)
          stepCounter++;
          setState((prev) => ({ ...prev, stepIndex: stepCounter }));

          try {
            await executeAction(nextAction);
          } catch (actionErr) {
            // Single action failed — show error but continue queue
            console.error("[Cursor] Action failed:", actionErr);
            setState((prev) => ({
              ...prev,
              mode: "error",
              label: `Error: ${actionErr instanceof Error ? actionErr.message : "Action failed"}`,
            }));
            await sleep(1500);
          }

          if (cancelledRef.current) break;

          // Gap between actions
          await sleep(ACTION_GAP_MS);
        }
      } catch (err) {
        console.error("[Cursor] Queue processor error:", err);
      } finally {
        // All done — reset to idle
        if (!cancelledRef.current) {
          setState((prev) => ({
            ...prev,
            active: false,
            mode: "idle",
            currentAction: null,
            highlightTarget: null,
            stepIndex: 0,
            totalSteps: 0,
          }));
        }

        processingRef.current = false;

        // Notify any waiters that the cursor is now idle
        const callbacks = [...idleCallbacksRef.current];
        idleCallbacksRef.current = [];
        callbacks.forEach((cb) => cb());
      }
    };

    processQueue();
  }, [state.active, state.queue.length, executeAction]);

  // =============================================
  // Cleanup secret resolvers on unmount
  // =============================================

  useEffect(() => {
    const resolvers = secretResolverRef.current;
    const callbacks = idleCallbacksRef;
    return () => {
      resolvers.forEach((resolve) => resolve(null));
      resolvers.clear();
      callbacks.current = [];
    };
  }, []);

  // =============================================
  // Render
  // =============================================

  /** Returns a Promise that resolves when the cursor becomes idle */
  const waitForIdle = useCallback((): Promise<void> => {
    // Only resolve immediately if BOTH not processing AND nothing was queued
    // (queuedRef prevents the race where runChoreography sets state async
    //  but the queue processor useEffect hasn't fired yet)
    if (!processingRef.current && !queuedRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      idleCallbacksRef.current.push(resolve);
    });
  }, []);

  const contextValue: CursorContextValue = {
    state,
    enqueue,
    runChoreography,
    cancel,
    waitForIdle,
    submitSecret,
    dismissSecret,
    releaseGate,
  };

  return (
    <CursorContext.Provider value={contextValue}>
      {children}
    </CursorContext.Provider>
  );
}

// ===========================================
// Utility
// ===========================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
