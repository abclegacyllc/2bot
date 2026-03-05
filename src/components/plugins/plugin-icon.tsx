"use client";

/**
 * Plugin Icon Component
 *
 * Maps plugin icon names to emoji, reusable across all plugin pages.
 *
 * @module components/plugins/plugin-icon
 */

const ICON_MAP: Record<string, string> = {
  "chart-bar": "📊",
  analytics: "📈",
  message: "💬",
  automation: "⚙️",
  moderation: "🛡️",
  utilities: "🔧",
  general: "🔌",
  messaging: "💬",
};

interface PluginIconProps {
  icon: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}

export function PluginIcon({ icon, size = "md" }: PluginIconProps) {
  const emoji = icon ? ICON_MAP[icon] || "🔌" : "🔌";

  const sizeClasses = {
    sm: "w-8 h-8 text-lg",
    md: "w-10 h-10 text-xl",
    lg: "w-12 h-12 text-2xl",
  };

  return (
    <div className={`${sizeClasses[size]} rounded-lg bg-muted flex items-center justify-center`}>
      {emoji}
    </div>
  );
}
