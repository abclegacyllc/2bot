# Phase 1.5: Architecture Foundation

> **Goal:** Prepare database schema, types, and patterns for future scalability
> **Estimated Sessions:** 4-6
> **Prerequisites:** Phase 1 complete
> **Why Now:** Prevents painful migrations and refactoring later

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| 1.5.1.1 | Add UserRole and OrgRole enums | ✅ | 1 |
| 1.5.1.2 | Add role fields to User model | ✅ | 1 |
| 1.5.1.3 | Add organizationId to Gateway model | ✅ | 1 |
| 1.5.1.4 | Create AuditLog model | ✅ | 1 |
| 1.5.1.5 | Create CreditBalance + CreditTransaction models | ✅ | 1 |
| 1.5.1.6 | Run migration | ✅ | 1 |
| 1.5.2.1 | Create plans constants | ✅ | 1 |
| 1.5.2.2 | Create permissions constants | ✅ | 1 |
| 1.5.2.3 | Create ServiceContext type | ✅ | 1 |
| 1.5.2.4 | Update TokenPayload with role fields | ✅ | 1 |
| 1.5.3.1 | Create audit helper | ✅ | 1 |
| 1.5.3.2 | Create role middleware | ✅ | 1 |
| 1.5.3.3 | Update auth.service to include role in JWT | ✅ | 1 |
| 1.5.4.1 | Add audit logging to critical auth endpoints (optional) | ⬜ | - |
| **Data Access Layer** |||| 
| 1.5.5.1 | Define Platform vs Tenant table categories | ✅ | 2 |
| 1.5.5.2 | Create TenantContext type | ✅ | 2 |
| 1.5.5.3 | Create DataClient abstraction | ✅ | 2 |
| 1.5.5.4 | Create tenant-aware query helpers | ✅ | 2 |
| 1.5.5.5 | Document databaseConfig for Phase 4 | ✅ | 2 |
| 1.5.5.6 | Add isolationLevel to Plan constants | ✅ | 2 |

---

## 📝 Detailed Tasks

### Task 1.5.1.1: Add UserRole and OrgRole Enums

**Session Type:** Database
**Estimated Time:** 10 minutes
**Prerequisites:** Phase 1 complete

#### Context Files:
- prisma/schema.prisma

#### Deliverables:
- [ ] UserRole enum
- [ ] OrgRole enum
- [ ] Extended PlanType enum

#### Schema:
```prisma
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

// Update existing PlanType
enum PlanType {
  FREE
  STARTER       // ADD - $9/mo tier
  PRO
  BUSINESS      // ADD - $79/mo tier
  ENTERPRISE    // ADD - custom pricing
}
```

#### Done Criteria:
- [ ] Enums added to schema
- [ ] PlanType extended with new tiers
- [ ] No migration errors

---

### Task 1.5.1.2: Add Role Fields to User Model

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.1.1 complete

#### Context Files:
- prisma/schema.prisma

#### Deliverables:
- [ ] Role field added to User
- [ ] Organization fields added to User
- [ ] Security fields added to User
- [ ] Soft delete field added

#### Schema Updates:
```prisma
model User {
  // ... existing fields ...
  
  // ========== ADD THESE FIELDS ==========
  
  // Role System (for admin, developer, support)
  role              UserRole  @default(MEMBER)
  
  // Organization Support (null = individual user)
  organizationId    String?   @map("organization_id")
  departmentId      String?   @map("department_id")
  orgRole           OrgRole?  @map("org_role")
  
  // Security (for future 2FA, account lockout)
  failedLoginCount  Int       @default(0) @map("failed_login_count")
  lockedUntil       DateTime? @map("locked_until")
  lastPasswordChange DateTime? @map("last_password_change")
  
  // Soft Delete Support
  deletedAt         DateTime? @map("deleted_at")
  
  // ========== END NEW FIELDS ==========
  
  // Add new indexes
  @@index([organizationId])
  @@index([deletedAt])
  @@index([role])
}
```

#### Done Criteria:
- [ ] All fields added
- [ ] Indexes added
- [ ] Defaults set correctly

---

### Task 1.5.1.3: Add organizationId to Gateway Model

**Session Type:** Database
**Estimated Time:** 10 minutes
**Prerequisites:** Task 1.5.1.2 complete

#### Context Files:
- prisma/schema.prisma

#### Schema Updates:
```prisma
model Gateway {
  // ... existing fields ...
  
  // ========== ADD FOR ORG SUPPORT ==========
  organizationId String? @map("organization_id")
  // ==========================================
  
  // Add index
  @@index([organizationId])
}
```

#### Done Criteria:
- [ ] organizationId field added
- [ ] Index added
- [ ] Gateway can be owned by org or user

