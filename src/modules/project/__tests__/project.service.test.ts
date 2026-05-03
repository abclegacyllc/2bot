/**
 * Project Service Tests (Phase 6.2)
 *
 * @module modules/project/__tests__/project.service.test
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

interface FakeProject {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  slug: string;
  kind: "BOT" | "WEB_APP" | "AUTOMATION" | "HYBRID";
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  isDefault: boolean;
  description: string | null;
  icon: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const projects = new Map<string, FakeProject>();
const gateways: Array<{ id: string; userId: string; organizationId: string | null; projectId: string | null }> = [];
const workflows: Array<{ id: string; userId: string; organizationId: string | null; projectId: string | null }> = [];
const userPlugins: Array<{ id: string; userId: string; organizationId: string | null; projectId: string | null }> = [];

let idSeq = 0;
const nextId = () => `pj_${++idSeq}`;

function ownerMatches(
  row: { userId: string; organizationId: string | null },
  where: { userId?: string; organizationId?: string | null },
) {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if ("organizationId" in where) {
    const w = where.organizationId ?? null;
    if ((row.organizationId ?? null) !== w) return false;
  }
  return true;
}

const projectMock = {
  findUnique: vi.fn(async ({ where }: { where: { id: string } }) => projects.get(where.id) ?? null),
  findFirst: vi.fn(async ({ where }: { where: { userId?: string; organizationId?: string | null; isDefault?: boolean } }) => {
    for (const p of projects.values()) {
      if (where.userId !== undefined && p.userId !== where.userId) continue;
      if ("organizationId" in where && (p.organizationId ?? null) !== (where.organizationId ?? null)) continue;
      if (where.isDefault !== undefined && p.isDefault !== where.isDefault) continue;
      return p;
    }
    return null;
  }),
  findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const out: FakeProject[] = [];
    for (const p of projects.values()) {
      if (!ownerMatches(p, where as { userId: string; organizationId: string | null })) continue;
      if ((where as { status?: string }).status && p.status !== (where as { status?: string }).status) continue;
      if ((where as { kind?: string }).kind && p.kind !== (where as { kind?: string }).kind) continue;
      out.push(p);
    }
    return out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime());
  }),
  count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    let n = 0;
    for (const p of projects.values()) {
      if (ownerMatches(p, where as { userId: string; organizationId: string | null })) n++;
    }
    return n;
  }),
  create: vi.fn(async ({ data }: { data: Partial<FakeProject> }) => {
    const userId = data.userId!;
    const orgId = data.organizationId ?? null;
    const slug = data.slug!;
    for (const p of projects.values()) {
      if (p.userId === userId && (p.organizationId ?? null) === orgId && p.slug === slug) {
        const err = new Error("Unique constraint failed") as Error & { code: string };
        err.code = "P2002";
        throw err;
      }
    }
    const now = new Date();
    const project: FakeProject = {
      id: nextId(),
      userId,
      organizationId: orgId,
      name: data.name!,
      slug,
      kind: (data.kind as FakeProject["kind"]) ?? "HYBRID",
      status: (data.status as FakeProject["status"]) ?? "ACTIVE",
      isDefault: data.isDefault ?? false,
      description: data.description ?? null,
      icon: data.icon ?? null,
      color: data.color ?? null,
      createdAt: now,
      updatedAt: now,
    };
    projects.set(project.id, project);
    return project;
  }),
  update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeProject> }) => {
    const p = projects.get(where.id);
    if (!p) throw new Error("not found");
    Object.assign(p, data, { updatedAt: new Date() });
    return p;
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeProject> }) => {
    let count = 0;
    for (const p of projects.values()) {
      if (!ownerMatches(p, where as { userId: string; organizationId: string | null })) continue;
      if ((where as { isDefault?: boolean }).isDefault !== undefined && p.isDefault !== (where as { isDefault?: boolean }).isDefault) continue;
      Object.assign(p, data, { updatedAt: new Date() });
      count++;
    }
    return { count };
  }),
};

const gatewayMock = {
  updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] }; userId: string; organizationId: string | null }; data: { projectId: string } }) => {
    let count = 0;
    for (const g of gateways) {
      if (!where.id.in.includes(g.id)) continue;
      if (g.userId !== where.userId) continue;
      if ((g.organizationId ?? null) !== (where.organizationId ?? null)) continue;
      g.projectId = data.projectId;
      count++;
    }
    return { count };
  }),
};
const workflowMock = {
  updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] }; userId: string; organizationId: string | null }; data: { projectId: string } }) => {
    let count = 0;
    for (const w of workflows) {
      if (!where.id.in.includes(w.id)) continue;
      if (w.userId !== where.userId) continue;
      if ((w.organizationId ?? null) !== (where.organizationId ?? null)) continue;
      w.projectId = data.projectId;
      count++;
    }
    return { count };
  }),
};
const userPluginMock = {
  updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] }; userId: string; organizationId: string | null }; data: { projectId: string } }) => {
    let count = 0;
    for (const u of userPlugins) {
      if (!where.id.in.includes(u.id)) continue;
      if (u.userId !== where.userId) continue;
      if ((u.organizationId ?? null) !== (where.organizationId ?? null)) continue;
      u.projectId = data.projectId;
      count++;
    }
    return { count };
  }),
};

const prismaMock = {
  project: projectMock,
  gateway: gatewayMock,
  workflow: workflowMock,
  userPlugin: userPluginMock,
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import {
  archiveProject,
  createProject,
  ensureDefaultProject,
  getProject,
  linkResources,
  listProjects,
  updateProject,
} from "../project.service";

const owner = { userId: "u1", organizationId: null };
const otherOwner = { userId: "u2", organizationId: null };

describe("Project Service", () => {
  beforeEach(() => {
    projects.clear();
    gateways.length = 0;
    workflows.length = 0;
    userPlugins.length = 0;
    idSeq = 0;
    vi.clearAllMocks();
  });

  describe("ensureDefaultProject", () => {
    it("creates a default project if none exists", async () => {
      const p = await ensureDefaultProject(owner);
      expect(p.isDefault).toBe(true);
      expect(p.slug).toBe("default");
      expect(p.kind).toBe("HYBRID");
    });

    it("is idempotent", async () => {
      const a = await ensureDefaultProject(owner);
      const b = await ensureDefaultProject(owner);
      expect(a.id).toBe(b.id);
      expect(projects.size).toBe(1);
    });

    it("scopes by organization", async () => {
      await ensureDefaultProject(owner);
      const orgOwner = { userId: "u1", organizationId: "org1" };
      const orgProject = await ensureDefaultProject(orgOwner);
      expect(orgProject.organizationId).toBe("org1");
      expect(projects.size).toBe(2);
    });
  });

  describe("createProject", () => {
    it("creates a non-default project (when default exists)", async () => {
      await ensureDefaultProject(owner);
      const p = await createProject(owner, { name: "My Bot", kind: "BOT" });
      expect(p.name).toBe("My Bot");
      expect(p.slug).toBe("my-bot");
      expect(p.isDefault).toBe(false);
      expect(p.kind).toBe("BOT");
    });

    it("first project for an owner is auto-marked default", async () => {
      const p = await createProject(owner, { name: "First" });
      expect(p.isDefault).toBe(true);
    });

    it("rejects duplicate slug", async () => {
      await createProject(owner, { name: "Foo", slug: "foo" });
      await expect(createProject(owner, { name: "Bar", slug: "foo" })).rejects.toThrow(/already exists/);
    });

    it("rejects empty name", async () => {
      await expect(createProject(owner, { name: "  " })).rejects.toThrow(/name is required/);
    });

    it("demotes the previous default when isDefault=true", async () => {
      const a = await ensureDefaultProject(owner);
      const b = await createProject(owner, { name: "New Default", isDefault: true });
      expect(b.isDefault).toBe(true);
      const reloaded = projects.get(a.id)!;
      expect(reloaded.isDefault).toBe(false);
    });
  });

  describe("getProject / listProjects", () => {
    it("returns only the caller's projects", async () => {
      const mine = await ensureDefaultProject(owner);
      await ensureDefaultProject(otherOwner);
      const list = await listProjects(owner);
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(mine.id);
    });

    it("getProject denies access from another user", async () => {
      const mine = await ensureDefaultProject(owner);
      await expect(getProject(mine.id, otherOwner)).rejects.toThrow(/access/);
    });

    it("getProject throws NotFound for unknown id", async () => {
      await expect(getProject("nope", owner)).rejects.toThrow(/not found/);
    });
  });

  describe("updateProject", () => {
    it("updates name + slug", async () => {
      const p = await ensureDefaultProject(owner);
      const updated = await updateProject(p.id, owner, { name: "Renamed", slug: "renamed" });
      expect(updated.name).toBe("Renamed");
      expect(updated.slug).toBe("renamed");
    });

    it("forbids un-defaulting the only default project", async () => {
      const p = await ensureDefaultProject(owner);
      await expect(updateProject(p.id, owner, { isDefault: false })).rejects.toThrow(/Cannot un-default/);
    });

    it("promoting to default demotes the existing default", async () => {
      const a = await ensureDefaultProject(owner);
      const b = await createProject(owner, { name: "Other" });
      expect(b.isDefault).toBe(false);
      const updated = await updateProject(b.id, owner, { isDefault: true });
      expect(updated.isDefault).toBe(true);
      expect(projects.get(a.id)!.isDefault).toBe(false);
    });
  });

  describe("archiveProject", () => {
    it("archives a non-default project", async () => {
      await ensureDefaultProject(owner);
      const p = await createProject(owner, { name: "Throwaway" });
      const archived = await archiveProject(p.id, owner);
      expect(archived.status).toBe("ARCHIVED");
    });

    it("refuses to archive the default project", async () => {
      const p = await ensureDefaultProject(owner);
      await expect(archiveProject(p.id, owner)).rejects.toThrow(/default project/);
    });
  });

  describe("linkResources", () => {
    it("attaches gateways/workflows/userPlugins owned by the same user", async () => {
      const p = await ensureDefaultProject(owner);
      gateways.push({ id: "g1", userId: "u1", organizationId: null, projectId: null });
      gateways.push({ id: "g2", userId: "u2", organizationId: null, projectId: null }); // not mine
      workflows.push({ id: "w1", userId: "u1", organizationId: null, projectId: null });
      userPlugins.push({ id: "up1", userId: "u1", organizationId: null, projectId: null });

      const result = await linkResources(p.id, owner, {
        gatewayIds: ["g1", "g2"],
        workflowIds: ["w1"],
        userPluginIds: ["up1"],
      });

      expect(result).toEqual({ gateways: 1, workflows: 1, userPlugins: 1 });
      expect(gateways.find((g) => g.id === "g1")!.projectId).toBe(p.id);
      expect(gateways.find((g) => g.id === "g2")!.projectId).toBeNull();
    });
  });
});
