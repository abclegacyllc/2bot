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

import crypto from 'crypto';
import type { Request, Response } from 'express';
import { Router } from 'express';

import { decryptIfEncrypted, decryptJson } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import type { GatewayCredentials } from '@/modules/gateway/gateway.types';
import {
    checkDiscordMessageTrigger,
    checkSlackMessageTrigger,
    checkTelegramCallbackTrigger,
    checkTelegramMessageTrigger,
    checkWhatsAppMessageTrigger,
} from '@/modules/workflow/workflow.triggers';
import type { ApiResponse } from '@/shared/types';

const log = logger.child({ module: 'internal-api' });

export const internalRouter = Router();

/** Container identity attached to authenticated internal requests */
export type ContainerContext = { id: string; userId: string; organizationId: string | null };

/** Express Request extended with the bridge-auth-resolved container context */
export interface InternalRequest extends Request {
  container: ContainerContext;
}

/** SHA-256 hash of a plaintext bridge token — used as Redis key */
function bridgeTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
 *
 * Exported so other internal-only routers (e.g. internal-cost) can reuse it.
 */
export async function bridgeTokenAuth(
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
    // Fast path: Redis O(1) lookup by SHA-256 hash of the token.
    // This avoids a full-table scan + AES decrypt for every container IPC request.
    try {
      const cached = await redis.get(`bridge:auth:${bridgeTokenHash(token)}`);
      if (cached) {
        (req as InternalRequest).container = JSON.parse(cached) as ContainerContext;
        next();
        return;
      }
    } catch {
      // Redis unavailable — fall through to DB scan
    }

    // Slow path: DB scan + decrypt loop (populates Redis for next request)
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

    let matched: { id: string; userId: string; organizationId: string | null } | null = null;

    for (const c of containers) {
      if (!c.bridgeAuthToken) continue;
      try {
        const decrypted = decryptIfEncrypted(c.bridgeAuthToken);
        if (decrypted === token) {
          matched = { id: c.id, userId: c.userId, organizationId: c.organizationId };
          // Back-fill Redis so subsequent requests from this container are fast
          redis.set(
            `bridge:auth:${bridgeTokenHash(token)}`,
            JSON.stringify(matched),
            'EX',
            86400,
          ).catch(() => {});
          break;
        }
      } catch {
        continue;
      }
    }

    if (!matched) {
      log.warn('Bridge token auth failed — no matching container');
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid bridge token' } });
      return;
    }

    (req as InternalRequest).container = matched;
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
  const container = (req as InternalRequest).container;

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

// ===========================================
// POST /internal/webhook-trigger/telegram/:gatewayId
// ===========================================

/**
 * Trigger workflow execution for a Telegram webhook received inside a workspace container.
 *
 * The bridge agent calls this endpoint (fire-and-forget) after dispatching events to
 * locally running standalone plugins. This endpoint only triggers workflow engine
 * processing — it does NOT re-dispatch to standalone plugins (avoiding double execution).
 */
internalRouter.post('/webhook-trigger/telegram/:gatewayId', async (req: Request, res: Response<ApiResponse>) => {
  const gatewayId = req.params.gatewayId as string;
  const container = (req as InternalRequest).container;
  const update = req.body as Record<string, unknown>;

  try {
    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { id: true, userId: true, organizationId: true },
    });

    if (!gateway || gateway.userId !== container.userId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    // Reply immediately — workflow execution is async
    res.json({ success: true });

    if (!update || typeof update['update_id'] !== 'number') return;

    const dispatches: Promise<void>[] = [];

    const message = update['message'] as Record<string, unknown> | undefined;
    const callbackQuery = update['callback_query'] as Record<string, unknown> | undefined;
    const editedMessage = update['edited_message'] as Record<string, unknown> | undefined;

    if (message) {
      const chat = message['chat'] as Record<string, unknown>;
      const from = message['from'] as Record<string, unknown> | undefined;
      dispatches.push(
        checkTelegramMessageTrigger(
          gatewayId,
          gateway.userId,
          gateway.organizationId ?? null,
          {
            text: message['text'] as string | undefined,
            chatType: chat['type'] as string,
            chatId: chat['id'] as number,
            messageId: message['message_id'] as number,
            from: from ? {
              id: from['id'] as number,
              firstName: from['first_name'] as string,
              lastName: from['last_name'] as string | undefined,
              username: from['username'] as string | undefined,
            } : undefined,
          },
          update,
        ).then(() => {}),
      );
    } else if (callbackQuery) {
      const cbMsg = callbackQuery['message'] as Record<string, unknown> | undefined;
      const from = callbackQuery['from'] as Record<string, unknown>;
      dispatches.push(
        checkTelegramCallbackTrigger(
          gatewayId,
          gateway.userId,
          gateway.organizationId ?? null,
          {
            data: callbackQuery['data'] as string | undefined,
            chatId: cbMsg ? (cbMsg['chat'] as Record<string, unknown>)['id'] as number : undefined,
            messageId: cbMsg ? cbMsg['message_id'] as number : undefined,
            from: {
              id: from['id'] as number,
              firstName: from['first_name'] as string,
              lastName: from['last_name'] as string | undefined,
              username: from['username'] as string | undefined,
            },
          },
          update,
        ).then(() => {}),
      );
    } else if (editedMessage) {
      const chat = editedMessage['chat'] as Record<string, unknown>;
      const from = editedMessage['from'] as Record<string, unknown> | undefined;
      dispatches.push(
        checkTelegramMessageTrigger(
          gatewayId,
          gateway.userId,
          gateway.organizationId ?? null,
          {
            text: editedMessage['text'] as string | undefined,
            chatType: chat['type'] as string,
            chatId: chat['id'] as number,
            messageId: editedMessage['message_id'] as number,
            from: from ? {
              id: from['id'] as number,
              firstName: from['first_name'] as string,
              lastName: from['last_name'] as string | undefined,
              username: from['username'] as string | undefined,
            } : undefined,
          },
          update,
        ).then(() => {}),
      );
    }

    await Promise.allSettled(dispatches);
  } catch (err) {
    log.error({ gatewayId, error: (err as Error).message }, 'Workflow trigger from bridge failed');
    // Response may already be sent — just log
  }
});

