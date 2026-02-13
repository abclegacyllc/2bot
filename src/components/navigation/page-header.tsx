"use client";

/**
 * PageHeader Component
 *
 * Standardized page header with GitHub-style breadcrumb navigation,
 * title, description, and actions. Uses breadcrumbs instead of back buttons
 * for contextual parent-page navigation.
 *
 * @module components/navigation/page-header
 */

import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

interface PageHeaderProps {
  /** Page title */
  title: string;

  /** Optional page description/subtitle */
  description?: ReactNode;

  /**
   * Breadcrumb navigation segments (parent pages).
   * Shows a GitHub-style `Parent / Current` trail above the title.
   * Each segment is a clickable link. The title is appended as the current page.
   */
  breadcrumbs?: BreadcrumbItem[];

  /** Action buttons rendered on the right side of the header */
  actions?: ReactNode;

  /** Icon to show before title */
  icon?: ReactNode;

  /** Additional className for customization */
  className?: string;

  /** Badge to show next to title (e.g., plan type, status) */
  badge?: ReactNode;
}

/**
 * PageHeader Component
 *
 * Standard page header that includes:
 * - GitHub-style breadcrumb navigation (replaces back buttons)
 * - Title with optional icon
 * - Description
 * - Action buttons
 *
 * @example
 * // Sidebar-level page (no breadcrumbs)
 * <PageHeader
 *   title="Gateways"
 *   description="Manage your Telegram bots"
 * />
 *
 * @example
 * // Sub-page with breadcrumbs
 * <PageHeader
 *   title="Create Gateway"
 *   description="Connect a new Telegram bot"
 *   breadcrumbs={[{ label: "Gateways", href: "/gateways" }]}
 * />
 *
 * @example
 * // Deep sub-page with multiple breadcrumb segments
 * <PageHeader
 *   title="Quotas"
 *   breadcrumbs={[
 *     { label: "Departments", href: "/org/departments" },
 *     { label: "Engineering", href: "/org/departments/eng" },
 *   ]}
 * />
 *
 * @example
 * // With icon, badge, and actions
 * <PageHeader
 *   title="Upgrade Plan"
 *   icon={<CreditCard className="h-8 w-8 text-blue-400" />}
 *   badge={<Badge>Current: Free</Badge>}
 *   breadcrumbs={[{ label: "Billing", href: "/billing" }]}
 *   actions={<Button>Compare Plans</Button>}
 * />
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  icon,
  className = "",
  badge,
}: PageHeaderProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Breadcrumb Navigation */}
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} current={title} /> : null}

      {/* Title and Actions Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {icon ? <div className="flex-shrink-0 mt-1">
              {icon}
            </div> : null}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-foreground">
                {title}
              </h1>
              {badge ? <div className="flex-shrink-0">{badge}</div> : null}
            </div>

            {description ? <p className="text-muted-foreground mt-1">
                {description}
              </p> : null}
          </div>
        </div>

        {actions ? <div className="flex-shrink-0">
            {actions}
          </div> : null}
      </div>
    </div>
  );
}

/**
 * Compact version of PageHeader for smaller spaces or modals
 */
export function CompactPageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className = "",
}: Omit<PageHeaderProps, "icon" | "badge">) {
  return (
    <div className={`space-y-2 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} current={title} /> : null}

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-foreground">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground mt-1">
              {description}
            </p> : null}
        </div>

        {actions ? <div className="flex-shrink-0">
            {actions}
          </div> : null}
      </div>
    </div>
  );
}
