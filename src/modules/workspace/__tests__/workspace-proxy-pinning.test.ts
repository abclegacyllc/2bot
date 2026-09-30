/**
 * Egress proxy address pinning (2026-09-30).
 *
 * Workspaces bake the proxy's IP into their env at creation. With a dynamic
 * address, the 2026-09-08 reboot moved the proxy and left a workspace pointing
 * at its own IP. These tests pin down the fix:
 *   - the proxy is created at WORKSPACE_PROXY_IP, and recreated once if an
 *     older container isn't pinned;
 *   - workspaces refuse to start unless the proxy holds that address;
 *   - stale gateway DNAT rules are replaced instead of stacked;
 *   - a container marked ERROR is stopped rather than left running.
 *
 * dockerode and child_process are mocked at the module boundary.
 */

import type * as ChildProcess from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docker = vi.hoisted(() => ({
  inspect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn(),
  createContainer: vi.fn(),
  createdStart: vi.fn(),
  imageInspect: vi.fn(),
}));

vi.mock("dockerode", () => ({
  default: function DockerMock() {
    return {
      getContainer: () => ({
        inspect: docker.inspect,
        start: docker.start,
        stop: docker.stop,
        remove: docker.remove,
      }),
      getImage: () => ({ inspect: docker.imageInspect }),
      createContainer: docker.createContainer,
    };
  },
}));

