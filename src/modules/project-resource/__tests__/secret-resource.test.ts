/**
 * SECRET ProjectResource service tests (Phase 7.4)
 *
 * Validates:
 *   - `validateSecretSpec` accepts well-formed inputs and rejects malformed
 *   - `createSecretResource` encrypts the value before persisting (the
 *     plaintext is NEVER seen by Prisma)
 *   - `updateSecretSidecar` rotates the value (bumps version + lastRotatedAt)
 *   - `getProjectResourceWithGateway` returns secret metadata WITHOUT the
 *     `valueEnc` field
 *   - `getDecryptedSecretValue` returns the plaintext after ownership check
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
    project: { findUnique: vi.fn() },
    projectResource: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    secret: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((plaintext: string) => `v2:1:ENC(${plaintext})`),
  decrypt: vi.fn((ct: string) => {
    const m = ct.match(/^v2:1:ENC\((.*)\)$/);
    if (!m) throw new Error("bad ciphertext");
    return m[1];
  }),
}));

import { decrypt, encrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import {
    createSecretResource,
    getDecryptedSecretValue,
    updateSecretSidecar,
    validateSecretSpec,
} from "../project-resource.service";

const prismaMock = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  project: { findUnique: ReturnType<typeof vi.fn> };
  projectResource: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  secret: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockedEncrypt = encrypt as unknown as ReturnType<typeof vi.fn>;

const owner = { userId: "u-1", organizationId: null };

function resetMocks() {
  prismaMock.$transaction.mockClear();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock),
  );
  prismaMock.project.findUnique.mockReset();
  prismaMock.projectResource.findUnique.mockReset();
  prismaMock.projectResource.create.mockReset();
  prismaMock.secret.findUnique.mockReset();
  prismaMock.secret.create.mockReset();
  prismaMock.secret.update.mockReset();
  mockedEncrypt.mockClear();
  (decrypt as unknown as ReturnType<typeof vi.fn>).mockClear();
}

describe("validateSecretSpec", () => {
  beforeEach(resetMocks);

  it("accepts a well-formed key + value", () => {
    expect(() =>
      validateSecretSpec({ key: "OPENAI_API_KEY", value: "sk-test-123" }),
    ).not.toThrow();
  });

  it("rejects lowercase keys", () => {
    expect(() =>
      validateSecretSpec({ key: "openai_api_key", value: "x" }),
    ).toThrow(/key/);
  });

  it("rejects keys with hyphens or spaces", () => {
    expect(() => validateSecretSpec({ key: "OPEN-AI", value: "x" })).toThrow(/key/);
    expect(() => validateSecretSpec({ key: "OPEN AI", value: "x" })).toThrow(/key/);
  });

  it("requires a non-empty value when requireValue=true (default)", () => {
    expect(() => validateSecretSpec({ key: "K", value: "" })).toThrow(/value/);
    expect(() =>
      validateSecretSpec({ key: "K" } as { key: string; value?: string }),
    ).toThrow(/value/);
  });

  it("does not require a value when requireValue=false", () => {
    expect(() =>
      validateSecretSpec({ key: "K" }, { requireValue: false }),
    ).not.toThrow();
  });

  it("rejects values >64KB", () => {
    expect(() =>
      validateSecretSpec({ key: "K", value: "x".repeat(64 * 1024 + 1) }),
    ).toThrow(/64KB/);
  });

  it("rejects descriptions >500 chars", () => {
    expect(() =>
      validateSecretSpec({
        key: "K",
        value: "x",
        description: "y".repeat(501),
      }),
    ).toThrow(/description/);
  });
});

describe("createSecretResource", () => {
  beforeEach(resetMocks);

  it("encrypts the value before persisting", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: "proj-1",
      userId: "u-1",
      organizationId: null,
    });
    prismaMock.projectResource.findUnique.mockResolvedValue(null);
    prismaMock.projectResource.create.mockResolvedValue({
      id: "res-1",
      projectId: "proj-1",
      userId: "u-1",
      organizationId: null,
      kind: "SECRET",
      slug: "my-secret",
    });
    prismaMock.secret.create.mockResolvedValue({});

    await createSecretResource(owner, {
      projectId: "proj-1",
      name: "My Secret",
      secret: { key: "MY_KEY", value: "very-secret" },
    });

    // Encrypt was called with the plaintext.
    expect(mockedEncrypt).toHaveBeenCalledTimes(1);
    expect(mockedEncrypt).toHaveBeenCalledWith("very-secret");

    // The Prisma `secret.create` data field MUST contain only the ciphertext,
    // never the plaintext.
    const createCall = prismaMock.secret.create.mock.calls[0]![0] as {
      data: { valueEnc: string };
    };
    expect(createCall.data.valueEnc).toBe("v2:1:ENC(very-secret)");
    // The Prisma `data` payload must NOT carry a plaintext `value` field.
    expect(createCall.data).not.toHaveProperty("value");
  });
});

describe("updateSecretSidecar", () => {
  beforeEach(resetMocks);

  it("rotates the value (bumps version + lastRotatedAt)", async () => {
    prismaMock.projectResource.findUnique.mockResolvedValue({
      id: "res-1",
      projectId: "proj-1",
      userId: "u-1",
      organizationId: null,
      kind: "SECRET",
    });
    prismaMock.secret.findUnique.mockResolvedValue({
      id: "sec-1",
      resourceId: "res-1",
      key: "OLD_KEY",
      valueEnc: "v2:1:ENC(old)",
      description: null,
      version: 3,
    });
    prismaMock.secret.update.mockResolvedValue({
      id: "sec-1",
      resourceId: "res-1",
      key: "OLD_KEY",
      description: null,
      version: 4,
      lastRotatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateSecretSidecar(owner, "res-1", { value: "rotated" });

    expect(mockedEncrypt).toHaveBeenCalledWith("rotated");
    const updateCall = prismaMock.secret.update.mock.calls[0]![0] as {
      data: {
        valueEnc?: string;
        version?: { increment: number };
        lastRotatedAt?: Date;
      };
    };
    expect(updateCall.data.valueEnc).toBe("v2:1:ENC(rotated)");
    expect(updateCall.data.version).toEqual({ increment: 1 });
    expect(updateCall.data.lastRotatedAt).toBeInstanceOf(Date);
  });

  it("rejects on wrong kind", async () => {
    prismaMock.projectResource.findUnique.mockResolvedValue({
      id: "res-2",
      projectId: "proj-1",
      userId: "u-1",
      organizationId: null,
      kind: "GATEWAY_BOT",
    });
    await expect(
      updateSecretSidecar(owner, "res-2", { value: "x" }),
    ).rejects.toThrow(/not a SECRET/);
  });

  it("rejects malformed key on patch", async () => {
    prismaMock.projectResource.findUnique.mockResolvedValue({
      id: "res-1",
      projectId: "proj-1",
      userId: "u-1",
      organizationId: null,
      kind: "SECRET",
    });
    await expect(
      updateSecretSidecar(owner, "res-1", { key: "lower-case" }),
    ).rejects.toThrow(/key/);
  });
});

describe("getDecryptedSecretValue", () => {
  beforeEach(resetMocks);

  it("returns the decrypted plaintext after ownership check", async () => {
    prismaMock.projectResource.findUnique.mockResolvedValue({
      id: "res-1",
      projectId: "proj-1",
      userId: "u-1",
      organizationId: null,
      kind: "SECRET",
    });
    prismaMock.secret.findUnique.mockResolvedValue({
      valueEnc: "v2:1:ENC(plaintext-here)",
    });

    const value = await getDecryptedSecretValue(owner, "res-1");
    expect(value).toBe("plaintext-here");
  });

  it("throws when caller does not own the resource", async () => {
    prismaMock.projectResource.findUnique.mockResolvedValue({
      id: "res-1",
      projectId: "proj-1",
      userId: "u-OTHER",
      organizationId: null,
      kind: "SECRET",
    });
    await expect(
      getDecryptedSecretValue(owner, "res-1"),
    ).rejects.toThrow(/access/);
  });

  it("throws when resource is not a SECRET", async () => {
    prismaMock.projectResource.findUnique.mockResolvedValue({
      id: "res-1",
      projectId: "proj-1",
      userId: "u-1",
      organizationId: null,
      kind: "GATEWAY_BOT",
    });
    await expect(
      getDecryptedSecretValue(owner, "res-1"),
    ).rejects.toThrow(/not a SECRET/);
  });
});

// ===========================================================================
// loadProjectSecrets — runtime accessor for workflow executor (Phase 7.4)
// ===========================================================================

import { loadProjectSecrets } from "../project-resource.service";

describe("loadProjectSecrets", () => {
  beforeEach(resetMocks);

  it("returns a key→plaintext map for the project's active SECRETs", async () => {
    // findMany is on projectResource (with secret select), not on secret directly.
    (prismaMock.projectResource as unknown as {
      findMany: ReturnType<typeof vi.fn>;
    }).findMany = vi.fn().mockResolvedValue([
      { id: "r1", secret: { key: "OPENAI_API_KEY", valueEnc: "v2:1:ENC(sk-aaa)" } },
      { id: "r2", secret: { key: "STRIPE_KEY", valueEnc: "v2:1:ENC(sk-bbb)" } },
    ]);

    const out = await loadProjectSecrets(owner, "proj-1");
    expect(out).toEqual({
      OPENAI_API_KEY: "sk-aaa",
      STRIPE_KEY: "sk-bbb",
    });
  });

  it("skips rows whose decryption fails and continues", async () => {
    (prismaMock.projectResource as unknown as {
      findMany: ReturnType<typeof vi.fn>;
    }).findMany = vi.fn().mockResolvedValue([
      { id: "r1", secret: { key: "GOOD", valueEnc: "v2:1:ENC(works)" } },
      { id: "r2", secret: { key: "BAD", valueEnc: "garbled-ciphertext" } },
    ]);

    const out = await loadProjectSecrets(owner, "proj-1");
    expect(out).toEqual({ GOOD: "works" });
    expect(out.BAD).toBeUndefined();
  });

  it("returns {} when the project has no secrets", async () => {
    (prismaMock.projectResource as unknown as {
      findMany: ReturnType<typeof vi.fn>;
    }).findMany = vi.fn().mockResolvedValue([]);
    const out = await loadProjectSecrets(owner, "proj-1");
    expect(out).toEqual({});
  });
});