---

### Task 1.5.1.4: Create AuditLog Model

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.1.3 complete

#### Context Files:
- prisma/schema.prisma

#### Schema:
```prisma
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

#### Done Criteria:
- [ ] AuditLog model created
- [ ] All indexes added
- [ ] Can store security events

---

### Task 1.5.1.5: Create CreditBalance + CreditTransaction Models

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.1.4 complete

#### Context Files:
- prisma/schema.prisma

#### Schema:
```prisma
model CreditBalance {
  id        String   @id @default(cuid())
  userId    String   @unique @map("user_id")
  
  balance   Int      @default(0)  // Current credit balance
  lifetime  Int      @default(0)  // Total credits ever purchased
  
  // Auto-topup settings (JSON for flexibility)
  settings  Json     @default("{}")
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
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

// Also add relation to User model:
// creditBalance CreditBalance?
```

#### Done Criteria:
- [ ] CreditBalance model created
- [ ] CreditTransaction model created
- [ ] Relations set up
- [ ] Ready for Phase 4 billing

---

### Task 1.5.1.6: Run Migration

**Session Type:** Database
**Estimated Time:** 5 minutes
**Prerequisites:** Tasks 1.5.1.1-1.5.1.5 complete

#### Command:
```bash
npx prisma migrate dev --name add_architecture_foundation
```

#### Done Criteria:
- [ ] Migration created successfully
- [ ] No errors on existing data
- [ ] Prisma client regenerated
- [ ] Prisma Studio shows new tables/fields

---

### Task 1.5.2.1: Create Plans Constants

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.1.6 complete

#### Deliverables:
- [ ] src/shared/constants/plans.ts

#### Implementation:
```typescript
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

export function canDoAction(
  plan: PlanType, 
  action: keyof typeof PLAN_LIMITS.FREE, 
  currentUsage: number
): boolean {
  const limits = PLAN_LIMITS[plan];
  const limit = limits[action];
  if (limit === -1) return true; // unlimited
  return currentUsage < limit;
}
```

#### Done Criteria:
- [ ] All plan tiers defined
- [ ] Limits match business requirements
- [ ] Helper functions work
- [ ] Type-safe

---

### Task 1.5.2.2: Create Permissions Constants

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.2.1 complete

#### Deliverables:
- [ ] src/shared/constants/permissions.ts

#### Implementation:
```typescript
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
  return allowedRoles.includes(userRole as any) || 
         (orgRole !== null && allowedRoles.includes(orgRole as any));
}

export function getUserPermissions(
  userRole: string,
  orgRole: string | null
): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter(
    permission => hasPermission(userRole, orgRole, permission)
  );
}
```

#### Done Criteria:
- [ ] All permissions defined
- [ ] Role-to-permission mapping complete
- [ ] Helper functions work
- [ ] Future admin features covered

---

### Task 1.5.2.3: Create ServiceContext Type

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.5.2.2 complete

#### Deliverables:
- [ ] src/shared/types/context.ts

#### Implementation:
```typescript
import { PlanType } from '../constants/plans';
import { Permission, hasPermission, getUserPermissions } from '../constants/permissions';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'DEVELOPER' | 'SUPPORT' | 'MEMBER';
export type OrgRole = 'ORG_OWNER' | 'ORG_ADMIN' | 'DEPT_MANAGER' | 'ORG_MEMBER';

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
  getPermissions(): Permission[];
}

export function createServiceContext(
  tokenPayload: {
    userId: string;
    role: UserRole;
    plan: PlanType;
    organizationId?: string;
    orgRole?: OrgRole;
  },
  requestMeta?: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }
): ServiceContext {
  return {
    userId: tokenPayload.userId,
    userRole: tokenPayload.role,
    userPlan: tokenPayload.plan,
    organizationId: tokenPayload.organizationId,
    orgRole: tokenPayload.orgRole,
    ipAddress: requestMeta?.ipAddress,
    userAgent: requestMeta?.userAgent,
    requestId: requestMeta?.requestId,
    
    isAdmin() {
      return ['ADMIN', 'SUPER_ADMIN'].includes(this.userRole);
    },
    
    isOrgContext() {
      return !!this.organizationId;
    },
    
    canDo(permission: Permission) {
      return hasPermission(this.userRole, this.orgRole ?? null, permission);
    },
    
    getPermissions() {
      return getUserPermissions(this.userRole, this.orgRole ?? null);
    },
  };
}
```

#### Done Criteria:
- [ ] ServiceContext interface defined
- [ ] createServiceContext factory works
- [ ] Helper methods functional
- [ ] Ready for use in services

---

### Task 1.5.2.4: Update TokenPayload with Role Fields

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.2.3 complete

#### Context Files:
- src/modules/auth/auth.types.ts

#### Updates:
```typescript
// Update TokenPayload interface
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

