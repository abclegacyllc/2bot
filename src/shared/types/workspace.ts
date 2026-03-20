/**
 * Workspace Types
 * 
 * Types for the Docker-based workspace system (Phase 13).
 * Supports both PERSONAL and ORGANIZATION workspaces.
 * 
 * ============================================================
 * KEY DIFFERENCE: Personal vs Org Workspaces
 * ============================================================
 * 
 * PERSONAL WORKSPACE:
 *   - One container per user
 *   - Resources from user's plan/addons (workspaceRamMb, etc.)
 *   - User pays directly
 *   - Container name: "ws-{userId}"
 * 
 * ORGANIZATION WORKSPACE:
 *   - One container per member (who needs workspace)
 *   - Resources drawn from org's workspacePool
 *   - Subject to DeptAllocation → MemberAllocation limits
 *   - Org admin controls who gets workspace access
 *   - Container name: "ws-{orgSlug}-{userId}"
 * 
 * ============================================================
 * 
 * @module shared/types/workspace
 */

// ===========================================
// Container Status & Lifecycle
// ===========================================

/** Container status (mirrors Prisma enum) */
export type ContainerStatus =
  | 'CREATING'
  | 'STARTING'
  | 'RUNNING'
  | 'STOPPING'
  | 'STOPPED'
  | 'ERROR'
  | 'DESTROYED';

/** Workspace owner type (mirrors Prisma enum) */
export type WorkspaceOwnerType = 'PERSONAL' | 'ORGANIZATION';

/** Full workspace status returned by API */
export interface WorkspaceStatus {
  /** Container database ID */
  id: string;
  /** Container status */
  status: ContainerStatus;
  /** Owner type */
  ownerType: WorkspaceOwnerType;
  /** Organization slug (if org workspace) */
  orgSlug?: string;
  /** Error message if status is ERROR */
  errorMessage?: string;
  /** Allocated resources */
  resources: WorkspaceResourceAllocation;
  /** Current resource usage (live from container) */
  usage?: WorkspaceResourceUsage;
  /** Running plugins */
  runningPlugins: WorkspacePluginProcess[];
  /** Lifecycle timestamps */
  startedAt?: string;
  stoppedAt?: string;
  lastActivityAt?: string;
  createdAt: string;
  /** Auto-stop configuration */
  autoStopMinutes?: number;
  /** Container internal IP (for debugging) */
  ipAddress?: string;
  /** Health info */
  healthCheckFails: number;
  restartCount: number;
}

/** Resources allocated to this workspace */
export interface WorkspaceResourceAllocation {
  ramMb: number;
  cpuCores: number;
  storageMb: number;
}

/** Live resource usage from container (from bridge agent stats) */
export interface WorkspaceResourceUsage {
  ramUsedMb: number;
  ramPercentage: number;
  cpuPercentage: number;
  storageUsedMb: number;
  storagePercentage: number;
}

// ===========================================
// File System
// ===========================================

/** File type */
export type WorkspaceFileType = 'FILE' | 'DIRECTORY';

/** File entry returned by file manager */
export interface WorkspaceFileEntry {
  /** File/folder name */
  name: string;
  /** Human-readable display name (e.g. bot name instead of gateway ID) */
  displayName?: string;
  /** Full path inside container */
  path: string;
  /** File or directory */
  type: WorkspaceFileType;
  /** Size in bytes (0 for directories) */
  sizeBytes: number;
  /** MIME type (null for directories) */
  mimeType?: string;
  /** Whether this file is registered as a runnable plugin */
  isPlugin: boolean;
  /** Plugin status (if isPlugin) */
  pluginStatus?: 'running' | 'stopped' | 'error';
  /** How this file got here */
  source: FileSource;
  /** Source URL (e.g., GitHub repo URL) */
  sourceUrl?: string;
  /** Last modified timestamp */
  updatedAt: string;
  /** Children (for directory listings) */
  children?: WorkspaceFileEntry[];
}

