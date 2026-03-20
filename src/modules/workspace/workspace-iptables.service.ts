/**
 * Network Egress Service
 * 
 * Manages network egress rules for workspace containers using iptables.
 * Applied after container start to restrict outbound traffic.
 * 
 * Architecture (Stage 2 — Proxy Mode):
 *   All container outbound traffic is forced through the Squid proxy.
 *   iptables rules ensure containers can ONLY reach:
 *     1. The proxy (workspace subnet, port 3128) — for HTTP/HTTPS traffic
 *     2. DNS (UDP 53) — for hostname resolution
 *     3. Loopback (127.0.0.0/8) — bridge agent communication
 *     4. Everything else → DROP
 * 
 *   The proxy handles:
 *     - Domain-level whitelisting (only allowed destinations)
 *     - Per-request access logging (with container IP for attribution)
 *     - Bandwidth rate limiting (delay pools)
 *     - Connection limits (max 50 concurrent per container)
 * 
 *   Stage 1 rate limiting is kept as defense-in-depth at the iptables layer.
 *   If the proxy is bypassed somehow, iptables still blocks direct internet access.
 * 
 * Requirements:
 *   - Host user must have sudo access to iptables (no password prompt)
 *   - Squid proxy must be running as a container on the workspace network
 *   - iptables conntrack and limit modules must be available
 * 
 * @module modules/workspace/workspace-iptables.service
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

import { logger } from '@/lib/logger';

import { dockerService } from './workspace-docker.service';

const execFileAsync = promisify(execFile);
const log = logger.child({ module: 'workspace:iptables' });

// ===========================================
// Configuration
// ===========================================

/**
 * Proxy address: the workspace subnet where the proxy container runs.
 * Containers reach the proxy via Docker DNS (container name "2bot-proxy").
 * For iptables, we allow port 3128 to the entire workspace subnet since
 * the proxy's IP is dynamically assigned.
 */
const PROXY_SUBNET = process.env.WORKSPACE_PROXY_SUBNET || '172.20.0.0/16';
const PROXY_PORT = process.env.WORKSPACE_PROXY_PORT || '3128';

/**
 * Host API server: used by containers for credential REST fallback.
 * The host's IP on the workspace network (Docker bridge gateway).
 */
const HOST_API_IP = process.env.WORKSPACE_HOST_API_IP || '172.20.0.1';
const HOST_API_PORT = process.env.WORKSPACE_HOST_API_PORT || '3002';

/**
 * Allowed CIDR ranges (always allowed regardless of proxy)
 */
const ALLOWED_CIDRS = [
  '127.0.0.0/8',       // Loopback (bridge agent internal)
];

/**
 * Whether to enable egress filtering. Can be disabled for debugging.
 */
const EGRESS_ENABLED = process.env.WORKSPACE_EGRESS_FILTER !== 'disabled';

/**
 * Rate limits for outbound connections (defense-in-depth, per container).
 * These apply at the iptables layer even before traffic reaches the proxy.
 */
const RATE_LIMITS = {
  /** Max NEW connections/min to the proxy */
  PROXY_PER_MIN: 300,
  PROXY_BURST: 60,
  /** Max DNS queries/min */
  DNS_PER_MIN: 60,
  DNS_BURST: 15,
};

// ===========================================
// Network Egress Service
// ===========================================

