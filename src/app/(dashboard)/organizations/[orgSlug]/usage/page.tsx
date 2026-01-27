import { Metadata } from "next";
import { OrgUsageDashboardClient } from "./client";

export const metadata: Metadata = {
  title: "Organization Usage | 2Bot Dashboard",
  description: "View organization resource usage, department breakdown, and member usage",
};

/**
 * Organization Usage Dashboard Page
 *
 * Displays the organization's resource usage, limits, and per-member breakdown.
 * The client component uses useOrganization hook to resolve slug to orgId.
 */
export default function OrgUsagePage() {
  return <OrgUsageDashboardClient />;
}
