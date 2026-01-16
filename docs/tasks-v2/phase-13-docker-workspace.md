# Phase 13: Docker Workspace Isolation (V2)

> **Owner:** Platform Team
> **Priority:** P2 (Security Hardening)
> **Total Estimated Time:** 18-22 hours
> **Prerequisites:** Phase 3 (Plugin System), Phase 11 (Developer Dashboard)
>
> **Value:** Complete process isolation for plugin execution with per-user containers

---

## Overview

Phase 13 implements Docker-based workspace isolation where each user (or organization) gets their own container for running plugins. This provides maximum security isolation compared to worker threads.

### Why Docker Workspaces?

| Isolation Level | Crash Impact | Memory Isolation | CPU Isolation | Security |
|----------------|--------------|------------------|---------------|----------|
| None (V0) | Server crash | Shared | Shared | ❌ None |
| Worker Threads (V1) | Thread crash | Partial | Shared | ⚡ Basic |
| **Docker (V2)** | Container restart | **Full** | **Full** | ✅ **Full** |

### Architecture

```
┌────────────────────────────────────────────────────┐
│                    2Bot Main Server                 │
│  ┌──────────────────────────────────────────────┐  │
│  │              Workspace Manager                │  │
│  │   - Container lifecycle                       │  │
│  │   - Request routing                           │  │
│  │   - Health monitoring                         │  │
│  └──────────────────────────────────────────────┘  │
│              │              │              │        │
│              ▼              ▼              ▼        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │  Workspace   │ │  Workspace   │ │  Workspace   ││
│  │   User-A     │ │   User-B     │ │   Org-XYZ    ││
│  │  (Container) │ │  (Container) │ │  (Container) ││
│  │  ┌────────┐  │ │  ┌────────┐  │ │  ┌────────┐  ││
│  │  │Plugins │  │ │  │Plugins │  │ │  │Plugins │  ││
│  │  └────────┘  │ │  └────────┘  │ │  └────────┘  ││
│  │  Port: 3001  │ │  Port: 3002  │ │  Port: 3003  ││
│  └──────────────┘ └──────────────┘ └──────────────┘│
└────────────────────────────────────────────────────┘
```

---

## Task Summary

| Task | Description | Est. Time | Dependencies |
|------|-------------|-----------|--------------|
| 13.1.1 | Workspace container image | 3h | None |
| 13.1.2 | Workspace Manager service | 4h | 13.1.1 |
| 13.1.3 | Container lifecycle (create/destroy) | 3h | 13.1.2 |
| 13.1.4 | Request routing to containers | 2h | 13.1.3 |
| 13.2.1 | Resource limits (CPU/memory) | 2h | 13.1.3 |
| 13.2.2 | Health monitoring + auto-restart | 2h | 13.2.1 |
| 13.2.3 | Plugin code sync to containers | 2h | 13.1.3 |
| 13.3.1 | Workspace status dashboard | 2h | 13.2.2 |
| 13.3.2 | Resource usage metrics | 2h | 13.2.1 |

---

## Section 13.1: Workspace Infrastructure

### Task 13.1.1: Create Workspace Container Image

**Session Type:** DevOps
**Estimated Time:** 3 hours
**Prerequisites:** None

#### Deliverables:
- [ ] docker/workspace/Dockerfile
- [ ] docker/workspace/entrypoint.sh
- [ ] Minimal Node.js runtime for plugins

#### Dockerfile:
```dockerfile
# docker/workspace/Dockerfile

FROM node:20-alpine

# Security: Run as non-root
RUN addgroup -g 1001 workspace && \
    adduser -D -u 1001 -G workspace workspace

# Install only what plugins need
RUN apk add --no-cache dumb-init

WORKDIR /app

# Plugin executor runtime
COPY --chown=workspace:workspace workspace-runtime/ ./

# Install production deps only
RUN npm ci --only=production && \
    npm cache clean --force

USER workspace

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
```

