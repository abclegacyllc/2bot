/**
 * Workspace Module
 * 
 * Docker-based workspace system for plugin development and execution (Phase 13).
 * Provides each user with an isolated container for:
 * - File management (CRUD, upload/download)
 * - Plugin execution (start/stop/restart)
 * - Git operations (clone, pull, status)
 * - Package management (npm install/uninstall)
 * - Terminal sessions (PTY)
 * - Real-time log streaming
 * 
 * Supports both PERSONAL and ORGANIZATION workspaces.
 * 
 * @module modules/workspace
 */

export const WORKSPACE_MODULE = 'workspace' as const;

// Types
export * from './workspace.types';

// Validation
export * from './workspace.validation';

// Constants
export * from './workspace.constants';

// Services
export { workspaceBackupService } from './backup.service';
export { BridgeClient, bridgeClientManager } from './bridge-client.service';
export { SERVER_INSTANCE_ID, bridgeLeaseService } from './bridge-lease.service';
export { containerLifecycleService } from './container-lifecycle.service';
export { dockerService } from './docker.service';
export { egressProxyService } from './egress-proxy.service';
export { gatewayRouteService } from './gateway-route.service';
export { workspaceMetricsService } from './metrics.service';
export { networkEgressService } from './network-egress.service';
export { workspaceService } from './workspace.service';

