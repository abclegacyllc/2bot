/**
 * Workspace Module Types
 * 
 * Internal types for the workspace module (Phase 13).
 * Public/shared types live in src/shared/types/workspace.ts.
 * These types are for module-internal use (service layer, DB queries, etc.)
 * 
 * @module modules/workspace/workspace.types
 */

import type { WorkspaceResourceAllocation } from '@/shared/types/workspace';
import type { ContainerStatus as PrismaContainerStatus, WorkspaceOwnerType as PrismaOwnerType } from '@prisma/client';

// ===========================================
// Container Creation
// ===========================================

/** Input for creating a new workspace container */
export interface CreateContainerInput {
  userId: string;
  organizationId?: string;
  ownerType: PrismaOwnerType;
  containerName: string;
  resources: WorkspaceResourceAllocation;
  autoStopMinutes?: number;
  imageName?: string;
}

/** Docker container creation options (passed to dockerode) */
export interface DockerCreateOptions {
  name: string;
  image: string;
  ramMb: number;
  cpuCores: number;
  storageMb: number;
  volumePath: string;
  bridgeAuthToken: string;
  networkName: string;
  labels: Record<string, string>;
  env: Record<string, string>;
}

/** Result from Docker container inspection */
export interface DockerContainerInfo {
  containerId: string;
  status: string;
  ipAddress?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  running: boolean;
  health?: string;
}

// ===========================================
// Bridge Communication
// ===========================================

/** Bridge connection state */
export interface BridgeConnectionState {
  containerId: string;
  containerDbId: string;
  wsUrl: string;
  connected: boolean;
  lastPing?: Date;
  reconnectAttempts: number;
}

/** Pending request waiting for bridge response */
export interface PendingBridgeRequest {
  id: string;
  action: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  createdAt: number;
}

// ===========================================
// Lifecycle Management
// ===========================================

/** Container health check result */
export interface HealthCheckResult {
  containerId: string;
  healthy: boolean;
  uptime?: number;
  memory?: {
    usedMb: number;
    totalMb: number;
    percent: number;
  };
  disk?: {
    usedMb: number;
    totalMb: number;
    percent: number;
  };
  lastCheck: Date;
}

/** Auto-stop check result */
export interface IdleCheckResult {
  containerId: string;
  containerDbId: string;
  idleMinutes: number;
  autoStopMinutes: number;
  shouldStop: boolean;
}

/** Container restart decision */
export interface RestartDecision {
  containerDbId: string;
  shouldRestart: boolean;
  reason: string;
  currentRestarts: number;
  maxRestarts: number;
}

// ===========================================
// Resource Checking
// ===========================================

/** Resource availability check result */
export interface ResourceCheckResult {
  allowed: boolean;
  reason?: string;
  available: WorkspaceResourceAllocation;
  requested: WorkspaceResourceAllocation;
}

/** Org pool usage summary */
export interface OrgPoolUsage {
  organizationId: string;
  totalPool: WorkspaceResourceAllocation;
  allocated: WorkspaceResourceAllocation;
  available: WorkspaceResourceAllocation;
  containerCount: number;
  runningCount: number;
}

// ===========================================
// Service Response Types
// ===========================================

/** Standard workspace operation result */
export interface WorkspaceOperationResult {
  success: boolean;
  message: string;
  containerId?: string;
  status?: PrismaContainerStatus;
  error?: string;
}

/** Workspace list item (for admin/org views) */
export interface WorkspaceListItem {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  organizationId?: string;
  ownerType: PrismaOwnerType;
  containerName: string;
  status: PrismaContainerStatus;
  resources: WorkspaceResourceAllocation;
  startedAt?: Date;
  stoppedAt?: Date;
  lastActivityAt?: Date;
  createdAt: Date;
}

// ===========================================
// Event Types (internal)
// ===========================================

/** Events emitted by workspace services */
export type WorkspaceEvent =
  | { type: 'container.created'; containerId: string; userId: string }
  | { type: 'container.started'; containerId: string; userId: string }
  | { type: 'container.stopped'; containerId: string; userId: string; reason: string }
  | { type: 'container.error'; containerId: string; userId: string; error: string }
  | { type: 'container.destroyed'; containerId: string; userId: string }
  | { type: 'health.warning'; containerId: string; warning: string }
  | { type: 'resource.oom'; containerId: string; memoryPercent: number }
  | { type: 'resource.disk-full'; containerId: string; diskPercent: number };
