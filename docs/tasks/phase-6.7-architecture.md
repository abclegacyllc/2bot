# Phase 6.7: Architecture Alignment

> **Goal:** Align API architecture with ROADMAP URL-based design pattern
> **Estimated Sessions:** 4 (+ 1 optional for enterprise subdomain prep)
> **Prerequisites:** Phase 6.6 complete
> **Why:** Current token-based context causes team confusion and security audit complexity

---

## 🏢 Enterprise Subdomain Readiness

**Your Cloudflare Subdomains → Target Architecture:**

| Subdomain | Purpose | Service | Port | Status |
|-----------|---------|---------|------|--------|
| `2bot.org` | Landing/Marketing | Next.js (public pages) | :3002 | ✅ Ready |
| `dash.2bot.org` | Dashboard UI | Next.js (dashboard) | :3000 | ⚠️ Needs config |
| `api.2bot.org` | Backend API | Express | :3001 | ⚠️ Needs config |
| `admin.2bot.org` | Admin Panel | Next.js (admin routes) | :3003 | ⚠️ Needs separation |
| `support.2bot.org` | Support Team Dashboard | Next.js (Phase 7) | :3004 | 🔲 Phase 7 |
| `docs.2bot.org` | Public Documentation | Static/Docusaurus | :3005 | 🔲 Future |
| `dev.2bot.org` | Developer Portal/SDK | Next.js or static | :3006 | 🔲 Future |

**Current Architecture:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CURRENT (Single Domain)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  2bot.org/* → Next.js (:3000) → proxy /api/* → Express (:3001)         │
│                                                                         │
│  Browser calls: 2bot.org/api/gateways                                   │
│  Next.js proxies to: localhost:3001/api/gateways                        │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ENTERPRISE (Subdomains)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  2bot.org            → Landing/Marketing pages (:3002)                  │
│  dash.2bot.org       → Dashboard UI (:3000)                             │
│  api.2bot.org        → Express API (:3001) - direct, no proxy           │
│  admin.2bot.org      → Admin Panel (:3003)                              │
│  support.2bot.org    → Support Team Dashboard (:3004) - Phase 7         │
│  docs.2bot.org       → Public Documentation (:3005) - Future            │
│  dev.2bot.org        → Developer Portal/SDK (:3006) - Future            │
│                                                                         │
│  Browser calls: api.2bot.org/user/gateways (direct to Express!)         │
│  No proxy layer needed! Faster, simpler.                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Reference: GitHub URL Patterns

**GitHub uses DIFFERENT patterns for Web UI vs API:**

| Context | Web UI (Browser) | API (fetch/curl) |
|---------|------------------|------------------|
| **User/Personal** | `github.com/settings/...` | `api.github.com/user/...` |
| **Organization** | `github.com/organizations/:orgName/settings/...` | `api.github.com/orgs/:orgName/...` |

**2Bot Equivalent Patterns:**

| Context | Web UI (Dashboard Pages) | API (Backend Calls) |
|---------|--------------------------|---------------------|
| **User/Personal** | `/dashboard/settings/...` | `/api/user/...` |
| **Organization** | `/dashboard/organizations/:orgId/settings/...` | `/api/orgs/:orgId/...` |

**Summary for developers:**
- 🌐 **Personal pages (browser):** `/dashboard/...` or `/dashboard/settings/...`
- 🌐 **Org pages (browser):** `/dashboard/organizations/:orgId/...`
- 🔌 **Personal API (fetch):** `/api/user/...`
- 🔌 **Org API (fetch):** `/api/orgs/:orgId/...`

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| **Backend Routes** ||||
 | 6.7.1.1 | Create `/api/user/*` backend routes | ✅ | 1 |
| 6.7.1.2 | Create `/api/orgs/*` backend routes | ✅ | 1 |
| 6.7.1.3 | Create department router separation | ✅ | 1 |
| 6.7.1.4 | Deprecate context-based endpoints | ✅ | 1 |
| **Frontend Migration** ||||
| 6.7.2.1 | Update dashboard to `/api/user/*` URLs | ✅ | 2 |
| 6.7.2.2 | Update org pages to `/api/orgs/*` URLs | ✅ | 2 |
| 6.7.2.3 | Update Next.js proxy routes | ✅ | 2 |
| 6.7.2.4 | Keep context switcher for UI only | ✅ | 2 |
| **Token Simplification** ||||
| 6.7.3.1 | Simplify JWT token payload | ✅ | 3 |
| 6.7.3.2 | Update auth middleware | ✅ | 3 |
| 6.7.3.3 | Update frontend auth provider | ✅ | 3 |
| **Verification** ||||
| 6.7.4.1 | Update API documentation | ✅ | 4 |
| 6.7.4.2 | Architecture alignment smoke test | ✅ | 4 |
| 6.7.4.3 | Production deployment re-verification | ✅ | 4 |
| **Enterprise Prep (Optional)** ||||
| 6.7.5.1 | Configure CORS for subdomains | ✅ | 5 |
| 6.7.5.2 | Add environment-based URL configuration | ✅ | 5 |
| 6.7.5.3 | Remove `/api` prefix from Express routes | ✅ | 5 |
| 6.7.5.4 | Update docker-compose for subdomain deploy | ✅ | 5 |

---

## 📖 Background

### The Problem

The original ROADMAP specified URL-based API patterns:
- `/api/user/*` for personal resources
- `/api/orgs/*` for organization resources (GitHub uses `/orgs/` plural)

However, Phase 4 implementation used token-based context switching where the same URL returns different data based on JWT `activeContext`. This causes:
- Team confusion (which context am I in?)
- Debugging difficulty (must decode JWT to understand)
- Security audit complexity (same URL, different data)
- Caching limitations (cannot cache by URL)

### Migration Strategy

**GitHub uses TWO URL patterns:**
| Type | Pattern | Example |
|------|---------|---------|
| Web UI | `/organizations/:orgName/...` | `github.com/organizations/ABC-LEGACY-LLC/settings` |
| API | `/orgs/:org/...` | `api.github.com/orgs/ABC-LEGACY-LLC/repos` |

**Our 2Bot pattern (matching GitHub):**
| Type | Pattern | Example |
|------|---------|---------|
| Dashboard Pages | `/dashboard/organizations/:orgId/...` | `/dashboard/organizations/abc123/settings` |
| Backend API | `/api/orgs/:orgId/...` | `/api/orgs/abc123/gateways` |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BEFORE (Token-Based)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  GET /api/gateways + JWT{activeContext: personal}  → User gateways      │
│  GET /api/gateways + JWT{activeContext: org_123}   → Org gateways       │
│                                                                         │
│  Same URL, different data based on token                                │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AFTER (URL-Based - GitHub Style)                │
├─────────────────────────────────────────────────────────────────────────┤
│  Dashboard: /dashboard/organizations/:orgId/...  (Web UI pattern)       │
│  API:       /api/orgs/:orgId/...                 (API pattern)          │
│                                                                         │
│  GET /api/user/gateways              → User's personal gateways         │
│  GET /api/orgs/:orgId/gateways       → Organization's gateways          │
│                                                                         │
│  URL explicitly states context, token only for auth                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📝 Detailed Tasks

### Task 6.7.1.1: Create `/api/user/*` Backend Routes

**Session Type:** Backend
**Estimated Time:** 45 minutes
**Prerequisites:** Phase 6.6 complete

#### Deliverables:
- [ ] src/server/routes/user.ts (new router)
- [ ] Personal gateway routes
- [ ] Personal plugin routes  
- [ ] Personal quota routes
- [ ] User organizations list route

#### Implementation:
```typescript
// src/server/routes/user.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/async-handler";
import { gatewayService } from "@/modules/gateway";
import { pluginService } from "@/modules/plugin";
import { quotaService } from "@/modules/quota";
import { organizationService } from "@/modules/organization";

export const userRouter = Router();

// All routes require authentication
userRouter.use(requireAuth);

/**
 * GET /api/user/gateways
 * List user's personal gateways (organizationId IS NULL)
 */
