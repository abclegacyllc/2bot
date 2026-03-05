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

import { decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { bridgeClientManager } from '@/modules/workspace';
import type { BridgeClient } from '@/modules/workspace/bridge-client.service';

const deployLog = logger.child({ module: 'plugin-deploy' });

/** Directory inside workspace container where plugins are stored */
const PLUGIN_DIR = 'plugins';

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

    const authToken = container.bridgeAuthToken.startsWith('v1:')
      ? decrypt(container.bridgeAuthToken)
      : container.bridgeAuthToken;

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

    const written = await this.writePluginFile(client, pluginSlug, templateCode);
    if (!written) return false;

    // Auto-start the plugin process
    return this.startPlugin(client, pluginSlug, env);
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

    const pluginDir = `${PLUGIN_DIR}/${pluginSlug}`;

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

    const written = await this.writePluginFile(client, pluginSlug, code);
    if (!written) return false;

    if (restartAfterWrite) {
      // Restart the plugin so it picks up the new code
      const filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;
      try {
        await client.pluginStop(filePath).catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        await client.pluginStart(filePath);
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
            requiredGateways: true,
          },
        },
        gateway: {
          select: { id: true, status: true },
        },
      },
    });

    if (userPlugins.length === 0) {
      deployLog.debug({ userId }, 'No enabled plugins to start');
      return { started: 0, failed: 0, recovered: 0, broken: [] };
    }

    // Ensure plugins directory exists
    await client.fileMkdir(PLUGIN_DIR).catch(() => {});

    let started = 0;
    let failed = 0;
    let recovered = 0;
    const broken: string[] = [];

    for (const up of userPlugins) {
      const entryFile = up.entryFile ?? `${PLUGIN_DIR}/${up.plugin.slug}.js`;

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
        // File missing — try to recover from catalog template
        const templateCode = up.plugin.codeBundle;
        if (templateCode) {
          const recovered_ = await this.writePluginFile(client, up.plugin.slug, templateCode);
          if (recovered_) {
            fileExists = true;
            recovered++;
            deployLog.info({ pluginSlug: up.plugin.slug }, 'Plugin file recovered from catalog template');
          }
        }

        if (!fileExists) {
          deployLog.warn(
            { pluginSlug: up.plugin.slug, entryFile },
            'Plugin file missing and no template available — marking as broken',
          );
          failed++;
          broken.push(up.plugin.slug);
          continue;
        }
      }

      // Build env with user context and gateway binding
      const env: Record<string, string> = {
        PLUGIN_USER_ID: userId,
      };
      if (organizationId) env.PLUGIN_ORG_ID = organizationId;
      if (up.gatewayId) env.PLUGIN_GATEWAY_ID = up.gatewayId;

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

    try {
      // Stop the plugin if it's running, then delete the file
      await client.pluginStop(filePath).catch(() => {
        // Ignore — plugin might not be running
      });

      // Clear container-local SQLite storage for this plugin (non-blocking)
      await client.send('storage.clearPlugin', { pluginFile: filePath }).catch(() => {
        // Ignore — storage may already be empty
      });

      await client.fileDelete(filePath);
      deployLog.info({ pluginSlug, filePath }, 'Plugin undeployed from workspace');
      return true;
    } catch (err) {
      deployLog.warn(
        { pluginSlug, filePath, error: (err as Error).message },
        'Failed to undeploy plugin (file may not exist)',
      );
      return false;
    }
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

    const filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;

    // Check if file already exists
    try {
      await client.send('file.stat', { path: filePath });
      return true;
    } catch {
      // File doesn't exist — recover from catalog template
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
          select: { slug: true, codeBundle: true },
        },
      },
    });

    if (!userPlugin) {
      deployLog.warn({ pluginSlug, userId }, 'UserPlugin not found for file recovery');
      return false;
    }

    const templateCode = userPlugin.plugin.codeBundle;
    if (!templateCode) {
      deployLog.warn({ pluginSlug }, 'No codeBundle template available for file recovery');
      return false;
    }

    deployLog.info({ pluginSlug }, 'Recovering plugin file from catalog template');
    return this.writePluginFile(client, pluginSlug, templateCode);
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

    const filePath = entryFile ?? `${PLUGIN_DIR}/${pluginSlug}.js`;

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
   */
  private async writePluginFile(
    client: BridgeClient,
    pluginSlug: string,
    code: string,
  ): Promise<boolean> {
    const filePath = `${PLUGIN_DIR}/${pluginSlug}.js`;

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
      deployLog.info({ filePath }, 'Plugin process started');
      return true;
    } catch (err) {
      // Plugin may already be running — that's OK
      const msg = (err as Error).message ?? '';
      if (msg.includes('already running')) {
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
