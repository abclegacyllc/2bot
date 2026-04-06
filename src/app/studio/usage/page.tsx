"use client";

import { UsageDashboardV2Client } from "@/app/(dashboard)/usage/client-v2";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioUsagePage() {
  return (
    <StudioPageShell>
      <UsageDashboardV2Client />
    </StudioPageShell>
  );
}
