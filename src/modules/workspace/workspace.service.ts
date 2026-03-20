/**
 * Workspace Service
 * 
 * High-level orchestrator for workspace operations.
 * Coordinates between Docker, bridge client, database, and billing.
 * 
 * This is the service that API routes call. It handles:
 * - Creating/starting/stopping/destroying workspaces
 * - Resource allocation checks (plan limits, org pools)
 * - Proxying file/plugin/git/terminal/package commands to bridge agent
 * - Activity tracking for idle auto-stop
 * 
 * Supports both PERSONAL and ORGANIZATION workspaces.
 * 
 * @module modules/workspace/workspace.service
 */

import crypto from 'crypto';

import { decrypt, encrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
    getIncludedOrgWorkspace,
    type OrgPlanType,
} from '@/shared/constants/org-plans';
import {
    getIncludedWorkspace
} from '@/shared/constants/plans';
import {
    calculateTotalWorkspace,
    hasWorkspaceEnabled,
    type WorkspaceAddonTier,
} from '@/shared/constants/workspace-addons';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { ServiceContext } from '@/shared/types/context';
import type { BridgeAction, WorkspaceResourceAllocation, WorkspaceStatus } from '@/shared/types/workspace';

import { pluginDeployService } from '@/modules/plugin/plugin-deploy.service';
import { pluginWorkspaceSyncService } from '@/modules/plugin/plugin-workspace-sync.service';
import { pushAllWorkflowCaches } from '@/modules/workflow/workflow-cache.service';
import { bridgeClientManager, type BridgeClient } from './bridge-client.service';
import { gatewayRouteService } from './gateway-route.service';
import { workspaceAuditService } from './workspace-audit.service';
import { dockerService } from './workspace-docker.service';
import { networkEgressService } from './workspace-iptables.service';
import { egressProxyService } from './workspace-squid.service';
import {
    BRIDGE_AUTH_TOKEN_LENGTH,
    BRIDGE_PORT,
    CONTAINER_LABELS,
    CONTAINER_START_TIMEOUT,
    DEFAULT_AUTO_STOP_MINUTES,
    DEFAULT_RESOURCES,
    FREE_TIER_AUTO_STOP_MINUTES,
    WORKSPACE_IMAGE,
    WORKSPACE_NETWORK,
    containerVolumePath,
    orgContainerName,
    personalContainerName,
} from './workspace.constants';
import type { OrgPoolUsage, WorkspaceOperationResult } from './workspace.types';

const log = logger.child({ module: 'workspace' });

// ===========================================
// Workspace Service
// ===========================================

/** Cache entry for verified container auth (avoids DB query on every operation) */
interface ContainerAuthCache {
  userId: string;
  organizationId: string | null;
  status: string;
  bridgePort: number | null;
  bridgeAuthToken: string | null;
  cachedAt: number;
}

/** How long a container auth cache entry is valid (ms) */
const AUTH_CACHE_TTL = 30_000; // 30 seconds

/** How often to flush activity timestamps to DB (ms) */
const ACTIVITY_FLUSH_INTERVAL = 10_000; // 10 seconds

class WorkspaceService {
  /** In-memory auth cache: containerDbId → auth info */
  private authCache = new Map<string, ContainerAuthCache>();

