"use client";

import { BillingContent } from "@/app/(dashboard)/billing/page";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioBillingPage() {
  return (
    <StudioPageShell>
      <BillingContent basePath="/studio/billing" />
    </StudioPageShell>
  );
}
