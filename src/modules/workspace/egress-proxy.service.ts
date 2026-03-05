/**
 * Egress Proxy Service
 * 
 * Manages the Squid egress proxy lifecycle and parses its access logs
 * into the WorkspaceEgressLog table for admin/user visibility.
 * 
 * Architecture:
 *   1. Starts/manages the Squid proxy Docker container on the workspace network
 *   2. Periodically reads Squid's access.log (incremental tail)
 *   3. Parses each line with the custom 2bot log format
 *   4. Maps container IP → database container ID
 *   5. Inserts parsed entries into WorkspaceEgressLog
 *   6. Runs periodic cleanup of old log entries
 * 
 * Squid log format (from squid.conf):
 *   %ts.%03tu %6tr %>a %Ss/%03>Hs %<st %rm %ru
 *   Example:
 *   1706000000.123 45 172.20.0.2 TCP_TUNNEL/200 5234 CONNECT api.telegram.org:443 api.telegram.org
 * 
 * @module modules/workspace/egress-proxy.service
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as readline from 'readline';
import { promisify } from 'util';

import Docker from 'dockerode';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import { WORKSPACE_NETWORK } from './workspace.constants';

const execFileAsync = promisify(execFile);
const log = logger.child({ module: 'workspace:egress-proxy' });

// ===========================================
// Configuration
// ===========================================

/** How often to parse new log entries (ms) */
const LOG_POLL_INTERVAL = 30_000; // 30 seconds

/** Maximum age for egress log records before cleanup (days) */
const LOG_RETENTION_DAYS = 14;

/** Cleanup runs every N poll cycles */
const CLEANUP_EVERY_N_CYCLES = 120; // ~1 hour at 30s polls

/** Max log lines to process per cycle (prevent unbounded growth) */
const MAX_LINES_PER_CYCLE = 5000;

/** Proxy container configuration */
const PROXY_CONFIG = {
  containerName: '2bot-proxy',
  imageName: '2bot-proxy:latest',
  port: 3128,
  /** Host path for Squid logs (mounted as volume) */
  logDir: process.env.WORKSPACE_PROXY_LOG_DIR || '/var/log/2bot-proxy',
  /** Path inside the Squid container */
  containerLogDir: '/var/log/squid',
  /** Host path for all proxy config files (per-user domain files, ACL snippets, etc.) */
  configDir: process.env.WORKSPACE_PROXY_CONFIG_DIR || '/var/log/2bot-proxy/config',
  /** Container-internal path for config directory */
  containerConfigDir: '/etc/squid/config',
  /** The access.log file path on the host */
  get accessLogPath() {
    return `${this.logDir}/access.log`;
  },
  /** Per-container ACL snippets file (generated) */
  get perContainerAclsPath() {
    return `${this.configDir}/per-container-acls.conf`;
  },
  /** Admin-blocked domains file */
  get adminBlockedDomainsPath() {
    return `${this.configDir}/admin-blocked-domains.txt`;
  },
  /** Per-user domain file path helper */
  userDomainFilePath(userId: string) {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${this.configDir}/user-${safe}-domains.txt`;
  },
  /** Container-internal per-user domain file path */
  containerUserDomainFilePath(userId: string) {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${this.containerConfigDir}/user-${safe}-domains.txt`;
  },
};

// ===========================================
// Types
// ===========================================

interface ParsedLogEntry {
  timestamp: Date;
  elapsedMs: number;
  sourceIp: string;
  squidStatus: string;
  httpStatus: number;
  bytesTransferred: number;
  method: string;
  url: string;
  sni: string;
  domain: string;
  action: 'ALLOWED' | 'BLOCKED' | 'RATE_LIMITED';
}

export interface EgressLogQuery {
  containerId?: string;
  domain?: string;
  action?: 'ALLOWED' | 'BLOCKED' | 'RATE_LIMITED';
  direction?: 'INBOUND' | 'OUTBOUND';
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

export interface EgressLogSummary {
  totalRequests: number;
  allowed: number;
  blocked: number;
  rateLimited: number;
  inbound: number;
  outbound: number;
  topDomains: { domain: string; count: number }[];
  bytesTotal: number;
}

// ===========================================
// Egress Proxy Service
// ===========================================

class EgressProxyService {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private cycleCount = 0;

  /** File offset for incremental log reading */
  private logOffset = 0;

  /** Cache: container IP → database container ID */
  private ipToContainerIdCache = new Map<string, string>();
  private cacheRefreshedAt = 0;
  private readonly CACHE_TTL = 60_000; // 1 minute

  /** Docker client (lazy init) */
  private docker: Docker | null = null;