// ===========================================
// POST /internal/webhook-trigger/discord/:gatewayId
// ===========================================

/**
 * Trigger workflow execution for a Discord interaction received inside a workspace container.
 */
internalRouter.post('/webhook-trigger/discord/:gatewayId', async (req: Request, res: Response<ApiResponse>) => {
  const gatewayId = req.params.gatewayId as string;
  const container = (req as InternalRequest).container;
  const interaction = req.body as Record<string, unknown>;

  try {
    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { id: true, userId: true, organizationId: true },
    });

    if (!gateway || gateway.userId !== container.userId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    res.json({ success: true });

    if (!interaction) return;

    await checkDiscordMessageTrigger(
      gatewayId,
      gateway.userId,
      gateway.organizationId ?? null,
      {
        type: interaction['type'] as number | undefined,
        data: interaction['data'] as { name?: string; custom_id?: string } | undefined,
        content: (interaction['message'] as Record<string, unknown> | undefined)?.['content'] as string | undefined,
        channel_id: interaction['channel_id'] as string | undefined,
        guild_id: interaction['guild_id'] as string | undefined,
        author: interaction['author'] as { id: string; username?: string } | undefined,
        member: interaction['member'] as { user?: { id: string; username?: string } } | undefined,
        mentions: interaction['mentions'] as Array<{ id: string }> | undefined,
      },
      interaction,
    );
  } catch (err) {
    log.error({ gatewayId, error: (err as Error).message }, 'Discord workflow trigger from bridge failed');
  }
});

// ===========================================
// POST /internal/webhook-trigger/slack/:gatewayId
// ===========================================

/**
 * Trigger workflow execution for a Slack event received inside a workspace container.
 */
internalRouter.post('/webhook-trigger/slack/:gatewayId', async (req: Request, res: Response<ApiResponse>) => {
  const gatewayId = req.params.gatewayId as string;
  const container = (req as InternalRequest).container;
  const payload = req.body as Record<string, unknown>;

  try {
    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { id: true, userId: true, organizationId: true },
    });

    if (!gateway || gateway.userId !== container.userId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    res.json({ success: true });

    if (!payload) return;

    // Slack interactions arrive as JSON-encoded string in a `payload` field
    let eventPayload = payload;
    if (typeof payload['payload'] === 'string') {
      try { eventPayload = JSON.parse(payload['payload'] as string); } catch { /* use raw */ }
    }

    await checkSlackMessageTrigger(
      gatewayId,
      gateway.userId,
      gateway.organizationId ?? null,
      {
        type: eventPayload['type'] as string | undefined,
        event: eventPayload['event'] as { type?: string; text?: string; channel?: string; user?: string } | undefined,
        command: eventPayload['command'] as string | undefined,
        text: eventPayload['text'] as string | undefined,
        channel_id: eventPayload['channel_id'] as string | undefined,
        actions: eventPayload['actions'] as Array<{ action_id?: string }> | undefined,
      },
      eventPayload,
    );
  } catch (err) {
    log.error({ gatewayId, error: (err as Error).message }, 'Slack workflow trigger from bridge failed');
  }
});

// ===========================================
// POST /internal/webhook-trigger/whatsapp/:gatewayId
// ===========================================

/**
 * Trigger workflow execution for a WhatsApp message received inside a workspace container.
 */
