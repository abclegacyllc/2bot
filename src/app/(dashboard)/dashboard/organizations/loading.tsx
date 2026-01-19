/**
 * Organizations Page Loading State
 *
 * @module app/(dashboard)/dashboard/organizations/loading
 */

import { OrganizationListSkeleton } from "@/components/ui/loading-skeletons";

export default function OrganizationsLoading() {
  return <OrganizationListSkeleton />;
}
