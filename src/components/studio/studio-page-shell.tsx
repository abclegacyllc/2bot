"use client";

/**
 * Studio Page Shell
 *
 * Wrapper for non-bot pages rendered inside the Studio layout.
 * Provides consistent padding and scroll behavior.
 *
 * @module components/studio/studio-page-shell
 */

import type { ReactNode } from "react";

interface StudioPageShellProps {
  children: ReactNode;
}

export function StudioPageShell({ children }: StudioPageShellProps) {
  return (
    <div className="h-full overflow-auto p-6 lg:p-8">
      {children}
    </div>
  );
}