// execFile is promisified by the module under test; a plain callback-style
// mock resolves to the `{ stdout, stderr }` object passed as the 2nd argument.
const iptables = vi.hoisted(() => ({
  calls: [] as string[][],
  rules: "",
  checkExists: false,
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  return {
    ...actual,
    execFile: (
      _cmd: string,
      args: string[],
      cb: (err: Error | null, res?: { stdout: string; stderr: string }) => void,
    ) => {
      iptables.calls.push(args);
      if (args.includes("-S")) return cb(null, { stdout: iptables.rules, stderr: "" });
      if (args.includes("-C") && !iptables.checkExists) return cb(new Error("iptables: Bad rule"));
      return cb(null, { stdout: "", stderr: "" });
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { dockerService } from "../workspace-docker.service";
import { egressProxyService, staleGatewayDnatTargets } from "../workspace-squid.service";
import { WORKSPACE_NETWORK, WORKSPACE_PROXY_IP } from "../workspace.constants";

const proxyInfo = (opts: { running: boolean; pinned: string | null; ip: string }) => ({
  State: { Running: opts.running, StartedAt: "2026-09-30T00:00:00Z" },
  NetworkSettings: {
    Networks: {
      [WORKSPACE_NETWORK]: {
        IPAMConfig: opts.pinned ? { IPv4Address: opts.pinned } : null,
        IPAddress: opts.ip,
      },
    },
  },
});

const notFound = () => Object.assign(new Error("no such container"), { statusCode: 404 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  iptables.calls = [];
  iptables.rules = "";
  iptables.checkExists = false;
  docker.imageInspect.mockResolvedValue({});
  docker.createContainer.mockResolvedValue({ start: docker.createdStart });
});

describe("WORKSPACE_PROXY_IP", () => {
  it("defaults to the address the proxy already had, so baked .2 envs stay correct", () => {
    expect(WORKSPACE_PROXY_IP).toBe("172.20.0.2");
  });
});

describe("ensureProxyRunning — address pinning", () => {
  it("leaves a pinned, running proxy alone", async () => {
    docker.inspect.mockResolvedValue(proxyInfo({ running: true, pinned: WORKSPACE_PROXY_IP, ip: WORKSPACE_PROXY_IP }));
    await egressProxyService.ensureProxyRunning();
    expect(docker.start).not.toHaveBeenCalled();
    expect(docker.remove).not.toHaveBeenCalled();
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it("starts a pinned proxy that is stopped", async () => {
    docker.inspect.mockResolvedValue(proxyInfo({ running: false, pinned: WORKSPACE_PROXY_IP, ip: "" }));
    await egressProxyService.ensureProxyRunning();
    expect(docker.start).toHaveBeenCalledOnce();
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it("recreates a proxy that was created without the pinned address", async () => {
    docker.inspect.mockResolvedValue(proxyInfo({ running: true, pinned: null, ip: "172.20.0.2" }));
    await egressProxyService.ensureProxyRunning();
    expect(docker.remove).toHaveBeenCalledWith({ force: true });
    expect(docker.createContainer).toHaveBeenCalledOnce();
    expect(docker.createdStart).toHaveBeenCalledOnce();
  });

  it("creates a missing proxy at the pinned address", async () => {
    docker.inspect.mockRejectedValue(notFound());
    await egressProxyService.ensureProxyRunning();
    const args = docker.createContainer.mock.calls[0]?.[0] as {
      NetworkingConfig: { EndpointsConfig: Record<string, { IPAMConfig: { IPv4Address: string } }> };
    };
    expect(args.NetworkingConfig.EndpointsConfig[WORKSPACE_NETWORK]?.IPAMConfig.IPv4Address).toBe(WORKSPACE_PROXY_IP);
  });

  it("rethrows Docker errors other than not-found", async () => {
    docker.inspect.mockRejectedValue(Object.assign(new Error("daemon down"), { statusCode: 500 }));
    await expect(egressProxyService.ensureProxyRunning()).rejects.toThrow("daemon down");
    expect(docker.createContainer).not.toHaveBeenCalled();
  });
});

describe("assertReadyForWorkspaces — fail closed", () => {
  it("passes when the proxy runs at the pinned address", async () => {
    docker.inspect.mockResolvedValue(proxyInfo({ running: true, pinned: WORKSPACE_PROXY_IP, ip: WORKSPACE_PROXY_IP }));
    await expect(egressProxyService.assertReadyForWorkspaces()).resolves.toBeUndefined();
  });

  it("refuses when the proxy is not actually at the pinned address", async () => {
    docker.inspect.mockResolvedValue(proxyInfo({ running: true, pinned: WORKSPACE_PROXY_IP, ip: "172.20.0.9" }));
    await expect(egressProxyService.assertReadyForWorkspaces()).rejects.toThrow(/refusing to start a workspace/);
  });

  it("refuses when the proxy did not come up", async () => {
    docker.inspect
      .mockResolvedValueOnce(proxyInfo({ running: false, pinned: WORKSPACE_PROXY_IP, ip: "" })) // ensureProxyRunning
      .mockResolvedValueOnce(proxyInfo({ running: false, pinned: WORKSPACE_PROXY_IP, ip: "" })); // getProxyStatus
    await expect(egressProxyService.assertReadyForWorkspaces()).rejects.toThrow(/running=false/);
  });
});

describe("staleGatewayDnatTargets", () => {
  const rules = [
    "-P PREROUTING ACCEPT",
    "-A PREROUTING -m addrtype --dst-type LOCAL -j DOCKER",
    "-A PREROUTING -d 172.20.0.1/32 -p tcp -m tcp --dport 3128 -j DNAT --to-destination 172.20.0.3:3128",
    "-A PREROUTING -d 172.20.0.1/32 -p tcp -m tcp --dport 3128 -j DNAT --to-destination 172.20.0.2:3128",
    "-A PREROUTING -d 172.20.0.1/32 -p tcp -m tcp --dport 8080 -j DNAT --to-destination 172.20.0.7:8080",
    "-A PREROUTING -d 10.0.0.1/32 -p tcp -m tcp --dport 3128 -j DNAT --to-destination 10.0.0.5:3128",
  ].join("\n");

  it("returns only other destinations for the same gateway and port", () => {
    expect(staleGatewayDnatTargets(rules, "172.20.0.1", "3128", "172.20.0.2:3128")).toEqual(["172.20.0.3:3128"]);
  });

  it("returns nothing when the only rule is already correct", () => {
    expect(staleGatewayDnatTargets(rules, "10.0.0.1", "3128", "10.0.0.5:3128")).toEqual([]);
  });

  it("treats the gateway IP literally, not as a regex", () => {
    const odd = "-A PREROUTING -d 172x20x0x1/32 -p tcp -m tcp --dport 3128 -j DNAT --to-destination 1.2.3.4:3128";
    expect(staleGatewayDnatTargets(odd, "172.20.0.1", "3128", "172.20.0.2:3128")).toEqual([]);
  });
});

describe("setupGatewayForwarding — replaces stale rules", () => {
  const setup = () =>
    (egressProxyService as unknown as { setupGatewayForwarding(): Promise<void> }).setupGatewayForwarding();

  it("deletes the stale rule, then adds the current one", async () => {
    docker.inspect.mockResolvedValue(proxyInfo({ running: true, pinned: WORKSPACE_PROXY_IP, ip: WORKSPACE_PROXY_IP }));
    iptables.rules = "-A PREROUTING -d 172.20.0.1/32 -p tcp -m tcp --dport 3128 -j DNAT --to-destination 172.20.0.3:3128";
    await setup();
    const ops = iptables.calls.map((a) => `${a[3]} ${a.at(-1)}`);
    expect(ops).toEqual(["-S PREROUTING", "-D 172.20.0.3:3128", "-C 172.20.0.2:3128", "-A 172.20.0.2:3128"]);
  });

  it("changes nothing when the current rule already exists", async () => {
    docker.inspect.mockResolvedValue(proxyInfo({ running: true, pinned: WORKSPACE_PROXY_IP, ip: WORKSPACE_PROXY_IP }));
    iptables.rules = "-A PREROUTING -d 172.20.0.1/32 -p tcp -m tcp --dport 3128 -j DNAT --to-destination 172.20.0.2:3128";
    iptables.checkExists = true;
    await setup();
    expect(iptables.calls.map((a) => a[3])).toEqual(["-S", "-C"]);
  });
});

describe("dockerService.startContainer — proxy guard", () => {
  it("does not start a workspace when the proxy is not ready", async () => {
    vi.spyOn(egressProxyService, "assertReadyForWorkspaces").mockRejectedValue(new Error("proxy down"));
    await expect(dockerService.startContainer("ws-1")).rejects.toThrow("proxy down");
    expect(docker.start).not.toHaveBeenCalled();
  });

  it("starts the workspace once the proxy is ready", async () => {
    vi.spyOn(egressProxyService, "assertReadyForWorkspaces").mockResolvedValue();
    docker.start.mockResolvedValue(undefined);
    await dockerService.startContainer("ws-1");
    expect(docker.start).toHaveBeenCalledOnce();
  });
});

describe("dockerService.stopAfterError", () => {
  it("does nothing without a container id", async () => {
    await dockerService.stopAfterError(null);
    expect(docker.stop).not.toHaveBeenCalled();
  });

  it("stops the container", async () => {
    docker.stop.mockResolvedValue(undefined);
    await dockerService.stopAfterError("ws-1");
    expect(docker.stop).toHaveBeenCalledOnce();
  });

  it("never throws: the ERROR status is already the outcome", async () => {
    docker.stop.mockRejectedValue(new Error("daemon down"));
    await expect(dockerService.stopAfterError("ws-1")).resolves.toBeUndefined();
  });
});
