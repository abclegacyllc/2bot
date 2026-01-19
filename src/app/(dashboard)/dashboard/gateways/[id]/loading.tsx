/**
 * Gateway Detail Loading State
 *
 * @module app/(dashboard)/dashboard/gateways/[id]/loading
 */

import { GatewayDetailSkeleton } from "@/components/ui/loading-skeletons";

export default function GatewayDetailLoading() {
  return <GatewayDetailSkeleton />;
}
