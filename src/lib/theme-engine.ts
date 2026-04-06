/**
 * ThemeEngine — singleton for runtime theme application, preview, and IndexedDB persistence.
 *
 * Architecture:
 * - Official/built-in themes: CSS lives in globals.css, applied via class attribute by next-themes
 * - Community/installed themes: CSS built at runtime, injected via single <style id="2bot-theme"> tag
 * - All installed themes cached in-memory Map after warmCache()
 * - IndexedDB used for persistent storage (survives page reload)
 *
 * Security: All CSS variable values validated against THEME_VALUE_PATTERN before injection.
 *
 * @module lib/theme-engine
 */

import {
    type ThemePackage,
    OFFICIAL_THEMES,
    THEME_MAX_SIZE,
    THEME_VALUE_PATTERN,
    THEME_VARIABLES,
} from "@/shared/types/theme";

// =============================================================================
// Constants
// =============================================================================

const DB_NAME = "2bot-theme-store";
const STORE_NAME = "2bot-themes";
const DB_VERSION = 1;
const STYLE_TAG_ID = "2bot-theme";

// =============================================================================
// IndexedDB helpers
// =============================================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "slug" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<ThemePackage[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as ThemePackage[]);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, pkg: ThemePackage): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(pkg);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, slug: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(slug);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// =============================================================================
// CSS builder
// =============================================================================

/**
 * Build a CSS string that sets all theme variables on .{slug}.
 * Only used for community themes — official themes use static CSS in globals.css.
 */
function buildThemeCSS(pkg: ThemePackage): string {
  const lines: string[] = [];
  lines.push(`.${CSS.escape(pkg.slug)} {`);

  for (const [key, value] of Object.entries(pkg.variables)) {
    if (value !== undefined) {
      lines.push(`  --${key}: ${value};`);
    }
  }

  if (pkg.customProperties) {
    for (const [key, value] of Object.entries(pkg.customProperties)) {
      lines.push(`  --${CSS.escape(key)}: ${value};`);
    }
  }

  lines.push("}");

  // Keyframe animations
  if (pkg.animations) {
    for (const [name, body] of Object.entries(pkg.animations)) {
      lines.push(`@keyframes ${CSS.escape(name)} { ${body} }`);
    }
  }

  return lines.join("\n");
}

// =============================================================================
// Validation
// =============================================================================

export interface ThemeValidationResult {
  valid: boolean;
  errors: string[];
}

