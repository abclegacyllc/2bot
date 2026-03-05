/**
 * Workspace Constants
 * 
 * Configuration constants for the workspace module (Phase 13).
 * 
 * @module modules/workspace/workspace.constants
 */

// ===========================================
// Docker Configuration
// ===========================================

/** Default Docker image for workspace containers */
export const WORKSPACE_IMAGE = '2bot-workspace:latest';

/** Docker network for workspace containers */
export const WORKSPACE_NETWORK = '2bot-workspace-net';

/** Volume base path on host for persistent workspace storage */
export const WORKSPACE_VOLUME_BASE = process.env.WORKSPACE_VOLUME_BASE || '/var/lib/2bot/workspaces';

/** Bridge agent port inside container (always 9000) */
export const BRIDGE_PORT = 9000;

/** Bridge agent WebSocket path */
export const BRIDGE_WS_PATH = '/ws';

// ===========================================
// Container Naming
// ===========================================

/** Generate container name for personal workspace */
export function personalContainerName(userId: string): string {
  return `ws-${userId}`;
}

/** Generate container name for org workspace */
export function orgContainerName(orgSlug: string, userId: string): string {
  return `ws-${orgSlug}-${userId}`;
}

/** Generate volume path for a container */
export function containerVolumePath(containerName: string): string {
  return `${WORKSPACE_VOLUME_BASE}/${containerName}`;
}

// ===========================================
// Timeouts & Intervals
// ===========================================

/** Bridge request timeout (ms) — how long to wait for bridge agent response */
export const BRIDGE_REQUEST_TIMEOUT = 30_000;

/** Long-running bridge request timeout (ms) — git clone, npm install */
export const BRIDGE_LONG_REQUEST_TIMEOUT = 180_000;

/** WebSocket reconnect delay base (ms) — exponential backoff */
export const WS_RECONNECT_BASE_DELAY = 1_000;

/** Max WebSocket reconnect attempts before marking container ERROR */
export const WS_MAX_RECONNECT_ATTEMPTS = 10;

/** Health check interval (ms) */
export const HEALTH_CHECK_INTERVAL = 30_000;

/** Idle check interval (ms) — how often to check for idle containers */
export const IDLE_CHECK_INTERVAL = 60_000;

/** Default auto-stop timeout (minutes) — null means disabled (paid users) */
export const DEFAULT_AUTO_STOP_MINUTES: number | null = null;

/** Free-tier auto-stop timeout (minutes) — 24 hours of inactivity */
export const FREE_TIER_AUTO_STOP_MINUTES = 1440;

/** Container creation timeout (ms) — max time to wait for container to start */
export const CONTAINER_START_TIMEOUT = 60_000;

/** Container stop timeout (seconds) — grace period before SIGKILL */
export const CONTAINER_STOP_TIMEOUT = 10;

// ===========================================
// Resource Defaults
// ===========================================

/** Default resources for workspace if plan lookup fails */
export const DEFAULT_RESOURCES = {
  ramMb: 1024,
  cpuCores: 0.5,
  storageMb: 10240,
} as const;

/** Minimum resources for any workspace */
export const MIN_RESOURCES = {
  ramMb: 256,
  cpuCores: 0.25,
  storageMb: 1024,
} as const;

// ===========================================
// Health & Restart
// ===========================================

/** Max consecutive health check failures before marking ERROR */
export const MAX_HEALTH_FAILURES = 5;

/** Max automatic restarts before giving up */
export const MAX_AUTO_RESTARTS = 5;

/** Restart cooldown (ms) — min time between automatic restarts */
export const RESTART_COOLDOWN = 30_000;

// ===========================================
// Security
// ===========================================

/** Length of generated bridge auth tokens */
export const BRIDGE_AUTH_TOKEN_LENGTH = 64;

/** Docker container labels */
export const CONTAINER_LABELS = {
  managed: '2bot.managed',
  userId: '2bot.user-id',
  orgId: '2bot.org-id',
  ownerType: '2bot.owner-type',
  containerDbId: '2bot.container-db-id',
} as const;

// ===========================================
// Long-Running Actions (use extended timeout)
// ===========================================

/** Actions that need longer timeouts */
export const LONG_RUNNING_ACTIONS = new Set([
  'git.clone',
  'git.pull',
  'package.install',
  'package.uninstall',
]);
