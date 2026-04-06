/**
 * Theme System Types & Constants
 *
 * Defines the CSS variable schema used by the 2Bot theme system.
 * Core variables follow shadcn/ui convention (oklch-based).
 * Studio variables extend the system for workflow canvas theming.
 *
 * @module shared/types/theme
 */

// =============================================================================
// Core CSS Variables (shadcn/ui base)
// =============================================================================

export const CORE_THEME_VARIABLES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "radius",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

// =============================================================================
// Studio CSS Variables (workflow canvas + glassmorphism)
// =============================================================================

export const STUDIO_THEME_VARIABLES = [
  // Glow effects
  "glow-primary",
  "glow-accent",
  // Canvas background
  "canvas-bg",
  "canvas-grid",
  "canvas-grid-size",
  // Workflow nodes
  "node-bg",
  "node-border",
  "node-glow",
  // Canvas accent (replaces hardcoded emerald in flow)
  "canvas-accent",
  "canvas-accent-fg",
  // Workflow edges
  "edge-color",
  "edge-animated",
  // Glassmorphism
  "glass-bg",
  "glass-border",
] as const;

// =============================================================================
// Combined
// =============================================================================

export const THEME_VARIABLES = [
  ...CORE_THEME_VARIABLES,
  ...STUDIO_THEME_VARIABLES,
] as const;

export type ThemeVariable = (typeof THEME_VARIABLES)[number];
export type CoreThemeVariable = (typeof CORE_THEME_VARIABLES)[number];
export type StudioThemeVariable = (typeof STUDIO_THEME_VARIABLES)[number];

// =============================================================================
// Theme Definition (backward compat)
// =============================================================================

export interface ThemeDefinition {
  slug: string;
  name: string;
  mode: "light" | "dark";
  description?: string;
  /** CSS variable values (oklch format) */
  variables: Partial<Record<ThemeVariable, string>>;
}

// =============================================================================
// Theme Package (marketplace-ready)
// =============================================================================

/**
 * Regex for validating theme CSS variable values.
 * Only allows oklch colors, numbers with optional units, and transparent.
 * Rejects url(), expression(), javascript:, @import, etc.
 */
export const THEME_VALUE_PATTERN =
  /^(oklch\([0-9.\s/%]+\)|transparent|[0-9.]+(px|rem|em|%|deg|s|ms)?|inherit|currentColor)$/;

/** Maximum serialized size of a ThemePackage in bytes */
export const THEME_MAX_SIZE = 50_000; // 50KB

export interface ThemePackageAuthor {
  name: string;
  url?: string;
}

/**
 * Full theme package — extends ThemeDefinition with marketplace metadata.
 * Used for official themes and community-installed themes.
 */
export interface ThemePackage extends ThemeDefinition {
  /** Semver version string */
  version: string;
  /** Schema version for forward-compatibility. Bump when adding new CSS vars. */
  schemaVersion: number;
  /** Theme author */
  author: ThemePackageAuthor;
  /** Searchable tags */
  tags?: string[];
  /** 3 oklch color swatches for previewing in marketplace/toggle [background, primary, accent] */
  previewColors: [string, string, string];
  /** Optional custom animation keyframe overrides (name → CSS body) */
  animations?: Record<string, string>;
  /** Optional custom CSS properties not in THEME_VARIABLES schema */
  customProperties?: Record<string, string>;
}

/** Minimal theme info for listing in dropdowns/marketplace cards */
export interface ThemeSummary {
  slug: string;
  name: string;
  mode: "light" | "dark";
  previewColors: [string, string, string];
  tags?: string[];
}

// =============================================================================
// Official Themes
// =============================================================================

export const OFFICIAL_THEMES: ThemePackage[] = [
  {
    slug: "neon-cosmic",
    name: "Neon Cosmic",
    mode: "dark",
    version: "1.0.0",
    schemaVersion: 1,
    author: { name: "2Bot Team" },
    description: "Deep cosmic hues with neon purple/cyan glow effects and glassmorphism",
    tags: ["dark", "neon", "cosmic", "glassmorphism"],
    previewColors: [
      "oklch(0.13 0.02 260)",  // background
      "oklch(0.65 0.25 280)",  // primary (purple)
      "oklch(0.7 0.2 195)",    // accent (cyan)
    ],
    variables: {
      // Core overrides
      background: "oklch(0.13 0.02 260)",
      foreground: "oklch(0.95 0.01 260)",
      card: "oklch(0.18 0.02 260)",
      "card-foreground": "oklch(0.95 0.01 260)",
      popover: "oklch(0.18 0.02 260)",
      "popover-foreground": "oklch(0.95 0.01 260)",
      primary: "oklch(0.65 0.25 280)",
      "primary-foreground": "oklch(0.98 0 0)",
      secondary: "oklch(0.22 0.03 260)",
      "secondary-foreground": "oklch(0.9 0.01 260)",
      muted: "oklch(0.22 0.03 260)",
      "muted-foreground": "oklch(0.65 0.03 260)",
      accent: "oklch(0.7 0.2 195)",
      "accent-foreground": "oklch(0.98 0 0)",
      border: "oklch(0.3 0.04 260 / 50%)",
      input: "oklch(0.3 0.04 260 / 60%)",
      ring: "oklch(0.65 0.25 280)",
      sidebar: "oklch(0.15 0.02 260)",
      "sidebar-foreground": "oklch(0.9 0.01 260)",
      "sidebar-primary": "oklch(0.65 0.25 280)",
      "sidebar-primary-foreground": "oklch(0.98 0 0)",
      "sidebar-accent": "oklch(0.22 0.03 260)",
      "sidebar-accent-foreground": "oklch(0.9 0.01 260)",
      "sidebar-border": "oklch(0.3 0.04 260 / 40%)",
      "chart-1": "oklch(0.65 0.25 280)",
      "chart-2": "oklch(0.7 0.2 195)",
      "chart-3": "oklch(0.75 0.15 140)",
      "chart-4": "oklch(0.7 0.2 330)",
      "chart-5": "oklch(0.8 0.15 80)",

      // Studio / canvas
      "glow-primary": "oklch(0.65 0.25 280 / 40%)",
      "glow-accent": "oklch(0.7 0.2 195 / 40%)",
      "canvas-bg": "oklch(0.11 0.02 260)",
      "canvas-grid": "oklch(0.25 0.04 260)",
      "canvas-grid-size": "20",
      "node-bg": "oklch(0.16 0.02 260 / 80%)",
      "node-border": "oklch(0.35 0.05 260 / 60%)",
      "node-glow": "oklch(0.65 0.25 280 / 30%)",
      "canvas-accent": "oklch(0.7 0.2 195)",
      "canvas-accent-fg": "oklch(0.98 0 0)",
      "edge-color": "oklch(0.55 0.15 280)",
      "edge-animated": "oklch(0.7 0.2 195)",
      "glass-bg": "oklch(0.16 0.02 260 / 60%)",
      "glass-border": "oklch(0.4 0.05 260 / 30%)",
    },
  },
];
