import { Metadata } from "next";
import { OrgUsageDashboardV2Client } from "./client-v2";

export const metadata: Metadata = {
  title: "Organization Usage | 2Bot Dashboard",
  description: "View organization resource usage, department breakdown, and member usage",
};

/**
 * Organization Usage Dashboard Page
 *
 * Displays the organization's resource usage, limits, and per-member breakdown.
 * Uses new hierarchical resource types (Phase 3 migration).
 * The client component uses useOrganization hook to resolve slug to orgId.
 */
export default function OrgUsagePage() {
  return <OrgUsageDashboardV2Client />;
}
