# Phase 4: Organization System

> **Goal:** Implement multi-org support with Membership model and context switching
> **Estimated Sessions:** 6-8
> **Prerequisites:** Phase 3 complete

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Organization Models** ||||
| 4.1.1 | Create Organization + Membership models | ✅ | Multi-org support |
| 4.1.2 | Create Department model | ✅ | Org hierarchy |
| 4.1.3 | Create organization service | ✅ | CRUD + invites |
| 4.1.4 | Create department service | ✅ | CRUD + member assignment |
| 4.1.5 | Create organization API endpoints | ✅ | |
| **Context Switching** ||||
| 4.2.1 | Implement context switching logic | ✅ | Personal ↔ Org |
| 4.2.2 | Update auth for context switching | ✅ | Token refresh |
| 4.2.3 | Update ServiceContext for dual context | ✅ | |
| **Organization UI** ||||
| 4.3.1 | Create context switcher component | ✅ | Dropdown in header |
| 4.3.2 | Create organization settings page | ✅ | |
| 4.3.3 | Create member management UI | ✅ | Invite/remove |
| 4.3.4 | Create organization creation flow | ✅ | Modal/page |
| 4.3.5 | Create department management UI | ✅ | CRUD + member assign |
| **Resource Quotas** ||||
| 4.4.1 | Create ResourceQuota model | ✅ | Plan-based limits |
| 4.4.2 | Create quota enforcement service | ✅ | Check before operations |
| 4.4.3 | Create quota API endpoints | ✅ | View/update quotas |
| **Owner & Manager Controls** ||||
| 4.5.1 | Create Owner dashboard (resource overview) | ✅ | View all dept usage |
| 4.5.2 | Create department quota management | ✅ | Set dept limits |
| 4.5.3 | Create Manager dashboard | ✅ | View dept only |
| 4.5.4 | Create employee limit controls | ✅ | Per-employee settings |
| 4.5.5 | Create emergency stop functionality | ✅ | Disable dept/employee |
| **Resource Monitoring** ||||
| 4.6.1 | Create real-time usage tracking | ✅ | API calls, storage |
| 4.6.2 | Create usage history storage | ✅ | Daily/hourly aggregation |
| 4.6.3 | Create monitoring dashboard UI | ✅ | Charts + alerts |
| 4.6.4 | Create alert system | ✅ | Email/Telegram alerts |

---

## 📝 Detailed Tasks

---

## 🏗️ Organization & Workspace Isolation Architecture

### The Problem

```
❌ CURRENT (BROKEN):
User joins org → organizationId stored in User table → ALWAYS in org context
                                                      → Can't access personal workspace
                                                      → Org owner loses personal space
```

### The Solution: Membership Model + Context Switching

```
✅ NEW ARCHITECTURE:

┌─────────────────────────────────────────────────────────────────────────┐
│                           USER                                          │
│                                                                         │
│  Every user ALWAYS has a personal workspace                             │
│  User.plan = personal subscription (FREE by default)                    │
│  User.organizationId = REMOVED (use Membership instead)                 │
│                                                                         │
│  Gateways/Plugins with organizationId=NULL belong to user               │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              │ Can be member of MULTIPLE orgs
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       MEMBERSHIP                                        │
│                                                                         │
│  userId ──────┐                                                         │
│               ├── Links user to org with a ROLE                         │
│  organizationId ┘                                                       │
│                                                                         │
│  role: OWNER | ADMIN | MEMBER                                           │
│  status: ACTIVE | INVITED | SUSPENDED                                   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ORGANIZATION                                       │
│                                                                         │
│  Has own plan, subscription, billing                                    │
│  Gateways/Plugins with organizationId=org.id belong to org              │
│  All members share org resources                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Context Switching Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                         DASHBOARD HEADER                              │
│                                                                       │
│  [Logo]  Dashboard  Gateways  Plugins  │  [Context Switcher ▼]  [👤] │
│                                        │                              │
│                                        │  ┌─────────────────────┐     │
│                                        │  │ 🏠 Personal          │ ← Current │
│                                        │  │ 🏢 Acme Corp         │     │
│                                        │  │ 🏢 My Startup        │     │
│                                        │  │ ─────────────────── │     │
│                                        │  │ + Create Organization│     │
│                                        │  └─────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Isolation

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PERSONAL WORKSPACE (user_123)                     │
│                                                                      │
│  Gateways:     WHERE userId = 'user_123' AND organizationId IS NULL  │
│  Plugins:      WHERE userId = 'user_123' AND organizationId IS NULL  │
│  Subscription: User.subscription                                     │
│  Plan limits:  User.plan                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ORG WORKSPACE (org_456)                           │
│                                                                      │
│  Gateways:     WHERE organizationId = 'org_456'                      │
│  Plugins:      WHERE organizationId = 'org_456'                      │
│  Subscription: Organization.subscription                             │
│  Plan limits:  Organization.plan                                     │
│                                                                      │
│  Access: All members with ACTIVE membership                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Task 4.1.1: Create Organization + Membership Models

**Session Type:** Database
**Estimated Time:** 30 minutes
**Prerequisites:** Phase 3 complete

#### Schema:
```prisma
// ===========================================
// Organization Model
// ===========================================
model Organization {
  id               String       @id @default(cuid())
  name             String
  slug             String       @unique
  
  // Billing (linked in Phase 5)
  plan             PlanType     @default(FREE)
  stripeCustomerId String?      @unique @map("stripe_customer_id")
  
  // Limits (can override plan defaults)
  maxMembers       Int?         @map("max_members")
  
  // ========== DATABASE ISOLATION (Future-Ready) ==========
  // Determines where tenant data is stored
  // See Phase 1.5 Task 1.5.5.5 for architecture details
  databaseType     DatabaseType @default(SHARED)
  databaseUrl      String?      @map("database_url")     // Encrypted if dedicated
  databaseRegion   String?      @map("database_region")  // 'us-east', 'eu-west'
  
  // Timestamps
  createdAt        DateTime     @default(now()) @map("created_at")
  updatedAt        DateTime     @updatedAt @map("updated_at")
  
  // Relations
  memberships      Membership[]
  departments      Department[]
  gateways         Gateway[]
  plugins          UserPlugin[]
  subscription     Subscription?
  
  @@index([slug])
  @@index([databaseType])
  @@map("organizations")
}

// ===========================================
// Database Isolation Type
// ===========================================
enum DatabaseType {
  SHARED      // Uses default shared database (Free/Starter/Pro/Business)
  DEDICATED   // Has own database instance (Enterprise)
}

