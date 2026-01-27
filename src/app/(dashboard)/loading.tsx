/**
 * Dashboard Loading State
 *
 * Automatic loading UI shown while the dashboard page is loading.
 * Uses skeleton components for smooth loading experience.
 *
 * @module app/(dashboard)/dashboard/loading
 */

import { DashboardSkeleton } from "@/components/ui/loading-skeletons";

export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
