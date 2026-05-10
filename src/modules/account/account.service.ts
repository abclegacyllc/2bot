/**
 * Account Service — GDPR data export, soft-delete, and anonymization
 * (Wave 2.2).
 *
 * Three flows:
 *
 *   1. **Export** (`exportUserData`) — collects everything the platform
 *      stores about one user across the user-tied tables and emits it as
 *      a stream of JSONL chunks (one per row, prefixed with the table
 *      name). Memory-bounded by Prisma cursor pagination, so accounts of
 *      any size export without OOMing the API. The route handler can
 *      stream the resulting iterator straight to the client.
 *
 *   2. **Soft delete** (`requestDeletion` / `cancelDeletion`) — sets
 *      `deletedAt` and `deletionScheduledFor` (= now + 30d) on the user
 *      row. Until that scheduled date the user can recover the account
 *      via `cancelDeletion`. After it elapses, a cron (separate, not
 *      part of this service) calls `anonymizeUser` to scrub PII.
 *
 *   3. **Anonymize** (`anonymizeUser`) — idempotent terminal step. Nulls
 *      / replaces every PII field on the User row, drops Sessions and
 *      MFA artefacts, and stamps `anonymizedAt`. The row is retained as
 *      a tombstone so FKs from Subscription, AuditLog, etc. don't break
 *      and so the billing audit trail is still complete.
 *
 * The set of tables walked in `exportUserData` is hand-maintained from
 * the Prisma schema (every model with a `userId` FK as of 2026-05-08).
 * Adding a new user-scoped model means adding it to `EXPORT_TABLES`.
 *
 * @module modules/account
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

const accountLogger = logger.child({ module: "account" });

/** Days a soft-deleted account stays recoverable before anonymization runs. */
export const DELETION_GRACE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * One JSONL chunk: a single row of one user-tied table, plus the table
 * name so the consumer can demultiplex. Streamed instead of buffered so
 * accounts with hundreds of MB of data don't blow the API's heap.
 */
export interface ExportRow {
  table: string;
  row: unknown;
}

/**
 * Hand-maintained list of every Prisma model that holds a row tied to a
 * single User by a `userId` field. The export iterates each in order.
 *
 * If you add a model with `userId`, add it here too — there's no DMMF
 * runtime walk because we want explicit reviewable coverage. The
 * `account.service.test.ts` file has a smoke test that checks each name
 * here is a valid Prisma delegate.
 */
export const EXPORT_TABLES: readonly Prisma.ModelName[] = [
  "User",
  "Session",
  "Subscription",
  "AIUsage",
  "AgentSession",
  "AuditLog",
  "BuildSpecRun",
  "CreditWallet",
  "CursorAgentMemory",
  "CursorChatPlan",
  "CursorUserPreference",
  "DepartmentMember",
  "Gateway",
  "MCPServerConfig",
  "MemberAllocation",
  "Membership",
  "PluginReview",
  "Project",
  "ProjectResource",
  "SupportTicket",
  "UsageHistory",
  "UserPlugin",
  "Workflow",
  "WorkspaceAllowedDomain",
  "WorkspaceContainer",
  // Intentionally omitted from export:
  //   PasswordResetToken — short-lived, no value to export
  //   SupportAICost      — internal cost accounting; not user data
  //   WorkspaceAuditLog  — admin/audit only; export via AuditLog instead
] as const;

/**
 * Map a Prisma ModelName to its lowercase delegate (e.g. "Workflow" →
 * "workflow"). The Prisma client camelCases delegate names; that's the
 * convention every existing call site in this repo uses too.
 */
function delegateFor<K extends Prisma.ModelName>(
  model: K,
): { findMany: (args: { where: { userId: string }; take: number; cursor?: { id: string }; skip?: number; orderBy: { id: "asc" } }) => Promise<Array<{ id: string }>> } {
  const key = (model.charAt(0).toLowerCase() + model.slice(1)) as keyof typeof prisma;
  return prisma[key] as unknown as ReturnType<typeof delegateFor<K>>;
}

const EXPORT_PAGE_SIZE = 200;

class AccountService {
  // ============================================================
  // Export
  // ============================================================

  /**
   * Stream every user-tied row across `EXPORT_TABLES` as a sequence of
   * `{table, row}` chunks. Walks each table page-by-page using cursor
   * pagination, so memory is O(EXPORT_PAGE_SIZE) regardless of total
   * row count.
   *
   * Caveat: the User row itself is special-cased to be the first chunk
   * — that gives consumers an easy way to spot the right account in
   * the JSONL.
   */
  async *exportUserData(userId: string): AsyncIterable<ExportRow> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    yield { table: "User", row: stripPasswordHash(user) };

