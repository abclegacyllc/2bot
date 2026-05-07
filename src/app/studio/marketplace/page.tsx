import { permanentRedirect } from "next/navigation";

// Phase 1 — Unified Studio: dashboard is the single source of truth for the
// marketplace. This route exists only to redirect legacy bookmarks.
export default function StudioMarketplaceRedirect() {
  permanentRedirect("/marketplace");
}
