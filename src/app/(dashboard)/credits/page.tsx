import { Metadata } from "next";
import { CreditsDashboardClient } from "./client";

export const metadata: Metadata = {
  title: "Credits | 2Bot Dashboard",
  description: "Manage your credits - the universal currency of 2Bot",
};

/**
 * Personal Credits Dashboard Page
 *
 * Displays the user's credit balance, transaction history,
 * usage breakdown, and purchase options.
 *
 * Credits are the universal currency of 2Bot:
 * - AI usage (2Bot AI)
 * - Marketplace purchases
 * - Premium features
 *
 * Server component that renders the client dashboard.
 */
export default function CreditsPage() {
  return <CreditsDashboardClient />;
}