// Add RequestContext for middleware
export interface RequestContext extends TokenPayload {
  permissions: string[];
}
```

#### Done Criteria:
- [ ] TokenPayload extended
- [ ] Types imported from context.ts
- [ ] No TypeScript errors
- [ ] JWT will include role info

---

### Task 1.5.3.1: Create Audit Helper

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.2.4 complete

#### Deliverables:
- [ ] src/lib/audit.ts

#### Implementation:
```typescript
import { prisma } from './prisma';
import { ServiceContext } from '@/shared/types/context';

export interface AuditEvent {
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  status?: 'success' | 'failure';
}

export async function audit(
  ctx: ServiceContext | { userId?: string; organizationId?: string; ipAddress?: string; userAgent?: string },
  event: AuditEvent
): Promise<void> {
  try {
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
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error('Failed to create audit log:', error);
  }
}

// Convenience functions for common audit events
export const auditActions = {
  // Auth
  loginSuccess: (ctx: ServiceContext) => audit(ctx, {
    action: 'user.login.success',
    resource: 'user',
    resourceId: ctx.userId,
  }),
  
  loginFailed: (email: string, ipAddress?: string, userAgent?: string, reason?: string) => audit(
    { ipAddress, userAgent },
    {
      action: 'user.login.failed',
      resource: 'user',
      metadata: { email, reason },
      status: 'failure',
    }
  ),
  
  passwordResetRequested: (email: string, ipAddress?: string) => audit(
    { ipAddress },
    {
      action: 'user.password.reset.request',
      resource: 'user',
      metadata: { email },
    }
  ),
  
  passwordResetCompleted: (userId: string, ipAddress?: string) => audit(
    { userId, ipAddress },
    {
      action: 'user.password.reset.complete',
      resource: 'user',
      resourceId: userId,
    }
  ),
  
  // Gateway
  gatewayCreated: (ctx: ServiceContext, gatewayId: string, type: string) => audit(ctx, {
    action: 'gateway.create',
    resource: 'gateway',
    resourceId: gatewayId,
    metadata: { type },
  }),
  
  gatewayDeleted: (ctx: ServiceContext, gatewayId: string) => audit(ctx, {
    action: 'gateway.delete',
    resource: 'gateway',
    resourceId: gatewayId,
  }),
};
```

#### Done Criteria:
- [ ] audit() function created
- [ ] Convenience functions for common events
- [ ] Non-blocking (catches errors)
- [ ] Ready to use in services

---

### Task 1.5.3.2: Create Role Middleware

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.3.1 complete

#### Deliverables:
- [ ] src/server/middleware/role.ts

#### Implementation:
```typescript
import { RequestHandler } from 'express';
import { Permission, hasPermission } from '@/shared/constants/permissions';
import { UserRole, OrgRole } from '@/shared/types/context';

// Require specific roles
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    const userRole = req.user?.role as UserRole;
    
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

