/**
 * Plugin Workspace Sync Service
 *
 * Handles DB state syncing between workspace file/plugin operations
 * and the UserPlugin table. Extracted from workspace.service.ts to keep
 * plugin-domain DB logic inside the plugin module.
 *
 * @module modules/plugin/plugin-workspace-sync.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import { pluginIpcService } from './plugin-ipc.service';
import { pluginSlugFromPath } from './plugin.types';

import type { BridgeClient } from '@/modules/workspace/bridge-client.service';
import type { GatewayType } from '@prisma/client';
import type { Logger } from 'pino';

const _log = logger.child({ module: 'plugin:workspace-sync' });

class PluginWorkspaceSyncService {

  /**
   * Called when a plugin file or directory is deleted from the workspace.
   * Stops the plugin, removes UserPlugin + catalog entries, and clears storage/caches.
   */
  async handlePluginFileDeleted(
    containerDbId: string,
    path: string,
    bridgeClient: BridgeClient,
  ): Promise<void> {
    // Match both flat paths (plugins/slug.js) and bot-dir paths (bots/{gwId}/plugins/slug.js)
    const isFlatPluginFile = path.startsWith('plugins/') && /\.(js|ts|mjs|cjs)$/.test(path);
    const isFlatPluginDir = path.startsWith('plugins/') && /^plugins\/[^/]+\/?$/.test(path);
    const isBotDirPlugin = /^bots\/[^/]+\/plugins\//.test(path) || /^bots\/[^/]+\/[^/]+\/plugins\//.test(path);

    if (!isFlatPluginFile && !isFlatPluginDir && !isBotDirPlugin) return;

    // Stop the plugin process if running (ignore errors — file already gone)
    await bridgeClient.pluginStop(path, true).catch(() => {});

    const slugFromFile = pluginSlugFromPath(path);

    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { userId: true, organizationId: true },
    });
    if (!container) return;

    const userPlugin = await prisma.userPlugin.findFirst({
      where: {
        userId: container.userId,
        organizationId: container.organizationId ?? null,
        OR: [
          { entryFile: path },
          { plugin: { slug: slugFromFile } },
        ],
      },
      include: { plugin: true },
    });

    if (!userPlugin) return;

    const plugin = userPlugin.plugin;
    const isCustomPlugin = plugin.authorType === 'USER' && !plugin.isBuiltin;

    // Check if this is the last installation (for catalog cleanup)
    let shouldDeleteCatalogEntry = false;
    if (isCustomPlugin) {
      const installCount = await prisma.userPlugin.count({
        where: { pluginId: plugin.id },
      });
      shouldDeleteCatalogEntry = installCount <= 1;
    }

    // Enumerate workflow steps that will be cascade-deleted so we can warn
    // the user and emit an audit trail. The actual deletion happens via
    // `onDelete: Cascade` on WorkflowStep.pluginId FK.
    const affectedSteps = await prisma.workflowStep.findMany({
      where: {
        pluginId: plugin.id,
        workflow: container.organizationId
          ? { organizationId: container.organizationId }
          : { userId: container.userId },
      },
      select: {
        id: true,
        name: true,
        workflowId: true,
        workflow: { select: { name: true } },
      },
    });

    if (affectedSteps.length > 0) {
      _log.warn(
        {
          pluginId: plugin.id,
          pluginSlug: plugin.slug,
          userId: container.userId,
          organizationId: container.organizationId,
          affectedStepCount: affectedSteps.length,
          affectedWorkflows: Array.from(
            new Set(affectedSteps.map((s) => `${s.workflowId}:${s.workflow.name ?? ''}`)),
          ),
        },
        'Plugin file deleted — workflow steps will be cascade-removed',
      );
    }

    // Delete records in a transaction
    await prisma.$transaction(async (tx) => {
      // Explicitly delete WorkflowSteps first so we can batch-push workflow
      // caches afterwards (Cascade would also work, but explicit is clearer).
      if (affectedSteps.length > 0) {
        await tx.workflowStep.deleteMany({
          where: { id: { in: affectedSteps.map((s) => s.id) } },
        });
      }
      await tx.userPlugin.delete({ where: { id: userPlugin.id } });
      if (shouldDeleteCatalogEntry) {
        await tx.plugin.delete({ where: { id: plugin.id } });
      }
    });

    // Clear container-local SQLite storage for this plugin
    const pluginFile = userPlugin.entryFile ?? `plugins/${slugFromFile}.js`;
    await bridgeClient.send('storage.clearPlugin', { pluginFile }).catch(() => {});

    // Delete per-plugin database file
    await bridgeClient.send('storage.deletePluginDb', { pluginFile }).catch(() => {});

    // Clear server-side Redis storage (non-blocking)
    void pluginIpcService.clearPluginRedisKeys(userPlugin.id).catch(() => {});

    // Invalidate IPC context cache
    pluginIpcService.clearCache();
  }

  /**
   * Called when a plugin starts — syncs isEnabled=true in UserPlugin.
   */
  async handlePluginStarted(containerDbId: string, file: string): Promise<void> {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { userId: true, organizationId: true },
    });
    if (!container) return;

    const slugFromFile = pluginSlugFromPath(file);

    const userPlugin = await prisma.userPlugin.findFirst({
      where: {
        userId: container.userId,
        organizationId: container.organizationId ?? null,
        isEnabled: false,
        OR: [
          { entryFile: file },
          { plugin: { slug: slugFromFile } },
        ],
      },
      select: { id: true },
    });

    if (userPlugin) {
      await prisma.userPlugin.update({
        where: { id: userPlugin.id },
        data: { isEnabled: true },
      });
    }
  }

  /**
   * Called when a plugin stops — syncs isEnabled=false in UserPlugin.
   */
  async handlePluginStopped(containerDbId: string, file: string): Promise<void> {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { userId: true, organizationId: true },
    });
    if (!container) return;

    const slugFromFile = pluginSlugFromPath(file);

    const userPlugin = await prisma.userPlugin.findFirst({
      where: {
        userId: container.userId,
        organizationId: container.organizationId ?? null,
        isEnabled: true,
        OR: [
          { entryFile: file },
          { plugin: { slug: slugFromFile } },
        ],
      },
      select: { id: true },
    });

    if (userPlugin) {
      await prisma.userPlugin.update({
        where: { id: userPlugin.id },
        data: { isEnabled: false },
      });
    }
  }

  /**
   * Enriches a bridge plugin list with display names from the DB (Plugin.name).
   * Mutates plugin objects in-place by setting `displayName`.
   */
  async enrichPluginList(
    containerDbId: string,
    plugins: Array<{ file: string; name: string; displayName?: string; [key: string]: unknown }>,
  ): Promise<void> {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { userId: true, organizationId: true },
    });
    if (!container) return;

    const userPlugins = await prisma.userPlugin.findMany({
      where: {
        userId: container.userId,
        organizationId: container.organizationId ?? null,
      },
      select: {
        entryFile: true,
        plugin: { select: { name: true, slug: true } },
      },
    });

    // Build maps: slug → displayName, entryFile → displayName
    const nameBySlug = new Map<string, string>();
    const nameByFile = new Map<string, string>();
    for (const up of userPlugins) {
      nameBySlug.set(up.plugin.slug, up.plugin.name);
      if (up.entryFile) {
        nameByFile.set(up.entryFile, up.plugin.name);
      }
    }

    for (const p of plugins) {
      // Try direct entryFile match first
      const byFile = nameByFile.get(p.file);
      if (byFile) { p.displayName = byFile; continue; }

      const slugFromFile = pluginSlugFromPath(p.file);
      const bySlug = nameBySlug.get(slugFromFile);
      if (bySlug) { p.displayName = bySlug; }
    }
  }

  /**
   * Discover unregistered plugins in the workspace container.
   *
   * Scans `plugins/` (flat layout) AND `bots/{platform}/{gwId}/plugins/`
   * (bot-dir layout) for directories with `plugin.json` or `index.js`
   * that don't have a matching DB record, then auto-registers them.
   *
   * Works regardless of how files got there: AI agent, manual upload,
   * git clone, etc.
   */
  async discoverAndRegisterPlugins(
    client: BridgeClient,
    userId: string,
    organizationId: string | null,
    log?: Logger,
    userPlan?: string,
  ): Promise<DiscoveredPlugin[]> {
    const slog = log ?? _log;
    const results: DiscoveredPlugin[] = [];

    slog.info({ userId, organizationId }, 'Starting workspace plugin discovery');

    // 1. Collect plugin dirs from flat layout (plugins/) AND bot-dir layout
    //    (bots/{platform}/{gwId}/plugins/).
    const pluginDirs: Array<{ name: string; type: string }> = [];

    // 1a. Flat layout: plugins/
    try {
      const rawListing = await client.fileList('plugins', false);
      const listing = Array.isArray(rawListing) ? rawListing : [];
      slog.info({ rawCount: listing.length, sample: listing.slice(0, 3) }, 'Raw fileList response for plugins/');
      const dirs = listing.filter((e: Record<string, unknown>) =>
        e.type === 'directory' || e.isDirectory === true || (typeof e.name === 'string' && e.name.endsWith('/')),
      ).map((e: Record<string, unknown>) => ({ name: String(e.name), type: 'directory' }));
      pluginDirs.push(...dirs);
      slog.info({ dirs: dirs.map(d => d.name) }, 'Found flat plugin directories');
    } catch {
      slog.debug('plugins/ directory not found or not accessible');
    }

    // 1b. Bot-dir layout: bots/{platform}/{gwId}/plugins/
    try {
      const botsListing = await client.fileList('bots', false);
      const platforms = Array.isArray(botsListing)
        ? botsListing.filter((e: Record<string, unknown>) =>
            e.type === 'directory' || e.isDirectory === true || (typeof e.name === 'string' && e.name.endsWith('/')),
          ).map((e: Record<string, unknown>) => String(e.name).replace(/\/$/, ''))
        : [];

      for (const platform of platforms) {
        try {
          const gwListing = await client.fileList(`bots/${platform}`, false);
          const gateways = Array.isArray(gwListing)
            ? gwListing.filter((e: Record<string, unknown>) =>
                e.type === 'directory' || e.isDirectory === true || (typeof e.name === 'string' && e.name.endsWith('/')),
              ).map((e: Record<string, unknown>) => String(e.name).replace(/\/$/, ''))
            : [];

          for (const gwId of gateways) {
            try {
              const pluginsListing = await client.fileList(`bots/${platform}/${gwId}/plugins`, false);
              const botDirs = Array.isArray(pluginsListing)
                ? pluginsListing.filter((e: Record<string, unknown>) =>
                    e.type === 'directory' || e.isDirectory === true || (typeof e.name === 'string' && e.name.endsWith('/')),
                  ).map((e: Record<string, unknown>) => ({
                    name: `bots/${platform}/${gwId}/plugins/${String(e.name).replace(/\/$/, '')}`,
                    type: 'directory',
                  }))
                : [];
              pluginDirs.push(...botDirs);
            } catch {
              // No plugins dir for this gateway
            }
          }
        } catch {
          // Can't list gateways under this platform
        }
      }
    } catch {
      slog.debug('bots/ directory not found or not accessible');
    }

    if (pluginDirs.length === 0) return results;

    // 2. Collect all existing custom plugin slugs for this user
    const existingPlugins = await prisma.plugin.findMany({
      where: { authorId: userId, isBuiltin: false, isActive: true },
      select: { slug: true, id: true },
    });
    const existingSlugs = new Set(existingPlugins.map((p) => p.slug));

    const userPlugins = await prisma.userPlugin.findMany({
      where: { userId, organizationId: organizationId ?? null },
      select: { id: true, pluginId: true, plugin: { select: { slug: true } } },
    });
    const installedSlugs = new Map(userPlugins.map((up) => [up.plugin.slug, { userPluginId: up.id, catalogPluginId: up.pluginId }]));

    // 3. Check each directory
    for (const dir of pluginDirs) {
      // For flat layout, dir.name is just the slug folder name (e.g. "my-bot").
      // For bot-dir layout, dir.name is the full relative path
      // (e.g. "bots/telegram/{gwId}/plugins/my-bot"). Extract the final
      // segment as the slug name and keep the full path for file reads.
      const dirPath = dir.name.replace(/\/$/, '');
      const dirName = dirPath.split('/').pop() ?? dirPath;
      const fullSlug = `custom-${userId.slice(0, 8)}-${dirName}`;

      // Skip already registered
      if (existingSlugs.has(fullSlug)) {
        const ids = installedSlugs.get(fullSlug);
        if (ids) results.push({ slug: dirName, userPluginId: ids.userPluginId, catalogPluginId: ids.catalogPluginId, name: dirName, action: 'already_exists' });
        continue;
      }

      // Read plugin.json for metadata (or check for index.js)
      let manifest: PluginManifest = {};
      try {
        const pjResult = await client.fileRead(`${dirPath}/plugin.json`) as { content?: string };
        if (pjResult.content) manifest = JSON.parse(pjResult.content);
      } catch {
        try {
          await client.fileRead(`${dirPath}/index.js`);
        } catch {
          slog.debug({ dirPath }, 'Skipping directory without plugin.json or index.js');
          continue;
        }
      }

      // 4. Read all files in the plugin directory
      let fileEntries: Array<Record<string, unknown>>;
      try {
        const rawEntries = await client.fileList(dirPath, true);
        fileEntries = Array.isArray(rawEntries) ? rawEntries : [];
      } catch { continue; }

      const files: Record<string, string> = {};
      const fileNames = fileEntries
        .filter((e) => e.type !== 'directory' && e.isDirectory !== true && !String(e.name ?? '').endsWith('/'))
        .map((e) => String(e.name));

      for (const fileName of fileNames) {
        try {
          const readResult = await client.fileRead(`${dirPath}/${fileName}`) as { content?: string };
          if (readResult.content && readResult.content.length <= 100_000) {
            files[fileName] = readResult.content;
          }
        } catch {
          slog.debug({ fileName, dirPath }, 'Skipping unreadable file');
        }
      }

      if (Object.keys(files).length === 0) continue;

      // 5. Register
      try {
        const { pluginService } = await import('@/modules/plugin');
        const { createServiceContext } = await import('@/shared/types/context');
        const svcCtx = createServiceContext({ userId, role: 'MEMBER', plan: (userPlan || 'FREE') as 'FREE' });
        if (organizationId) (svcCtx as { organizationId?: string }).organizationId = organizationId;

        const requiredGateways = (manifest.requiredGateways ?? detectGatewayRequirements(files)) as GatewayType[];
        const entry = manifest.entry || (files['index.js'] ? 'index.js' : fileNames[0]);
        const category = manifest.category as
          | 'general' | 'analytics' | 'messaging' | 'automation' | 'moderation' | 'utilities'
          | undefined;

        const autoPlugin = await pluginService.createCustomPlugin(svcCtx, {
          slug: dirName,
          name: manifest.name || dirName,
          description: manifest.description || 'Discovered from workspace',
          files,
          entry,
          category: category || 'general',
          requiredGateways,
          configSchema: manifest.configSchema,
          config: manifest.config,
        });

        results.push({
          slug: dirName,
          userPluginId: autoPlugin.id,
          catalogPluginId: autoPlugin.pluginId,
          name: manifest.name || dirName,
          action: 'registered',
        });

        slog.info(
          { slug: dirName, userPluginId: autoPlugin.id, catalogPluginId: autoPlugin.pluginId, fileCount: Object.keys(files).length },
          '✅ Discovered and registered plugin from workspace',
        );
      } catch (err) {
        slog.error({ slug: dirName, error: (err as Error).message }, 'Failed to register discovered plugin');
      }
    }

    return results;
  }

  /**
   * Lightweight single-path registration. Called when a user writes a file
   * to the workspace (e.g. `plugins/foo/index.js`). Triggers discovery only
   * if the path looks like a plugin entry file and no DB record exists yet.
   *
   * Delegates to `discoverAndRegisterPlugins` which is idempotent — existing
   * plugins are skipped, so this is safe to call liberally.
   */
  async ensureRegisteredForPath(
    client: BridgeClient,
    containerDbId: string,
    path: string,
  ): Promise<DiscoveredPlugin | null> {
    // Only act on plausible plugin entry files (plugin.json or index.js
    // at the top of a plugins/{slug}/ or bots/{gw}/plugins/{slug}/ directory)
    const isEntryFile =
      /^plugins\/[^/]+\/(plugin\.json|index\.js)$/.test(path) ||
      /^bots\/[^/]+\/[^/]+\/plugins\/[^/]+\/(plugin\.json|index\.js)$/.test(path) ||
      /^bots\/[^/]+\/plugins\/[^/]+\/(plugin\.json|index\.js)$/.test(path);
    if (!isEntryFile) return null;

    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { userId: true, organizationId: true },
    });
    if (!container) return null;

    // Fast-skip: if an installation already exists for the slug, nothing to do.
    const slug = pluginSlugFromPath(path);
    const existing = await prisma.userPlugin.findFirst({
      where: {
        userId: container.userId,
        organizationId: container.organizationId ?? null,
        plugin: { slug: { endsWith: slug } },
      },
      select: { id: true },
    });
    if (existing) return null;

    try {
      const discovered = await this.discoverAndRegisterPlugins(
        client,
        container.userId,
        container.organizationId ?? null,
      );
      const match = discovered.find((d) => d.slug === slug);
      if (match) {
        _log.info(
          { containerDbId, path, slug, action: match.action },
          'Plugin auto-registered from fileWrite hook',
        );
      }
      return match ?? null;
    } catch (err) {
      _log.debug(
        { containerDbId, path, error: (err as Error).message },
        'ensureRegisteredForPath failed (non-fatal)',
      );
      return null;
    }
  }
}