// ===========================================
// DATABASE ISOLATION ARCHITECTURE
// ===========================================
// 
// This architecture is prepared in Phase 1.5 (Tasks 1.5.5.1-6):
//
// 1. Data Categories (src/shared/constants/data-categories.ts):
//    - PLATFORM_TABLES: Always in main DB (User, Session, Organization, etc.)
//    - TENANT_TABLES: Can be isolated (Gateway, UserPlugin, Workflow, etc.)
//
// 2. TenantContext (src/shared/types/context.ts):
//    - Extends ServiceContext with isolation info
//    - IsolationLevel: SHARED | DEDICATED | USER_ISOLATED
//    - getTenantFilter(): Returns WHERE clause for tenant queries
//
// 3. DataClient (src/shared/lib/data-client.ts):
//    - Routes queries to correct database based on Organization.databaseType
//    - Auto-injects tenant filters on queries
//    - Connection pooling for isolated databases
//
// 4. Plan Isolation Levels (src/shared/constants/plans.ts):
//    - FREE/STARTER/PRO/BUSINESS: SHARED database
//    - ENTERPRISE: DEDICATED database by default
//
// Migration Path (Shared → Dedicated):
// 1. Create new database for org
// 2. Export tenant data from shared DB (TENANT_TABLES only)
// 3. Import to dedicated DB
// 4. Update Organization.databaseType = 'DEDICATED'
// 5. Update Organization.databaseUrl = encrypted connection string
// 6. DataClient automatically routes queries to new DB
//
// Security Notes:
// - databaseUrl MUST be encrypted at rest (use env var or vault)
// - Connection strings should use SSL
// - Each dedicated DB should have unique credentials
// ===========================================

// ===========================================
// Membership Model (User ↔ Organization)
// ===========================================
model Membership {
  id             String           @id @default(cuid())
  userId         String           @map("user_id")
  organizationId String           @map("organization_id")
  
  // Role in this organization
  role           OrgRole          @default(ORG_MEMBER)
  
  // Status
  status         MembershipStatus @default(INVITED)
  
  // Invite tracking
  invitedBy      String?          @map("invited_by")
  invitedAt      DateTime         @default(now()) @map("invited_at")
  joinedAt       DateTime?        @map("joined_at")
  
  // Timestamps
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  
  // Relations
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  @@unique([userId, organizationId])
  @@index([userId])
  @@index([organizationId])
  @@index([status])
  @@map("memberships")
}

enum MembershipStatus {
  INVITED    // Pending invite
  ACTIVE     // Full member
  SUSPENDED  // Temporarily disabled
}
```

#### User Model Updates:
```prisma
model User {
  // REMOVE these fields (use Membership instead):
  // organizationId    String?   @map("organization_id")  -- REMOVE
  // orgRole           OrgRole?  @map("org_role")         -- REMOVE
  // departmentId      String?   @map("department_id")    -- REMOVE
  
  // ADD this relation:
  memberships       Membership[]
}
```

#### Migration Notes:
```sql
-- If users already have organizationId, migrate to Membership:
INSERT INTO memberships (user_id, organization_id, role, status, joined_at)
SELECT id, organization_id, org_role, 'ACTIVE', NOW()
FROM users
WHERE organization_id IS NOT NULL;

-- Then remove columns from users table
ALTER TABLE users DROP COLUMN organization_id;
ALTER TABLE users DROP COLUMN org_role;
ALTER TABLE users DROP COLUMN department_id;
```

#### Done Criteria:
- [ ] Organization table created
- [ ] Membership table created
- [ ] User.organizationId migrated to Membership
- [ ] User.orgRole removed
- [ ] User.departmentId removed
- [ ] Relations working

---

### Task 4.1.2: Create Department Model

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.1.1 complete

#### Schema:
```prisma
// ===========================================
// Department Model (Organization Hierarchy)
// ===========================================
model Department {
  id               String       @id @default(cuid())
  organizationId   String       @map("organization_id")
  name             String
  description      String?
  
  // Resource Quotas (can override org defaults)
  maxWorkflows     Int?         @map("max_workflows")
  maxPlugins       Int?         @map("max_plugins")  
  maxApiCalls      Int?         @map("max_api_calls")    // Per day
  maxStorage       Int?         @map("max_storage")      // MB
  
  // Status
  isActive         Boolean      @default(true) @map("is_active")
  
  // Timestamps
  createdAt        DateTime     @default(now()) @map("created_at")
  updatedAt        DateTime     @updatedAt @map("updated_at")
  
  // Relations
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  members          DepartmentMember[]
  workflows        Workflow[]
  
  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("departments")
}

// ===========================================
// Department Member (User ↔ Department)
// ===========================================
model DepartmentMember {
  id             String           @id @default(cuid())
  userId         String           @map("user_id")
  departmentId   String           @map("department_id")
  membershipId   String           @map("membership_id")
  
  // Role in this department
  role           DepartmentRole   @default(MEMBER)
  
  // Employee-level quotas (can override dept defaults)
  maxWorkflows   Int?             @map("max_workflows")     // Default: 5 for employees
  maxPlugins     Int?             @map("max_plugins")       // Default: 3 for employees
  
  // Timestamps
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  
  // Relations
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  department     Department       @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  membership     Membership       @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  
  @@unique([userId, departmentId])
  @@index([userId])
  @@index([departmentId])
  @@map("department_members")
}

enum DepartmentRole {
  MANAGER    // Can manage dept workflows, set employee limits
  MEMBER     // Can use dept workflows, create personal workflows
}
```

#### Organization Hierarchy:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ORGANIZATION (Company)                             │
│                                                                         │
│  Owner: Full control, set dept quotas, emergency stop                   │
│  Plan: FREE / PRO / ENTERPRISE                                          │
│                                                                         │
│  ┌───────────────────────┐  ┌───────────────────────┐                   │
│  │   DEPARTMENT A        │  │   DEPARTMENT B        │                   │
│  │   (Marketing)         │  │   (Sales)             │                   │
│  │                       │  │                       │                   │
│  │  Manager: Alice       │  │  Manager: Bob         │                   │
│  │  - Set employee limits│  │  - Set employee limits│                   │
│  │  - Manage dept flows  │  │  - Manage dept flows  │                   │
│  │                       │  │                       │                   │
│  │  Members:             │  │  Members:             │                   │
│  │  - Carol (5 flows)    │  │  - Dave (5 flows)     │                   │
│  │  - Eve (3 flows)      │  │  - Frank (5 flows)    │                   │
│  └───────────────────────┘  └───────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [ ] Department table created
- [ ] DepartmentMember table created
- [ ] DepartmentRole enum created
- [ ] Relations to Organization working
- [ ] Quota fields added

---

### Task 4.1.3: Create Organization Service

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 4.1.1 complete

#### Deliverables:
- [ ] src/modules/organization/organization.service.ts
- [ ] src/modules/organization/organization.types.ts

#### Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';

class OrganizationService {
  // Organization CRUD
  async create(ctx: ServiceContext, data: CreateOrgRequest): Promise<Organization>
  async getById(ctx: ServiceContext, id: string): Promise<Organization>
  async update(ctx: ServiceContext, id: string, data: UpdateOrgRequest): Promise<Organization>
  async delete(ctx: ServiceContext, id: string): Promise<void>
  
  // User's organizations
  async getUserOrganizations(userId: string): Promise<OrgWithRole[]>
  
  // Membership management
  async inviteMember(ctx: ServiceContext, orgId: string, email: string, role: OrgRole): Promise<Membership>
  async acceptInvite(ctx: ServiceContext, membershipId: string): Promise<Membership>
  async removeMember(ctx: ServiceContext, orgId: string, userId: string): Promise<void>
  async updateMemberRole(ctx: ServiceContext, orgId: string, userId: string, role: OrgRole): Promise<Membership>
  async getMembers(ctx: ServiceContext, orgId: string): Promise<MemberWithUser[]>
  
  // Validation
  async checkMembership(userId: string, orgId: string): Promise<Membership | null>
  async requireMembership(userId: string, orgId: string, minRole?: OrgRole): Promise<Membership>
}

// Types
interface CreateOrgRequest {
  name: string;
  slug: string;
}

interface OrgWithRole {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  plan: PlanType;
}

interface MemberWithUser {
  id: string;
  role: OrgRole;
  status: MembershipStatus;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  joinedAt?: Date;
}
```

