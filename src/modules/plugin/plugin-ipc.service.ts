/**
 * Plugin IPC Service
 *
 * Handles IPC (Inter-Process Communication) requests from plugins running
 * inside workspace containers. Plugins use the bridge agent WebSocket to
 * send storage and gateway requests back to the platform.
 *
 * Flow: Plugin child process → Plugin Runner → Bridge Agent → WebSocket → BridgeClient → PluginIpcService
 *
 * @module modules/plugin/plugin-ipc.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { twoBotAIProvider } from '@/modules/2bot-ai-provider';
import type {
    TextGenerationMessage,
    TwoBotAIModel,
} from '@/modules/2bot-ai-provider/types';
import { gatewayService } from '@/modules/gateway';
import { gatewayRegistry } from '@/modules/gateway/gateway.registry';

import { createPluginStorage } from './plugin.executor';

const ipcLog = logger.child({ module: 'plugin-ipc' });

// ===========================================
// Types
// ===========================================

/** An IPC request from a plugin running inside a container */
export interface PluginIpcRequest {
  /** Unique request ID for response matching */
  id: string;
  /** Plugin file path (e.g., 'plugins/echo.js') */
  pluginFile: string;
  /** IPC method to call */
  method: PluginIpcMethod;
  /** Method-specific data */
  data: Record<string, unknown>;
}

/** Supported IPC methods */
export type PluginIpcMethod =
  | 'storage.get'
  | 'storage.set'
  | 'storage.delete'
  | 'storage.has'
  | 'storage.increment'
  | 'storage.keys'
  | 'storage.getMany'
  | 'storage.setMany'
  | 'storage.clearPlugin'
  | 'storage.dump'
  | 'gateway.execute'
  | 'gateway.list'
  | 'gateway.getCredentials'
  | 'gateway.create'   // deprecated — returns error pointing to UI
  | 'gateway.remove'    // deprecated — returns error pointing to UI
  | 'ai.chat'
  | 'ai.generateImage'
  | 'ai.speak'
  | 'webhook.create'    // deprecated alias
  | 'webhook.list'      // deprecated alias
  | 'webhook.remove';   // deprecated alias

/** IPC response sent back to the plugin */
export interface PluginIpcResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ===========================================
// Plugin Context Cache
// ===========================================

/**
 * Cached context for a plugin running in a container.
 * Avoids repeated DB lookups for every IPC call.
 */
interface CachedPluginContext {
  userId: string;
  organizationId: string | null;
  userPluginId: string;
  resolvedAt: number;
}

/** Cache TTL: 5 minutes */
const CONTEXT_CACHE_TTL = 5 * 60 * 1000;

/** Cache key: containerDbId:pluginSlug */
const contextCache = new Map<string, CachedPluginContext>();

// ===========================================
// AI Rate Limiting
// ===========================================

/** Per-plugin AI rate limit: max requests per window */
const AI_RATE_LIMIT_MAX = 30;
/** Rate limit window: 60 seconds */
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Rate limit tracker: userPluginId → { count, windowStart } */
const aiRateLimits = new Map<string, { count: number; windowStart: number }>();

/**
 * Check and increment the AI rate limit for a plugin.
 * Throws if the plugin has exceeded its per-minute AI request limit.
 */
function checkAiRateLimit(userPluginId: string): void {
  const now = Date.now();
  const entry = aiRateLimits.get(userPluginId);

  if (!entry || now - entry.windowStart >= AI_RATE_LIMIT_WINDOW_MS) {
    // New window
    aiRateLimits.set(userPluginId, { count: 1, windowStart: now });
    return;
  }

  if (entry.count >= AI_RATE_LIMIT_MAX) {
    const remainingMs = AI_RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    throw new Error(
      `AI rate limit exceeded (${AI_RATE_LIMIT_MAX} requests/min). ` +
      `Try again in ${Math.ceil(remainingMs / 1000)}s.`
    );
  }

  entry.count++;
}

// ===========================================
// Service
// ===========================================

