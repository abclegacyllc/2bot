"use client";

/**
 * CursorSettings — Shared settings popover for CursorPanel + CursorStudioBar.
 *
 * Consolidates scattered theme/sound toggles into a single gear-icon popover
 * with sections for Appearance, Sound, and Session Storage location.
 *
 * @module components/cursor/cursor-settings
 */

import { useCallback, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Coins, Database, HardDrive, Palette, Settings2, Volume2, VolumeX } from "lucide-react";

import {
    CREDIT_BUDGET_MAX,
    CREDIT_BUDGET_MIN,
    CREDIT_BUDGET_PRESETS,
    getCreditBudget,
    getSessionStorageMode,
    setCreditBudget,
    setSessionStorageMode,
    type SessionStorageMode,
} from "./cursor-session-store";
import { setSoundProfile } from "./cursor-sounds";
import {
    CURSOR_THEMES,
    resolveTheme,
    saveThemePreference,
    type CursorThemeConfig,
} from "./cursor-theme";

// =============================================================================
// Props
// =============================================================================

interface CursorSettingsProps {
  /** Current active theme */
  theme: CursorThemeConfig;
  /** Called when user picks a different theme */
  onThemeChange: (theme: CursorThemeConfig) => void;
  /** Whether sound is muted */
  soundMuted: boolean;
  /** Toggle sound on/off */
  onSoundToggle: () => void;
  /** Smaller variant for StudioBar header */
  compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function CursorSettings({
  theme,
  onThemeChange,
  soundMuted,
  onSoundToggle,
  compact,
}: CursorSettingsProps) {
  const [storageMode, setStorageMode] = useState<SessionStorageMode>(getSessionStorageMode);
  const [creditBudget, setCreditBudgetState] = useState<number>(getCreditBudget);
  const [budgetDraft, setBudgetDraft] = useState<string>(() => String(getCreditBudget()));

  const commitBudget = useCallback((value: number) => {
    const saved = setCreditBudget(value);
    setCreditBudgetState(saved);
    setBudgetDraft(String(saved));
  }, []);

  const handleThemeChange = useCallback(
    (themeId: string) => {
      saveThemePreference(themeId);
      setSoundProfile(themeId);
      onThemeChange(resolveTheme(themeId));
    },
    [onThemeChange],
  );

  const handleStorageModeChange = useCallback((mode: SessionStorageMode) => {
    setSessionStorageMode(mode);
    setStorageMode(mode);
  }, []);

  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Cursor settings"
          title="Settings"
          className={cn(
            "text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50",
            compact ? "p-0.5" : "p-1",
          )}
        >
          <Settings2 className={iconSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-0">
        <div className="p-3 space-y-4">
          {/* ── Theme ── */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Palette className="h-3 w-3" /> Theme
            </div>
            <div className="flex gap-1.5">
              {Object.entries(CURSOR_THEMES).map(([id, t]) => (
                <button
                  key={id}
                  onClick={() => handleThemeChange(id)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                    theme.id === id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                  )}
                  title={t.name}
                >
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-1"
                    style={{ background: t.colors.primary }}
                  />
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* ── Sound ── */}
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              {soundMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              Sound Effects
            </div>
            <button
              onClick={onSoundToggle}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                soundMuted ? "bg-muted" : "bg-primary",
              )}
              role="switch"
              aria-checked={!soundMuted}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
                  soundMuted ? "translate-x-0.5" : "translate-x-[18px]",
                )}
              />
            </button>
          </div>

          {/* ── Session Storage ── */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Database className="h-3 w-3" /> Session History
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleStorageModeChange("local")}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md text-xs transition-all border",
                  storageMode === "local"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                <HardDrive className="h-3 w-3 mx-auto mb-1" />
                Local
              </button>
              <button
                onClick={() => handleStorageModeChange("cloud")}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md text-xs transition-all border",
                  storageMode === "cloud"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                <Database className="h-3 w-3 mx-auto mb-1" />
                Cloud
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              {storageMode === "local"
                ? "Sessions stored in browser only"
                : "Sessions synced to your workspace container"}
            </p>
          </div>

          {/* ── Credit Budget per session ── */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Coins className="h-3 w-3" /> Credit budget per session
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {CREDIT_BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => commitBudget(preset)}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs transition-all border min-w-[44px]",
                    creditBudget === preset
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                  )}
                  title={`${preset} credits per session`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={CREDIT_BUDGET_MIN}
                max={CREDIT_BUDGET_MAX}
                step={1}
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                onBlur={() => commitBudget(Number.parseInt(budgetDraft, 10))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitBudget(Number.parseInt(budgetDraft, 10));
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="flex-1 h-7 px-2 rounded-md text-xs bg-muted/50 border border-transparent focus:border-primary focus:bg-background outline-none transition-colors"
                aria-label="Custom credit budget"
              />
              <span className="text-[10px] text-muted-foreground/60">credits</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              When the AI hits this limit it will pause and ask before continuing. Range {CREDIT_BUDGET_MIN}–{CREDIT_BUDGET_MAX}.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