#### Done Criteria:
- [ ] OrganizationService implemented
- [ ] CRUD operations working
- [ ] Membership management working
- [ ] Role checks enforced

---

### Task 4.1.4: Create Department Service

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.1.2 complete

#### Deliverables:
- [ ] src/modules/organization/department.service.ts
- [ ] src/modules/organization/department.types.ts

#### Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';

class DepartmentService {
  // Department CRUD
  async create(ctx: ServiceContext, data: CreateDeptRequest): Promise<Department>
  async getById(ctx: ServiceContext, id: string): Promise<Department>
  async update(ctx: ServiceContext, id: string, data: UpdateDeptRequest): Promise<Department>
  async delete(ctx: ServiceContext, id: string): Promise<void>
  
  // List departments in org
  async getOrgDepartments(ctx: ServiceContext, orgId: string): Promise<Department[]>
  
  // Member management
  async addMember(ctx: ServiceContext, deptId: string, userId: string, role: DepartmentRole): Promise<DepartmentMember>
  async removeMember(ctx: ServiceContext, deptId: string, userId: string): Promise<void>
  async updateMemberRole(ctx: ServiceContext, deptId: string, userId: string, role: DepartmentRole): Promise<DepartmentMember>
  async getMembers(ctx: ServiceContext, deptId: string): Promise<DeptMemberWithUser[]>
  
  // Quota management
  async setDeptQuotas(ctx: ServiceContext, deptId: string, quotas: DeptQuotas): Promise<Department>
  async setMemberQuotas(ctx: ServiceContext, deptId: string, userId: string, quotas: MemberQuotas): Promise<DepartmentMember>
  
  // Validation
  async checkMembership(userId: string, deptId: string): Promise<DepartmentMember | null>
  async requireMembership(userId: string, deptId: string, minRole?: DepartmentRole): Promise<DepartmentMember>
}

// Types
interface CreateDeptRequest {
  name: string;
  description?: string;
}

interface DeptQuotas {
  maxWorkflows?: number;
  maxPlugins?: number;
  maxApiCalls?: number;   // Per day
  maxStorage?: number;    // MB
}

interface MemberQuotas {
  maxWorkflows?: number;  // Default: 5
  maxPlugins?: number;    // Default: 3
}
```

#### Done Criteria:
- [ ] DepartmentService implemented
- [ ] CRUD operations working
- [ ] Member management working
- [ ] Quota management working
- [ ] Role checks enforced

---

### Task 4.1.5: Create Organization API Endpoints

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.1.3, 4.1.4 complete

#### Deliverables:
- [ ] src/server/routes/organization.routes.ts

#### Endpoints:
```typescript
// Organization CRUD
POST   /api/organizations           - Create org (any user)
GET    /api/organizations/:id       - Get org (members only)
PUT    /api/organizations/:id       - Update org (ADMIN+)
DELETE /api/organizations/:id       - Delete org (OWNER only)

// User's organizations
GET    /api/user/organizations      - List my orgs

// Members
GET    /api/organizations/:id/members           - List members
POST   /api/organizations/:id/members/invite    - Invite member (ADMIN+)
DELETE /api/organizations/:id/members/:userId   - Remove member (ADMIN+)
PUT    /api/organizations/:id/members/:userId   - Change role (OWNER only)

// Invites
POST   /api/invites/:id/accept      - Accept invite
POST   /api/invites/:id/decline     - Decline invite
GET    /api/user/invites            - List my pending invites
```

#### Done Criteria:
- [ ] All endpoints implemented
- [ ] Auth middleware applied
- [ ] Role checks enforced
- [ ] Validation working

---

### Task 4.2.1: Implement Context Switching Logic ✅

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.1.5 complete

#### Deliverables:
- [x] POST /api/auth/switch-context
- [x] Context switching utility functions

#### Endpoint:
```typescript
// POST /api/auth/switch-context
interface SwitchContextRequest {
  contextType: 'personal' | 'organization';
  organizationId?: string; // Required if contextType === 'organization'
}

