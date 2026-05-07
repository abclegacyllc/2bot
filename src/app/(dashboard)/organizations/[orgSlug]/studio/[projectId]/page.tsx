import { redirect } from "next/navigation";

export default async function OrgProjectStudioIndex({
  params,
}: {
  params: Promise<{ orgSlug: string; projectId: string }>;
}) {
  const { orgSlug, projectId } = await params;
  redirect(`/organizations/${orgSlug}/studio/${projectId}/architecture`);
}
