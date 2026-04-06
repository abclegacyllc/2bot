"use client";

import { MarketplaceContent } from "@/app/(dashboard)/marketplace/page";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioMarketplacePage() {
  return (
    <StudioPageShell>
      <MarketplaceContent basePath="/studio/marketplace" />
    </StudioPageShell>
  );
}