class PluginIpcService {
  /**
   * Handle an IPC request from a plugin inside a workspace container.
   *
   * @param containerDbId - The database ID of the workspace container
   * @param request - The IPC request from the plugin
   * @returns The result to send back to the plugin
   */
  async handleRequest(
    containerDbId: string,
    request: PluginIpcRequest,
  ): Promise<PluginIpcResponse> {
    const { id, pluginFile, method, data } = request;

    try {
      // Resolve plugin context (userId, orgId, userPluginId)
      const ctx = await this.resolvePluginContext(containerDbId, pluginFile);

      let result: unknown;

      switch (method) {
        case 'storage.get':
          result = await this.storageGet(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.set':
          result = await this.storageSet(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.delete':
          result = await this.storageDelete(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.has':
          result = await this.storageHas(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.increment':
          result = await this.storageIncrement(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.keys':
          result = await this.storageKeys(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.getMany':
          result = await this.storageGetMany(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.setMany':
          result = await this.storageSetMany(ctx.userPluginId, ctx.userId, data);
          break;
        case 'storage.clearPlugin':
          result = await this.storageClearPlugin(ctx.userPluginId);
          break;
        case 'storage.dump':
          result = await this.storageDump(ctx.userPluginId);
          break;
        case 'gateway.execute':
          result = await this.gatewayExecute(ctx.userId, ctx.organizationId, data);
          break;
        case 'gateway.list':
          result = await this.gatewayList(ctx.userId, ctx.organizationId);
          break;
        case 'gateway.getCredentials':
          result = await this.gatewayGetCredentials(ctx.userId, ctx.organizationId, data);
          break;
        case 'gateway.create':
          throw new Error('sdk.gateway.create() is deprecated. Create gateways via the UI (Gateways → Add Gateway), then select in plugin configuration.');
        case 'gateway.remove':
          throw new Error('sdk.gateway.remove() is deprecated. Manage gateways via the UI (Gateways page).');
        case 'ai.chat':
          result = await this.aiChat(ctx.userId, ctx.organizationId, ctx.userPluginId, data);
          break;
        case 'ai.generateImage':
          result = await this.aiGenerateImage(ctx.userId, ctx.organizationId, ctx.userPluginId, data);
          break;
        case 'ai.speak':
          result = await this.aiSpeak(ctx.userId, ctx.organizationId, ctx.userPluginId, data);
          break;
        case 'webhook.create':
          throw new Error('sdk.webhook.create() is deprecated. Create gateways via the UI (Gateways → Add Gateway).');
        case 'webhook.list':
          result = await this.gatewayList(ctx.userId, ctx.organizationId);
          break;
        case 'webhook.remove':
          throw new Error('sdk.webhook.remove() is deprecated. Manage gateways via the UI (Gateways page).');
        default:
          return { id, success: false, error: `Unknown IPC method: ${method}` };
      }

      return { id, success: true, result };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      ipcLog.warn({ containerDbId, pluginFile, method, error: errorMessage }, 'IPC request failed');
      return { id, success: false, error: errorMessage };
    }
  }

  // ===========================================
  // Context Resolution
  // ===========================================

  /**
   * Look up userId, orgId, and userPluginId from the container and plugin file.
   * Results are cached to avoid repeated DB queries.
   */
  private async resolvePluginContext(
    containerDbId: string,
    pluginFile: string,
  ): Promise<CachedPluginContext> {
    // Extract slug from file path:
    //   'plugins/echo.js' → 'echo'
    //   'plugins/my-bot/index.js' → 'my-bot'
    const slug = pluginFile
      .replace(/^plugins\//, '')
      .replace(/\.[jt]sx?$/, '')
      .replace(/\/index$/, '');

    const cacheKey = `${containerDbId}:${slug}`;
    const cached = contextCache.get(cacheKey);

    if (cached && Date.now() - cached.resolvedAt < CONTEXT_CACHE_TTL) {
      return cached;
    }

    // Look up the container to get userId and orgId
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { userId: true, organizationId: true },
    });

    if (!container) {
      throw new Error(`Container not found: ${containerDbId}`);
    }

    // Find the UserPlugin
    // Try exact org match first, then fall back to any matching plugin for this user.
    // This handles the case where a plugin is org-scoped but runs in a personal container.
    let userPlugin = await prisma.userPlugin.findFirst({
      where: {
        userId: container.userId,
        organizationId: container.organizationId ?? null,
        plugin: { slug },
        isEnabled: true,
      },
      select: { id: true },
    });

    if (!userPlugin && container.organizationId) {
      // Try without org filter (e.g., personal plugin running in org context)
      userPlugin = await prisma.userPlugin.findFirst({
        where: {
          userId: container.userId,
          plugin: { slug },
          isEnabled: true,
        },
        select: { id: true },
      });
    }

    if (!userPlugin && !container.organizationId) {
      // Container has no org — try any enabled plugin for this user regardless of org
      userPlugin = await prisma.userPlugin.findFirst({
        where: {
          userId: container.userId,
          plugin: { slug },
          isEnabled: true,
        },
        select: { id: true },
      });
    }

    if (!userPlugin) {
      throw new Error(`Plugin '${slug}' not found or not enabled for this user`);
    }

    const ctx: CachedPluginContext = {
      userId: container.userId,
      organizationId: container.organizationId,
      userPluginId: userPlugin.id,
      resolvedAt: Date.now(),
    };

    contextCache.set(cacheKey, ctx);
    return ctx;
  }

  // ===========================================
  // Storage Operations
  // ===========================================

  private async storageGet(
    userPluginId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const storage = createPluginStorage(userPluginId, userId);
    const key = data.key as string;
    if (!key) throw new Error('storage.get requires "key"');
    return storage.get(key);
  }

  private async storageSet(
    userPluginId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<null> {
    const storage = createPluginStorage(userPluginId, userId);
    const key = data.key as string;
    if (!key) throw new Error('storage.set requires "key"');
    await storage.set(key, data.value, data.ttlSeconds as number | undefined);
    return null;
  }

  private async storageDelete(
    userPluginId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<null> {
    const storage = createPluginStorage(userPluginId, userId);
    const key = data.key as string;
    if (!key) throw new Error('storage.delete requires "key"');
    await storage.delete(key);
    return null;
  }

  private async storageHas(
    userPluginId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const storage = createPluginStorage(userPluginId, userId);
    const key = data.key as string;
    if (!key) throw new Error('storage.has requires "key"');
    return storage.has(key);
  }

  private async storageIncrement(
    userPluginId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<number> {
    const storage = createPluginStorage(userPluginId, userId);
    const key = data.key as string;
    if (!key) throw new Error('storage.increment requires "key"');
    return storage.increment(key, (data.by as number) ?? 1);
  }

  // ===========================================
  // Rich Storage Operations
  // ===========================================

  private async storageKeys(
    userPluginId: string,
    _userId: string,
    data: Record<string, unknown>,
  ): Promise<string[]> {
    const pattern = (data.pattern as string) || '*';
    const keyPrefix = `plugin:${userPluginId}:`;
    const { redis } = await import('@/lib/redis');
    const fullPattern = `${keyPrefix}${pattern}`;
    // Use SCAN instead of KEYS to avoid blocking Redis
    const results: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
      cursor = nextCursor;
      results.push(...keys);
    } while (cursor !== '0');
    // Strip the prefix so plugins see clean keys
    return results.map((k: string) => k.slice(keyPrefix.length));
  }

  private async storageGetMany(
    userPluginId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const keys = data.keys as string[];
    if (!keys || !Array.isArray(keys)) throw new Error('storage.getMany requires "keys" array');
    const storage = createPluginStorage(userPluginId, userId);
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = await storage.get(key);
    }
    return result;
  }

  private async storageSetMany(
    userPluginId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<null> {
    const entries = data.entries as Array<{ key: string; value: unknown; ttlSeconds?: number }>;
    if (!entries || !Array.isArray(entries)) throw new Error('storage.setMany requires "entries" array');
    const storage = createPluginStorage(userPluginId, userId);
    for (const entry of entries) {
      if (!entry.key) continue;
      await storage.set(entry.key, entry.value, entry.ttlSeconds);
    }
    return null;
  }

  // ===========================================
  // Storage Cleanup
  // ===========================================

  /**
   * Delete ALL Redis keys for a given plugin installation.
   * Called during plugin uninstall to free server-side storage.
   */
  private async storageClearPlugin(userPluginId: string): Promise<{ deleted: number }> {
    return this.clearPluginRedisKeys(userPluginId);
  }

  /**
   * Dump ALL Redis keys for a plugin installation.
   * Used for bulk cache warming when a container starts.
   * Returns a key-value map (keys stripped of the internal prefix).
   * Limited to 1000 keys to prevent excessive data transfer.
   */
  private async storageDump(userPluginId: string): Promise<Record<string, unknown>> {
    const { redis } = await import('@/lib/redis');
    const keyPrefix = `plugin:${userPluginId}:`;
    const pattern = `${keyPrefix}*`;
    const result: Record<string, unknown> = {};
    let cursor = '0';
    let totalKeys = 0;
    const MAX_KEYS = 1000;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;

      for (const key of keys) {
        if (totalKeys >= MAX_KEYS) {
          cursor = '0'; // Stop scanning
          break;
        }
        try {
          const raw = await redis.get(key);
          if (raw !== null) {
            const cleanKey = key.slice(keyPrefix.length);
            result[cleanKey] = JSON.parse(raw);
            totalKeys++;
          }
        } catch {
          // Skip unparseable keys
        }
      }
    } while (cursor !== '0');

    ipcLog.debug({ userPluginId, keyCount: totalKeys }, 'Storage dump completed');
    return result;
  }

  /**
   * Public helper: remove all Redis keys matching `plugin:<userPluginId>:*`
   * Uses SCAN to avoid blocking Redis on large keyspaces.
   */
  async clearPluginRedisKeys(userPluginId: string): Promise<{ deleted: number }> {
    const { redis } = await import('@/lib/redis');
    const keyPrefix = `plugin:${userPluginId}:`;
    const pattern = `${keyPrefix}*`;
    let totalDeleted = 0;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');
    if (totalDeleted > 0) {
      ipcLog.info({ userPluginId, deleted: totalDeleted }, 'Cleared plugin Redis storage');
    }
    return { deleted: totalDeleted };
  }

  // ===========================================
  // Gateway Operations
  // ===========================================

  /**
   * Execute a gateway action on behalf of a plugin.
   *
   * The plugin provides a gatewayId (which it got from gateway.list),
   * an action name (e.g., 'sendMessage'), and action params.
   * We look up the gateway, verify the user owns it, and execute via the registry.
   */
  private async gatewayExecute(
    userId: string,
    organizationId: string | null,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const gatewayId = data.gatewayId as string;
    const action = data.action as string;
    const params = data.params;

    if (!gatewayId) throw new Error('gateway.execute requires "gatewayId"');
    if (!action) throw new Error('gateway.execute requires "action"');

    // Look up the gateway and verify ownership
    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
    });

    if (!gateway) {
      throw new Error(`Gateway not found: ${gatewayId}`);
    }

    // Verify the gateway belongs to this user or their org
    const isOwner =
      gateway.userId === userId ||
      (organizationId && gateway.organizationId === organizationId);

    if (!isOwner) {
      throw new Error(`Gateway not accessible: ${gatewayId}`);
    }

    // Get the provider and execute
    const provider = gatewayRegistry.get(gateway.type);
    const credentials = gatewayService.getDecryptedCredentials(gateway);

    // Ensure the provider is connected for this gateway.
    // BaseGatewayProvider.execute() will throw if not connected,
    // so we try to connect first if needed.
    try {
      return await provider.execute(gatewayId, action, params);
    } catch (execErr) {
      // If the error indicates not connected, try connecting and retry
      const msg = execErr instanceof Error ? execErr.message : '';
      if (msg.includes('not connected') || msg.includes('Not connected') || msg.includes('Gateway not connected')) {
        ipcLog.info({ gatewayId }, 'Gateway not connected — attempting connect for IPC');
        await provider.connect(gatewayId, credentials, (gateway.config as Record<string, unknown>) ?? {});
        return provider.execute(gatewayId, action, params);
      }
      throw execErr;
    }
  }

  /**
   * Get gateway credentials for direct API calls from the container.
   * Returns the gateway type and decrypted credentials (e.g., bot token).
   * This enables containers to call external APIs directly instead of
   * relaying every request through the main server.
   */
  private async gatewayGetCredentials(
    userId: string,
    organizationId: string | null,
    data: Record<string, unknown>,
  ): Promise<{ type: string; botToken?: string; credentials?: Record<string, string> }> {
    const gatewayId = data.gatewayId as string;
    if (!gatewayId) throw new Error('gateway.getCredentials requires "gatewayId"');

    const gw = await prisma.gateway.findUnique({
      where: { id: gatewayId },
    });

    if (!gw) throw new Error(`Gateway not found: ${gatewayId}`);

    const isOwner =
      gw.userId === userId ||
      (organizationId && gw.organizationId === organizationId);

    if (!isOwner) throw new Error(`Gateway not accessible: ${gatewayId}`);

    const credentials = gatewayService.getDecryptedCredentials(gw);

    // Return type-appropriate credential data
    if (gw.type === 'TELEGRAM_BOT' && 'botToken' in credentials) {
      return { type: gw.type, botToken: credentials.botToken };
    }

    if (gw.type === 'CUSTOM_GATEWAY') {
      // Return all key-value credentials for custom gateways
      return { type: gw.type, credentials: credentials as Record<string, string> };
    }

    return { type: gw.type };
  }

  /**
   * List all gateways available to the plugin's user.
   * Unified query — Telegram, AI, and Custom gateways all live in the same table.
   */
  private async gatewayList(
    userId: string,
    organizationId: string | null,
  ): Promise<Array<{ id: string; name: string; type: string; url?: string; active?: boolean }>> {
    const gateways = await prisma.gateway.findMany({
      where: {
        OR: [
          { userId, organizationId: null },
          ...(organizationId ? [{ organizationId }] : []),
        ],
        status: 'CONNECTED',
      },
      select: { id: true, name: true, type: true, metadata: true },
    });

    const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.TELEGRAM_WEBHOOK_BASE_URL || 'https://webhook.2bot.org';

    return gateways.map((g) => {
      const entry: { id: string; name: string; type: string; url?: string; active?: boolean } = {
        id: g.id,
        name: g.name,
        type: g.type,
      };
      if (g.type === 'CUSTOM_GATEWAY') {
        entry.url = `${baseUrl}/custom/${g.id}`;
        entry.active = true; // All CONNECTED gateways are active
      }
      return entry;
    });
  }

  // ===========================================
  // AI Operations
  // ===========================================

  /**
   * Text generation (chat) via 2Bot AI on behalf of a plugin.
   *
   * The plugin provides messages, an optional model, and optional parameters.
   * Credits are automatically checked and deducted from the user/org wallet.
   *
   * @returns { content, model, usage, creditsUsed }
   */
  private async aiChat(
    userId: string,
    organizationId: string | null,
    userPluginId: string,
    data: Record<string, unknown>,
  ): Promise<{
    content: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    creditsUsed: number;
  }> {
    checkAiRateLimit(userPluginId);

    const messages = data.messages as TextGenerationMessage[];
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('ai.chat requires "messages" array with at least one message');
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        throw new Error('Each message must have "role" and "content" fields');
      }
      if (!['system', 'user', 'assistant'].includes(msg.role)) {
        throw new Error(`Invalid message role: "${msg.role}". Must be "system", "user", or "assistant"`);
      }
    }

    const model = (data.model as string) || '2bot-ai-text-lite';
    const temperature = data.temperature as number | undefined;
    const maxTokens = data.maxTokens as number | undefined;

    // Cap max tokens for plugin usage (prevent runaway costs)
    const cappedMaxTokens = maxTokens ? Math.min(maxTokens, 4096) : 2048;

    ipcLog.info({ userId, userPluginId, model, messageCount: messages.length }, 'Plugin AI chat request');

    const response = await twoBotAIProvider.textGeneration({
      messages,
      model: model as TwoBotAIModel,
      temperature,
      maxTokens: cappedMaxTokens,
      userId,
      organizationId: organizationId ?? undefined,
      smartRouting: false, // Plugins use explicit model selection
      userPluginId,
      feature: "plugin-ipc",
    });

    return {
      content: response.content,
      model: response.model,
      usage: response.usage,
      creditsUsed: response.creditsUsed,
    };
  }

  /**
   * Image generation via 2Bot AI on behalf of a plugin.
   *
   * The plugin provides a prompt, an optional model, and optional parameters.
   * Credits are automatically checked and deducted from the user/org wallet.
   *
   * @returns { images, model, creditsUsed }
   */
  private async aiGenerateImage(
    userId: string,
    organizationId: string | null,
    userPluginId: string,
    data: Record<string, unknown>,
  ): Promise<{
    images: Array<{ url: string; revisedPrompt?: string }>;
    model: string;
    creditsUsed: number;
  }> {
    checkAiRateLimit(userPluginId);

    const prompt = data.prompt as string;
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('ai.generateImage requires "prompt" string');
    }

    if (prompt.length > 4000) {
      throw new Error('Image prompt must be 4000 characters or less');
    }

    const model = (data.model as string) || '2bot-ai-image-pro';
    const size = data.size as string | undefined;
    const quality = data.quality as string | undefined;
    const n = data.n as number | undefined;

    // Cap image count for plugin usage
    const cappedN = n ? Math.min(n, 4) : 1;

    ipcLog.info({ userId, userPluginId, model, promptLength: prompt.length }, 'Plugin AI image generation request');

    const response = await twoBotAIProvider.imageGeneration({
      prompt,
      model,
      size: size as 'string' extends typeof size ? undefined : typeof size,
      quality: quality as 'string' extends typeof quality ? undefined : typeof quality,
      n: cappedN,
      userId,
      organizationId: organizationId ?? undefined,
      userPluginId,
    } as Parameters<typeof twoBotAIProvider.imageGeneration>[0]);

    return {
      images: response.images,
      model: response.model,
      creditsUsed: response.creditsUsed,
    };
  }

  /**
   * Speech synthesis (text-to-speech) via 2Bot AI on behalf of a plugin.
   *
   * The plugin provides text, an optional model/voice, and optional parameters.
   * Credits are automatically checked and deducted from the user/org wallet.
   *
   * @returns { audioUrl, audioBase64, format, characterCount, creditsUsed }
   */
  private async aiSpeak(
    userId: string,
    organizationId: string | null,
    userPluginId: string,
    data: Record<string, unknown>,
  ): Promise<{
    audioUrl?: string;
    audioBase64?: string;
    format: string;
    characterCount: number;
    creditsUsed: number;
  }> {
    checkAiRateLimit(userPluginId);

    const text = data.text as string;
    if (!text || typeof text !== 'string') {
      throw new Error('ai.speak requires "text" string');
    }

    if (text.length > 4096) {
      throw new Error('Speech text must be 4096 characters or less');
    }

    const model = (data.model as string) || '2bot-ai-voice-pro';
    const voice = data.voice as string | undefined;
    const format = data.format as string | undefined;
    const speed = data.speed as number | undefined;

    ipcLog.info({ userId, userPluginId, model, textLength: text.length }, 'Plugin AI speech synthesis request');

    const response = await twoBotAIProvider.speechSynthesis({
      text,
      model,
      voice: voice as Parameters<typeof twoBotAIProvider.speechSynthesis>[0]['voice'],
      format: format as Parameters<typeof twoBotAIProvider.speechSynthesis>[0]['format'],
      speed,
      userId,
      organizationId: organizationId ?? undefined,
      userPluginId,
    });

    return {
      audioUrl: response.audioUrl,
      audioBase64: response.audioBase64,
      format: response.format,
      characterCount: response.characterCount,
      creditsUsed: response.creditsUsed,
    };
  }

  /**
   * Clear the context cache (useful when plugins are installed/uninstalled)
   */
  clearCache(containerDbId?: string): void {
    if (containerDbId) {
      for (const key of contextCache.keys()) {
        if (key.startsWith(`${containerDbId}:`)) {
          contextCache.delete(key);
        }
      }
    } else {
      contextCache.clear();
    }
    // Also clear AI rate limits when clearing all caches
    if (!containerDbId) {
      aiRateLimits.clear();
    }
  }

  /**
   * Clear AI rate limits (for testing or admin resets)
   */
  clearRateLimits(): void {
    aiRateLimits.clear();
  }

}

/** Singleton instance */
export const pluginIpcService = new PluginIpcService();