// ── Types ───────────────────────────────────────────────────

interface PluginManifest {
  slug?: string;
  name?: string;
  description?: string;
  entry?: string;
  version?: string;
  category?: string;
  requiredGateways?: string[];
  configSchema?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface DiscoveredPlugin {
  slug: string;
  userPluginId: string;
  /** Catalog Plugin.id — use this for WorkflowStep.pluginId */
  catalogPluginId: string;
  name: string;
  action: 'registered' | 'already_exists';
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Detect gateway type from plugin source code.
 */
function detectGatewayRequirements(files: Record<string, string>): string[] {
  const allCode = Object.values(files).join('\n').toLowerCase();
  const gateways: string[] = [];

  if (
    allCode.includes('telegram') || allCode.includes('aiogram') ||
    allCode.includes('telethon') || allCode.includes('ctx.reply') ||
    allCode.includes('message.reply') || allCode.includes('bot.send')
  ) gateways.push('TELEGRAM_BOT');

  if (allCode.includes('discord') || allCode.includes('discord.js')) gateways.push('DISCORD_BOT');
  if (allCode.includes('slack') || allCode.includes('@slack/bolt')) gateways.push('SLACK_BOT');
  if (allCode.includes('whatsapp') || allCode.includes('baileys')) gateways.push('WHATSAPP');

  return gateways;
}

export const pluginWorkspaceSyncService = new PluginWorkspaceSyncService();
