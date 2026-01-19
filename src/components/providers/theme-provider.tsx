"use client";

/**
 * Theme Provider
 *
 * Wraps the application with next-themes provider for dark/light/system theme support.
 * Uses class-based theming for Tailwind CSS compatibility.
 *
 * @module components/providers/theme-provider
 */

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
