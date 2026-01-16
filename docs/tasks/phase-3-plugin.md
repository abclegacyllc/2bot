# Phase 3: Plugin System

> **Goal:** Build plugin architecture, workflow foundation, and create 1 built-in analytics plugin
> **Estimated Sessions:** 10-12
> **Prerequisites:** Phase 2 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| **Plugin Foundation** ||||
| 3.1.1 | Create Plugin + UserPlugin models | ✅ | S13 |
| 3.1.2 | Create plugin types + validation | ✅ | S13 |
| 3.1.3 | Create plugin service | ✅ | S13 |
| 3.1.4 | Create plugin API endpoints | ✅ | S13 |
| 3.1.5 | Add tags[] to Plugin schema | ✅ | S13 |
| 3.1.6 | Create plugin registration architecture | ✅ | S16 |
| **Plugin Runtime** ||||
| 3.2.1 | Create plugin interface/contract | ✅ | S13 |
| 3.2.2 | Create plugin executor (worker_threads) | ✅ | S13 |
| 3.2.3 | Create plugin event system | ✅ | S13 |
| 3.2.4 | Add circuit breaker to plugin executor | ✅ | S13 |
| **Workflow Foundation (V2 Prep)** ||||
| 3.2.5 | Create Workflow + WorkflowStep models | ✅ | 2026-01-15 |
| 3.2.6 | Create workflow types + validation | ✅ | 2026-01-15 |
| **Analytics Plugin** ||||
| 3.3.1 | Create Analytics plugin - data model | ✅ | S15 |
| 3.3.2 | Create Analytics plugin - logic | ✅ | S15 |
| 3.3.3 | Create Analytics plugin - UI widget | ✅ | S15 |
| **Plugin UI** ||||
| 3.4.1 | Create available plugins page | ✅ | S16 |
| 3.4.2 | Create my plugins page | ✅ | S16 |

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
  category      String        @default("general")  // Functional category
  tags          String[]      @default([])         // Discovery tags: "sport", "blog", "ecommerce"
  isBuiltin     Boolean       @default(true)
  
  // For workflow integration (Phase 10)
  inputSchema   Json?         @map("input_schema")   // What plugin accepts
  outputSchema  Json?         @map("output_schema")  // What plugin outputs
  
  // Status
  isActive      Boolean       @default(true)
  
  // Timestamps
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")
  
  // Relations
  userPlugins   UserPlugin[]
  workflowSteps WorkflowStep[]
  
  @@index([slug])
  @@index([isActive])
  @@index([category])
  @@map("plugins")
}

// User/Organization installed plugins
model UserPlugin {
  id            String        @id @default(cuid())
  userId        String        @map("user_id")
  pluginId      String        @map("plugin_id")
  
  // Organization Support (same pattern as Gateway)
  organizationId String?      @map("organization_id")
  
  // User's configuration for this plugin
  config        Json          @default("{}")
  
  // Status
  isEnabled     Boolean       @default(true) @map("is_enabled")
  
  // Stats
  executionCount Int          @default(0) @map("execution_count")
  lastExecutedAt DateTime?    @map("last_executed_at")
  lastError     String?       @map("last_error")
  
  // Timestamps
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")
  
  // Relations
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  plugin        Plugin        @relation(fields: [pluginId], references: [id])
  // organization Organization? @relation(...) // Add when Organization model exists
  
  // Unique per user OR per organization (not both)
  @@unique([userId, pluginId, organizationId])
  @@index([userId])
  @@index([pluginId])
  @@index([organizationId])
  @@map("user_plugins")
}
```

#### Done Criteria:
- [x] Migration applied
- [x] Plugin and UserPlugin tables exist
- [x] Relations working

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
- [x] All types defined
- [x] Validation schemas work
- [x] Event types defined

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
- [x] Uses ServiceContext for all user operations
- [x] Can list available plugins
- [x] Can install/uninstall plugins (with plan limit check)
- [x] Can configure and toggle plugins
- [x] Audit events for install/uninstall

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
- [x] All endpoints working
- [x] Proper authorization
- [x] Config validation against schema

---

### Task 3.1.5: Add tags[] to Plugin Schema

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 3.1.4 complete

#### Schema Update:
```prisma
model Plugin {
  // ... existing fields
  
  tags          String[]      @default([])  // Discovery tags
}
```

#### Migration:
```bash
npx prisma migrate dev --name add_plugin_tags
```

#### Update Types:
```typescript
// src/modules/plugin/plugin.types.ts
interface PluginDefinition {
  // ... existing
  tags: string[];
}