#### Workspace Runtime:
```typescript
// docker/workspace/workspace-runtime/server.js

const http = require("http");
const { executePlugin } = require("./executor");

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", uptime: process.uptime() }));
    return;
  }
  
  // Plugin execution
  if (req.method === "POST" && req.url === "/execute") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { plugin, input, context } = JSON.parse(body);
        const result = await executePlugin(plugin, input, context);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          success: false, 
          error: error.message 
        }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end("Not Found");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Workspace runtime listening on port ${PORT}`);
});
```

#### Done Criteria:
- [ ] Docker image builds successfully
- [ ] Image size < 200MB
- [ ] Health check works
- [ ] Plugin execution endpoint functional
- [ ] Runs as non-root user

---

### Task 13.1.2: Create Workspace Manager Service

**Session Type:** Backend
**Estimated Time:** 4 hours
**Prerequisites:** Task 13.1.1 complete

#### Deliverables:
- [ ] src/modules/workspace/workspace.service.ts
- [ ] src/modules/workspace/workspace.types.ts
- [ ] Container orchestration logic

#### Types:
```typescript
// src/modules/workspace/workspace.types.ts

export interface WorkspaceConfig {
  userId: string;
  organizationId?: string;
  memoryLimitMb: number;    // Default: 256
  cpuLimit: number;         // Default: 0.5 (50% of 1 CPU)
  timeoutSeconds: number;   // Default: 300 (5 min idle)
}

export interface WorkspaceInstance {
  id: string;
  containerId: string;
  userId: string;
  organizationId?: string;
  port: number;
  status: WorkspaceStatus;
  createdAt: Date;
  lastActivityAt: Date;
  resourceUsage: ResourceUsage;
}

export type WorkspaceStatus = 
  | "CREATING" 
  | "RUNNING" 
  | "PAUSED" 
  | "STOPPED" 
  | "ERROR";

export interface ResourceUsage {
  memoryMb: number;
  cpuPercent: number;
  networkInBytes: number;
  networkOutBytes: number;
}
```

#### Service:
```typescript
// src/modules/workspace/workspace.service.ts

import Docker from "dockerode";

const docker = new Docker();
const workspaces = new Map<string, WorkspaceInstance>();

export class WorkspaceService {
  private static BASE_PORT = 4000;
  private static nextPort = WorkspaceService.BASE_PORT;
  
  static getWorkspaceKey(userId: string, organizationId?: string): string {
    return organizationId ? `org:${organizationId}` : `user:${userId}`;
  }
  
  async getOrCreateWorkspace(
    userId: string,
    organizationId?: string
  ): Promise<WorkspaceInstance> {
    const key = WorkspaceService.getWorkspaceKey(userId, organizationId);
    
    // Return existing workspace if running
    const existing = workspaces.get(key);
    if (existing && existing.status === "RUNNING") {
      existing.lastActivityAt = new Date();
      return existing;
    }
    
    // Create new workspace
    return this.createWorkspace({ 
      userId, 
      organizationId,
      memoryLimitMb: 256,
      cpuLimit: 0.5,
      timeoutSeconds: 300,
    });
  }
  
  async createWorkspace(config: WorkspaceConfig): Promise<WorkspaceInstance> {
    const port = WorkspaceService.nextPort++;
    const key = WorkspaceService.getWorkspaceKey(config.userId, config.organizationId);
    
    const container = await docker.createContainer({
      Image: "2bot-workspace:latest",
      name: `workspace-${key.replace(":", "-")}`,
      ExposedPorts: { "3000/tcp": {} },
      HostConfig: {
        PortBindings: { "3000/tcp": [{ HostPort: String(port) }] },
        Memory: config.memoryLimitMb * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: Math.floor(config.cpuLimit * 100000),
        RestartPolicy: { Name: "on-failure", MaximumRetryCount: 3 },
        NetworkMode: "bridge",
        AutoRemove: false,
      },
      Env: [
        `WORKSPACE_USER_ID=${config.userId}`,
        `WORKSPACE_ORG_ID=${config.organizationId || ""}`,
      ],
    });
    
    await container.start();
    
    const instance: WorkspaceInstance = {
      id: key,
      containerId: container.id,
      userId: config.userId,
      organizationId: config.organizationId,
      port,
      status: "RUNNING",
      createdAt: new Date(),
      lastActivityAt: new Date(),
      resourceUsage: { memoryMb: 0, cpuPercent: 0, networkInBytes: 0, networkOutBytes: 0 },
    };
    
    workspaces.set(key, instance);
    return instance;
  }
  
  async stopWorkspace(key: string): Promise<void> {
    const workspace = workspaces.get(key);
    if (!workspace) return;
    
    try {
      const container = docker.getContainer(workspace.containerId);
      await container.stop({ t: 10 });
      await container.remove();
    } catch (error) {
      console.error(`Failed to stop workspace ${key}:`, error);
    }
    
    workspaces.delete(key);
  }
  