  private getDocker(): Docker {
    if (!this.docker) {
      const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
      this.docker = new Docker({ socketPath });
    }
    return this.docker;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /**
   * Start the egress proxy service:
   * 1. Ensure proxy container is running
   * 2. Start periodic log parsing
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    log.info('Egress proxy service starting');

    // Ensure log directory exists on host
    try {
      await fs.promises.mkdir(PROXY_CONFIG.logDir, { recursive: true });
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Could not create proxy log directory');
    }

    // Ensure config directory and placeholder files exist
    try {
      await fs.promises.mkdir(PROXY_CONFIG.configDir, { recursive: true });
      // Create empty placeholder files if they don't exist (Squid requires them)
      for (const f of [PROXY_CONFIG.adminBlockedDomainsPath, PROXY_CONFIG.perContainerAclsPath]) {
        try {
          await fs.promises.access(f);
        } catch {
          await fs.promises.writeFile(f, '', 'utf-8');
        }
      }
      // Sync all ACLs from DB on startup
      await this.syncAllAcls();
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Could not initialize proxy config directory');
    }

    // Try to ensure proxy container is running
    try {
      await this.ensureProxyRunning();
      // Set up gateway forwarding for backward compatibility
      // (existing containers may still use the gateway IP 172.20.0.1:3128)
      await this.setupGatewayForwarding();
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Proxy container not available — log parsing will start when it appears');
    }

    // Seek to end of existing log file (don't re-parse old entries on restart)
    await this.seekToEnd();

    // If DB has no egress entries but the log file has content, auto-backfill.
    // This handles the case where the service was deployed but never parsed existing traffic.
    try {
      const existingCount = await prisma.workspaceEgressLog.count({ take: 1 });
      if (existingCount === 0 && this.logOffset > 0) {
        log.info({ logSize: this.logOffset }, 'No egress entries in DB but log file has content — auto-backfilling');
        this.logOffset = 0;
        this.cacheRefreshedAt = 0;
        await this.parseCycle();
      }
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Auto-backfill check failed — will parse new entries only');
    }

    // Start periodic log parsing
    this.pollInterval = setInterval(() => {
      this.parseCycle().catch(err => {
        log.error({ error: (err as Error).message }, 'Log parse cycle failed');
      });
    }, LOG_POLL_INTERVAL);

    log.info('Egress proxy service started');
  }

  /**
   * Stop the egress proxy service
   */
  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    log.info('Egress proxy service stopped');
  }

  // ===========================================
  // Proxy Container Management
  // ===========================================

  /**
   * Ensure the Squid proxy container is running on the workspace network.
   * Creates it if it doesn't exist, starts it if stopped.
   */
  async ensureProxyRunning(): Promise<void> {
    const docker = this.getDocker();
    const containerName = PROXY_CONFIG.containerName;

    try {
      // Check if container already exists
      const container = docker.getContainer(containerName);
      const info = await container.inspect();

      if (!info.State.Running) {
        log.info('Proxy container exists but not running — starting');
        await container.start();
      }

      log.debug('Proxy container is running');
      return;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode !== 404) throw err;
      // Container doesn't exist — create it
    }

    log.info('Creating proxy container');

    // Check if the image exists
    try {
      await docker.getImage(PROXY_CONFIG.imageName).inspect();
    } catch {
      throw new Error(
        `Proxy image "${PROXY_CONFIG.imageName}" not found. ` +
        'Build it with: docker build -t 2bot-proxy:latest -f docker/squid-proxy/Dockerfile.proxy docker/squid-proxy'
      );
    }

    // Create the proxy container on the workspace network
    const created = await docker.createContainer({
      name: containerName,
      Image: PROXY_CONFIG.imageName,
      HostConfig: {
        NetworkMode: WORKSPACE_NETWORK,
        Binds: [
          `${PROXY_CONFIG.logDir}:${PROXY_CONFIG.containerLogDir}`,
          `${PROXY_CONFIG.configDir}:${PROXY_CONFIG.containerConfigDir}`,
        ],
        RestartPolicy: { Name: 'unless-stopped' },
      },
      ExposedPorts: { [`${PROXY_CONFIG.port}/tcp`]: {} },
    });

    await created.start();
    log.info({ containerName, network: WORKSPACE_NETWORK }, 'Proxy container created and started');
  }

