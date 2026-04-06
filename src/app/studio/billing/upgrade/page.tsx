"use client";

import { UpgradeContent } from "@/app/(dashboard)/billing/upgrade/page";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioUpgradePage() {
  return (
    <StudioPageShell>
      <UpgradeContent />
    </StudioPageShell>
  );
}