class NetworkEgressService {
  /**
   * Apply network egress rules to a running container.
   * 
   * Creates a per-container iptables chain (2BOT-<ip>) that forces
   * all traffic through the Squid proxy. Direct internet access is blocked.
   * 
   * Rule evaluation order:
   *   1. ESTABLISHED,RELATED → RETURN (allow responses)
   *   2. DNS (UDP 53) → rate-limited RETURN
   *   3. Loopback → RETURN
   *   4. Proxy (gateway:3128) → rate-limited RETURN
   *   5. Everything else → DROP
   * 
   * @param containerId - Docker container ID
   * @param containerDbId - Database container ID (for logging)
   */
  async applyEgressRules(containerId: string, containerDbId: string): Promise<void> {
    if (!EGRESS_ENABLED) {
      log.info({ containerDbId }, 'Network egress filtering disabled');
      return;
    }

    try {
      // Get container IP address
      const info = await dockerService.inspectContainer(containerId);
      const containerIp = info.ipAddress;

      if (!containerIp) {
        log.warn({ containerDbId, containerId }, 'Container has no IP — skipping egress rules');
        return;
      }

      log.info({ containerDbId, containerIp }, 'Applying proxy-mode egress rules');

      const chainName = this.getChainName(containerIp);

      // Clean up any existing rules for this container (idempotent re-application)
      await this.cleanupChain(chainName, containerIp);

      // Create per-container chain
      await this.iptables(['-N', chainName]);

      // Build rules inside the chain.
      // All rules use -A (append), so evaluation order = insertion order.
      const rules: string[][] = [];

      // ── 1. Allow established/related connections (responses) ──
      rules.push([
        '-A', chainName,
        '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED',
        '-j', 'RETURN',
      ]);

      // ── 2. DNS with rate limit ──
      rules.push([
        '-A', chainName,
        '-p', 'udp', '--dport', '53',
        '-m', 'limit', '--limit', `${RATE_LIMITS.DNS_PER_MIN}/min`,
        '--limit-burst', String(RATE_LIMITS.DNS_BURST),
        '-j', 'RETURN',
      ]);
      // DNS excess → DROP
      rules.push(['-A', chainName, '-p', 'udp', '--dport', '53', '-j', 'DROP']);

      // ── 3. Loopback / internal CIDRs (no rate limit) ──
      for (const cidr of ALLOWED_CIDRS) {
        rules.push(['-A', chainName, '-d', cidr, '-j', 'RETURN']);
      }

      // ── 3b. Host API server (credential REST fallback for direct webhooks) ──
      // Allows containers to reach the platform API for credential fetches
      // when the WebSocket IPC channel is unavailable.
      rules.push([
        '-A', chainName,
        '-d', HOST_API_IP, '-p', 'tcp', '--dport', HOST_API_PORT,
        '-j', 'RETURN',
      ]);

      // ── 4. Proxy — the ONLY way out to the internet ──
      // Allow NEW connections to the proxy with rate limiting
      rules.push([
        '-A', chainName,
        '-d', PROXY_SUBNET, '-p', 'tcp', '--dport', PROXY_PORT,
        '-m', 'conntrack', '--ctstate', 'NEW',
        '-m', 'limit', '--limit', `${RATE_LIMITS.PROXY_PER_MIN}/min`,
        '--limit-burst', String(RATE_LIMITS.PROXY_BURST),
        '-j', 'RETURN',
      ]);
      // Proxy excess → DROP (rate limit exceeded)
      rules.push([
        '-A', chainName,
        '-d', PROXY_SUBNET, '-p', 'tcp', '--dport', PROXY_PORT,
        '-m', 'conntrack', '--ctstate', 'NEW',
        '-j', 'DROP',
      ]);
      // Allow non-NEW traffic to proxy (caught by rule 1 mostly, safety net)
      rules.push([
        '-A', chainName,
        '-d', PROXY_SUBNET, '-p', 'tcp', '--dport', PROXY_PORT,
        '-j', 'RETURN',
      ]);

      // ── 5. DROP everything else ──
      // No direct internet access — must go through proxy
      rules.push(['-A', chainName, '-j', 'DROP']);

      // Apply all chain rules
      let applied = 0;
      for (const rule of rules) {
        try {
          await this.iptables(rule);
          applied++;
        } catch (err) {
          const msg = (err as Error).message || '';
          if (!msg.includes('already exists')) {
            log.warn({ containerDbId, rule: rule.join(' '), error: msg }, 'Failed to apply iptables rule');
          }
        }
      }

      // Jump from DOCKER-USER into our per-container chain
      await this.iptables(['-I', 'DOCKER-USER', '-s', containerIp, '-j', chainName]);

      log.info({
        containerDbId,
        containerIp,
        chainName,
        proxyTarget: `${PROXY_SUBNET}:${PROXY_PORT}`,
        rulesApplied: applied,
      }, 'Proxy-mode egress rules applied');

    } catch (err) {
      // Don't fail container start — egress is defense-in-depth
      log.error({
        containerDbId,
        error: (err as Error).message,
      }, 'Failed to apply egress rules — container will have unrestricted network');
    }
  }

  /**
   * Remove egress rules for a container (cleanup on stop/destroy).
   * Removes the per-container chain and the DOCKER-USER jump rule.
   * 
   * @param containerId - Docker container ID
   * @param containerDbId - Database container ID (for logging)
   */
  async removeEgressRules(containerId: string, containerDbId: string): Promise<void> {
    if (!EGRESS_ENABLED) return;

    try {
      // Get container IP (may fail if container is already stopped)
      const containerIp = await this.getContainerIp(containerId);
      if (!containerIp) {
        log.debug({ containerDbId }, 'Container has no IP — skipping egress rule cleanup');
        return;
      }

      const chainName = this.getChainName(containerIp);
      await this.cleanupChain(chainName, containerIp);
      log.info({ containerDbId, containerIp, chainName }, 'Egress rules removed');

    } catch (err) {
      log.debug({ containerDbId, error: (err as Error).message }, 'Egress rule cleanup failed');
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  /**
   * Generate a deterministic chain name from a container IP.
   * e.g., 172.20.0.2 → 2BOT-172-20-0-2
   */
  private getChainName(containerIp: string): string {
    return `2BOT-${containerIp.replace(/\./g, '-')}`;
  }

  /**
   * Clean up a per-container chain and its DOCKER-USER jump rule.
   * Safe to call even if the chain doesn't exist.
   */
  private async cleanupChain(chainName: string, containerIp: string): Promise<void> {
    // 1. Remove jump rule from DOCKER-USER (may not exist)
    try {
      await this.iptables(['-D', 'DOCKER-USER', '-s', containerIp, '-j', chainName]);
    } catch {
      // Jump rule doesn't exist — OK
    }

    // 2. Flush the chain (remove all rules inside it)
    try {
      await this.iptables(['-F', chainName]);
    } catch {
      // Chain doesn't exist — OK
    }

    // 3. Delete the chain
    try {
      await this.iptables(['-X', chainName]);
    } catch {
      // Chain doesn't exist — OK
    }
  }

  /**
   * Execute an iptables command via sudo.
   */
  private async iptables(args: string[]): Promise<void> {
    await execFileAsync('sudo', ['iptables', ...args], {
      timeout: 10_000,
    });
  }

  /**
   * Get the IP address of a container (returns null if not available)
   */
  private async getContainerIp(containerId: string): Promise<string | null> {
    try {
      const info = await dockerService.inspectContainer(containerId);
      return info.ipAddress ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check if iptables is available on the host
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.iptables(['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const networkEgressService = new NetworkEgressService();
