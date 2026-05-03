/**
 * Plugin Deployment Service
 *
 * Manages plugin lifecycle inside user workspace containers.
 * 
 * Source of truth for plugin code is the container filesystem.
 * The DB stores only `UserPlugin.entryFile` (path) and `Plugin.codeBundle`
 * (catalog template for first-time installs).
 *
 * Handles:
 * - Writing template code on first install
 * - Starting all enabled plugins on workspace boot (no code writes)
 * - Ensuring a plugin process is running before event delivery
 * - Stopping/removing plugins on uninstall
 * - Reading plugin code from the container filesystem
 *
 * Plugin code is stored at `/workspace/plugins/{slug}.js` (single-file)
 * or `/workspace/plugins/{slug}/` (directory) inside the container.
 *
 * @module modules/plugin/plugin-deploy.service
 */

import { decryptIfEncrypted, decryptJson } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { marketplaceLoader } from '@/modules/marketplace/marketplace-loader.service';
import { registerActivePlugin, unregisterActivePlugin } from '@/modules/plugin/plugin-ipc.service';
import { bridgeClientManager } from '@/modules/workspace';
import type { BridgeClient } from '@/modules/workspace/bridge-client.service';

const deployLog = logger.child({ module: 'plugin-deploy' });

/** Directory inside workspace container where plugins are stored */
const PLUGIN_DIR = 'plugins';

/** Bot-dir layout prefix */
const BOTS_DIR = 'bots';

// ===========================================
// Code Validation
// ===========================================

