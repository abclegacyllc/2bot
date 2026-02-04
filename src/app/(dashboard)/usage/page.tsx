import { Metadata } from "next";
import { UsageDashboardV2Client } from "./client-v2";

export const metadata: Metadata = {
  title: "Usage | 2Bot Dashboard",
  description: "View your resource usage and plan limits",
};

/**
 * User Usage Dashboard Page
 *
 * Displays the current user's resource usage, limits, and history.
 * Uses new hierarchical resource types (Phase 3 migration).
 * Server component that renders the client dashboard.
 */
export default function UsagePage() {
  return <UsageDashboardV2Client />;
}