// src/modules/plugin/plugin.validation.ts
export const pluginTagsSchema = z.array(z.string().min(2).max(30)).max(10);
```

#### Update Service:
```typescript
// Add to getAvailablePlugins options
async getAvailablePlugins(options?: {
  category?: string;
  gateway?: GatewayType;
  search?: string;
  tags?: string[];  // NEW: Filter by tags
}): Promise<PluginListItem[]>
```

#### Example Tags:
```
Functional Categories: general, analytics, messaging, automation
Discovery Tags: sport, blog, ecommerce, customer-support, social-media, news, gaming
```

#### Done Criteria:
- [x] tags[] field added to Plugin model
- [x] Migration applied
- [x] Types updated
- [x] Service supports tag filtering

---

### Task 3.1.6: Create Plugin Registration Architecture (Scalability Refactor)

**Session Type:** Backend/Refactoring
**Estimated Time:** 45 minutes
**Prerequisites:** Task 3.3.2 complete (Analytics plugin working)

> ⚠️ **Why This Task:** The initial implementation put plugin metadata in both
> the handler AND seed.ts, causing duplication. This task establishes the
> **Single Source of Truth** pattern for scalable plugin architecture.

#### Problem:
Plugin definitions exist in multiple places:
- `analytics.handler.ts` - Has configSchema, inputSchema, outputSchema
- `prisma/seed.ts` - Has SAME configSchema, inputSchema, outputSchema (duplicated!)

This causes:
- Duplication (~110 lines per plugin in seed.ts)
- Maintenance burden (update 2 places for 1 change)
- Scalability nightmare (100 plugins = 11,000 lines in seed.ts)

#### Solution: Single Source of Truth Pattern

```
src/modules/plugin/handlers/
├── analytics/
│   ├── analytics.handler.ts    ← Handler has ALL metadata (Single Source of Truth)
│   ├── analytics.storage.ts    ← Plugin-specific storage
│   ├── analytics.types.ts      ← Plugin-specific types
│   └── index.ts                ← Exports handler
├── [future-plugin]/
│   └── ...
└── index.ts                    ← Collects all handlers + provides seed data
```

#### Deliverables:

1. **Update BasePlugin with `toSeedData()` method:**
```typescript
// src/modules/plugin/plugin.interface.ts
import type { Prisma } from "@prisma/client";

abstract class BasePlugin implements PluginHandler {
  abstract readonly slug: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;
  abstract readonly category: PluginCategory;
  abstract readonly requiredGateways: GatewayType[];
  abstract readonly configSchema: JSONSchema;
  
  // Optional metadata
  readonly icon?: string;
  readonly tags: string[] = [];
  readonly inputSchema?: JSONSchema;
  readonly outputSchema?: JSONSchema;
  
  /**
   * Generate Prisma-compatible seed data from handler metadata.
   * This ensures handler is the Single Source of Truth.
   */
  toSeedData(): Prisma.PluginCreateInput {
    return {
      slug: this.slug,
      name: this.name,
      description: this.description,
      version: this.version,
      requiredGateways: this.requiredGateways,
      configSchema: this.configSchema as Prisma.InputJsonValue,
      inputSchema: this.inputSchema as Prisma.InputJsonValue ?? Prisma.DbNull,
      outputSchema: this.outputSchema as Prisma.InputJsonValue ?? Prisma.DbNull,
      icon: this.icon ?? null,
      category: this.category,
      tags: this.tags,
      isBuiltin: true,
      isActive: true,
    };
  }
}
```

2. **Update handlers/index.ts to export seed data:**
```typescript
// src/modules/plugin/handlers/index.ts
import type { Prisma } from "@prisma/client";
import type { PluginHandler, PluginRegistration } from "../plugin.interface";
import { analyticsPlugin } from "./analytics";

