/**
 * Workspace Docker Service Tests
 *
 * Validates the HostConfig that `dockerService.createContainer` builds —
 * specifically the Wave 3 hardening (PidsLimit / Ulimits / OomScoreAdj /
 * env-tunable CapAdd / no `.local` in NO_PROXY) and the always-on
 * defaults (CapDrop=ALL, no-new-privileges, Privileged=false).
 *
 * dockerode is mocked at the module boundary so no real Docker is
 * involved; the tests assert the OPTIONS object passed to
 * `docker.createContainer(...)` matches what we expect.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the options docker.createContainer is called with, per test.
type CreateArgs = Record<string, unknown>;
let capturedCreateArgs: CreateArgs[] = [];

vi.mock("dockerode", () => {
  // Default Docker mock — every test creates a fresh inner-mocked client.
  const DockerMock = function DockerMock() {
    return {
      createContainer: vi.fn().mockImplementation(async (args: CreateArgs) => {
        capturedCreateArgs.push(args);
        return { id: "ctr-mock-1" };
      }),
      getContainer: vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({
          NetworkSettings: { Networks: {} },
        }),
      }),
      getNetwork: vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({}),
      }),
      createNetwork: vi.fn(),
    };
  };
  return { default: DockerMock };
});

import { dockerService } from "../workspace-docker.service";

const baseOpts = () => ({
  name: "ws-test",
  image: "2bot-workspace:test",
  ramMb: 1024,
  cpuCores: 1,
  storageMb: 10240,
  volumePath: "/var/lib/2bot/test-vol",
  bridgeAuthToken: "tok-test",
  networkName: "2bot-workspace",
  labels: { "2bot.user": "u-1" },
  env: {},
});

beforeEach(() => {
  capturedCreateArgs = [];
  // Clear any test-pollution on the env knobs.
  for (const k of [
    "WORKSPACE_PIDS_LIMIT",
    "WORKSPACE_ULIMIT_NOFILE",
    "WORKSPACE_ULIMIT_NPROC",
    "WORKSPACE_OOM_SCORE_ADJ",
    "WORKSPACE_CAP_ADD",
    "DOCKER_HOST",
  ]) {
    delete process.env[k];
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

function lastHostConfig(): Record<string, unknown> {
  expect(capturedCreateArgs).toHaveLength(1);
  return capturedCreateArgs[0]!.HostConfig as Record<string, unknown>;
}

function lastEnv(): string[] {
  return capturedCreateArgs[0]!.Env as string[];
}

// ---------------------------------------------------------------------------
// Wave 3.1 — resource caps
// ---------------------------------------------------------------------------

describe("createContainer — resource caps (Wave 3.1)", () => {
  it("sets Memory + NanoCpus from options", async () => {
    await dockerService.createContainer(baseOpts());
    const hc = lastHostConfig();
    expect(hc.Memory).toBe(1024 * 1024 * 1024);
    expect(hc.NanoCpus).toBe(1e9); // 1 core
    // MemoryReservation is half of Memory so the host can over-subscribe gracefully.
    expect(hc.MemoryReservation).toBe(512 * 1024 * 1024);
  });

  it("sets PidsLimit scaled with cpuCores (clamped 256..4096)", async () => {
    await dockerService.createContainer({ ...baseOpts(), cpuCores: 0.5 });
    expect(lastHostConfig().PidsLimit).toBe(256); // floor

    capturedCreateArgs = [];
    await dockerService.createContainer({ ...baseOpts(), cpuCores: 4 });
    expect(lastHostConfig().PidsLimit).toBe(1024); // 256 * 4

    capturedCreateArgs = [];
    await dockerService.createContainer({ ...baseOpts(), cpuCores: 32 });
    expect(lastHostConfig().PidsLimit).toBe(4096); // ceiling
  });

  it("honours WORKSPACE_PIDS_LIMIT env override", async () => {
    process.env.WORKSPACE_PIDS_LIMIT = "1234";
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().PidsLimit).toBe(1234);
  });

  it("sets nofile + nproc Ulimits to defaults (65536 / 4096)", async () => {
    await dockerService.createContainer(baseOpts());
    const ulimits = lastHostConfig().Ulimits as Array<{ Name: string; Soft: number; Hard: number }>;
    const byName = Object.fromEntries(ulimits.map((u) => [u.Name, u]));
    expect(byName.nofile).toEqual({ Name: "nofile", Soft: 65536, Hard: 65536 });
    expect(byName.nproc).toEqual({ Name: "nproc", Soft: 4096, Hard: 4096 });
  });

  it("ulimits are env-tunable", async () => {
    process.env.WORKSPACE_ULIMIT_NOFILE = "8192";
    process.env.WORKSPACE_ULIMIT_NPROC = "2048";
    await dockerService.createContainer(baseOpts());
    const ulimits = lastHostConfig().Ulimits as Array<{ Name: string; Soft: number }>;
    expect(ulimits.find((u) => u.Name === "nofile")?.Soft).toBe(8192);
    expect(ulimits.find((u) => u.Name === "nproc")?.Soft).toBe(2048);
  });

  it("OomScoreAdj defaults to 500 (workspace preferred for OOM kill)", async () => {
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().OomScoreAdj).toBe(500);
  });

  it("OomScoreAdj env override is clamped to [-1000, +1000]", async () => {
    process.env.WORKSPACE_OOM_SCORE_ADJ = "999";
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().OomScoreAdj).toBe(999);

    capturedCreateArgs = [];
    process.env.WORKSPACE_OOM_SCORE_ADJ = "9999"; // out of range — falls back to default
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().OomScoreAdj).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Wave 3.2 — env-tunable CapAdd
// ---------------------------------------------------------------------------

describe("createContainer — capabilities (Wave 3.2)", () => {
  it("CapDrop is always ['ALL']", async () => {
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().CapDrop).toEqual(["ALL"]);
  });

  it("CapAdd defaults to the legacy four when WORKSPACE_CAP_ADD is unset", async () => {
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().CapAdd).toEqual([
      "CHOWN",
      "DAC_OVERRIDE",
      "SETUID",
      "SETGID",
    ]);
  });

  it("WORKSPACE_CAP_ADD='' drops every add-cap", async () => {
    process.env.WORKSPACE_CAP_ADD = "";
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().CapAdd).toEqual([]);
  });

  it("WORKSPACE_CAP_ADD with a comma-separated list is normalised + uppercased", async () => {
    process.env.WORKSPACE_CAP_ADD = "chown, dac_override";
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().CapAdd).toEqual(["CHOWN", "DAC_OVERRIDE"]);
  });

  it("SecurityOpt always includes no-new-privileges:true", async () => {
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().SecurityOpt).toContain("no-new-privileges:true");
  });

  it("Privileged is hard-coded false (not env-tunable)", async () => {
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().Privileged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wave 3.5 — NO_PROXY no longer carries `.local`
// ---------------------------------------------------------------------------

describe("createContainer — egress (Wave 3.5)", () => {
  it("NO_PROXY contains loopback + host-api IP and NOT `.local`", async () => {
    await dockerService.createContainer(baseOpts());
    const env = lastEnv();
    const noProxy = env.find((e) => e.startsWith("NO_PROXY="));
    expect(noProxy).toBeDefined();
    expect(noProxy).not.toContain(".local");
    expect(noProxy).toContain("localhost,127.0.0.1");
    // Lowercase variant exists for tools that read no_proxy.
    expect(env.find((e) => e.startsWith("no_proxy="))).toBeDefined();
  });

  it("HTTP(S)_PROXY env vars route through Squid", async () => {
    await dockerService.createContainer(baseOpts());
    const env = lastEnv();
    const http = env.find((e) => e.startsWith("HTTP_PROXY="));
    const https = env.find((e) => e.startsWith("HTTPS_PROXY="));
    expect(http).toMatch(/^HTTP_PROXY=http:\/\//);
    expect(https).toMatch(/^HTTPS_PROXY=http:\/\//);
  });
});

// ---------------------------------------------------------------------------
// Static config not changed by Wave 3
// ---------------------------------------------------------------------------

describe("createContainer — defaults", () => {
  it("Binds the volume path read-write at /workspace", async () => {
    await dockerService.createContainer(baseOpts());
    const binds = lastHostConfig().Binds as string[];
    expect(binds).toContain("/var/lib/2bot/test-vol:/workspace:rw");
  });

  it("LogConfig caps log file at 10m × 3 (json-file driver)", async () => {
    await dockerService.createContainer(baseOpts());
    const logConfig = lastHostConfig().LogConfig as { Type: string; Config: Record<string, string> };
    expect(logConfig.Type).toBe("json-file");
    expect(logConfig.Config["max-size"]).toBe("10m");
    expect(logConfig.Config["max-file"]).toBe("3");
  });

  it("Bridge port is published on 127.0.0.1 (not all interfaces)", async () => {
    await dockerService.createContainer(baseOpts());
    const portBindings = lastHostConfig().PortBindings as Record<string, Array<{ HostIp: string }>>;
    const bindings = Object.values(portBindings).flat();
    for (const b of bindings) {
      expect(b.HostIp).toBe("127.0.0.1");
    }
  });

  it("ReadonlyRootfs is false (workspace needs to write to its filesystem)", async () => {
    await dockerService.createContainer(baseOpts());
    expect(lastHostConfig().ReadonlyRootfs).toBe(false);
  });

  it("custom env vars are propagated", async () => {
    await dockerService.createContainer({
      ...baseOpts(),
      env: { CUSTOM_FLAG: "foo", ANOTHER: "bar" },
    });
    const env = lastEnv();
    expect(env).toContain("CUSTOM_FLAG=foo");
    expect(env).toContain("ANOTHER=bar");
  });
});
