# Phase 3: Plugin System

> **Goal:** Build plugin architecture and create 1 built-in analytics plugin
> **Estimated Sessions:** 8-10
> **Prerequisites:** Phase 2 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| 3.1.1 | Create Plugin + UserPlugin models | ⬜ | - |
| 3.1.2 | Create plugin types + validation | ⬜ | - |
| 3.1.3 | Create plugin service | ⬜ | - |
| 3.1.4 | Create plugin API endpoints | ⬜ | - |
| 3.2.1 | Create plugin interface/contract | ⬜ | - |
| 3.2.2 | Create plugin executor | ⬜ | - |
| 3.2.3 | Create plugin event system | ⬜ | - |
| 3.3.1 | Create Analytics plugin - data model | ⬜ | - |
| 3.3.2 | Create Analytics plugin - logic | ⬜ | - |
| 3.3.3 | Create Analytics plugin - UI widget | ⬜ | - |
| 3.4.1 | Create available plugins page | ⬜ | - |
| 3.4.2 | Create my plugins page | ⬜ | - |

---

## 📝 Detailed Tasks

### Task 3.1.1: Create Plugin + UserPlugin Models

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Phase 2 complete

#### Schema:
```prisma
// Plugin definitions (system-defined for V1)
model Plugin {
  id            String        @id @default(cuid())
  slug          String        @unique  // "analytics", "welcome"
  name          String
  description   String
  version       String        @default("1.0.0")
  
  // Requirements
  requiredGateways GatewayType[]
  
  // Configuration schema (JSON Schema format)
  configSchema  Json          @default("{}")
  
  // Metadata
  icon          String?
  category      String        @default("general")
  isBuiltin     Boolean       @default(true)
  
  // Status
  isActive      Boolean       @default(true)
  
  // Timestamps
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  
  // Relations
  userPlugins   UserPlugin[]
  
  @@index([slug])
  @@index([isActive])
}

// User's installed plugins
model UserPlugin {
  id            String        @id @default(cuid())
  userId        String
  pluginId      String
  
  // User's configuration for this plugin
  config        Json          @default("{}")
  
  // Status
  isEnabled     Boolean       @default(true)
  
  // Stats
  executionCount Int          @default(0)
  lastExecutedAt DateTime?
  lastError     String?
  
  // Timestamps
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  
  // Relations
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  plugin        Plugin        @relation(fields: [pluginId], references: [id])
  
  @@unique([userId, pluginId])
  @@index([userId])
  @@index([pluginId])
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] Plugin and UserPlugin tables exist
- [ ] Relations working

---

### Task 3.1.2: Create Plugin Types + Validation

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 3.1.1 complete

#### Deliverables:
- [ ] src/modules/plugin/plugin.types.ts
- [ ] src/modules/plugin/plugin.validation.ts

#### Types:
```typescript
import { ServiceContext } from '@/shared/types/context';

interface PluginDefinition {
  id: string
  slug: string
  name: string
  description: string
  requiredGateways: GatewayType[]
  configSchema: JSONSchema
  
  // For workflow integration (Phase 5+)
  inputSchema?: JSONSchema   // What plugin accepts as input
  outputSchema?: JSONSchema  // What plugin outputs
}

interface InstallPluginRequest {
  pluginId: string
  config?: Record<string, unknown>
}

interface UpdatePluginConfigRequest {
  config: Record<string, unknown>
}

// Plugin execution context (for workflow integration)
interface PluginExecutionContext {
  trigger: 'standalone' | 'workflow_step' | 'schedule' | 'event'
  workflowId?: string
  workflowRunId?: string
  stepIndex?: number
  previousStepOutput?: unknown
  variables: Record<string, unknown>
  ctx: ServiceContext
}

// Plugin must return structured output
interface PluginExecutionResult {
  success: boolean
  output?: unknown
  error?: string
  metrics: {
    durationMs: number
    tokensUsed?: number
    apiCalls?: number
  }
}

// Plugin event types
type PluginEvent = 
  | { type: 'telegram.message'; data: TelegramMessage }
  | { type: 'telegram.callback'; data: TelegramCallback }
  | { type: 'schedule.trigger'; data: ScheduleTrigger }
