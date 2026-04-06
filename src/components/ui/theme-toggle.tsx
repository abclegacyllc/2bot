"use client";

/**
 * Theme Toggle Component
 *
 * Dynamic dropdown for switching between built-in, official, and community themes.
 * Features:
 * - Hover preview: themes apply temporarily on mouse enter, revert on leave
 * - 3-dot color swatch preview for official + installed themes
 * - Sections: Built-in → Official → Installed
 *
 * @module components/ui/theme-toggle
 */

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInstalledThemes } from "@/hooks/use-installed-themes";
import { themeEngine } from "@/lib/theme-engine";
import { OFFICIAL_THEMES } from "@/shared/types/theme";
import { Monitor, Moon, Palette, Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";

/** 3-dot color swatch for theme preview */
function ColorSwatch({ colors }: { colors: [string, string, string] }) {
  return (
    <span className="ml-auto flex gap-1">
      {colors.map((color, i) => (
        <span
          key={i}
          className="h-3 w-3 rounded-full border border-border/50"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

/** Icon mapping for built-in themes */
const BUILTIN_ICON: Record<string, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { installedThemes } = useInstalledThemes();
  const savedThemeRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  // Save the real theme when dropdown opens
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        savedThemeRef.current = theme;
      } else {
        // Restore real theme if preview was active
        if (savedThemeRef.current && savedThemeRef.current !== theme) {
          themeEngine.cancelPreview();
          setTheme(savedThemeRef.current);
        }
        savedThemeRef.current = undefined;
      }
    },
    [theme, setTheme],
  );

  const handlePreview = useCallback(
    (slug: string) => {
      if (!isOpen) return;
      themeEngine.previewTheme(slug);
      setTheme(slug);
    },
    [isOpen, setTheme],
  );

  const handleCancelPreview = useCallback(() => {
    if (!isOpen || !savedThemeRef.current) return;
    themeEngine.cancelPreview();
    setTheme(savedThemeRef.current);
  }, [isOpen, setTheme]);

  const handleSelect = useCallback(
    (slug: string) => {
      savedThemeRef.current = slug; // Prevent restore on close
      themeEngine.applyTheme(slug);
      setTheme(slug);
    },
    [setTheme],
  );

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="text-muted-foreground">
        <Sun className="h-5 w-5" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 bg-card border-border">
        {/* Built-in themes */}
        {(["light", "dark", "system"] as const).map((slug) => {
          const Icon = BUILTIN_ICON[slug];
          return (
            <DropdownMenuItem
              key={slug}
              onClick={() => handleSelect(slug)}
              onMouseEnter={() => handlePreview(slug)}
              onMouseLeave={handleCancelPreview}
              className={`cursor-pointer capitalize ${
                theme === slug ? "bg-muted" : ""
              }`}
            >
              {Icon ? <Icon className="mr-2 h-4 w-4" /> : null}
              {slug}
            </DropdownMenuItem>
          );
        })}

        {/* Official themes */}
        {OFFICIAL_THEMES.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Official
            </DropdownMenuLabel>
            {OFFICIAL_THEMES.map((t) => (
              <DropdownMenuItem
                key={t.slug}
                onClick={() => handleSelect(t.slug)}
                onMouseEnter={() => handlePreview(t.slug)}
                onMouseLeave={handleCancelPreview}
                className={`cursor-pointer ${
                  theme === t.slug ? "bg-muted" : ""
                }`}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {t.name}
                <ColorSwatch colors={t.previewColors} />
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        {/* Community-installed themes */}
        {installedThemes.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Installed
            </DropdownMenuLabel>
            {installedThemes.map((t) => (
              <DropdownMenuItem
                key={t.slug}
                onClick={() => handleSelect(t.slug)}
                onMouseEnter={() => handlePreview(t.slug)}
                onMouseLeave={handleCancelPreview}
                className={`cursor-pointer ${
                  theme === t.slug ? "bg-muted" : ""
                }`}
              >
                <Palette className="mr-2 h-4 w-4" />
                {t.name}
                <ColorSwatch colors={t.previewColors} />
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