/** How a file was created/imported */
export type FileSource = 'upload' | 'ai-generated' | 'github-import' | 'plugin-store' | 'manual';

/** Request to write a file */
export interface WriteFileRequest {
  path: string;
  content: string;
  /** If true, create parent directories */
  createDirs?: boolean;
}

/** Request to upload file(s) */
export interface UploadFileRequest {
  /** Target directory path */
  targetDir: string;
}

// ===========================================
// Plugin Management (within workspace)
// ===========================================

/** A plugin process running inside the container */
export interface WorkspacePluginProcess {
  /** File path of the plugin */
  file: string;
  /** Plugin display name (from metadata or filename) */
  name: string;
  /** Human-readable display name enriched from DB (Plugin.name) */
  displayName?: string;
  /** Process ID inside container */
  pid: number;
  /** Process status */
  status: 'running' | 'stopped' | 'error' | 'starting' | 'crashed';
  /** Uptime in seconds */
  uptimeSeconds?: number;
  /** Memory used by this process in MB */
  memoryMb?: number;
  /** Last error message */
  lastError?: string;
  /** When this plugin was started */
  startedAt?: string;
}

/** Request to start a plugin in workspace */
export interface StartPluginRequest {
  /** Path to plugin file (relative to /workspace) */
  file: string;
  /** Optional environment variables */
  env?: Record<string, string>;
}

/** Request to stop a plugin */
export interface StopPluginRequest {
  /** Path to plugin file or PID */
  fileOrPid: string | number;
  /** Force kill (SIGKILL vs SIGTERM) */
  force?: boolean;
}

// ===========================================
// Git Operations
// ===========================================

/** Request to clone a Git repository */
export interface GitCloneRequest {
  /** Repository URL (https only for security) */
  url: string;
  /** Target directory inside /workspace (default: /workspace/imports/{repo-name}) */
  targetDir?: string;
  /** Branch to checkout (default: main/master) */
  branch?: string;
  /** Shallow clone depth (default: 1 for space savings) */
  depth?: number;
}

/** Git clone result */
export interface GitCloneResult {
  success: boolean;
  /** Target directory where repo was cloned */
  targetDir: string;
  /** Files cloned */
  fileCount: number;
  /** Total size in bytes */
  totalSizeBytes: number;
  /** Branch checked out */
  branch: string;
  /** Error message if failed */
  error?: string;
}

// ===========================================
// Package Management
// ===========================================

/** Request to install npm packages */
export interface PackageInstallRequest {
  /** Package names (e.g., ["axios", "lodash"]) */
  packages: string[];
  /** Install as devDependency */
  dev?: boolean;
  /** Working directory (default: /workspace) */
  cwd?: string;
}

/** Package install result */
export interface PackageInstallResult {
  success: boolean;
  /** Packages that were installed */
  installed: string[];
  /** Packages that failed (blocked or error) */
  failed: Array<{ package: string; reason: string }>;
  /** Total node_modules size after install */
  nodeModulesSizeMb?: number;
}

/** Blocked packages that could be dangerous in a container */
export const BLOCKED_PACKAGES = [
  'child_process',  // Already available in Node.js but shouldn't be used as npm pkg
  'node-gyp',       // Native compilation (security risk)
  'node-pre-gyp',   // Native binaries
  'prebuild',       // Native binaries
] as const;

// ===========================================
// Terminal
// ===========================================

/** Terminal session info */
export interface TerminalSession {
  /** Session ID */
  id: string;
  /** Container ID */
  containerId: string;
  /** Terminal dimensions */
  cols: number;
  rows: number;
  /** Whether session is active */
  isActive: boolean;
  /** Created timestamp */
  createdAt: string;
}

/** Terminal resize message */
export interface TerminalResize {
  cols: number;
  rows: number;
}

// ===========================================
// Log Viewer
// ===========================================

