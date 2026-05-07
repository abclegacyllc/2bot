import { permanentRedirect } from "next/navigation";

/**
 * Legacy `/projects/[id]` → permanent redirect (308) to `/studio/[id]`
 * (the unified Studio, which itself redirects to the Architecture tab).
 */
export default async function LegacyProjectDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/studio/${id}`);
}