function validateTheme(pkg: ThemePackage): ThemeValidationResult {
  const errors: string[] = [];

  // Size check
  const serialized = JSON.stringify(pkg);
  if (serialized.length > THEME_MAX_SIZE) {
    errors.push(`Theme exceeds max size: ${serialized.length} > ${THEME_MAX_SIZE} bytes`);
  }

  // Required fields
  if (!pkg.slug || typeof pkg.slug !== "string") errors.push("Missing or invalid slug");
  if (!pkg.name || typeof pkg.name !== "string") errors.push("Missing or invalid name");
  if (!pkg.version || typeof pkg.version !== "string") errors.push("Missing or invalid version");
  if (typeof pkg.schemaVersion !== "number") errors.push("Missing or invalid schemaVersion");
  if (!pkg.mode || !["light", "dark"].includes(pkg.mode)) errors.push("Invalid mode");
  if (!pkg.author?.name) errors.push("Missing author name");
  if (!Array.isArray(pkg.previewColors) || pkg.previewColors.length !== 3) {
    errors.push("previewColors must be array of 3 strings");
  }

  // Slug format
  if (pkg.slug && !/^[a-z0-9-]+$/.test(pkg.slug)) {
    errors.push("Slug must be lowercase alphanumeric with hyphens only");
  }

  // Reject reserved slugs
  const reserved = ["light", "dark", "system"];
  if (reserved.includes(pkg.slug)) {
    errors.push(`Slug "${pkg.slug}" is reserved`);
  }

  // Reject overwriting official themes
  if (OFFICIAL_THEMES.some((t) => t.slug === pkg.slug)) {
    errors.push(`Cannot overwrite official theme "${pkg.slug}"`);
  }

  // Validate all CSS variable values
  const allowedVars = new Set<string>(THEME_VARIABLES);
  for (const [key, value] of Object.entries(pkg.variables)) {
    if (!allowedVars.has(key)) {
      errors.push(`Unknown CSS variable: ${key}`);
      continue;
    }
    if (value !== undefined && !THEME_VALUE_PATTERN.test(value)) {
      errors.push(`Unsafe CSS value for --${key}: "${value}"`);
    }
  }

  // Validate custom properties
  if (pkg.customProperties) {
    for (const [key, value] of Object.entries(pkg.customProperties)) {
      if (!THEME_VALUE_PATTERN.test(value)) {
        errors.push(`Unsafe CSS value for custom --${key}: "${value}"`);
      }
    }
  }

  // Validate animation bodies (basic check — no url(), expression(), javascript:)
  if (pkg.animations) {
    const dangerousPattern = /url\s*\(|expression\s*\(|javascript:|@import|<script/i;
    for (const [name, body] of Object.entries(pkg.animations)) {
      if (dangerousPattern.test(body)) {
        errors.push(`Dangerous CSS in animation "${name}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// ThemeEngine Class
// =============================================================================

class ThemeEngine {
  private cache = new Map<string, ThemePackage>();
  private db: IDBDatabase | null = null;
  private warmPromise: Promise<void> | null = null;
  private previewSlug: string | null = null;
  private savedStyleContent: string | null = null;

  /** Listeners notified when installed themes change */
  private listeners = new Set<() => void>();

  /**
   * Cached snapshot array for useSyncExternalStore.
   * Only rebuilt on install/remove/warmCache to maintain referential stability.
   */
  private snapshot: ThemePackage[] = [];

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Load all installed themes from IndexedDB into memory.
   * Safe to call multiple times — deduplicates via warmPromise.
   */
  warmCache(): Promise<void> {
    if (this.warmPromise) return this.warmPromise;
    this.warmPromise = this._doWarm();
    return this.warmPromise;
  }

  private async _doWarm(): Promise<void> {
    if (typeof indexedDB === "undefined") return; // SSR guard
    try {
      this.db = await openDB();
      const themes = await idbGetAll(this.db);
      for (const theme of themes) {
        this.cache.set(theme.slug, theme);
      }
      this.rebuildSnapshot();
    } catch {
      // IndexedDB unavailable (private browsing, etc.) — degrade gracefully
      console.warn("[ThemeEngine] IndexedDB unavailable, using memory-only mode");
    }
  }

  // ---------------------------------------------------------------------------
  // Subscription (for React hooks)
  // ---------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /** Get all installed (community) themes — returns a stable reference for useSyncExternalStore */
  getInstalledThemes(): ThemePackage[] {
    return this.snapshot;
  }

  /** Rebuild the stable snapshot array after any mutation */
  private rebuildSnapshot(): void {
    this.snapshot = Array.from(this.cache.values());
  }

  /** Get a single theme by slug (checks official + installed) */
  getTheme(slug: string): ThemePackage | undefined {
    return OFFICIAL_THEMES.find((t) => t.slug === slug) ?? this.cache.get(slug);
  }

  /** All available theme slugs (built-in + official + installed) */
  getAllThemeSlugs(): string[] {
    return [
      "light",
      "dark",
      "system",
      ...OFFICIAL_THEMES.map((t) => t.slug),
      ...Array.from(this.cache.keys()),
    ];
  }

  // ---------------------------------------------------------------------------
  // Install / Remove
  // ---------------------------------------------------------------------------

  async installTheme(pkg: ThemePackage): Promise<ThemeValidationResult> {
    const result = validateTheme(pkg);
    if (!result.valid) return result;

    this.cache.set(pkg.slug, pkg);
    this.rebuildSnapshot();

    if (this.db) {
      try {
        await idbPut(this.db, pkg);
      } catch {
        console.warn("[ThemeEngine] Failed to persist theme to IndexedDB");
      }
    }

    this.notify();
    return result;
  }

  async removeTheme(slug: string): Promise<void> {
    this.cache.delete(slug);
    this.rebuildSnapshot();

    if (this.db) {
      try {
        await idbDelete(this.db, slug);
      } catch {
        console.warn("[ThemeEngine] Failed to remove theme from IndexedDB");
      }
    }

    // Clean up style tag if this theme was active
    this.clearStyleTag();
    this.notify();
  }

  // ---------------------------------------------------------------------------
  // Apply / Preview
  // ---------------------------------------------------------------------------

  /**
   * Apply a theme by injecting its CSS variables into a <style> tag.
   * For official themes that have static CSS in globals.css, this is a no-op
   * (next-themes handles class application).
   */
  applyTheme(slug: string): void {
    // Built-in themes handled by next-themes class toggle
    if (["light", "dark", "system"].includes(slug)) {
      this.clearStyleTag();
      return;
    }

    // Official themes have static CSS — clear any community overrides
    if (OFFICIAL_THEMES.some((t) => t.slug === slug)) {
      this.clearStyleTag();
      return;
    }

    // Community theme — inject CSS
    const theme = this.cache.get(slug);
    if (!theme) return;

    const css = buildThemeCSS(theme);
    this.injectCSS(css);
  }

  /**
   * Preview a theme on hover (temporary injection).
   * Saves current style tag content for restoration.
   */
  previewTheme(slug: string): void {
    if (this.previewSlug === null) {
      // First preview — save current state
      const tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
      this.savedStyleContent = tag?.textContent ?? null;
    }
    this.previewSlug = slug;
    this.applyTheme(slug);
  }

  /** Cancel preview — restore previous style tag content. */
  cancelPreview(): void {
    if (this.previewSlug === null) return;
    this.previewSlug = null;

    if (this.savedStyleContent !== null) {
      this.injectCSS(this.savedStyleContent);
    } else {
      this.clearStyleTag();
    }
    this.savedStyleContent = null;
  }

  // ---------------------------------------------------------------------------
  // Validation (public)
  // ---------------------------------------------------------------------------

  validate(pkg: ThemePackage): ThemeValidationResult {
    return validateTheme(pkg);
  }

  // ---------------------------------------------------------------------------
  // Style tag management
  // ---------------------------------------------------------------------------

  private getOrCreateStyleTag(): HTMLStyleElement {
    let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement("style");
      tag.id = STYLE_TAG_ID;
      document.head.appendChild(tag);
    }
    return tag;
  }

  private injectCSS(css: string): void {
    if (typeof document === "undefined") return; // SSR guard
    const tag = this.getOrCreateStyleTag();
    tag.textContent = css; // Single reflow — textContent swap
  }

  private clearStyleTag(): void {
    if (typeof document === "undefined") return;
    const tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (tag) tag.textContent = "";
  }
}

// =============================================================================
// Singleton export
// =============================================================================

export const themeEngine = new ThemeEngine();
