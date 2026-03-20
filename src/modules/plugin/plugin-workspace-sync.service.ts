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
    const isBotDirPlugin = /^bots\/[^/]+\/plugins\//.test(path);

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

    // Delete records in a transaction
    await prisma.$transaction(async (tx) => {
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
}

export const pluginWorkspaceSyncService = new PluginWorkspaceSyncService();