export const BUILTIN_PLUGINS: Map<string, PluginRegistration> = new Map([
  [
    analyticsPlugin.slug,
    {
      handler: analyticsPlugin,
      isBuiltin: true,
      tags: analyticsPlugin.tags,
      icon: analyticsPlugin.icon,
    },
  ],
]);

/**
 * Get all built-in plugin seed data for database seeding.
 * Called by prisma/seed.ts - NO hardcoded plugin data there!
 */
export function getAllBuiltinPluginSeedData(): Prisma.PluginCreateInput[] {
  return Array.from(BUILTIN_PLUGINS.values()).map(
    (registration) => registration.handler.toSeedData()
  );
}

// ... existing exports
```

3. **Update analytics.handler.ts with tags and icon:**
```typescript
// Ensure these are defined in the handler
readonly icon = "chart-bar";
readonly tags = ["analytics", "statistics", "telegram", "tracking"];
```

4. **Refactor prisma/seed.ts to use handler data:**
```typescript
// prisma/seed.ts
import { getAllBuiltinPluginSeedData } from "../src/modules/plugin/handlers";

async function main() {
  // ... user seeding code ...

  // ===========================================
  // Seed Built-in Plugins (from handler definitions)
  // ===========================================
  console.log("\n📦 Seeding plugins...");
  
  const pluginSeeds = getAllBuiltinPluginSeedData();
  
  for (const seedData of pluginSeeds) {
    const plugin = await prisma.plugin.upsert({
      where: { slug: seedData.slug },
      update: seedData,
      create: seedData,
    });
    console.log(`✅ Seeded plugin: ${plugin.name}`);
  }

  console.log(`\n📦 Total plugins seeded: ${pluginSeeds.length}`);
}
```

#### File Changes Summary:

| File | Action |
|------|--------|
| `src/modules/plugin/plugin.interface.ts` | Add `toSeedData()` to BasePlugin |
| `src/modules/plugin/handlers/index.ts` | Add `getAllBuiltinPluginSeedData()` |
| `src/modules/plugin/handlers/analytics/analytics.handler.ts` | Add `icon` and `tags` properties |
| `prisma/seed.ts` | Remove hardcoded plugin data, use handler data |

#### Done Criteria:
- [ ] BasePlugin has `toSeedData()` method
- [ ] handlers/index.ts exports `getAllBuiltinPluginSeedData()`
- [ ] Analytics handler has `icon` and `tags` properties
- [ ] seed.ts has NO hardcoded plugin definitions (< 20 lines for plugins section)
- [ ] `npm run db:seed` still works correctly
- [ ] Adding new plugin = create handler folder only (seed.ts unchanged)

#### Benefits:
- **Single Source of Truth:** Handler is the only authority for plugin metadata
- **Scalable:** 100 plugins = 100 handler folders, seed.ts stays small
- **Maintainable:** Update plugin in one place only
- **Testable:** Can validate handler metadata matches database
- **No Duplication:** configSchema defined once in handler

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
  organizationId?: string  // For org-owned plugins
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

### Task 3.2.2: Create Plugin Executor (Worker Threads)

> ⚠️ **UPDATED for V1:** Plugins now run in worker_threads for isolation.
> This prevents a crashing/infinite-loop plugin from killing the main server process.
> **V2:** Docker workspace isolation for marketplace plugins.

**Session Type:** Backend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 3.2.1 complete

#### Deliverables:
- [ ] src/modules/plugin/plugin.executor.ts
- [ ] src/modules/plugin/plugin-worker.ts (worker thread entry)

#### Implementation:
```typescript
// plugin-worker.ts (runs in worker thread)
import { parentPort, workerData } from 'worker_threads';

interface WorkerInput {
  pluginSlug: string;
  event: PluginEvent;
  config: Record<string, unknown>;
}

const { pluginSlug, event, config } = workerData as WorkerInput;

