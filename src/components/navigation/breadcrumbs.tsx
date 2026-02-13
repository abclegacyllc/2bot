"use client";

/**
 * Breadcrumbs Component
 *
 * GitHub-style breadcrumb navigation showing page hierarchy.
 * Replaces back buttons with contextual navigation links.
 *
 * Pattern: `Parent / Child / Current`
 * - Parent segments are clickable links
 * - Current page is displayed as non-clickable text
 *
 * @module components/navigation/breadcrumbs
 */

import Link from "next/link";

export interface BreadcrumbItem {
  /** Display label for this breadcrumb segment */
  label: string;
  /** Link destination for this segment */
  href: string;
}

interface BreadcrumbsProps {
  /** Parent page segments — each rendered as a clickable link */
  items: BreadcrumbItem[];
  /** Current page label (rendered as non-clickable text) */
  current: string;
  /** Additional className */
  className?: string;
}

/**
 * Renders a GitHub-style breadcrumb trail.
 *
 * @example
 * // Single parent
 * <Breadcrumbs
 *   items={[{ label: "Billing", href: "/billing" }]}
 *   current="Upgrade Plan"
 * />
 * // Renders: Billing / Upgrade Plan
 *
 * @example
 * // Multiple parents
 * <Breadcrumbs
 *   items={[
 *     { label: "Departments", href: "/org/departments" },
 *     { label: "Engineering", href: "/org/departments/eng" },
 *   ]}
 *   current="Quotas"
 * />
 * // Renders: Departments / Engineering / Quotas
 */
export function Breadcrumbs({
  items,
  current,
  className = "",
}: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1.5 text-sm ${className}`}
    >
      {items.map((item, index) => (
        <span key={item.href} className="flex items-center gap-1.5">
          {index > 0 && (
            <span className="text-muted-foreground/50 select-none">/</span>
          )}
          <Link
            href={item.href}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {item.label}
          </Link>
        </span>
      ))}
      <span className="text-muted-foreground/50 select-none">/</span>
      <span className="text-foreground font-medium truncate">{current}</span>
    </nav>
  );
}