  /**
   * Set up iptables DNAT forwarding from the gateway IP to the proxy container.
   * 
   * This ensures backward compatibility: existing containers that were created
   * with HTTP_PROXY=http://172.20.0.1:3128 (the gateway IP) will have their
   * traffic forwarded to the actual proxy container. New containers use the
   * Docker DNS name (2bot-proxy:3128) directly.
   * 
   * Rule: PREROUTING -d <gateway>:3128 → DNAT to <proxy_ip>:3128
   */
  private async setupGatewayForwarding(): Promise<void> {
    try {
      const status = await this.getProxyStatus();
      if (!status.running || !status.ipAddress) {
        log.debug('Proxy not running — skipping gateway forwarding setup');
        return;
      }

      const proxyIp = status.ipAddress;
      const gatewayIp = process.env.WORKSPACE_GATEWAY_IP || '172.20.0.1';
      const port = String(PROXY_CONFIG.port);
      const dest = `${proxyIp}:${port}`;

      // Check if rule already exists (idempotent)
      try {
        await execFileAsync('sudo', [
          'iptables', '-t', 'nat', '-C', 'PREROUTING',
          '-d', `${gatewayIp}/32`, '-p', 'tcp', '--dport', port,
          '-j', 'DNAT', '--to-destination', dest,
        ]);
        log.debug({ gatewayIp, dest }, 'Gateway forwarding rule already exists');
        return;
      } catch {
        // Rule doesn't exist — create it
      }

      await execFileAsync('sudo', [
        'iptables', '-t', 'nat', '-A', 'PREROUTING',
        '-d', `${gatewayIp}/32`, '-p', 'tcp', '--dport', port,
        '-j', 'DNAT', '--to-destination', dest,
      ]);

      log.info({ gatewayIp, proxyIp, port }, 'Gateway forwarding DNAT rule added');
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to set up gateway forwarding — existing containers may not reach proxy');
    }
  }

  /**
   * Get the proxy container status
   */
  async getProxyStatus(): Promise<{ running: boolean; ipAddress?: string; uptime?: string }> {
    try {
      const docker = this.getDocker();
      const container = docker.getContainer(PROXY_CONFIG.containerName);
      const info = await container.inspect();

      const networkData = info.NetworkSettings?.Networks?.[WORKSPACE_NETWORK];
      return {
        running: info.State.Running,
        ipAddress: networkData?.IPAddress,
        uptime: info.State.StartedAt,
      };
    } catch {
      return { running: false };
    }
  }

  // ===========================================
  // Log Parsing
  // ===========================================

  /**
   * Run one parse cycle: read new lines from access.log, parse, and insert.
   */
  private async parseCycle(): Promise<void> {
    const logPath = PROXY_CONFIG.accessLogPath;

    // Check if log file exists
    try {
      await fs.promises.access(logPath, fs.constants.R_OK);
    } catch {
      // Log file doesn't exist yet — proxy may not have served requests
      return;
    }

    // Check if file has grown since last read
    const stat = await fs.promises.stat(logPath);
    if (stat.size <= this.logOffset) {
      // File hasn't grown (or was rotated — handle rotation)
      if (stat.size < this.logOffset) {
        log.info('Log file appears rotated — resetting offset');
        this.logOffset = 0;
      }
      return;
    }

    // Read new lines starting from offset
    const entries: ParsedLogEntry[] = [];
    let linesRead = 0;
    let bytesConsumed = 0;
    let hitLimit = false;

    const stream = fs.createReadStream(logPath, {
      start: this.logOffset,
      encoding: 'utf-8',
    });

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (linesRead >= MAX_LINES_PER_CYCLE) {
        log.warn({ maxLines: MAX_LINES_PER_CYCLE }, 'Hit max lines per cycle — will continue next cycle');
        hitLimit = true;
        break;
      }

      // Track bytes consumed (line + newline character)
      bytesConsumed += Buffer.byteLength(line, 'utf-8') + 1;

      const parsed = this.parseLogLine(line);
      if (parsed) entries.push(parsed);
      linesRead++;
    }

    stream.destroy();

    // Update offset: if we hit the line limit, advance by bytes actually consumed
    // so the next cycle continues from where we left off. Otherwise seek to file end.
    if (hitLimit) {
      this.logOffset += bytesConsumed;
    } else {
      const newStat = await fs.promises.stat(logPath);
      this.logOffset = newStat.size;
    }

    // Insert parsed entries into database
    if (entries.length > 0) {
      await this.insertEntries(entries);
      log.debug({ entries: entries.length, linesRead }, 'Parsed egress log entries');
    }

