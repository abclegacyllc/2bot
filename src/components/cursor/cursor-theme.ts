/**
 * Cursor Theme System
 *
 * Defines theme tokens for the Cursor UI — colors, avatar type, animation flags.
 * Uses CSS custom properties for runtime switching + TypeScript config for avatar/animation logic.
 *
 * When platform themes are added later:
 *   1. Add a new CursorThemeConfig entry to CURSOR_THEMES
 *   2. Override CSS variables via `getCursorThemeVars()`
 *   3. The avatar, colors, and effects automatically adapt
 *
 * @module components/cursor/cursor-theme
 */

// ===========================================
// Types
// ===========================================

/**
 * Avatar character types — each has its own component rendering.
 * Future themes can swap to different characters.
 */
export type CursorAvatarType = "ghost" | "robot" | "orb" | "wizard" | "cat";

/**
 * Color tokens for the cursor UI — all mapped to CSS custom properties.
 */
export interface CursorThemeColors {
  /** Main brand accent (FAB, header gradient, chips) */
  primary: string;
  /** Lighter shade for backgrounds */
  primaryLight: string;
  /** Glow/shadow color (used in box-shadow) */
  primaryGlow: string;
  /** AI message bubble background */
  bubbleAi: string;
  /** AI message bubble text */
  bubbleAiText: string;
  /** User message bubble background */
  bubbleUser: string;
  /** User message bubble text */
  bubbleUserText: string;
  /** Suggestion chip background */
  chipBg: string;
  /** Suggestion chip text */
  chipText: string;
  /** Success accent */
  success: string;
  /** Error accent */
  error: string;
  /** Panel border color */
  panelBorder: string;
  /** Panel background color */
  panelBg: string;
  /** Header background color (overrides primaryLight in header) */
  headerBg: string;
  /** Panel border-radius token */
  panelRadius: string;
}

/**
 * Animation/effect toggles per theme.
 */
export interface CursorThemeEffects {
  /** Avatar floats up and down */
  floatAnimation: boolean;
  /** Subtle glow pulse on the FAB */
  glowPulse: boolean;
  /** Messages slide in from bottom */
  messageSlideIn: boolean;
  /** Typing indicator with animated dots */
  typingDots: boolean;
  /** Avatar shakes on error */
  errorShake: boolean;
}

/**
 * Complete theme configuration for the Cursor.
 */
export interface CursorThemeConfig {
  /** Unique theme ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Which avatar character to render */
  avatar: CursorAvatarType;
  /** Color tokens */
  colors: CursorThemeColors;
  /** Animation/effect toggles */
  effects: CursorThemeEffects;
}

// ===========================================
// Default Themes
// ===========================================

export const DEFAULT_THEME: CursorThemeConfig = {
  id: "ghost",
  name: "Ghost",
  avatar: "ghost",
  colors: {
    primary: "#10b981",          // emerald-500
    primaryLight: "#10b98118",   // emerald-500 / 10%
    primaryGlow: "#10b98140",    // emerald-500 / 25%
    bubbleAi: "hsl(var(--muted) / 0.5)",
    bubbleAiText: "hsl(var(--foreground))",
    bubbleUser: "#10b981",
    bubbleUserText: "#ffffff",
    chipBg: "hsl(var(--muted) / 0.6)",
    chipText: "hsl(var(--muted-foreground))",
    success: "#10b981",
    error: "#ef4444",
    panelBorder: "hsl(var(--border))",
    panelBg: "hsl(var(--background) / 0.95)",
    headerBg: "#10b98118",
    panelRadius: "1rem",
  },
  effects: {
    floatAnimation: true,
    glowPulse: true,
    messageSlideIn: true,
    typingDots: true,
    errorShake: true,
  },
};

/**
 * Example future theme — neon cyberpunk style.
 * Demonstrates how easy it is to add new themes.
 */
