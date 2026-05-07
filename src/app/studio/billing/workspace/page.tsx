import { permanentRedirect } from "next/navigation";

// Phase 1 — Unified Studio: redirect legacy bookmark to canonical dashboard URL.
export default function StudioBillingWorkspaceRedirect() {
  permanentRedirect("/billing/workspace");
}
