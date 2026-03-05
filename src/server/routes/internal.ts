/**
 * Internal API Routes
 *
 * Endpoints consumed by workspace containers (bridge agent / plugin SDK).
 * Authenticated via X-Bridge-Token header (matched against the container's
 * encrypted bridgeAuthToken in the database).
 *
 * These routes bypass normal user auth — they are machine-to-machine only.
 *
 * @module server/routes/internal
 */

import type { Request, Response } from 'express';
import { Router } from 'express';

import { decrypt, decryptJson } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { GatewayCredentials } from '@/modules/gateway/gateway.types';
import type { ApiResponse } from '@/shared/types';

const log = logger.child({ module: 'internal-api' });

export const internalRouter = Router();

// ===========================================
// Middleware: X-Bridge-Token Authentication
// ===========================================

/**
 * Authenticate a request from a workspace container.
 *
 * Looks up the container by matching the plaintext bridge token from the
 * X-Bridge-Token header against all running containers' encrypted tokens.
 *
 * On success, attaches `req.container` with { id, userId, organizationId }.
 */
async function bridgeTokenAuth(
  req: Request,
  res: Response,
  next: () => void,
): Promise<void> {
  const token = req.headers['x-bridge-token'] as string | undefined;

  if (!token) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-Bridge-Token header' } });
    return;
  }

  try {
    // Find running containers that have a bridgeAuthToken
    const containers = await prisma.workspaceContainer.findMany({
      where: {
        status: 'RUNNING',
        bridgeAuthToken: { not: null },
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        bridgeAuthToken: true,
      },
    });

    // Compare against each container's decrypted token
    let matched: { id: string; userId: string; organizationId: string | null } | null = null;

    for (const c of containers) {
      if (!c.bridgeAuthToken) continue;
      try {
        const decrypted = c.bridgeAuthToken.startsWith('v1:')
          ? decrypt(c.bridgeAuthToken)
          : c.bridgeAuthToken;
        if (decrypted === token) {
          matched = { id: c.id, userId: c.userId, organizationId: c.organizationId };
          break;
        }
      } catch {
        // Skip containers with bad tokens
        continue;
      }
    }

    if (!matched) {
      log.warn('Bridge token auth failed — no matching container');
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid bridge token' } });
      return;
    }

    // Attach container info to the request
    (req as any).container = matched;
    next();
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Bridge token auth error');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

// Apply auth to all internal routes
internalRouter.use(bridgeTokenAuth);

// ===========================================
// GET /internal/credentials/:gatewayId
// ===========================================

/**
 * Return decrypted gateway credentials for a specific gateway.
 *
 * The container must belong to the same user (and org) that owns the gateway.
 * This prevents a container from fetching credentials for gateways it doesn't own.
 */
internalRouter.get('/credentials/:gatewayId', async (req: Request, res: Response<ApiResponse>) => {
  const gatewayId = req.params.gatewayId as string;
  const container = (req as any).container as { id: string; userId: string; organizationId: string | null };

  try {
    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        type: true,
        status: true,
        credentialsEnc: true,
        config: true,
      },
    });

    if (!gateway) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Gateway not found' } });
      return;
    }

    // Ownership check: container's user/org must match gateway's user/org
    if (gateway.userId !== container.userId) {
      log.warn(
        { gatewayId, containerUserId: container.userId, gatewayUserId: gateway.userId },
        'Credential fetch denied — user mismatch',
      );
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    if (gateway.organizationId !== container.organizationId) {
      log.warn(
        { gatewayId, containerOrgId: container.organizationId, gatewayOrgId: gateway.organizationId },
        'Credential fetch denied — org mismatch',
      );
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    // Decrypt credentials
    const credentials = decryptJson<GatewayCredentials>(gateway.credentialsEnc);

    // Extract webhook secret token from config (if set)
    const config = (gateway.config as Record<string, unknown>) || {};
    const webhookSecretToken = (config.webhookSecretToken as string) || undefined;

    log.debug({ gatewayId, containerId: container.id, type: gateway.type }, 'Credentials served via REST');

    res.json({
      success: true,
      data: {
        type: gateway.type,
        ...credentials,
        ...(webhookSecretToken ? { webhookSecretToken } : {}),
      },
    });
  } catch (err) {
    log.error({ gatewayId, error: (err as Error).message }, 'Failed to serve credentials');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve credentials' } });
  }
});
