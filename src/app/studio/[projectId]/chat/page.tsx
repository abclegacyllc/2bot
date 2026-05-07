/**
 * Studio › Chat tab — REMOVED in favor of the persistent CursorStudioBar.
 *
 * The Cursor panel on the left of every Studio route is the canonical chat
 * surface. The earlier standalone chat-to-BuildSpec page (using
 * `ArchitectureChatPanel`) duplicated that surface and confused the UX.
 *
 * Until the BuildSpec flow is unified into a `"build"` mode of CursorPanel
 * (planned alongside `"agent" | "ask" | "plan"`), this route 308-redirects to
 * Architecture, where the BuildSpec drawer can still be opened from the
 * topology view.
 *
 * @module app/studio/[projectId]/chat/page
 */

import { permanentRedirect } from "next/navigation";

export default async function ChatTabRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  permanentRedirect(`/studio/${projectId}/architecture`);
}