userRouter.get("/gateways", asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Explicitly query personal gateways only
  const gateways = await gatewayService.findMany({
    where: { 
      userId,
      organizationId: null  // Personal only
    }
  });
  
  res.json({ success: true, data: gateways });
}));

/**
 * GET /api/user/plugins
 * List user's installed plugins (personal workspace)
 */
userRouter.get("/plugins", asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const plugins = await pluginService.getUserPlugins({
    userId,
    organizationId: null  // Personal only
  });
  
  res.json({ success: true, data: plugins });
}));

/**
 * GET /api/user/quota
 * Get user's personal quota status
 */
userRouter.get("/quota", asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const quota = await quotaService.getQuotaStatus({
    ownerId: userId,
    ownerType: 'user'
  });
  
  res.json({ success: true, data: quota });
}));

/**
 * GET /api/user/organizations
 * List organizations user is a member of
 * (Replaces availableOrgs from JWT token)
 */
userRouter.get("/organizations", asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const orgs = await organizationService.getUserOrganizations(userId);
  
  res.json({ success: true, data: orgs });
}));
```

#### Mount in routes/index.ts:
```typescript
import { userRouter } from "./user";

// Add user routes
router.use("/user", userRouter);
```

#### Error Handling Note:
The `asyncHandler` wrapper automatically catches errors and passes them to Express error middleware. For explicit error handling in routes:
```typescript
// Example with explicit error handling (optional pattern)
userRouter.get("/gateways", asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  try {
    const gateways = await gatewayService.findMany({
      where: { userId, organizationId: null }
    });
    res.json({ success: true, data: gateways });
  } catch (error) {
    // Specific error handling if needed
    if (error instanceof DatabaseError) {
      throw new InternalServerError('Failed to fetch gateways');
    }
    throw error; // Re-throw for asyncHandler to catch
  }
}));
```

#### Done Criteria:
- [ ] User router created
- [ ] GET /api/user/gateways works
- [ ] GET /api/user/plugins works
- [ ] GET /api/user/quota works
- [ ] Only returns personal resources (organizationId = null)

---

### Task 6.7.1.2: Create `/api/orgs/*` Backend Routes

**Session Type:** Backend
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.7.1.1 complete

> **Note:** Uses `/api/orgs/` (plural) to match GitHub API convention

#### Deliverables:
- [ ] src/server/routes/orgs.ts (new router)
- [ ] src/server/middleware/org-auth.ts (membership middleware)
- [ ] Organization gateway routes
- [ ] Organization plugin routes
- [ ] Organization quota routes
- [ ] Membership validation middleware

#### Step 1: Create org-auth middleware
```typescript
// src/server/middleware/org-auth.ts
import { Request, Response, NextFunction } from "express";
import { organizationService } from "@/modules/organization";
import { ForbiddenError } from "@/shared/errors";

/**
 * Middleware to validate org membership
 * Extracts orgId from URL params and validates user has access
 */
export async function requireOrgMember(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  const orgId = req.params.orgId;
  const userId = req.user.id;
  
  const membership = await organizationService.getMembership(userId, orgId);
  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError('Not a member of this organization');
  }
  
  req.orgMembership = membership;
  next();
}

/**
 * Middleware to require org admin role
 */
export async function requireOrgAdmin(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  // First check membership
  await requireOrgMember(req, res, () => {
    if (req.orgMembership.role !== 'ADMIN' && req.orgMembership.role !== 'OWNER') {
      throw new ForbiddenError('Admin access required');
    }
    next();
  });
}
```

#### Step 2: Create orgs router
```typescript
// src/server/routes/orgs.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrgMember, requireOrgAdmin } from "../middleware/org-auth";
import { asyncHandler } from "../middleware/async-handler";
import { gatewayService } from "@/modules/gateway";
import { pluginService } from "@/modules/plugin";
import { quotaService } from "@/modules/quota";
import { departmentService } from "@/modules/organization";

