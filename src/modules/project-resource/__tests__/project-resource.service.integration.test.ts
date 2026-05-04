/**
 * Integration tests for project-resource service.
 *
 * These tests run against a real Postgres database (`2bot_test`) and
 * exercise the full call path — no mocks. They are configured via
 * `vitest.integration.config.ts` which includes `*.integration.test.ts`
 * files and loads `.env.test` via `globalSetup`.
 *
 * Boot:
 *   npm run test:integration
 *
 * @module modules/project-resource/__tests__/project-resource.service.integration.test
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
    cleanDatabase,
    teardownIntegrationTest,
    testDb
} from "@/test-helpers/integration-setup";
import {
    createHttpRouteResource,
    createScheduleResource,
    createSecretResource,
    getDecryptedSecretValue,
    getProjectResourceWithGateway,
    listProjectResources,
    updateSecretSidecar,
} from "../project-resource.service";

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

let userId: string;
let projectId: string;
const owner = () => ({ userId, organizationId: null });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("2bot_test")) {
    throw new Error(
      "Integration tests must run with DATABASE_URL pointing at 2bot_test. " +
        "Run via: npx dotenv -e .env.test -- npx vitest run --config vitest.integration.config.ts",
    );
  }

  // Seed a minimal user + project required by service helpers.
  await cleanDatabase();

  const user = await testDb.user.create({
    data: {
      email: `resource-svc-integ+${Date.now()}@test.local`,
      name: "Integration Tester",
      passwordHash: "not-used-in-tests",
      plan: "PRO",
      role: "MEMBER",
      isActive: true,
    },
  });
  userId = user.id;

  const project = await testDb.project.create({
    data: {
      userId,
      organizationId: null,
      name: "Integration Test Project",
      slug: `integ-proj-${Date.now()}`,
      kind: "AUTOMATION",
      status: "ACTIVE",
      isDefault: false,
    },
  });
  projectId = project.id;
});

beforeEach(async () => {
  // Remove all resources between tests so slug conflicts don't occur.
  await testDb.projectResource.deleteMany({ where: { projectId } });
});

afterAll(async () => {
  await teardownIntegrationTest();
});

// ──────────────────────────────────────────────────────────────────────────────
// HTTP_ROUTE
// ──────────────────────────────────────────────────────────────────────────────

describe("HTTP_ROUTE resource", () => {
  it("creates a resource + sidecar and lists it back", async () => {
    const resource = await createHttpRouteResource(owner(), {
      projectId,
      name: "Webhook Receiver",
      httpRoute: {
        method: "POST",
        path: "/webhooks/incoming",
        authMode: "NONE",
      },
    });

    expect(resource.kind).toBe("HTTP_ROUTE");
    expect(resource.projectId).toBe(projectId);

    // Verify list
    const items = await listProjectResources(owner(), projectId);
    expect(items.some((r) => r.id === resource.id)).toBe(true);
  });

  it("fetches resource with sidecar via getProjectResourceWithGateway", async () => {
    const resource = await createHttpRouteResource(owner(), {
      projectId,
      name: "Health Check",
      httpRoute: {
        method: "GET",
        path: "/health",
        authMode: "NONE",
      },
    });

    const detail = await getProjectResourceWithGateway(owner(), resource.id);
    expect(detail).not.toBeNull();
    expect(detail!.httpRoute).not.toBeNull();
    expect(detail!.httpRoute!.path).toBe("/health");
    expect(detail!.httpRoute!.method).toBe("GET");
  });

  it("allows two routes with the same path but different methods", async () => {
    const r1 = await createHttpRouteResource(owner(), {
      projectId,
      name: "POST handler",
      httpRoute: { method: "POST", path: "/api/data", authMode: "NONE" },
    });
    // Different method — must succeed.
    const r2 = await createHttpRouteResource(owner(), {
      projectId,
      name: "GET handler",
      httpRoute: { method: "GET", path: "/api/data", authMode: "NONE" },
    });
    expect(r1.id).not.toBe(r2.id);
  });

  it("requires authConfig.apiKey when authMode=API_KEY", async () => {
    await expect(
      createHttpRouteResource(owner(), {
        projectId,
        name: "Protected",
        httpRoute: {
          method: "POST",
          path: "/protected",
          authMode: "API_KEY",
          // Missing authConfig.apiKey intentionally
        },
      }),
    ).rejects.toThrow(/API_KEY/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SCHEDULE
// ──────────────────────────────────────────────────────────────────────────────

describe("SCHEDULE resource", () => {
  it("creates a resource + sidecar with computed nextFireAt", async () => {
    const resource = await createScheduleResource(owner(), {
      projectId,
      name: "Nightly Job",
      schedule: {
        cron: "0 3 * * *",
        timezone: "UTC",
        enabled: true,
      },
    });

    expect(resource.kind).toBe("SCHEDULE");

    const detail = await getProjectResourceWithGateway(owner(), resource.id);
    expect(detail!.schedule).not.toBeNull();
    expect(detail!.schedule!.cron).toBe("0 3 * * *");
    expect(detail!.schedule!.nextFireAt).not.toBeNull();
    expect(detail!.schedule!.enabled).toBe(true);
  });

  it("rejects invalid cron expressions", async () => {
    await expect(
      createScheduleResource(owner(), {
        projectId,
        name: "Bad Cron",
        schedule: { cron: "not-a-cron", enabled: true },
      }),
    ).rejects.toThrow(/cron/i);
  });

  it("rejects unknown timezone strings", async () => {
    // cron-parser throws when given an invalid timezone; the service surfaces
    // this as a ValidationError with "invalid cron expression" in the message.
    await expect(
      createScheduleResource(owner(), {
        projectId,
        name: "Bad TZ",
        schedule: { cron: "*/5 * * * *", timezone: "Mars/Olympus", enabled: true },
      }),
    ).rejects.toThrow(/cron|timezone/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECRET
// ──────────────────────────────────────────────────────────────────────────────

describe("SECRET resource", () => {
  it("encrypts the value at rest — plaintext never in DB", async () => {
    const PLAINTEXT = "sk-supersecret-integration-12345";

    await createSecretResource(owner(), {
      projectId,
      name: "OpenAI Key",
      secret: { key: "OPENAI_API_KEY", value: PLAINTEXT },
    });

    // Read raw DB row — must NOT contain plaintext.
    const row = await testDb.secret.findFirst({
      where: { key: "OPENAI_API_KEY" },
      select: { valueEnc: true, version: true },
    });
    expect(row).not.toBeNull();
    expect(row!.valueEnc).not.toContain(PLAINTEXT);
    expect(row!.valueEnc.startsWith("v2:")).toBe(true);
    expect(row!.version).toBe(1);
  });

  it("getDecryptedSecretValue returns original plaintext", async () => {
    const PLAINTEXT = "my-secret-token-for-decryption-test";

    const resource = await createSecretResource(owner(), {
      projectId,
      name: "Decryption Test",
      secret: { key: "DECRYPT_TEST_KEY", value: PLAINTEXT },
    });

    const decrypted = await getDecryptedSecretValue(owner(), resource.id);
    expect(decrypted).toBe(PLAINTEXT);
  });

  it("getProjectResourceWithGateway omits valueEnc from response shape", async () => {
    const resource = await createSecretResource(owner(), {
      projectId,
      name: "Shape Check",
      secret: { key: "SHAPE_CHECK_KEY", value: "some-value" },
    });

    const detail = await getProjectResourceWithGateway(owner(), resource.id);
    expect(detail).not.toBeNull();
    expect(detail!.secret).not.toBeNull();
    // valueEnc must not appear on the sidecar returned by the standard accessor.
    expect((detail!.secret as Record<string, unknown>)["valueEnc"]).toBeUndefined();
    expect(detail!.secret!.key).toBe("SHAPE_CHECK_KEY");
    expect(detail!.secret!.version).toBe(1);
  });

  it("updateSecretSidecar rotates the value — bumps version + lastRotatedAt", async () => {
    const resource = await createSecretResource(owner(), {
      projectId,
      name: "Rotation Target",
      secret: { key: "ROTATION_KEY", value: "first-value" },
    });

    const before = await testDb.secret.findFirst({ where: { key: "ROTATION_KEY" } });
    expect(before!.version).toBe(1);
    expect(before!.lastRotatedAt).toBeNull();

    await updateSecretSidecar(owner(), resource.id, { value: "rotated-value" });

    const after = await testDb.secret.findFirst({ where: { key: "ROTATION_KEY" } });
    expect(after!.version).toBe(2);
    expect(after!.lastRotatedAt).not.toBeNull();

    // Decryption still works after rotation.
    const decrypted = await getDecryptedSecretValue(owner(), resource.id);
    expect(decrypted).toBe("rotated-value");
  });

  it("rejects lowercase key names", async () => {
    await expect(
      createSecretResource(owner(), {
        projectId,
        name: "Bad Key",
        secret: { key: "openai_api_key", value: "value" },
      }),
    ).rejects.toThrow(/key/);
  });

  it("enforces ownership — other user cannot access", async () => {
    const resource = await createSecretResource(owner(), {
      projectId,
      name: "Owned Secret",
      secret: { key: "OWNED_KEY", value: "owned-value" },
    });

    const otherOwner = { userId: "other-user-id", organizationId: null };
    await expect(
      getDecryptedSecretValue(otherOwner, resource.id),
    ).rejects.toThrow(/access/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// listProjectResources — multi-kind
// ──────────────────────────────────────────────────────────────────────────────

describe("listProjectResources", () => {
  it("returns all kinds in a single project", async () => {
    await createHttpRouteResource(owner(), {
      projectId,
      name: "Route A",
      httpRoute: { method: "GET", path: "/list-test/route", authMode: "NONE" },
    });
    await createScheduleResource(owner(), {
      projectId,
      name: "Schedule A",
      schedule: { cron: "*/10 * * * *", enabled: true },
    });
    await createSecretResource(owner(), {
      projectId,
      name: "Secret A",
      secret: { key: "LIST_TEST_KEY", value: "x" },
    });

    const items = await listProjectResources(owner(), projectId);
    const kinds = items.map((r) => r.kind);
    expect(kinds).toContain("HTTP_ROUTE");
    expect(kinds).toContain("SCHEDULE");
    expect(kinds).toContain("SECRET");
  });

  it("filters by kind", async () => {
    await createHttpRouteResource(owner(), {
      projectId,
      name: "Filtered Route",
      httpRoute: { method: "POST", path: "/filtered", authMode: "NONE" },
    });
    await createSecretResource(owner(), {
      projectId,
      name: "Filtered Secret",
      secret: { key: "FILTERED_KEY", value: "x" },
    });

    const secretItems = await listProjectResources(owner(), projectId, { kind: "SECRET" });
    expect(secretItems.every((r) => r.kind === "SECRET")).toBe(true);
  });
});
