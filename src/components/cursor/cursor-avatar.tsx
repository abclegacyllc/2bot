/**
 * Cursor Avatar — Multi-Character Animated AI Avatar
 *
 * Renders different SVG characters based on the active theme's avatar type.
 * Each character has expression states (idle, thinking, happy, error, celebrating)
 * with unique visual treatments.
 *
 * Characters:
 *   - ghost  — friendly ghost with zig-zag bottom edge (default)
 *   - orb    — glowing energy sphere with pulsing rings (neon theme)
 *   - robot  — boxy robot head with LED eyes and antenna
 *
 * The avatar respects theme effect toggles (float, shake, etc.)
 * and adapts its color from the `--cursor-primary` CSS variable.
 *
 * @module components/cursor/cursor-avatar
 */

"use client";

import { cn } from "@/lib/utils";

import type { CursorAvatarType, CursorThemeEffects } from "./cursor-theme";

// ===========================================
// Types
// ===========================================

export type CursorExpression = "idle" | "thinking" | "happy" | "error" | "celebrating";

interface CursorAvatarProps {
  expression?: CursorExpression;
  size?: "sm" | "md" | "lg";
  /** Which avatar character to render */
  avatarType?: CursorAvatarType;
  /** Theme effect toggles — controls animations */
  effects?: CursorThemeEffects;
  /** Disable floating animation (for inline/static usage) */
  noFloat?: boolean;
  className?: string;
}

// ===========================================
// Size Presets
// ===========================================

const SIZES = {
  sm: "w-7 h-8",
  md: "w-9 h-10",
  lg: "w-14 h-16",
} as const;

