"use client";

/**
 * BackButton Component
 * 
 * Centralized back button component that automatically determines the parent route
 * based on route configuration. This ensures consistent UX across all pages.
 * 
 * @module components/navigation/back-button
 */

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Route configuration: Maps child routes to their parent routes
// This is the single source of truth for navigation hierarchy
const ROUTE_PARENTS: Record<string, { href: string; label: string }> = {
  // Billing flows - billing goes back to dashboard, not settings
  "/billing/upgrade": { href: "/billing", label: "Billing" },
  "/billing/workspace": { href: "/billing", label: "Billing" },
  "/billing": { href: "/", label: "Dashboard" },
  
  // Gateway flows
  "/gateways/create": { href: "/gateways", label: "Gateways" },
  
  // Organization flows (personal context - deprecated but kept for compatibility)
  "/organizations/create": { href: "/", label: "Dashboard" },
  "/organizations/billing/upgrade": { href: "/organizations/billing", label: "Billing" },
  "/organizations/billing/workspace": { href: "/organizations/billing", label: "Billing" },
  
  // Admin flows
  "/admin/credits/rates": { href: "/admin/credits", label: "Credits" },
  "/admin/credits/wallets": { href: "/admin/credits", label: "Credits" },
  "/admin/credits/transactions": { href: "/admin/credits", label: "Credits" },
};

/**
 * Pattern-based parent route resolution for dynamic routes
 * Returns parent route info if pattern matches
 */
function getPatternBasedParent(pathname: string): { href: string; label: string } | null {
  // Admin user detail: /admin/users/[id]
  if (pathname.match(/^\/admin\/users\/[^/]+$/)) {
    return { href: "/admin/users", label: "Users" };
  }
  
  // Admin org detail: /admin/organizations/[id]
  if (pathname.match(/^\/admin\/organizations\/[^/]+$/)) {
    return { href: "/admin/organizations", label: "Organizations" };
  }
  
  // Admin gateway detail: /admin/gateways/[id]
  if (pathname.match(/^\/admin\/gateways\/[^/]+$/)) {
    return { href: "/admin/gateways", label: "Gateways" };
  }
  
  // Gateway detail: /gateways/[id]
  if (pathname.match(/^\/gateways\/[^/]+$/)) {
    return { href: "/gateways", label: "Gateways" };
  }
  
  // Organization routes: /organizations/[orgSlug]/...
  const orgMatch = pathname.match(/^\/organizations\/([^/]+)\/(.+)$/);
  if (orgMatch && orgMatch[1] && orgMatch[2]) {
    const orgSlug = orgMatch[1];
    const subPath = orgMatch[2];
    const orgBase = `/organizations/${orgSlug}`;
    
    // Org billing flows
    if (subPath === "billing/upgrade") {
      return { href: `${orgBase}/billing`, label: "Billing" };
    }
    if (subPath === "billing/workspace") {
      return { href: `${orgBase}/billing`, label: "Billing" };
    }
    
    // Org departments
    if (subPath === "departments/create") {
      return { href: `${orgBase}/departments`, label: "Departments" };
    }
    if (subPath.match(/^departments\/[^/]+$/)) {
      return { href: `${orgBase}/departments`, label: "Departments" };
    }
    if (subPath.match(/^departments\/[^/]+\/quotas$/)) {
      const deptId = subPath.split("/")[1];
      return { href: `${orgBase}/departments/${deptId}`, label: "Department" };
    }
    
    // Org gateways
    if (subPath === "gateways/create") {
      return { href: `${orgBase}/gateways`, label: "Gateways" };
    }
    if (subPath.match(/^gateways\/[^/]+$/)) {
      return { href: `${orgBase}/gateways`, label: "Gateways" };
    }
    
    // Org employee quotas: /organizations/[orgSlug]/departments/[deptId]/employees/[employeeId]/quotas
    if (subPath.match(/^departments\/[^/]+\/employees\/[^/]+\/quotas$/)) {
      const deptId = subPath.split("/")[1];
      return { href: `${orgBase}/departments/${deptId}`, label: "Department" };
    }
  }
  
  return null;
}

interface BackButtonProps {
  /**
   * Override the automatic parent detection with a custom href
   */
  href?: string;
  
  /**
   * Override the automatic label with a custom label
   */
  label?: string;
  
  /**
   * Button variant (default: "ghost")
   */
  variant?: "ghost" | "outline" | "default";
  
  /**
   * Button size (default: "sm")
   */
  size?: "sm" | "default" | "lg";
  
  /**
   * Additional className for customization
   */
  className?: string;
  
  /**
   * Show icon (default: true)
   */
  showIcon?: boolean;
}

/**
 * BackButton Component
 * 
 * Automatically determines the parent route and renders a consistent back button.
 * Can be overridden with custom href/label when needed.
 * 
 * @example
 * // Automatic - detects parent from current route
 * <BackButton />
 * 
 * @example
 * // Custom destination
 * <BackButton href="/custom-route" label="Custom Parent" />
 * 
 * @example
 * // Different style
 * <BackButton variant="outline" size="default" />
 */
export function BackButton({
  href: customHref,
  label: customLabel,
  variant = "ghost",
  size = "sm",
  className = "",
  showIcon = true,
}: BackButtonProps) {
  const pathname = usePathname();
  
  // Use custom href/label if provided, otherwise auto-detect
  let parentHref = customHref;
  let parentLabel = customLabel;
  
  if (!customHref || !customLabel) {
    // Try exact match first
    const exactMatch = ROUTE_PARENTS[pathname];
    
    if (exactMatch) {
      parentHref = parentHref || exactMatch.href;
      parentLabel = parentLabel || exactMatch.label;
    } else {
      // Try pattern-based matching for dynamic routes
      const patternMatch = getPatternBasedParent(pathname);
      if (patternMatch) {
        parentHref = parentHref || patternMatch.href;
        parentLabel = parentLabel || patternMatch.label;
      }
    }
  }
  
  // Don't render if we couldn't determine parent route
  if (!parentHref || !parentLabel) {
    return null;
  }
  
  return (
    <Link href={parentHref}>
      <Button 
        variant={variant} 
        size={size} 
        className={`text-muted-foreground hover:text-foreground ${className}`}
      >
        {showIcon ? <ArrowLeft className="mr-2 h-4 w-4" /> : null}
        Back to {parentLabel}
      </Button>
    </Link>
  );
}

/**
 * Hook to get parent route info
 * Useful when you need the parent route info but want to render custom UI
 */
export function useParentRoute(): { href: string; label: string } | null {
  const pathname = usePathname();
  
  // Try exact match first
  const exactMatch = ROUTE_PARENTS[pathname];
  if (exactMatch) return exactMatch;
  
  // Try pattern-based matching
  return getPatternBasedParent(pathname);
}
