"use client";

export default function OrganizationDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="text-red-500 text-lg font-semibold">
        Failed to load organization
      </div>
      <div className="text-muted-foreground text-sm max-w-md text-center">
        {error.message || "An unexpected error occurred"}
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
      >
        Try again
      </button>
    </div>
  );
}
