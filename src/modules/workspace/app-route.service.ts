/**
 * App Route Service (Phase 7.3c)
 *
 * Manages the nginx map file that routes inbound user-facing HTTP traffic
 * (e.g. `alice-todo.2bot.org`) to a workspace container's HTTP listener
 * (`docker/workspace/bridge-agent/http-listener.js`).
 *
 * Mirrors the structure of `gateway-route.service.ts`:
 *   - Map file `nginx/apps-routes.map` symlinked to `/etc/nginx/conf.d/`
 *   - Hot-reloaded via `sudo nginx -s reload`
 *   - Lifecycle hooks: activate on RUNNING, deactivate on STOPPED/DESTROYED
 *   - Server-startup rebuild
 *
 * The bridge-agent listener is published on `127.0.0.1:<httpPort>` (dynamic
 * host port assigned by Docker), so the map maps `<host>` → `127.0.0.1:<port>`.
 *
 * Gated behind `FEATURE_PROJECT_RESOURCES` — when disabled the service is
 * a no-op so existing deployments are unaffected.
 *
 * @module modules/workspace/app-route.service
 */

import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const execFileAsync = promisify(execFile);
const log = logger.child({ module: 'workspace:app-route' });

// ===========================================
// Configuration
// ===========================================

/**
 * Path to the nginx map file. Defaults to the repo-local copy
 * (`nginx/apps-routes.map`); nginx reads it via a symlink created by
 * `make setup-nginx`. Override with `APPS_ROUTES_MAP_PATH` if needed.
 */
const MAP_FILE_PATH =
  process.env.APPS_ROUTES_MAP_PATH ||
  path.join(process.cwd(), 'nginx', 'apps-routes.map');

/** Apex domain used to construct full hosts (`<subdomain>.<APEX>`). */
const APEX_DOMAIN = process.env.APPS_APEX_DOMAIN || '2bot.org';

/** Header written to the map file. */
const MAP_HEADER = [
  '# Application Subdomain → Container HTTP Listener Routes',
  '# Managed by app-route.service.ts — DO NOT EDIT MANUALLY',
  '#',
  '# Format: "<host>" "127.0.0.1:<port>";',
  '',
].join('\n');

function isFeatureEnabled(): boolean {
  return (
    (process.env.FEATURE_PROJECT_RESOURCES ?? 'disabled').toLowerCase() ===
    'enabled'
  );
}

function fullHost(subdomain: string): string {
  return `${subdomain}.${APEX_DOMAIN}`;
}

// ===========================================
// Service
// ===========================================

class AppRouteService {
  /** In-memory route table: `host` → `127.0.0.1:port`. */
  private routes = new Map<string, string>();

  /** Add the route for a single container (called when it transitions to RUNNING). */
  async activateRoutes(containerDbId: string): Promise<void> {
    if (!isFeatureEnabled()) return;
    try {
      const container = await prisma.workspaceContainer.findUnique({
        where: { id: containerDbId },
        select: {
          subdomain: true,
          httpPort: true,
          status: true,
        },
      });

      if (!container) {
        log.warn({ containerDbId }, 'Cannot activate app route — container missing');
        return;
      }
      if (container.status !== 'RUNNING') {
        log.warn(
          { containerDbId, status: container.status },
          'Cannot activate app route — container not running',
        );
        return;
      }
      if (!container.subdomain || !container.httpPort) {
        log.debug(
          { containerDbId, subdomain: container.subdomain, httpPort: container.httpPort },
          'Skipping app route — subdomain or httpPort missing',
        );
        return;
      }

      const host = fullHost(container.subdomain);
      const backend = `127.0.0.1:${container.httpPort}`;
      const previous = this.routes.get(host);

      this.routes.set(host, backend);

      if (previous !== backend) {
        await this.writeMapFile();
        await this.reloadNginx();
        log.info({ containerDbId, host, backend }, 'App route activated');
      }
    } catch (err) {
      log.error(
        { containerDbId, error: (err as Error).message },
        'Failed to activate app route',
      );
    }
  }

  /** Remove the route for a container (called when STOPPED/DESTROYED). */
  async deactivateRoutes(containerDbId: string): Promise<void> {
    if (!isFeatureEnabled()) return;
    try {
      const container = await prisma.workspaceContainer.findUnique({
        where: { id: containerDbId },
        select: { subdomain: true },
      });

      if (!container?.subdomain) return; // Nothing to remove.

      const host = fullHost(container.subdomain);
      if (!this.routes.delete(host)) return;

      await this.writeMapFile();
      await this.reloadNginx();
      log.info({ containerDbId, host }, 'App route deactivated');
    } catch (err) {
      log.error(
        { containerDbId, error: (err as Error).message },
        'Failed to deactivate app route',
      );
    }
  }

  /**
   * Rebuild the entire map from the database. Runs on server startup so
   * routes survive a platform restart.
   */
  async rebuildRoutes(): Promise<void> {
    if (!isFeatureEnabled()) return;
    try {
      const containers = await prisma.workspaceContainer.findMany({
        where: {
          status: 'RUNNING',
          subdomain: { not: null },
          httpPort: { not: null },
        },
        select: { subdomain: true, httpPort: true },
      });

      this.routes.clear();
      for (const c of containers) {
        if (!c.subdomain || !c.httpPort) continue;
        this.routes.set(fullHost(c.subdomain), `127.0.0.1:${c.httpPort}`);
      }

      await this.writeMapFile();
      await this.reloadNginx();
      log.info({ routeCount: this.routes.size }, 'App routes rebuilt from database');
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to rebuild app routes');
    }
  }

  private async writeMapFile(): Promise<void> {
    const lines: string[] = [MAP_HEADER];
    for (const [host, backend] of this.routes) {
      lines.push(`"${host}" "${backend}";`);
    }
    lines.push('');
    await fs.writeFile(MAP_FILE_PATH, lines.join('\n'), 'utf-8');
    log.debug({ routeCount: this.routes.size, path: MAP_FILE_PATH }, 'App route map written');
  }

  private async reloadNginx(): Promise<void> {
    try {
      await execFileAsync('sudo', ['/usr/sbin/nginx', '-s', 'reload']);
      log.debug('nginx reloaded for app routes');
    } catch (err) {
      log.error({ error: (err as Error).message }, 'nginx reload failed (app routes)');
    }
  }

  /** Current route count (for metrics/health). */
  get routeCount(): number {
    return this.routes.size;
  }
}

export const appRouteService = new AppRouteService();
