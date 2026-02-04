"use client";

/**
 * Resource Pool Card Component
 * 
 * Displays a pool of related resources (Automation, Workspace, or Billing).
 * Groups related metrics together in a card with consistent styling.
 * 
 * Usage:
 * ```tsx
 * <ResourcePoolCard
 *   title="Automation"
 *   description="Your automation resources"
 *   icon={Zap}
 *   items={[
 *     { label: "Gateways", current: 3, limit: 5, icon: Server },
 *     { label: "Workflows", current: 10, limit: 25, icon: GitBranch },
 *   ]}
 * />
 * ```
 * 
 * @module components/resources/resource-pool-card
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ResourceItemBar, type ResourceItemBarProps, type WarningLevel } from "./resource-item-bar";

export interface ResourcePoolItem extends Omit<ResourceItemBarProps, "size" | "className"> {
  /** Unique key for the item */
  key?: string;
}

export interface ResourcePoolCardProps {
  /** Pool title (e.g., "Automation", "Workspace", "Billing") */
  title: string;
  /** Pool description */
  description?: string;
  /** Pool icon */
  icon?: LucideIcon;
  /** Resource items to display */
  items: ResourcePoolItem[];
  /** Show pool as collapsed (only header) */
  collapsed?: boolean;
  /** Additional actions (buttons, links) */
  actions?: React.ReactNode;
  /** Badge to show (e.g., "PRO", "ENTERPRISE") */
  badge?: string;
  /** Badge variant */
  badgeVariant?: "default" | "secondary" | "outline" | "destructive";
  /** Additional class names */
  className?: string;
  /** Size of progress bars */
  size?: "sm" | "md" | "lg";
  /** Grid columns for items */
  columns?: 1 | 2 | 3;
}

// Calculate the highest warning level from all items
function getPoolWarningLevel(items: ResourcePoolItem[]): WarningLevel {
  let highest: WarningLevel = "normal";
  
  for (const item of items) {
    if (item.limit === null || item.limit === -1) continue;
    const percentage = (item.current / item.limit) * 100;
    
    if (percentage >= 100) return "blocked"; // Highest possible, return immediately
    if (percentage >= 95) highest = "critical";
    else if (percentage >= 80 && highest === "normal") highest = "warning";
  }
  
  return highest;
}

// Get border color based on warning level
function getPoolBorderClass(level: WarningLevel): string {
  switch (level) {
    case "blocked":
      return "border-red-500/50";
    case "critical":
      return "border-orange-500/50";
    case "warning":
      return "border-yellow-500/50";
    default:
      return "border-border";
  }
}

// Get icon background color based on warning level
function getIconBgClass(level: WarningLevel): string {
  switch (level) {
    case "blocked":
      return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    case "critical":
      return "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400";
    case "warning":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400";
    default:
      return "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400";
  }
}

export function ResourcePoolCard({
  title,
  description,
  icon: Icon,
  items,
  collapsed = false,
  actions,
  badge,
  badgeVariant = "secondary",
  className,
  size = "md",
  columns = 2,
}: ResourcePoolCardProps) {
  const warningLevel = getPoolWarningLevel(items);
  const borderClass = getPoolBorderClass(warningLevel);
  const iconBgClass = getIconBgClass(warningLevel);

  const gridClass = columns === 1 
    ? "grid-cols-1" 
    : columns === 3 
      ? "grid-cols-1 md:grid-cols-3"
      : "grid-cols-1 md:grid-cols-2";

  return (
    <Card className={cn("bg-card/50", borderClass, className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                iconBgClass
              )}>
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{title}</CardTitle>
                {badge && (
                  <Badge variant={badgeVariant} className="text-xs">
                    {badge}
                  </Badge>
                )}
              </div>
              {description && (
                <CardDescription className="mt-0.5">{description}</CardDescription>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2">{actions}</div>
          )}
        </div>
      </CardHeader>

      {!collapsed && items.length > 0 && (
        <CardContent className="pt-0">
          <div className={cn("grid gap-4", gridClass)}>
            {items.map((item, index) => (
              <ResourceItemBar
                key={item.key ?? item.label ?? index}
                {...item}
                size={size}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