export const NEON_THEME: CursorThemeConfig = {
  id: "neon",
  name: "Neon",
  avatar: "orb",
  colors: {
    primary: "#a855f7",          // purple-500
    primaryLight: "#a855f718",
    primaryGlow: "#a855f760",    // stronger glow for neon
    bubbleAi: "hsl(var(--muted) / 0.5)",
    bubbleAiText: "hsl(var(--foreground))",
    bubbleUser: "#a855f7",
    bubbleUserText: "#ffffff",
    chipBg: "hsl(var(--muted) / 0.6)",
    chipText: "hsl(var(--muted-foreground))",
    success: "#22c55e",
    error: "#f43f5e",
    panelBorder: "#a855f740",
    panelBg: "hsl(var(--background) / 0.98)",
    headerBg: "#a855f720",
    panelRadius: "0.75rem",
  },
  effects: {
    floatAnimation: false,   // orb is static, uses its own spin/pulse
    glowPulse: true,
    messageSlideIn: true,
    typingDots: true,
    errorShake: true,
  },
};

/**
 * Robot theme — mechanical, industrial feel.
 * Uses a boxy robot avatar with LED eyes.
 */
export const ROBOT_THEME: CursorThemeConfig = {
  id: "robot",
  name: "Robot",
  avatar: "robot",
  colors: {
    primary: "#3b82f6",          // blue-500
    primaryLight: "#3b82f618",
    primaryGlow: "#3b82f650",
    bubbleAi: "hsl(var(--muted) / 0.5)",
    bubbleAiText: "hsl(var(--foreground))",
    bubbleUser: "#3b82f6",
    bubbleUserText: "#ffffff",
    chipBg: "hsl(var(--muted) / 0.6)",
    chipText: "hsl(var(--muted-foreground))",
    success: "#22c55e",
    error: "#ef4444",
    panelBorder: "#3b82f630",
    panelBg: "hsl(var(--background) / 0.96)",
    headerBg: "#3b82f618",
    panelRadius: "0.5rem",       // sharp industrial corners
  },
  effects: {
    floatAnimation: true,
    glowPulse: true,
    messageSlideIn: true,
    typingDots: true,
    errorShake: true,
  },
};

/**
 * All available cursor themes.
 */
export const CURSOR_THEMES: Record<string, CursorThemeConfig> = {
  ghost: DEFAULT_THEME,
  neon: NEON_THEME,
  robot: ROBOT_THEME,
};

/** Default theme ID */
export const DEFAULT_CURSOR_THEME = "ghost";

// ===========================================
// CSS Variable Mapping
// ===========================================

/**
 * Convert a theme config to CSS custom property key-value pairs.
 * Apply these to a container's `style` prop.
 */
export function getCursorThemeVars(theme: CursorThemeConfig): Record<string, string> {
  return {
    "--cursor-primary": theme.colors.primary,
    "--cursor-primary-light": theme.colors.primaryLight,
    "--cursor-glow": theme.colors.primaryGlow,
    "--cursor-bubble-ai": theme.colors.bubbleAi,
    "--cursor-bubble-ai-text": theme.colors.bubbleAiText,
    "--cursor-bubble-user": theme.colors.bubbleUser,
    "--cursor-bubble-user-text": theme.colors.bubbleUserText,
    "--cursor-chip-bg": theme.colors.chipBg,
    "--cursor-chip-text": theme.colors.chipText,
    "--cursor-success": theme.colors.success,
    "--cursor-error": theme.colors.error,
    "--cursor-panel-border": theme.colors.panelBorder,
    "--cursor-panel-bg": theme.colors.panelBg,
    "--cursor-header-bg": theme.colors.headerBg,
    "--cursor-panel-radius": theme.colors.panelRadius,
  };
}

// ===========================================
// Theme Persistence
// ===========================================

const THEME_STORAGE_KEY = "cursor-theme";

/** Load saved theme preference */
export function loadThemePreference(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_CURSOR_THEME;
  } catch {
    return DEFAULT_CURSOR_THEME;
  }
}

/** Save theme preference */
export function saveThemePreference(themeId: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch { /* ignore */ }
}

/** Resolve a theme config by ID (falls back to default) */
export function resolveTheme(themeId: string): CursorThemeConfig {
  return CURSOR_THEMES[themeId] || DEFAULT_THEME;
}