```

#### Done Criteria:
- [ ] All types defined
- [ ] Validation schemas work
- [ ] Event types defined

---

### Task 3.1.3: Create Plugin Service

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 3.1.2 complete

#### Deliverables:
- [ ] src/modules/plugin/plugin.service.ts

#### Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';
import { audit } from '@/lib/audit';

class PluginService {
  // Plugin catalog (public, no context needed)
  async getAvailablePlugins(): Promise<Plugin[]>
  async getPluginBySlug(slug: string): Promise<Plugin>
  
  // User plugins (all methods receive ServiceContext)
  async installPlugin(ctx: ServiceContext, data: InstallPluginRequest): Promise<UserPlugin>
  async uninstallPlugin(ctx: ServiceContext, pluginId: string): Promise<void>
  async getUserPlugins(ctx: ServiceContext): Promise<UserPlugin[]>
  async updatePluginConfig(ctx: ServiceContext, pluginId: string, config: unknown): Promise<UserPlugin>
  async togglePlugin(ctx: ServiceContext, pluginId: string, enabled: boolean): Promise<UserPlugin>
  
  // Execution tracking
  async recordExecution(userPluginId: string, success: boolean, error?: string): Promise<void>
  
  // Plan limit checks
  private async checkPluginLimit(ctx: ServiceContext): Promise<boolean>
}

// Ownership: use ctx.userId or ctx.organizationId for isolation
// Plan limits: check PLAN_LIMITS[ctx.userPlan].plugins before install
```

#### Done Criteria:
- [ ] Uses ServiceContext for all user operations
- [ ] Can list available plugins
- [ ] Can install/uninstall plugins (with plan limit check)
- [ ] Can configure and toggle plugins
- [ ] Audit events for install/uninstall

---

### Task 3.1.4: Create Plugin API Endpoints

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 3.1.3 complete

#### Deliverables:
```
GET  /api/plugins                   - List available plugins
GET  /api/plugins/:slug             - Get plugin details

GET  /api/user/plugins              - List user's installed plugins
POST /api/user/plugins/:id/install  - Install plugin
POST /api/user/plugins/:id/uninstall- Uninstall plugin
PUT  /api/user/plugins/:id/config   - Update config
POST /api/user/plugins/:id/toggle   - Enable/disable
```

#### Done Criteria:
- [ ] All endpoints working
- [ ] Proper authorization
- [ ] Config validation against schema

---

### Task 3.2.1: Create Plugin Interface/Contract

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 3.1.4 complete

#### Deliverables:
- [ ] src/modules/plugin/plugin.interface.ts

#### Interface:
```typescript
interface PluginHandler {
  // Plugin metadata
  slug: string
  name: string
  description: string
  version: string
  requiredGateways: GatewayType[]
  configSchema: JSONSchema
  
  // Lifecycle
  onInstall?(context: PluginContext): Promise<void>
  onUninstall?(context: PluginContext): Promise<void>
  onEnable?(context: PluginContext): Promise<void>
  onDisable?(context: PluginContext): Promise<void>
  
  // Event handlers
  onEvent(event: PluginEvent, context: PluginContext): Promise<void>
}

interface PluginContext {
  userId: string
  config: Record<string, unknown>
  gateways: GatewayAccessor
  storage: PluginStorage
  logger: Logger
}

interface GatewayAccessor {
  get(type: GatewayType): Gateway | undefined
  execute(gatewayId: string, action: string, params: unknown): Promise<unknown>
}

interface PluginStorage {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}
```

#### Done Criteria:
- [ ] Interface fully defined
- [ ] Context provides all needed access
- [ ] Type-safe event handling

---

### Task 3.2.2: Create Plugin Executor

> ⚠️ **V1 Scope:** Plugins run in-process because V1 only has builtin plugins (no user code).
> **V2 TODO:** When marketplace allows user-uploaded plugins, migrate to isolated execution
> (vm2, worker_threads, or dedicated container) to prevent crashes from affecting platform.

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 3.2.1 complete

#### Deliverables:
- [ ] src/modules/plugin/plugin.executor.ts

#### Implementation:
```typescript
class PluginExecutor {
  private handlers: Map<string, PluginHandler>
  
  register(handler: PluginHandler): void
  
  async executeEvent(
    userPlugin: UserPlugin,
    event: PluginEvent
  ): Promise<void>
  
  private createContext(userPlugin: UserPlugin): PluginContext
  private handleError(userPluginId: string, error: Error): Promise<void>
}
```

#### Done Criteria:
- [ ] Can execute plugin for event
- [ ] Creates proper context
- [ ] Handles errors gracefully
- [ ] Records execution stats