// ===========================================
// Keyframe Injection (once per mount)
// ===========================================

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.id = "cursor-avatar-keyframes";
  style.textContent = `
    @keyframes cursor-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    @keyframes cursor-think {
      0%, 100% { transform: translateY(0) rotate(-2deg); opacity: 0.75; }
      50% { transform: translateY(-3px) rotate(2deg); opacity: 1; }
    }
    @keyframes cursor-celebrate {
      0%, 100% { transform: translateY(0) scale(1); }
      25% { transform: translateY(-8px) scale(1.1); }
      50% { transform: translateY(-4px) scale(1.05); }
    }
    @keyframes cursor-shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-3px); }
      40% { transform: translateX(3px); }
      60% { transform: translateX(-2px); }
      80% { transform: translateX(2px); }
    }
    @keyframes cursor-typing-dot {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-2px); }
    }
    @keyframes cursor-message-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes cursor-orb-pulse {
      0%, 100% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.15); opacity: 0.25; }
    }
    @keyframes cursor-orb-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes cursor-robot-blink {
      0%, 90%, 100% { opacity: 1; }
      95% { opacity: 0.1; }
    }
    @keyframes cursor-robot-antenna {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ===========================================
// Default effects (all enabled)
// ===========================================

const DEFAULT_EFFECTS: CursorThemeEffects = {
  floatAnimation: true,
  glowPulse: true,
  messageSlideIn: true,
  typingDots: true,
  errorShake: true,
};

// ===========================================
// Animation resolver — respects effects config
// ===========================================

function getAnimationStyle(
  expression: CursorExpression,
  noFloat: boolean,
  effects: CursorThemeEffects,
): React.CSSProperties | undefined {
  if (noFloat) return undefined;

  if (expression === "thinking" && effects.floatAnimation) {
    return { animation: "cursor-think 2s ease-in-out infinite" };
  }
  if (expression === "error" && effects.errorShake) {
    return { animation: "cursor-shake 0.5s ease-in-out" };
  }
  if (expression === "celebrating" && effects.floatAnimation) {
    return { animation: "cursor-celebrate 0.8s ease-in-out" };
  }
  if (effects.floatAnimation) {
    return { animation: "cursor-float 3s ease-in-out infinite" };
  }
  return undefined;
}

// ===========================================
// Ghost Avatar (default)
// ===========================================

function GhostAvatar({ expression }: { expression: CursorExpression }) {
  return (
    <svg
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full drop-shadow-sm"
    >
      {/* Ghost body — rounded dome top, zig-zag bottom edge */}
      <path
        d="M4 16C4 8.268 9.268 3 16 3C22.732 3 28 8.268 28 16V33L24.5 29L21 33L17.5 29L14 33L10.5 29L7 33L4 33V16Z"
        className="fill-[var(--cursor-primary,#10b981)]"
        opacity={expression === "thinking" ? 0.8 : 1}
      />

      {/* Eyes — change shape based on expression */}
      {expression === "happy" || expression === "celebrating" ? (
        <>
          <path d="M10 17C10 19 11.5 20.5 13 20.5C14.5 20.5 16 19 16 17" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M16 17C16 19 17.5 20.5 19 20.5C20.5 20.5 22 19 22 17" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </>
      ) : expression === "error" ? (
        <>
          <path d="M10.5 15.5L14.5 19.5M14.5 15.5L10.5 19.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17.5 15.5L21.5 19.5M21.5 15.5L17.5 19.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="12" cy="17" rx="2" ry="2.5" fill="white" opacity="0.95" />
          <ellipse cx="20" cy="17" rx="2" ry="2.5" fill="white" opacity="0.95" />
          <circle cx="12" cy={expression === "thinking" ? 15.5 : 17.5} r="1" fill="#1a1a2e" />
          <circle cx="20" cy={expression === "thinking" ? 15.5 : 17.5} r="1" fill="#1a1a2e" />
        </>
      )}

      {/* Mouth — only for error */}
      {expression === "error" ? (
        <path d="M13 24C14 22.5 18 22.5 19 24" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      ) : null}

      {/* Blush for happy */}
      {(expression === "happy" || expression === "celebrating") ? (
        <>
          <circle cx="9" cy="21" r="1.5" fill="white" opacity="0.2" />
          <circle cx="23" cy="21" r="1.5" fill="white" opacity="0.2" />
        </>
      ) : null}
    </svg>
  );
}

// ===========================================
// Orb Avatar (neon theme)
// ===========================================

function OrbAvatar({ expression }: { expression: CursorExpression }) {
  const isActive = expression === "thinking" || expression === "celebrating";
  const isError = expression === "error";
  const isHappy = expression === "happy" || expression === "celebrating";

  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
    >
      {/* Outer glow ring */}
      <circle
        cx="18"
        cy="18"
        r="16"
        className="stroke-[var(--cursor-primary,#a855f7)]"
        strokeWidth="0.8"
        opacity={isActive ? 0.8 : 0.3}
        style={isActive ? { animation: "cursor-orb-pulse 1.5s ease-in-out infinite" } : undefined}
      />

      {/* Middle pulsing ring */}
      <circle
        cx="18"
        cy="18"
        r="13"
        className="stroke-[var(--cursor-primary,#a855f7)]"
        strokeWidth="1"
        opacity={0.4}
        strokeDasharray="4 3"
        style={{ animation: "cursor-orb-spin 8s linear infinite", transformOrigin: "center" }}
      />

      {/* Core sphere */}
      <circle
        cx="18"
        cy="18"
        r="10"
        className="fill-[var(--cursor-primary,#a855f7)]"
        opacity={isError ? 0.5 : expression === "thinking" ? 0.7 : 0.9}
      />

      {/* Inner highlight — shifts based on expression */}
      <circle
        cx={isError ? 18 : 16}
        cy={expression === "thinking" ? 15 : 16}
        r="5"
        fill="white"
        opacity={isHappy ? 0.35 : 0.2}
      />

      {/* Core dot — the "eye" of the orb */}
      <circle
        cx="18"
        cy="18"
        r="3"
        fill="white"
        opacity={isError ? 0.3 : 0.6}
      />

      {/* Sparkles for happy */}
      {isHappy ? (
        <>
          <circle cx="8" cy="10" r="0.8" fill="white" opacity="0.7" />
          <circle cx="28" cy="12" r="0.6" fill="white" opacity="0.5" />
          <circle cx="10" cy="28" r="0.5" fill="white" opacity="0.6" />
          <circle cx="27" cy="26" r="0.7" fill="white" opacity="0.5" />
        </>
      ) : null}

      {/* Crack lines for error */}
      {isError ? (
        <>
          <path d="M14 14L18 18L22 15" stroke="white" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
          <path d="M15 22L18 18L21 23" stroke="white" strokeWidth="0.8" opacity="0.4" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

// ===========================================
// Robot Avatar
// ===========================================

function RobotAvatar({ expression }: { expression: CursorExpression }) {
  const isHappy = expression === "happy" || expression === "celebrating";
  const isError = expression === "error";
  const isThinking = expression === "thinking";

  return (
    <svg
      viewBox="0 0 32 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full drop-shadow-sm"
    >
      {/* Antenna */}
      <line
        x1="16" y1="6" x2="16" y2="2"
        className="stroke-[var(--cursor-primary,#10b981)]"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle
        cx="16" cy="1.5" r="1.5"
        className="fill-[var(--cursor-primary,#10b981)]"
        style={{ animation: "cursor-robot-antenna 2s ease-in-out infinite" }}
      />

      {/* Head — rounded rectangle */}
      <rect
        x="5" y="6" width="22" height="20" rx="4"
        className="fill-[var(--cursor-primary,#10b981)]"
        opacity={isThinking ? 0.8 : 1}
      />

      {/* Visor / face plate */}
      <rect x="8" y="10" width="16" height="10" rx="2" fill="#1a1a2e" opacity="0.4" />

      {/* Eyes — LED style */}
      {isHappy ? (
        <>
          <path d="M11 15C11 16.5 12 17.5 13 17.5C14 17.5 15 16.5 15 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M17 15C17 16.5 18 17.5 19 17.5C20 17.5 21 16.5 21 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      ) : isError ? (
        <>
          <path d="M11 13L14 17M14 13L11 17" stroke="#ff4444" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M18 13L21 17M21 13L18 17" stroke="#ff4444" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect
            x="11" y="13" width="4" height="4" rx="1"
            fill="white" opacity="0.9"
            style={{ animation: "cursor-robot-blink 4s ease-in-out infinite" }}
          />
          <rect
            x="17" y="13" width="4" height="4" rx="1"
            fill="white" opacity="0.9"
            style={{ animation: "cursor-robot-blink 4s ease-in-out infinite 0.1s" }}
          />
          <rect x="12.5" y={isThinking ? 13.5 : 14.5} width="1.5" height="1.5" rx="0.3" fill="#1a1a2e" />
          <rect x="18.5" y={isThinking ? 13.5 : 14.5} width="1.5" height="1.5" rx="0.3" fill="#1a1a2e" />
        </>
      )}

      {/* Mouth — LED bar */}
      {isError ? (
        <rect x="12" y="20" width="8" height="1.5" rx="0.5" fill="#ff4444" opacity="0.7" />
      ) : isHappy ? (
        <path d="M12 20.5C13 22 19 22 20 20.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      ) : (
        <rect x="12" y="20" width="8" height="1.5" rx="0.5" fill="white" opacity="0.4" />
      )}

      {/* Ears — side bolts */}
      <circle cx="4" cy="16" r="2" className="fill-[var(--cursor-primary,#10b981)]" opacity="0.7" />
      <circle cx="28" cy="16" r="2" className="fill-[var(--cursor-primary,#10b981)]" opacity="0.7" />

      {/* Chin plate */}
      <rect x="9" y="26" width="14" height="5" rx="2" className="fill-[var(--cursor-primary,#10b981)]" opacity="0.6" />
      <circle cx="12" cy="28" r="0.8" fill="white" opacity="0.3" />
      <circle cx="20" cy="28" r="0.8" fill="white" opacity="0.3" />
    </svg>
  );
}

// ===========================================
// Main Avatar Component — dispatches by type
// ===========================================

export function CursorAvatar({
  expression = "idle",
  size = "md",
  avatarType = "ghost",
  effects = DEFAULT_EFFECTS,
  noFloat,
  className,
}: CursorAvatarProps) {
  if (typeof document !== "undefined") injectStyles();

  const animationStyle = getAnimationStyle(expression, !!noFloat, effects);

  return (
    <div
      className={cn(SIZES[size], "relative flex-shrink-0", className)}
      style={animationStyle}
      aria-hidden="true"
    >
      {avatarType === "orb" ? (
        <OrbAvatar expression={expression} />
      ) : avatarType === "robot" ? (
        <RobotAvatar expression={expression} />
      ) : (
        <GhostAvatar expression={expression} />
      )}
    </div>
  );
}

// ===========================================
// Typing Indicator (three animated dots)
// ===========================================

export function TypingIndicator({ className }: { className?: string }) {
  if (typeof document !== "undefined") injectStyles();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current"
          style={{
            animation: `cursor-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