async function run() {
  try {
    const handler = await loadPluginHandler(pluginSlug);
    const result = await handler.execute(event, config);
    parentPort?.postMessage({ success: true, result });
  } catch (error) {
    parentPort?.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

run();
```

```typescript
// plugin.executor.ts (main process)
import { Worker } from 'worker_threads';

interface ExecutorConfig {
  timeoutMs: number;      // Max execution time (default: 30000)
  maxMemoryMb: number;    // Memory limit per worker (default: 128)
}

class PluginExecutor {
  private readonly config: ExecutorConfig = {
    timeoutMs: 30_000,
    maxMemoryMb: 128,
  };
  
  async execute(
    userPlugin: UserPlugin,
    event: PluginEvent
  ): Promise<PluginResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        path.join(__dirname, 'plugin-worker.js'),
        {
          workerData: {
            pluginSlug: userPlugin.plugin.slug,
            event,
            config: userPlugin.config,
          },
          resourceLimits: {
            maxOldGenerationSizeMb: this.config.maxMemoryMb,
            maxYoungGenerationSizeMb: this.config.maxMemoryMb / 4,
          },
        }
      );
      
      // ⏱️ Timeout protection
      const timeout = setTimeout(() => {
        worker.terminate();
        this.recordFailure(userPlugin.id, 'Plugin execution timeout');
        reject(new PluginTimeoutError(userPlugin.plugin.name));
      }, this.config.timeoutMs);
      
      // ✅ Success/Error from worker
      worker.on('message', (result) => {
        clearTimeout(timeout);
        if (result.success) {
          this.recordSuccess(userPlugin.id);
          resolve(result.result);
        } else {
          this.recordFailure(userPlugin.id, result.error);
          reject(new PluginExecutionError(result.error));
        }
      });
      
      // 💥 Worker crash (main process survives!)
      worker.on('error', (error) => {
        clearTimeout(timeout);
        this.recordFailure(userPlugin.id, error.message);
        reject(new PluginCrashError(userPlugin.plugin.name, error));
      });
      
      // 🛑 Worker exit
      worker.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new PluginExitError(userPlugin.plugin.name, code));
        }
      });
    });
  }
  
  private async recordSuccess(userPluginId: string): Promise<void> {
    await prisma.userPlugin.update({
      where: { id: userPluginId },
      data: {
        executionCount: { increment: 1 },
        lastExecutedAt: new Date(),
        lastError: null,
      },
    });
  }
  
  private async recordFailure(userPluginId: string, error: string): Promise<void> {
    await prisma.userPlugin.update({
      where: { id: userPluginId },
      data: {
        lastError: error,
        lastExecutedAt: new Date(),
      },
    });
  }
}

export const pluginExecutor = new PluginExecutor();
```

#### Done Criteria:
- [ ] Worker thread executes plugin code
- [ ] Timeout kills stuck plugins (30s max)
- [ ] Memory limit enforced (128MB default)
- [ ] Plugin crash doesn't crash server
- [ ] Success/failure recorded to database
- [ ] Creates proper context
- [ ] Handles errors gracefully

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
  // Route events using ServiceContext pattern (handles user OR org)
  async routeTelegramMessage(
    ctx: ServiceContext,
    gatewayId: string,
    message: TelegramMessage
  ): Promise<void>
  
  async routeTelegramCallback(
    ctx: ServiceContext,
    gatewayId: string,
    callback: TelegramCallback
  ): Promise<void>
  
  // Gets plugins for user OR organization based on ctx
  private async getPluginsForEvent(
    ctx: ServiceContext,
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

### Task 3.2.5: Create Workflow + WorkflowStep Models

> **Note:** This is the DATABASE FOUNDATION for workflows. Full workflow execution 
> and UI will be implemented in Phase 10 (V2). This task creates the schema now
> to avoid future migration pain.

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Task 3.2.3 complete

#### Schema:
```prisma
// Trigger types for workflows
enum WorkflowTriggerType {
  TELEGRAM_MESSAGE    // On new Telegram message
  TELEGRAM_CALLBACK   // On callback button press
  SCHEDULE           // Cron-based trigger
  WEBHOOK            // External HTTP trigger
  MANUAL             // User-triggered
}

