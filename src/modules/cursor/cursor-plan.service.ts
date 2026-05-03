/**
 * Cursor Chat Plan Service
 *
 * Persists exactly ONE plan per chat thread (userId + chatThreadId).
 * Produced by the Plan agent via the `update_plan` tool's `summary` field;
 * loaded by the implementation Agent on hand-off so plans survive across runs.
 *
 * This replaces the hallucinated `/memories/session/plan.md` referenced by the
 * old Plan-agent prompt with a real, retrievable artifact.
 *
 * @module modules/cursor/cursor-plan.service
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const MAX_MARKDOWN_LENGTH = 20_000;

export interface ChatPlan {
  markdown: string | null;
  items: PlanItem[];
  authorAgent: string | null;
  updatedAt: Date;
}

export interface PlanItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
}

/**
 * Upsert the chat plan. Pass `markdown` and/or `items`; only provided fields
 * are written.
 */
export async function upsertChatPlan(args: {
  userId: string;
  chatThreadId: string;
  markdown?: string | null;
  items?: PlanItem[] | null;
  authorAgent?: string;
}): Promise<void> {
  const { userId, chatThreadId, authorAgent } = args;

  let markdown: string | null | undefined = args.markdown;
  if (typeof markdown === "string" && markdown.length > MAX_MARKDOWN_LENGTH) {
    markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH);
  }
  const items = args.items ?? undefined;

  // Build update payload only including supplied fields so partial writes don't clobber siblings
  const updateData: Prisma.CursorChatPlanUpdateInput = {};
  if (markdown !== undefined) updateData.markdown = markdown;
  if (items !== undefined) updateData.items = items as unknown as Prisma.InputJsonValue;
  if (authorAgent !== undefined) updateData.authorAgent = authorAgent;

  await prisma.cursorChatPlan.upsert({
    where: { userId_chatThreadId: { userId, chatThreadId } },
    create: {
      userId,
      chatThreadId,
      markdown: markdown ?? null,
      items: items === undefined ? Prisma.JsonNull : (items as unknown as Prisma.InputJsonValue),
      authorAgent: authorAgent ?? null,
    },
    update: updateData,
  });
}

/**
 * Load the chat plan for this thread, or null if none exists.
 */
export async function getChatPlan(userId: string, chatThreadId: string): Promise<ChatPlan | null> {
  const row = await prisma.cursorChatPlan.findUnique({
    where: { userId_chatThreadId: { userId, chatThreadId } },
    select: { markdown: true, items: true, authorAgent: true, updatedAt: true },
  });
  if (!row) return null;
  return {
    markdown: row.markdown ?? null,
    items: Array.isArray(row.items) ? (row.items as unknown as PlanItem[]) : [],
    authorAgent: row.authorAgent ?? null,
    updatedAt: row.updatedAt,
  };
}

/**
 * Render a chat plan as a system-prompt section. Returns null when nothing to inject.
 */
export function formatChatPlanForPrompt(plan: ChatPlan | null): string | null {
  if (!plan) return null;
  if (!plan.markdown && plan.items.length === 0) return null;

  const lines: string[] = [];
  lines.push("The Plan agent has produced the following plan for this chat thread.");
  lines.push("Treat it as authoritative scope unless the user explicitly revises it.");
  if (plan.markdown) {
    lines.push("");
    lines.push(plan.markdown.trim());
  }
  if (plan.items.length > 0) {
    lines.push("");
    lines.push("**Checklist**");
    for (const item of plan.items) {
      const box = item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[~]" : "[ ]";
      lines.push(`- ${box} ${item.title}`);
    }
  }
  return lines.join("\n");
}
