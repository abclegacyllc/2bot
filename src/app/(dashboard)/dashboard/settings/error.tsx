"use client";

/**
 * Settings Error Page
 *
 * @module app/(dashboard)/dashboard/settings/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Settings error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Settings Error"
      description="Failed to load settings. Please try again."
    />
  );
}
