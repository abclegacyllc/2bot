"use client";

import { ErrorFallback } from "@/components/error-boundary";

export default function AdminGatewaysError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} />;
}