    // Periodic cleanup
    this.cycleCount++;
    if (this.cycleCount >= CLEANUP_EVERY_N_CYCLES) {
      this.cycleCount = 0;
      await this.cleanup();
    }
  }

  /**
   * Parse a single Squid access.log line in our custom format.
   * 
   * Format: %ts.%03tu %6tr %>a %Ss/%03>Hs %<st %rm %ru
   * Example: 1706000000.123 45 172.20.0.2 TCP_TUNNEL/200 5234 CONNECT api.telegram.org:443
   * 
   * Fields:
   *   [0] timestamp (epoch.ms)
   *   [1] elapsed_ms
   *   [2] source_ip
   *   [3] squid_status/http_status
   *   [4] bytes
   *   [5] method
   *   [6] url
   */
  private parseLogLine(line: string): ParsedLogEntry | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 7) return null;

    // Skip loopback / health-check traffic early (Squid self-checks from 127.0.0.1)
    if (parts[2] === '127.0.0.1') return null;

    try {
      // Parse timestamp
      const tsRaw = parts[0]!;
      const tsFloat = parseFloat(tsRaw);
      if (isNaN(tsFloat)) return null;
      const timestamp = new Date(tsFloat * 1000);

      // Parse elapsed time
      const elapsedMs = parseInt(parts[1]!, 10) || 0;

      // Source IP
      const sourceIp = parts[2]!;

      // Squid status / HTTP status
      const statusParts = parts[3]!.split('/');
      const squidStatus = statusParts[0] || 'UNKNOWN';
      const httpStatus = parseInt(statusParts[1] || '0', 10) || 0;

      // Bytes transferred
      const bytesTransferred = parseInt(parts[4]!, 10) || 0;

      // Method
      const method = parts[5]!;

      // URL
      const url = parts[6]!;

      // SNI (may be missing or '-')
      const sni = parts[7] && parts[7] !== '-' ? parts[7] : '';

      // Extract domain from URL or SNI
      const domain = this.extractDomain(url, sni);

      // Classify action based on Squid status
      const action = this.classifyAction(squidStatus, httpStatus);

      return {
        timestamp,
        elapsedMs,
        sourceIp,
        squidStatus,
        httpStatus,
        bytesTransferred,
        method,
        url,
        sni,
        domain,
        action,
      };
    } catch {
      log.debug({ line: trimmed.slice(0, 200) }, 'Failed to parse log line');
      return null;
    }
  }

  /**
   * Extract domain name from URL or SNI.
   * - For CONNECT: url is "domain:port", sni is the domain
   * - For GET/POST: url is the full URL
   */
  private extractDomain(url: string, sni: string): string {
    // If SNI is available, use it (most reliable for HTTPS)
    if (sni && sni !== '-') return sni;

    try {
      // CONNECT method: url is "host:port"
      if (url.includes(':') && !url.includes('://')) {
        return url.split(':')[0] ?? 'unknown';
      }
      // HTTP: full URL
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      const firstPart = url.split('/')[0];
      return (firstPart ? firstPart.split(':')[0] : undefined) ?? 'unknown';
    }
  }

  /**
   * Classify an egress entry based on Squid status codes.
   */
  private classifyAction(squidStatus: string, httpStatus: number): 'ALLOWED' | 'BLOCKED' | 'RATE_LIMITED' {
    // TCP_DENIED = proxy denied the request (whitelist block)
    if (squidStatus === 'TCP_DENIED' || httpStatus === 403 || httpStatus === 407) {
      return 'BLOCKED';
    }
    // ERR_ prefixed statuses are errors, which could indicate rate limiting
    if (squidStatus.startsWith('ERR_') || httpStatus === 429) {
      return 'RATE_LIMITED';
    }
    // TCP_TUNNEL, TCP_MISS, TCP_HIT = successful
    return 'ALLOWED';
  }

  /**
   * Insert parsed log entries into the database.
   * Maps source IPs to container database IDs using a cached lookup.
   */
  private async insertEntries(entries: ParsedLogEntry[]): Promise<void> {
    // Refresh IP→container mapping if stale
    await this.refreshIpCache();

    const records = [];

    for (const entry of entries) {
      const containerId = this.ipToContainerIdCache.get(entry.sourceIp);
      if (!containerId) {
        // Unknown source IP — might be the proxy itself or old container
        log.debug({ sourceIp: entry.sourceIp }, 'Unknown source IP in egress log — skipping');
        continue;
      }

      records.push({
        containerId,
        timestamp: entry.timestamp,
        domain: entry.domain,
        url: entry.url || null,
        method: entry.method,
        httpStatus: entry.httpStatus,
        squidStatus: entry.squidStatus,
        bytesTransferred: entry.bytesTransferred,
        elapsedMs: entry.elapsedMs,
        action: entry.action,
      });
    }

    if (records.length === 0) return;

    // Batch insert for performance
    try {
      // Prisma doesn't support createMany with skipDuplicates well for all DBs,
      // so we use a transaction with individual creates for reliability
      const BATCH_SIZE = 100;
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        await prisma.workspaceEgressLog.createMany({
          data: batch,
        });
      }

      log.debug({ inserted: records.length, skipped: entries.length - records.length }, 'Egress log entries inserted');
    } catch (err) {
      log.error({ error: (err as Error).message, records: records.length }, 'Failed to insert egress log entries');
    }
  }

  /**
   * Refresh the IP→container ID cache from running containers.
   * Also backfills missing IP addresses in the DB by inspecting Docker.
   */
  private async refreshIpCache(): Promise<void> {
    const now = Date.now();
    if (now - this.cacheRefreshedAt < this.CACHE_TTL) return;

    try {
      const containers = await prisma.workspaceContainer.findMany({
        where: { status: { in: ['RUNNING', 'STARTING'] } },
        select: { id: true, containerId: true, ipAddress: true },
      });

      this.ipToContainerIdCache.clear();
      for (const c of containers) {
        if (c.ipAddress) {
          this.ipToContainerIdCache.set(c.ipAddress, c.id);
        } else if (c.containerId) {
          // IP not stored — resolve from Docker and backfill
          try {
            const docker = this.getDocker();
            const info = await docker.getContainer(c.containerId).inspect();
            const ip = info.NetworkSettings?.Networks?.[WORKSPACE_NETWORK]?.IPAddress;
            if (ip) {
              this.ipToContainerIdCache.set(ip, c.id);
              // Backfill to DB (non-blocking)
              prisma.workspaceContainer.update({
                where: { id: c.id },
                data: { ipAddress: ip },
              }).catch(() => { /* best-effort */ });
              log.debug({ containerDbId: c.id, ip }, 'Backfilled container IP from Docker');
            }
          } catch {
            // Container not reachable — skip
          }
        }
      }

      this.cacheRefreshedAt = now;
      log.debug({ entries: this.ipToContainerIdCache.size }, 'IP→container cache refreshed');
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to refresh IP→container cache');
    }
  }

  /**
   * Seek to the end of the log file (skip existing entries on service start).
   */
  private async seekToEnd(): Promise<void> {
    try {
      const stat = await fs.promises.stat(PROXY_CONFIG.accessLogPath);
      this.logOffset = stat.size;
      log.debug({ offset: this.logOffset }, 'Seeked to end of access.log');
    } catch {
      // File doesn't exist yet — will start from 0
      this.logOffset = 0;
    }
  }

  /**
   * Reparse the entire log file from the beginning (one-time backfill).
   * Useful after fixing log path or permissions.
   */
  async reparseFromStart(): Promise<void> {
    log.info({ previousOffset: this.logOffset }, 'Reparsing access.log from start');
    this.logOffset = 0;
    // Force IP cache refresh so we have up-to-date mappings
    this.cacheRefreshedAt = 0;
    await this.parseCycle();
  }

  // ===========================================
  // Query API
  // ===========================================

  /**
   * Query egress logs with filters
   */
  async getLogs(query: EgressLogQuery) {
    const where: Record<string, unknown> = {};

    if (query.containerId) where.containerId = query.containerId;
    if (query.domain) where.domain = { contains: query.domain };
    if (query.action) where.action = query.action;
    if (query.direction) where.direction = query.direction;

    if (query.since || query.until) {
      const timestamp: Record<string, Date> = {};
      if (query.since) timestamp.gte = query.since;
      if (query.until) timestamp.lte = query.until;
      where.timestamp = timestamp;
    }

    const [logs, total] = await Promise.all([
      prisma.workspaceEgressLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: query.limit ?? 100,
        skip: query.offset ?? 0,
        include: {
          container: {
            select: {
              id: true,
              containerName: true,
              userId: true,
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      }),
      prisma.workspaceEgressLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get traffic summary for a container or all containers
   */
  async getSummary(containerId?: string, since?: Date): Promise<EgressLogSummary> {
    const effectiveSince = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    const where: Record<string, unknown> = {
      timestamp: { gte: effectiveSince },
    };
    if (containerId) where.containerId = containerId;

    const [totals, directionTotals, topDomains, bytesResult] = await Promise.all([
      // Count by action
      prisma.workspaceEgressLog.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),
      // Count by direction
      prisma.workspaceEgressLog.groupBy({
        by: ['direction'],
        where,
        _count: true,
      }),
      // Top domains
      prisma.workspaceEgressLog.groupBy({
        by: ['domain'],
        where,
        _count: true,
        orderBy: { _count: { domain: 'desc' } },
        take: 10,
      }),
      // Total bytes
      prisma.workspaceEgressLog.aggregate({
        where,
        _sum: { bytesTransferred: true },
      }),
    ]);

    const actionCounts: Record<string, number> = {};
    let totalRequests = 0;
    for (const t of totals) {
      actionCounts[t.action] = t._count;
      totalRequests += t._count;
    }

    const dirCounts: Record<string, number> = {};
    for (const d of directionTotals) {
      dirCounts[d.direction] = d._count;
    }

    return {
      totalRequests,
      allowed: actionCounts['ALLOWED'] ?? 0,
      blocked: actionCounts['BLOCKED'] ?? 0,
      rateLimited: actionCounts['RATE_LIMITED'] ?? 0,
      inbound: dirCounts['INBOUND'] ?? 0,
      outbound: dirCounts['OUTBOUND'] ?? 0,
      topDomains: topDomains.map(d => ({ domain: d.domain, count: d._count })),
      bytesTotal: bytesResult._sum.bytesTransferred ?? 0,
    };
  }

  // ===========================================
  // Inbound Traffic Logging
  // ===========================================

  /**
   * Store an inbound traffic log entry (from bridge agent webhook events).
   * Called when the platform receives a traffic.inbound event from a bridge client.
   */
  async storeInboundLog(containerDbId: string, data: {
    timestamp: string;
    domain: string;
    url?: string;
    method: string;
    httpStatus: number;
    bytesTransferred: number;
    sourceType?: string;
    pluginFile?: string;
    gatewayId?: string;
    eventType?: string;
    pluginsDelivered?: number;
  }): Promise<void> {
    try {
      await prisma.workspaceEgressLog.create({
        data: {
          containerId: containerDbId,
          timestamp: new Date(data.timestamp),
          domain: data.domain,
          url: data.url ?? null,
          method: data.method,
          httpStatus: data.httpStatus,
          squidStatus: '',
          bytesTransferred: data.bytesTransferred,
          elapsedMs: 0,
          action: 'ALLOWED',
          direction: 'INBOUND',
          sourceType: data.sourceType ?? null,
          pluginFile: data.pluginFile ?? (data.pluginsDelivered ? `${data.pluginsDelivered} plugins` : null),
        },
      });
      log.debug({ containerDbId, domain: data.domain, sourceType: data.sourceType }, 'Inbound traffic log stored');
    } catch (err) {
      log.error({ containerDbId, error: (err as Error).message }, 'Failed to store inbound traffic log');
    }
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * Delete egress logs older than retention period
   */
  private async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      const result = await prisma.workspaceEgressLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      if (result.count > 0) {
        log.info({ deleted: result.count, retentionDays: LOG_RETENTION_DAYS }, 'Old egress logs cleaned up');
      }
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Egress log cleanup failed');
    }
  }

  // ===========================================
  // User Domain Allowlist
  // ===========================================

  /** System-wide allowed domains (always active, cannot be removed by users) */
  private static readonly SYSTEM_DOMAINS = [
    '.npmjs.org',
    '.yarnpkg.com',
    '.github.com',
    '.githubusercontent.com',
    '.gitlab.com',
    '.bitbucket.org',
    '.telegram.org',
    '.discord.com',
    'gateway.discord.gg',
    'discord.gg',
  ];

  /**
   * Add a domain to a user's allowlist.
   * Validates the domain, stores it in DB, then syncs the proxy config.
   */
  async addUserDomain(userId: string, domain: string, reason?: string): Promise<{ id: string; domain: string }> {
    // Normalize domain: ensure leading dot for subdomain matching
    const normalized = this.normalizeDomain(domain);
    if (!normalized) {
      throw new Error('Invalid domain format. Use something like "example.com" or ".example.com"');
    }

    // Check if it's already a system domain
    if (EgressProxyService.SYSTEM_DOMAINS.some(sd => sd === normalized || normalized.endsWith(sd))) {
      throw new Error(`"${domain}" is already allowed by default (system allowlist)`);
    }

    // Check for dangerous patterns
    this.validateDomainSafety(normalized);

    // Check if domain is admin-blocked
    const isBlocked = await prisma.adminBlockedDomain.findUnique({
      where: { domain: normalized },
    });
    if (isBlocked) {
      throw new Error(`"${domain}" is blocked by an administrator and cannot be added`);
    }

    // Upsert to handle re-adding a previously revoked domain
    const record = await prisma.workspaceAllowedDomain.upsert({
      where: { userId_domain: { userId, domain: normalized } },
      update: {
        status: 'APPROVED',
        reason,
        consentAccepted: true,
        consentAt: new Date(),
      },
      create: {
        userId,
        domain: normalized,
        status: 'APPROVED',
        reason,
        consentAccepted: true,
        consentAt: new Date(),
      },
    });

    // Sync to proxy
    await this.syncAllAcls();
    await this.reloadProxy();

    log.info({ userId, domain: normalized }, 'User domain added to allowlist');
    return { id: record.id, domain: record.domain };
  }

  /**
   * Remove a domain from a user's allowlist.
   */
  async removeUserDomain(userId: string, domainId: string): Promise<void> {
    const record = await prisma.workspaceAllowedDomain.findFirst({
      where: { id: domainId, userId },
    });

    if (!record) {
      throw new Error('Domain not found or not owned by you');
    }

    await prisma.workspaceAllowedDomain.delete({
      where: { id: domainId },
    });

    // Sync to proxy
    await this.syncAllAcls();
    await this.reloadProxy();

    log.info({ userId, domain: record.domain }, 'User domain removed from allowlist');
  }

  /**
   * Get a user's allowed domains.
   */
  async getUserDomains(userId: string) {
    return prisma.workspaceAllowedDomain.findMany({
      where: { userId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        domain: true,
        reason: true,
        status: true,
        consentAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get all allowed domains (admin view).
   */
  async getAllDomains(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return prisma.workspaceAllowedDomain.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Sync all proxy ACLs: per-user domain files, admin blacklist, and per-container ACL snippets.
   * Called on startup, after domain changes, and after container lifecycle events.
   */
  async syncAllAcls(): Promise<void> {
    try {
      await fs.promises.mkdir(PROXY_CONFIG.configDir, { recursive: true });
      await Promise.all([
        this.syncPerUserDomainFiles(),
        this.syncAdminBlockedDomains(),
      ]);
      await this.generatePerContainerAcls();
      log.debug('All proxy ACLs synced');
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to sync proxy ACLs');
    }
  }

  /**
   * Generate one domain file per user containing only their approved domains.
   * Filters out any admin-blocked domains.
   */
  private async syncPerUserDomainFiles(): Promise<void> {
    const domains = await prisma.workspaceAllowedDomain.findMany({
      where: { status: 'APPROVED' },
      select: { userId: true, domain: true },
    });

    // Get admin blocked domains to filter them out
    const blockedDomains = await prisma.adminBlockedDomain.findMany({
      select: { domain: true },
    });
    const blockedSet = new Set(blockedDomains.map(d => d.domain));

    // Group by userId
    const byUser = new Map<string, Set<string>>();
    for (const d of domains) {
      if (blockedSet.has(d.domain)) continue;
      if (!byUser.has(d.userId)) byUser.set(d.userId, new Set());
      byUser.get(d.userId)!.add(d.domain);
    }

    // Write per-user files
    for (const [userId, userDomains] of byUser) {
      const content = [...userDomains].join('\n') + (userDomains.size > 0 ? '\n' : '');
      await fs.promises.writeFile(PROXY_CONFIG.userDomainFilePath(userId), content, 'utf-8');
    }

    // Clean up stale user domain files for users no longer in the map
    try {
      const files = await fs.promises.readdir(PROXY_CONFIG.configDir);
      for (const f of files) {
        if (!f.startsWith('user-') || !f.endsWith('-domains.txt')) continue;
        // Extract userId from filename: user-{userId}-domains.txt
        const match = f.match(/^user-(.+)-domains\.txt$/);
        if (match?.[1] && !byUser.has(match[1])) {
          await fs.promises.unlink(`${PROXY_CONFIG.configDir}/${f}`);
        }
      }
    } catch {
      // Best-effort cleanup
    }

    log.debug({ userCount: byUser.size }, 'Per-user domain files synced');
  }

  /**
   * Generate the admin-blocked domains file for Squid.
   */
  private async syncAdminBlockedDomains(): Promise<void> {
    const blocked = await prisma.adminBlockedDomain.findMany({
      select: { domain: true },
    });
    const content = blocked.map(d => d.domain).join('\n') + (blocked.length > 0 ? '\n' : '');
    await fs.promises.writeFile(PROXY_CONFIG.adminBlockedDomainsPath, content, 'utf-8');
    log.debug({ count: blocked.length }, 'Admin blocked domains synced');
  }

  /**
   * Generate the per-container ACL snippets file that maps each container IP
   * to its owner's domain file.
   */
  private async generatePerContainerAcls(): Promise<void> {
    const containers = await prisma.workspaceContainer.findMany({
      where: { status: { in: ['RUNNING', 'STARTING'] }, ipAddress: { not: null } },
      select: { id: true, userId: true, ipAddress: true },
    });

    const lines: string[] = [
      '# Auto-generated per-container ACLs',
      '# DO NOT EDIT — regenerated by egress-proxy.service.ts',
      '',
    ];

    const definedUserAcls = new Set<string>();

    for (const c of containers) {
      if (!c.ipAddress) continue;
      const safeUserId = c.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeIp = c.ipAddress.replace(/\./g, '_');

      // Check if user has a domain file on disk
      const hasFile = await this.fileExists(PROXY_CONFIG.userDomainFilePath(c.userId));

      // Define user domain ACL once per user
      if (!definedUserAcls.has(c.userId) && hasFile) {
        const containerPath = PROXY_CONFIG.containerUserDomainFilePath(c.userId);
        lines.push(`acl domains_${safeUserId} dstdomain "${containerPath}"`);
        definedUserAcls.add(c.userId);
      }

      // Define per-container-IP ACL and allow rule
      lines.push(`acl ip_${safeIp} src ${c.ipAddress}/32`);
      if (definedUserAcls.has(c.userId)) {
        lines.push(`http_access allow ip_${safeIp} domains_${safeUserId}`);
      }
      lines.push('');
    }

    await fs.promises.writeFile(PROXY_CONFIG.perContainerAclsPath, lines.join('\n'), 'utf-8');
    log.debug({ containers: containers.length }, 'Per-container ACL snippets generated');
  }

  /** Check if a file exists on disk */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Signal Squid to reload its configuration (picks up ACL changes).
   */
  async reloadProxy(): Promise<void> {
    try {
      const docker = this.getDocker();
      const container = docker.getContainer(PROXY_CONFIG.containerName);

      // Execute "squid -k reconfigure" inside the container
      const exec = await container.exec({
        Cmd: ['squid', '-k', 'reconfigure'],
        AttachStdout: true,
        AttachStderr: true,
      });
      await exec.start({ Detach: false });

      log.info('Squid proxy reconfigured with updated domain allowlist');
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to reload Squid proxy — changes will apply on next container restart');
    }
  }

  /**
   * Get the full effective allowlist (system + user domains).
   */
  getSystemDomains(): string[] {
    return [...EgressProxyService.SYSTEM_DOMAINS];
  }

  // ===========================================
  // Admin Blocked Domain Management
  // ===========================================

  /**
   * Admin: add a domain to the global blacklist.
   * Revokes any existing user approvals for this domain.
   */
  async addBlockedDomain(adminUserId: string, domain: string, reason?: string): Promise<{ id: string; domain: string }> {
    const normalized = this.normalizeDomain(domain);
    if (!normalized) {
      throw new Error('Invalid domain format');
    }

    // Prevent blocking system domains
    if (EgressProxyService.SYSTEM_DOMAINS.some(sd => sd === normalized || normalized.endsWith(sd))) {
      throw new Error('Cannot block a system-required domain');
    }

    const record = await prisma.adminBlockedDomain.create({
      data: { domain: normalized, reason, createdBy: adminUserId },
    });

    // Revoke any user-approved instances of this domain
    await prisma.workspaceAllowedDomain.updateMany({
      where: { domain: normalized, status: 'APPROVED' },
      data: { status: 'REVOKED', reviewedBy: adminUserId, reviewedAt: new Date(), reviewNote: 'Domain blocked by administrator' },
    });

    await this.syncAllAcls();
    await this.reloadProxy();

    log.info({ adminUserId, domain: normalized }, 'Admin blocked domain added');
    return { id: record.id, domain: record.domain };
  }

  /**
   * Admin: remove a domain from the global blacklist.
   */
  async removeBlockedDomain(domainId: string): Promise<void> {
    await prisma.adminBlockedDomain.delete({ where: { id: domainId } });
    await this.syncAllAcls();
    await this.reloadProxy();
    log.info({ domainId }, 'Admin blocked domain removed');
  }

  /**
   * Admin: list all globally blocked domains.
   */
  async getBlockedDomains() {
    return prisma.adminBlockedDomain.findMany({
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { id: true, name: true, email: true } } },
    });
  }

  /**
   * Admin: review/change a user's domain request status.
   */
  async reviewUserDomain(adminUserId: string, domainId: string, action: 'APPROVED' | 'REJECTED' | 'REVOKED', reviewNote?: string) {
    const record = await prisma.workspaceAllowedDomain.update({
      where: { id: domainId },
      data: {
        status: action,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        reviewNote,
      },
    });

    await this.syncAllAcls();
    await this.reloadProxy();

    log.info({ adminUserId, domainId, action }, 'Admin reviewed user domain');
    return record;
  }

  /**
   * Normalize a domain input to Squid ACL format.
   * - "example.com" → ".example.com" (matches example.com + *.example.com)
   * - ".example.com" → ".example.com" (already correct)
   * - "*.example.com" → ".example.com" (convert wildcard)
   * Returns null if invalid.
   */
  private normalizeDomain(input: string): string | null {
    let domain = input.trim().toLowerCase();

    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, '');
    // Remove path/port
    domain = domain.split('/')[0]!.split(':')[0]!;
    // Convert wildcard notation
    domain = domain.replace(/^\*\./, '.');

    // Ensure leading dot for subdomain matching
    if (!domain.startsWith('.')) {
      domain = '.' + domain;
    }

    // Validate: must be a valid domain pattern
    // At least two labels (e.g., ".example.com"), no spaces, valid chars
    const domainRegex = /^\.[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
    if (!domainRegex.test(domain)) {
      return null;
    }

    return domain;
  }

  /**
   * Validate that a domain is not potentially dangerous.
   * Blocks overly broad TLDs and known-problematic patterns.
   */
  private validateDomainSafety(domain: string): void {
    // Block bare TLDs (e.g., ".com", ".org", ".io")
    const labels = domain.split('.').filter(Boolean);
    if (labels.length < 2) {
      throw new Error('Domain is too broad — must have at least two labels (e.g., ".example.com")');
    }

    // Block known broad patterns
    const blocked = ['.amazonaws.com', '.cloudfront.net', '.googleapis.com', '.google.com', '.facebook.com'];
    if (blocked.includes(domain)) {
      throw new Error(`"${domain}" is blocked for security reasons — too broad`);
    }
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const egressProxyService = new EgressProxyService();