/** Dangerous patterns that plugins must not use */
const DANGEROUS_PATTERNS = [
  { pattern: /\bchild_process\b/, reason: 'child_process is not allowed — use the SDK for system operations' },
  { pattern: /\brequire\s*\(\s*['"]fs['"]\s*\)/, reason: 'Direct fs access is not allowed — use the SDK storage API' },
  { pattern: /\bprocess\.exit\b/, reason: 'process.exit() is not allowed in plugins' },
  { pattern: /\beval\s*\(/, reason: 'eval() is not allowed for security reasons' },
  { pattern: /\bnew\s+Function\s*\(/, reason: 'new Function() is not allowed for security reasons' },
];

/**
 * Validate plugin code before deployment.
 * Checks for JavaScript syntax errors and dangerous patterns.
 * @throws Error if code fails validation
 */
function validatePluginCode(code: string, pluginSlug: string): void {
  // Check for dangerous patterns
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(`Plugin "${pluginSlug}" rejected: ${reason}`);
    }
  }

  // Basic syntax check via Node's vm module (synchronous, no execution)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vm = require('node:vm');
    new vm.Script(code, { filename: `${pluginSlug}.js` });
  } catch (err) {
    const msg = err instanceof SyntaxError ? err.message : String(err);
    throw new Error(`Plugin "${pluginSlug}" has a syntax error: ${msg}`);
  }
}

/**
 * Map GatewayType enum to a short platform folder name.
 * Used in the bot-dir layout: bots/{platform}/{gatewayId}/plugins/...
 */
export function gatewayTypeToPlatform(gatewayType: string): string {
  switch (gatewayType) {
    case 'TELEGRAM_BOT': return 'telegram';
    case 'DISCORD_BOT': return 'discord';
    case 'SLACK_BOT': return 'slack';
    case 'WHATSAPP_BOT': return 'whatsapp';
    default: return gatewayType.toLowerCase().replace(/_bot$/, '');
  }
}

/**
 * Determine if a plugin uses a directory layout (multiple files with index.js entry)
 * vs a single-file layout (slug.js).
 *
 * Uses the marketplace bundle manifest as the source of truth.
 * Falls back to false (single-file) if the bundle is not found.
 */
export function isDirectoryLayout(pluginSlug: string): boolean {
  const bundle = marketplaceLoader.getBundleCode(pluginSlug);
  return bundle?.layout === 'directory';
}

/**
 * Compute the entry file path for a plugin.
 *
 * Gateway-bound plugins use bot-dir layout:
 *   bots/{platform}/{gatewayId}/plugins/{slug}.js (single-file)
 *   bots/{platform}/{gatewayId}/plugins/{slug}/{entry} (directory)
 *
 * Unbound plugins use flat layout:
 *   plugins/{slug}.js (single-file)
 *   plugins/{slug}/{entry} (directory)
 *
 * @param gatewayId - Gateway ID (null for unbound plugins)
 * @param pluginSlug - Plugin slug
 * @param options.platform - Platform folder name (e.g. "telegram"). Required when gatewayId is set.
 * @param options.isDirectory - If true, uses directory layout with entry file
 * @param options.entry - Entry file within directory plugin (default: "index.js")
 */
export function getPluginEntryPath(
  gatewayId: string | null | undefined,
  pluginSlug: string,
  options?: { platform?: string; isDirectory?: boolean; entry?: string },
): string {
  const entry = options?.entry ?? 'index.js';
  const platform = options?.platform;

  if (gatewayId) {
    const prefix = platform
      ? `${BOTS_DIR}/${platform}/${gatewayId}`
      : `${BOTS_DIR}/${gatewayId}`;
    return options?.isDirectory
      ? `${prefix}/${PLUGIN_DIR}/${pluginSlug}/${entry}`
      : `${prefix}/${PLUGIN_DIR}/${pluginSlug}.js`;
  }
  return options?.isDirectory
    ? `${PLUGIN_DIR}/${pluginSlug}/${entry}`
    : `${PLUGIN_DIR}/${pluginSlug}.js`;
}

/**
 * Compute the plugin directory path (without entry file).
 * For bot-dir layout: bots/{platform}/{gatewayId}/plugins/{slug}
 * For flat layout: plugins/{slug}
 */
export function getPluginDirPath(
  gatewayId: string | null | undefined,
  pluginSlug: string,
  platform?: string,
): string {
  if (gatewayId) {
    const prefix = platform
      ? `${BOTS_DIR}/${platform}/${gatewayId}`
      : `${BOTS_DIR}/${gatewayId}`;
    return `${prefix}/${PLUGIN_DIR}/${pluginSlug}`;
  }
  return `${PLUGIN_DIR}/${pluginSlug}`;
}

/**
 * Compute the bots directory for a gateway.
 * Returns: bots/{platform}/{gatewayId}/plugins
 */
export function getGatewayPluginsDir(gatewayId: string, platform?: string): string {
  return platform
    ? `${BOTS_DIR}/${platform}/${gatewayId}/${PLUGIN_DIR}`
    : `${BOTS_DIR}/${gatewayId}/${PLUGIN_DIR}`;
}

/**
 * Extract gatewayId from a bot-dir entry path.
 * Supports both old format (bots/{gwId}/plugins/) and new format (bots/{platform}/{gwId}/plugins/).
 * Returns null if the path is in the flat plugins/ layout.
 */
export function extractGatewayIdFromPath(pluginFile: string): string | null {
  // New format: bots/{platform}/{gwId}/plugins/...
  const newMatch = pluginFile.match(/^bots\/[^/]+\/([^/]+)\/plugins\//);
  if (newMatch) return newMatch[1] ?? null;
  // Old format: bots/{gwId}/plugins/...
  const oldMatch = pluginFile.match(/^bots\/([^/]+)\/plugins\//);
  return oldMatch ? oldMatch[1] ?? null : null;
}

/**
 * Extract the platform folder from a bot-dir entry path.
 * Returns null if the path uses old format or flat layout.
 */
export function extractPlatformFromPath(pluginFile: string): string | null {
  const match = pluginFile.match(/^bots\/([^/]+)\/[^/]+\/plugins\//);
  return match ? match[1] ?? null : null;
}

/**
 * Determine if an entryFile path points to a directory-layout plugin.
 *
 * A directory plugin has a subdirectory between the plugins/ segment and the
 * entry filename:
 *   plugins/slug/index.js                         → true  (flat dir)
 *   bots/telegram/{gwId}/plugins/slug/index.js    → true  (bot-dir dir)
 *   plugins/slug.js                               → false (flat single)
 *   bots/telegram/{gwId}/plugins/slug.js          → false (bot-dir single)
 */
export function isDirectoryEntryPath(entryFile: string): boolean {
  // Strip everything up to and including the plugins/ segment (both new + old formats)
  const afterPlugins = entryFile.replace(
    /^(?:bots\/[^/]+\/[^/]+\/|bots\/[^/]+\/)?plugins\//,
    '',
  );
  return afterPlugins.includes('/');
}

/**
 * Try to get an existing bridge client; if none, attempt auto-reconnect
 * using the bridge auth token stored in the DB.
 * This handles the case where the server hasn't established a bridge
 * connection yet (e.g. container restarted, no user opened the workspace dashboard).
 */
async function getOrReconnectClient(containerDbId: string): Promise<BridgeClient | null> {
  const existing = bridgeClientManager.getExistingClient(containerDbId);
  if (existing) return existing;

  // Auto-reconnect: look up bridge credentials from DB
  try {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { bridgePort: true, bridgeAuthToken: true },
    });

    if (!container?.bridgePort || !container?.bridgeAuthToken) {
      return null;
    }

    const authToken = decryptIfEncrypted(container.bridgeAuthToken);

    return await bridgeClientManager.getClient(containerDbId, container.bridgePort, authToken);
  } catch (err) {
    deployLog.debug(
      { containerDbId, error: (err as Error).message },
      'Failed to auto-reconnect bridge for deploy',
    );
    return null;
  }
}

/**
 * Plugin Deployment Service
 */
class PluginDeployService {

  // ===========================================
  // Template Deployment (first-time install only)
  // ===========================================

  /**
   * Write a plugin template to a user's workspace container and start it.
   * Used on first install only — after that, the container filesystem is the source of truth.
   *
   * @param userId - Owner of the workspace
   * @param organizationId - Org scope (null for personal)
   * @param pluginSlug - Plugin slug (used as filename)
   * @param templateCode - Template JS source code from Plugin.codeBundle
   * @param env - Optional environment variables for the plugin process
   * @returns true if written and started, false if no running container
   */
  async writeTemplateToContainer(
    userId: string,
    organizationId: string | null,
    pluginSlug: string,
    templateCode: string,
    env?: Record<string, string>,
    gatewayId?: string | null,
    platform?: string,
  ): Promise<boolean> {
    // Find running container
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) {
      deployLog.debug({ userId, pluginSlug }, 'No running workspace — skipping template deploy');
      return false;
    }

    const client = await getOrReconnectClient(container.id);
    if (!client) {
      deployLog.debug({ userId, pluginSlug }, 'No bridge connection — skipping template deploy');
      return false;
    }

    // Ensure bot directory exists for gateway-bound plugins
    if (gatewayId) {
      await client.fileMkdir(getGatewayPluginsDir(gatewayId, platform)).catch(() => {});
    }

    const written = await this.writePluginFile(client, pluginSlug, templateCode, gatewayId, platform);
    if (!written) return false;

    // Auto-start the plugin process using bot-dir path
    const entryPath = getPluginEntryPath(gatewayId, pluginSlug, { platform });
    return this.startPluginByFile(client, entryPath, env);
  }

  /**
   * Write a directory (multi-file) plugin template to a workspace container and start it.
   * Creates the plugin directory, writes all files via a single writeMulti call,
   * generates plugin.json, and starts the plugin.
   *
   * @param userId - Owner of the workspace
   * @param organizationId - Org scope (null for personal)
   * @param pluginSlug - Plugin slug (used as directory name)
   * @param files - Map of relative paths to file contents (within the plugin directory)
   * @param manifestJson - Contents of plugin.json (pre-stringified)
   * @param entry - Entry file relative to plugin dir (default: "index.js")
   * @param env - Optional environment variables for the plugin process
   * @returns true if deployed and started, false if no running container
   */
  async writeDirectoryToContainer(
    userId: string,
    organizationId: string | null,
    pluginSlug: string,
    files: Record<string, string>,
    manifestJson: string,
    entry = 'index.js',
    env?: Record<string, string>,
    gatewayId?: string | null,
    platform?: string,
  ): Promise<boolean> {
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) {
      deployLog.debug({ userId, pluginSlug }, 'No running workspace — skipping directory deploy');
      return false;
    }

    const client = await getOrReconnectClient(container.id);
    if (!client) {
      deployLog.debug({ userId, pluginSlug, containerId: container.id }, 'No bridge connection — skipping directory deploy');
      return false;
    }

    // Gateway-bound plugins go under bots/{platform}/{gwId}/plugins/{slug}/
    const pluginDir = getPluginDirPath(gatewayId, pluginSlug, platform);

    // Build the full file list: plugin.json + all user files
    const allFiles = [
      { path: `${pluginDir}/plugin.json`, content: manifestJson },
      ...Object.entries(files).map(([relativePath, content]) => ({
        path: `${pluginDir}/${relativePath}`,
        content,
      })),
    ];

    try {
      await client.fileWriteMulti(allFiles);
      deployLog.info({ pluginSlug, pluginDir, fileCount: allFiles.length }, 'Directory plugin files written');
    } catch (err) {
      deployLog.error(
        { pluginSlug, error: (err as Error).message },
        'Failed to write directory plugin to workspace',
      );
      return false;
    }

    // Start the plugin
    const entryFile = `${pluginDir}/${entry}`;
    return this.startPluginByFile(client, entryFile, env);
  }

  /**
   * Write code directly to a plugin file in a user's workspace container.
   * Used when updating plugin code (from editor / API).
   * Does NOT start the plugin — caller should restart if needed.
   *
   * @param userId - Owner of the workspace
   * @param organizationId - Org scope (null for personal)
   * @param pluginSlug - Plugin slug
   * @param code - Updated JS source code
   * @param restartAfterWrite - Whether to restart the plugin process after writing
   * @returns true if written successfully
   */
  async writeCodeToContainer(
    userId: string,
    organizationId: string | null,
    pluginSlug: string,
    code: string,
    restartAfterWrite = true,
    entryFile?: string,
  ): Promise<boolean> {
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) {
      deployLog.debug({ userId, pluginSlug }, 'No running workspace — skipping code write');
      return false;
    }

    const client = await getOrReconnectClient(container.id);
    if (!client) {
      deployLog.debug({ userId, pluginSlug }, 'No bridge connection — skipping code write');
      return false;
    }

    const gwId = entryFile ? extractGatewayIdFromPath(entryFile) : null;
    // Also extract platform so writePluginFile builds the correct new-format path
    // (bots/{platform}/{gwId}/plugins/{slug}.js) instead of the old format.
    const plat = entryFile ? extractPlatformFromPath(entryFile) : null;

    // When the caller provides an entryFile (the exact path stored in DB), write
    // directly to it so both single-file (slug.js) AND directory entry paths
    // (slug/index.js, slug/main.js, etc.) are preserved without recomputation.
    // writePluginFile always calls getPluginEntryPath which produces a single-file
    // path — using it for directory plugins would write to the wrong location.
    let written: boolean;
    if (entryFile) {
      validatePluginCode(code, pluginSlug);
      try {
        await client.fileWrite(entryFile, code, true);
        deployLog.info({ pluginSlug, filePath: entryFile }, 'Plugin file written to workspace');
        written = true;
      } catch (err) {
        deployLog.error({ pluginSlug, error: (err as Error).message }, 'Failed to write plugin file to workspace');
        written = false;
      }
    } else {
      written = await this.writePluginFile(client, pluginSlug, code, gwId, plat ?? undefined);
    }
    if (!written) return false;

    if (restartAfterWrite) {
      // Restart the plugin so it picks up the new code
      const filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;
      try {
        // Rebuild env so PLUGIN_GATEWAY_ID (and user context) survive the restart.
        // gwId was extracted from entryFile above; fall back to a fresh DB lookup if needed.
        const restartEnv: Record<string, string> = { PLUGIN_USER_ID: userId };
        if (organizationId) restartEnv.PLUGIN_ORG_ID = organizationId;
        const restartGwId = gwId ?? extractGatewayIdFromPath(filePath);
        if (restartGwId) restartEnv.PLUGIN_GATEWAY_ID = restartGwId;
        await client.pluginStop(filePath).catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        await client.pluginStart(filePath, restartEnv);
        deployLog.info({ pluginSlug, filePath }, 'Plugin restarted after code update');
      } catch (err) {
        deployLog.warn({ pluginSlug, filePath, error: (err as Error).message }, 'Plugin restart after code write failed');
      }
    }

    return true;
  }

  /**
   * Read plugin code from a user's workspace container filesystem.
   * This is the source of truth for plugin code.
   *
   * @param userId - Owner of the workspace
   * @param organizationId - Org scope (null for personal)
   * @param entryFile - Entry file path (e.g. "plugins/my-bot.js")
   * @returns Plugin source code, or null if container/file not available
   */
  async readCodeFromContainer(
    userId: string,
    organizationId: string | null,
    entryFile: string,
  ): Promise<string | null> {
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) return null;

    const client = await getOrReconnectClient(container.id);
    if (!client) return null;

    try {
      const result = await client.fileRead(entryFile);
      return (result as { content?: string })?.content ?? null;
    } catch {
      return null;
    }
  }

  // ===========================================
  // Workspace Boot — Start All Plugins
  // ===========================================

  /**
   * Start ALL enabled plugins for a user inside their workspace container.
   * Called on workspace start/create. Does NOT write code — files must already exist
   * on the container filesystem (persisted via Docker volumes).
   *
   * If a plugin file is missing, attempts to recover from the catalog template.
   * Broken plugins (missing file, no template) are reported for health tracking.
   *
   * Supports both single-file plugins (plugins/slug.js) and directory plugins
   * (plugins/my-bot/index.js) via the UserPlugin.entryFile field.
   *
   * @param userId - Owner of the workspace
   * @param organizationId - Org scope (null for personal)
   * @param containerDbId - Database ID of the workspace container
   */
  async startAllForUser(
    userId: string,
    organizationId: string | null,
    containerDbId: string,
  ): Promise<{ started: number; failed: number; recovered: number; broken: string[] }> {
    const client = await getOrReconnectClient(containerDbId);
    if (!client) {
      deployLog.warn({ containerDbId }, 'No bridge connection — cannot start plugins');
      return { started: 0, failed: 0, recovered: 0, broken: [] };
    }

    // Get all enabled plugins for this user/org
    const userPlugins = await prisma.userPlugin.findMany({
      where: {
        userId,
        organizationId: organizationId ?? null,
        isEnabled: true,
      },
      include: {
        plugin: {
          select: {
            slug: true,
            codeBundle: true,
            bundlePath: true,
            requiredGateways: true,
            authorType: true,
          },
        },
        gateway: {
          select: { id: true, status: true, type: true, credentialsEnc: true },
        },
      },
    });

    if (userPlugins.length === 0) {
      deployLog.debug({ userId }, 'No enabled plugins to start');
      return { started: 0, failed: 0, recovered: 0, broken: [] };
    }

    // Ensure plugins directory exists
    await client.fileMkdir(PLUGIN_DIR).catch(() => {});

    // Collect unique gateways to pre-create bot directories (with platform prefix)
    const gatewayMap = new Map<string, string>(); // gwId → platform
    for (const up of userPlugins) {
      if (up.gatewayId && up.gateway) {
        gatewayMap.set(up.gatewayId, gatewayTypeToPlatform(up.gateway.type));
      }
    }
    for (const [gwId, platform] of gatewayMap) {
      await client.fileMkdir(getGatewayPluginsDir(gwId, platform)).catch(() => {});
    }

    let started = 0;
    let failed = 0;
    let recovered = 0;
    const broken: string[] = [];

    for (const up of userPlugins) {
      // Determine layout: marketplace bundle is authoritative for BUILTIN/MARKETPLACE plugins.
      // For USER plugins without a marketplace bundle, fall back to inspecting the stored
      // entryFile path — if it has a subdirectory component after /plugins/ (e.g. slug/index.js)
      // it is a directory plugin. Using only isDirectoryLayout() would always return false for
      // USER plugins and cause the migration logic to misplace the directory entry file.
      const bundle = marketplaceLoader.getBundleCode(up.plugin.slug);
      const isDirectory = isDirectoryLayout(up.plugin.slug) || isDirectoryEntryPath(up.entryFile ?? '');
      const platform = up.gateway ? gatewayTypeToPlatform(up.gateway.type) : undefined;

      // Derive the entry filename from the stored path when available so that plugins
      // with a non-default entry (e.g. main.js) are handled correctly during migration.
      const entryFileName = isDirectory
        ? (up.entryFile ? up.entryFile.split('/').pop() ?? 'index.js' : bundle?.entryFile ?? 'index.js')
        : undefined;

      // Compute expected path
      const expectedPath = getPluginEntryPath(up.gatewayId, up.plugin.slug, {
        platform,
        isDirectory,
        entry: entryFileName,
      });
      let entryFile = up.entryFile ?? `${PLUGIN_DIR}/${up.plugin.slug}.js`;

      // Auto-migrate: old paths → new platform-prefixed paths
      if (entryFile !== expectedPath) {
        try {
          await client.send('file.stat', { path: entryFile });
          // File exists at old path — move it
          if (up.gatewayId) {
            await client.fileMkdir(getGatewayPluginsDir(up.gatewayId, platform)).catch(() => {});
          }
          // For directory plugins, we may need to rename the whole directory
          const isOldDirPlugin = entryFile.includes('/index.js') || entryFile.includes('/index.ts');
          if (isOldDirPlugin || isDirectory) {
            // Get old directory path and new directory path
            const oldDir = entryFile.replace(/\/[^/]+$/, '');
            const newDir = expectedPath.replace(/\/[^/]+$/, '');
            if (oldDir !== newDir) {
              await client.send('file.rename', { oldPath: oldDir, newPath: newDir }).catch(() => {});
            }
          } else {
            await client.send('file.rename', { oldPath: entryFile, newPath: expectedPath }).catch(() => {});
          }
          deployLog.info(
            { pluginSlug: up.plugin.slug, from: entryFile, to: expectedPath },
            'Auto-migrated plugin path (platform prefix)',
          );
        } catch {
          // Old file doesn't exist or move failed — just use the new path
        }
        // Update DB to new path (user_plugins + any matching workflow_steps)
        await prisma.userPlugin.update({
          where: { id: up.id },
          data: { entryFile: expectedPath },
        });
        await prisma.workflowStep.updateMany({
          where: {
            pluginId: up.pluginId,
            gatewayId: up.gatewayId,
            workflow: { userId, organizationId: organizationId ?? null },
            entryFile: up.entryFile, // Only update if still matching old value
          },
          data: { entryFile: expectedPath },
        });
        entryFile = expectedPath;
      }

      // Pre-flight: verify gateway requirements
      const reqGateways = (up.plugin.requiredGateways ?? []) as string[];
      if (reqGateways.length > 0 && !up.gatewayId) {
        deployLog.warn(
          { pluginSlug: up.plugin.slug, requiredGateways: reqGateways },
          'Plugin requires a gateway but none is bound — skipping start',
        );
        failed++;
        broken.push(up.plugin.slug);
        continue;
      }

      if (up.gateway && up.gateway.status !== 'CONNECTED') {
        deployLog.warn(
          { pluginSlug: up.plugin.slug, gatewayStatus: up.gateway.status },
          'Bound gateway is not CONNECTED — plugin may not function correctly',
        );
      }

      // Check if the plugin file exists on disk
      let fileExists = false;
      try {
        await client.send('file.stat', { path: entryFile });
        fileExists = true;
      } catch {
        // File missing — try to recover from marketplace bundle first, then codeBundle
        const bundle = marketplaceLoader.getBundleCode(up.plugin.slug);

        if (bundle?.layout === "directory" && bundle.files) {
          // Directory plugin recovery — write all files
          const pluginDir = getPluginDirPath(up.gatewayId, up.plugin.slug, platform);
          const manifestJson = JSON.stringify({
            slug: up.plugin.slug,
            entryFile: bundle.entryFile || "index.js",
            layout: "directory",
          });
          const allFiles = [
            { path: `${pluginDir}/plugin.json`, content: manifestJson },
            ...Object.entries(bundle.files).map(([relPath, content]) => ({
              path: `${pluginDir}/${relPath}`,
              content,
            })),
          ];
          try {
            await client.fileWriteMulti(allFiles);
            fileExists = true;
            recovered++;
            deployLog.info({ pluginSlug: up.plugin.slug, fileCount: allFiles.length }, 'Directory plugin recovered from bundle');
          } catch (writeErr) {
            deployLog.warn({ pluginSlug: up.plugin.slug, error: (writeErr as Error).message }, 'Directory plugin recovery failed');
          }
        } else {
          // Single-file recovery
          let templateCode: string | null = null;
          if (bundle?.code) {
            templateCode = bundle.code;
          } else if (up.plugin.codeBundle) {
            templateCode = up.plugin.codeBundle;
          }

          if (templateCode) {
            const recovered_ = await this.writePluginFile(client, up.plugin.slug, templateCode, up.gatewayId, platform);
            if (recovered_) {
              fileExists = true;
              recovered++;
              deployLog.info({ pluginSlug: up.plugin.slug }, 'Plugin file recovered from template');
            }
          }
        }

        if (!fileExists) {
          // Determine author type — need to include it in the query above
          const isCustomPlugin = up.plugin.authorType === 'USER';

          if (isCustomPlugin) {
            // Custom (AI / user-created) plugin: no recovery possible — delete ghost DB records
            // so they don't appear in Studio as "installed" when the code is gone.
            deployLog.warn(
              { pluginSlug: up.plugin.slug, entryFile },
              'Custom plugin file missing with no recovery — deleting ghost DB record',
            );
            try {
              await prisma.$transaction(async (tx) => {
                await tx.userPlugin.delete({ where: { id: up.id } });
                // Delete catalog entry only if this was the sole installation
                const remaining = await tx.userPlugin.count({ where: { pluginId: up.pluginId } });
                if (remaining === 0) {
                  await tx.plugin.delete({ where: { id: up.pluginId } });
                }
              });
            } catch (delErr) {
              deployLog.warn({ pluginSlug: up.plugin.slug, error: (delErr as Error).message }, 'Failed to delete ghost custom plugin record');
            }
          } else {
            // Marketplace / builtin plugin: flag as needing reinstall so UI can show the user
            deployLog.warn(
              { pluginSlug: up.plugin.slug, entryFile },
              'Marketplace plugin file missing and no template available — flagging needsRestore',
            );
            try {
              await prisma.userPlugin.update({ where: { id: up.id }, data: { needsRestore: true } });
            } catch { /* non-critical */ }
            failed++;
            broken.push(up.plugin.slug);
          }
          continue;
        }
      }

      // Build env with user context and gateway binding
      const env: Record<string, string> = {
        PLUGIN_USER_ID: userId,
      };
      if (organizationId) env.PLUGIN_ORG_ID = organizationId;
      if (up.gatewayId) env.PLUGIN_GATEWAY_ID = up.gatewayId;
 // inject decrypted credentials so the bridge agent can call the
      // bot API directly without an IPC/REST roundtrip on every credential fetch.
      if (up.gatewayId && up.gateway?.credentialsEnc) {
        try {
          const creds = decryptJson<Record<string, unknown>>(up.gateway.credentialsEnc);
          env[`GATEWAY_CREDS_${up.gatewayId}`] = Buffer.from(JSON.stringify(creds)).toString('base64');
        } catch {
          // Non-critical — container falls back to IPC/REST credential fetch
        }
      }

      const ok = await this.startPluginByFile(client, entryFile, env, up.storageQuotaMb);
      if (ok) {
        started++;
      } else {
        failed++;
        broken.push(up.plugin.slug);
        deployLog.warn({ pluginSlug: up.plugin.slug, entryFile }, 'Plugin file present but process failed to start');
      }
    }

    deployLog.info(
      { userId, containerDbId, started, failed, recovered, broken, total: userPlugins.length },
      'Plugin startup sync complete',
    );

    return { started, failed, recovered, broken };
  }

  // ===========================================
  // Runtime Plugin Management
  // ===========================================

  /**
   * Remove a plugin file from a user's running workspace container.
   *
   * @param userId - Owner of the workspace
   * @param organizationId - Org scope (null for personal)
   * @param pluginSlug - Plugin slug (filename to remove)
   * @returns true if removed, false if no running container
   */
  async undeployFromWorkspace(
    userId: string,
    organizationId: string | null,
    pluginSlug: string,
    entryFile?: string,
  ): Promise<boolean> {
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) return false;

    const client = await getOrReconnectClient(container.id);
    if (!client) return false;

    const filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;

    // Determine if this is a directory plugin (entryFile ends with /index.js or similar)
    const isDirectoryPlugin = /\/[^/]+\/[^/]+\.(js|ts|mjs|cjs)$/.test(filePath)
      && filePath.includes(`/${pluginSlug}/`);

    // Build list of paths to try: primary path first, then alternate old/new format
    const pathsToTry = [filePath];
    // If entryFile uses old format (bots/{gwId}/plugins/...), also try new format
    const oldFmtMatch = filePath.match(/^bots\/([^/]+)\/plugins\//);
    if (oldFmtMatch && !filePath.match(/^bots\/(telegram|discord|slack|whatsapp)\//)) {
      // Old format detected — compute potential new-format path
      const gwId = oldFmtMatch[1];
      const gw = await prisma.gateway.findUnique({ where: { id: gwId }, select: { type: true } });
      if (gw) {
        const platform = gatewayTypeToPlatform(gw.type);
        const newPath = filePath.replace(`bots/${gwId}/plugins/`, `bots/${platform}/${gwId}/plugins/`);
        pathsToTry.push(newPath);
      }
    }
    // If entryFile uses new format, also try old format
    const newFmtMatch = filePath.match(/^bots\/(telegram|discord|slack|whatsapp)\/([^/]+)\/plugins\//);
    if (newFmtMatch) {
      const gwId = newFmtMatch[2];
      const oldPath = filePath.replace(`bots/${newFmtMatch[1]}/${gwId}/plugins/`, `bots/${gwId}/plugins/`);
      pathsToTry.push(oldPath);
    }

    let deleted = false;
    for (const tryPath of pathsToTry) {
      try {
        // Stop the plugin if it's running
        await client.pluginStop(tryPath).catch(() => {});
        unregisterActivePlugin(container.id, tryPath);

        // Clear container-local SQLite storage for this plugin (non-blocking)
        await client.send('storage.clearPlugin', { pluginFile: tryPath }).catch(() => {});

        // Delete per-plugin database file (non-blocking)
        await client.send('storage.deletePluginDb', { pluginFile: tryPath }).catch(() => {});

        // For directory plugins, delete the whole directory (not just the entry file)
        const dirPath = isDirectoryPlugin ? tryPath.replace(/\/[^/]+$/, '') : null;
        if (dirPath) {
          await client.fileDelete(dirPath);
        } else {
          await client.fileDelete(tryPath);
        }

        deployLog.info({ pluginSlug, filePath: tryPath, dirPath }, 'Plugin undeployed from workspace');
        deleted = true;
        break;
      } catch {
        // Try next path
        continue;
      }
    }

    // Also try to clean up the old-format empty gateway directory if it exists
    if (oldFmtMatch) {
      const oldGwDir = `bots/${oldFmtMatch[1]}`;
      try {
        const listing = await client.fileList(oldGwDir, false) as unknown[];
        if (Array.isArray(listing) && listing.length === 0) {
          await client.fileDelete(oldGwDir);
          deployLog.info({ oldGwDir }, 'Cleaned up empty old-format gateway directory');
        }
      } catch {
        // Ignore — directory may not exist
      }
    }

    if (!deleted) {
      deployLog.warn(
        { pluginSlug, filePath, pathsToTry },
        'Failed to undeploy plugin (file may not exist at any known path)',
      );
    }

    return deleted;
  }

  /**
   * Ensure a plugin file exists in the container.
   * If missing, recovers from the catalog template (Plugin.codeBundle).
   * Used by the executor before starting a plugin process.
   *
   * Supports both single-file and directory plugins via the optional entryFile parameter.
   *
   * @param containerDbId - Database ID of the workspace container
   * @param pluginSlug - Plugin slug (used for DB lookup and fallback path)
   * @param userId - User who owns the plugin installation
   * @param organizationId - Org scope
   * @param entryFile - Optional explicit entry file path (overrides slug-based path)
   * @returns true if plugin file is ready
   */
  async ensureFileExists(
    containerDbId: string,
    pluginSlug: string,
    userId: string,
    organizationId: string | null | undefined,
    entryFile?: string,
  ): Promise<boolean> {
    const client = await getOrReconnectClient(containerDbId);
    if (!client) return false;

    let filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;

    // Check if file already exists
    try {
      await client.send('file.stat', { path: filePath });
      return true;
    } catch {
      // File doesn't exist — check if it's a mis-registered flat path that is actually
      // a directory plugin (e.g. DB says "...plugins/slug.js" but real files live at "...plugins/slug/index.js")
      if (filePath.endsWith('.js') && !isDirectoryEntryPath(filePath)) {
        const dirVariant = filePath.replace(/\.js$/, '/index.js');
        try {
          await client.send('file.stat', { path: dirVariant });
          // Directory variant exists — self-heal the DB record and use the correct path
          deployLog.warn(
            { pluginSlug, wrongPath: filePath, correctPath: dirVariant },
            'entryFile points to flat .js but plugin is actually a directory layout — healing DB record',
          );
          await prisma.userPlugin.updateMany({
            where: { userId, organizationId: organizationId ?? null, plugin: { slug: pluginSlug } },
            data: { entryFile: dirVariant },
          });
          await prisma.workflowStep.updateMany({
            where: {
              entryFile: filePath,
              workflow: { userId, organizationId: organizationId ?? null },
            },
            data: { entryFile: dirVariant },
          });
          filePath = dirVariant;
          return true;
        } catch {
          // Directory variant also doesn't exist — fall through to recovery
        }
      }
    }

    // Look up the catalog template
    const userPlugin = await prisma.userPlugin.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        isEnabled: true,
        plugin: { slug: pluginSlug },
      },
      include: {
        plugin: {
          select: { slug: true, codeBundle: true, bundlePath: true },
        },
      },
    });

    if (!userPlugin) {
      deployLog.warn({ pluginSlug, userId }, 'UserPlugin not found for file recovery');
      return false;
    }

    // Try marketplace filesystem bundle first, then DB codeBundle
    const bundle = marketplaceLoader.getBundleCode(userPlugin.plugin.slug);

    // --- Directory plugin recovery ---
    if (bundle?.layout === "directory" && bundle.files) {
      deployLog.info({ pluginSlug }, 'Recovering directory plugin files from marketplace bundle');
      const gwId = extractGatewayIdFromPath(filePath);
      const plat = extractPlatformFromPath(filePath);
      const manifestJson = JSON.stringify({
        slug: userPlugin.plugin.slug,
        name: pluginSlug,
        entryFile: bundle.entryFile || "index.js",
        layout: "directory",
      });
      return this.writeDirectoryToContainer(
        userId,
        organizationId ?? null,
        pluginSlug,
        bundle.files,
        manifestJson,
        bundle.entryFile || "index.js",
        undefined,
        gwId,
        plat ?? undefined,
      );
    }

    // --- Single-file recovery ---
    let templateCode: string | null = null;
    if (bundle?.code) {
      templateCode = bundle.code;
    } else if (userPlugin.plugin.codeBundle) {
      templateCode = userPlugin.plugin.codeBundle;
    }

    if (!templateCode) {
      deployLog.warn({ pluginSlug }, 'No template available for file recovery (neither bundle nor codeBundle)');
      return false;
    }

    deployLog.info({ pluginSlug }, 'Recovering plugin file from catalog template');
    const gwId = extractGatewayIdFromPath(filePath);
    const plat = extractPlatformFromPath(filePath);
    return this.writePluginFile(client, pluginSlug, templateCode, gwId, plat ?? undefined);
  }

  /**
   * Ensure a plugin process is running inside a container.
   * Checks the process list and starts the plugin if not already running.
   * Used by the event-driven executor to ensure the daemon is alive before pushing events.
   *
   * Supports both single-file (plugins/slug.js) and directory (plugins/my-bot/index.js) plugins
   * via the optional entryFile parameter.
   *
   * @param containerDbId - Database ID of the workspace container
   * @param pluginSlug - Plugin slug (used as fallback path: plugins/{slug}.js)
   * @param env - Environment variables for the plugin process
   * @param entryFile - Optional explicit entry file path (overrides slug-based path)
   */
  async ensureRunning(
    containerDbId: string,
    pluginSlug: string,
    env: Record<string, string> = {},
    entryFile?: string,
  ): Promise<void> {
    const client = await getOrReconnectClient(containerDbId);
    if (!client) return;

    let filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;

    // If a flat .js path was stored but the real files are in a directory layout,
    // resolve to the correct variant so we don't start from a nonexistent path.
    if (filePath.endsWith('.js') && !isDirectoryEntryPath(filePath)) {
      const dirVariant = filePath.replace(/\.js$/, '/index.js');
      try {
        await client.send('file.stat', { path: dirVariant });
        filePath = dirVariant;
      } catch {
        // flat path is correct (or will fail later) — keep as-is
      }
    }

    try {
      const list = await client.pluginList() as Array<{ file: string; status: string }>;
      const running = list.find(
        (p) => p.file === filePath && p.status === 'running',
      );

      if (running) return; // Already running
    } catch {
      // pluginList failed — try starting anyway
    }

    // Start the plugin
    await this.startPluginByFile(client, filePath, env);
  }

  /**
   * Stop a plugin process in the container.
   * Supports both slug-based path (fallback) and explicit entryFile.
   *
   * @param entryFile - Optional explicit entry file path (overrides slug-based path)
   */
  async stopPluginInWorkspace(
    userId: string,
    organizationId: string | null,
    pluginSlug: string,
    entryFile?: string,
  ): Promise<boolean> {
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) return false;

    const client = await getOrReconnectClient(container.id);
    if (!client) return false;

    const filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;

    try {
      await client.pluginStop(filePath);
      unregisterActivePlugin(container.id, filePath);
      deployLog.info({ pluginSlug, filePath }, 'Plugin process stopped');
      return true;
    } catch (err) {
      deployLog.warn(
        { pluginSlug, filePath, error: (err as Error).message },
        'Failed to stop plugin process (may not be running)',
      );
      return false;
    }
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  /**
   * Write plugin code to the container filesystem.
   * If gatewayId is provided, writes to the bot-dir layout.
   */
  private async writePluginFile(
    client: BridgeClient,
    pluginSlug: string,
    code: string,
    gatewayId?: string | null,
    platform?: string,
  ): Promise<boolean> {
    // Validate code before writing to container
    validatePluginCode(code, pluginSlug);

    const filePath = getPluginEntryPath(gatewayId ?? null, pluginSlug, { platform });

    try {
      await client.fileWrite(filePath, code, true);
      deployLog.info({ pluginSlug, filePath }, 'Plugin file written to workspace');
      return true;
    } catch (err) {
      deployLog.error(
        { pluginSlug, error: (err as Error).message },
        'Failed to write plugin file to workspace',
      );
      return false;
    }
  }

  /**
   * Start a plugin process using slug-based path (plugins/{slug}.js).
   * Used by writeTemplateToContainer for single-file template plugins.
   */
  private async startPlugin(
    client: BridgeClient,
    pluginSlug: string,
    env?: Record<string, string>,
    storageQuotaMb?: number,
  ): Promise<boolean> {
    const filePath = `${PLUGIN_DIR}/${pluginSlug}.js`;
    return this.startPluginByFile(client, filePath, env, storageQuotaMb);
  }

  /**
   * Start a plugin process using an explicit entry file path.
   * This is the core start method — supports both single-file and directory plugins.
   * Calls plugin.start on the bridge agent which forks the plugin as a child process.
   */
  private async startPluginByFile(
    client: BridgeClient,
    filePath: string,
    env?: Record<string, string>,
    storageQuotaMb?: number,
  ): Promise<boolean> {
    try {
      await client.pluginStart(filePath, env, storageQuotaMb);
      registerActivePlugin(client.containerDbId, filePath);
      deployLog.info({ filePath }, 'Plugin process started');
      return true;
    } catch (err) {
      // Plugin may already be running — that's OK
      const msg = (err as Error).message ?? '';
      if (msg.includes('already running')) {
        registerActivePlugin(client.containerDbId, filePath);
        deployLog.debug({ filePath }, 'Plugin already running — skipping start');
        return true;
      }
      deployLog.error(
        { filePath, error: msg },
        'Failed to start plugin process',
      );
      return false;
    }
  }
}

/** Singleton instance */
export const pluginDeployService = new PluginDeployService();
