"use client";

import { SettingsContent } from "@/app/(dashboard)/settings/page";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioSettingsPage() {
  return (
    <StudioPageShell>
      <SettingsContent />
    </StudioPageShell>
  );
}