internalRouter.post('/webhook-trigger/whatsapp/:gatewayId', async (req: Request, res: Response<ApiResponse>) => {
  const gatewayId = req.params.gatewayId as string;
  const container = (req as InternalRequest).container;
  const payload = req.body as Record<string, unknown>;

  try {
    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { id: true, userId: true, organizationId: true },
    });

    if (!gateway || gateway.userId !== container.userId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    res.json({ success: true });

    if (!payload) return;

    // Extract the message from the nested WhatsApp Cloud API payload.
    // Each cast step is required because Record<string,unknown> values are `unknown`
    // and TypeScript does not allow index access on `unknown`.
    const waEntries = payload['entry'] as Array<Record<string, unknown>> | undefined;
    const waChanges = waEntries?.[0]?.['changes'] as Array<Record<string, unknown>> | undefined;
    const waValue = waChanges?.[0]?.['value'] as Record<string, unknown> | undefined;
    const waMessages = waValue?.['messages'] as Array<Record<string, unknown>> | undefined;
    const message = waMessages?.[0];
    if (!message) return;

    await checkWhatsAppMessageTrigger(
      gatewayId,
      gateway.userId,
      gateway.organizationId ?? null,
      {
        type: message['type'] as string | undefined,
        text: message['text'] as { body?: string } | undefined,
        from: message['from'] as string | undefined,
        id: message['id'] as string | undefined,
        timestamp: message['timestamp'] as string | undefined,
      },
      payload,
    );
  } catch (err) {
    log.error({ gatewayId, error: (err as Error).message }, 'WhatsApp workflow trigger from bridge failed');
  }
});

// ===========================================
// POST /internal/http-route-dispatch (Phase 7.3)
// ===========================================

/**
 * Dispatch an inbound HTTP request received by a workspace container's
 * user-facing HTTP listener (Phase 7.3c) into a project's HTTP_ROUTE
 * sidecar handler.
 *
 * The bridge agent calls this endpoint synchronously and returns the
 * resulting status/headers/body to the original caller. Gated by the
 * FEATURE_PROJECT_RESOURCES flag so we can ship without exposing the
 * surface until 7.3 is rolled out.
 *
 * Request body shape (JSON):
 *   {
 *     projectId: string,
 *     method: string,
 *     path: string,
 *     headers?: Record<string,string|string[]>,
 *     query?: Record<string,string|string[]>,
 *     body?: unknown,
 *     rawBodyBase64?: string,
 *     remoteIp?: string,
 *     subdomain?: string,
 *   }
 *
 * Response body: `{ success: true, data: { status, headers, body } }`.
 */
internalRouter.post('/http-route-dispatch', async (req: Request, res: Response<ApiResponse>) => {
  const flag = (process.env.FEATURE_PROJECT_RESOURCES ?? 'disabled').toLowerCase();
  if (flag !== 'enabled') {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Feature disabled' } });
    return;
  }

  const container = (req as InternalRequest).container;
  const payload = (req.body ?? {}) as Record<string, unknown>;

  const projectId = payload['projectId'];
  const method = payload['method'];
  const path = payload['path'];

  if (typeof projectId !== 'string' || projectId.length === 0) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'projectId is required' } });
    return;
  }
  if (typeof method !== 'string' || method.length === 0) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'method is required' } });
    return;
  }
  if (typeof path !== 'string' || !path.startsWith('/')) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: "path must start with '/'" } });
    return;
  }

  // Verify the calling container's user owns the project. This is the only
  // tenancy boundary on this endpoint.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, organizationId: true },
  });
  if (!project || project.userId !== container.userId) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Project access denied' } });
    return;
  }

  // Optional org match: if the container is org-scoped and the project belongs
  // to a different org (or to a personal project), reject.
  if (container.organizationId && project.organizationId && container.organizationId !== project.organizationId) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Project organization mismatch' } });
    return;
  }

  // Decode optional raw body for HMAC auth checking.
  let rawBody: Buffer | null = null;
  const rawBodyB64 = payload['rawBodyBase64'];
  if (typeof rawBodyB64 === 'string' && rawBodyB64.length > 0) {
    try {
      rawBody = Buffer.from(rawBodyB64, 'base64');
    } catch {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'rawBodyBase64 is not valid base64' } });
      return;
    }
  }

  const headers = (payload['headers'] as Record<string, string | string[] | undefined>) ?? {};
  const query = (payload['query'] as Record<string, string | string[]>) ?? {};
  const body = payload['body'] ?? null;
  const remoteIp = typeof payload['remoteIp'] === 'string' ? (payload['remoteIp'] as string) : null;
  const subdomain = typeof payload['subdomain'] === 'string' ? (payload['subdomain'] as string) : null;

  // Lazy-import to keep the cold-start lean for the much-hotter Telegram path.
  const { dispatchHttpRoute } = await import('@/modules/project-resource/http-route-dispatch');

  try {
    const result = await dispatchHttpRoute({
      projectId,
      method,
      path,
      headers,
      query,
      body,
      rawBody,
      remoteIp,
      subdomain,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    log.error(
      { projectId, method, path, error: (err as Error).message },
      'http-route-dispatch failed',
    );
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Dispatch failed' } });
  }
});
