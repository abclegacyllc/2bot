/**
 * AI Visual Cursor — Type Definitions
 *
 * Types for the visual AI agent that navigates the dashboard UI,
 * showing the user step-by-step what the agent is doing.
 *
 * The Cursor is a floating overlay element that:
 *   1. Navigates between pages (sidebar clicks)
 *   2. Highlights UI elements (buttons, forms, cards)
 *   3. Shows "typing" into fields
 *   4. Clicks buttons with visual feedback
 *   5. Scrolls to reveal elements
 *   6. Displays status toasts for each step
 *
 * Architecture:
 *   Backend agent → SSE ui_action events → CursorProvider → Cursor component
 *
 * @module components/cursor/cursor.types
 */

// ===========================================
// UI Action Events (Backend → Frontend)
// ===========================================

/**
 * Union of all UI action events the backend can emit.
 * Sent as SSE events with type: "ui_action".
 */
export type UIAction =
  | UINavigateAction
  | UIHighlightAction
  | UIClickAction
  | UIFillAction
  | UIScrollAction
  | UIWaitAction
  | UIToastAction
  | UISecretRequestAction
  | UIPulseAction
  | UISpotlightAction
  | UIDoneAction;

/** Navigate to a dashboard page */
export interface UINavigateAction {
  action: "navigate";
  /** Dashboard route path (e.g. "/plugins", "/gateways/create") */
  path: string;
  /** Human-readable description of why we're navigating */
  label: string;
}

/** Highlight a UI element (glow ring + tooltip) */
export interface UIHighlightAction {
  action: "highlight";
  /** data-ai-target attribute value on the target element */
  target: string;
  /** Tooltip text shown next to the highlight */
  label: string;
  /** How long to hold the highlight (ms). 0 = until next action */
  durationMs?: number;
  /**
   * When true, the highlight holds open until `releaseGate()` is called
   * instead of using a fixed durationMs timer. The durationMs becomes a
   * maximum timeout (fallback) to prevent infinite hangs.
   *
   * Used for event-gated animation — backend tool_result releases the gate
   * so animations stay perfectly in sync with actual backend work.
   */
  gated?: boolean;
}

/** Simulate clicking a UI element */
export interface UIClickAction {
  action: "click";
  /** data-ai-target attribute value on the target element */
  target: string;
  /** Description of what clicking does */
  label: string;
}

/** Simulate typing into a form field */
export interface UIFillAction {
  action: "fill";
  /** data-ai-target attribute value on the target input/textarea */
  target: string;
  /** The value to "type" into the field */
  value: string;
  /** Field label for display */
  label: string;
  /** If true, show dots instead of actual value (for sensitive fields) */
  sensitive?: boolean;
}

/** Scroll to bring an element into view */
export interface UIScrollAction {
  action: "scroll";
  /** data-ai-target attribute value on the element to scroll to */
  target: string;
  /** Description */
  label: string;
}

/** Pause the visual sequence (thinking/waiting) */
export interface UIWaitAction {
  action: "wait";
  /** Duration in ms */
  durationMs: number;
  /** What the agent is waiting for */
  label: string;
}

/** Show a toast / status message */
export interface UIToastAction {
  action: "toast";
  /** Toast message */
  message: string;
  /** Severity */
  variant: "info" | "success" | "warning" | "error";
  /** Auto-dismiss after ms (0 = manual) */
  durationMs?: number;
}

/** Request a secret from the user via secure input */
export interface UISecretRequestAction {
  action: "secret_request";
  /** Unique ID for this secret request */
  secretId: string;
  /** Display label (e.g. "Telegram Bot Token") */
  label: string;
  /** Help text */
  hint?: string;
  /** Which field this maps to in the backend operation */
  field: string;
}

/**
 * Pulse — generic page-level glow that works without data-ai-target.
 * Optionally targets a specific element for precision.
 */
