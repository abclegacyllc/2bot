import { permanentRedirect } from "next/navigation";

// Phase 1 — Unified Studio: redirect legacy bookmark to canonical dashboard URL.
export default async function StudioMarketplaceDetailRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/marketplace/${slug}`);
}
