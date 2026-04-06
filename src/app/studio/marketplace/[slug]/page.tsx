"use client";

import { MarketplaceDetailContent } from "@/app/(dashboard)/marketplace/[slug]/page";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioMarketplaceDetailPage() {
  return (
    <StudioPageShell>
      <MarketplaceDetailContent basePath="/studio/marketplace" />
    </StudioPageShell>
  );
}