export interface UIPulseAction {
  action: "pulse";
  /** Tooltip text */
  label: string;
  /** Optional data-ai-target — falls back to page content area */
  target?: string;
  /** Pulse duration (ms). Default 1500 */
  durationMs?: number;
  /** Gated — hold until releaseGate() like highlight */
  gated?: boolean;
}

/**
 * Spotlight — dims everything except the targeted area.
 * Works without data-ai-target by targeting the page content zone.
 */
export interface UISpotlightAction {
  action: "spotlight";
  /** Tooltip text */
  label: string;
  /** Optional data-ai-target — falls back to main content area */
  target?: string;
  /** How long to hold (ms) */
  durationMs?: number;
}

/** Visual sequence completed */
export interface UIDoneAction {
  action: "done";
  /** Summary message */
  label: string;
  /** Whether the overall operation succeeded */
  success: boolean;
}

// ===========================================
// Cursor State
// ===========================================

export type CursorMode =
  | "idle"        // Not active — hidden
  | "moving"      // Animating between positions
  | "pointing"    // Hovering over a target
  | "clicking"    // Click animation
  | "typing"      // Simulating text input
  | "thinking"    // Processing / waiting
  | "success"     // Green check — done
  | "error";      // Red X — failed

export interface CursorPosition {
  x: number;
  y: number;
}

export interface CursorState {
  /** Whether the Cursor is currently active */
  active: boolean;
  /** Current visual mode */
  mode: CursorMode;
  /** Current screen position (absolute px) */
  position: CursorPosition;
  /** Current tooltip/label text */
  label: string;
  /** Currently highlighted element's ID */
  highlightTarget: string | null;
  /** Currently pulsing element (or "page" for page-level pulse) */
  pulseTarget: string | null;
  /** Currently spotlighted element (or "page" for page-level spotlight) */
  spotlightTarget: string | null;
  /** Action queue (pending actions from SSE) */
  queue: UIAction[];
  /** Currently executing action */
  currentAction: UIAction | null;
  /** Whether a secret input dialog is open */
  secretDialog: UISecretRequestAction | null;
  /** Progress: current step index (1-based, 0 = not tracking) */
  stepIndex: number;
  /** Progress: total steps in current choreography */
  totalSteps: number;
}

// ===========================================
// Choreography — Predefined UI Sequences
// ===========================================

/**
 * A choreography defines the full UI action sequence for a platform operation.
 * The backend agent calls a platform tool → the tool emits a choreography
 * as a sequence of UIAction events.
 *
 * Example: "create_plugin" choreography:
 *   1. navigate → /plugins
 *   2. highlight → create-plugin-btn
 *   3. click → create-plugin-btn
 *   4. navigate → /plugins/create
 *   5. fill → plugin-name-input (with the name)
 *   6. fill → plugin-code-editor (with the code)
 *   7. click → save-plugin-btn
 *   8. toast → "Plugin created successfully!"
 *   9. done
 */
export interface Choreography {
  /** Unique choreography ID (matches the platform tool name) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Ordered list of UI actions */
  steps: UIAction[];
}

// ===========================================
// Provider Context API
// ===========================================

export interface CursorContextValue {
  /** Current cursor state */
  state: CursorState;
  /** Enqueue a single UI action */
  enqueue: (action: UIAction) => void;
  /** Enqueue a full choreography */
  runChoreography: (choreography: Choreography) => void;
  /** Cancel current sequence and reset */
  cancel: () => void;
  /** Returns a Promise that resolves when the cursor queue finishes */
  waitForIdle: () => Promise<void>;
  /** Respond to a secret request */
  submitSecret: (secretId: string, value: string) => void;
  /** Dismiss the secret dialog */
  dismissSecret: (secretId: string) => void;
  /**
   * Release the current event gate.
   *
   * Call this when a backend tool_result arrives to unblock the gated
   * highlight animation. If no gate is active, the release is banked
   * so the next gated action skips its wait immediately.
   */
  releaseGate: () => void;
}