    for (const tableName of EXPORT_TABLES) {
      if (tableName === "User") continue; // already yielded
      yield* this.streamTableForUser(tableName, userId);
    }
  }

  private async *streamTableForUser(
    tableName: Prisma.ModelName,
    userId: string,
  ): AsyncIterable<ExportRow> {
    const delegate = delegateFor(tableName);
    let cursor: { id: string } | undefined;

    while (true) {
      const page: Array<{ id: string }> = await delegate.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor, skip: 1 } : {}),
      });

      for (const row of page) {
        yield { table: tableName, row };
      }

      if (page.length < EXPORT_PAGE_SIZE) break;
      const last = page[page.length - 1];
      if (!last) break;
      cursor = { id: last.id };
    }
  }

  // ============================================================
  // Soft delete + grace window
  // ============================================================

  /**
   * Mark an account for deletion. Sets `deletedAt` to now and
   * `deletionScheduledFor` to now + 30 days. The user can call
   * `cancelDeletion` any time before the scheduled date to undo.
   *
   * Idempotent: requesting again on an already-pending account is a
   * no-op (returns the existing scheduled date).
   */
  async requestDeletion(userId: string): Promise<{ scheduledFor: Date }> {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, deletionScheduledFor: true, anonymizedAt: true },
    });
    if (!existing) {
      throw new Error(`User ${userId} not found`);
    }
    if (existing.anonymizedAt) {
      throw new Error("Account is already anonymized; nothing to delete.");
    }
    if (existing.deletedAt && existing.deletionScheduledFor) {
      return { scheduledFor: existing.deletionScheduledFor };
    }

    const now = new Date();
    const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * MS_PER_DAY);

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: now,
        deletionScheduledFor: scheduledFor,
        // Marking inactive immediately blocks login during the grace
        // window — the account isn't usable until cancelDeletion runs.
        isActive: false,
      },
    });

    accountLogger.info({ userId, scheduledFor }, "Account deletion scheduled");
    return { scheduledFor };
  }

  /**
   * Reverse a pending soft-deletion. Only valid before
   * `deletionScheduledFor` and before `anonymizedAt`. Restores
   * `isActive=true` and clears the scheduling fields.
   */
  async cancelDeletion(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledFor: true, anonymizedAt: true },
    });
    if (!user) throw new Error(`User ${userId} not found`);
    if (user.anonymizedAt) {
      throw new Error("Account is already anonymized; cannot be restored.");
    }
    if (!user.deletionScheduledFor) {
      // No deletion in flight — nothing to cancel.
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: null,
        deletionScheduledFor: null,
        isActive: true,
      },
    });

    accountLogger.info({ userId }, "Account deletion cancelled");
  }

  // ============================================================
  // Anonymize (terminal step — called by cron, not by user)
  // ============================================================

  /**
   * Replace every PII field on the user row with a deterministic
   * placeholder, drop active sessions, and stamp `anonymizedAt`.
   *
   * Idempotent — calling on an already-anonymized user is a no-op.
   *
   * What stays:
   *   - The `id` (referenced by Subscription, AuditLog, billing)
   *   - `createdAt` / `updatedAt`
   *   - The Subscription row (Stripe + tax compliance)
   *   - AuditLog rows (security & compliance)
   *
   * What gets cleared:
   *   - email → `deleted-{id}@example.invalid`
   *   - name, image → null
   *   - passwordHash → empty (login impossible)
   *   - all MFA fields (totpSecret, totpEnabledAt, totpRecoveryCodes)
   *   - all Session rows (forced logout everywhere)
   *   - PasswordResetToken rows (no point keeping them)
   */
  async anonymizeUser(userId: string): Promise<{ alreadyAnonymized: boolean }> {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { anonymizedAt: true },
    });
    if (!existing) throw new Error(`User ${userId} not found`);
    if (existing.anonymizedAt) {
      return { alreadyAnonymized: true };
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.passwordResetToken.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@example.invalid`,
          name: null,
          image: null,
          passwordHash: "",
          totpSecret: null,
          totpEnabledAt: null,
          totpRecoveryCodes: [],
          anonymizedAt: now,
          isActive: false,
        },
      }),
    ]);

    accountLogger.info({ userId, anonymizedAt: now }, "Account anonymized");
    return { alreadyAnonymized: false };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function stripPasswordHash<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash"> {

  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

export const accountService = new AccountService();
export { AccountService };
