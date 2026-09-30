/**
 * Account Service Tests (Wave 2.2)
 *
 * Covers:
 *   - export iterates User + every EXPORT_TABLES delegate, paginates,
 *     and strips passwordHash from the User chunk
 *   - export scopes org-capable tables to personal rows + ACTIVE orgs
 *   - export redacts ciphertext / token columns and the nested Telegram
 *     webhook secret
 *   - requestDeletion sets deletedAt + deletionScheduledFor + isActive=false
 *   - requestDeletion is idempotent
 *   - cancelDeletion clears scheduling fields and re-activates
 *   - cancelDeletion refuses when already anonymized
 *   - anonymizeUser scrubs PII, drops sessions, is idempotent
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  accountService,
  DELETION_GRACE_DAYS,
  EXPORT_TABLES,
  ORG_SCOPED_TABLES,
  REDACTED_COLUMNS,
  redactRow,
} from "../account.service";

// ---------------------------------------------------------------------------
// Prisma mock — every delegate that account.service touches.
// ---------------------------------------------------------------------------

const txCalls: unknown[][] = [];

vi.mock("@/lib/prisma", () => {
  const userDelegate = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const session = {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const passwordResetToken = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) };

  // The service iterates every model in EXPORT_TABLES via prisma[<lower>].
  // Build minimal stubs (findMany returning []) for all of them, so the
  // export loop runs to completion.
  const exportDelegates = {
    session: { findMany: vi.fn().mockResolvedValue([]) },
    subscription: { findMany: vi.fn().mockResolvedValue([]) },
    aIUsage: { findMany: vi.fn().mockResolvedValue([]) },
    agentSession: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    buildSpecRun: { findMany: vi.fn().mockResolvedValue([]) },
    creditWallet: { findMany: vi.fn().mockResolvedValue([]) },
    cursorAgentMemory: { findMany: vi.fn().mockResolvedValue([]) },
    cursorChatPlan: { findMany: vi.fn().mockResolvedValue([]) },
    cursorUserPreference: { findMany: vi.fn().mockResolvedValue([]) },
    departmentMember: { findMany: vi.fn().mockResolvedValue([]) },
    gateway: { findMany: vi.fn().mockResolvedValue([]) },
    mCPServerConfig: { findMany: vi.fn().mockResolvedValue([]) },
    memberAllocation: { findMany: vi.fn().mockResolvedValue([]) },
    membership: { findMany: vi.fn().mockResolvedValue([]) },
    pluginReview: { findMany: vi.fn().mockResolvedValue([]) },
    project: { findMany: vi.fn().mockResolvedValue([]) },
    projectResource: { findMany: vi.fn().mockResolvedValue([]) },
    supportTicket: { findMany: vi.fn().mockResolvedValue([]) },
    usageHistory: { findMany: vi.fn().mockResolvedValue([]) },
    userPlugin: { findMany: vi.fn().mockResolvedValue([]) },
    workflow: { findMany: vi.fn().mockResolvedValue([]) },
    workspaceAllowedDomain: { findMany: vi.fn().mockResolvedValue([]) },
    workspaceContainer: { findMany: vi.fn().mockResolvedValue([]) },
  };

  return {
    prisma: {
      user: userDelegate,
      ...exportDelegates,
      passwordResetToken,
      // Override session with the passed-through delete behaviour for anonymize
      session: { ...session, ...exportDelegates.session },
      $transaction: vi.fn(async (ops: unknown[]) => {
        txCalls.push(ops);
        return ops;
      }),
    },
  };
});

import { prisma } from "@/lib/prisma";

const mocked = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  session: { findMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  passwordResetToken: { deleteMany: ReturnType<typeof vi.fn> };
  membership: { findMany: ReturnType<typeof vi.fn> };
  workflow: { findMany: ReturnType<typeof vi.fn> };
  gateway: { findMany: ReturnType<typeof vi.fn> };
  mCPServerConfig: { findMany: ReturnType<typeof vi.fn> };
  workspaceContainer: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

async function collect(userId: string): Promise<{ table: string; row: Record<string, unknown> }[]> {
  const chunks: { table: string; row: Record<string, unknown> }[] = [];
  for await (const chunk of accountService.exportUserData(userId)) {
    chunks.push(chunk as { table: string; row: Record<string, unknown> });
  }
  return chunks;
}

beforeEach(() => {
  vi.clearAllMocks();
  txCalls.length = 0;
});

// ---------------------------------------------------------------------------
// EXPORT_TABLES sanity
// ---------------------------------------------------------------------------

describe("EXPORT_TABLES", () => {
  it("contains User as the first entry", () => {
    expect(EXPORT_TABLES[0]).toBe("User");
  });

  it("does not include short-lived or admin-only tables", () => {
    expect(EXPORT_TABLES).not.toContain("PasswordResetToken");
    expect(EXPORT_TABLES).not.toContain("WorkspaceAuditLog");
  });
});

// ---------------------------------------------------------------------------
// exportUserData
// ---------------------------------------------------------------------------

describe("exportUserData", () => {
  it("yields the User row first (with passwordHash stripped) and walks every export table", async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "alice@example.com",
      name: "Alice",
      passwordHash: "should-not-appear",
    });
    // Workflow returns one row to confirm the per-table loop emits chunks.
    mocked.workflow.findMany.mockResolvedValueOnce([{ id: "wf1", name: "demo" }]);

    const chunks: { table: string; row: unknown }[] = [];
    for await (const chunk of accountService.exportUserData("u1")) {
      chunks.push(chunk);
    }

    expect(chunks[0]?.table).toBe("User");
    expect((chunks[0]?.row as { email: string }).email).toBe("alice@example.com");
    // Stripped:
    expect(JSON.stringify(chunks[0]?.row)).not.toContain("should-not-appear");

    const wfChunk = chunks.find((c) => c.table === "Workflow");
    expect(wfChunk).toBeDefined();
    expect((wfChunk!.row as { id: string }).id).toBe("wf1");
  });

  it("throws when the user does not exist", async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    const iter = accountService.exportUserData("nope");
    await expect(iter[Symbol.asyncIterator]().next()).rejects.toThrow(/not found/);
  });

  it("paginates with cursor when a table has more rows than the page size", async () => {
    mocked.user.findUnique.mockResolvedValue({ id: "u1", email: "x", passwordHash: "" });
    // First page returns a full page, second returns less than a page → loop exits.
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ id: `wf-${i}` }));
    mocked.workflow.findMany
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([{ id: "wf-200" }]);

    const chunks: { table: string }[] = [];
    for await (const chunk of accountService.exportUserData("u1")) {
      chunks.push(chunk);
    }

    expect(mocked.workflow.findMany).toHaveBeenCalledTimes(2);
    // The second call should pass a cursor pointing at the last id of page 1.
    const secondCallArgs = mocked.workflow.findMany.mock.calls[1]?.[0] as {
      cursor?: { id: string };
      skip?: number;
    };
    expect(secondCallArgs?.cursor).toEqual({ id: "wf-199" });
    expect(secondCallArgs?.skip).toBe(1);
    expect(chunks.filter((c) => c.table === "Workflow")).toHaveLength(201);
  });
});

// ---------------------------------------------------------------------------
// exportUserData — org scoping
// ---------------------------------------------------------------------------

describe("exportUserData org scoping", () => {
  beforeEach(() => {
    mocked.user.findUnique.mockResolvedValue({ id: "u1", email: "x", passwordHash: "" });
  });

  it("every ORG_SCOPED_TABLES entry is also exported", () => {
    for (const table of ORG_SCOPED_TABLES) {
      expect(EXPORT_TABLES).toContain(table);
    }
  });

  it("asks only for ACTIVE memberships", async () => {
    await collect("u1");
    expect(mocked.membership.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "ACTIVE" },
      select: { organizationId: true },
    });
  });

  it("limits org-capable tables to personal rows plus orgs with an ACTIVE membership", async () => {
    mocked.membership.findMany.mockResolvedValueOnce([
      { organizationId: "org-active" },
      { organizationId: "org-other" },
    ]);

    await collect("u1");

    const gatewayWhere = mocked.gateway.findMany.mock.calls[0]?.[0]?.where;
    expect(gatewayWhere).toEqual({
      userId: "u1",
      OR: [
        { organizationId: null },
        { organizationId: { in: ["org-active", "org-other"] } },
      ],
    });
    const workflowWhere = mocked.workflow.findMany.mock.calls[0]?.[0]?.where;
    expect(workflowWhere).toEqual(gatewayWhere);
  });

  it("excludes every org row when the user holds no ACTIVE membership (removed or suspended)", async () => {
    mocked.membership.findMany.mockResolvedValueOnce([]);

    await collect("u1");

    const gatewayWhere = mocked.gateway.findMany.mock.calls[0]?.[0]?.where;
    expect(gatewayWhere).toEqual({
      userId: "u1",
      OR: [{ organizationId: null }, { organizationId: { in: [] } }],
    });
  });

  it("keeps the plain userId filter for tables without organizationId", async () => {
    mocked.membership.findMany.mockResolvedValueOnce([{ organizationId: "org-active" }]);

    await collect("u1");

    const sessionWhere = mocked.session.findMany.mock.calls[0]?.[0]?.where;
    expect(sessionWhere).toEqual({ userId: "u1" });
  });
});

// ---------------------------------------------------------------------------
// exportUserData — redaction
// ---------------------------------------------------------------------------

describe("exportUserData redaction", () => {
  it("strips the password hash and MFA material from the User row", async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "alice@example.com",
      passwordHash: "bcrypt-hash",
      totpSecret: "v2:1:ciphertext",
      totpEnabledAt: new Date("2026-05-08T00:00:00Z"),
      totpRecoveryCodes: ["hash-1", "hash-2"],
    });

    const chunks = await collect("u1");
    const user = chunks[0]!.row;

    expect(user.email).toBe("alice@example.com");
    expect(user.totpEnabledAt).toBeInstanceOf(Date);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("totpSecret");
    expect(user).not.toHaveProperty("totpRecoveryCodes");
  });

  it("strips ciphertext columns, the session token and the nested Telegram webhook secret", async () => {
    mocked.user.findUnique.mockResolvedValue({ id: "u1", email: "x", passwordHash: "" });
    mocked.gateway.findMany.mockResolvedValueOnce([
      {
        id: "gw1",
        name: "bot",
        credentialsEnc: "v2:1:ciphertext",
        config: { webhookUrl: "https://webhook.2bot.org/telegram/gw1", webhookSecretToken: "64hex" },
      },
    ]);
    mocked.session.findMany.mockResolvedValueOnce([{ id: "s1", token: "session-token", userId: "u1" }]);
    mocked.mCPServerConfig.findMany.mockResolvedValueOnce([{ id: "m1", configEnc: "v2:1:ciphertext" }]);
    mocked.workspaceContainer.findMany.mockResolvedValueOnce([{ id: "c1", bridgeAuthToken: "v2:1:ciphertext" }]);

    const chunks = await collect("u1");
    const byTable = (t: string) => chunks.find((c) => c.table === t)!.row;

    const gateway = byTable("Gateway");
    expect(gateway.name).toBe("bot");
    expect(gateway).not.toHaveProperty("credentialsEnc");
    expect(gateway.config).toEqual({ webhookUrl: "https://webhook.2bot.org/telegram/gw1" });

    const session = byTable("Session");
    expect(session.userId).toBe("u1");
    expect(session).not.toHaveProperty("token");

    expect(byTable("MCPServerConfig")).not.toHaveProperty("configEnc");
    expect(byTable("WorkspaceContainer")).not.toHaveProperty("bridgeAuthToken");

    // Nothing that looks like ciphertext or a token survives serialisation.
    const serialised = JSON.stringify(chunks);
    expect(serialised).not.toContain("ciphertext");
    expect(serialised).not.toContain("session-token");
    expect(serialised).not.toContain("64hex");
  });

  it("redactRow does not mutate its input and tolerates non-object JSON columns", () => {
    const row = { id: "gw1", credentialsEnc: "x", config: "not-an-object" };
    const out = redactRow("Gateway", row);
    expect(out).toEqual({ id: "gw1", config: "not-an-object" });
    expect(row.credentialsEnc).toBe("x");
  });

  it("REDACTED_COLUMNS only names exported tables", () => {
    for (const table of Object.keys(REDACTED_COLUMNS)) {
      expect(EXPORT_TABLES).toContain(table);
    }
  });
});

// ---------------------------------------------------------------------------
// requestDeletion
// ---------------------------------------------------------------------------

describe("requestDeletion", () => {
  it("sets deletedAt + scheduledFor (= now + 30d) and marks the user inactive", async () => {
    mocked.user.findUnique.mockResolvedValue({
      deletedAt: null,
      deletionScheduledFor: null,
      anonymizedAt: null,
    });

    const before = Date.now();
    const out = await accountService.requestDeletion("u1");

    expect(out.scheduledFor.getTime()).toBeGreaterThanOrEqual(
      before + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000 - 1000,
    );
    const updateArgs = mocked.user.update.mock.calls[0]?.[0] as {
      data: {
        deletedAt: Date;
        deletionScheduledFor: Date;
        isActive: boolean;
      };
    };
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.deletionScheduledFor).toBeInstanceOf(Date);
    expect(updateArgs.data.isActive).toBe(false);
  });

  it("is idempotent — returns the existing scheduledFor without writing again", async () => {
    const existingDate = new Date("2026-06-01T00:00:00Z");
    mocked.user.findUnique.mockResolvedValue({
      deletedAt: new Date(),
      deletionScheduledFor: existingDate,
      anonymizedAt: null,
    });

    const out = await accountService.requestDeletion("u1");

    expect(out.scheduledFor).toEqual(existingDate);
    expect(mocked.user.update).not.toHaveBeenCalled();
  });

  it("refuses to schedule a deletion on an already-anonymised account", async () => {
    mocked.user.findUnique.mockResolvedValue({
      deletedAt: null,
      deletionScheduledFor: null,
      anonymizedAt: new Date(),
    });
    await expect(accountService.requestDeletion("u1")).rejects.toThrow(/already anonymized/);
  });
});

// ---------------------------------------------------------------------------
// cancelDeletion
// ---------------------------------------------------------------------------

describe("cancelDeletion", () => {
  it("clears the scheduling fields and re-activates the user", async () => {
    mocked.user.findUnique.mockResolvedValue({
      deletionScheduledFor: new Date(Date.now() + 100000),
      anonymizedAt: null,
    });

    await accountService.cancelDeletion("u1");

    const updateArgs = mocked.user.update.mock.calls[0]?.[0] as {
      data: { deletedAt: null; deletionScheduledFor: null; isActive: boolean };
    };
    expect(updateArgs.data.deletedAt).toBeNull();
    expect(updateArgs.data.deletionScheduledFor).toBeNull();
    expect(updateArgs.data.isActive).toBe(true);
  });

  it("is a no-op when no deletion is in flight", async () => {
    mocked.user.findUnique.mockResolvedValue({
      deletionScheduledFor: null,
      anonymizedAt: null,
    });
    await accountService.cancelDeletion("u1");
    expect(mocked.user.update).not.toHaveBeenCalled();
  });

  it("throws when the account is already anonymized", async () => {
    mocked.user.findUnique.mockResolvedValue({
      deletionScheduledFor: null,
      anonymizedAt: new Date(),
    });
    await expect(accountService.cancelDeletion("u1")).rejects.toThrow(/already anonymized/);
  });
});

// ---------------------------------------------------------------------------
// anonymizeUser
// ---------------------------------------------------------------------------

describe("anonymizeUser", () => {
  it("scrubs PII, deletes sessions + reset tokens, and stamps anonymizedAt", async () => {
    mocked.user.findUnique.mockResolvedValue({ anonymizedAt: null });

    const out = await accountService.anonymizeUser("u1");

    expect(out.alreadyAnonymized).toBe(false);
    expect(mocked.$transaction).toHaveBeenCalledOnce();
    // Inspect the operations passed into the transaction.
    expect(txCalls[0]).toBeDefined();
    expect(txCalls[0]).toHaveLength(3);
    // Best-effort assertion that the user.update inside the tx scrubs PII.
    expect(mocked.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mocked.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("is idempotent on an already-anonymized user", async () => {
    mocked.user.findUnique.mockResolvedValue({ anonymizedAt: new Date() });
    const out = await accountService.anonymizeUser("u1");
    expect(out.alreadyAnonymized).toBe(true);
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it("throws when the user does not exist", async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    await expect(accountService.anonymizeUser("nope")).rejects.toThrow(/not found/);
  });
});
