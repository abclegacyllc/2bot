"use client";

/**
 * Shared Routing Preference Hook
 *
 * Single source of truth for the user's AI Routing Preference.
 * Backed by auth context so changes made in the Settings page
 * or the Chat popover propagate to each other instantly.
 *
 * @module hooks/use-routing-preference
 */

import { useAuth } from "@/components/providers/auth-provider";
import { apiUrl } from "@/shared/config/urls";
import { useCallback, useMemo, useState } from "react";

export type RoutingPreference = "cost" | "balanced" | "quality";

const VALID_PREFS: RoutingPreference[] = ["cost", "balanced", "quality"];

function isValidPref(v: unknown): v is RoutingPreference {
  return typeof v === "string" && VALID_PREFS.includes(v as RoutingPreference);
}

export interface UseRoutingPreferenceReturn {
  /** Current routing preference */
  routingPreference: RoutingPreference;
  /** Whether a save is in progress */
  isSaving: boolean;
  /** Update the preference (optimistic UI + backend persist + auth refresh) */
  setRoutingPreference: (pref: RoutingPreference) => Promise<void>;
}

/**
 * Hook that reads and writes the user's AI routing preference.
 *
 * Reading:  `user.aiRoutingPreference` from AuthProvider (global).
 * Writing:  `PUT /user/preferences`, then `refreshUser()` so every
 *           consumer of `useAuth()` sees the new value immediately.
 *
 * Optimistic: sets local state before the round-trip so the UI feels instant.
 * Reverts on error.
 *
 * @param tokenOverride – Optional token to use instead of `useAuth().token`.
 *   The chat widget receives its token as a prop; passing it here avoids
 *   a stale-token edge case when the widget mounts before AuthProvider hydrates.
 */
export function useRoutingPreference(
  tokenOverride?: string | null
): UseRoutingPreferenceReturn {
  const { user, token: authToken, refreshUser } = useAuth();

  const token = tokenOverride ?? authToken;

  // Derive canonical preference from auth context
  const serverPref: RoutingPreference = isValidPref(user?.aiRoutingPreference)
    ? user!.aiRoutingPreference as RoutingPreference
    : "balanced";

  // Optimistic local override while saving
  const [optimistic, setOptimistic] = useState<RoutingPreference | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const routingPreference = optimistic ?? serverPref;

  const setRoutingPreference = useCallback(
    async (newPref: RoutingPreference) => {
      if (newPref === serverPref && !optimistic) return; // no-op
      setOptimistic(newPref);
      setIsSaving(true);

      try {
        const res = await fetch(apiUrl("/user/preferences"), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ aiRoutingPreference: newPref }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as Record<string, Record<string, string>>).error?.message ||
              "Failed to update preference"
          );
        }

        // Refresh auth context so every consumer (Settings + Chat) picks up the change
        await refreshUser();
      } catch {
        // Revert optimistic update on failure
      } finally {
        setOptimistic(null);
        setIsSaving(false);
      }
    },
    [token, serverPref, optimistic, refreshUser]
  );

  return useMemo(
    () => ({ routingPreference, isSaving, setRoutingPreference }),
    [routingPreference, isSaving, setRoutingPreference]
  );
}
