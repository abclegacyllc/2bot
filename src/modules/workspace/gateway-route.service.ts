/**
 * Gateway Route Service
 *
 * Manages the nginx map file that routes inbound webhooks directly to
 * workspace containers. When a container starts, its gateways are added
 * to the map. When a container stops/destroys, routes are removed.
 *
 * The map file is `/etc/nginx/conf.d/gateway-routes.map` and is included
 * by the `map $gateway_id $webhook_backend` directive in 2bot.conf.
 * After each update, nginx is hot-reloaded via `nginx -s reload`.
 *
 * @module modules/workspace/gateway-route.service
 */

import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const execFileAsync = promisify(execFile);
const log = logger.child({ module: 'workspace:gateway-route' });

// ===========================================
// Configuration
// ===========================================

/**
 * Path to the nginx map file.
 * Defaults to the repo-local copy (`nginx/gateway-routes.map`).
 * Nginx reads it via a symlink created by `make setup-nginx`.
 * Override with GATEWAY_ROUTES_MAP_PATH env var if needed.
 */
const MAP_FILE_PATH = process.env.GATEWAY_ROUTES_MAP_PATH
  || path.join(process.cwd(), 'nginx', 'gateway-routes.map');

/** Port the bridge agent HTTP server listens on inside the container */
const BRIDGE_HTTP_PORT = 9000;

/** Header written to the map file */
const MAP_HEADER = [
  '# Gateway → Container Webhook Routes',
  '# Managed by gateway-route.service.ts — DO NOT EDIT MANUALLY',
  '#',
  '# Format: "<gateway-id>" "<container-ip>:<port>";',
  '',
].join('\n');

// ===========================================
// Service
// ===========================================

class GatewayRouteService {
  /**
   * In-memory cache of gateway → container IP mappings.
   * Serves as the source of truth for the map file contents.
   */
  private routes = new Map<string, string>(); // gatewayId → "ip:port"

  /**
   * Add routes for all gateways belonging to a container's owner.
   * Called when a container transitions to RUNNING.
   */
  async activateRoutes(containerDbId: string): Promise<void> {
    try {
      const container = await prisma.workspaceContainer.findUnique({
        where: { id: containerDbId },
        select: {
          ipAddress: true,
          userId: true,
          organizationId: true,
          status: true,
        },
      });

      if (!container?.ipAddress) {
        log.warn({ containerDbId }, 'Cannot activate routes — no IP address');
        return;
      }

      if (container.status !== 'RUNNING') {
        log.warn({ containerDbId, status: container.status }, 'Cannot activate routes — container not running');
        return;
      }

      // Find all gateways owned by this user (scoped to org if applicable)
      // Only route "plugin" mode gateways directly to the container.
      // "workflow" mode gateways must go through the API server's workflow
      // trigger system, so they must NOT have a direct container route.
      const gateways = await prisma.gateway.findMany({
        where: {
          userId: container.userId,
          organizationId: container.organizationId ?? null,
          status: 'CONNECTED',
          mode: { not: 'workflow' },
        },
        select: { id: true },
      });

      if (gateways.length === 0) {
        // No connected gateways — remove any stale routes for this container
        const backend = `${container.ipAddress}:${BRIDGE_HTTP_PORT}`;
        let removed = 0;
        for (const [gwId, b] of this.routes) {
          if (b === backend) {
            this.routes.delete(gwId);
            removed++;
          }
        }
        if (removed > 0) {
          await this.writeMapFile();
          await this.reloadNginx();
          log.info({ containerDbId, removed }, 'Stale webhook routes removed (no connected gateways)');
        } else {
          log.debug({ containerDbId }, 'No connected gateways — skipping route activation');
        }
        return;
      }

      const backend = `${container.ipAddress}:${BRIDGE_HTTP_PORT}`;

      // Remove stale routes for this container before adding current ones
      for (const [gwId, b] of this.routes) {
        if (b === backend) {
          this.routes.delete(gwId);
        }
      }

      // Add routes for all currently-connected gateways
      for (const gw of gateways) {
        this.routes.set(gw.id, backend);
      }

      await this.writeMapFile();
      await this.reloadNginx();

      // Mark container as webhook-routing-active
      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { webhookRoutingActive: true },
      });

