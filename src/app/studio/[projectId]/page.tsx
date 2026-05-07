import { redirect } from "next/navigation";

/**
 * `/studio/[projectId]` → redirect to default tab `architecture`.
 */
export default async function ProjectStudioIndex({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/studio/${projectId}/architecture`);
}
