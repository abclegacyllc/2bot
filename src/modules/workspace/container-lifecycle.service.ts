/**
 * Container Lifecycle Service
 * 
 * Manages workspace container health checks, auto-stop for idle containers,
 * automatic restarts on failure, and resource usage monitoring.
 * 
 * Runs periodic checks on all managed containers and takes action:
 * - Health check → mark unhealthy, trigger restart
 * - Idle check → auto-stop containers to save resources
 * - Resource check → emit warnings for OOM / disk-full
 * 
 * @module modules/workspace/container-lifecycle.service
 */

import { decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import { pluginDeployService } from '@/modules/plugin/plugin-deploy.service';
import { pushAllWorkflowCaches } from '@/modules/workflow/workflow-cache.service';
import { workspaceAuditService } from './workspace-audit.service';

import { bridgeClientManager } from './bridge-client.service';
import { dockerService } from './workspace-docker.service';
import {
    HEALTH_CHECK_INTERVAL,
    IDLE_CHECK_INTERVAL,
    MAX_HEALTH_FAILURES,
    RESTART_COOLDOWN
} from './workspace.constants';
import type { HealthCheckResult, RestartDecision } from './workspace.types';

const log = logger.child({ module: 'workspace:lifecycle' });

// ===========================================
// Container Lifecycle Service
// ===========================================

class ContainerLifecycleService {
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // Track last restart time per container to enforce cooldown
  private lastRestartTime: Map<string, number> = new Map();

  // Track containers that have been synced (plugin migration + start) this server lifetime.
  // Health check triggers startAllForUser once per container to ensure bot-dir migration runs.
  private syncedContainers: Set<string> = new Set();

  // ===========================================
  // Lifecycle Loop
  // ===========================================

  /**
   * Start periodic health and idle checks
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    log.info('Container lifecycle service started');

    // Reconnect to containers that were RUNNING before platform restart
    this.reconnectRunningContainers().catch(err => {
      log.error({ error: err.message }, 'Restart recovery failed');
    });

    // Clean up containers stuck in transitional states (crash recovery)
    this.cleanupStaleContainers().catch(err => {
      log.error({ error: err.message }, 'Stale container cleanup failed');
    });

    // Health checks
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks().catch(err => {
        log.error({ error: err.message }, 'Health check cycle failed');
      });
    }, HEALTH_CHECK_INTERVAL);

    // Idle/auto-stop checks
    this.idleCheckInterval = setInterval(() => {
      this.runIdleChecks().catch(err => {
        log.error({ error: err.message }, 'Idle check cycle failed');
      });
    }, IDLE_CHECK_INTERVAL);
  }

  /**
   * Stop periodic checks
   */
  stop(): void {
    this.running = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    log.info('Container lifecycle service stopped');
  }

  // ===========================================
  // Health Check
  // ===========================================

  /**
   * Run health checks on all RUNNING containers
   */
  async runHealthChecks(): Promise<void> {
    const containers = await prisma.workspaceContainer.findMany({
      where: { status: 'RUNNING' },
      select: {
        id: true,
        containerId: true,
        containerName: true,
        userId: true,
        organizationId: true,
        healthCheckFails: true,
        autoRestart: true,
        maxRestarts: true,
        restartCount: true,
        bridgePort: true,
        bridgeAuthToken: true,
      },
    });

    if (containers.length === 0) return;

    log.debug({ count: containers.length }, 'Running health checks');

    for (const container of containers) {
      try {
        await this.checkContainerHealth(container);
      } catch (err) {
        log.error({
          containerDbId: container.id,
          error: (err as Error).message,
        }, 'Health check failed for container');
      }
    }
  }

  /**
   * Check health of a single container
   */
  private async checkContainerHealth(container: {
    id: string;
    containerId: string | null;
    containerName: string;
    userId: string;
    organizationId: string | null;
    healthCheckFails: number;
    autoRestart: boolean;
    maxRestarts: number;
    restartCount: number;
    bridgePort: number | null;
    bridgeAuthToken: string | null;
  }): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      containerId: container.id,
      healthy: false,
      lastCheck: new Date(),
    };

    if (!container.containerId) {
      return result;
    }

    try {
      // Check Docker container status
      const info = await dockerService.inspectContainer(container.containerId);
      
      if (!info.running) {
        // Container stopped unexpectedly
        log.warn({ containerDbId: container.id, containerName: container.containerName }, 'Container not running');
        
        await this.handleUnhealthy(container);
        return result;
      }

      // Try bridge agent health check via existing client
      let client = bridgeClientManager.getExistingClient(container.id);

      // Always verify Docker port for running containers — handles external restarts
      // where Docker assigns a new ephemeral port but the DB still has the old one.
      if (container.bridgePort && container.containerId) {
        try {
          const actualPort = await dockerService.getBridgePort(container.containerId);
          if (actualPort && actualPort !== container.bridgePort) {
            log.info({ containerDbId: container.id, oldPort: container.bridgePort, newPort: actualPort }, 'Health check: bridge port changed, updating DB');
            await prisma.workspaceContainer.update({
              where: { id: container.id },
              data: { bridgePort: actualPort },
            });
            container.bridgePort = actualPort;

            // Destroy stale client (reconnecting to wrong port) so a fresh one is created
            bridgeClientManager.removeClient(container.id);
            client = null;
          }
        } catch (err) {
          log.debug({ containerDbId: container.id, error: (err as Error).message }, 'Health check: failed to verify Docker port');
        }
      }

      // If no existing client AND no reconnecting client, try to establish one.
      // Do NOT create a new client if an auto-reconnecting client exists —
      // that would cause "Replacing existing platform connection" churn.
      // Also respects bridge leases: if another server instance holds the lease,
      // this server won't try to connect (prevents dev+prod connection storm).
      if (!client && !bridgeClientManager.hasClient(container.id) && container.bridgePort && container.bridgeAuthToken) {
        try {
          const authToken = container.bridgeAuthToken.startsWith('v1:')
            ? decrypt(container.bridgeAuthToken)
            : container.bridgeAuthToken;
          client = await bridgeClientManager.getClient(container.id, container.bridgePort, authToken);
        } catch (err) {
          log.debug({ containerDbId: container.id, error: (err as Error).message }, 'Health check: bridge reconnect attempt failed');
        }
      }

      if (client) {
        try {
          const health = await client.systemHealth() as { status: string; uptime: number };
          result.healthy = health.status === 'healthy';
          result.uptime = health.uptime;
        } catch {
          // Bridge not responding but Docker is running — still consider healthy
          // The bridge client will handle its own reconnection
          result.healthy = true;
          log.debug({ containerDbId: container.id }, 'Bridge health check failed but Docker is running');
        }

        // One-time plugin sync per container per server lifetime.
        // Ensures bot-dir migration + plugin autostart runs even if
        // the container was already running when this server started.
        if (!this.syncedContainers.has(container.id)) {
          this.syncedContainers.add(container.id);
          void pluginDeployService.startAllForUser(
            container.userId,
            container.organizationId ?? null,
            container.id,
          ).catch((err) => {
            log.warn({ containerDbId: container.id, error: (err as Error).message }, 'Plugin sync on health check failed (non-blocking)');
          });
          void pushAllWorkflowCaches(container.userId, container.organizationId ?? null);
        }
      } else {
        // No bridge client but Docker container is running — healthy at Docker level.
        // Bridge auto-reconnect or next webhook will establish the connection.
        result.healthy = true;
      }

      // Update health status in DB
      if (result.healthy) {
        // Reset failure count on success
        if (container.healthCheckFails > 0) {
          await prisma.workspaceContainer.update({
            where: { id: container.id },
            data: {
              healthCheckFails: 0,
              lastHealthCheck: new Date(),
            },
          });
        } else {
          await prisma.workspaceContainer.update({
            where: { id: container.id },
            data: { lastHealthCheck: new Date() },
          });
        }
      } else {
        await this.handleUnhealthy(container);
      }

    } catch (err) {
      log.error({
        containerDbId: container.id,
        error: (err as Error).message,
      }, 'Docker inspect failed during health check');
      await this.handleUnhealthy(container);
    }

    return result;
  }

  /**
   * Handle an unhealthy container — increment failures, maybe restart or mark ERROR
   */
  private async handleUnhealthy(container: {
    id: string;
    containerId: string | null;
    containerName: string;
    userId: string;
    healthCheckFails: number;
    autoRestart: boolean;
    maxRestarts: number;
    restartCount: number;
  }): Promise<void> {
    const newFailCount = container.healthCheckFails + 1;

    if (newFailCount >= MAX_HEALTH_FAILURES) {
      // Too many failures — decide restart or error
      const decision = this.makeRestartDecision(container);

      if (decision.shouldRestart) {
        log.info({ containerDbId: container.id, reason: decision.reason }, 'Auto-restarting container');
        await this.restartContainer(container);
      } else {
        log.error({ containerDbId: container.id, reason: decision.reason }, 'Container marked as ERROR');
        await prisma.workspaceContainer.update({
          where: { id: container.id },
          data: {
            status: 'ERROR',
            errorMessage: decision.reason,
            healthCheckFails: newFailCount,
            lastHealthCheck: new Date(),
          },
        });

        // Disconnect bridge client
        bridgeClientManager.removeClient(container.id);
      }
    } else {
      // Increment failure count
      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          healthCheckFails: newFailCount,
          lastHealthCheck: new Date(),
        },
      });
    }
  }

  /**
   * Decide whether to restart a failed container
   */
  private makeRestartDecision(container: {
    id: string;
    autoRestart: boolean;
    maxRestarts: number;
    restartCount: number;
  }): RestartDecision {
    // Check if auto-restart is enabled
    if (!container.autoRestart) {
      return {
        containerDbId: container.id,
        shouldRestart: false,
        reason: 'Auto-restart disabled',
        currentRestarts: container.restartCount,
        maxRestarts: container.maxRestarts,
      };
    }

    // Check restart count limit
    if (container.restartCount >= container.maxRestarts) {
      return {
        containerDbId: container.id,
        shouldRestart: false,
        reason: `Max restarts reached (${container.restartCount}/${container.maxRestarts})`,
        currentRestarts: container.restartCount,
        maxRestarts: container.maxRestarts,
      };
    }

    // Check cooldown
    const lastRestart = this.lastRestartTime.get(container.id);
    if (lastRestart && (Date.now() - lastRestart) < RESTART_COOLDOWN) {
      return {
        containerDbId: container.id,
        shouldRestart: false,
        reason: 'Restart cooldown in effect',
        currentRestarts: container.restartCount,
        maxRestarts: container.maxRestarts,
      };
    }

    return {
      containerDbId: container.id,
      shouldRestart: true,
      reason: 'Auto-restart triggered',
      currentRestarts: container.restartCount,
      maxRestarts: container.maxRestarts,
    };
  }

  /**
   * Restart a container (stop → start via Docker)
   */
  private async restartContainer(container: {
    id: string;
    containerId: string | null;
    containerName: string;
    userId: string;
    restartCount: number;
  }): Promise<void> {
    if (!container.containerId) return;

    this.lastRestartTime.set(container.id, Date.now());
    bridgeClientManager.removeClient(container.id);

    try {
      // Update status
      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'STARTING',
          restartCount: container.restartCount + 1,
          healthCheckFails: 0,
          errorMessage: null,
        },
      });

      // Restart via Docker
      await dockerService.stopContainer(container.containerId);
      await dockerService.startContainer(container.containerId);

      // Discover new bridge port (Docker assigns a new random host port on restart)
      const bridgePort = await dockerService.getBridgePort(container.containerId);

      // Update status to RUNNING with new bridge port
      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          bridgePort,
          healthCheckFails: 0,
        },
      });

      log.info({
        containerDbId: container.id,
        restartCount: container.restartCount + 1,
      }, 'Container restarted successfully');

      workspaceAuditService.log({
        containerId: container.id,
        containerName: container.containerName,
        action: 'AUTO_RESTART',
        metadata: { restartCount: container.restartCount + 1 },
      });

    } catch (err) {
      log.error({
        containerDbId: container.id,
        error: (err as Error).message,
      }, 'Container restart failed');

      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'ERROR',
          errorMessage: `Restart failed: ${(err as Error).message}`,
        },
      });

      workspaceAuditService.log({
        containerId: container.id,
        containerName: container.containerName,
        action: 'AUTO_RESTART',
        success: false,
        errorMessage: (err as Error).message,
      });
    }
  }

  // ===========================================
  // Idle / Auto-Stop
  // ===========================================

  /**
   * Check all running containers for idle timeout
   */
  async runIdleChecks(): Promise<void> {
    const containers = await prisma.workspaceContainer.findMany({
      where: {
        status: 'RUNNING',
        autoStopMinutes: { not: null },
      },
      select: {
        id: true,
        containerId: true,
        containerName: true,
        userId: true,
        lastActivityAt: true,
        autoStopMinutes: true,
      },
    });

    if (containers.length === 0) return;

    const now = Date.now();

    for (const container of containers) {
      try {
        const lastActivity = container.lastActivityAt?.getTime() || 0;
        const idleMs = now - lastActivity;
        const idleMinutes = Math.floor(idleMs / 60_000);
        const autoStopMinutes = container.autoStopMinutes ?? 0;

        if (idleMinutes >= autoStopMinutes) {
          log.info({
            containerDbId: container.id,
            idleMinutes,
            autoStopMinutes,
          }, 'Auto-stopping idle container');

          await this.stopIdleContainer(container);
        }
      } catch (err) {
        log.error({
          containerDbId: container.id,
          error: (err as Error).message,
        }, 'Idle check failed for container');
      }
    }
  }

  /**
   * Stop an idle container
   */
  private async stopIdleContainer(container: {
    id: string;
    containerId: string | null;
    containerName: string;
    userId: string;
  }): Promise<void> {
    if (!container.containerId) return;

    // Disconnect bridge
    bridgeClientManager.removeClient(container.id);

    try {
      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: { status: 'STOPPING' },
      });

      await dockerService.stopContainer(container.containerId);

      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'STOPPED',
          stoppedAt: new Date(),
        },
      });

      log.info({ containerDbId: container.id }, 'Container auto-stopped (idle)');

      workspaceAuditService.log({
        containerId: container.id,
        containerName: container.containerName,
        action: 'AUTO_STOP',
        metadata: { reason: 'idle' },
      });
    } catch (err) {
      log.error({
        containerDbId: container.id,
        error: (err as Error).message,
      }, 'Auto-stop failed');

      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'ERROR',
          errorMessage: `Auto-stop failed: ${(err as Error).message}`,
        },
      });
    }
  }

  // ===========================================
  // Activity Tracking
  // ===========================================

  /**
   * Update last activity timestamp for a container
   * Called by workspace service on user actions (file ops, terminal, etc.)
   */
  async touchActivity(containerDbId: string): Promise<void> {
    try {
      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { lastActivityAt: new Date() },
      });
    } catch {
      // Silently fail — this is a non-critical update
    }
  }

  // ===========================================
  // Platform Restart Recovery
  // ===========================================

  /**
   * Reconnect bridge clients for containers that were RUNNING before platform restart.
   * Verifies that Docker containers are actually running, marks dead ones as STOPPED.
   */
  async reconnectRunningContainers(): Promise<void> {
    const containers = await prisma.workspaceContainer.findMany({
      where: { status: 'RUNNING' },
      select: {
        id: true,
        containerId: true,
        containerName: true,
        bridgePort: true,
        bridgeAuthToken: true,
        userId: true,
        organizationId: true,
      },
    });

    if (containers.length === 0) return;

    log.info({ count: containers.length }, 'Reconnecting to running containers after platform restart');

    let reconnected = 0;
    let stopped = 0;

    for (const container of containers) {
      try {
        // Verify Docker container is actually running
        if (!container.containerId) {
          throw new Error('No Docker container ID');
        }

        const info = await dockerService.inspectContainer(container.containerId);
        const isRunning = info?.running === true;

        if (!isRunning) {
          // Container is not actually running in Docker — mark as STOPPED
          await prisma.workspaceContainer.update({
            where: { id: container.id },
            data: {
              status: 'STOPPED',
              stoppedAt: new Date(),
              errorMessage: 'Container was not running after platform restart',
            },
          });
          stopped++;
          log.warn({ containerDbId: container.id, containerName: container.containerName }, 'Container not running in Docker — marked STOPPED');
          continue;
        }

        // Container is running — verify bridge port (may have changed if Docker restarted the container)
        const actualBridgePort = await dockerService.getBridgePort(container.containerId);
        if (actualBridgePort && actualBridgePort !== container.bridgePort) {
          log.info({ containerDbId: container.id, oldPort: container.bridgePort, newPort: actualBridgePort }, 'Bridge port changed — updating DB');
          await prisma.workspaceContainer.update({
            where: { id: container.id },
            data: { bridgePort: actualBridgePort },
          });
          container.bridgePort = actualBridgePort;
        }

        // Reconnect bridge client
        if (container.bridgePort && container.bridgeAuthToken) {
          // Decrypt the token — supports both encrypted (v1:...) and legacy plaintext tokens
          const authToken = container.bridgeAuthToken.startsWith('v1:')
            ? decrypt(container.bridgeAuthToken)
            : container.bridgeAuthToken;

          await bridgeClientManager.getClient(
            container.id,
            container.bridgePort,
            authToken,
          );
          reconnected++;
          log.info({ containerDbId: container.id, containerName: container.containerName }, 'Bridge client reconnected');

          // Mark as synced so health check doesn't re-trigger startAllForUser
          this.syncedContainers.add(container.id);

          // Start all enabled plugins (recover missing files from template if needed)
          void pluginDeployService.startAllForUser(
            container.userId,
            container.organizationId ?? null,
            container.id,
          ).then((result) => {
            if (result.broken.length > 0) {
              log.warn({ containerDbId: container.id, broken: result.broken, started: result.started, failed: result.failed }, 'Some plugins are broken after reconnect');
            }
          }).catch((err) => {
            log.warn({ containerDbId: container.id, error: (err as Error).message }, 'Plugin start after reconnect failed (non-blocking)');
          });

          // Push workflow caches to container (non-blocking)
          void pushAllWorkflowCaches(container.userId, container.organizationId ?? null);
        }
      } catch (err) {
        const msg = (err as Error).message ?? '';

        // If another server instance already holds the bridge lease,
        // the container is still running — just managed elsewhere.
        // Skip it instead of marking STOPPED.
        if (msg.includes('Bridge connection blocked by lease')) {
          log.info({
            containerDbId: container.id,
            containerName: container.containerName,
            error: msg,
          }, 'Container managed by another server instance — skipping reconnect');
          continue;
        }

        log.error({
          containerDbId: container.id,
          containerName: container.containerName,
          error: msg,
        }, 'Failed to reconnect container — marking STOPPED');

        // Mark as STOPPED since we can't reach it
        await prisma.workspaceContainer.update({
          where: { id: container.id },
          data: {
            status: 'STOPPED',
            stoppedAt: new Date(),
            errorMessage: `Platform restart recovery failed: ${msg}`,
          },
        });
        stopped++;
      }
    }

    log.info({ reconnected, stopped, total: containers.length }, 'Platform restart recovery complete');
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * Clean up stale containers that are in transitional states
   * (e.g., CREATING/STARTING that never completed — server crash recovery)
   */
  async cleanupStaleContainers(): Promise<void> {
    const staleTimeout = 5 * 60 * 1000; // 5 minutes
    const cutoff = new Date(Date.now() - staleTimeout);

    // Find containers stuck in transitional states
    const stale = await prisma.workspaceContainer.findMany({
      where: {
        status: { in: ['CREATING', 'STARTING', 'STOPPING'] },
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        containerId: true,
        containerName: true,
        status: true,
      },
    });

    for (const container of stale) {
      log.warn({ containerDbId: container.id, status: container.status }, 'Cleaning up stale container');

      // Try to stop/remove Docker container if it exists
      if (container.containerId) {
        try {
          await dockerService.forceRemoveContainer(container.containerId);
        } catch {
          // Container might not exist in Docker anymore
        }
      }

      // Mark as STOPPED
      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'STOPPED',
          errorMessage: 'Container was in stale transitional state — cleaned up',
          stoppedAt: new Date(),
        },
      });
    }

    if (stale.length > 0) {
      log.info({ count: stale.length }, 'Stale containers cleaned up');
    }
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const containerLifecycleService = new ContainerLifecycleService();