// Require specific permission
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const orgRole = req.user?.orgRole as OrgRole | undefined;
    
    if (!hasPermission(userRole, orgRole ?? null, permission)) {
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

// Check if admin (ADMIN or SUPER_ADMIN)
export const requireAdmin: RequestHandler = (req, res, next) => {
  const userRole = req.user?.role;
  
  if (!userRole || !['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
  }
  
  next();
};
```

#### Done Criteria:
- [ ] requireRole middleware works
- [ ] requirePermission middleware works
- [ ] requireAdmin shorthand works
- [ ] Returns proper 403 responses

---

### Task 1.5.3.3: Update auth.service to Include Role in JWT

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.3.2 complete

#### Context Files:
- src/modules/auth/auth.service.ts
- src/lib/jwt.ts

#### Updates:
```typescript
// In auth.service.ts, update createToken call to include role:
const token = await createToken({
  userId: user.id,
  email: user.email,
  plan: user.plan,
  sessionId: session.id,
  role: user.role,              // ADD
  organizationId: user.organizationId ?? undefined,  // ADD
  orgRole: user.orgRole ?? undefined,                // ADD
});

// In auth middleware, update req.user type to include role fields
```

#### Done Criteria:
- [ ] JWT includes role field
- [ ] JWT includes organizationId (if set)
- [ ] JWT includes orgRole (if set)
- [ ] Middleware exposes role on req.user
- [ ] Token still validates correctly

---

### Task 1.5.4.1: Add Audit Logging to Critical Auth Endpoints (Optional)

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.5.3.3 complete

#### Context Files:
- src/server/routes/auth.ts

#### Updates:
Add audit calls to these endpoints:
- POST /login - log success and failure
- POST /register - log new user
- POST /forgot-password - log request
- POST /reset-password - log completion

#### Implementation:
```typescript
// In login route:
try {
  const result = await authService.login(data.email, data.password, ip, userAgent);
  
  // Audit success
  await auditActions.loginSuccess(createServiceContext({
    userId: result.user.id,
    role: result.user.role,
    plan: result.user.plan,
  }, { ipAddress: ip, userAgent }));
  
  return res.json({ success: true, data: result });
} catch (error) {
  // Audit failure
  await auditActions.loginFailed(data.email, ip, userAgent, error.message);
  throw error;
}
```

#### Done Criteria:
- [x] Login success logged
- [x] Login failure logged (with email, no password)
- [x] Password reset request logged
- [x] Password reset completion logged
- [x] No sensitive data in logs

---

### Task 1.5.5.1: Define Platform vs Tenant Table Categories

**Session Type:** Architecture
**Estimated Time:** 15 minutes
**Prerequisites:** None
**Why:** Clear separation enables future database isolation without code changes

#### Deliverables:
- [ ] src/shared/constants/data-categories.ts

#### Implementation:
```typescript
/**
 * Data Categories for Multi-Tenant Architecture
 * 
 * PLATFORM: Business data - always in main database
 * TENANT: Operational data - can be isolated per user/org in future
 */

// Platform tables - always in main database
// These handle identity, billing, and platform operations
export const PLATFORM_TABLES = [
  'User',           // Identity (email, password, role)
  'Session',        // Auth sessions
  'PasswordResetToken',
  'Organization',   // Org registry (metadata only)
  'Membership',     // User-Org relationships
  'Department',     // Dept metadata (not operational data)
  'Plan',           // Plan definitions
  'Subscription',   // Billing subscriptions
  'Invoice',        // Billing invoices
  'Payment',        // Payment records
  'AuditLog',       // Platform-wide audit (security)
  'SupportTicket',  // Support system
  'FAQ',            // Help content
] as const;

// Tenant tables - can be isolated per user/org
// These contain operational data that scales with usage
export const TENANT_TABLES = [
  'Gateway',           // User's bot/AI connections
  'GatewayCredential', // Encrypted credentials
  'Plugin',            // Plugin definitions (shared, but installs are tenant)
  'UserPlugin',        // Installed plugins
  'Workflow',          // Workflow definitions
  'WorkflowStep',      // Workflow steps
  'WorkflowRun',       // Execution history
  'WorkflowStepRun',   // Step execution details
  'Message',           // Chat messages (high volume)
  'Conversation',      // Chat threads
  'AnalyticsEvent',    // Usage analytics
  'ResourceUsage',     // Quota tracking
  'CreditBalance',     // User credits
  'CreditTransaction', // Credit history
  'UserTheme',         // Theme preferences
  'UserWidget',        // Widget configs
  'DashboardLayout',   // Dashboard layout
] as const;

export type PlatformTable = typeof PLATFORM_TABLES[number];
export type TenantTable = typeof TENANT_TABLES[number];

/**
 * Check if a table is tenant-isolatable
 */
export function isTenantTable(table: string): boolean {
  return TENANT_TABLES.includes(table as TenantTable);
}

/**
 * Check if a table must stay in platform DB
 */
export function isPlatformTable(table: string): boolean {
  return PLATFORM_TABLES.includes(table as PlatformTable);
}
```

#### Done Criteria:
- [ ] All current tables categorized
- [ ] Clear separation logic documented
- [ ] Helper functions for checking category

---

### Task 1.5.5.2: Create TenantContext Type

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.5.5.1 complete
**Why:** Extends ServiceContext with tenant isolation info for DataClient routing

#### Deliverables:
- [ ] Update src/shared/types/context.ts

#### Implementation:
```typescript
// Add to existing context.ts

/**
 * Tenant isolation levels
 * Determines where tenant data is stored
 */
export type IsolationLevel = 
  | 'SHARED'      // Data in shared tenant database (Free/Starter)
  | 'DEDICATED'   // Data in dedicated database (Enterprise orgs)
  | 'USER_ISOLATED'; // User has own isolated storage (Pro+ users, future)

/**
 * Tenant scope - who owns the data being accessed
 */
export type TenantScope = 
  | 'USER'         // Personal data (userId only)
  | 'ORGANIZATION' // Organization-wide data
  | 'DEPARTMENT';  // Department-scoped data

/**
 * Extended context for data access layer
 * Includes tenant routing information
 */
export interface TenantContext extends ServiceContext {
  // Tenant identification
  tenantId: string;           // orgId or `user_${userId}` for personal
  tenantScope: TenantScope;
  
  // Database routing (populated by DataClient)
  isolationLevel: IsolationLevel;
  databaseUrl?: string;       // null = use default shared DB
  
  // Helpers
  isIsolated(): boolean;      // Has dedicated database
  getTenantFilter(): TenantFilter; // Get WHERE clause for queries
}

/**
 * Tenant filter for queries
 * Applied automatically by DataClient
 */
export interface TenantFilter {
  userId?: string;
  organizationId?: string | null;
  departmentId?: string;
}

/**
 * Create TenantContext from ServiceContext
 * Database URL resolved from Organization.databaseConfig or Plan.isolationLevel
 */
export function createTenantContext(
  ctx: ServiceContext,
  options?: {
    scope?: TenantScope;
    isolationLevel?: IsolationLevel;
    databaseUrl?: string;
  }
): TenantContext {
  const scope = options?.scope ?? (ctx.organizationId ? 'ORGANIZATION' : 'USER');
  const tenantId = ctx.organizationId ?? `user_${ctx.userId}`;
  const isolationLevel = options?.isolationLevel ?? 'SHARED';
  
  return {
    ...ctx,
    tenantId,
    tenantScope: scope,
    isolationLevel,
    databaseUrl: options?.databaseUrl,
    
    isIsolated() {
      return this.isolationLevel !== 'SHARED';
    },
    
    getTenantFilter() {
      // Organization context: filter by orgId only
      if (this.organizationId) {
        const filter: TenantFilter = { organizationId: this.organizationId };
        if (this.tenantScope === 'DEPARTMENT' && this.departmentId) {
          filter.departmentId = this.departmentId;
        }
        return filter;
      }
      // Personal context: filter by userId + orgId=null
      return {
        userId: this.userId,
        organizationId: null,
      };
    },
  };
}
```

#### Done Criteria:
- [ ] TenantContext interface defined
- [ ] IsolationLevel type defined
- [ ] createTenantContext factory works
- [ ] getTenantFilter returns correct WHERE clause

---

### Task 1.5.5.3: Create DataClient Abstraction

**Session Type:** Backend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 1.5.5.2 complete
**Why:** Abstraction layer between services and Prisma enables future DB routing

#### Deliverables:
- [ ] src/shared/lib/data-client.ts

#### Implementation:
```typescript
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantContext, ServiceContext, createTenantContext } from '../types/context';
import { isTenantTable } from '../constants/data-categories';

// Global Prisma client (current default)
const globalPrisma = new PrismaClient();

// Connection pool for isolated databases (future)
// Map<tenantId, PrismaClient>
const connectionPool = new Map<string, PrismaClient>();

/**
 * DataClient - Tenant-aware database access
 * 
 * NOW: Thin wrapper around Prisma with automatic tenant filtering
 * FUTURE: Routes to correct database based on tenant isolation level
 */
export class DataClient {
  private ctx: TenantContext;
  private prisma: PrismaClient;

  constructor(ctx: TenantContext) {
    this.ctx = ctx;
    this.prisma = this.resolveConnection();
  }

  /**
   * Resolve which database connection to use
   * NOW: Always returns global Prisma client
   * FUTURE: Route based on ctx.isolationLevel and ctx.databaseUrl
   */
  private resolveConnection(): PrismaClient {
    // FUTURE: Implement database routing
    // if (this.ctx.isIsolated() && this.ctx.databaseUrl) {
    //   return this.getOrCreateConnection(this.ctx.tenantId, this.ctx.databaseUrl);
    // }
    return globalPrisma;
  }

  /**
   * Get or create a connection for an isolated tenant
   * FUTURE: Implement connection pooling per tenant
   */
  // private getOrCreateConnection(tenantId: string, databaseUrl: string): PrismaClient {
  //   if (!connectionPool.has(tenantId)) {
  //     const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  //     connectionPool.set(tenantId, client);
  //   }
  //   return connectionPool.get(tenantId)!;
  // }

  /**
   * Get tenant filter for automatic WHERE clause injection
   */
  private getTenantFilter(): { userId?: string; organizationId?: string | null; departmentId?: string } {
    return this.ctx.getTenantFilter();
  }

  // ============================================================
  // Gateway Operations
  // ============================================================
  
  get gateway() {
    const filter = this.getTenantFilter();
    return {
      findMany: (args?: Prisma.GatewayFindManyArgs) => {
        return this.prisma.gateway.findMany({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findFirst: (args?: Prisma.GatewayFindFirstArgs) => {
        return this.prisma.gateway.findFirst({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findUnique: (args: Prisma.GatewayFindUniqueArgs) => {
        // findUnique doesn't need filter - ownership checked in service
        return this.prisma.gateway.findUnique(args);
      },
      create: (args: Prisma.GatewayCreateArgs) => {
        return this.prisma.gateway.create({
          ...args,
          data: {
            ...args.data,
            userId: this.ctx.userId,
            organizationId: this.ctx.organizationId ?? null,
          },
        });
      },
      update: (args: Prisma.GatewayUpdateArgs) => {
        return this.prisma.gateway.update(args);
      },
      delete: (args: Prisma.GatewayDeleteArgs) => {
        return this.prisma.gateway.delete(args);
      },
      count: (args?: Prisma.GatewayCountArgs) => {
        return this.prisma.gateway.count({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
    };
  }

  // ============================================================
  // UserPlugin Operations
  // ============================================================
  
  get userPlugin() {
    const filter = this.getTenantFilter();
    return {
      findMany: (args?: Prisma.UserPluginFindManyArgs) => {
        return this.prisma.userPlugin.findMany({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findFirst: (args?: Prisma.UserPluginFindFirstArgs) => {
        return this.prisma.userPlugin.findFirst({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findUnique: (args: Prisma.UserPluginFindUniqueArgs) => {
        return this.prisma.userPlugin.findUnique(args);
      },
      create: (args: Prisma.UserPluginCreateArgs) => {
        return this.prisma.userPlugin.create({
          ...args,
          data: {
            ...args.data,
            userId: this.ctx.userId,
            organizationId: this.ctx.organizationId ?? null,
          },
        });
      },
      update: (args: Prisma.UserPluginUpdateArgs) => {
        return this.prisma.userPlugin.update(args);
      },
      delete: (args: Prisma.UserPluginDeleteArgs) => {
        return this.prisma.userPlugin.delete(args);
      },
      count: (args?: Prisma.UserPluginCountArgs) => {
        return this.prisma.userPlugin.count({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
    };
  }

  // ============================================================
  // Workflow Operations (V2)
  // ============================================================
  
  get workflow() {
    const filter = this.getTenantFilter();
    return {
      findMany: (args?: Prisma.WorkflowFindManyArgs) => {
        return this.prisma.workflow.findMany({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findFirst: (args?: Prisma.WorkflowFindFirstArgs) => {
        return this.prisma.workflow.findFirst({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
      findUnique: (args: Prisma.WorkflowFindUniqueArgs) => {
        return this.prisma.workflow.findUnique(args);
      },
      create: (args: Prisma.WorkflowCreateArgs) => {
        return this.prisma.workflow.create({
          ...args,
          data: {
            ...args.data,
            userId: this.ctx.userId,
            organizationId: this.ctx.organizationId ?? null,
          },
        });
      },
      update: (args: Prisma.WorkflowUpdateArgs) => {
        return this.prisma.workflow.update(args);
      },
      delete: (args: Prisma.WorkflowDeleteArgs) => {
        return this.prisma.workflow.delete(args);
      },
      count: (args?: Prisma.WorkflowCountArgs) => {
        return this.prisma.workflow.count({
          ...args,
          where: { ...filter, ...args?.where },
        });
      },
    };
  }

  // ============================================================
  // Raw Prisma Access (for platform tables or complex queries)
  // ============================================================
  
  /**
   * Access raw Prisma client for platform tables
   * WARNING: No automatic tenant filtering - use with caution!
   */
  get $platform() {
    return globalPrisma;
  }

  /**
   * Transaction support
   */
  async $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}

/**
 * Get DataClient for a ServiceContext
 * This is the main entry point for services
 */
export function getDataClient(ctx: ServiceContext): DataClient {
  // Convert ServiceContext to TenantContext
  // FUTURE: Lookup isolation level from Organization or Plan
  const tenantCtx = createTenantContext(ctx);
  return new DataClient(tenantCtx);
}

/**
 * Get DataClient with explicit tenant context
 * Used when you need to specify scope or isolation level
 */
export function getDataClientWithContext(ctx: TenantContext): DataClient {
  return new DataClient(ctx);
}
```

#### Usage Example (services):
```typescript
// BEFORE (direct Prisma):
async findByUser(ctx: ServiceContext): Promise<Gateway[]> {
  const where = ctx.organizationId
    ? { organizationId: ctx.organizationId }
    : { userId: ctx.userId, organizationId: null };
  
  return prisma.gateway.findMany({ where });
}

// AFTER (DataClient):
async findByUser(ctx: ServiceContext): Promise<Gateway[]> {
  const db = getDataClient(ctx);
  return db.gateway.findMany(); // Filter auto-applied!
}
```

#### Done Criteria:
- [ ] DataClient class created
- [ ] getDataClient factory function works
- [ ] Tenant filter auto-injected on findMany/findFirst
- [ ] userId/organizationId auto-set on create
- [ ] Raw Prisma access available via $platform
- [ ] Transaction support works

---

### Task 1.5.5.4: Create Tenant-Aware Query Helpers

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 1.5.5.3 complete
**Why:** Common patterns for ownership checks and filtering

#### Deliverables:
- [ ] src/shared/lib/tenant-helpers.ts

#### Implementation:
```typescript
import { ServiceContext, TenantFilter } from '../types/context';
import { ForbiddenError } from './errors';

/**
 * Build ownership filter for queries
 * Handles both personal and organization contexts
 */
export function getOwnershipFilter(ctx: ServiceContext): TenantFilter {
  if (ctx.organizationId) {
    return { organizationId: ctx.organizationId };
  }
  return {
    userId: ctx.userId,
    organizationId: null,
  };
}

/**
 * Build ownership filter including department scope
 */
export function getDepartmentFilter(ctx: ServiceContext): TenantFilter {
  const filter = getOwnershipFilter(ctx);
  if (ctx.departmentId) {
    filter.departmentId = ctx.departmentId;
  }
  return filter;
}

/**
 * Check if user owns a resource
 * Throws ForbiddenError if not authorized
 */
export function checkOwnership<T extends { userId: string; organizationId?: string | null }>(
  ctx: ServiceContext,
  resource: T,
  resourceName = 'Resource'
): void {
  // Super admins can access anything
  if (ctx.isSuperAdmin()) {
    return;
  }

  // Organization context: check org ownership
  if (ctx.organizationId) {
    if (resource.organizationId !== ctx.organizationId) {
      throw new ForbiddenError(`You don't have access to this ${resourceName}`);
    }
    return;
  }

  // Personal context: check user ownership AND no org
  if (resource.userId !== ctx.userId || resource.organizationId !== null) {
    throw new ForbiddenError(`You don't have access to this ${resourceName}`);
  }
}

/**
 * Check department-level access
 * For resources scoped to departments
 */
export function checkDepartmentAccess<T extends { 
  userId: string; 
  organizationId?: string | null;
  departmentId?: string | null;
}>(
  ctx: ServiceContext,
  resource: T,
  resourceName = 'Resource'
): void {
  // First check org-level ownership
  checkOwnership(ctx, resource, resourceName);

  // If resource has department, check department access
  if (resource.departmentId && ctx.departmentId) {
    // Org owners/admins can access all departments
    if (ctx.orgRole === 'ORG_OWNER' || ctx.orgRole === 'ORG_ADMIN') {
      return;
    }
    // Dept managers and members can only access their department
    if (resource.departmentId !== ctx.departmentId) {
      throw new ForbiddenError(`You don't have access to this ${resourceName}`);
    }
  }
}

/**
 * Assert that context has organization
 * Useful for org-only features
 */
export function requireOrgContext(ctx: ServiceContext): asserts ctx is ServiceContext & { organizationId: string } {
  if (!ctx.organizationId) {
    throw new ForbiddenError('This feature requires an organization context');
  }
}

/**
 * Assert that context is personal (no org)
 * Useful for user-only features
 */
export function requirePersonalContext(ctx: ServiceContext): void {
  if (ctx.organizationId) {
    throw new ForbiddenError('This feature is only available in personal workspace');
  }
}
```

#### Done Criteria:
- [ ] getOwnershipFilter helper works
- [ ] checkOwnership validates correctly
- [ ] checkDepartmentAccess handles hierarchy
- [ ] requireOrgContext type assertion works

---

### Task 1.5.5.5: Add databaseConfig to Organization Schema

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.5.5.1 complete
**Why:** Prepare schema for per-org database routing (future)

#### Deliverables:
- [ ] Update prisma/schema.prisma (prepare for Phase 4)

#### Schema Addition (add to Organization model when created in Phase 4):
```prisma
// This will be added to Organization model in Phase 4
// Documenting here for architecture reference

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  
  // ... other fields ...
  
  // ========== DATABASE ISOLATION (Future) ==========
  // Determines where tenant data is stored
  databaseType    DatabaseType @default(SHARED)
  databaseUrl     String?      @map("database_url")  // Encrypted connection string
  databaseRegion  String?      @map("database_region") // 'us-east', 'eu-west', etc.
  
  // ... relationships ...
}

enum DatabaseType {
  SHARED      // Uses default shared database (Free/Starter/Pro)
  DEDICATED   // Has own database instance (Enterprise)
}
```

#### Document in Phase 4:
- [ ] Add note in phase-4-organization.md about these fields
- [ ] Document that databaseUrl should be encrypted
- [ ] Document migration path from shared → dedicated

#### Done Criteria:
- [ ] Schema documented for Phase 4 implementation
- [ ] DatabaseType enum defined
- [ ] databaseUrl field planned
- [ ] Architecture documented

---

### Task 1.5.5.6: Add isolationLevel to Plan Constants

**Session Type:** Backend
**Estimated Time:** 10 minutes
**Prerequisites:** Task 1.5.5.2 complete
**Why:** Define which plans get isolated databases

#### Deliverables:
- [ ] Update src/shared/constants/plans.ts

#### Implementation:
```typescript
import { IsolationLevel } from '../types/context';

// Add to existing PLAN_LIMITS
export const PLAN_LIMITS = {
  FREE: {
    gateways: 1,
    plugins: 3,
    apiCalls: 100,
    workflows: 3,
    workflowRuns: 100,
    // ========== ADD ==========
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
  },
  STARTER: {
    gateways: 3,
    plugins: 10,
    apiCalls: 1000,
    workflows: 10,
    workflowRuns: 500,
    // ========== ADD ==========
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
  },
  PRO: {
    gateways: 10,
    plugins: 50,
    apiCalls: 10000,
    workflows: 50,
    workflowRuns: 5000,
    // ========== ADD ==========
    isolationLevel: 'SHARED' as IsolationLevel,  // Shared but can upgrade
    dedicatedDb: false,
    canUpgradeToIsolated: true,  // Optional add-on
  },
  BUSINESS: {
    gateways: 50,
    plugins: -1,
    apiCalls: 100000,
    workflows: 200,
    workflowRuns: 20000,
    // ========== ADD ==========
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: true,
  },
  ENTERPRISE: {
    gateways: -1,
    plugins: -1,
    apiCalls: -1,
    workflows: -1,
    workflowRuns: -1,
    // ========== ADD ==========
    isolationLevel: 'DEDICATED' as IsolationLevel,  // Always dedicated
    dedicatedDb: true,
    customRegion: true,  // Can choose database region
  },
} as const;

/**
 * Get isolation level for a plan
 */
export function getPlanIsolationLevel(plan: PlanType): IsolationLevel {
  return PLAN_LIMITS[plan].isolationLevel;
}

/**
 * Check if plan supports dedicated database
 */
export function canHaveDedicatedDb(plan: PlanType): boolean {
  const limits = PLAN_LIMITS[plan];
  return limits.dedicatedDb || limits.canUpgradeToIsolated === true;
}
```

#### Done Criteria:
- [ ] isolationLevel added to all plan tiers
- [ ] Enterprise defaults to DEDICATED
- [ ] Helper functions for checking isolation support
- [ ] Documentation clear on upgrade path

---

## ✅ Phase 1.5 Completion Checklist

### Core Architecture (Session 1) ✅
- [x] All enums added (UserRole, OrgRole, extended PlanType)
- [x] User model has role, org, security, and soft delete fields
- [x] Gateway model has organizationId
- [x] AuditLog model created
- [x] CreditBalance + CreditTransaction models created
- [x] Migration applied successfully
- [x] plans.ts constants created
- [x] permissions.ts constants created
- [x] ServiceContext type created
- [x] TokenPayload updated with role fields
- [x] audit.ts helper created
- [x] role.ts middleware created
- [x] auth.service includes role in JWT
- [x] (Optional) Auth endpoints have audit logging

### Data Access Layer (Session 2)
- [ ] data-categories.ts created (Platform vs Tenant tables)
- [ ] TenantContext type added to context.ts
- [ ] IsolationLevel type defined
- [ ] DataClient abstraction created
- [ ] Tenant filter auto-injection working
- [ ] tenant-helpers.ts created
- [ ] getOwnershipFilter helper working
- [ ] checkOwnership helper working
- [ ] PLAN_LIMITS updated with isolationLevel
- [ ] getPlanIsolationLevel helper working
- [ ] Phase 4 documentation updated with databaseConfig fields

**When complete:** Update AI-WORKFLOW.md progress and proceed to Phase 2

---

## 📌 Notes

### Why This Phase Exists
This phase implements architectural foundations that would be painful to add later:
- Database fields on existing tables require data migrations
- Changing service signatures affects all callers
- Adding audit logging without infrastructure is manual per-endpoint

### What We're NOT Doing
- Organization management UI (Phase 6+)
- Credit purchasing (Phase 4)
- Admin dashboard (Phase 6+)
- Role assignment UI (Phase 6+)

We're only adding the **data structures** and **patterns** so future phases can use them.