// Workflow status
enum WorkflowStatus {
  DRAFT              // Being edited
  ACTIVE             // Running
  PAUSED             // Temporarily disabled
  ARCHIVED           // Soft deleted
}

// Workflow scope (determines visibility and access)
enum WorkflowScope {
  USER               // Personal workspace OR employee personal in org
  DEPARTMENT         // Shared within department (org only)
  ORGANIZATION       // Company-wide automation (org only)
}

// Workflow definition (user-created automation chain)
model Workflow {
  id              String              @id @default(cuid())
  userId          String              @map("user_id")
  organizationId  String?             @map("organization_id")
  departmentId    String?             @map("department_id")  // For DEPARTMENT scope
  
  // Scope determines visibility and access
  // - USER scope: If organizationId=NULL, personal workspace workflow
  //               If organizationId!=NULL, employee personal workflow in org
  // - DEPARTMENT: Requires departmentId, shared within department  
  // - ORGANIZATION: Shared across entire organization
  scope           WorkflowScope       @default(USER)
  
  // Basic info
  name            String
  description     String?
  slug            String              // User-friendly URL slug
  
  // Trigger configuration
  triggerType     WorkflowTriggerType
  triggerConfig   Json                @default("{}")  // Type-specific settings
  
  // Bound gateway (for telegram/ai triggers)
  gatewayId       String?             @map("gateway_id")
  
  // Status
  status          WorkflowStatus      @default(DRAFT)
  isEnabled       Boolean             @default(false) @map("is_enabled")
  
  // Execution stats
  executionCount  Int                 @default(0) @map("execution_count")
  lastExecutedAt  DateTime?           @map("last_executed_at")
  lastError       String?             @map("last_error")
  
  // Timestamps
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")
  
  // Relations
  user            User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  gateway         Gateway?            @relation(fields: [gatewayId], references: [id])
  // organization Organization?       @relation(...) // Add when Organization exists (Phase 4)
  // department    Department?         @relation(...) // Add when Department exists (Phase 4)
  steps           WorkflowStep[]
  runs            WorkflowRun[]
  
  @@unique([userId, organizationId, slug])
  @@index([userId])
  @@index([organizationId])
  @@index([departmentId])
  @@index([scope])
  @@index([status])
  @@index([isEnabled])
  @@map("workflows")
}

// Individual step in a workflow chain
model WorkflowStep {
  id              String    @id @default(cuid())
  workflowId      String    @map("workflow_id")
  
  // Step position
  order           Int       // Execution order (0, 1, 2...)
  name            String?   // Optional label
  
  // Plugin to execute
  pluginId        String    @map("plugin_id")
  
  // Step configuration
  // How to map trigger/previous step data to this plugin's input
  inputMapping    Json      @default("{}")  // { "text": "{{trigger.message.text}}" }
  
  // Static config for the plugin
  config          Json      @default("{}")
  
  // Gateway override (use specific gateway instead of workflow default)
  gatewayId       String?   @map("gateway_id")
  
  // Conditional execution (optional)
  condition       Json?     // { "if": "{{prev.sentiment}} == 'negative'" }
  
  // Error handling
  onError         String    @default("stop")  // "stop", "continue", "retry"
  maxRetries      Int       @default(0)       @map("max_retries")
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  // Relations
  workflow        Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  plugin          Plugin    @relation(fields: [pluginId], references: [id])
  gateway         Gateway?  @relation(fields: [gatewayId], references: [id])
  
  @@unique([workflowId, order])
  @@index([workflowId])
  @@index([pluginId])
  @@map("workflow_steps")
}

// Workflow execution history
model WorkflowRun {
  id              String    @id @default(cuid())
  workflowId      String    @map("workflow_id")
  
  // Trigger info
  triggeredBy     String    // "telegram_message", "schedule", "manual", etc.
  triggerData     Json?     @map("trigger_data")  // Original trigger payload
  
  // Execution status
  status          String    @default("running")  // running, completed, failed, cancelled
  
  // Results
  output          Json?     // Final output
  error           String?   // Error message if failed
  failedStepOrder Int?      @map("failed_step_order")  // Which step failed
  
  // Performance
  startedAt       DateTime  @default(now()) @map("started_at")
  completedAt     DateTime? @map("completed_at")
  durationMs      Int?      @map("duration_ms")
  
  // Relations
  workflow        Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  stepRuns        WorkflowStepRun[]
  
  @@index([workflowId])
  @@index([status])
  @@index([startedAt])
  @@map("workflow_runs")
}

