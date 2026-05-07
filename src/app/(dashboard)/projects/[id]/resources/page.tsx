import { permanentRedirect } from "next/navigation";

/**
 * Legacy `/projects/[id]/resources` → permanent redirect (308) to
 * `/studio/[id]/resources` (the unified Studio Resources tab).
 */
export default async function LegacyProjectResourcesRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/studio/${id}/resources`);
}