export const orgsRouter = Router();

// All routes require authentication
orgsRouter.use(requireAuth);

/**
 * GET /api/orgs/:orgId/gateways
 * List organization's gateways
 */
orgsRouter.get("/:orgId/gateways", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const gateways = await gatewayService.findMany({
    where: { organizationId: orgId }
  });
  
  res.json({ success: true, data: gateways });
}));

/**
 * GET /api/orgs/:orgId/plugins
 * List organization's plugins
 */
orgsRouter.get("/:orgId/plugins", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const plugins = await pluginService.getOrgPlugins(orgId);
  
  res.json({ success: true, data: plugins });
}));

/**
 * GET /api/orgs/:orgId/quota
 * Get organization's quota status
 */
orgsRouter.get("/:orgId/quota", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const quota = await quotaService.getQuotaStatus({
    ownerId: orgId,
    ownerType: 'organization'
  });
  
  res.json({ success: true, data: quota });
}));

/**
 * GET /api/orgs/:orgId/departments
 * List organization's departments
 */
orgsRouter.get("/:orgId/departments", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const departments = await departmentService.findByOrg(orgId);
  
  res.json({ success: true, data: departments });
}));

/**
 * GET /api/orgs/:orgId/departments/:deptId
 * Get department details
 */
orgsRouter.get("/:orgId/departments/:deptId", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId, deptId } = req.params;
  
  const department = await departmentService.getById(deptId, orgId);
  
  res.json({ success: true, data: department });
}));

/**
 * GET /api/orgs/:orgId/members
 * List organization members
 */
orgsRouter.get("/:orgId/members", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const members = await organizationService.getMembers(orgId);
  
  res.json({ success: true, data: members });
}));
```

#### Mount in routes/index.ts:
```typescript
import { userRouter } from "./user";
import { orgsRouter } from "./orgs";

