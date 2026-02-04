import { Metadata } from "next";
import { OrgCreditsDashboardClient } from "./client";

export const metadata: Metadata = {
  title: "Organization Credits | 2Bot Dashboard",
  description: "Manage organization credits - the universal currency of 2Bot",
};

/**
 * Organization Credits Dashboard Page
 *
 * Displays the organization's credit balance, transaction history,
 * usage breakdown, and purchase options.
 *
 * Credits are the universal currency of 2Bot:
 * - AI usage (2Bot AI)
 * - Marketplace purchases
 * - Premium features
 *
 * Server component that renders the client dashboard.
 */
export default function OrgCreditsPage() {
  return <OrgCreditsDashboardClient />;
}