  async executeInWorkspace(
    userId: string,
    organizationId: string | undefined,
    plugin: unknown,
    input: unknown,
    context: unknown
  ): Promise<unknown> {
    const workspace = await this.getOrCreateWorkspace(userId, organizationId);
    
    const response = await fetch(`http://localhost:${workspace.port}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plugin, input, context }),
    });
    
    workspace.lastActivityAt = new Date();
    return response.json();
  }
}

export const workspaceService = new WorkspaceService();
```

#### Done Criteria:
- [ ] Can create workspace containers
- [ ] Per-user/org isolation working
- [ ] Port allocation working
- [ ] Resource limits applied
- [ ] Container cleanup on stop

---

### Task 13.1.3: Container Lifecycle Management

**Session Type:** Backend
**Estimated Time:** 3 hours
**Prerequisites:** Task 13.1.2 complete

#### Deliverables:
- [ ] Idle workspace cleanup (auto-stop after timeout)
- [ ] Workspace resume on demand
- [ ] Graceful shutdown handling

#### Implementation:
```typescript
// src/modules/workspace/workspace.lifecycle.ts

import { workspaceService } from "./workspace.service";

// Check for idle workspaces every minute
const IDLE_CHECK_INTERVAL = 60 * 1000;
const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function startIdleWorkspaceCleanup(): void {
  setInterval(async () => {
    const now = Date.now();
    
    for (const [key, workspace] of workspaceService.getAllWorkspaces()) {
      const idleTime = now - workspace.lastActivityAt.getTime();
      
      if (idleTime > DEFAULT_IDLE_TIMEOUT) {
        console.log(`Stopping idle workspace: ${key} (idle for ${idleTime}ms)`);
        await workspaceService.stopWorkspace(key);
      }
    }
  }, IDLE_CHECK_INTERVAL);
}

// Graceful shutdown - stop all workspaces
export async function shutdownAllWorkspaces(): Promise<void> {
  console.log("Shutting down all workspaces...");
  
  const shutdownPromises = [];
  for (const [key] of workspaceService.getAllWorkspaces()) {
    shutdownPromises.push(workspaceService.stopWorkspace(key));
  }
  
  await Promise.allSettled(shutdownPromises);
  console.log("All workspaces stopped");
}

// Register shutdown handlers
process.on("SIGTERM", async () => {
  await shutdownAllWorkspaces();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await shutdownAllWorkspaces();
  process.exit(0);
});
```

#### Done Criteria:
- [ ] Idle workspaces automatically stopped
- [ ] Workspaces resume on next request
- [ ] Graceful shutdown stops all containers
- [ ] No orphan containers on server restart

---

### Task 13.1.4: Request Routing to Containers

**Session Type:** Backend
**Estimated Time:** 2 hours
**Prerequisites:** Task 13.1.3 complete

#### Deliverables:
- [ ] Integration with plugin executor
- [ ] Fallback to worker threads if Docker unavailable

#### Implementation:
```typescript
// src/modules/plugin/plugin.executor.ts (updated)

import { workspaceService } from "../workspace/workspace.service";
import { runInWorker } from "./plugin-worker";

const USE_DOCKER_WORKSPACES = process.env.PLUGIN_ISOLATION === "docker";

export async function executePlugin(
  plugin: Plugin,
  userPlugin: UserPlugin,
  input: unknown,
  context: ExecutionContext
): Promise<PluginResult> {
  // Use Docker workspaces if enabled (V2)
  if (USE_DOCKER_WORKSPACES) {
    try {
      return await workspaceService.executeInWorkspace(
        userPlugin.userId,
        userPlugin.organizationId,
        plugin,
        input,
        context
      );
    } catch (error) {
      console.error("Docker workspace execution failed, falling back to worker", error);
      // Fall through to worker threads
    }
  }
  
  // Default: Worker threads (V1)
  return runInWorker(plugin, userPlugin, input, context);
}
```

#### Done Criteria:
- [ ] Plugin execution routes to Docker when enabled
- [ ] Fallback to worker threads on Docker failure
- [ ] Environment variable controls isolation mode

---

## Section 13.2: Resource Management & Monitoring

### Task 13.2.1: Resource Limits Configuration

**Session Type:** Backend
**Estimated Time:** 2 hours
**Prerequisites:** Task 13.1.3 complete

#### Deliverables:
- [ ] Per-plan resource limits
- [ ] Database model for workspace quotas
- [ ] Enforcement in workspace creation

#### Resource Limits by Plan:
```typescript
// src/modules/workspace/workspace.limits.ts

export interface WorkspaceQuota {
  memoryLimitMb: number;
  cpuLimit: number;
  maxConcurrentWorkspaces: number;
  idleTimeoutSeconds: number;
}

export const PLAN_QUOTAS: Record<string, WorkspaceQuota> = {
  FREE: {
    memoryLimitMb: 128,
    cpuLimit: 0.25,
    maxConcurrentWorkspaces: 1,
    idleTimeoutSeconds: 60,  // 1 minute
  },
  PRO: {
    memoryLimitMb: 512,
    cpuLimit: 1.0,
    maxConcurrentWorkspaces: 3,
    idleTimeoutSeconds: 300,  // 5 minutes
  },
  ENTERPRISE: {
    memoryLimitMb: 2048,
    cpuLimit: 2.0,
    maxConcurrentWorkspaces: 10,
    idleTimeoutSeconds: 1800,  // 30 minutes
  },
};

export function getQuotaForPlan(plan: string): WorkspaceQuota {
  return PLAN_QUOTAS[plan] || PLAN_QUOTAS.FREE;
}
```

#### Done Criteria:
- [ ] Resource limits defined per plan
- [ ] Limits enforced at container creation
- [ ] Exceeding quota returns error

---

### Task 13.2.2: Health Monitoring + Auto-Restart

**Session Type:** Backend
**Estimated Time:** 2 hours
**Prerequisites:** Task 13.2.1 complete

#### Deliverables:
- [ ] Health check polling for all workspaces
- [ ] Auto-restart unhealthy containers
- [ ] Health status exposed to dashboard

#### Implementation:
```typescript
// src/modules/workspace/workspace.health.ts

const HEALTH_CHECK_INTERVAL = 30 * 1000; // 30 seconds

export interface WorkspaceHealth {
  workspaceId: string;
  healthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  uptime: number;
}

const healthStatus = new Map<string, WorkspaceHealth>();

export function startHealthMonitoring(): void {
  setInterval(async () => {
    for (const [key, workspace] of workspaceService.getAllWorkspaces()) {
      const health = await checkWorkspaceHealth(workspace);
      healthStatus.set(key, health);
      
      if (!health.healthy && health.consecutiveFailures >= 3) {
        console.warn(`Workspace ${key} unhealthy, restarting...`);
        await restartWorkspace(key);
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

async function checkWorkspaceHealth(workspace: WorkspaceInstance): Promise<WorkspaceHealth> {
  const previous = healthStatus.get(workspace.id);
  
  try {
    const response = await fetch(`http://localhost:${workspace.port}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    
    const data = await response.json();
    
    return {
      workspaceId: workspace.id,
      healthy: response.ok,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      uptime: data.uptime || 0,
    };
  } catch (error) {
    return {
      workspaceId: workspace.id,
      healthy: false,
      lastCheck: new Date(),
      consecutiveFailures: (previous?.consecutiveFailures || 0) + 1,
      uptime: 0,
    };
  }
}

async function restartWorkspace(key: string): Promise<void> {
  const workspace = workspaceService.getWorkspace(key);
  if (!workspace) return;
  
  await workspaceService.stopWorkspace(key);
  await workspaceService.getOrCreateWorkspace(
    workspace.userId, 
    workspace.organizationId
  );
}

export function getHealthStatus(key: string): WorkspaceHealth | undefined {
  return healthStatus.get(key);
}

export function getAllHealthStatus(): Map<string, WorkspaceHealth> {
  return healthStatus;
}
```

#### Done Criteria:
- [ ] Health checks run every 30 seconds
- [ ] Unhealthy containers auto-restart
- [ ] Health status accessible via API
- [ ] Max 3 restart attempts before alerting

---

### Task 13.2.3: Plugin Code Sync to Containers

**Session Type:** Backend
**Estimated Time:** 2 hours
**Prerequisites:** Task 13.1.3 complete

#### Deliverables:
- [ ] Sync user's custom plugin code to container
- [ ] Hot reload on plugin updates
- [ ] Secure code injection prevention

#### Implementation:
```typescript
// src/modules/workspace/workspace.sync.ts

import Docker from "dockerode";

const docker = new Docker();

export async function syncPluginToWorkspace(
  workspaceId: string,
  pluginSlug: string,
  pluginCode: string
): Promise<void> {
  const workspace = workspaceService.getWorkspace(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  
  const container = docker.getContainer(workspace.containerId);
  
  // Create plugin file in container
  const pluginPath = `/app/plugins/${pluginSlug}.js`;
  
  // Use Docker exec to write file
  const exec = await container.exec({
    Cmd: ["sh", "-c", `cat > ${pluginPath}`],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
  });
  
  const stream = await exec.start({ hijack: true, stdin: true });
  stream.write(pluginCode);
  stream.end();
  
  // Notify workspace runtime to reload plugin
  await fetch(`http://localhost:${workspace.port}/reload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pluginSlug }),
  });
}
```

#### Done Criteria:
- [ ] Custom plugin code syncs to container
- [ ] Plugins hot reload without container restart
- [ ] Code validated before sync (no unsafe constructs)

---

## Section 13.3: Dashboard Integration

### Task 13.3.1: Workspace Status Dashboard

**Session Type:** Frontend
**Estimated Time:** 2 hours
**Prerequisites:** Task 13.2.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/admin/workspaces/page.tsx
- [ ] List all active workspaces
- [ ] Manual stop/restart controls

#### API Endpoints:
```typescript
// GET /api/admin/workspaces
// Returns: WorkspaceInstance[]

// POST /api/admin/workspaces/:id/stop
// POST /api/admin/workspaces/:id/restart
```

#### Done Criteria:
- [ ] Admin can see all workspaces
- [ ] Status, uptime, resource usage displayed
- [ ] Manual controls working
- [ ] Only accessible by admins

---

### Task 13.3.2: Resource Usage Metrics

**Session Type:** Backend/Frontend
**Estimated Time:** 2 hours
**Prerequisites:** Task 13.3.1 complete

#### Deliverables:
- [ ] Real-time resource usage polling
- [ ] Usage graphs in dashboard
- [ ] Per-user resource tracking

#### Implementation:
```typescript
// src/modules/workspace/workspace.metrics.ts

import Docker from "dockerode";

const docker = new Docker();

export async function getContainerStats(containerId: string): Promise<ResourceUsage> {
  const container = docker.getContainer(containerId);
  const stats = await container.stats({ stream: false });
  
  // Calculate CPU percentage
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                   stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - 
                      stats.precpu_stats.system_cpu_usage;
  const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
  
  // Memory usage
  const memoryMb = stats.memory_stats.usage / (1024 * 1024);
  
  return {
    memoryMb,
    cpuPercent,
    networkInBytes: stats.networks?.eth0?.rx_bytes || 0,
    networkOutBytes: stats.networks?.eth0?.tx_bytes || 0,
  };
}
```

#### Done Criteria:
- [ ] CPU/Memory metrics collected
- [ ] Network I/O tracked
- [ ] Metrics displayed in dashboard
- [ ] Historical data stored (last 24h)

---

## ✅ Phase 13 Completion Checklist

### Workspace Infrastructure
- [ ] Workspace Docker image created
- [ ] WorkspaceService implemented
- [ ] Container lifecycle management
- [ ] Request routing working

### Resource Management
- [ ] Per-plan resource limits
- [ ] Health monitoring + auto-restart
- [ ] Plugin code sync to containers

### Dashboard
- [ ] Workspace status page (admin)
- [ ] Resource usage metrics displayed

### Integration
- [ ] Plugin executor uses workspaces when enabled
- [ ] Fallback to worker threads working
- [ ] Environment variable controls isolation mode

### Security
- [ ] Containers run as non-root
- [ ] Network isolation between containers
- [ ] No host filesystem access
- [ ] Resource limits enforced

**When complete:** Update CURRENT-STATE.md, enable `PLUGIN_ISOLATION=docker` in production

---

## Environment Configuration

```bash
# .env (production)
PLUGIN_ISOLATION=docker        # "docker" | "worker" | "none"
WORKSPACE_BASE_PORT=4000
WORKSPACE_IMAGE=2bot-workspace:latest
```

## Migration Strategy

1. **Phase 1 (Now):** Worker threads (Task 3.2.2) - basic isolation
2. **Phase 2 (V2):** Docker workspaces - opt-in per organization
3. **Phase 3 (V2+):** Docker workspaces default for all new users