// Add URL-based routes (matches GitHub API pattern)
router.use("/user", userRouter);     // Personal resources
router.use("/orgs", orgsRouter);     // Organization resources
```

#### Done Criteria:
- [ ] Org-auth middleware created (src/server/middleware/org-auth.ts)
- [ ] Orgs router created (src/server/routes/orgs.ts)
- [ ] Membership validation middleware works
- [ ] GET /api/orgs/:orgId/gateways works
- [ ] GET /api/orgs/:orgId/plugins works
- [ ] GET /api/orgs/:orgId/quota works
- [ ] GET /api/orgs/:orgId/departments works
- [ ] GET /api/orgs/:orgId/members works
- [ ] Non-members get 403 Forbidden

---

### Task 6.7.1.3: Create Department Router Separation

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.1.2 complete

#### Problem:
Current `organizationRouter` defines `/departments/:id` routes which become `/api/organizations/departments/:id` (wrong path).

#### Solution:
Department routes are already included in orgs router from Task 6.7.1.2 at `/api/orgs/:orgId/departments/:deptId/*` pattern.

Now remove duplicate routes from organizationRouter.

#### Deliverables:
- [ ] Remove department routes from src/server/routes/organization.ts
- [ ] Verify department routes work via orgs router

#### Routes migration summary:
```
FROM: /api/organizations/departments/:id
TO:   /api/orgs/:orgId/departments/:deptId

FROM: /api/organizations/departments/:id/members
TO:   /api/orgs/:orgId/departments/:deptId/members

FROM: /api/organizations/departments/:id/quotas
TO:   /api/orgs/:orgId/departments/:deptId/quotas
```

#### Code to remove from organization.ts:
```typescript
// REMOVE these routes from src/server/routes/organization.ts:
// organizationRouter.get("/departments/:id", ...)
// organizationRouter.post("/departments/:id/members", ...)
// organizationRouter.get("/departments/:id/quotas", ...)
// These are now in src/server/routes/orgs.ts
```

#### Done Criteria:
- [ ] Department routes under /api/orgs/:orgId/departments/:deptId
- [ ] Old routes removed from organizationRouter
- [ ] All department operations work with new URLs

---

### Task 6.7.1.4: Deprecate Context-Based Endpoints

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.7.1.3 complete

#### Deliverables:
- [ ] Add deprecation warnings to old endpoints
- [ ] Old endpoints still work (backward compatibility)
- [ ] Logging when deprecated endpoints used

#### Implementation:
```typescript
// Deprecation middleware
function deprecated(newPath: string) {
  return (req, res, next) => {
    logger.warn({
      oldPath: req.path,
      newPath,
      userId: req.user?.id,
    }, 'Deprecated endpoint used');
    
    res.set('Deprecation', 'true');
    res.set('Link', `<${newPath}>; rel="successor-version"`);
    
    next();
  };
}

// Apply to old routes
gatewayRouter.get("/", deprecated("/api/user/gateways or /api/orgs/:orgId/gateways"), ...);
```

#### Done Criteria:
- [ ] Deprecation warnings logged
- [ ] Deprecation headers sent
- [ ] Old endpoints still work
- [ ] Clear migration path documented

---

### Task 6.7.2.1: Update Dashboard to `/api/user/*` URLs

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.7.1.4 complete

> **Note:** Personal dashboard pages stay at `/dashboard/...` (like GitHub's `/settings/...`)
> API calls within these pages use `/api/user/...`

#### Personal Page Route Structure:
```
src/app/(dashboard)/dashboard/
├── page.tsx                    # Personal dashboard home
├── gateways/page.tsx          # Personal gateways
├── plugins/page.tsx           # Personal plugins
├── my-plugins/page.tsx        # Plugin management
├── settings/
│   ├── page.tsx               # Personal settings
│   ├── billing/page.tsx       # Personal billing
│   └── profile/page.tsx       # Profile settings
└── organizations/[orgId]/     # Org pages (Task 6.7.2.2)
    └── ...
```

#### Files to update:
- [x] src/app/(dashboard)/dashboard/page.tsx
- [x] src/app/(dashboard)/dashboard/gateways/page.tsx
- [x] src/app/(dashboard)/dashboard/plugins/page.tsx
- [x] src/app/(dashboard)/dashboard/my-plugins/page.tsx
- [x] src/app/(dashboard)/dashboard/settings/billing/page.tsx

#### Changes:
```typescript
// FROM (context-based):
fetch("/api/gateways", { headers: { Authorization: `Bearer ${token}` } })
fetch("/api/plugins/user/plugins", ...)
fetch("/api/quota/status", ...)

// TO (URL-based):
fetch("/api/user/gateways", { headers: { Authorization: `Bearer ${token}` } })
fetch("/api/user/plugins", ...)
fetch("/api/user/quota", ...)
```

#### Done Criteria:
- [x] Dashboard uses /api/user/* URLs
- [x] No more context-based API calls for personal resources
- [x] All dashboard features work

---

### Task 6.7.2.2: Update Org Pages to `/api/orgs/*` URLs

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.7.2.1 complete

> **Important:** GitHub uses different patterns for pages vs API:
> - **Page URLs** (browser address bar): `/dashboard/organizations/:orgId/...`
> - **API calls** (fetch requests): `/api/orgs/:orgId/...`

#### Files to update:
- [x] src/app/(dashboard)/dashboard/organizations/[orgId]/** (page routes)
- [x] src/app/(dashboard)/dashboard/settings/organization/** (if exists)
- [x] Any page that shows org resources

#### Page Route Structure:
```
src/app/(dashboard)/dashboard/organizations/[orgId]/
├── page.tsx                    # Org dashboard
├── settings/
│   ├── page.tsx               # General settings
│   ├── members/page.tsx       # Member management
│   ├── billing/page.tsx       # Billing
│   └── departments/page.tsx   # Departments
├── gateways/page.tsx          # Org gateways
└── plugins/page.tsx           # Org plugins
```

#### Changes (API calls within these pages):
```typescript
// FROM:
fetch("/api/organizations/${orgId}/gateways", ...)
fetch("/api/quota/status", ...) // with org context token

// TO (API calls use /api/orgs/):
fetch("/api/orgs/${orgId}/gateways", ...)
fetch("/api/orgs/${orgId}/quota", ...)
```

#### Done Criteria:
- [x] Org page routes at /dashboard/organizations/:orgId/* (browser URL)
- [x] API calls within pages use /api/orgs/:orgId/* (fetch requests)
- [x] orgId explicitly in URL, not derived from token
- [x] All org features work

---

### Task 6.7.2.3: Update Next.js Proxy Routes

**Session Type:** Frontend
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.7.2.2 complete

#### Strategy:
Create NEW proxy routes matching the new URL structure. Keep old routes temporarily for backward compatibility.

#### Create new proxy routes:
- [x] src/app/api/user/gateways/route.ts
- [x] src/app/api/user/plugins/route.ts
- [x] src/app/api/user/quota/route.ts
- [x] src/app/api/user/organizations/route.ts
- [x] src/app/api/orgs/[orgId]/gateways/route.ts
- [x] src/app/api/orgs/[orgId]/plugins/route.ts
- [x] src/app/api/orgs/[orgId]/quota/route.ts
- [x] src/app/api/orgs/[orgId]/departments/route.ts
- [x] src/app/api/orgs/[orgId]/departments/[deptId]/route.ts
- [x] src/app/api/orgs/[orgId]/members/route.ts

#### Implementation pattern for user routes:
```typescript
// src/app/api/user/gateways/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization");
  
  const response = await fetch(`${BACKEND_URL}/api/user/gateways`, {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: token }),
    },
  });
  
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
```

#### Implementation pattern for org routes:
```typescript
// src/app/api/orgs/[orgId]/gateways/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const token = request.headers.get("authorization");
  
  const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/gateways`, {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: token }),
    },
  });
  
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
```

#### Done Criteria:
- [x] All new proxy routes created
- [x] Proxy routes forward to correct backend URLs
- [x] Authorization headers passed correctly

---

### Task 6.7.2.4: Keep Context Switcher for UI Only

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.2.3 complete

#### Purpose:
Context switcher remains for UI/UX purposes:
- Shows which workspace user is viewing
- Changes sidebar items, branding, etc.
- Does NOT affect API calls (URLs determine context)

#### Updates to AuthProvider:
```typescript
// Context no longer affects API calls
const [activeWorkspace, setActiveWorkspace] = useState<'personal' | OrgInfo>('personal');

// When switching workspace:
// - Update UI state
// - Navigate to /dashboard (personal) or /dashboard/organizations/:orgId (org)
// - DO NOT refresh token (no longer needed)

function switchWorkspace(workspace: 'personal' | OrgInfo) {
  setActiveWorkspace(workspace);
  
  if (workspace === 'personal') {
    router.push('/dashboard');
  } else {
    // Use /organizations/ for web pages (matches GitHub web UI)
    router.push(`/dashboard/organizations/${workspace.id}`);
  }
}
```

#### Done Criteria:
- [x] Context switcher updates UI only
- [x] No token refresh on context switch
- [x] Navigation works correctly
- [x] API calls use explicit URLs

---

### Task 6.7.3.1: Simplify JWT Token Payload

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.2.4 complete

#### Current Token (Complex):
```typescript
interface TokenPayload {
  userId: string;
  email: string;
  plan: PlanType;
  sessionId: string;
  role: UserRole;
  activeContext: {  // ← REMOVE THIS
    type: 'personal' | 'organization';
    organizationId?: string;
    orgRole?: OrgRole;
    plan: PlanType;
  };
  availableOrgs: AvailableOrg[];
}
```

#### New Token (Simple):
```typescript
interface TokenPayload {
  userId: string;
  email: string;
  plan: PlanType;      // User's personal plan
  sessionId: string;
  role: UserRole;      // Platform role (ADMIN, MEMBER, etc.)
  // activeContext REMOVED - context determined by URL
  // availableOrgs REMOVED - fetch from /api/user/organizations
}
```

#### Files to update:
- [x] src/modules/auth/auth.types.ts
- [x] src/lib/jwt.ts
- [x] src/modules/auth/auth.service.ts

#### Done Criteria:
- [x] activeContext removed from token
- [x] Token is simpler and smaller
- [x] Login still works
- [x] No context switching endpoint needed

---

### Task 6.7.3.2: Update Auth Middleware

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.3.1 complete

#### Updates:
```typescript
// src/server/middleware/auth.ts

// No longer create ServiceContext from token activeContext
// Just validate user exists and session is valid

export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  const payload = verifyToken(token);
  
  if (!payload) {
    throw new UnauthorizedError('Invalid token');
  }
  
  // Validate session still active
  const session = await sessionService.validate(payload.sessionId);
  if (!session) {
    throw new UnauthorizedError('Session expired');
  }
  
  // Attach user info (NOT context)
  req.user = {
    id: payload.userId,
    email: payload.email,
    plan: payload.plan,
    role: payload.role,
  };
  
  next();
}
```

#### Done Criteria:
- [x] Auth middleware simplified
- [x] No ServiceContext creation from token
- [x] User routes work
- [x] Org routes use URL-based membership validation

---

### Task 6.7.3.3: Update Frontend Auth Provider

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.3.2 complete

#### Updates to AuthProvider:
```typescript
// Remove context from auth state
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  // REMOVE: context: ActiveContext
  // ADD: for UI purposes only
  activeWorkspace: 'personal' | OrgInfo;
}

// Remove switch-context API call
// Context is UI-only, determined by URL navigation

// Fetch available orgs separately
async function fetchAvailableOrgs() {
  const res = await fetch('/api/user/organizations');
  return res.json();
}
```

#### Done Criteria:
- [x] AuthProvider simplified
- [x] No context in auth state
- [x] activeWorkspace for UI only
- [x] Organizations fetched via API

---

### Task 6.7.4.1: Update API Documentation

**Session Type:** Documentation
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.7.3.3 complete

#### Deliverables:
- [ ] Update ROADMAP.md API section
- [ ] Document new URL patterns
- [ ] Document migration guide
- [ ] Update inline API comments

#### Documentation structure:
```markdown
## API Patterns (GitHub-style URL-based)

### Personal Resources (/api/user/*)
GET  /api/user/gateways       - List personal gateways
GET  /api/user/plugins        - List installed plugins  
GET  /api/user/quota          - Personal quota status
GET  /api/user/organizations  - List user's org memberships

### Organization Resources (/api/orgs/:orgId/*)
GET  /api/orgs/:orgId/gateways             - Org gateways
GET  /api/orgs/:orgId/plugins              - Org plugins
GET  /api/orgs/:orgId/quota                - Org quota
GET  /api/orgs/:orgId/members              - Org members
GET  /api/orgs/:orgId/departments          - Org departments
GET  /api/orgs/:orgId/departments/:deptId  - Department details

### Deprecated (will be removed in v2)
GET  /api/gateways              - Use /api/user/gateways or /api/orgs/:orgId/gateways
GET  /api/plugins/user/plugins  - Use /api/user/plugins
GET  /api/quota/status          - Use /api/user/quota or /api/orgs/:orgId/quota
```

#### Done Criteria:
- [x] API documentation updated
- [x] Migration guide written
- [x] Deprecation timeline documented
- [x] Examples updated

---

### Task 6.7.4.2: Architecture Alignment Smoke Test

**Session Type:** Testing
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.7.4.1 complete

#### Test Checklist:

**Personal Workspace Tests:**
```bash
# User routes - should only return personal resources (organizationId = null)
curl -X GET http://localhost:3001/api/user/gateways -H "Authorization: Bearer $TOKEN"
curl -X GET http://localhost:3001/api/user/plugins -H "Authorization: Bearer $TOKEN"
curl -X GET http://localhost:3001/api/user/quota -H "Authorization: Bearer $TOKEN"
curl -X GET http://localhost:3001/api/user/organizations -H "Authorization: Bearer $TOKEN"
```

**Expected Response Examples:**
```json
// GET /api/user/gateways - Success (200)
{
  "success": true,
  "data": [
    { "id": "gw_123", "name": "My Gateway", "provider": "openai", "organizationId": null }
  ]
}

// GET /api/user/organizations - Success (200)
{
  "success": true,
  "data": [
    { "id": "org_abc", "name": "My Company", "role": "ADMIN", "status": "ACTIVE" }
  ]
}

// GET /api/orgs/:orgId/gateways - Forbidden (403) when not a member
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "Not a member of this organization" }
}
```

**Organization Workspace Tests:**
```bash
# Org routes (user must be member, else 403)
curl -X GET http://localhost:3001/api/orgs/$ORG_ID/gateways -H "Authorization: Bearer $TOKEN"
curl -X GET http://localhost:3001/api/orgs/$ORG_ID/plugins -H "Authorization: Bearer $TOKEN"
curl -X GET http://localhost:3001/api/orgs/$ORG_ID/quota -H "Authorization: Bearer $TOKEN"
curl -X GET http://localhost:3001/api/orgs/$ORG_ID/departments -H "Authorization: Bearer $TOKEN"
curl -X GET http://localhost:3001/api/orgs/$ORG_ID/members -H "Authorization: Bearer $TOKEN"

# Test with non-member user - should return 403 Forbidden
curl -X GET http://localhost:3001/api/orgs/$OTHER_ORG_ID/gateways -H "Authorization: Bearer $TOKEN"
```

**Deprecated Route Tests:**
```bash
# Old routes should still work but return deprecation headers
curl -v -X GET http://localhost:3001/api/gateways -H "Authorization: Bearer $TOKEN"
# Response should include:
# - Deprecation: true (header)
# - Link: </api/user/gateways>; rel="successor-version" (header)
# - Data still returned (backward compatible)
```

**UI Tests:**
- [ ] Dashboard loads and calls /api/user/* routes
- [ ] Context switcher changes UI and navigation only
- [ ] Org pages at /dashboard/organizations/:orgId/* load correctly
- [ ] Org pages call /api/orgs/:orgId/* for data (check DevTools Network)
- [ ] No token refresh when switching workspace
- [ ] Browser URL shows /dashboard/organizations/... (not /dashboard/orgs/)

**URL Pattern Verification:**
| Context | Page URL (Browser) | API Call (fetch) |
|---------|-------------------|------------------|
| Personal dashboard | `/dashboard` | - |
| Personal settings | `/dashboard/settings` | - |
| Personal gateways | `/dashboard/gateways` | `fetch("/api/user/gateways")` |
| Personal plugins | `/dashboard/plugins` | `fetch("/api/user/plugins")` |
| Org dashboard | `/dashboard/organizations/abc123` | - |
| Org settings | `/dashboard/organizations/abc123/settings` | - |
| Org gateways | `/dashboard/organizations/abc123/gateways` | `fetch("/api/orgs/abc123/gateways")` |
| Org members | `/dashboard/organizations/abc123/members` | `fetch("/api/orgs/abc123/members")` |

#### Done Criteria:
- [x] All new endpoints work
- [x] Deprecated endpoints warn but work
- [x] Non-members cannot access org resources
- [x] UI works with new URL patterns

---

### Task 6.7.4.3: Production Deployment Re-verification

**Session Type:** DevOps
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.7.4.2 complete

#### Re-verification Checklist:

**Backend:**
- [x] All new routes registered
- [x] Deprecation middleware active
- [x] Logging shows URL-based calls
- [x] No errors in logs

**Frontend:**
- [x] Build succeeds with new API calls
- [x] No console errors
- [x] All pages load correctly

**Database:**
- [x] No schema changes needed
- [x] Queries perform well

**Monitoring:**
- [x] New routes appear in metrics
- [x] Deprecated route usage tracked
- [x] No increase in errors

**Security:**
- [x] Org membership validated per-request
- [x] No unauthorized access to org resources
- [x] Token payload simplified (smaller attack surface)

**Documentation:**
- [x] README reflects new architecture
- [x] API docs updated
- [x] Team informed of changes

#### Done Criteria:
- [x] Production deployment successful
- [x] All features work
- [x] Monitoring shows healthy metrics
- [x] Architecture alignment complete!

---

## ✅ Phase 6.7 Completion Checklist

**Sessions 1-4 (Required):**
- [x] /api/user/* routes created and working
- [x] /api/orgs/:orgId/* routes created and working
- [x] org-auth middleware created
- [x] Department routes properly nested under /api/orgs/:orgId/departments/
- [x] Old endpoints deprecated with warnings
- [x] Dashboard uses URL-based APIs
- [x] Org pages use URL-based APIs  
- [x] Next.js proxy routes updated
- [x] Context switcher is UI-only
- [x] JWT token simplified
- [x] Auth middleware updated
- [x] Frontend auth provider updated
- [x] API documentation updated
- [x] Smoke tests passing
- [x] Production re-verified

**Session 5 (Optional - Enterprise Prep):**
- [x] CORS configured for all subdomains
- [x] URL config utility created (src/shared/config/urls.ts)
- [x] Environment variables documented
- [x] API_PREFIX support added to Express
- [x] docker-compose.enterprise.yml created
- [x] Nginx config documented
- [x] Ready for subdomain deployment

---

## 🎯 Benefits After Completion

| Before | After |
|--------|-------|
| Same URL returns different data | URL explicitly states context |
| Must decode JWT to debug | URL shows intent clearly |
| Team confusion on context | Self-documenting URLs |
| Cannot cache by URL | URL-based caching possible |
| Complex token with activeContext | Simple token with auth only |
| Token refresh on context switch | No token change needed |
| Security audit complexity | Clear ownership in URL |

---

## 🏢 Session 5: Enterprise Subdomain Preparation (Optional)

> **When to do this:** After Phase 6.7 tasks 1-4 are complete, when ready to deploy subdomains
> **Prerequisites:** Cloudflare subdomains configured, SSL certificates ready

---

### Task 6.7.5.1: Configure CORS for Subdomains

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Cloudflare subdomains pointing to server

#### Current CORS (single domain):
```typescript
// src/server/middleware/cors.ts - CURRENT
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://2bot.org",
  "https://www.2bot.org",
];
```

#### Updated CORS (enterprise subdomains):
```typescript
// src/server/middleware/cors.ts - UPDATED
const allowedOrigins = [
  // Development
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://localhost:3004",
  "http://localhost:3005",
  "http://localhost:3006",
  
  // Production - Main domain
  "https://2bot.org",
  "https://www.2bot.org",
  
  // Production - Subdomains (Enterprise)
  "https://dash.2bot.org",      // Dashboard (:3000)
  "https://admin.2bot.org",     // Admin panel (:3003)
  "https://support.2bot.org",   // Support team dashboard (:3004) - Phase 7
  "https://docs.2bot.org",      // Public documentation (:3005)
  "https://dev.2bot.org",       // Developer portal (:3006)
  
  // Allow configured URLs from environment
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.DASHBOARD_URL,
  process.env.ADMIN_URL,
  process.env.SUPPORT_URL,
  process.env.DOCS_URL,
  process.env.DEV_PORTAL_URL,
].filter(Boolean) as string[];
```

#### Done Criteria:
- [x] CORS allows all subdomains
- [x] Environment variables for dynamic URLs
- [x] Cross-subdomain requests work

---

### Task 6.7.5.2: Add Environment-Based URL Configuration

**Session Type:** Backend + Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.5.1 complete

#### Create URL config utility:
```typescript
// src/shared/config/urls.ts
export const URLS = {
  // API Server (Express :3001)
  api: process.env.NEXT_PUBLIC_API_URL || 
       (process.env.NODE_ENV === 'production' 
         ? 'https://api.2bot.org' 
         : 'http://localhost:3001'),
  
  // Dashboard (Next.js :3000)
  dashboard: process.env.NEXT_PUBLIC_DASHBOARD_URL || 
             (process.env.NODE_ENV === 'production' 
               ? 'https://dash.2bot.org' 
               : 'http://localhost:3000'),
  
  // Main site (:3002)
  main: process.env.NEXT_PUBLIC_APP_URL || 
        (process.env.NODE_ENV === 'production' 
          ? 'https://2bot.org' 
          : 'http://localhost:3002'),
  
  // Admin panel (:3003)
  admin: process.env.NEXT_PUBLIC_ADMIN_URL || 
         (process.env.NODE_ENV === 'production' 
           ? 'https://admin.2bot.org' 
           : 'http://localhost:3003'),
  
  // Support team dashboard (:3004) - Phase 7
  support: process.env.NEXT_PUBLIC_SUPPORT_URL || 
           (process.env.NODE_ENV === 'production' 
             ? 'https://support.2bot.org' 
             : 'http://localhost:3004'),
  
  // Public documentation (:3005)
  docs: process.env.NEXT_PUBLIC_DOCS_URL || 
        (process.env.NODE_ENV === 'production' 
          ? 'https://docs.2bot.org' 
          : 'http://localhost:3005'),
  
  // Developer portal (:3006)
  dev: process.env.NEXT_PUBLIC_DEV_URL || 
       (process.env.NODE_ENV === 'production' 
         ? 'https://dev.2bot.org' 
         : 'http://localhost:3006'),
};

// Helper for API calls from any subdomain
export function apiUrl(path: string): string {
  return `${URLS.api}${path}`;
}
```

#### Update .env.production:
```bash
# ===========================================
# Enterprise Subdomain URLs
# ===========================================

# Core Services
NEXT_PUBLIC_API_URL=https://api.2bot.org
NEXT_PUBLIC_APP_URL=https://2bot.org
NEXT_PUBLIC_DASHBOARD_URL=https://dash.2bot.org

# Admin & Support
NEXT_PUBLIC_ADMIN_URL=https://admin.2bot.org
NEXT_PUBLIC_SUPPORT_URL=https://support.2bot.org  # Phase 7

# Documentation & Developer
NEXT_PUBLIC_DOCS_URL=https://docs.2bot.org        # Future
NEXT_PUBLIC_DEV_URL=https://dev.2bot.org          # Future

# For backward compatibility during migration
BACKEND_URL=https://api.2bot.org
```

#### Update frontend fetch calls:
```typescript
// FROM (hardcoded proxy):
fetch("/api/user/gateways", ...)

// TO (direct to API subdomain):
import { apiUrl } from "@/shared/config/urls";
fetch(apiUrl("/user/gateways"), ...)
```

#### Done Criteria:
- [x] URL config utility created
- [x] Environment variables documented
- [x] Frontend can call API subdomain directly

---

### Task 6.7.5.3: Remove `/api` Prefix from Express Routes

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.5.2 complete

#### Why:
When API is on its own subdomain (`api.2bot.org`), the `/api` prefix is redundant:
- Current: `api.2bot.org/api/user/gateways` (redundant `/api`)
- Better: `api.2bot.org/user/gateways` (cleaner)

#### Update Express app.ts:
```typescript
// src/server/app.ts - CURRENT
app.use("/api", router);

// src/server/app.ts - UPDATED (supports both)
const apiPrefix = process.env.API_PREFIX || "/api";  // Default for backward compat
app.use(apiPrefix, router);

// Or for enterprise mode:
// API_PREFIX="" (empty) → routes at root
// API_PREFIX="/api" → routes at /api (backward compat)
```

#### Route examples:
| Mode | Environment | URL |
|------|-------------|-----|
| Current | Single domain | `2bot.org/api/user/gateways` |
| Enterprise | Subdomain | `api.2bot.org/user/gateways` |

#### Done Criteria:
- [x] API_PREFIX environment variable supported
- [x] Routes work with and without /api prefix
- [x] Backward compatible with current setup

---

### Task 6.7.5.4: Update Docker Compose for Subdomain Deploy

**Session Type:** DevOps
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.7.5.3 complete

#### Create docker-compose.enterprise.yml:
```yaml
# docker-compose.enterprise.yml
# Enterprise deployment with subdomain separation

services:
  # ===========================================
  # Main Website (2bot.org)
  # ===========================================
  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    container_name: 2bot-web
    ports:
      - "3002:3000"  # Landing/marketing pages only
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://api.2bot.org
      - NEXT_PUBLIC_DASHBOARD_URL=https://dash.2bot.org
    networks:
      - 2bot-network

  # ===========================================
  # Dashboard (dash.2bot.org)
  # ===========================================
  dashboard:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: 2bot-dashboard
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://api.2bot.org
      - NEXT_PUBLIC_APP_URL=https://dash.2bot.org
      # No BACKEND_URL - calls API directly!
    networks:
      - 2bot-network

  # ===========================================
  # API Server (api.2bot.org)
  # ===========================================
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: 2bot-api
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - API_PREFIX=  # Empty = no /api prefix
      - CORS_ORIGINS=https://dash.2bot.org,https://admin.2bot.org,https://support.2bot.org,https://2bot.org
    networks:
      - 2bot-network

  # ===========================================
  # Admin Panel (admin.2bot.org)
  # ===========================================
  admin:
    build:
      context: .
      dockerfile: Dockerfile.admin
    container_name: 2bot-admin
    ports:
      - "3003:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://api.2bot.org
      - NEXT_PUBLIC_APP_URL=https://admin.2bot.org
    networks:
      - 2bot-network

  # ===========================================
  # Support Team Dashboard (support.2bot.org) - Phase 7
  # ===========================================
  support:
    build:
      context: .
      dockerfile: Dockerfile.support
    container_name: 2bot-support
    ports:
      - "3004:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://api.2bot.org
      - NEXT_PUBLIC_APP_URL=https://support.2bot.org
    networks:
      - 2bot-network

  # ===========================================
  # Public Documentation (docs.2bot.org) - Future
  # ===========================================
  # docs:
  #   image: nginx:alpine  # or docusaurus
  #   container_name: 2bot-docs
  #   ports:
  #     - "3005:80"
  #   volumes:
  #     - ./docs-build:/usr/share/nginx/html:ro
  #   networks:
  #     - 2bot-network

  # ===========================================
  # Developer Portal (dev.2bot.org) - Future
  # ===========================================
  # dev:
  #   build:
  #     context: .
  #     dockerfile: Dockerfile.dev
  #   container_name: 2bot-dev
  #   ports:
  #     - "3006:3000"
  #   networks:
  #     - 2bot-network
```

#### Cloudflare DNS Configuration:
```
Type    Name      Content              Proxy     Notes
─────────────────────────────────────────────────────────────
A       @         YOUR_SERVER_IP       ✅ Proxied  Main site
A       www       YOUR_SERVER_IP       ✅ Proxied  Main site (www)
A       api       YOUR_SERVER_IP       ✅ Proxied  Backend API
A       dash      YOUR_SERVER_IP       ✅ Proxied  Dashboard
A       admin     YOUR_SERVER_IP       ✅ Proxied  Admin panel
A       support   YOUR_SERVER_IP       ✅ Proxied  Support team (Phase 7)
A       docs      YOUR_SERVER_IP       ✅ Proxied  Documentation (Future)
A       dev       YOUR_SERVER_IP       ✅ Proxied  Developer portal (Future)
```

#### Nginx reverse proxy example:
```nginx
# /etc/nginx/sites-available/2bot

# Main site (2bot.org)
server {
    server_name 2bot.org www.2bot.org;
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Dashboard (dash.2bot.org)
server {
    server_name dash.2bot.org;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# API (api.2bot.org)
server {
    server_name api.2bot.org;
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # CORS headers handled by Express
    }
}

# Admin (admin.2bot.org)
server {
    server_name admin.2bot.org;
    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}

# Support Team (support.2bot.org) - Phase 7
server {
    server_name support.2bot.org;
    location / {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}

# Documentation (docs.2bot.org) - Future
server {
    server_name docs.2bot.org;
    location / {
        proxy_pass http://localhost:3005;
    }
}

# Developer Portal (dev.2bot.org) - Future
server {
    server_name dev.2bot.org;
    location / {
        proxy_pass http://localhost:3006;
    }
}
```

#### Done Criteria:
- [x] docker-compose.enterprise.yml created
- [x] Each service has correct environment
- [x] Nginx/Caddy config documented
- [x] Ready to deploy on subdomains

---

## 📋 Enterprise Migration Path

When ready to migrate from single domain to subdomains:

**Step 1: Deploy API to api.2bot.org**
- Keep old /api routes on 2bot.org (backward compat)
- New API available at api.2bot.org
- Test direct API calls

**Step 2: Deploy Dashboard to dash.2bot.org**
- Update frontend to call api.2bot.org directly
- No more proxy routes needed!
- Keep 2bot.org/dashboard redirecting to dash.2bot.org

**Step 3: Separate Admin Panel**
- Move /admin routes to admin.2bot.org
- Add extra auth layer for admin subdomain

**Step 4: Deprecate Old Routes**
- Redirect 2bot.org/api/* to api.2bot.org/*
- Redirect 2bot.org/dashboard/* to dash.2bot.org/*

**Step 5: Deploy Support Dashboard (Phase 7)**
- Deploy support.2bot.org for support team
- Requires Phase 7 ticket system to be built
- Separate auth policies for support staff

**Step 6: Deploy Documentation (Future)**
- Deploy docs.2bot.org for public documentation
- Consider Docusaurus, GitBook, or custom Next.js
- API reference, guides, tutorials

---

## 📊 Subdomain Port Reference

| Subdomain | Port | Service | Status |
|-----------|------|---------|--------|
| `2bot.org` | :3002 | Landing/Marketing | Ready |
| `dash.2bot.org` | :3000 | Dashboard | Ready |
| `api.2bot.org` | :3001 | Express API | Ready |
| `admin.2bot.org` | :3003 | Admin Panel | Ready |
| `support.2bot.org` | :3004 | Support Team | Phase 7 |
| `docs.2bot.org` | :3005 | Documentation | Future |
| `dev.2bot.org` | :3006 | Developer Portal | Future |

---

**After Phase 6.7, you're ready for:**
- 🚀 Enterprise subdomain deployment
- 📊 Separate scaling for API vs Dashboard
- 🔒 Different security policies per subdomain
- 🌍 CDN optimization per service
- 📈 Independent monitoring per service
- 🎫 Support team dashboard (Phase 7)
- 📚 Public documentation site (Future)

**Proceed to Phase 7 or Public Launch! 🚀**
