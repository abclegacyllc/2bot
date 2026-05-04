/**
 * Docker Service
 * 
 * Low-level Docker container management via dockerode.
 * Handles creating, starting, stopping, removing containers,
 * managing volumes and networks.
 * 
 * This service does NOT manage database state — it only talks to Docker.
 * The workspace.service.ts orchestrates DB + Docker together.
 * 
 * @module modules/workspace/workspace-docker.service
 */

import Docker from 'dockerode';

import { logger } from '@/lib/logger';

import {
    BRIDGE_PORT,
    CONTAINER_LABELS,
    CONTAINER_STOP_TIMEOUT,
    WORKSPACE_HTTP_PORT_INTERNAL,
    WORKSPACE_IMAGE,
    WORKSPACE_NETWORK,
} from './workspace.constants';
import type { DockerContainerInfo, DockerCreateOptions } from './workspace.types';

const log = logger.child({ module: 'workspace:docker' });

// ===========================================
// Squid proxy IP resolution
// ===========================================
//
// We resolve the Squid proxy hostname ("2bot-proxy" by default) to an IP
// at container-creation time and inject the IP form of the URL as the
// HTTP(S)_PROXY env var. This neuters DNS-poisoning attacks where a malicious
// process inside the workspace network could spoof the "2bot-proxy" hostname
// and capture egress traffic.
//
// Cached for 60s so a burst of container creations doesn't hammer Docker.

let cachedProxyUrl: { url: string; expiresAt: number } | null = null;

async function resolveProxyUrl(): Promise<string> {
  // Explicit override: trust the operator.
  if (process.env.WORKSPACE_PROXY_URL) return process.env.WORKSPACE_PROXY_URL;

  const now = Date.now();
  if (cachedProxyUrl && cachedProxyUrl.expiresAt > now) return cachedProxyUrl.url;

  const proxyName = process.env.WORKSPACE_PROXY_CONTAINER || '2bot-proxy';
  const proxyPort = process.env.WORKSPACE_PROXY_PORT || '3128';
  const fallback = `http://${proxyName}:${proxyPort}`;

  try {
    const docker = getDocker();
    const info = await docker.getContainer(proxyName).inspect();
    const networks = info.NetworkSettings?.Networks ?? {};
    const ip =
      networks[WORKSPACE_NETWORK]?.IPAddress ||
      Object.values(networks).find((n) => n?.IPAddress)?.IPAddress ||
      null;
    const url = ip ? `http://${ip}:${proxyPort}` : fallback;
    cachedProxyUrl = { url, expiresAt: now + 60_000 };
    log.debug({ proxyName, ip, url }, 'Resolved Squid proxy IP');
    return url;
  } catch (err) {
    log.warn(
      { err: (err as Error).message, proxyName, fallback },
      'Could not resolve Squid proxy by container — falling back to hostname'
    );
    return fallback;
  }
}

// ===========================================
// Docker Client (singleton)
// ===========================================

let dockerClient: Docker | null = null;

function getDocker(): Docker {
  if (!dockerClient) {
    // Connect via Unix socket (default for local Docker)
    const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    dockerClient = new Docker({ socketPath });
    log.info({ socketPath }, 'Docker client initialized');
  }
  return dockerClient;
}

// ===========================================
// Docker Service
// ===========================================

class DockerService {
  // ===========================================
  // Network Management
  // ===========================================

  /**
   * Ensure the workspace Docker network exists
   */
  async ensureNetwork(): Promise<void> {
    const docker = getDocker();
    try {
      const network = docker.getNetwork(WORKSPACE_NETWORK);
      await network.inspect();
      log.debug({ network: WORKSPACE_NETWORK }, 'Workspace network exists');
    } catch {
      log.info({ network: WORKSPACE_NETWORK }, 'Creating workspace network');
      await docker.createNetwork({
        Name: WORKSPACE_NETWORK,
        Driver: 'bridge',
        Internal: false,  // Containers need internet for git clone & npm install
        Labels: { [CONTAINER_LABELS.managed]: 'true' },
      });
    }
  }

  // ===========================================
  // Container Lifecycle
  // ===========================================