      log.info(
        { containerDbId, gatewayCount: gateways.length, backend },
        'Webhook routes activated',
      );
    } catch (err) {
      log.error(
        { containerDbId, error: (err as Error).message },
        'Failed to activate webhook routes',
      );
    }
  }

  /**
   * Remove all routes that point to a given container.
   * Called when a container transitions to STOPPED or DESTROYED.
   */
  async deactivateRoutes(containerDbId: string): Promise<void> {
    try {
      const container = await prisma.workspaceContainer.findUnique({
        where: { id: containerDbId },
        select: { ipAddress: true, webhookRoutingActive: true },
      });

      if (!container?.webhookRoutingActive) {
        return; // Nothing to deactivate
      }

      const targetBackend = container.ipAddress
        ? `${container.ipAddress}:${BRIDGE_HTTP_PORT}`
        : null;

      // Remove all entries pointing to this container
      let removed = 0;
      for (const [gwId, backend] of this.routes) {
        if (backend === targetBackend) {
          this.routes.delete(gwId);
          removed++;
        }
      }

      if (removed > 0) {
        await this.writeMapFile();
        await this.reloadNginx();
      }

      // Clear the flag
      await prisma.workspaceContainer.update({
        where: { id: containerDbId },
        data: { webhookRoutingActive: false },
      });

      log.info({ containerDbId, removed }, 'Webhook routes deactivated');
    } catch (err) {
      log.error(
        { containerDbId, error: (err as Error).message },
        'Failed to deactivate webhook routes',
      );
    }
  }

  /**
   * Rebuild the entire map from the database.
   * Useful on server startup to restore routes for running containers.
   */
  async rebuildRoutes(): Promise<void> {
    try {
      const containers = await prisma.workspaceContainer.findMany({
        where: { status: 'RUNNING', ipAddress: { not: null } },
        select: {
          id: true,
          ipAddress: true,
          userId: true,
          organizationId: true,
        },
      });

      this.routes.clear();

      for (const container of containers) {
        const gateways = await prisma.gateway.findMany({
          where: {
            userId: container.userId,
            organizationId: container.organizationId ?? null,
            status: 'CONNECTED',
            mode: { not: 'workflow' },
          },
          select: { id: true },
        });

        const backend = `${container.ipAddress}:${BRIDGE_HTTP_PORT}`;
        for (const gw of gateways) {
          this.routes.set(gw.id, backend);
        }
      }

      await this.writeMapFile();
      await this.reloadNginx();

      log.info(
        { routeCount: this.routes.size, containerCount: containers.length },
        'Webhook routes rebuilt from database',
      );
    } catch (err) {
      log.error(
        { error: (err as Error).message },
        'Failed to rebuild webhook routes',
      );
    }
  }

  /**
   * Write the in-memory route map to the nginx map file.
   */
  private async writeMapFile(): Promise<void> {
    const lines: string[] = [MAP_HEADER];

    for (const [gatewayId, backend] of this.routes) {
      lines.push(`"${gatewayId}" "${backend}";`);
    }

    lines.push(''); // trailing newline

    await fs.writeFile(MAP_FILE_PATH, lines.join('\n'), 'utf-8');
    log.debug({ routeCount: this.routes.size, path: MAP_FILE_PATH }, 'Map file written');
  }

  /**
   * Hot-reload nginx to pick up the updated map file.
   */
  private async reloadNginx(): Promise<void> {
    try {
      await execFileAsync('sudo', ['/usr/sbin/nginx', '-s', 'reload']);
      log.debug('nginx reloaded');
    } catch (err) {
      log.error({ error: (err as Error).message }, 'nginx reload failed');
    }
  }

  /** Get current route count (for metrics/health) */
  get routeCount(): number {
    return this.routes.size;
  }
}

export const gatewayRouteService = new GatewayRouteService();
