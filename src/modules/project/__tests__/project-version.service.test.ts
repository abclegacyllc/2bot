/**
 * Project Version Service Tests (Phase 6.4 Wave 1)
 *
 * @module modules/project/__tests__/project-version.service.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const incMock = vi.fn();
vi.mock("@/lib/metrics", () => ({
  projectVersionsAppliedTotal: { inc: (...a: unknown[]) => incMock(...a) },
}));

// ---- In-memory prisma stand-in ------------------------------------------

type ProjectRow = {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  slug: string;
  description: string | null;
  kind: string;
  status: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  activeVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  gateways?: unknown[];
  userPlugins?: unknown[];
  workflows?: unknown[];
};

type VersionRow = {
  id: string;
  projectId: string;
  versionNumber: number;
  status: "STAGING" | "ACTIVE" | "ROLLED_BACK";
  manifest: unknown;
  source: string | null;
  buildspecHash: string | null;
  appliedBy: string | null;
  rolledBackAt: Date | null;
  rollbackReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const state = {
  projects: new Map<string, ProjectRow>(),
  versions: new Map<string, VersionRow>(),
  versionSeq: 0,
};

let nextVersionId = 1;

function newVersionId() {
  return `v_${nextVersionId++}`;
}

const txTag = Symbol("tx");

const prismaMock = {
  project: {
    findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: unknown }) => {
      const p = state.projects.get(where.id);
      if (!p) return null;
      if (include) {
        return {
          ...p,
          gateways: p.gateways ?? [],
          userPlugins: p.userPlugins ?? [],
          workflows: p.workflows ?? [],
        };
      }
      return p;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<ProjectRow> }) => {
      const p = state.projects.get(where.id);
      if (!p) throw new Error("not found");
      Object.assign(p, data);
      return p;
    }),
  },
  projectVersion: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.versions.get(where.id) ?? null),
    findFirst: vi.fn(async ({ where, orderBy }: { where: { projectId: string }; orderBy?: unknown }) => {
      const matches = [...state.versions.values()].filter((v) => v.projectId === where.projectId);
      if (orderBy && (orderBy as { versionNumber?: string }).versionNumber === "desc") {
        matches.sort((a, b) => b.versionNumber - a.versionNumber);
      }
      return matches[0] ?? null;
    }),
    findMany: vi.fn(async ({ where, orderBy }: { where: { projectId: string }; orderBy?: unknown }) => {
      const matches = [...state.versions.values()].filter((v) => v.projectId === where.projectId);
      if (orderBy && (orderBy as { versionNumber?: string }).versionNumber === "desc") {
        matches.sort((a, b) => b.versionNumber - a.versionNumber);
      }
      return matches;
    }),
    create: vi.fn(async ({ data }: { data: Partial<VersionRow> & { projectId: string; versionNumber: number; manifest: unknown } }) => {
      const v: VersionRow = {
        id: newVersionId(),
        projectId: data.projectId,
        versionNumber: data.versionNumber,
        status: (data.status as VersionRow["status"]) ?? "STAGING",
        manifest: data.manifest,
        source: data.source ?? null,
        buildspecHash: data.buildspecHash ?? null,
        appliedBy: data.appliedBy ?? null,
        rolledBackAt: null,
        rollbackReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.versions.set(v.id, v);
      return v;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<VersionRow> }) => {
      const v = state.versions.get(where.id);
      if (!v) throw new Error("not found");
      Object.assign(v, data, { updatedAt: new Date() });
      return v;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { projectId: string; status: string; id?: { not: string } }; data: Partial<VersionRow> }) => {
      let count = 0;
      for (const v of state.versions.values()) {
        if (v.projectId !== where.projectId) continue;
        if (v.status !== where.status) continue;
        if (where.id?.not && v.id === where.id.not) continue;
        Object.assign(v, data, { updatedAt: new Date() });
        count++;
      }
      return { count };
    }),
  },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({ ...prismaMock, [txTag]: true });
  }),
};
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

// ---- Imports under test --------------------------------------------------

import {
  activateVersion,
  createStagingVersion,
  getVersionWithManifest,
  listVersions,
  rollbackToVersion,
} from "../project-version.service";

const owner = { userId: "u1", organizationId: null };

function seedProject(id = "p1", overrides: Partial<ProjectRow> = {}): ProjectRow {
  const p: ProjectRow = {
    id,
    userId: "u1",
    organizationId: null,
    name: "Test",
    slug: "test",
    description: null,
    kind: "HYBRID",
    status: "ACTIVE",
    icon: null,
    color: null,
    isDefault: false,
    activeVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    gateways: [],
    userPlugins: [],
    workflows: [],
    ...overrides,
  };
  state.projects.set(id, p);
  return p;
}

beforeEach(() => {
  state.projects.clear();
  state.versions.clear();
  nextVersionId = 1;
  incMock.mockClear();
  // Clear all prismaMock fn call records
  Object.values(prismaMock).forEach((m) => {
    if (typeof m === "function") return;
    Object.values(m as Record<string, unknown>).forEach((fn) => {
      (fn as { mockClear?: () => void }).mockClear?.();
    });
  });
  prismaMock.$transaction.mockClear();
});

// ---- Tests ---------------------------------------------------------------

describe("createStagingVersion", () => {
  it("creates v1 STAGING for a fresh project and emits 'staged' metric", async () => {
    seedProject();
    const result = await createStagingVersion(owner, "p1", { source: "api" });
    expect(result.status).toBe("STAGING");
    expect(result.versionNumber).toBe(1);
    expect(result.source).toBe("api");
    expect(incMock).toHaveBeenCalledWith({ status: "staged" });
  });

  it("auto-increments versionNumber across multiple staging calls", async () => {
    seedProject();
    const a = await createStagingVersion(owner, "p1");
    const b = await createStagingVersion(owner, "p1");
    expect(a.versionNumber).toBe(1);
    expect(b.versionNumber).toBe(2);
  });

  it("denies access when owner does not match", async () => {
    seedProject();
    await expect(
      createStagingVersion({ userId: "intruder", organizationId: null }, "p1"),
    ).rejects.toThrow(/access/i);
  });

  it("throws NotFoundError for unknown project", async () => {
    await expect(createStagingVersion(owner, "missing")).rejects.toThrow(/not found/i);
  });
});

describe("activateVersion", () => {
  it("promotes a STAGING version to ACTIVE and sets project pointer", async () => {
    const p = seedProject();
    const staged = await createStagingVersion(owner, "p1");
    const active = await activateVersion(owner, staged.id);
    expect(active.status).toBe("ACTIVE");
    expect(state.projects.get(p.id)?.activeVersionId).toBe(staged.id);
    expect(incMock).toHaveBeenCalledWith({ status: "activated" });
  });

  it("demotes the previously-active version to ROLLED_BACK", async () => {
    seedProject();
    const v1 = await createStagingVersion(owner, "p1");
    await activateVersion(owner, v1.id);
    const v2 = await createStagingVersion(owner, "p1");
    await activateVersion(owner, v2.id);
    const v1Final = state.versions.get(v1.id);
    expect(v1Final?.status).toBe("ROLLED_BACK");
    expect(v1Final?.rollbackReason).toBe("superseded");
  });

  it("refuses to activate a non-STAGING version", async () => {
    seedProject();
    const staged = await createStagingVersion(owner, "p1");
    await activateVersion(owner, staged.id);
    await expect(activateVersion(owner, staged.id)).rejects.toThrow(/STAGING/);
  });
});

describe("rollbackToVersion", () => {
  it("requires a non-empty reason", async () => {
    seedProject();
    const staged = await createStagingVersion(owner, "p1");
    await expect(rollbackToVersion(owner, staged.id, "")).rejects.toThrow(/reason/i);
  });

  it("flips the active pointer back to the target version", async () => {
    const p = seedProject();
    const v1 = await createStagingVersion(owner, "p1");
    await activateVersion(owner, v1.id);
    const v2 = await createStagingVersion(owner, "p1");
    await activateVersion(owner, v2.id);

    const restored = await rollbackToVersion(owner, v1.id, "smoke failure");
    expect(restored.status).toBe("ACTIVE");
    expect(state.projects.get(p.id)?.activeVersionId).toBe(v1.id);
    expect(state.versions.get(v2.id)?.status).toBe("ROLLED_BACK");
    expect(state.versions.get(v2.id)?.rollbackReason).toBe("smoke failure");
    expect(incMock).toHaveBeenCalledWith({ status: "rolled-back" });
  });

  it("refuses to rollback to the currently-active version (no-op)", async () => {
    seedProject();
    const v1 = await createStagingVersion(owner, "p1");
    await activateVersion(owner, v1.id);
    await expect(rollbackToVersion(owner, v1.id, "test")).rejects.toThrow(/ACTIVE/);
  });
});

describe("listVersions / getVersionWithManifest", () => {
  it("lists versions newest-first", async () => {
    seedProject();
    await createStagingVersion(owner, "p1");
    await createStagingVersion(owner, "p1");
    const list = await listVersions(owner, "p1");
    expect(list.map((v) => v.versionNumber)).toEqual([2, 1]);
  });

  it("returns manifest with full payload", async () => {
    seedProject();
    const staged = await createStagingVersion(owner, "p1");
    const fetched = await getVersionWithManifest(owner, staged.id);
    expect(fetched.manifest).toBeDefined();
    expect((fetched.manifest as { version?: number }).version).toBe(1);
  });
});