  /**
   * Create a new workspace container (does not start it)
   */
  async createContainer(options: DockerCreateOptions): Promise<{
    containerId: string;
  }> {
    const docker = getDocker();

    const { bridgeAuthToken } = options;

    // Resolve Squid by container IP so DNS poisoning of the
    // proxy hostname inside the workspace network can't redirect egress.
    const proxyUrl = await resolveProxyUrl();

    // Build environment variables
    const envArray = [
      `BRIDGE_AUTH_TOKEN=${bridgeAuthToken}`,
      `BRIDGE_PORT=${BRIDGE_PORT}`,
      `WORKSPACE_DIR=/workspace`,
      `NODE_ENV=production`,
      `LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`,
      // Egress proxy: route outbound HTTP/HTTPS through Squid by IP (resolved above).
      `HTTP_PROXY=${proxyUrl}`,
      `HTTPS_PROXY=${proxyUrl}`,
      `http_proxy=${proxyUrl}`,
      `https_proxy=${proxyUrl}`,
      `NO_PROXY=localhost,127.0.0.1,.local,${process.env.WORKSPACE_HOST_API_IP || '172.20.0.1'}`,
      `no_proxy=localhost,127.0.0.1,.local,${process.env.WORKSPACE_HOST_API_IP || '172.20.0.1'}`,
      // Credential REST fallback: host API server accessible from container
      `CREDENTIAL_API_HOST=${process.env.WORKSPACE_HOST_API_IP || '172.20.0.1'}`,
      `CREDENTIAL_API_PORT=${process.env.WORKSPACE_HOST_API_PORT || '3002'}`,
      // Storage default quota (per-plugin quotas are managed dynamically via WebSocket)
      `STORAGE_QUOTA_MB=${process.env.STORAGE_QUOTA_MB ?? '50'}`,
      // Phase 7.3c: user-facing HTTP listener port inside the container.
      // Disabled (`0`) by default; enabled with the fixed internal port whenever
      // the caller opts in via `options.enableHttpListener`.
      `WORKSPACE_HTTP_PORT=${options.enableHttpListener ? WORKSPACE_HTTP_PORT_INTERNAL : 0}`,
      // Pass custom env vars
      ...Object.entries(options.env || {}).map(([k, v]) => `${k}=${v}`),
    ];

    // Phase 7.3c: optionally expose a second port for the user-facing HTTP
    // listener. Docker assigns the host-side port dynamically (HostPort: '');
    // the caller retrieves it via `getHttpPort()` after start.
    const exposedPorts: Record<string, object> = {
      [`${BRIDGE_PORT}/tcp`]: {},
    };
    const portBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> = {
      [`${BRIDGE_PORT}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }],
    };
    if (options.enableHttpListener) {
      exposedPorts[`${WORKSPACE_HTTP_PORT_INTERNAL}/tcp`] = {};
      portBindings[`${WORKSPACE_HTTP_PORT_INTERNAL}/tcp`] = [
        { HostIp: '127.0.0.1', HostPort: '' },
      ];
    }

    // Build container config
    const container = await docker.createContainer({
      name: options.name,
      Image: options.image || WORKSPACE_IMAGE,
      Env: envArray,
      Labels: {
        [CONTAINER_LABELS.managed]: 'true',
        ...options.labels,
      },
      ExposedPorts: exposedPorts,
      HostConfig: {
        // Resource limits
        Memory: options.ramMb * 1024 * 1024,  // bytes
        MemoryReservation: Math.floor(options.ramMb * 0.5) * 1024 * 1024,
        NanoCpus: Math.floor(options.cpuCores * 1e9),  // nanoseconds
        
        // Storage limit: StorageOpt only works on XFS with pquota.
        // On ext4/overlay2 (our server), it throws an error, so we skip it.
        // Disk usage is monitored via bridge agent health.js instead.

        // Volume mount for persistent workspace data
        Binds: [
          `${options.volumePath}:/workspace:rw`,
        ],

        // Network
        NetworkMode: options.networkName || WORKSPACE_NETWORK,

        // Security: no privileged access
        Privileged: false,
        ReadonlyRootfs: false,

        // hardening:
        //   - no-new-privileges blocks setuid binaries from gaining caps
        //     (defense-in-depth on top of CapDrop=ALL)
        //   - Docker's default seccomp profile is left active (we do NOT pass
        //     seccomp=unconfined). It already blocks mount/umount2/pivot_root/
        //     chroot/setns/unshare(NEWNS) under unprivileged containers.
        SecurityOpt: ['no-new-privileges:true'],

        // Drop all capabilities except what's needed
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'DAC_OVERRIDE', 'SETUID', 'SETGID'],

        // Restart policy (handled by our lifecycle service, not Docker)
        RestartPolicy: { Name: '' },

        // Publish bridge port (and optional user-facing HTTP port) for platform access
        PortBindings: portBindings,

        // Logging
        LogConfig: {
          Type: 'json-file',
          Config: {
            'max-size': '10m',
            'max-file': '3',
          },
        },
      },
    });

    const containerId = container.id;
    log.info({ containerId, name: options.name }, 'Container created');

    return { containerId };
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<void> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    try {
      await container.start();
      log.info({ containerId }, 'Container started');
    } catch (err: unknown) {
      // Docker returns 304 when container is already running — not an error
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('304') || message.includes('already started') || message.includes('already running')) {
        log.debug({ containerId }, 'Container already running');
      } else {
        throw err;
      }
    }
  }

  /**
   * Stop a container gracefully
   */
  async stopContainer(containerId: string): Promise<void> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    try {
      await container.stop({ t: CONTAINER_STOP_TIMEOUT });
      log.info({ containerId }, 'Container stopped');
    } catch (err: unknown) {
      // Container may already be stopped
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not running') || message.includes('already stopped')) {
        log.debug({ containerId }, 'Container already stopped');
      } else {
        throw err;
      }
    }
  }

  /**
   * Force-kill a container
   */
  async killContainer(containerId: string): Promise<void> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    try {
      await container.kill();
      log.info({ containerId }, 'Container killed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not running')) {
        log.debug({ containerId }, 'Container not running, kill skipped');
      } else {
        throw err;
      }
    }
  }

  /**
   * Pause a container via the freezer cgroup (Docker pause).
   * All processes are SIGSTOP'd; memory state is preserved.
   * Use unpauseContainer() to resume instantly.
   * Idle workspace container suspend.
   */
  async pauseContainer(containerId: string): Promise<void> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    try {
      await container.pause();
      log.info({ containerId }, 'Container paused');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Docker returns 409 / "already paused" if already paused.
      if (message.includes('already paused') || message.includes('not running')) {
        log.debug({ containerId }, 'Container already paused or not running');
      } else {
        throw err;
      }
    }
  }

  /**
   * Resume a paused container.
   * Idle workspace container suspend.
   */
  async unpauseContainer(containerId: string): Promise<void> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    try {
      await container.unpause();
      log.info({ containerId }, 'Container unpaused');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Docker returns an error if not paused — treat as already-running.
      if (message.includes('not paused')) {
        log.debug({ containerId }, 'Container not paused, unpause skipped');
      } else {
        throw err;
      }
    }
  }

  /**
   * Remove a container (must be stopped first)
   */
  async removeContainer(containerId: string): Promise<void> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    await container.remove({ v: false });  // Don't auto-remove volumes
    log.info({ containerId }, 'Container removed');
  }

  /**
   * Force-remove a container (stop + remove)
   */
  async forceRemoveContainer(containerId: string): Promise<void> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    await container.remove({ force: true, v: false });
    log.info({ containerId }, 'Container force-removed');
  }

  // ===========================================
  // Container Inspection
  // ===========================================

  /**
   * Get container info from Docker
   */
  async inspectContainer(containerId: string): Promise<DockerContainerInfo> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    // Get the mapped bridge port (used for external inspection)
    const portBindings = info.NetworkSettings?.Ports?.[`${BRIDGE_PORT}/tcp`];
    const _mappedPort = portBindings?.[0]?.HostPort;

    return {
      containerId: info.Id,
      status: info.State?.Status || 'unknown',
      ipAddress: info.NetworkSettings?.Networks?.[WORKSPACE_NETWORK]?.IPAddress || undefined,
      startedAt: info.State?.StartedAt || undefined,
      finishedAt: info.State?.FinishedAt || undefined,
      exitCode: info.State?.ExitCode,
      running: info.State?.Running || false,
      health: info.State?.Health?.Status,
    };
  }

  /**
   * Get the host-mapped bridge port for a running container
   */
  async getBridgePort(containerId: string): Promise<number | null> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    const portBindings = info.NetworkSettings?.Ports?.[`${BRIDGE_PORT}/tcp`];
    const hostPort = portBindings?.[0]?.HostPort;

    return hostPort ? parseInt(hostPort, 10) : null;
  }

  /**
   * Get the host-side port bound to the container's user-facing HTTP listener
   * (Phase 7.3c). Returns null when the container was created without
   * `enableHttpListener` or before the mapping is published.
   */
  async getHttpPort(containerId: string): Promise<number | null> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    const portBindings =
      info.NetworkSettings?.Ports?.[`${WORKSPACE_HTTP_PORT_INTERNAL}/tcp`];
    const hostPort = portBindings?.[0]?.HostPort;

    return hostPort ? parseInt(hostPort, 10) : null;
  }

  // ===========================================
  // Container Log Retrieval
  // ===========================================

  /**
   * Get Docker container logs (stdout/stderr) 
   */
  async getContainerLogs(containerId: string, options: {
    tail?: number;
    since?: number;
    stderr?: boolean;
  } = {}): Promise<string> {
    const docker = getDocker();
    const container = docker.getContainer(containerId);

    const logBuffer = await container.logs({
      stdout: true,
      stderr: options.stderr !== false,
      tail: options.tail || 100,
      since: options.since,
      follow: false,
    });

    // dockerode returns a Buffer with Docker stream multiplexing headers
    // Each frame: [stream_type(1) + 0(3) + size(4)] + payload
    return stripDockerHeaders(logBuffer as unknown as Buffer);
  }

  // ===========================================
  // Volume Management
  // ===========================================

  /**
   * Ensure workspace volume directory exists on host
   */
  async ensureVolumeDir(volumePath: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.mkdir(volumePath, { recursive: true });
    // Set ownership to 1000:1000 (node user inside container)
    try {
      await fs.chown(volumePath, 1000, 1000);
    } catch {
      // May not have permission on some systems (Docker Desktop)
      log.debug({ volumePath }, 'Could not chown volume dir (may be normal on Docker Desktop)');
    }
  }

  // ===========================================
  // Image Management
  // ===========================================

  /**
   * Check if workspace image exists locally
   */
  async imageExists(imageName: string = WORKSPACE_IMAGE): Promise<boolean> {
    const docker = getDocker();
    try {
      await docker.getImage(imageName).inspect();
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * List all managed workspace containers
   */
  async listManagedContainers(): Promise<Docker.ContainerInfo[]> {
    const docker = getDocker();
    return docker.listContainers({
      all: true,
      filters: {
        label: [`${CONTAINER_LABELS.managed}=true`],
      },
    });
  }

  /**
   * Get Docker system info (for admin dashboard)
   */
  async getSystemInfo(): Promise<{
    containers: number;
    containersRunning: number;
    containersPaused: number;
    containersStopped: number;
    images: number;
    memoryTotal: number;
    cpus: number;
  }> {
    const docker = getDocker();
    const info = await docker.info();
    return {
      containers: info.Containers,
      containersRunning: info.ContainersRunning,
      containersPaused: info.ContainersPaused,
      containersStopped: info.ContainersStopped,
      images: info.Images,
      memoryTotal: info.MemTotal,
      cpus: info.NCPU,
    };
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Strip Docker stream multiplexing headers from log output.
 * Docker multiplexes stdout/stderr with 8-byte headers per frame.
 */
function stripDockerHeaders(buffer: Buffer): string {
  if (!Buffer.isBuffer(buffer)) {
    return String(buffer);
  }

  const output: string[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;

    // Header: [type(1), 0, 0, 0, size(4 big-endian)]
    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;

    if (offset + size > buffer.length) break;
    output.push(buffer.subarray(offset, offset + size).toString('utf-8'));
    offset += size;
  }

  return output.length > 0 ? output.join('') : buffer.toString('utf-8');
}

// ===========================================
// Singleton Export
// ===========================================

export const dockerService = new DockerService();
