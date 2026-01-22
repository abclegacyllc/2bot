import { Metadata } from "next";
import { UsageDashboardClient } from "./client";

export const metadata: Metadata = {
  title: "Usage | 2Bot Dashboard",
  description: "View your resource usage and plan limits",
};

/**
 * User Usage Dashboard Page
 *
 * Displays the current user's resource usage, limits, and history.
 * Server component that renders the client dashboard.
 */
export default function UsagePage() {
  return <UsageDashboardClient />;
}
