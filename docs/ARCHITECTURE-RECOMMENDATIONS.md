# 🏗️ Architecture Recommendations: Prepare for Future Without Pain

> **Purpose:** Critical changes to implement NOW before continuing with Phase 2+ to avoid painful refactoring later.
> **Priority:** HIGH - Do these changes BEFORE completing more features.

---

## 📋 Table of Contents

1. [Database Schema Additions](#1-database-schema-additions)
2. [Type System Updates](#2-type-system-updates)
3. [Service Layer Patterns](#3-service-layer-patterns)
4. [Plugin System Future-Proofing](#4-plugin-system-future-proofing)
5. [Workflow/Service Engine Preparation](#5-workflowservice-engine-preparation)
6. [Credit System Foundation](#6-credit-system-foundation)
7. [Admin & Role System](#7-admin--role-system)
8. [Workspace Isolation Preparation](#8-workspace-isolation-preparation)
9. [Implementation Checklist](#9-implementation-checklist)

---

## 1. Database Schema Additions

### 1.1 Add Organization Support to User Model NOW

**Why:** Adding `organizationId` later requires migrations on user table with existing data.

```prisma
// prisma/schema.prisma - UPDATE User model

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  name          String?
  emailVerified DateTime? @map("email_verified")
  image         String?

  // ========== ADD THESE FIELDS NOW ==========
  
  // Role System (for admin, developer, support)
  role          UserRole  @default(MEMBER)
  
  // Organization Support (null = individual user)
  organizationId String?  @map("organization_id")
  departmentId   String?  @map("department_id")
  orgRole        OrgRole? @map("org_role")
  
  // Security (for future 2FA, account lockout)
  failedLoginCount Int      @default(0) @map("failed_login_count")
  lockedUntil      DateTime? @map("locked_until")
  lastPasswordChange DateTime? @map("last_password_change")
  
  // Soft Delete Support
  deletedAt     DateTime? @map("deleted_at")
  
  // ========== END NEW FIELDS ==========

  // Subscription
  plan             PlanType @default(FREE)
  stripeCustomerId String?  @unique @map("stripe_customer_id")

  // Status
  isActive    Boolean   @default(true) @map("is_active")
  lastLoginAt DateTime? @map("last_login_at")

  // Timestamps
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Relations
  sessions            Session[]
  passwordResetTokens PasswordResetToken[]
  gateways            Gateway[]
  // userPlugins      UserPlugin[]  // Phase 3
  // organization     Organization? @relation(...) // Add when you create Org model
  // creditBalance    CreditBalance? // Phase 4
  
  @@index([email])
  @@index([stripeCustomerId])
  @@index([organizationId])      // ADD NOW
  @@index([deletedAt])           // ADD NOW
  @@index([role])                // ADD NOW
  @@map("users")
}

// ========== ADD THESE ENUMS NOW ==========

enum UserRole {
  SUPER_ADMIN   // Full platform control
  ADMIN         // Platform administrator
  DEVELOPER     // Marketplace developer
  SUPPORT       // Customer support (future)
  MEMBER        // Standard user (default)
}

enum OrgRole {
  ORG_OWNER     // Organization owner
  ORG_ADMIN     // Can manage org users/settings
  DEPT_MANAGER  // Manages their department
  ORG_MEMBER    // Regular org member
}

enum PlanType {
  FREE
  STARTER       // ADD - $9/mo tier
  PRO
  BUSINESS      // ADD - $79/mo tier
  ENTERPRISE    // ADD - custom pricing
}
```

### 1.2 Add Gateway Ownership Context

**Why:** Gateways will need to support both individual users AND organizations.

```prisma
// UPDATE Gateway model

model Gateway {
  id     String @id @default(cuid())
  userId String @map("user_id")
  
  // ========== ADD FOR ORG SUPPORT ==========
  organizationId String? @map("organization_id")  // If owned by org, not user
  // ==========================================

  name   String
  type   GatewayType
  status GatewayStatus @default(DISCONNECTED)

  credentialsEnc String @map("credentials_enc") @db.Text
  config Json @default("{}")

  lastConnectedAt DateTime? @map("last_connected_at")
  lastErrorAt     DateTime? @map("last_error_at")
  lastError       String?   @map("last_error")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  // organization Organization? @relation(...) // Add later

  @@index([userId])
  @@index([organizationId])  // ADD NOW
  @@index([type])
  @@index([status])
  @@map("gateways")
}
```

### 1.3 Add Audit Log Model NOW

**Why:** You'll need this for security, debugging, and compliance. Adding later means no history.

```prisma
// ADD THIS MODEL NOW

model AuditLog {
  id             String   @id @default(cuid())
  userId         String?  @map("user_id")
  organizationId String?  @map("organization_id")
  
  action         String   // 'gateway.create', 'plugin.install', 'user.login'
  resource       String   // 'gateway', 'plugin', 'user'
  resourceId     String?  @map("resource_id")
  
  metadata       Json?    // Additional context (no secrets!)
  ipAddress      String?  @map("ip_address")
  userAgent      String?  @map("user_agent")
  status         String   @default("success") // 'success', 'failure'
  
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([organizationId])
  @@index([action])
  @@index([resource, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### 1.4 Add Credit Balance Placeholder

**Why:** Credit system is complex. Having the table ready makes Phase 4 easier.

```prisma
// ADD THIS MODEL NOW (even if empty initially)

model CreditBalance {
  id        String   @id @default(cuid())
  userId    String   @unique @map("user_id")
  
  balance   Int      @default(0)  // Current credit balance
  lifetime  Int      @default(0)  // Total credits ever purchased
  
  // Auto-topup settings (JSON for flexibility)
  settings  Json     @default("{}")
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions CreditTransaction[]

  @@map("credit_balances")
}

model CreditTransaction {
  id              String   @id @default(cuid())
  creditBalanceId String   @map("credit_balance_id")
  
  type            String   // 'purchase', 'usage', 'refund', 'bonus', 'grant'
  amount          Int      // Positive = credit, Negative = debit
  balanceAfter    Int      @map("balance_after")
  
  description     String
  metadata        Json?    // { stripeId?, aiProvider?, model?, itemId? }
  
  createdAt       DateTime @default(now()) @map("created_at")

  creditBalance   CreditBalance @relation(fields: [creditBalanceId], references: [id], onDelete: Cascade)

  @@index([creditBalanceId])
  @@index([type])
  @@index([createdAt])
  @@map("credit_transactions")
}
```

---

## 2. Type System Updates

### 2.1 Update Auth Types for Organization Context

```typescript
// src/modules/auth/auth.types.ts - UPDATE

export interface TokenPayload {
  userId: string;
  email: string;
  plan: PlanType;
  sessionId: string;
  
  // ========== ADD THESE ==========
  role: UserRole;
  organizationId?: string;
  orgRole?: OrgRole;
  // ===============================
}

// Add context type for middleware
export interface RequestContext {
  userId: string;
  email: string;
  plan: PlanType;
  role: UserRole;
  
  // Organization context (if acting as org member)
  organizationId?: string;
  orgRole?: OrgRole;
  departmentId?: string;
  
  // Permissions derived from role
  permissions: string[];
}
```

### 2.2 Create Shared Constants File

```typescript
// src/shared/constants/plans.ts - CREATE

export const PLAN_LIMITS = {
  FREE: {
    gateways: 1,
    plugins: 3,
    executionsPerDay: 100,
    aiTokensPerMonth: 5000,
    ramMb: 256,
    storageMb: 100,
  },
  STARTER: {
    gateways: 3,
    plugins: 10,
    executionsPerDay: 1000,
    aiTokensPerMonth: 50000,
    ramMb: 512,
    storageMb: 500,
  },
  PRO: {
    gateways: 10,
    plugins: -1, // unlimited
    executionsPerDay: 10000,
    aiTokensPerMonth: 200000,
    ramMb: 1024,
    storageMb: 2000,
  },
  BUSINESS: {
    gateways: 25,
    plugins: -1,
    executionsPerDay: 50000,
    aiTokensPerMonth: 500000,
    ramMb: 2048,
    storageMb: 5000,
  },
  ENTERPRISE: {
    gateways: -1,
    plugins: -1,
    executionsPerDay: -1,
    aiTokensPerMonth: -1,
    ramMb: 4096,
    storageMb: 10000,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: PlanType) {
  return PLAN_LIMITS[plan];
}

export function canDoAction(plan: PlanType, action: string, currentUsage: number): boolean {
  const limits = PLAN_LIMITS[plan];
  const limit = limits[action as keyof typeof limits];
  if (limit === -1) return true; // unlimited
  return currentUsage < limit;
}
```

### 2.3 Create Permission Constants

```typescript
// src/shared/constants/permissions.ts - CREATE

export const PERMISSIONS = {
  // Gateway permissions
  'gateway:create': ['MEMBER', 'ADMIN', 'SUPER_ADMIN'],
  'gateway:read': ['MEMBER', 'ADMIN', 'SUPER_ADMIN'],
  'gateway:update': ['MEMBER', 'ADMIN', 'SUPER_ADMIN'],
  'gateway:delete': ['MEMBER', 'ADMIN', 'SUPER_ADMIN'],
  
  // Plugin permissions
  'plugin:install': ['MEMBER', 'ADMIN', 'SUPER_ADMIN'],
  'plugin:configure': ['MEMBER', 'ADMIN', 'SUPER_ADMIN'],
  
  // Admin permissions
  'admin:users:read': ['ADMIN', 'SUPER_ADMIN'],
  'admin:users:write': ['ADMIN', 'SUPER_ADMIN'],
  'admin:users:delete': ['SUPER_ADMIN'],
  'admin:users:impersonate': ['SUPER_ADMIN'],
  
  // Marketplace permissions
  'marketplace:submit': ['DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
  'marketplace:review': ['ADMIN', 'SUPER_ADMIN'],
  'marketplace:feature': ['ADMIN', 'SUPER_ADMIN'],
  
  // Organization permissions
  'org:manage': ['ORG_OWNER', 'ORG_ADMIN'],
  'org:members:invite': ['ORG_OWNER', 'ORG_ADMIN'],
  'org:billing': ['ORG_OWNER'],
  
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(
  userRole: string, 
  orgRole: string | null, 
  permission: Permission
): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(userRole) || 
         (orgRole && allowedRoles.includes(orgRole));
}
```

---

## 3. Service Layer Patterns

### 3.1 Add Context Parameter to All Services

**Why:** Services need to know WHO is calling and WHAT context (personal vs org).

```typescript
// src/modules/gateway/gateway.service.ts - UPDATE PATTERN

// BEFORE (current):
async create(userId: string, data: CreateGatewayInput): Promise<SafeGateway>

// AFTER (future-proof):
async create(ctx: ServiceContext, data: CreateGatewayInput): Promise<SafeGateway>

// Define ServiceContext:
// src/shared/types/context.ts - CREATE

export interface ServiceContext {
  // Who is making the request
  userId: string;
  userRole: UserRole;
  userPlan: PlanType;
  
  // Organization context (optional)
  organizationId?: string;
  orgRole?: OrgRole;
  departmentId?: string;
  
  // Request metadata
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  
  // Helper methods
  isAdmin(): boolean;
  isOrgContext(): boolean;
  canDo(permission: Permission): boolean;
}

// Implementation:
export function createServiceContext(
  tokenPayload: TokenPayload,
  req: Request
): ServiceContext {
  return {
    userId: tokenPayload.userId,
    userRole: tokenPayload.role,
    userPlan: tokenPayload.plan,
    organizationId: tokenPayload.organizationId,
    orgRole: tokenPayload.orgRole,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'],
    
    isAdmin() {
      return ['ADMIN', 'SUPER_ADMIN'].includes(this.userRole);
    },
    
    isOrgContext() {
      return !!this.organizationId;
    },
    
    canDo(permission: Permission) {
      return hasPermission(this.userRole, this.orgRole ?? null, permission);
    },
  };
}
```

### 3.2 Add Audit Logging Helper

```typescript
// src/lib/audit.ts - CREATE

import { prisma } from './prisma';

export interface AuditEvent {
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  status?: 'success' | 'failure';
}

export async function audit(
  ctx: ServiceContext,
  event: AuditEvent
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId,
      metadata: event.metadata,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      status: event.status ?? 'success',
    },
  });
}

// Usage in services:
async create(ctx: ServiceContext, data: CreateGatewayInput): Promise<SafeGateway> {
  const gateway = await prisma.gateway.create({...});
  
  await audit(ctx, {
    action: 'gateway.create',
    resource: 'gateway',
    resourceId: gateway.id,
    metadata: { type: data.type, name: data.name },
  });
  
  return toSafeGateway(gateway);
}
```

---

## 4. Plugin System Future-Proofing

### 4.1 Design Plugin for Workflow Support

**Why:** In Phase 5 (Workflow/Service), plugins need to be workflow steps.

```typescript
// src/modules/plugin/plugin.types.ts - ADD THESE TYPES

// Plugin can run standalone OR as a workflow step
export interface PluginExecutionContext {
  // How plugin was triggered
  trigger: 'standalone' | 'workflow_step' | 'schedule' | 'event';
  
  // If part of workflow
  workflowId?: string;
  workflowRunId?: string;
  stepIndex?: number;
  
  // Input from previous step (for workflows)
  previousStepOutput?: unknown;
  
  // Variables available to plugin
  variables: Record<string, unknown>;
  
  // Service context
  ctx: ServiceContext;
}

// Plugin must return structured output for workflows
export interface PluginExecutionResult {
  success: boolean;
  output?: unknown;        // Data for next workflow step
  error?: string;
  
  // Metrics for billing/monitoring
  metrics: {
    durationMs: number;
    tokensUsed?: number;   // If AI was used
    apiCalls?: number;
  };
}

// Plugin interface that supports both standalone and workflow
export interface PluginRunner {
  // Metadata
  slug: string;
  version: string;
  
  // What this plugin can accept as input
  inputSchema: JSONSchema;
  
  // What this plugin outputs
  outputSchema: JSONSchema;
  
  // Run the plugin
  execute(context: PluginExecutionContext): Promise<PluginExecutionResult>;
  
  // Validate config
  validateConfig(config: unknown): ValidationResult;
}
```

### 4.2 Add Plugin Registry Pattern

```typescript
// src/modules/plugin/plugin.registry.ts - CREATE

import { PluginRunner } from './plugin.types';

class PluginRegistry {
  private plugins = new Map<string, PluginRunner>();
  
  register(plugin: PluginRunner): void {
    this.plugins.set(plugin.slug, plugin);
  }
  
  get(slug: string): PluginRunner | undefined {
    return this.plugins.get(slug);
  }
  
  list(): PluginRunner[] {
    return Array.from(this.plugins.values());
  }
  
  // Check if plugin can be used in workflow
  canBeWorkflowStep(slug: string): boolean {
    const plugin = this.get(slug);
    return plugin?.outputSchema !== undefined;
  }
}

export const pluginRegistry = new PluginRegistry();

// Register built-in plugins
// pluginRegistry.register(new AnalyticsPlugin());
// pluginRegistry.register(new WelcomePlugin());
```

---

## 5. Workflow/Service Engine Preparation

### 5.1 Add Workflow Types NOW

**Why:** These types will guide plugin development.

```typescript
// src/shared/types/workflow.ts - CREATE

// Workflow step definition
export interface WorkflowStep {
  id: string;
  type: 'plugin' | 'gateway' | 'condition' | 'transform' | 'delay';
  
  // For plugin/gateway steps
  ref?: string;  // plugin slug or gateway ID
  config?: Record<string, unknown>;
  
  // For condition steps
  condition?: string;  // Expression like "{{ steps.0.output.count > 10 }}"
  
  // For transform steps
  transform?: string;  // JMESPath or simple expression
  
  // For delay steps
  delayMs?: number;
  
  // Error handling
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;
  
  // Connections
  nextStepId?: string;           // Default next
  conditionalNext?: {            // For conditions
    true?: string;
    false?: string;
  };
}

// Workflow definition
export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  
  // Trigger configuration
  trigger: {
    type: 'manual' | 'schedule' | 'event' | 'webhook';
    config: Record<string, unknown>;
  };
  
  // Steps
  steps: WorkflowStep[];
  startStepId: string;
  
  // Variables available throughout workflow
  variables: Record<string, unknown>;
}

// Workflow execution state (for recovery)
export interface WorkflowExecutionState {
  workflowId: string;
  runId: string;
  
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentStepId: string;
  
  // Results from each step
  stepResults: Record<string, unknown>;
  
  // For recovery after crash
  checkpoint: {
    stepId: string;
    timestamp: Date;
    state: unknown;
  };
  
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}
```

---

## 6. Credit System Foundation

### 6.1 Add Credit Service Interface

```typescript
// src/modules/billing/credit.service.ts - CREATE

export interface CreditService {
  // Get balance
  getBalance(userId: string): Promise<number>;
  
  // Add credits (purchase, bonus, grant)
  addCredits(
    userId: string,
    amount: number,
    type: 'purchase' | 'bonus' | 'grant',
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<CreditBalance>;
  
  // Deduct credits (usage)
  deductCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; newBalance: number }>;
  
  // Check if user can afford action
  canAfford(userId: string, amount: number): Promise<boolean>;
  
  // Estimate cost before action
  estimateCost(action: string, params: Record<string, unknown>): Promise<number>;
}

// Credit costs for different actions
export const CREDIT_COSTS = {
  // AI token costs (per 1K tokens)
  'ai.openai.gpt4': 3,
  'ai.openai.gpt4o': 1.5,
  'ai.openai.gpt35': 0.2,
  'ai.anthropic.opus': 4,
  'ai.anthropic.sonnet': 0.8,
  'ai.google.gemini': 0.1,
  
  // Overage costs
  'overage.executions': 0.1,  // Per 10 executions over limit
  'overage.storage': 0.5,     // Per 100MB over limit
  
  // Priority features
  'priority.queue': 10,       // Skip job queue
} as const;
```

---

## 7. Admin & Role System

### 7.1 Add Role Middleware

```typescript
// src/server/middleware/role.ts - CREATE

import { RequestHandler } from 'express';
import { Permission, hasPermission } from '@/shared/constants/permissions';

export function requireRole(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    const userRole = req.user?.role;
    
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource',
        },
      });
    }
    
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const orgRole = req.user?.orgRole;
    
    if (!hasPermission(userRole, orgRole, permission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Permission denied: ${permission}`,
        },
      });
    }
    
    next();
  };
}

// Usage in routes:
// router.get('/admin/users', requireRole('ADMIN', 'SUPER_ADMIN'), listUsers);
// router.delete('/admin/users/:id', requirePermission('admin:users:delete'), deleteUser);
```

### 7.2 Add Admin Audit Middleware

```typescript
// src/server/middleware/admin-audit.ts - CREATE

import { RequestHandler } from 'express';
import { prisma } from '@/lib/prisma';

// Log ALL admin actions automatically
export function adminAudit(): RequestHandler {
  return async (req, res, next) => {
    // Only for admin routes
    if (!req.path.startsWith('/api/admin')) {
      return next();
    }
    
    // Capture original send to log after response
    const originalSend = res.send;
    const startTime = Date.now();
    
    res.send = function(body) {
      // Log after response is sent
      setImmediate(async () => {
        try {
          await prisma.auditLog.create({
            data: {
              userId: req.user?.userId,
              action: `admin.${req.method.toLowerCase()}.${req.path}`,
              resource: 'admin',
              metadata: {
                method: req.method,
                path: req.path,
                query: req.query,
                statusCode: res.statusCode,
                durationMs: Date.now() - startTime,
              },
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
              status: res.statusCode < 400 ? 'success' : 'failure',
            },
          });
        } catch (err) {
          console.error('Failed to log admin action:', err);
        }
      });
      
      return originalSend.call(this, body);
    };
    
    next();
  };
}
```

---

## 8. Workspace Isolation Preparation

### 8.1 Add Workspace Types

```typescript
// src/shared/types/workspace.ts - CREATE

export interface WorkspaceConfig {
  userId: string;
  organizationId?: string;
  
  // Resource limits from plan
  limits: {
    ramMb: number;
    cpuCores: number;
    storageMb: number;
    executionsPerDay: number;
  };
  
  // Current usage
  usage: {
    ramMb: number;
    cpuPercent: number;
    storageMb: number;
    executionsToday: number;
  };
}

export interface WorkspaceJob {
  id: string;
  type: 'plugin.execute' | 'workflow.run' | 'gateway.message';
  
  // Target workspace
  workspaceId: string;
  userId: string;
  
  // Job data
  payload: unknown;
  
  // Priority (for queue ordering)
  priority: number;
  
  // Tracking
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// Job routing interface (for future BullMQ integration)
export interface JobRouter {
  // Route job to correct workspace queue
  route(job: WorkspaceJob): Promise<string>;  // returns queue name
  
  // Get queue for user's workspace
  getQueueName(userId: string): string;
}
```

### 8.2 Add Feature Flags Preparation

```typescript
// src/lib/feature-flags.ts - CREATE

// Simple feature flag system (can upgrade to LaunchDarkly later)

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  
  // Targeting
  userIds?: string[];           // Enable for specific users
  roles?: string[];             // Enable for roles
  plans?: string[];             // Enable for plans
  percentage?: number;          // Gradual rollout (0-100)
}

// In-memory flags (move to DB/Redis later)
const flags: Map<string, FeatureFlag> = new Map();

export function isFeatureEnabled(
  key: string,
  userId?: string,
  userRole?: string,
  userPlan?: string
): boolean {
  const flag = flags.get(key);
  if (!flag) return false;
  if (!flag.enabled) return false;
  
  // Check user targeting
  if (flag.userIds && userId && flag.userIds.includes(userId)) {
    return true;
  }
  
  // Check role targeting
  if (flag.roles && userRole && flag.roles.includes(userRole)) {
    return true;
  }
  
  // Check plan targeting
  if (flag.plans && userPlan && flag.plans.includes(userPlan)) {
    return true;
  }
  
  // Check percentage rollout
  if (flag.percentage && userId) {
    const hash = simpleHash(userId + key);
    return (hash % 100) < flag.percentage;
  }
  
  // Default: enabled for everyone if no targeting
  return flag.enabled && !flag.userIds && !flag.roles && !flag.plans && !flag.percentage;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Initialize default flags
export function initializeFlags(): void {
  // Example flags for gradual feature rollout
  flags.set('workflow_builder', {
    key: 'workflow_builder',
    enabled: false,
    plans: ['PRO', 'BUSINESS', 'ENTERPRISE'],
  });
  
  flags.set('organization_support', {
    key: 'organization_support',
    enabled: false,
    plans: ['BUSINESS', 'ENTERPRISE'],
  });
  
  flags.set('docker_workspace', {
    key: 'docker_workspace',
    enabled: false,
    percentage: 0,  // Start with 0%, gradually increase
  });
}
```

---

## 9. Implementation Checklist

### Phase 2 (Current) - Do BEFORE continuing:

- [ ] **Database Schema Updates**
  - [ ] Add `role`, `organizationId`, `orgRole`, `deletedAt` to User model
  - [ ] Add `organizationId` to Gateway model
  - [ ] Add `UserRole` and `OrgRole` enums
  - [ ] Add `STARTER`, `BUSINESS`, `ENTERPRISE` to PlanType enum
  - [ ] Create `AuditLog` model
  - [ ] Create `CreditBalance` and `CreditTransaction` models
  - [ ] Run migration

- [ ] **Type System**
  - [ ] Update `TokenPayload` with role fields
  - [ ] Create `ServiceContext` type
  - [ ] Create `RequestContext` type
  - [ ] Create `src/shared/constants/plans.ts`
  - [ ] Create `src/shared/constants/permissions.ts`

- [ ] **Service Layer**
  - [ ] Create `src/lib/audit.ts` helper
  - [ ] Create `src/shared/types/context.ts`
  - [ ] Update `auth.service.ts` to include role in token

- [ ] **Middleware**
  - [ ] Create `src/server/middleware/role.ts`
  - [ ] Create `src/server/middleware/admin-audit.ts`

### Phase 3 (Plugin) - Do during Phase 3:

- [ ] **Plugin Types**
  - [ ] Add `PluginExecutionContext` with workflow support
  - [ ] Add `PluginExecutionResult` type
  - [ ] Add `PluginRunner` interface
  - [ ] Create plugin registry pattern

### Phase 4 (Billing) - Do during Phase 4:

- [ ] **Credit System**
  - [ ] Implement `CreditService`
  - [ ] Add credit deduction to AI gateway calls
  - [ ] Add credit purchase flow

### Phase 5 (Launch) - Do during Phase 5:

- [ ] **Feature Flags**
  - [ ] Implement basic feature flag system
  - [ ] Add flags for new features

---

## Summary: Minimum Changes NOW

**Files to create/modify RIGHT NOW:**

1. `prisma/schema.prisma` - Add new fields to User, Gateway, add new models
2. `src/modules/auth/auth.types.ts` - Add role fields to TokenPayload
3. `src/shared/constants/plans.ts` - Create plan limits
4. `src/shared/constants/permissions.ts` - Create permissions
5. `src/shared/types/context.ts` - Create ServiceContext
6. `src/lib/audit.ts` - Create audit helper
7. `src/server/middleware/role.ts` - Create role middleware

**Migration command after schema changes:**
```bash
npx prisma migrate dev --name add_org_support_and_roles
```

---

**Time estimate:** 2-3 hours to implement all changes.

**Benefit:** Saves 20-40 hours of refactoring later + prevents data migration pain.
