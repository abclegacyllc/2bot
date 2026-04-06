/**
 * useInstalledThemes — React hook for community theme CRUD via ThemeEngine.
 *
 * Wraps the ThemeEngine singleton with React state management via useSyncExternalStore.
 * Triggers re-render when themes are installed or removed.
 *
 * @module hooks/use-installed-themes
 */

"use client";

import type { ThemeValidationResult } from "@/lib/theme-engine";
import { themeEngine } from "@/lib/theme-engine";
import type { ThemePackage, ThemeSummary } from "@/shared/types/theme";
import { OFFICIAL_THEMES } from "@/shared/types/theme";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

// Snapshot function for useSyncExternalStore — returns a stable reference
// that only changes when the engine notifies (install/remove).
function getSnapshot(): ThemePackage[] {
  return themeEngine.getInstalledThemes();
}

// Server snapshot — must return the SAME reference every call to avoid infinite loop
const EMPTY_THEMES: ThemePackage[] = [];
function getServerSnapshot(): ThemePackage[] {
  return EMPTY_THEMES;
}

export function useInstalledThemes() {
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to engine changes — re-renders when themes are installed/removed
  const installedThemes = useSyncExternalStore(
    themeEngine.subscribe.bind(themeEngine),
    getSnapshot,
    getServerSnapshot,
  );

  // Warm cache on mount
  useEffect(() => {
    themeEngine
      .warmCache()
      .then(() => setIsLoading(false))
      .catch(() => setIsLoading(false));
  }, []);

  const installTheme = useCallback(
    async (pkg: ThemePackage): Promise<ThemeValidationResult> => {
      return themeEngine.installTheme(pkg);
    },
    [],
  );

  const removeTheme = useCallback(async (slug: string): Promise<void> => {
    return themeEngine.removeTheme(slug);
  }, []);

  // Summaries of all available themes (official + installed)
  const allThemes: ThemeSummary[] = useMemo(() => {
    const official: ThemeSummary[] = OFFICIAL_THEMES.map((t) => ({
      slug: t.slug,
      name: t.name,
      mode: t.mode,
      previewColors: t.previewColors,
      tags: t.tags,
    }));
    const installed: ThemeSummary[] = installedThemes.map((t) => ({
      slug: t.slug,
      name: t.name,
      mode: t.mode,
      previewColors: t.previewColors,
      tags: t.tags,
    }));
    return [...official, ...installed];
  }, [installedThemes]);

  return {
    /** Community-installed themes */
    installedThemes,
    /** All available non-builtin themes (official + installed) as summaries */
    allThemes,
    /** Install a community theme (validates first) */
    installTheme,
    /** Remove an installed community theme */
    removeTheme,
    /** True until IndexedDB cache is loaded */
    isLoading,
  };
}
