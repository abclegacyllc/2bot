/**
 * useThemeEngine — React hook for applying themes and hover-preview.
 *
 * Bridges ThemeEngine (CSS injection) with next-themes (class attribute management).
 * When applying a theme: engine injects CSS vars, next-themes sets the class.
 *
 * @module hooks/use-theme-engine
 */

"use client";

import { themeEngine } from "@/lib/theme-engine";
import { useTheme } from "next-themes";
import { useCallback, useRef } from "react";

export function useThemeEngine() {
  const { setTheme, theme: currentTheme } = useTheme();
  const savedThemeRef = useRef<string | null>(null);

  /**
   * Apply a theme permanently.
   * - Sets the class via next-themes (triggers CSS cascade for built-in/official themes)
   * - For community themes, also injects CSS via ThemeEngine
   */
  const applyTheme = useCallback(
    (slug: string) => {
      savedThemeRef.current = null; // Clear any preview state
      themeEngine.applyTheme(slug);
      setTheme(slug);
    },
    [setTheme],
  );

  /**
   * Preview a theme on hover (temporary).
   * Saves the current theme on first call for restoration.
   */
  const previewTheme = useCallback(
    (slug: string) => {
      if (savedThemeRef.current === null) {
        savedThemeRef.current = currentTheme ?? "dark";
      }
      themeEngine.previewTheme(slug);
      setTheme(slug);
    },
    [currentTheme, setTheme],
  );

  /**
   * Cancel hover preview — restore the saved theme.
   */
  const cancelPreview = useCallback(() => {
    themeEngine.cancelPreview();
    if (savedThemeRef.current !== null) {
      setTheme(savedThemeRef.current);
      savedThemeRef.current = null;
    }
  }, [setTheme]);

  return {
    applyTheme,
    previewTheme,
    cancelPreview,
    currentTheme,
  };
}
