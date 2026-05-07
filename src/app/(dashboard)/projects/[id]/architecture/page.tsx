import { permanentRedirect } from "next/navigation";

/**
 * Legacy `/projects/[id]/architecture` → 308 to the unified Studio
 * Architecture tab.
 */
export default async function LegacyProjectArchitectureRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/studio/${id}/architecture`);
}