// Individual step execution in a run
model WorkflowStepRun {
  id              String      @id @default(cuid())
  runId           String      @map("run_id")
  stepOrder       Int         @map("step_order")
  
  // Execution
  status          String      @default("pending")  // pending, running, completed, failed, skipped
  input           Json?       // Actual input after mapping
  output          Json?       // Plugin output
  error           String?
  
  // Performance
  startedAt       DateTime?   @map("started_at")
  completedAt     DateTime?   @map("completed_at")
  durationMs      Int?        @map("duration_ms")
  
  // Relations
  run             WorkflowRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  
  @@unique([runId, stepOrder])
  @@index([runId])
  @@map("workflow_step_runs")
}
```

#### Done Criteria:
- [x] All workflow models created
- [x] Enums defined
- [x] Migration applied
- [x] Relations working

---

### Task 3.2.6: Create Workflow Types + Validation

> **Note:** Types only - actual workflow service/execution in Phase 10

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 3.2.5 complete

#### Deliverables:
- [x] src/modules/workflow/workflow.types.ts
- [x] src/modules/workflow/workflow.validation.ts
- [x] src/modules/workflow/index.ts

#### Types:
```typescript
// src/modules/workflow/workflow.types.ts

import type { 
  Workflow, 
  WorkflowStep, 
  WorkflowRun, 
  WorkflowTriggerType,
  WorkflowStatus 
} from "@prisma/client";

// Re-export Prisma types
export type { Workflow, WorkflowStep, WorkflowRun } from "@prisma/client";

// Trigger configurations
export interface TelegramMessageTriggerConfig {
  filterType?: "all" | "text" | "photo" | "document" | "command";
  commandPrefix?: string;  // e.g., "/start"
  textPattern?: string;    // Regex pattern
}

export interface ScheduleTriggerConfig {
  cron: string;           // "0 9 * * *" (9am daily)
  timezone?: string;      // "America/New_York"
}

export interface WebhookTriggerConfig {
  secret?: string;        // Validation secret
  methods?: string[];     // ["POST", "PUT"]
}

export type TriggerConfig = 
  | TelegramMessageTriggerConfig
  | ScheduleTriggerConfig
  | WebhookTriggerConfig
  | Record<string, unknown>;

// Input mapping template
export interface InputMapping {
  [outputKey: string]: string;  // "text": "{{trigger.message.text}}"
}

// Condition expression
export interface StepCondition {
  if: string;  // "{{prev.sentiment}} == 'negative'"
}

// Workflow definition for API responses
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  slug: string;
  triggerType: WorkflowTriggerType;
  triggerConfig: TriggerConfig;
  status: WorkflowStatus;
  isEnabled: boolean;
  steps: WorkflowStepDefinition[];
  executionCount: number;
  lastExecutedAt?: Date;
}

export interface WorkflowStepDefinition {
  id: string;
  order: number;
  name?: string;
  pluginId: string;
  pluginSlug?: string;  // For display
  inputMapping: InputMapping;
  config: Record<string, unknown>;
  condition?: StepCondition;
  onError: "stop" | "continue" | "retry";
}

// Execution context passed through workflow
export interface WorkflowExecutionContext {
  workflowId: string;
  runId: string;
  trigger: {
    type: WorkflowTriggerType;
    data: unknown;
    timestamp: Date;
  };
  variables: Record<string, unknown>;
  steps: {
    [stepOrder: number]: {
      input: unknown;
      output: unknown;
      status: string;
    };
  };
}