interface SwitchContextResponse {
  token: string;
  context: {
    type: 'personal' | 'organization';
    organizationId?: string;
    organizationName?: string;
    orgRole?: OrgRole;
    plan: PlanType;
  };
}
```

#### Implementation:
```typescript
async switchContext(req: Request): Promise<SwitchContextResponse> {
  const { contextType, organizationId } = req.body;
  const userId = req.user.userId;
  
  if (contextType === 'organization') {
    // Verify user has active membership
    const membership = await orgService.requireMembership(userId, organizationId);
    if (membership.status !== 'ACTIVE') {
      throw new ForbiddenError('Membership not active');
    }
    
    const org = await orgService.getById(ctx, organizationId);
    
    // Generate new token with org context
    return {
      token: generateToken({
        ...basePayload,
        activeContext: {
          type: 'organization',
          organizationId: org.id,
          orgRole: membership.role,
          plan: org.plan,
        },
      }),
      context: {
        type: 'organization',
        organizationId: org.id,
        organizationName: org.name,
        orgRole: membership.role,
        plan: org.plan,
      },
    };
  } else {
    // Switch to personal context
    const user = await userService.getById(userId);
    return {
      token: generateToken({
        ...basePayload,
        activeContext: {
          type: 'personal',
          plan: user.plan,
        },
      }),
      context: {
        type: 'personal',
        plan: user.plan,
      },
    };
  }
}
```

#### Done Criteria:
- [x] Context switching endpoint works
- [x] Validates membership before switching
- [x] Returns new token with updated context
- [x] Returns context info for UI

---

### Task 4.2.2: Update Auth Service for Context ✅

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.2.1 complete

#### Changes to Token Payload:
```typescript
interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;            // System role (MEMBER, ADMIN, SUPER_ADMIN)
  
  // ACTIVE CONTEXT (can be switched)
  activeContext: {
    type: 'personal' | 'organization';
    organizationId?: string;  // Only if type === 'organization'
    orgRole?: OrgRole;        // OWNER, ADMIN, MEMBER
    plan: PlanType;           // Personal or org plan based on context
  };
  
  // Available contexts (for switcher UI)
  availableOrgs: Array<{
    id: string;
    name: string;
    slug: string;
    role: OrgRole;
  }>;
}
```

#### Login Changes:
```typescript
async login(data: LoginRequest): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: { organization: true },
      },
    },
  });
  
  // Build available orgs for switcher
  const availableOrgs = user.memberships.map(m => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
  }));
  
  // Default to personal context
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    activeContext: {
      type: 'personal',
      plan: user.plan,
    },
    availableOrgs,
  };
  
  return { token: generateToken(payload), user: toSafeUser(user) };
}
```

#### Done Criteria:
- [x] Login returns availableOrgs in token
- [x] Default context is personal
- [x] Token refresh preserves context (N/A - no refresh mechanism yet)
- [x] Existing tests pass

---

### Task 4.2.3: Update ServiceContext for Dual Context ✅

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.2.2 complete

#### Deliverables:
- [x] Update src/shared/types/context.ts

#### New Context Structure:
```typescript
export interface ServiceContext {
  // User identity (never changes)
  userId: string;
  userRole: UserRole;
  
  // ACTIVE CONTEXT (from token)
  contextType: 'personal' | 'organization';
  organizationId?: string;
  orgRole?: OrgRole;
  effectivePlan: PlanType;
  
  // Existing helpers (update implementation)
  isAdmin(): boolean;
  isSuperAdmin(): boolean;
  isOrgContext(): boolean;
  canDo(permission: Permission): boolean;
  getPermissions(): Permission[];
  
  // NEW helpers
  isPersonalContext(): boolean;
  getOwnerId(): string | null;  // Returns orgId or null for personal
}

