import { permanentRedirect } from "next/navigation";

/**
 * Legacy `/projects/[id]/versions` → 308 to the unified Studio Versions tab.
 */
export default async function LegacyProjectVersionsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/studio/${id}/versions`);
}
