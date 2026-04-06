"use client";

/**
 * Theme Provider
 *
 * Wraps the application with next-themes provider for dark/light/system theme support.
 * Uses class-based theming for Tailwind CSS compatibility.
 * Dynamic themes array built from official + installed community themes.
 *
 * @module components/providers/theme-provider
 */

import { themeEngine } from "@/lib/theme-engine";
import { OFFICIAL_THEMES } from "@/shared/types/theme";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";
import { useEffect, useMemo, useState } from "react";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [installedSlugs, setInstalledSlugs] = useState<string[]>([]);

  // Warm cache on mount and get installed slugs
  useEffect(() => {
    themeEngine.warmCache().then(() => {
      setInstalledSlugs(themeEngine.getInstalledThemes().map((t) => t.slug));
    });

    // Subscribe to changes (install/remove)
    return themeEngine.subscribe(() => {
      setInstalledSlugs(themeEngine.getInstalledThemes().map((t) => t.slug));
    });
  }, []);

  const themes = useMemo(
    () => [
      "light",
      "dark",
      "system",
      ...OFFICIAL_THEMES.map((t) => t.slug),
      ...installedSlugs,
    ],
    [installedSlugs],
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      themes={themes}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