---

### Task 3.2.3: Create Plugin Event System

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 3.2.2 complete

#### Deliverables:
- [ ] src/modules/plugin/plugin.events.ts
- [ ] Connect Telegram webhook to plugin system
- [ ] Route events to appropriate plugins

#### Implementation:
```typescript
class PluginEventRouter {
  async routeTelegramMessage(
    userId: string,
    gatewayId: string,
    message: TelegramMessage
  ): Promise<void>
  
  async routeTelegramCallback(
    userId: string,
    gatewayId: string,
    callback: TelegramCallback
  ): Promise<void>
  
  private async getUserPluginsForEvent(
    userId: string,
    eventType: string,
    gatewayType: GatewayType
  ): Promise<UserPlugin[]>
}
```

#### Done Criteria:
- [ ] Telegram events route to plugins
- [ ] Only enabled plugins receive events
- [ ] Only plugins with required gateway receive events

---

### Task 3.3.1: Create Analytics Plugin - Data Model

**Session Type:** Database/Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 3.2.3 complete

#### Deliverables:
- [ ] Analytics data storage (in plugin storage or separate table)
- [ ] Track: messages received, sent, users seen

#### Data Structure:
```typescript
interface AnalyticsData {
  totalMessages: number
  messagesReceived: number
  messagesSent: number
  uniqueUsers: Set<string> // Telegram user IDs
  dailyStats: {
    [date: string]: {
      messages: number
      users: number
    }
  }
}
```

#### Done Criteria:
- [ ] Data structure defined
- [ ] Storage mechanism working
- [ ] Can read/write analytics data

---

### Task 3.3.2: Create Analytics Plugin - Logic

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 3.3.1 complete

#### Deliverables:
- [ ] src/modules/plugin/handlers/analytics.handler.ts

#### Implementation:
```typescript
const analyticsPlugin: PluginHandler = {
  slug: 'analytics',
  name: 'Channel Analytics',
  description: 'Track message and user statistics for your Telegram channels',
  version: '1.0.0',
  requiredGateways: [GatewayType.TELEGRAM_BOT],
  configSchema: {
    type: 'object',
    properties: {
      trackUsers: { type: 'boolean', default: true },
      retention: { type: 'number', default: 30 } // days
    }
  },
  
  async onEvent(event, context) {
    if (event.type === 'telegram.message') {
      await this.trackMessage(event.data, context)
    }
  },
  
  async trackMessage(message, context) {
    // Update stats in storage
  }
}
```

#### Done Criteria:
- [ ] Plugin registered
- [ ] Tracks incoming messages
- [ ] Updates daily stats
- [ ] Tracks unique users

---

### Task 3.3.3: Create Analytics Plugin - UI Widget

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 3.3.2 complete

#### Deliverables:
- [ ] src/components/plugins/analytics-widget.tsx
- [ ] API endpoint for analytics data
- [ ] Charts/stats display

#### Features:
```
- Total messages count
- Messages today/this week
- Unique users count
- Simple chart (last 7 days)
```

#### Done Criteria:
- [ ] Widget shows stats
- [ ] Data updates in real-time
- [ ] Clean UI design

---

### Task 3.4.1: Create Available Plugins Page

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 3.1.4 complete

#### Deliverables:
- [ ] src/app/(dashboard)/plugins/page.tsx
- [ ] Plugin cards with install button
- [ ] Filter by category (future)

#### Done Criteria:
- [ ] Shows available plugins
- [ ] Shows which are installed
- [ ] Can install from this page

---

### Task 3.4.2: Create My Plugins Page

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 3.4.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/my-plugins/page.tsx
- [ ] List installed plugins
- [ ] Enable/disable toggle
- [ ] Configuration modal
- [ ] Uninstall button

#### Done Criteria:
- [ ] Shows installed plugins
- [ ] Can toggle enabled status
- [ ] Can configure plugin
- [ ] Can uninstall plugin

---

## ✅ Phase 3 Completion Checklist

- [ ] Plugin data models created
- [ ] Plugin CRUD working
- [ ] Plugin interface defined
- [ ] Plugin executor working
- [ ] Events route to plugins
- [ ] Analytics plugin tracking messages
- [ ] Analytics widget showing stats
- [ ] Plugin UI pages complete

**When complete:** Update CURRENT-STATE.md and proceed to Phase 4