// Helper for queries
export function getOwnershipFilter(ctx: ServiceContext): {
  userId?: string;
  organizationId?: string | null;
} {
  if (ctx.isOrgContext()) {
    return { organizationId: ctx.organizationId };
  }
  return { userId: ctx.userId, organizationId: null };
}
```

#### Create from Token:
```typescript
export function createServiceContext(
  tokenPayload: TokenPayload,
  requestMeta?: RequestMetadata
): ServiceContext {
  return {
    userId: tokenPayload.userId,
    userRole: tokenPayload.role,
    contextType: tokenPayload.activeContext.type,
    organizationId: tokenPayload.activeContext.organizationId,
    orgRole: tokenPayload.activeContext.orgRole,
    effectivePlan: tokenPayload.activeContext.plan,
    ipAddress: requestMeta?.ipAddress,
    userAgent: requestMeta?.userAgent,
    requestId: requestMeta?.requestId,

    isAdmin() {
      return ['ADMIN', 'SUPER_ADMIN'].includes(this.userRole);
    },
    isSuperAdmin() {
      return this.userRole === 'SUPER_ADMIN';
    },
    isOrgContext() {
      return this.contextType === 'organization';
    },
    isPersonalContext() {
      return this.contextType === 'personal';
    },
    getOwnerId() {
      return this.isOrgContext() ? this.organizationId! : null;
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
- [x] ServiceContext has contextType field
- [x] isPersonalContext() helper added
- [x] getOwnerId() helper added
- [x] getOwnershipFilter() utility exported
- [x] All existing code works with new context

---

### Task 4.3.1: Create Context Switcher Component

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.2.3 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/components/layouts/context-switcher.tsx
- [x] Add to dashboard header (src/app/dashboard/page.tsx)

#### Implementation Notes:
- Created ContextSwitcher dropdown component with shadcn/ui
- Shows current context (Personal or Organization name)
- Lists available organizations with role badges
- Supports switching context via switchContext() from AuthProvider
- "Create Organization" button navigates to /dashboard/organizations/new

#### Done Criteria:
- [x] Shows current context
- [x] Lists available organizations
- [x] Can switch context (calls API, updates token)
- [x] Shows role badge for each org
- [x] Has "Create Organization" button

---

### Task 4.3.2: Create Organization Settings Page

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 4.3.1 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/dashboard/settings/organization/page.tsx
- [x] Only visible when in org context

#### Implementation Notes:
- Organization settings page with edit form (name, slug)
- Shows plan badge and creation date
- Links to Members and Departments management
- Danger zone with delete confirmation (OWNER only)
- Redirects non-org contexts to /dashboard/settings

#### Done Criteria:
- [x] Shows org info
- [x] Can edit name/slug (ADMIN+)
- [x] Delete button (OWNER only)
- [x] Redirects to personal if not in org context

---

### Task 4.3.3: Create Member Management UI

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 4.3.2 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/dashboard/settings/organization/members/page.tsx

#### Features:
```tsx
export default function MembersPage() {
  const { data: members } = useSWR('/api/organizations/current/members');
  const { context } = useAuth();
  
  const canInvite = ['ORG_OWNER', 'ORG_ADMIN'].includes(context.orgRole!);
  const canChangeRole = context.orgRole === 'ORG_OWNER';
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Members</h1>
        {canInvite && <InviteMemberButton />}
      </div>
      
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map(member => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={member.user.image} />
                      <AvatarFallback>{member.user.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{member.user.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {member.user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {canChangeRole && member.role !== 'ORG_OWNER' ? (
                    <RoleSelector value={member.role} onValueChange={...} />
                  ) : (
                    <Badge>{member.role.replace('ORG_', '')}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {formatDate(member.joinedAt)}
                </TableCell>
                <TableCell>
                  {canInvite && member.role !== 'ORG_OWNER' && (
                    <RemoveMemberButton memberId={member.id} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
```

#### Implementation Notes:
- Members table with avatar, name, email, role, status, join date
- Invite dialog with email and role selection (ADMIN+)
- Role selector for changing roles (OWNER only, cannot change owner)
- Remove member button (ADMIN+, not self, not owner)
- Shows member status (ACTIVE, PENDING, INACTIVE)

#### Done Criteria:
- [x] Lists all members with roles
- [x] Invite by email (ADMIN+)
- [x] Change roles (OWNER only)
- [x] Remove members (ADMIN+, not self, not owner)
- [x] Shows pending invites

---

### Task 4.3.4: Create Organization Creation Flow

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.3.3 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/dashboard/organizations/new/page.tsx

#### Implementation Notes:
- Create organization form with name and slug fields
- Auto-generates slug from name (can be manually edited)
- Calls POST /api/organizations to create
- Automatically switches context to new org
- Redirects to dashboard after creation

#### Done Criteria:
- [x] Form validates name and slug
- [x] Creates organization via API
- [x] Auto-switches to new org context
- [x] Redirects to dashboard

---

### Task 4.3.5: Create Department Management UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.3.4 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/dashboard/settings/organization/departments/page.tsx

#### Implementation Notes:
- Departments table with name, description, member count, created date
- Create department dialog (ADMIN+)
- Edit department dialog (ADMIN+)
- Delete department confirmation (ADMIN+)
- Warning when deleting dept with members

#### Done Criteria:
- [x] Lists all departments
- [x] Can create new department
- [x] Can edit department
- [x] Can delete department
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL Slug</FormLabel>
                <FormControl>
                  <Input placeholder="acme-corp" {...field} />
                </FormControl>
                <FormDescription>
                  Used in URLs: 2bot.io/org/{field.value || 'slug'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <Button type="submit" className="w-full">
            Create Organization
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

#### Done Criteria:
- [ ] Form validates name and slug
- [ ] Creates organization via API
- [ ] Auto-switches to new org context
- [ ] Redirects to dashboard

---

### Task 4.3.5: Create Department Management UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.3.4 complete

#### Deliverables:
- [ ] src/app/(dashboard)/settings/organization/departments/page.tsx
- [ ] src/components/organization/department-list.tsx
- [ ] src/components/organization/department-modal.tsx

#### Features:
- List all departments with member counts
- Create new department (ADMIN+)
- Edit department name/description (ADMIN+)
- Delete department (ADMIN+)
- Assign members to departments

#### Done Criteria:
- [ ] Lists all departments
- [ ] Can create new department
- [ ] Can edit department
- [ ] Can delete department
- [ ] Can manage department members

---

## 📊 Resource Quota System

### Resource Limits by Plan

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PLAN RESOURCE LIMITS                             │
├─────────────────┬───────────────┬───────────────┬───────────────────────┤
│     Resource    │     FREE      │      PRO      │     ENTERPRISE        │
├─────────────────┼───────────────┼───────────────┼───────────────────────┤
│ Departments     │       1       │       5       │     Unlimited         │
│ Members/Dept    │       3       │      10       │     Unlimited         │
│ Org Workflows   │       5       │      50       │     Unlimited         │
│ Dept Workflows  │       3       │      20       │        100            │
│ Employee Flows  │       2       │       5       │         10            │
│ Workflow Steps  │       5       │      15       │         30            │
│ API Calls/Day   │    1,000      │   50,000      │    500,000            │
│ Storage (MB)    │     100       │    1,000      │     10,000            │
│ Plugin Installs │       5       │      25       │     Unlimited         │
└─────────────────┴───────────────┴───────────────┴───────────────────────┘
```

### Quota Inheritance

```
Organization Quota (from plan)
        │
        ▼
┌───────────────────────────────────┐
│  Department Quota                 │
│  - Can be REDUCED by Owner        │
│  - Cannot exceed org limit        │
│                                   │
│  Example:                         │
│  Org has 50 workflows             │
│  Owner gives Dept A: 30           │
│  Owner gives Dept B: 20           │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│  Employee Quota (Personal)        │
│  - Can be REDUCED by Manager      │
│  - Cannot exceed dept limit       │
│                                   │
│  Example:                         │
│  Dept A has 30 workflows          │
│  Manager gives Alice: 10          │
│  Manager gives Bob: 5             │
│  Dept workflows: 15               │
└───────────────────────────────────┘
```

---

### Task 4.4.1: Create ResourceQuota Model

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.1.2 complete

#### Schema:
```prisma
// ===========================================
// Resource Quota (tracks usage and limits)
// ===========================================
model ResourceQuota {
  id               String       @id @default(cuid())
  
  // Owner reference (one of these)
  organizationId   String?      @unique @map("organization_id")
  departmentId     String?      @unique @map("department_id")
  userId           String?      @unique @map("user_id")
  
  // Limits (null = use parent/plan default)
  maxWorkflows     Int?         @map("max_workflows")
  maxPlugins       Int?         @map("max_plugins")
  maxApiCalls      Int?         @map("max_api_calls")      // Per day
  maxStorage       Int?         @map("max_storage")        // MB
  maxSteps         Int?         @map("max_steps")          // Per workflow
  
  // Current Usage (updated periodically)
  usedWorkflows    Int          @default(0) @map("used_workflows")
  usedPlugins      Int          @default(0) @map("used_plugins")
  usedApiCalls     Int          @default(0) @map("used_api_calls")
  usedStorage      Int          @default(0) @map("used_storage")
  
  // Reset tracking
  apiCallsResetAt  DateTime?    @map("api_calls_reset_at")
  
  // Timestamps
  createdAt        DateTime     @default(now()) @map("created_at")
  updatedAt        DateTime     @updatedAt @map("updated_at")
  
  // Relations
  organization     Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  department       Department?   @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  user             User?         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("resource_quotas")
}

// ===========================================
// Usage History (for monitoring dashboard)
// ===========================================
model UsageHistory {
  id               String       @id @default(cuid())
  
  // Owner reference
  organizationId   String?      @map("organization_id")
  departmentId     String?      @map("department_id")
  userId           String?      @map("user_id")
  
  // Time bucket
  periodStart      DateTime     @map("period_start")
  periodType       PeriodType   @default(DAILY) @map("period_type")
  
  // Metrics
  apiCalls         Int          @default(0) @map("api_calls")
  workflowRuns     Int          @default(0) @map("workflow_runs")
  pluginExecutions Int          @default(0) @map("plugin_executions")
  storageUsed      Int          @default(0) @map("storage_used")    // MB at period end
  errors           Int          @default(0)
  
  // Cost tracking (for enterprise)
  estimatedCost    Decimal?     @map("estimated_cost") @db.Decimal(10, 2)
  
  // Timestamps
  createdAt        DateTime     @default(now()) @map("created_at")
  
  @@unique([organizationId, periodStart, periodType])
  @@unique([departmentId, periodStart, periodType])
  @@unique([userId, periodStart, periodType])
  @@index([periodStart])
  @@map("usage_history")
}

enum PeriodType {
  HOURLY
  DAILY
  WEEKLY
  MONTHLY
}
```

#### Done Criteria:
- [x] ResourceQuota table created
- [x] UsageHistory table created
- [x] PeriodType enum created
- [x] Proper indexes for reporting

**Status:** ✅ COMPLETE

---

### Task 4.4.2: Create Quota Enforcement Service

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 4.4.1 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/modules/quota/quota.service.ts
- [x] src/modules/quota/quota.types.ts

#### Implementation:
```typescript
import { ServiceContext } from '@/shared/types/context';

class QuotaService {
  // ===== Quota Checking =====
  
  /**
   * Check if operation is allowed within quota
   * Throws QuotaExceededError if limit reached
   */
  async checkQuota(
    ctx: ServiceContext,
    resource: ResourceType,
    amount?: number
  ): Promise<void>
  
  /**
   * Get current usage vs limits
   */
  async getQuotaStatus(ctx: ServiceContext): Promise<QuotaStatus>
  
  /**
   * Get effective limits (considering inheritance)
   */
  async getEffectiveLimits(ctx: ServiceContext): Promise<ResourceLimits>
  
  // ===== Usage Tracking =====
  
  /**
   * Increment usage counter
   */
  async incrementUsage(
    ctx: ServiceContext,
    resource: ResourceType,
    amount?: number
  ): Promise<void>
  
  /**
   * Decrement usage counter (on delete)
   */
  async decrementUsage(
    ctx: ServiceContext,
    resource: ResourceType,
    amount?: number
  ): Promise<void>
  
  /**
   * Reset daily counters (called by cron)
   */
  async resetDailyCounters(): Promise<void>
  
  // ===== Admin Operations =====
  
  /**
   * Set quotas for department (Owner only)
   */
  async setDepartmentQuotas(
    ctx: ServiceContext,
    departmentId: string,
    quotas: Partial<ResourceLimits>
  ): Promise<ResourceQuota>
  
  /**
   * Set quotas for employee (Manager only)
   */
  async setEmployeeQuotas(
    ctx: ServiceContext,
    userId: string,
    quotas: Partial<ResourceLimits>
  ): Promise<ResourceQuota>
}

// Types
enum ResourceType {
  WORKFLOW = 'workflow',
  PLUGIN = 'plugin',
  API_CALL = 'api_call',
  STORAGE = 'storage',
  WORKFLOW_STEP = 'workflow_step',
}

interface QuotaStatus {
  workflows: { used: number; limit: number; percentage: number };
  plugins: { used: number; limit: number; percentage: number };
  apiCalls: { used: number; limit: number; percentage: number; resetsAt: Date };
  storage: { used: number; limit: number; percentage: number };
}

class QuotaExceededError extends Error {
  constructor(
    public resource: ResourceType,
    public current: number,
    public limit: number
  ) {
    super(`Quota exceeded for ${resource}: ${current}/${limit}`);
  }
}
```

#### Integration Points:
```typescript
// In workflow.service.ts
async createWorkflow(ctx: ServiceContext, data: CreateWorkflowInput) {
  // Check quota BEFORE creating
  await quotaService.checkQuota(ctx, ResourceType.WORKFLOW);
  
  const workflow = await prisma.workflow.create({ ... });
  
  // Increment usage AFTER creating
  await quotaService.incrementUsage(ctx, ResourceType.WORKFLOW);
  
  return workflow;
}

// In workflow.service.ts
async deleteWorkflow(ctx: ServiceContext, workflowId: string) {
  await prisma.workflow.delete({ ... });
  
  // Decrement usage AFTER deleting
  await quotaService.decrementUsage(ctx, ResourceType.WORKFLOW);
}
```

#### Done Criteria:
- [x] Quota checking working
- [x] Usage tracking working
- [x] Plan limits respected
- [x] Inheritance working (org → dept → employee)
- [x] QuotaExceededError thrown appropriately

---

### Task 4.4.3: Create Quota API Endpoints

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.4.2 complete
**Status:** ✅ COMPLETE

#### Endpoints:
```typescript
// View quotas
GET    /api/quota/status              - Get current quota status
GET    /api/quota/limits              - Get effective limits

// Admin - Org level (Owner only)
GET    /api/organizations/:id/quotas  - Get org quota settings
PUT    /api/organizations/:id/quotas  - Update org default quotas

// Admin - Dept level (Owner only)
GET    /api/departments/:id/quotas    - Get dept quota settings
PUT    /api/departments/:id/quotas    - Update dept quotas

// Admin - Employee level (Manager+)
GET    /api/departments/:id/members/:userId/quotas  - Get employee quotas
PUT    /api/departments/:id/members/:userId/quotas  - Update employee quotas
```

#### Done Criteria:
- [x] All endpoints implemented
- [x] Role-based access control
- [x] Validation for quota limits

---

### Task 4.5.1: Create Owner Dashboard (Resource Overview)

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 4.4.3 complete

#### Deliverables:
- [x] src/app/dashboard/settings/organization/resources/page.tsx
- [x] src/components/organization/resource-overview.tsx

#### Features:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OWNER RESOURCE DASHBOARD                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Organization: Acme Corp                    Plan: PRO                   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  OVERALL USAGE                                                   │   │
│  │                                                                  │   │
│  │  Workflows: ████████░░ 40/50 (80%)                               │   │
│  │  Plugins:   ███░░░░░░░ 8/25 (32%)                                │   │
│  │  API Calls: █████░░░░░ 25,000/50,000 (50%)                       │   │
│  │  Storage:   ██░░░░░░░░ 200/1000 MB (20%)                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  DEPARTMENT BREAKDOWN                                            │   │
│  │                                                                  │   │
│  │  Marketing     ██████░░░░  15/25 workflows  [Edit Quota]         │   │
│  │  Sales         ████░░░░░░  10/20 workflows  [Edit Quota]         │   │
│  │  Engineering   ████████░░  20/25 workflows  [Edit Quota]         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [Emergency Stop All] [Export Report]                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [x] Shows org-wide usage
- [x] Shows per-department breakdown
- [x] Can edit department quotas
- [x] Has emergency stop button
- [x] Export usage report

---

### Task 4.5.2: Create Department Quota Management

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.5.1 complete

#### Deliverables:
- [x] src/components/organization/dept-quota-modal.tsx
- [x] src/app/dashboard/settings/organization/departments/[id]/quotas/page.tsx

#### Features:
```tsx
<Dialog>
  <DialogHeader>
    <DialogTitle>Set Quota for Marketing</DialogTitle>
  </DialogHeader>
  
  <DialogContent>
    <div className="space-y-4">
      <FormField>
        <Label>Max Workflows</Label>
        <Input type="number" value={quotas.maxWorkflows} />
        <HelperText>Organization limit: 50</HelperText>
      </FormField>
      
      <FormField>
        <Label>Max Plugins</Label>
        <Input type="number" value={quotas.maxPlugins} />
      </FormField>
      
      <FormField>
        <Label>Max API Calls (per day)</Label>
        <Input type="number" value={quotas.maxApiCalls} />
      </FormField>
      
      <FormField>
        <Label>Max Storage (MB)</Label>
        <Input type="number" value={quotas.maxStorage} />
      </FormField>
    </div>
  </DialogContent>
  
  <DialogFooter>
    <Button variant="outline">Cancel</Button>
    <Button>Save Quotas</Button>
  </DialogFooter>
</Dialog>
```

#### Done Criteria:
- [x] Modal opens from dashboard
- [x] Shows current vs org limit
- [x] Validates limits don't exceed org
- [x] Saves to API

---

### Task 4.5.3: Create Manager Dashboard

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 4.5.2 complete

#### Deliverables:
- [x] src/app/dashboard/department/resources/page.tsx
- [x] src/components/department/dept-resource-view.tsx

#### Features:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                   MANAGER RESOURCE DASHBOARD                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Department: Marketing                                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  DEPARTMENT USAGE                                                │   │
│  │                                                                  │   │
│  │  Workflows: ██████░░░░ 15/25 (60%)                               │   │
│  │  Plugins:   ███░░░░░░░ 5/15 (33%)                                │   │
│  │  API Calls: ████░░░░░░ 8,000/20,000 (40%)                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  EMPLOYEE BREAKDOWN                                              │   │
│  │                                                                  │   │
│  │  Alice       ████████░░  4/5 personal workflows  [Edit]          │   │
│  │  Bob         ██░░░░░░░░  1/5 personal workflows  [Edit]          │   │
│  │  Carol       ██████░░░░  3/5 personal workflows  [Edit]          │   │
│  │  (Shared)    ██████░░░░  7/10 department workflows               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [Pause Employee] [View Activity]                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [x] Shows department usage only
- [x] Shows per-employee breakdown
- [x] Can edit employee quotas
- [x] Can pause employee (emergency)
- [x] No access to other departments

---

### Task 4.5.4: Create Employee Limit Controls

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.5.3 complete

#### Deliverables:
- [x] src/components/department/employee-quota-modal.tsx

#### Features:
```
- Set max personal workflows (default: 5)
- Set max personal plugins (default: 3)
- Cannot exceed department limits
- Shows current usage
```

#### Done Criteria:
- [x] Modal for editing employee limits
- [x] Validates against dept limits
- [x] Shows current usage vs new limit

---

### Task 4.5.5: Create Emergency Stop Functionality

**Session Type:** Backend + Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.5.4 complete

#### Backend Implementation:
```typescript
// Emergency stop for department (Owner only)
POST /api/departments/:id/emergency-stop

async emergencyStopDepartment(ctx: ServiceContext, deptId: string) {
  // 1. Set department.isActive = false
  await prisma.department.update({
    where: { id: deptId },
    data: { isActive: false }
  });
  
  // 2. Pause all department workflows
  await prisma.workflow.updateMany({
    where: { departmentId: deptId },
    data: { status: 'PAUSED' }
  });
  
  // 3. Disable all employee personal workflows in dept
  const members = await prisma.departmentMember.findMany({
    where: { departmentId: deptId }
  });
  
  await prisma.workflow.updateMany({
    where: { 
      userId: { in: members.map(m => m.userId) },
      scope: 'PERSONAL'
    },
    data: { status: 'PAUSED' }
  });
  
  // 4. Log action
  await auditService.log(ctx, 'EMERGENCY_STOP_DEPARTMENT', { deptId });
  
  // 5. Send notifications
  await notificationService.notifyEmergencyStop(deptId);
}

// Emergency stop for employee (Manager+)
POST /api/departments/:id/members/:userId/emergency-stop
```

#### Frontend:
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Emergency Stop</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Emergency Stop Department?</AlertDialogTitle>
      <AlertDialogDescription>
        This will immediately:
        • Disable the department
        • Pause all department workflows
        • Pause all employee personal workflows
        
        Are you sure?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleEmergencyStop}>
        Yes, Stop Everything
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### Done Criteria:
- [x] Emergency stop endpoint working
- [x] Pauses all related workflows
- [x] Confirmation dialog
- [x] Audit logging
- [ ] Notifications sent (deferred - notification service not implemented yet)

---

### Task 4.6.1: Create Real-Time Usage Tracking

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 4.4.2 complete

#### Deliverables:
- [ ] src/modules/quota/usage-tracker.service.ts

#### Implementation:
```typescript
class UsageTracker {
  // Track API calls (called from middleware)
  async trackApiCall(ctx: ServiceContext): Promise<void> {
    // Increment daily counter
    await prisma.resourceQuota.update({
      where: { userId: ctx.userId },
      data: { usedApiCalls: { increment: 1 } }
    });
    
    // Also track at org/dept level
    if (ctx.organizationId) {
      await prisma.resourceQuota.update({
        where: { organizationId: ctx.organizationId },
        data: { usedApiCalls: { increment: 1 } }
      });
    }
  }
  
  // Track workflow execution
  async trackWorkflowRun(
    ctx: ServiceContext, 
    workflowId: string,
    stepCount: number
  ): Promise<void>
  
  // Track plugin execution
  async trackPluginExecution(
    ctx: ServiceContext,
    pluginId: string
  ): Promise<void>
  
  // Track storage usage
  async trackStorageChange(
    ctx: ServiceContext,
    deltaBytes: number
  ): Promise<void>
  
  // Get real-time usage (for dashboard)
  async getRealTimeUsage(ctx: ServiceContext): Promise<RealTimeUsage>
}
```

#### Done Criteria:
- [ ] API call tracking in middleware
- [ ] Workflow execution tracking
- [ ] Plugin execution tracking
- [ ] Storage tracking
- [ ] Real-time query working

---

### Task 4.6.2: Create Usage History Storage

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.6.1 complete

#### Deliverables:
- [ ] src/modules/quota/usage-aggregator.service.ts
- [ ] Cron job for aggregation

#### Implementation:
```typescript
class UsageAggregator {
  // Run every hour (cron job)
  async aggregateHourlyUsage(): Promise<void> {
    const hourStart = startOfHour(new Date());
    
    // Get all orgs
    const orgs = await prisma.organization.findMany();
    
    for (const org of orgs) {
      // Count this hour's activity
      const metrics = await this.getHourlyMetrics(org.id, hourStart);
      
      // Store in history
      await prisma.usageHistory.upsert({
        where: {
          organizationId_periodStart_periodType: {
            organizationId: org.id,
            periodStart: hourStart,
            periodType: 'HOURLY'
          }
        },
        create: {
          organizationId: org.id,
          periodStart: hourStart,
          periodType: 'HOURLY',
          ...metrics
        },
        update: metrics
      });
    }
  }
  
  // Run daily at midnight
  async aggregateDailyUsage(): Promise<void>
  
  // Get usage history for charts
  async getUsageHistory(
    ctx: ServiceContext,
    options: {
      period: PeriodType;
      startDate: Date;
      endDate: Date;
    }
  ): Promise<UsageHistoryPoint[]>
}
```

#### Done Criteria:
- [ ] Hourly aggregation working
- [ ] Daily aggregation working
- [ ] History query API
- [ ] Cron jobs configured

---

### Task 4.6.3: Create Monitoring Dashboard UI

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 4.6.2 complete

#### Deliverables:
- [ ] src/app/dashboard/settings/organization/monitoring/page.tsx
- [ ] src/components/organization/usage-charts.tsx

#### Features:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MONITORING DASHBOARD                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Real-Time] [24 Hours] [7 Days] [30 Days]           [Export CSV]       │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  API CALLS                                                       │   │
│  │      ╭────╮                                                      │   │
│  │     ╱      ╲    ╭──╮                                             │   │
│  │  ──╯        ╰──╯    ╲───                                         │   │
│  │  12:00  14:00  16:00  18:00  20:00  22:00  Now                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  WORKFLOW RUNS                                                   │   │
│  │  (similar chart)                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ERROR RATE                                                      │   │
│  │  (similar chart with red highlight)                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ HEALTH: OK   │  │ ERRORS: 12   │  │ COST: $45.20 │                   │
│  │ ● All green  │  │ Last 24h     │  │ This month   │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [ ] Time period selector
- [ ] API calls chart
- [ ] Workflow runs chart
- [ ] Error rate chart
- [ ] Health/errors/cost cards
- [ ] CSV export

---

### Task 4.6.4: Create Alert System

**Session Type:** Backend + Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 4.6.3 complete

#### Deliverables:
- [ ] src/modules/alerts/alert.service.ts
- [ ] src/modules/alerts/alert.types.ts
- [ ] src/components/organization/alert-settings.tsx

#### Implementation:
```typescript
// Alert configuration schema
interface AlertConfig {
  // Resource alerts
  quotaWarningThreshold: number;   // 80% by default
  quotaCriticalThreshold: number;  // 95% by default
  
  // Error alerts
  errorRateThreshold: number;      // Errors per hour
  consecutiveFailures: number;     // Workflow failures in a row
  
  // Cost alerts (enterprise)
  dailyCostThreshold?: number;
  monthlyCostThreshold?: number;
  
  // Notification channels
  channels: {
    email: boolean;
    telegram?: string;  // Chat ID
    webhook?: string;   // Custom webhook URL
  };
}

class AlertService {
  // Check thresholds (called periodically)
  async checkAlerts(orgId: string): Promise<void> {
    const quota = await quotaService.getQuotaStatus(orgId);
    const config = await this.getAlertConfig(orgId);
    
    // Check each resource
    for (const [resource, status] of Object.entries(quota)) {
      if (status.percentage >= config.quotaCriticalThreshold) {
        await this.sendAlert({
          type: 'QUOTA_CRITICAL',
          resource,
          current: status.used,
          limit: status.limit,
          percentage: status.percentage
        });
      } else if (status.percentage >= config.quotaWarningThreshold) {
        await this.sendAlert({
          type: 'QUOTA_WARNING',
          ...
        });
      }
    }
  }
  
  // Send alert via configured channels
  async sendAlert(alert: Alert): Promise<void>
  
  // Configure alerts
  async updateAlertConfig(
    ctx: ServiceContext,
    config: Partial<AlertConfig>
  ): Promise<AlertConfig>
}
```

#### Alert Types:
```typescript
enum AlertType {
  // Resource alerts
  QUOTA_WARNING = 'quota_warning',
  QUOTA_CRITICAL = 'quota_critical',
  QUOTA_EXCEEDED = 'quota_exceeded',
  
  // Error alerts
  ERROR_RATE_HIGH = 'error_rate_high',
  WORKFLOW_FAILED = 'workflow_failed',
  CIRCUIT_OPEN = 'circuit_open',
  
  // Cost alerts
  COST_WARNING = 'cost_warning',
  COST_EXCEEDED = 'cost_exceeded',
  
  // Security alerts
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  EMERGENCY_STOP = 'emergency_stop',
}
```

#### Done Criteria:
- [ ] Alert checking cron job
- [ ] Email notification
- [ ] Telegram notification (optional)
- [ ] Webhook notification (optional)
- [ ] Alert configuration UI
- [ ] Alert history view

---

## ✅ Phase 4 Completion Checklist

### Organization Models
- [ ] Organization model created
- [ ] Membership model created
- [ ] Department model created
- [ ] DepartmentMember model created
- [ ] User.organizationId migrated to Membership
- [ ] User.orgRole removed
- [ ] User.departmentId removed

### Organization Service
- [ ] OrganizationService CRUD working
- [ ] DepartmentService CRUD working
- [ ] Membership management working
- [ ] Department member management working
- [ ] Role checks enforced
- [ ] API endpoints working

### Context Switching
- [ ] Switch context endpoint working
- [ ] Token includes activeContext
- [ ] ServiceContext reads from activeContext
- [ ] getOwnershipFilter() helper working
- [ ] All existing code works

### Resource Quotas
- [ ] ResourceQuota model created
- [ ] UsageHistory model created
- [ ] Quota enforcement service working
- [ ] Plan limits respected
- [ ] Inheritance working (org → dept → employee)
- [ ] Quota API endpoints working

### Owner & Manager Controls
- [ ] Owner dashboard showing org-wide usage
- [ ] Department quota management modal
- [ ] Manager dashboard showing dept usage
- [ ] Employee limit controls
- [ ] Emergency stop functionality
- [ ] Audit logging for admin actions

### Resource Monitoring
- [ ] Real-time usage tracking working
- [ ] Usage history aggregation (hourly/daily)
- [ ] Monitoring dashboard with charts
- [ ] Alert system configured
- [ ] Email notifications working
- [ ] CSV export working

### Organization UI
- [ ] Context switcher in header
- [ ] Organization settings page
- [ ] Member management UI
- [ ] Department management UI
- [ ] Create organization flow
- [ ] Invite flow working

### Data Isolation Verification
- [ ] Personal workspace: userId + organizationId=NULL
- [ ] Org workspace: organizationId only
- [ ] Dept workspace: departmentId + organizationId
- [ ] User can't access other user's personal data
- [ ] User can't access orgs they're not member of
- [ ] Manager can't access other departments
- [ ] Org members share org resources

### Database Isolation (Future-Ready)
- [ ] DatabaseType enum created (SHARED, DEDICATED)
- [ ] Organization.databaseType field added
- [ ] Organization.databaseUrl field added (nullable)
- [ ] Organization.databaseRegion field added (nullable)
- [ ] Index on databaseType for routing queries
- [ ] Migration handles existing orgs (default SHARED)

---

## 📊 Task Summary

| Section | Tasks | Estimated Time |
|---------|-------|----------------|
| Organization Models | 5 | 145 min |
| Context Switching | 3 | 80 min |
| Resource Quotas | 3 | 85 min |
| Owner & Manager Controls | 5 | 170 min |
| Resource Monitoring | 4 | 150 min |
| Organization UI | 5 | 165 min |
| **Total** | **25** | **~13 hours** |

---

**When complete:** Update CURRENT-STATE.md and proceed to Phase 5 (Billing)
