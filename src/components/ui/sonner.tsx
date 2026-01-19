"use client";

/**
 * Sonner Toast Component
 *
 * Toast notification wrapper using sonner library.
 * Provides success/error/info toasts with consistent styling.
 *
 * @module components/ui/sonner
 */

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toaster component that renders toast notifications.
 * Should be placed in the root layout.
 */
function Toaster({ ...props }: ToasterProps) {
  const { theme = "dark" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-purple-600 group-[.toast]:text-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:bg-emerald-900/50 group-[.toaster]:border-emerald-800",
          error:
            "group-[.toaster]:bg-red-900/50 group-[.toaster]:border-red-800",
          warning:
            "group-[.toaster]:bg-amber-900/50 group-[.toaster]:border-amber-800",
          info:
            "group-[.toaster]:bg-blue-900/50 group-[.toaster]:border-blue-800",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
