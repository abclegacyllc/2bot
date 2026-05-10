/**
 * KindHandler Registry + Dispatch Tests
 *
 * The registry + dispatcher framework was wired up but never exercised
 * from the route layer (Wave 6.3 prep). These tests establish the
 * invariants the dispatcher relies on so future migrations of the
 * 1.7k-line `project-resource.service.ts` into per-kind handlers can
 * proceed safely.
 *
 * Each kind's handler delegates to the existing service helper; we
 * mock the service module so the test asserts the *routing* (right
 * handler called with right args) rather than the underlying behaviour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the service module BEFORE the handlers import from it. The
// handlers each `import { createXxxResource, updateXxxSidecar } from
// "../project-resource.service"`; vi.mock hoists above the registry
// import below — and that's why the fixtures are inlined here rather
// than referenced by name (vi.mock factory cannot close over module-
// scope variables).
vi.mock("../../project-resource.service", () => ({
  createProjectResource: vi
    .fn()
    .mockResolvedValue({ id: "res-gateway_bot-1", kind: "GATEWAY_BOT" }),
  createHttpRouteResource: vi
    .fn()
    .mockResolvedValue({ id: "res-http_route-1", kind: "HTTP_ROUTE" }),
  createScheduleResource: vi
    .fn()
    .mockResolvedValue({ id: "res-schedule-1", kind: "SCHEDULE" }),
  createSecretResource: vi
    .fn()
    .mockResolvedValue({ id: "res-secret-1", kind: "SECRET" }),
  createExternalApiResource: vi
    .fn()
    .mockResolvedValue({ id: "res-external_api-1", kind: "EXTERNAL_API" }),
  createDatabaseResource: vi
    .fn()
    .mockResolvedValue({ id: "res-database-1", kind: "DATABASE" }),
  updateHttpRouteSidecar: vi.fn().mockResolvedValue({ updated: "HTTP_ROUTE" }),
  updateScheduleSidecar: vi.fn().mockResolvedValue({ updated: "SCHEDULE" }),
  updateSecretSidecar: vi.fn().mockResolvedValue({ updated: "SECRET" }),
  updateExternalApiSidecar: vi.fn().mockResolvedValue({ updated: "EXTERNAL_API" }),
  updateDatabaseSidecar: vi.fn().mockResolvedValue({ updated: "DATABASE" }),
}));

import * as service from "../../project-resource.service";
import { dispatchCreate, dispatchUpdateSidecar } from "../dispatch";
import {
  __resetRegistryForTests,
  getKindHandler,
  listRegisteredKinds,
  registerKindHandler,
} from "../registry";
import type { KindHandler } from "../types";

const owner = { userId: "user-1", organizationId: null };

beforeEach(() => {
  __resetRegistryForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  __resetRegistryForTests();
});

// ---------------------------------------------------------------------------
// Registry seeding
// ---------------------------------------------------------------------------

describe("registry", () => {
  it("seeds all six built-in kinds", () => {
    const kinds = listRegisteredKinds();
    expect(new Set(kinds)).toEqual(
      new Set(["GATEWAY_BOT", "HTTP_ROUTE", "SCHEDULE", "SECRET", "EXTERNAL_API", "DATABASE"]),
    );
  });

  it("returns the right handler for each kind", () => {
    expect(getKindHandler("HTTP_ROUTE")?.kind).toBe("HTTP_ROUTE");
    expect(getKindHandler("SECRET")?.kind).toBe("SECRET");
  });

  it("returns undefined for an unknown kind without throwing", () => {
    expect(getKindHandler("DEFINITELY_NOT_A_KIND" as never)).toBeUndefined();
  });

  it("hardDeleteAllowed reflects per-kind deletion semantics", () => {
    expect(getKindHandler("GATEWAY_BOT")?.hardDeleteAllowed).toBe(false);
    expect(getKindHandler("SECRET")?.hardDeleteAllowed).toBe(true);
    expect(getKindHandler("HTTP_ROUTE")?.hardDeleteAllowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Runtime registration
// ---------------------------------------------------------------------------

describe("registerKindHandler", () => {
  const customHandler: KindHandler = {
    kind: "MARKETPLACE_CUSTOM" as never,
    hardDeleteAllowed: true,
  };

  it("registers a previously-unknown kind", () => {
    registerKindHandler(customHandler);
    expect(getKindHandler("MARKETPLACE_CUSTOM" as never)).toBe(customHandler);
  });

  it("refuses to override an existing registration (silent collisions are evil)", () => {
    expect(() =>
      registerKindHandler({ kind: "SECRET", hardDeleteAllowed: false }),
    ).toThrow(/already registered/);
  });
});

// ---------------------------------------------------------------------------
// dispatchCreate
// ---------------------------------------------------------------------------

describe("dispatchCreate", () => {
  it("routes HTTP_ROUTE to createHttpRouteResource", async () => {
    const input = { name: "r1", projectId: "p-1", path: "/foo" } as never;
    const out = await dispatchCreate(owner, { kind: "HTTP_ROUTE", input });

    expect(out.kind).toBe("HTTP_ROUTE");
    expect(service.createHttpRouteResource).toHaveBeenCalledOnce();
    expect(service.createHttpRouteResource).toHaveBeenCalledWith(owner, input);
    // Sibling helpers must NOT have been called.
    expect(service.createSecretResource).not.toHaveBeenCalled();
    expect(service.createScheduleResource).not.toHaveBeenCalled();
  });

  it("routes SECRET to createSecretResource", async () => {
    const input = { name: "secret-1", projectId: "p-1", key: "API_KEY", value: "x" } as never;
    await dispatchCreate(owner, { kind: "SECRET", input });
    expect(service.createSecretResource).toHaveBeenCalledWith(owner, input);
    expect(service.createHttpRouteResource).not.toHaveBeenCalled();
  });

  it("routes GATEWAY_BOT to the generic createProjectResource", async () => {
    const input = { name: "g-bot", projectId: "p-1", kind: "GATEWAY_BOT" } as never;
    await dispatchCreate(owner, { kind: "GATEWAY_BOT", input });
    expect(service.createProjectResource).toHaveBeenCalledWith(owner, input);
  });

  it("routes the remaining three kinds correctly", async () => {
    await dispatchCreate(owner, { kind: "SCHEDULE", input: { name: "s" } as never });
    await dispatchCreate(owner, { kind: "EXTERNAL_API", input: { name: "e" } as never });
    await dispatchCreate(owner, { kind: "DATABASE", input: { name: "d" } as never });
    expect(service.createScheduleResource).toHaveBeenCalledOnce();
    expect(service.createExternalApiResource).toHaveBeenCalledOnce();
    expect(service.createDatabaseResource).toHaveBeenCalledOnce();
  });

  it("throws ValidationError for an unknown kind", async () => {
    await expect(
      dispatchCreate(owner, { kind: "GHOST" as never, input: {} as never }),
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("throws ValidationError if the registered handler has no create function", async () => {
    // Register a handler missing `create`.
    const partial: KindHandler = {
      kind: "PARTIAL_KIND" as never,
      hardDeleteAllowed: false,
    };
    registerKindHandler(partial);
    await expect(
      dispatchCreate(owner, {
        kind: "PARTIAL_KIND" as never,
        input: {} as never,
      }),
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("propagates errors thrown by the underlying service helper", async () => {
    (service.createHttpRouteResource as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Validation failed: path must start with '/'"),
    );

    await expect(
      dispatchCreate(owner, {
        kind: "HTTP_ROUTE",
        input: { name: "bad", projectId: "p", path: "no-slash" } as never,
      }),
    ).rejects.toThrow(/path must start with/);
  });
});

// ---------------------------------------------------------------------------
// dispatchUpdateSidecar
// ---------------------------------------------------------------------------

describe("dispatchUpdateSidecar", () => {
  it("routes SECRET to updateSecretSidecar", async () => {
    const input = { value: "new-secret" } as never;
    const out = await dispatchUpdateSidecar(owner, "res-secret-1", { kind: "SECRET", input });
    expect(out).toEqual({ updated: "SECRET" });
    expect(service.updateSecretSidecar).toHaveBeenCalledWith(owner, "res-secret-1", input);
  });

  it("routes the other four updatable kinds correctly", async () => {
    await dispatchUpdateSidecar(owner, "r1", { kind: "HTTP_ROUTE", input: {} as never });
    await dispatchUpdateSidecar(owner, "r2", { kind: "SCHEDULE", input: {} as never });
    await dispatchUpdateSidecar(owner, "r3", { kind: "EXTERNAL_API", input: {} as never });
    await dispatchUpdateSidecar(owner, "r4", { kind: "DATABASE", input: {} as never });
    expect(service.updateHttpRouteSidecar).toHaveBeenCalledOnce();
    expect(service.updateScheduleSidecar).toHaveBeenCalledOnce();
    expect(service.updateExternalApiSidecar).toHaveBeenCalledOnce();
    expect(service.updateDatabaseSidecar).toHaveBeenCalledOnce();
  });

  it("throws when no handler exists for the kind", async () => {
    await expect(
      dispatchUpdateSidecar(owner, "r1", { kind: "GHOST" as never, input: {} as never }),
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});
