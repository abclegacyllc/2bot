/**
 * Workflow Cache Service
 *
 * Pushes workflow definitions to the user's workspace container as JSON files.
 * This allows the bridge agent and plugins to access workflow metadata locally,
 * and lays the foundation for container-side orchestration.
 *
 * Cache files are written to `.2bot/workflows/<workflowId>.json` inside the container.
 * All operations are fire-and-forget — failures are logged but never thrown.
 *
 * @module modules/workflow/workflow-cache
 */

import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { bridgeClientManager } from "@/modules/workspace";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

const cacheLog = logger.child({ module: "workflow-cache" });

const CACHE_DIR = ".2bot/workflows";

/**
 * Push a workflow definition to the user's workspace container.
 * Fire-and-forget: silently skips if container is unavailable.
 */
export async function pushWorkflowCache(
  workflowId: string,
  userId: string,
  organizationId: string | null
): Promise<void> {
  try {
    const client = await getContainerClient(userId, organizationId);
    if (!client) return;

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { plugin: { select: { slug: true, name: true } } },
        },
      },
    });
    if (!workflow) return;

    const cache = {
      id: workflow.id,
      name: workflow.name,
      slug: workflow.slug,
      triggerType: workflow.triggerType,
      triggerConfig: workflow.triggerConfig,
      gatewayId: workflow.gatewayId,
      status: workflow.status,
      isEnabled: workflow.isEnabled,
      steps: workflow.steps.map((s) => ({
        order: s.order,
        name: s.name,
        pluginId: s.pluginId,
        pluginSlug: s.plugin.slug,
        pluginName: s.plugin.name,
        inputMapping: s.inputMapping,
        config: s.config,
        gatewayId: s.gatewayId,
        condition: s.condition,
        onError: s.onError,
        maxRetries: s.maxRetries,
      })),
      updatedAt: workflow.updatedAt.toISOString(),
    };

    await client.fileWrite(
      `${CACHE_DIR}/${workflowId}.json`,
      JSON.stringify(cache, null, 2)
    );

    cacheLog.debug({ workflowId }, "Workflow cache pushed to container");
  } catch (err) {
    cacheLog.warn(
      { workflowId, error: (err as Error).message },
      "Failed to push workflow cache (non-fatal)"
    );
  }
}

/**
 * Remove a workflow cache file from the user's container.
 * Fire-and-forget: silently skips if container is unavailable.
 */
export async function removeWorkflowCache(
  workflowId: string,
  userId: string,
  organizationId: string | null
): Promise<void> {
  try {
    const client = await getContainerClient(userId, organizationId);
    if (!client) return;

    await client.fileDelete(`${CACHE_DIR}/${workflowId}.json`);
    cacheLog.debug({ workflowId }, "Workflow cache removed from container");
  } catch (err) {
    cacheLog.warn(
      { workflowId, error: (err as Error).message },
      "Failed to remove workflow cache (non-fatal)"
    );
  }
}

/**
 * Push all active workflow caches for a user.
 * Called on workspace boot to ensure containers have up-to-date definitions.
 */
export async function pushAllWorkflowCaches(
  userId: string,
  organizationId: string | null
): Promise<number> {
  try {
    const client = await getContainerClient(userId, organizationId);
    if (!client) return 0;

    const workflows = await prisma.workflow.findMany({
      where: {
        userId,
        organizationId: organizationId ?? null,
        isEnabled: true,
        status: "ACTIVE",
      },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { plugin: { select: { slug: true, name: true } } },
        },
      },
    });

    if (workflows.length === 0) return 0;

    const files = workflows.map((workflow) => ({
      path: `${CACHE_DIR}/${workflow.id}.json`,
      content: JSON.stringify(
        {
          id: workflow.id,
          name: workflow.name,
          slug: workflow.slug,
          triggerType: workflow.triggerType,
          triggerConfig: workflow.triggerConfig,
          gatewayId: workflow.gatewayId,
          status: workflow.status,
          isEnabled: workflow.isEnabled,
          steps: workflow.steps.map((s) => ({
            order: s.order,
            name: s.name,
            pluginId: s.pluginId,
            pluginSlug: s.plugin.slug,
            pluginName: s.plugin.name,
            inputMapping: s.inputMapping,
            config: s.config,
            gatewayId: s.gatewayId,
            condition: s.condition,
            onError: s.onError,
            maxRetries: s.maxRetries,
          })),
          updatedAt: workflow.updatedAt.toISOString(),
        },
        null,
        2
      ),
    }));

    await client.fileWriteMulti(files);
    cacheLog.info(
      { userId, count: workflows.length },
      "Pushed all workflow caches to container"
    );
    return workflows.length;
  } catch (err) {
    cacheLog.warn(
      { userId, error: (err as Error).message },
      "Failed to push workflow caches (non-fatal)"
    );
    return 0;
  }
}

// ===========================================
// Internal helpers
// ===========================================

/**
 * Get a bridge client to the user's running container.
 * Returns null if no container is running or connection fails.
 */
async function getContainerClient(
  userId: string,
  organizationId: string | null
): Promise<BridgeClient | null> {
  const container = await prisma.workspaceContainer.findFirst({
    where: {
      userId,
      organizationId: organizationId ?? null,
      status: "RUNNING",
    },
    select: { id: true, bridgePort: true, bridgeAuthToken: true },
  });

  if (!container) return null;

  const existing = bridgeClientManager.getExistingClient(container.id);
  if (existing) return existing;

  if (!container.bridgePort || !container.bridgeAuthToken) return null;

  try {
    const authToken = container.bridgeAuthToken.startsWith("v1:")
      ? decrypt(container.bridgeAuthToken)
      : container.bridgeAuthToken;
    return await bridgeClientManager.getClient(
      container.id,
      container.bridgePort,
      authToken
    );
  } catch {
    return null;
  }
}
