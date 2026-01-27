"use client";

/**
 * My Plugins Error Page
 *
 * @module app/(dashboard)/my-plugins/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function MyPluginsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("My plugins error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="My Plugins Error"
      description="Failed to load your plugins. Please try again."
    />
  );
}