  /** Pending activity touches — flushed every ACTIVITY_FLUSH_INTERVAL */
  private pendingActivity = new Map<string, Date>();
  private activityFlushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start activity flush timer
    this.activityFlushTimer = setInterval(() => {
      this.flushActivity().catch(() => {});
    }, ACTIVITY_FLUSH_INTERVAL);
  }

  /** Flush pending activity timestamps to DB in a single batch */
  private async flushActivity(): Promise<void> {
    if (this.pendingActivity.size === 0) return;
    const batch = new Map(this.pendingActivity);
    this.pendingActivity.clear();

    for (const [containerId, timestamp] of batch) {
      try {
        await prisma.workspaceContainer.update({
          where: { id: containerId },
          data: { lastActivityAt: timestamp },
        });
      } catch {
        // Non-critical — silently skip
      }
    }
  }

  /** Queue an activity touch (batched, not immediate DB write) */
  touchActivity(containerDbId: string): void {
    this.pendingActivity.set(containerDbId, new Date());
  }

  // ===========================================
  // Workspace Lifecycle
  // ===========================================

  /**
   * Create and start a workspace container
   * 
   * For PERSONAL: uses user's plan resources
   * For ORGANIZATION: uses org's workspace pool allocation
   */
  async createWorkspace(
    ctx: ServiceContext,
    options: {
      organizationId?: string;
      autoStopMinutes?: number;
    } = {},
  ): Promise<WorkspaceOperationResult> {
    const isOrg = !!options.organizationId;
    const ownerType = isOrg ? 'ORGANIZATION' : 'PERSONAL';

    log.info({
      userId: ctx.userId,
      organizationId: options.organizationId,
      ownerType,
    }, 'Creating workspace');

    // 0. Org Membership Validation (Audit Fix)
    if (isOrg && !ctx.isAdmin()) {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.userId,
            organizationId: options.organizationId!,
          },
        },
        select: { status: true },
      });

      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenError('You are not a member of this organization');
      }
    }

    // 1. Check if user already has a container for this context
    const existing = await prisma.workspaceContainer.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: options.organizationId || null,
        status: { not: 'DESTROYED' },
      },
    });

    if (existing) {
      // If container exists but is stopped/error, restart it
      if (existing.status === 'STOPPED' || existing.status === 'ERROR') {
        return this.startWorkspace(ctx, existing.id);
      }
      // If already running or starting
      if (existing.status === 'RUNNING' || existing.status === 'STARTING' || existing.status === 'CREATING') {
        return {
          success: true,
          message: `Workspace already ${existing.status.toLowerCase()}`,
          containerId: existing.id,
          status: existing.status,
        };
      }
    }

    // 2. Check resource allocation
    const resources = await this.getResourceAllocation(ctx, options.organizationId);
    if (!resources) {
      throw new ForbiddenError(
        isOrg
          ? 'Organization plan does not include workspace access'
          : 'Your plan does not include workspace access. Upgrade to Pro or purchase a workspace add-on.',
      );
    }

    // 3. Generate container name
    let containerName: string;
    if (isOrg) {
      const org = await prisma.organization.findUnique({
        where: { id: options.organizationId },
        select: { slug: true },
      });
      if (!org) throw new NotFoundError('Organization not found');
      containerName = orgContainerName(org.slug, ctx.userId);
    } else {
      containerName = personalContainerName(ctx.userId);
    }

    // 4. Generate auth token for bridge agent
    const bridgeAuthToken = crypto.randomBytes(BRIDGE_AUTH_TOKEN_LENGTH).toString('hex');

    // 4b. Clean up any DESTROYED records with the same containerName (unique constraint)
    await prisma.workspaceContainer.deleteMany({
      where: {
        containerName,
        status: 'DESTROYED',
      },
    });

    // 5. Create database record
    const volumePath = containerVolumePath(containerName);
    // Auto-stop policy: free plans get 24h auto-stop, paid plans get no auto-stop (user can enable manually)
    const isFreeTier = !isOrg && (ctx.effectivePlan === 'FREE' || ctx.effectivePlan === 'STARTER');
    const autoStopValue = options.autoStopMinutes !== undefined
      ? options.autoStopMinutes
      : isFreeTier
        ? FREE_TIER_AUTO_STOP_MINUTES
        : DEFAULT_AUTO_STOP_MINUTES;
    const container = await prisma.workspaceContainer.create({
      data: {
        userId: ctx.userId,
        organizationId: options.organizationId || null,
        ownerType,
        containerName,
        imageName: WORKSPACE_IMAGE,
        status: 'CREATING',
        ramMb: resources.ramMb,
        cpuCores: resources.cpuCores,
        storageMb: resources.storageMb,
        volumePath,
        bridgePort: BRIDGE_PORT,
        autoStopMinutes: autoStopValue,
        autoRestart: true,
        maxRestarts: 5,
      },
    });

    try {
      // 6. Ensure network and volume directory
      await dockerService.ensureNetwork();
      await dockerService.ensureVolumeDir(volumePath);

      // 7. Create Docker container
      const { containerId } = await dockerService.createContainer({
        name: containerName,
        image: WORKSPACE_IMAGE,
        ramMb: resources.ramMb,
        cpuCores: resources.cpuCores,
        storageMb: resources.storageMb,
        volumePath,
        bridgeAuthToken,
        networkName: WORKSPACE_NETWORK,
        labels: {
          [CONTAINER_LABELS.userId]: ctx.userId,
          [CONTAINER_LABELS.orgId]: options.organizationId || '',
          [CONTAINER_LABELS.ownerType]: ownerType,
          [CONTAINER_LABELS.containerDbId]: container.id,
        },
        env: {},
      });

      // 8. Update DB with Docker container ID
      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          containerId,
          status: 'STARTING',
        },
      });

      // 9. Start the container
      await dockerService.startContainer(containerId);

      // 9b. Apply network egress rules (defense-in-depth, non-blocking)
      networkEgressService.applyEgressRules(containerId, container.id).catch(err => {
        log.warn({ containerDbId: container.id, error: (err as Error).message }, 'Egress rule application failed');
      });

      // 10. Wait for bridge agent to become healthy
      await this.waitForBridge(containerId, container.id);

      // 11. Get the mapped bridge port + container IP
      const bridgePort = await dockerService.getBridgePort(containerId);
      const containerInfo = await dockerService.inspectContainer(containerId);

      // 12. Update DB with final status + encrypted bridge auth token for reconnection
      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'RUNNING',
          bridgePort,
          ipAddress: containerInfo.ipAddress ?? null,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          healthCheckFails: 0,
          errorMessage: null,
          bridgeAuthToken: encrypt(bridgeAuthToken),
        },
      });

      // 14. Establish bridge connection
      if (!bridgePort) {
        throw new Error('Bridge port not available after container start');
      }
      await bridgeClientManager.getClient(
        container.id,
        bridgePort,
        bridgeAuthToken,
      );

      // 14b. Activate webhook routes (non-blocking)
      gatewayRouteService.activateRoutes(container.id).catch(err => {
        log.warn({ containerDbId: container.id, error: (err as Error).message }, 'Webhook route activation failed');
      });

      // 14c. Sync egress proxy ACLs for new container IP (non-blocking)
      egressProxyService.syncAllAcls().then(() => egressProxyService.reloadProxy()).catch(err => {
        log.warn({ error: (err as Error).message }, 'Egress ACL sync after create failed');
      });

      log.info({
        containerDbId: container.id,
        containerId,
        containerName,
      }, 'Workspace created and started');

      // 15. Start all enabled plugins in the new workspace (non-blocking)
      void pluginDeployService.startAllForUser(
        ctx.userId,
        options.organizationId ?? null,
        container.id,
      ).then((result) => {
        if (result.broken.length > 0) {
          log.warn({ containerDbId: container.id, broken: result.broken, started: result.started, failed: result.failed }, 'Some plugins are broken after workspace create');
        }
      }).catch((err) => {
        log.warn({ containerDbId: container.id, error: (err as Error).message }, 'Plugin start after create failed (non-blocking)');
      });

      // Push workflow caches to new container (non-blocking)
      void pushAllWorkflowCaches(ctx.userId, options.organizationId ?? null);

      // Audit: successful creation
      workspaceAuditService.log({
        userId: ctx.userId,
        containerId: container.id,
        containerName,
        action: 'CREATE',
        success: true,
        metadata: { ownerType, organizationId: options.organizationId, resources },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return {
        success: true,
        message: 'Workspace created and running',
        containerId: container.id,
        status: 'RUNNING',
      };

    } catch (err) {
      // Cleanup on failure
      log.error({
        containerDbId: container.id,
        error: (err as Error).message,
      }, 'Workspace creation failed');

      await prisma.workspaceContainer.update({
        where: { id: container.id },
        data: {
          status: 'ERROR',
          errorMessage: (err as Error).message,
        },
      });

      // Audit: failed creation
      workspaceAuditService.log({
        userId: ctx.userId,
        containerId: container.id,
        containerName,
        action: 'CREATE',
        success: false,
        errorMessage: (err as Error).message,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return {
        success: false,
        message: `Workspace creation failed: ${(err as Error).message}`,
        containerId: container.id,
        status: 'ERROR',
        error: (err as Error).message,
      };
    }
  }

  /**
   * Start an existing stopped workspace
   */
  async startWorkspace(ctx: ServiceContext, containerDbId: string): Promise<WorkspaceOperationResult> {
    const container = await this.getContainerForUser(ctx, containerDbId);

    if (container.status === 'RUNNING') {
      return { success: true, message: 'Workspace already running', containerId: containerDbId, status: 'RUNNING' };
    }

    if (!container.containerId) {
      throw new BadRequestError('Workspace has no Docker container — try creating a new one');
    }

    try {
      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { status: 'STARTING', errorMessage: null },
      });

      await dockerService.startContainer(container.containerId);

      // Apply network egress rules (defense-in-depth, non-blocking)
      networkEgressService.applyEgressRules(container.containerId, containerDbId).catch(err => {
        log.warn({ containerDbId, error: (err as Error).message }, 'Egress rule application failed');
      });

      await this.waitForBridge(container.containerId, containerDbId);

      const bridgePort = await dockerService.getBridgePort(container.containerId);
      const containerInfo = await dockerService.inspectContainer(container.containerId);

      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: {
          status: 'RUNNING',
          bridgePort,
          ipAddress: containerInfo.ipAddress ?? null,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          healthCheckFails: 0,
          restartCount: 0,
        },
      });

      log.info({ containerDbId }, 'Workspace started');

      // Activate webhook routes (non-blocking)
      gatewayRouteService.activateRoutes(containerDbId).catch(err => {
        log.warn({ containerDbId, error: (err as Error).message }, 'Webhook route activation failed');
      });

      // Sync egress proxy ACLs for container IP (non-blocking)
      egressProxyService.syncAllAcls().then(() => egressProxyService.reloadProxy()).catch(err => {
        log.warn({ error: (err as Error).message }, 'Egress ACL sync after start failed');
      });

      // Start all enabled plugins in the workspace (non-blocking)
      void pluginDeployService.startAllForUser(
        ctx.userId,
        container.organizationId ?? null,
        containerDbId,
      ).then((result) => {
        if (result.broken.length > 0) {
          log.warn({ containerDbId, broken: result.broken, started: result.started, failed: result.failed }, 'Some plugins are broken after workspace start');
        }
      }).catch((err) => {
        log.warn({ containerDbId, error: (err as Error).message }, 'Plugin start after workspace start failed (non-blocking)');
      });

      // Push workflow caches to container (non-blocking)
      void pushAllWorkflowCaches(ctx.userId, container.organizationId ?? null);

      workspaceAuditService.log({ userId: ctx.userId, containerId: containerDbId, action: 'START', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
      return { success: true, message: 'Workspace started', containerId: containerDbId, status: 'RUNNING' };

    } catch (err) {
      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { status: 'ERROR', errorMessage: (err as Error).message },
      });
      workspaceAuditService.log({ userId: ctx.userId, containerId: containerDbId, action: 'START', success: false, errorMessage: (err as Error).message });
      return { success: false, message: `Start failed: ${(err as Error).message}`, containerId: containerDbId, status: 'ERROR' };
    }
  }

  /**
   * Auto-start a STOPPED container for plugin execution (cold start path).
   *
   * Unlike `startWorkspace()`, this method:
   * - Does NOT require a full ServiceContext (no auth/audit)
   * - Does NOT trigger `startAllForUser()` (caller is already in plugin execution)
   * - Is called internally by the plugin executor when an event arrives
   *   but the user's container is STOPPED.
   *
   * @returns The container DB ID once RUNNING
   * @throws Error if the container cannot be started
   */
  async autoStartContainer(containerDbId: string): Promise<string> {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
    });

    if (!container) {
      throw new Error(`Container ${containerDbId} not found`);
    }

    if (container.status === 'RUNNING') {
      return containerDbId;
    }

    if (!container.containerId) {
      throw new Error('Container has no Docker container ID — cannot auto-start');
    }

    log.info({ containerDbId, userId: container.userId }, 'Auto-starting container for plugin execution (cold start)');

    await prisma.workspaceContainer.update({
      where: { id: containerDbId },
      data: { status: 'STARTING', errorMessage: null },
    });

    try {
      await dockerService.startContainer(container.containerId);

      // Apply network egress rules (non-blocking)
      networkEgressService.applyEgressRules(container.containerId, containerDbId).catch(err => {
        log.warn({ containerDbId, error: (err as Error).message }, 'Egress rule application failed during auto-start');
      });

      await this.waitForBridge(container.containerId, containerDbId);

      const bridgePort = await dockerService.getBridgePort(container.containerId);
      const containerInfo = await dockerService.inspectContainer(container.containerId);

      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: {
          status: 'RUNNING',
          bridgePort,
          ipAddress: containerInfo.ipAddress ?? null,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          healthCheckFails: 0,
          restartCount: 0,
        },
      });

      // Reconnect bridge client
      if (bridgePort && container.bridgeAuthToken) {
        const authToken = container.bridgeAuthToken.startsWith('v1:')
          ? decrypt(container.bridgeAuthToken)
          : container.bridgeAuthToken;
        await bridgeClientManager.getClient(containerDbId, bridgePort, authToken);
      }

      // Sync egress proxy ACLs for restarted container IP (non-blocking)
      egressProxyService.syncAllAcls().then(() => egressProxyService.reloadProxy()).catch(err => {
        log.warn({ error: (err as Error).message }, 'Egress ACL sync after restart failed');
      });

      log.info({ containerDbId, userId: container.userId }, 'Container auto-started successfully');
      return containerDbId;

    } catch (err) {
      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { status: 'ERROR', errorMessage: (err as Error).message },
      });
      throw new Error(`Auto-start failed: ${(err as Error).message}`);
    }
  }

  /**
   * Stop a running workspace
   */
  async stopWorkspace(ctx: ServiceContext, containerDbId: string): Promise<WorkspaceOperationResult> {
    const container = await this.getContainerForUser(ctx, containerDbId);
    this.authCache.delete(containerDbId);

    if (container.status === 'STOPPED') {
      return { success: true, message: 'Workspace already stopped', containerId: containerDbId, status: 'STOPPED' };
    }

    if (!container.containerId) {
      throw new BadRequestError('No Docker container to stop');
    }

    try {
      // Deactivate webhook routes before stopping
      await gatewayRouteService.deactivateRoutes(containerDbId);

      // Disconnect bridge
      bridgeClientManager.removeClient(containerDbId);

      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { status: 'STOPPING' },
      });

      // Remove egress rules before stopping
      if (container.containerId) {
        networkEgressService.removeEgressRules(container.containerId, containerDbId).catch(() => {});
      }

      await dockerService.stopContainer(container.containerId);

      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { status: 'STOPPED', stoppedAt: new Date() },
      });

      log.info({ containerDbId }, 'Workspace stopped');
      workspaceAuditService.log({ userId: ctx.userId, containerId: containerDbId, action: 'STOP', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });

      // Sync egress proxy ACLs to remove stopped container (non-blocking)
      egressProxyService.syncAllAcls().then(() => egressProxyService.reloadProxy()).catch(err => {
        log.warn({ error: (err as Error).message }, 'Egress ACL sync after stop failed');
      });

      return { success: true, message: 'Workspace stopped', containerId: containerDbId, status: 'STOPPED' };

    } catch (err) {
      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { status: 'ERROR', errorMessage: (err as Error).message },
      });
      workspaceAuditService.log({ userId: ctx.userId, containerId: containerDbId, action: 'STOP', success: false, errorMessage: (err as Error).message });
      return { success: false, message: `Stop failed: ${(err as Error).message}`, containerId: containerDbId, status: 'ERROR' };
    }
  }

  /**
   * Destroy a workspace completely (stop + remove container + delete data)
   * Volume data is always deleted unless explicitly preserved.
   */
  async destroyWorkspace(
    ctx: ServiceContext,
    containerDbId: string,
    options: { deleteData?: boolean } = { deleteData: true },
  ): Promise<WorkspaceOperationResult> {
    const container = await this.getContainerForUser(ctx, containerDbId);
    this.authCache.delete(containerDbId);

    // Deactivate webhook routes before destroying
    await gatewayRouteService.deactivateRoutes(containerDbId);

    // Disconnect bridge
    bridgeClientManager.removeClient(containerDbId);

    // Remove Docker container
    if (container.containerId) {
      try {
        // Remove egress rules before destroying
        await networkEgressService.removeEgressRules(container.containerId, containerDbId).catch(() => {});
        await dockerService.forceRemoveContainer(container.containerId);
      } catch {
        // Container might already be gone
      }
    }

    // Delete workspace volume data (default: always delete for clean slate)
    const shouldDeleteData = options.deleteData !== false;
    if (shouldDeleteData && container.volumePath) {
      try {
        const fs = await import('fs/promises');
        await fs.rm(container.volumePath, { recursive: true, force: true });
        log.info({ containerDbId, volumePath: container.volumePath }, 'Workspace volume deleted');
      } catch {
        log.warn({ containerDbId }, 'Could not delete workspace volume');
      }
    }

    // Update DB
    await prisma.workspaceContainer.update({
      where: { id: containerDbId },
      data: { status: 'DESTROYED', stoppedAt: new Date() },
    });

    log.info({ containerDbId, deleteData: shouldDeleteData }, 'Workspace destroyed');
    workspaceAuditService.log({
      userId: ctx.userId,
      containerId: containerDbId,
      action: 'DESTROY',
      metadata: { deleteData: shouldDeleteData },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Sync egress proxy ACLs to remove destroyed container (non-blocking)
    egressProxyService.syncAllAcls().then(() => egressProxyService.reloadProxy()).catch(err => {
      log.warn({ error: (err as Error).message }, 'Egress ACL sync after destroy failed');
    });

    return { success: true, message: 'Workspace destroyed', containerId: containerDbId, status: 'DESTROYED' };
  }

  // ===========================================
  // Auto-Stop Configuration
  // ===========================================

  /**
   * Update auto-stop setting for a workspace container.
   * Free-tier users cannot disable auto-stop (locked at 24h).
   * Paid users can set any value (5–1440 minutes) or null to disable.
   */
  async updateAutoStop(
    ctx: ServiceContext,
    containerDbId: string,
    autoStopMinutes: number | null,
  ): Promise<{ autoStopMinutes: number | null }> {
    const container = await this.getContainerForUser(ctx, containerDbId);

    // Free-tier users cannot change auto-stop
    const isFreeTier = !container.organizationId && (ctx.effectivePlan === 'FREE' || ctx.effectivePlan === 'STARTER');
    if (isFreeTier) {
      throw new ForbiddenError(
        'Free and Starter plans have a fixed 24-hour auto-stop. Upgrade to Pro or higher to customize.',
      );
    }

    await prisma.workspaceContainer.update({
      where: { id: containerDbId },
      data: { autoStopMinutes },
    });

    log.info({ containerDbId, autoStopMinutes }, 'Auto-stop setting updated');
    return { autoStopMinutes };
  }

  // ===========================================
  // Container Provisioning
  // ===========================================

  /**
   * Ensure a workspace container exists for a user/org.
   * If no container exists, creates one in STOPPED state (no Docker container yet).
   * Used by plugin install/create flows that need a container to exist.
   *
   * Returns the container DB ID.
   */
  async ensureContainerExists(
    ctx: ServiceContext,
    organizationId?: string | null,
  ): Promise<string> {
    // Check for existing non-destroyed container
    const existing = await prisma.workspaceContainer.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: organizationId || null,
        status: { not: 'DESTROYED' },
      },
      select: { id: true },
    });

    if (existing) return existing.id;

    // No container exists — create one (will be started on demand)
    const result = await this.createWorkspace(ctx, {
      organizationId: organizationId || undefined,
    });

    if (!result.containerId) {
      throw new BadRequestError('Failed to provision workspace container');
    }

    return result.containerId;
  }

  /**
   * Ensure a workspace container is RUNNING for a user/org.
   *
   * Handles all cases:
   *   - NO CONTAINER → auto-create + start → wait for RUNNING
   *   - STOPPED/ERROR → start → wait for RUNNING
   *   - STARTING/CREATING → poll until RUNNING (with timeout)
   *   - RUNNING → return immediately
   *
   * Used by plugin install/create flows that need a running container
   * to write template files.
   *
   * @returns The container DB ID once RUNNING
   * @throws Error if the container cannot be started within the timeout
   */
  async ensureContainerRunning(
    ctx: ServiceContext,
    organizationId?: string | null,
  ): Promise<string> {
    // Step 1: Ensure a container record exists
    const containerDbId = await this.ensureContainerExists(ctx, organizationId);

    // Step 2: Check current status
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { id: true, status: true },
    });

    if (!container) {
      throw new BadRequestError('Container record disappeared after creation');
    }

    if (container.status === 'RUNNING') {
      return containerDbId;
    }

    // Step 3: If STARTING or CREATING, just wait for it
    if (container.status === 'STARTING' || container.status === 'CREATING') {
      return this.waitForRunning(containerDbId);
    }

    // Step 4: STOPPED or ERROR → start it
    if (container.status === 'STOPPED' || container.status === 'ERROR') {
      const result = await this.startWorkspace(ctx, containerDbId);
      if (result.status === 'RUNNING') {
        return containerDbId;
      }
      // startWorkspace may have set it to STARTING — wait
      if (result.status === 'STARTING') {
        return this.waitForRunning(containerDbId);
      }
      throw new BadRequestError(`Workspace start failed: ${result.message}`);
    }

    throw new BadRequestError(`Unexpected container status: ${container.status}`);
  }

  /**
   * Poll until a container reaches RUNNING status (or times out).
   * Used internally by ensureContainerRunning.
   */
  private async waitForRunning(containerDbId: string, timeoutMs = 30_000, intervalMs = 1_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const c = await prisma.workspaceContainer.findUnique({
        where: { id: containerDbId },
        select: { status: true, errorMessage: true },
      });

      if (!c) throw new BadRequestError('Container disappeared while waiting for startup');

      if (c.status === 'RUNNING') return containerDbId;
      if (c.status === 'ERROR' || c.status === 'DESTROYED') {
        throw new BadRequestError(`Workspace startup failed: ${c.errorMessage || c.status}`);
      }
      // STARTING / CREATING → keep polling
    }

    throw new BadRequestError('Workspace startup timed out (30s). Please try again.');
  }

  // ===========================================
  // Status & Info
  // ===========================================

  /**
   * Get workspace status for current user
   */
  async getStatus(ctx: ServiceContext, organizationId?: string): Promise<WorkspaceStatus | null> {
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: organizationId || null,
      },
    });

    if (!container || container.status === 'DESTROYED') return null;

    return this.toWorkspaceStatus(container);
  }

  /**
   * Get workspace by DB ID (with auth check)
   */
  async getWorkspace(ctx: ServiceContext, containerDbId: string): Promise<WorkspaceStatus> {
    const container = await this.getContainerForUser(ctx, containerDbId);
    return this.toWorkspaceStatus(container);
  }

  // ===========================================
  // Bridge Proxy — File Operations
  // ===========================================

  async fileList(ctx: ServiceContext, containerDbId: string, path = '/', recursive = false) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.fileList(path, recursive);
  }

  async fileRead(ctx: ServiceContext, containerDbId: string, path: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.fileRead(path);
  }

  async fileWrite(ctx: ServiceContext, containerDbId: string, path: string, content: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    const result = await client.fileWrite(path, content);

    // Auto-restart running plugin if a plugin file was saved
    if (path.startsWith('plugins/')) {
      try {
        const list = await client.pluginList() as Array<{ file: string; status: string }>;
        // Match: exact file (single-file plugin) or any file within the same plugin dir (directory plugin)
        const running = list.find(p => {
          if (p.status !== 'running') return false;
          if (p.file === path) return true;
          // Directory plugin: saved file is inside the same plugin folder
          const pluginDir = p.file.replace(/\/[^/]+$/, '/');
          return path.startsWith(pluginDir);
        });
        if (running) {
          await client.pluginRestart(running.file);
        }
      } catch {
        // Non-critical — file save still succeeded
      }
    }

    return result;
  }

  async fileDelete(ctx: ServiceContext, containerDbId: string, path: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    const result = await client.fileDelete(path);
    await pluginWorkspaceSyncService.handlePluginFileDeleted(containerDbId, path, client).catch(() => {});
    return result;
  }

  async fileMkdir(ctx: ServiceContext, containerDbId: string, path: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.fileMkdir(path);
  }

  async fileRename(ctx: ServiceContext, containerDbId: string, oldPath: string, newPath: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.fileRename(oldPath, newPath);
  }

  // ===========================================
  // Bridge Proxy — Plugin Operations
  // ===========================================

  async pluginStart(ctx: ServiceContext, containerDbId: string, file: string, env?: Record<string, string>, storageQuotaMb?: number) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    const result = await client.pluginStart(file, env, storageQuotaMb);
    await pluginWorkspaceSyncService.handlePluginStarted(containerDbId, file).catch(() => {});
    return result;
  }

  async pluginStop(ctx: ServiceContext, containerDbId: string, file: string, force = false) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    const result = await client.pluginStop(file, force);
    await pluginWorkspaceSyncService.handlePluginStopped(containerDbId, file).catch(() => {});
    return result;
  }

  async pluginRestart(ctx: ServiceContext, containerDbId: string, file: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.pluginRestart(file);
  }

  async pluginList(ctx: ServiceContext, containerDbId: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    const plugins = await client.pluginList() as Array<{ file: string; name: string; displayName?: string; [key: string]: unknown }>;
    await pluginWorkspaceSyncService.enrichPluginList(containerDbId, plugins).catch(() => {});
    return plugins;
  }

  async pluginLogs(ctx: ServiceContext, containerDbId: string, file: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.pluginLogs(file);
  }

  async pluginValidate(ctx: ServiceContext, containerDbId: string, file: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.pluginValidate(file);
  }

  // ===========================================
  // Bridge Proxy — Git Operations
  // ===========================================

  async gitClone(ctx: ServiceContext, containerDbId: string, url: string, options: { targetDir?: string; branch?: string; depth?: number; credentials?: { username: string; token: string } } = {}) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.gitClone(url, options);
  }

  async gitPull(ctx: ServiceContext, containerDbId: string, directory?: string, credentials?: { username: string; token: string }) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.gitPull(directory, credentials);
  }

  async gitStatus(ctx: ServiceContext, containerDbId: string, directory?: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.gitStatus(directory);
  }

  // ===========================================
  // Bridge Proxy — Package Operations
  // ===========================================

  async packageInstall(ctx: ServiceContext, containerDbId: string, packages: string[], options: { dev?: boolean; cwd?: string } = {}) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.packageInstall(packages, options);
  }

  async packageUninstall(ctx: ServiceContext, containerDbId: string, packages: string[], cwd?: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.packageUninstall(packages, cwd);
  }

  async packageList(ctx: ServiceContext, containerDbId: string, cwd?: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.packageList(cwd);
  }

  // ===========================================
  // Bridge Proxy — Terminal Operations
  // ===========================================

  async terminalCreate(ctx: ServiceContext, containerDbId: string, cols = 80, rows = 24) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.terminalCreate(cols, rows);
  }

  async terminalResize(ctx: ServiceContext, containerDbId: string, sessionId: string, cols: number, rows: number) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.terminalResize(sessionId, cols, rows);
  }

  async terminalClose(ctx: ServiceContext, containerDbId: string, sessionId: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.terminalClose(sessionId);
  }

  // ===========================================
  // Bridge Proxy — System Operations
  // ===========================================

  async systemStats(ctx: ServiceContext, containerDbId: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.systemStats();
  }

  async systemHealth(ctx: ServiceContext, containerDbId: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.systemHealth();
  }

  async storageStats(ctx: ServiceContext, containerDbId: string) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    return client.storageStats();
  }

  // ===========================================
  // Generic Bridge Send (for extensibility)
  // ===========================================

  async sendBridgeAction(ctx: ServiceContext, containerDbId: string, action: BridgeAction, payload: Record<string, unknown> = {}) {
    const client = await this.getBridgeClient(ctx, containerDbId);
    this.touchActivity(containerDbId);
    return client.send(action, payload);
  }

  // ===========================================
  // Org Workspace Management
  // ===========================================

  /**
   * List all workspace containers for an organization
   * (org admin view)
   */
  async listOrgWorkspaces(ctx: ServiceContext, organizationId: string) {
    // Verify org membership and role via DB (defense-in-depth — route also sets org context)
    if (!ctx.isAdmin()) {
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: ctx.userId, organizationId } },
        select: { status: true, role: true },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenError('Not a member of this organization');
      }
      // Only org owners and admins can list all org workspaces
      if (!['ORG_OWNER', 'ORG_ADMIN'].includes(membership.role)) {
        throw new ForbiddenError('Only organization owners and admins can list workspaces');
      }
    }

    const containers = await prisma.workspaceContainer.findMany({
      where: {
        organizationId,
        status: { not: 'DESTROYED' },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return containers.map(c => ({
      id: c.id,
      userId: c.userId,
      userName: c.user.name,
      userEmail: c.user.email,
      status: c.status,
      resources: { ramMb: c.ramMb, cpuCores: c.cpuCores, storageMb: c.storageMb },
      startedAt: c.startedAt,
      stoppedAt: c.stoppedAt,
      lastActivityAt: c.lastActivityAt,
      createdAt: c.createdAt,
    }));
  }

  /**
   * Get org workspace pool usage summary
   */
  async getOrgPoolUsage(ctx: ServiceContext, organizationId: string): Promise<OrgPoolUsage> {
    // Verify org membership via DB (defense-in-depth — route also sets org context)
    if (!ctx.isAdmin()) {
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: ctx.userId, organizationId } },
        select: { status: true },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenError('Not a member of this organization');
      }
    }

    // Get org plan resources
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });
    if (!org) throw new NotFoundError('Organization not found');

    const orgWorkspace = getIncludedOrgWorkspace(org.plan as OrgPlanType);
    const totalPool: WorkspaceResourceAllocation = {
      ramMb: orgWorkspace.ramMb ?? DEFAULT_RESOURCES.ramMb,
      cpuCores: orgWorkspace.cpuCores ?? DEFAULT_RESOURCES.cpuCores,
      storageMb: orgWorkspace.storageMb ?? DEFAULT_RESOURCES.storageMb,
    };

    // Sum allocated resources across all non-destroyed containers
    const containers = await prisma.workspaceContainer.findMany({
      where: {
        organizationId,
        status: { not: 'DESTROYED' },
      },
      select: { ramMb: true, cpuCores: true, storageMb: true, status: true },
    });

    const allocated = { ramMb: 0, cpuCores: 0, storageMb: 0 };
    let runningCount = 0;

    for (const c of containers) {
      allocated.ramMb += c.ramMb;
      allocated.cpuCores += c.cpuCores;
      allocated.storageMb += c.storageMb;
      if (c.status === 'RUNNING') runningCount++;
    }

    return {
      organizationId,
      totalPool,
      allocated,
      available: {
        ramMb: Math.max(0, totalPool.ramMb - allocated.ramMb),
        cpuCores: Math.max(0, totalPool.cpuCores - allocated.cpuCores),
        storageMb: Math.max(0, totalPool.storageMb - allocated.storageMb),
      },
      containerCount: containers.length,
      runningCount,
    };
  }

  // ===========================================
  // Admin Operations
  // ===========================================

  /**
   * List all workspace containers (admin view)
   */
  async adminListAll(ctx: ServiceContext) {
    if (!ctx.isAdmin()) throw new ForbiddenError('Admin access required');

    const containers = await prisma.workspaceContainer.findMany({
      where: { status: { not: 'DESTROYED' } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map to frontend AdminWorkspace structure
    return containers.map(c => ({
      id: c.id,
      containerId: c.containerId,
      userId: c.userId,
      userName: c.user.name,
      userEmail: c.user.email,
      ownerType: c.ownerType || (c.organizationId ? 'ORGANIZATION' : 'PERSONAL'),
      orgSlug: c.organization?.slug,
      status: c.status,
      resources: {
        ramMb: c.ramMb,
        cpuCores: c.cpuCores,
        storageMb: c.storageMb,
      },
      // usage: {}, // Can leave undefined for now
      startedAt: c.startedAt,
      lastActivityAt: c.lastActivityAt,
      restartCount: c.restartCount,
    }));
  }

  /**
   * Force-stop a container (admin)
   */
  async adminForceStop(ctx: ServiceContext, containerDbId: string): Promise<WorkspaceOperationResult> {
    if (!ctx.isAdmin()) throw new ForbiddenError('Admin access required');

    const container = await prisma.workspaceContainer.findUnique({ where: { id: containerDbId } });
    if (!container) throw new NotFoundError('Container not found');

    bridgeClientManager.removeClient(containerDbId);
    this.authCache.delete(containerDbId);

    if (container.containerId) {
      try {
        await dockerService.killContainer(container.containerId);
      } catch { /* ignore */ }
    }

    await prisma.workspaceContainer.update({
      where: { id: containerDbId },
      data: { status: 'STOPPED', stoppedAt: new Date(), errorMessage: 'Force-stopped by admin' },
    });

    workspaceAuditService.log({
      userId: ctx.userId,
      containerId: containerDbId,
      containerName: container.containerName,
      action: 'FORCE_STOP',
      metadata: { adminUserId: ctx.userId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { success: true, message: 'Container force-stopped', containerId: containerDbId, status: 'STOPPED' };
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  /**
   * Get container record with user authentication check
   */
  private async getContainerForUser(ctx: ServiceContext, containerDbId: string) {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
    });

    if (!container) {
      throw new NotFoundError('Workspace not found');
    }

    // Auth check: user must own the container, or be admin
    if (container.userId !== ctx.userId && !ctx.isAdmin()) {
      // Also allow org admins for org containers
      if (container.organizationId && container.organizationId === ctx.organizationId) {
        if (!ctx.orgRole || !['OWNER', 'ADMIN'].includes(ctx.orgRole)) {
          throw new ForbiddenError('Not authorized to access this workspace');
        }
      } else {
        throw new ForbiddenError('Not authorized to access this workspace');
      }
    }

    // Additional Org Membership Check: Even if I own the container, if it belongs to an org,
    // I must still be an active member of that org to access it.
    if (container.organizationId && !ctx.isAdmin()) {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.userId,
            organizationId: container.organizationId,
          },
        },
        select: { status: true },
      });

      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenError('You are no longer a member of the organization that owns this workspace');
      }
    }

    return container;
  }

  /**
   * Get resource allocation for workspace creation
   * Returns null if user/org cannot create a workspace
   */
  private async getResourceAllocation(
    ctx: ServiceContext,
    organizationId?: string,
  ): Promise<WorkspaceResourceAllocation | null> {
    if (organizationId) {
      // Org workspace — check org plan
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { plan: true },
      });
      if (!org) return null;

      const orgWorkspace = getIncludedOrgWorkspace(org.plan as OrgPlanType);
      if (!orgWorkspace || !orgWorkspace.ramMb) return null; // NONE tier

      // For custom/enterprise plans, use defaults
      if (orgWorkspace.ramMb === null) return DEFAULT_RESOURCES;

      // Check if org pool has room
      const poolUsage = await this.getOrgPoolUsage(ctx, organizationId);
      if (poolUsage.available.ramMb < DEFAULT_RESOURCES.ramMb) {
        return null; // Pool exhausted
      }

      return {
        ramMb: Math.min(DEFAULT_RESOURCES.ramMb, poolUsage.available.ramMb),
        cpuCores: Math.min(DEFAULT_RESOURCES.cpuCores, poolUsage.available.cpuCores),
        storageMb: Math.min(DEFAULT_RESOURCES.storageMb, poolUsage.available.storageMb),
      };
    }

    // Personal workspace — check user plan + purchased add-ons
    const planWorkspace = getIncludedWorkspace(ctx.effectivePlan);

    // Also check user's purchased workspace add-ons from DB
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { workspaceAddons: true },
    });
    const addons = (user?.workspaceAddons ?? []) as WorkspaceAddonTier[];

    // Check if workspace is enabled via plan OR add-ons
    if (!hasWorkspaceEnabled(planWorkspace, addons)) return null;

    // Calculate total resources from plan + stacked add-ons
    const total = calculateTotalWorkspace(planWorkspace, addons);

    // For unlimited (Enterprise), use defaults
    if (total.ramMb === -1) return DEFAULT_RESOURCES;

    return total;
  }

  /**
   * Get bridge client for a container (with auth check)
   */
  private async getBridgeClient(ctx: ServiceContext, containerDbId: string): Promise<BridgeClient> {
    // Fast path: if bridge client already exists, use cached auth to skip DB query
    const existing = bridgeClientManager.getExistingClient(containerDbId);
    if (existing) {
      // Still verify ownership from cache (refreshed every 30s)
      const cached = this.authCache.get(containerDbId);
      if (cached && (Date.now() - cached.cachedAt) < AUTH_CACHE_TTL) {
        if (cached.userId !== ctx.userId && !ctx.isAdmin()) {
          throw new ForbiddenError('Not authorized to access this workspace');
        }
        if (cached.status !== 'RUNNING') {
          throw new BadRequestError(`Workspace is ${cached.status.toLowerCase()}, not running`);
        }
        // Queue activity touch (batched)
        this.touchActivity(containerDbId);
        return existing;
      }
    }

    // Cold path: full DB lookup + auth check
    const container = await this.getContainerForUser(ctx, containerDbId);

    // Update auth cache
    this.authCache.set(containerDbId, {
      userId: container.userId,
      organizationId: container.organizationId,
      status: container.status,
      bridgePort: container.bridgePort,
      bridgeAuthToken: container.bridgeAuthToken,
      cachedAt: Date.now(),
    });

    if (container.status !== 'RUNNING') {
      throw new BadRequestError(`Workspace is ${container.status.toLowerCase()}, not running`);
    }

    if (!container.bridgePort) {
      throw new BadRequestError('Workspace bridge port not available');
    }

    // Try to get existing client (may have been created between check and here)
    const existingAgain = bridgeClientManager.getExistingClient(containerDbId);
    if (existingAgain) return existingAgain;

    // Re-establish connection using persisted bridge auth token (encrypted at rest)
    if (!container.bridgeAuthToken) {
      throw new BadRequestError('Bridge auth token not available — please destroy and recreate your workspace');
    }

    // Decrypt the token — supports both encrypted (v1:...) and legacy plaintext tokens
    const authToken = container.bridgeAuthToken.startsWith('v1:')
      ? decrypt(container.bridgeAuthToken)
      : container.bridgeAuthToken;

    return bridgeClientManager.getClient(
      containerDbId,
      container.bridgePort,
      authToken,
    );
  }

  /**
   * Wait for bridge agent to become healthy after container start
   */
  private async waitForBridge(dockerContainerId: string, containerDbId: string): Promise<void> {
    const startTime = Date.now();
    const maxWait = CONTAINER_START_TIMEOUT;
    const pollInterval = 2_000;

    while (Date.now() - startTime < maxWait) {
      try {
        // Check if container is still running
        const info = await dockerService.inspectContainer(dockerContainerId);
        if (!info.running) {
          throw new Error('Container stopped during startup');
        }

        // Try to reach bridge health endpoint
        const port = await dockerService.getBridgePort(dockerContainerId);
        if (port) {
          const response = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(5_000),
          });
          if (response.ok) {
            log.info({ containerDbId, port }, 'Bridge agent healthy');
            return;
          }
        }
      } catch {
        // Not ready yet, keep waiting
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Bridge agent did not become healthy within ${maxWait / 1000}s`);
  }

  /**
   * Convert DB container record to WorkspaceStatus
   */
  private toWorkspaceStatus(container: {
    id: string;
    status: string;
    ownerType: string;
    organizationId: string | null;
    errorMessage: string | null;
    ipAddress: string | null;
    ramMb: number;
    cpuCores: number;
    storageMb: number;
    startedAt: Date | null;
    stoppedAt: Date | null;
    lastActivityAt: Date | null;
    createdAt: Date;
    autoStopMinutes: number | null;
    healthCheckFails: number;
    restartCount: number;
  }): WorkspaceStatus {
    return {
      id: container.id,
      status: container.status as WorkspaceStatus['status'],
      ownerType: container.ownerType as WorkspaceStatus['ownerType'],
      orgSlug: undefined, // Filled by caller if needed
      errorMessage: container.errorMessage || undefined,
      ipAddress: container.ipAddress || undefined,
      resources: {
        ramMb: container.ramMb,
        cpuCores: container.cpuCores,
        storageMb: container.storageMb,
      },
      runningPlugins: [], // Filled from bridge agent when requested
      startedAt: container.startedAt?.toISOString(),
      stoppedAt: container.stoppedAt?.toISOString(),
      lastActivityAt: container.lastActivityAt?.toISOString(),
      createdAt: container.createdAt.toISOString(),
      autoStopMinutes: container.autoStopMinutes || undefined,
      healthCheckFails: container.healthCheckFails,
      restartCount: container.restartCount,
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const workspaceService = new WorkspaceService();
