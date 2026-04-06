"use client";

import { InstalledPluginsContent } from "@/app/(dashboard)/marketplace/installed/page";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioInstalledPluginsPage() {
  return (
    <StudioPageShell>
      <InstalledPluginsContent basePath="/studio/marketplace" />
    </StudioPageShell>
  );
}
