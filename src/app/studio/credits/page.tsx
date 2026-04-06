"use client";

import { CreditsDashboardClient } from "@/app/(dashboard)/credits/client";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioCreditsPage() {
  return (
    <StudioPageShell>
      <CreditsDashboardClient />
    </StudioPageShell>
  );
}