// Template variable resolver
export interface TemplateContext {
  trigger: unknown;
  prev?: unknown;       // Previous step output
  steps: Record<number, unknown>;  // All step outputs by order
  env: Record<string, string>;     // Environment variables
  ctx: {
    userId: string;
    organizationId?: string;
    workflowId: string;
    runId: string;
  };
}
```

#### Validation Schemas:
```typescript
// src/modules/workflow/workflow.validation.ts

import { z } from "zod";

export const workflowNameSchema = z.string().min(2).max(100).trim();
export const workflowSlugSchema = z.string().min(2).max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");

export const triggerTypeSchema = z.enum([
  "TELEGRAM_MESSAGE",
  "TELEGRAM_CALLBACK", 
  "SCHEDULE",
  "WEBHOOK",
  "MANUAL"
]);

export const workflowStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED"
]);

export const inputMappingSchema = z.record(z.string());

export const stepConditionSchema = z.object({
  if: z.string()
}).optional();

export const createWorkflowSchema = z.object({
  name: workflowNameSchema,
  description: z.string().max(500).optional(),
  slug: workflowSlugSchema,
  triggerType: triggerTypeSchema,
  triggerConfig: z.record(z.unknown()).default({}),
  gatewayId: z.string().cuid().optional(),
});

export const createWorkflowStepSchema = z.object({
  order: z.number().int().min(0),
  name: z.string().max(100).optional(),
  pluginId: z.string().cuid(),
  inputMapping: inputMappingSchema.default({}),
  config: z.record(z.unknown()).default({}),
  gatewayId: z.string().cuid().optional(),
  condition: stepConditionSchema,
  onError: z.enum(["stop", "continue", "retry"]).default("stop"),
  maxRetries: z.number().int().min(0).max(5).default(0),
});
```

#### Module Index:
```typescript
// src/modules/workflow/index.ts

export const WORKFLOW_MODULE = "workflow" as const;

// Types
export * from "./workflow.types";

// Validation  
export * from "./workflow.validation";

// Service will be added in Phase 10
// export { workflowService } from "./workflow.service";
```

#### Done Criteria:
- [x] Types fully defined
- [x] Validation schemas created
- [x] Template context types ready
- [x] Module exports set up

---

### Task 3.2.4: Add Circuit Breaker to Plugin Executor

**Session Type:** Backend
**Estimated Time:** 1 hour
**Prerequisites:** Task 3.2.2 (Worker Threads), Phase 2 Task 2.6.1 complete

> **Why:** Even with worker threads, we want to track plugin failure rates.
> A consistently failing plugin should be circuit-broken to save resources.

#### Deliverables:
- [ ] Per-plugin circuit breaker in executor
- [ ] Auto-disable plugins that fail repeatedly
- [ ] User notification on circuit trip

#### Implementation:
```typescript
// src/modules/plugin/plugin.executor.ts (additions)

import { CircuitBreaker, createCircuitBreaker, CircuitOpenError } from "@/lib/circuit-breaker";

// Track circuits per user-plugin combination
const pluginCircuits = new Map<string, CircuitBreaker<PluginResult>>();

function getPluginCircuitKey(userId: string, pluginId: string): string {
  return `plugin:${userId}:${pluginId}`;
}

export async function executePlugin(
  plugin: Plugin,
  userPlugin: UserPlugin,
  input: unknown,
  context: ExecutionContext
): Promise<PluginResult> {
  const circuitKey = getPluginCircuitKey(userPlugin.userId, plugin.id);
  
  // Check if circuit is open
  let circuit = pluginCircuits.get(circuitKey);
  if (!circuit) {
    circuit = createCircuitBreaker(
      circuitKey,
      () => runInWorker(plugin, userPlugin, input, context),
      {
        failureThreshold: 10,      // More tolerant than gateways
        resetTimeoutMs: 60000,     // 1 minute cooldown
        halfOpenMaxAttempts: 2,
      }
    );
    pluginCircuits.set(circuitKey, circuit);
  }
  
  try {
    return await circuit.execute();
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // Log for admin visibility
      console.error(
        `Plugin circuit open: user=${userPlugin.userId}, plugin=${plugin.slug}`
      );
      
      // Return graceful error result
      return {
        success: false,
        error: {
          code: "PLUGIN_CIRCUIT_OPEN",
          message: `Plugin ${plugin.name} temporarily disabled due to repeated failures`,
          retryAfterMs: error.retryAfterMs,
        },
      };
    }
    throw error;
  }
}

