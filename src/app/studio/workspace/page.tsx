"use client";

import { WorkspaceContent } from "@/app/(dashboard)/workspace/page";
import { StudioPageShell } from "@/components/studio/studio-page-shell";

export default function StudioWorkspacePage() {
  return (
    <StudioPageShell>
      <WorkspaceContent />
    </StudioPageShell>
  );
}
