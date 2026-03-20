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
    WORKSPACE_IMAGE,
    WORKSPACE_NETWORK,
} from './workspace.constants';
import type { DockerContainerInfo, DockerCreateOptions } from './workspace.types';

const log = logger.child({ module: 'workspace:docker' });

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

    // Build environment variables
    const envArray = [
      `BRIDGE_AUTH_TOKEN=${bridgeAuthToken}`,
      `BRIDGE_PORT=${BRIDGE_PORT}`,
      `WORKSPACE_DIR=/workspace`,
      `NODE_ENV=production`,
      `LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`,
      // Egress proxy (Phase 13.2): route outbound HTTP/HTTPS through Squid proxy
      // The proxy container runs on the workspace network, reachable via Docker DNS
      // as "2bot-proxy" (container name resolved automatically on the same network).
      `HTTP_PROXY=${process.env.WORKSPACE_PROXY_URL || 'http://2bot-proxy:3128'}`,
      `HTTPS_PROXY=${process.env.WORKSPACE_PROXY_URL || 'http://2bot-proxy:3128'}`,
      `http_proxy=${process.env.WORKSPACE_PROXY_URL || 'http://2bot-proxy:3128'}`,
      `https_proxy=${process.env.WORKSPACE_PROXY_URL || 'http://2bot-proxy:3128'}`,
      `NO_PROXY=localhost,127.0.0.1,.local,${process.env.WORKSPACE_HOST_API_IP || '172.20.0.1'}`,
      `no_proxy=localhost,127.0.0.1,.local,${process.env.WORKSPACE_HOST_API_IP || '172.20.0.1'}`,
      // Credential REST fallback: host API server accessible from container
      `CREDENTIAL_API_HOST=${process.env.WORKSPACE_HOST_API_IP || '172.20.0.1'}`,
      `CREDENTIAL_API_PORT=${process.env.WORKSPACE_HOST_API_PORT || '3002'}`,
      // Storage default quota (per-plugin quotas are managed dynamically via WebSocket)
      `STORAGE_QUOTA_MB=${process.env.STORAGE_QUOTA_MB ?? '50'}`,
      // Pass custom env vars
      ...Object.entries(options.env || {}).map(([k, v]) => `${k}=${v}`),
    ];

    // Build container config
    const container = await docker.createContainer({
      name: options.name,
      Image: options.image || WORKSPACE_IMAGE,
      Env: envArray,
      Labels: {
        [CONTAINER_LABELS.managed]: 'true',
        ...options.labels,
      },
      ExposedPorts: {
        [`${BRIDGE_PORT}/tcp`]: {},
      },
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
        
        // Drop all capabilities except what's needed
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'DAC_OVERRIDE', 'SETUID', 'SETGID'],

        // Restart policy (handled by our lifecycle service, not Docker)
        RestartPolicy: { Name: '' },

        // Publish bridge port for platform access
        PortBindings: {
          [`${BRIDGE_PORT}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }],  // Dynamic port
        },

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
    await container.start();
    log.info({ containerId }, 'Container started');
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