// Get all circuit stats for a user (for dashboard)
export function getUserPluginCircuitStats(userId: string): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  
  for (const [key, circuit] of pluginCircuits.entries()) {
    if (key.includes(`:${userId}:`)) {
      const pluginId = key.split(":")[2];
      stats[pluginId] = circuit.getStats();
    }
  }
  
  return stats;
}
```

#### Done Criteria:
- [ ] Circuit breaker wraps worker execution
- [ ] Per-user, per-plugin isolation
- [ ] Graceful error response when circuit open
- [ ] Stats exposed for user dashboard
- [ ] Higher failure threshold than gateways (plugins more variable)

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

### Plugin Foundation
- [ ] Plugin data models created (with organizationId support)
- [ ] Plugin CRUD working (user + organization isolation)
- [ ] tags[] field added for discovery
- [ ] Plugin interface defined
- [ ] Plugin executor working (worker_threads)
- [ ] Events route to plugins (via ServiceContext)

### Plugin Fault Isolation
- [ ] Worker threads for plugin isolation (plugin-worker.ts)
- [ ] 30s timeout + 128MB memory limit per plugin
- [ ] Circuit breaker on plugin executor (uses Phase 2 library)
- [ ] Per-user, per-plugin circuit isolation

### Workflow Foundation (V2 Prep)
- [ ] Workflow + WorkflowStep models created
- [ ] WorkflowRun + WorkflowStepRun models created
- [ ] WorkflowScope enum created (USER, DEPARTMENT, ORGANIZATION)
- [ ] Workflow.scope field added with departmentId
- [ ] Workflow types defined
- [ ] Validation schemas ready
- [ ] Module structure prepared

### Analytics Plugin
- [ ] Analytics plugin tracking messages
- [ ] Analytics widget showing stats

### Plugin UI
- [ ] Available plugins page
- [ ] My plugins page

### Organization Support Verification
- [ ] UserPlugin model has organizationId field
- [ ] Workflow model has organizationId field
- [ ] PluginService uses ServiceContext for isolation
- [ ] PluginContext includes organizationId
- [ ] Event routing uses ServiceContext pattern
- [ ] UI respects organization context

**When complete:** Update CURRENT-STATE.md and proceed to Phase 4
---

## 📌 Architecture Notes

### Future: DataClient Migration

> **Current Implementation:** Direct Prisma calls with manual tenant filtering
> **Future Migration:** Use DataClient abstraction from Phase 1.5.5

When Phase 1.5.5 (Data Access Layer) is implemented, PluginService can be migrated:

```typescript
// CURRENT (direct Prisma):
async getUserPlugins(ctx: ServiceContext): Promise<UserPlugin[]> {
  const where = ctx.organizationId
    ? { organizationId: ctx.organizationId }
    : { userId: ctx.userId, organizationId: null };
  
  return prisma.userPlugin.findMany({ where, include: { plugin: true } });
}

// FUTURE (DataClient - automatic tenant filtering):
async getUserPlugins(ctx: ServiceContext): Promise<UserPlugin[]> {
  const db = getDataClient(ctx);
  return db.userPlugin.findMany({ include: { plugin: true } });
}
```

**Benefits:**
- Automatic tenant isolation
- Prepares for per-user/per-org database isolation
- Cleaner service code

### Future: Workflow Database Isolation

Workflow data (WorkflowRun, WorkflowStepRun) can be high volume for active organizations.
When isolated databases are implemented (Enterprise plan):

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW DATA ROUTING                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FREE/PRO User:                                                 │
│  └── Shared DB → workflow_runs table (with userId filter)       │
│                                                                 │
│  Enterprise Org:                                                │
│  └── Dedicated DB → workflow_runs table (no filter needed!)     │
│      • Faster queries (smaller table)                           │
│      • No noisy neighbor                                        │
│      • Can scale independently                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

This is handled automatically by DataClient when isolation is enabled.