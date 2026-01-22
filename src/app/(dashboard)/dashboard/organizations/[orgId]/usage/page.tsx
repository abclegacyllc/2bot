import { Metadata } from "next";
import { OrgUsageDashboardClient } from "./client";

export const metadata: Metadata = {
  title: "Organization Usage | 2Bot Dashboard",
  description: "View organization resource usage, department breakdown, and member usage",
};

interface OrgUsagePageProps {
  params: Promise<{ orgId: string }>;
}

/**
 * Organization Usage Dashboard Page
 *
 * Displays the organization's resource usage, limits, and per-member breakdown.
 * Server component that renders the client dashboard.
 */
export default async function OrgUsagePage({ params }: OrgUsagePageProps) {
  const { orgId } = await params;
  return <OrgUsageDashboardClient orgId={orgId} />;
}