/** Log entry from container */
export interface WorkspaceLogEntry {
  id: string;
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Source system */
  source: 'system' | 'bridge' | 'plugin' | 'terminal' | 'git' | 'npm';
  /** Log message */
  message: string;
  /** Structured metadata */
  metadata?: Record<string, unknown>;
  /** Source plugin file (if from plugin) */
  pluginFile?: string;
  /** Timestamp */
  createdAt: string;
}

/** Log query parameters */
export interface WorkspaceLogQuery {
  /** Filter by log level */
  level?: string;
  /** Filter by source */
  source?: string;
  /** Filter by plugin file */
  pluginFile?: string;
  /** Search in message text */
  search?: string;
  /** Pagination cursor */
  cursor?: string;
  /** Results per page */
  limit?: number;
  /** Order */
  order?: 'asc' | 'desc';
}

// ===========================================
// Bridge Agent Protocol
// ===========================================
// Messages sent between platform WebSocket and bridge agent inside container

/** Message from platform to bridge agent */
export interface BridgeRequest {
  /** Unique request ID for response matching */
  id: string;
  /** Action to perform */
  action: BridgeAction;
  /** Action-specific payload */
  payload: Record<string, unknown>;
}

/** All actions the bridge agent supports */
export type BridgeAction =
  // File operations
  | 'file.list'
  | 'file.read'
  | 'file.write'
  | 'file.writeMulti'
  | 'file.delete'
  | 'file.mkdir'
  | 'file.rename'
  | 'file.upload'
  | 'file.download'
  | 'file.stat'
  // Plugin operations
  | 'plugin.start'
  | 'plugin.stop'
  | 'plugin.restart'
  | 'plugin.list'
  | 'plugin.logs'
  | 'plugin.validate'
  | 'plugin.event'
  // Git operations
  | 'git.clone'
  | 'git.pull'
  | 'git.status'
  // Package operations
  | 'package.install'
  | 'package.uninstall'
  | 'package.list'
  | 'package.audit'
  // Terminal operations
  | 'terminal.create'
  | 'terminal.input'
  | 'terminal.resize'
  | 'terminal.close'
  // System operations
  | 'system.stats'
  | 'system.health'
  | 'system.logs'
  // Storage operations (platform-initiated)
  | 'storage.stats'
  | 'storage.clearPlugin'
  | 'storage.deletePluginDb'
  | 'storage.setQuota';

/** Response from bridge agent to platform */
export interface BridgeResponse {
  /** Matching request ID */
  id: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Result data (action-specific) */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}

/** Bridge agent event (unsolicited, pushed from agent) */
export interface BridgeEvent {
  /** Event type */
  event: BridgeEventType;
  /** Event data */
  data: unknown;
}

/** Events the bridge agent can push without being asked */
export type BridgeEventType =
  | 'plugin.started'
  | 'plugin.stopped'
  | 'plugin.crashed'
  | 'plugin.log'
  | 'terminal.output'
  | 'terminal.exit'
  | 'system.stats'
  | 'system.oom'        // Out of memory warning
  | 'system.disk-full'  // Storage limit approaching
  | 'health.check';

// ===========================================
// Workspace API Response Types
// ===========================================

/** Workspace create/start response */
export interface WorkspaceActionResponse {
  success: boolean;
  status: ContainerStatus;
  message: string;
  containerId?: string;
}

/** Response for org workspace list (admin view) */
export interface OrgWorkspaceListItem {
  containerId: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: ContainerStatus;
  resources: WorkspaceResourceAllocation;
  usage?: WorkspaceResourceUsage;
  startedAt?: string;
  lastActivityAt?: string;
}

/** Org workspace pool usage summary */
export interface OrgWorkspacePoolSummary {
  /** Total allocated from pool plan */
  total: WorkspaceResourceAllocation;
  /** Currently allocated to member containers */
  allocated: WorkspaceResourceAllocation;
  /** Currently running (active usage) */
  running: WorkspaceResourceAllocation;
  /** Available to allocate */
  available: WorkspaceResourceAllocation;
  /** Number of containers by status */
  containerCounts: Record<ContainerStatus, number>;
}
