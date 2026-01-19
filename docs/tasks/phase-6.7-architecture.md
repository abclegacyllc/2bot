# Phase 6.7: Architecture Alignment

> **Goal:** Align API architecture with ROADMAP URL-based design pattern
> **Estimated Sessions:** 4
> **Prerequisites:** Phase 6.6 complete
> **Why:** Current token-based context causes team confusion and security audit complexity

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| **Backend Routes** ||||
| 6.7.1.1 | Create `/api/user/*` backend routes | ⬜ | 1 |
| 6.7.1.2 | Create `/api/org/*` backend routes | ⬜ | 1 |
| 6.7.1.3 | Create department router separation | ⬜ | 1 |
| 6.7.1.4 | Deprecate context-based endpoints | ⬜ | 1 |
| **Frontend Migration** ||||
| 6.7.2.1 | Update dashboard to `/api/user/*` URLs | ⬜ | 2 |
| 6.7.2.2 | Update org pages to `/api/org/*` URLs | ⬜ | 2 |
| 6.7.2.3 | Update Next.js proxy routes | ⬜ | 2 |
| 6.7.2.4 | Keep context switcher for UI only | ⬜ | 2 |
| **Token Simplification** ||||
| 6.7.3.1 | Simplify JWT token payload | ⬜ | 3 |
| 6.7.3.2 | Update auth middleware | ⬜ | 3 |
| 6.7.3.3 | Update frontend auth provider | ⬜ | 3 |
| **Verification** ||||
| 6.7.4.1 | Update API documentation | ⬜ | 4 |
| 6.7.4.2 | Architecture alignment smoke test | ⬜ | 4 |
| 6.7.4.3 | Production deployment re-verification | ⬜ | 4 |

---

## 📖 Background

### The Problem

The original ROADMAP specified URL-based API patterns:
- `/api/user/*` for personal resources
- `/api/org/*` for organization resources

However, Phase 4 implementation used token-based context switching where the same URL returns different data based on JWT `activeContext`. This causes:
- Team confusion (which context am I in?)
- Debugging difficulty (must decode JWT to understand)
- Security audit complexity (same URL, different data)
- Caching limitations (cannot cache by URL)

### Migration Strategy

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
│                         AFTER (URL-Based)                               │
├─────────────────────────────────────────────────────────────────────────┤
│  GET /api/user/gateways              → User's personal gateways         │
│  GET /api/org/:orgId/gateways        → Organization's gateways          │
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

#### Implementation:
```typescript
// src/server/routes/user.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";

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

// ... more user routes
```

#### Mount in routes/index.ts:
```typescript
import { userRouter } from "./user";

// Add user routes
router.use("/user", userRouter);
```

#### Done Criteria:
- [ ] User router created
- [ ] GET /api/user/gateways works
- [ ] GET /api/user/plugins works
- [ ] GET /api/user/quota works
- [ ] Only returns personal resources (organizationId = null)

---

### Task 6.7.1.2: Create `/api/org/*` Backend Routes

**Session Type:** Backend
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.7.1.1 complete

#### Deliverables:
- [ ] src/server/routes/org.ts (new router)
- [ ] Organization gateway routes
- [ ] Organization plugin routes
- [ ] Organization quota routes
- [ ] Membership validation middleware

#### Implementation:
```typescript
// src/server/routes/org.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrgMember, requireOrgAdmin } from "../middleware/org-auth";

export const orgRouter = Router();

// All routes require authentication
orgRouter.use(requireAuth);

/**
 * Middleware to validate org membership
 * Extracts orgId from URL and validates user has access
 */
async function requireOrgMember(req, res, next) {
  const orgId = req.params.orgId;
  const userId = req.user.id;
  
  const membership = await orgService.getMembership(userId, orgId);
  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError('Not a member of this organization');
  }
  
  req.orgMembership = membership;
  next();
}

/**
 * GET /api/org/:orgId/gateways
 * List organization's gateways
 */
orgRouter.get("/:orgId/gateways", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const gateways = await gatewayService.findMany({
    where: { organizationId: orgId }
  });
  
  res.json({ success: true, data: gateways });
}));

/**
 * GET /api/org/:orgId/plugins
 * List organization's plugins
 */
orgRouter.get("/:orgId/plugins", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const plugins = await pluginService.getOrgPlugins(orgId);
  
  res.json({ success: true, data: plugins });
}));

/**
 * GET /api/org/:orgId/quota
 * Get organization's quota status
 */
orgRouter.get("/:orgId/quota", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const quota = await quotaService.getQuotaStatus({
    ownerId: orgId,
    ownerType: 'organization'
  });
  
  res.json({ success: true, data: quota });
}));

/**
 * GET /api/org/:orgId/departments
 * List organization's departments
 */
orgRouter.get("/:orgId/departments", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId } = req.params;
  
  const departments = await departmentService.findByOrg(orgId);
  
  res.json({ success: true, data: departments });
}));

/**
 * GET /api/org/:orgId/departments/:deptId
 * Get department details
 */
orgRouter.get("/:orgId/departments/:deptId", requireOrgMember, asyncHandler(async (req, res) => {
  const { orgId, deptId } = req.params;
  
  const department = await departmentService.getById(deptId, orgId);
  
  res.json({ success: true, data: department });
}));

// ... more org routes
```

#### Mount in routes/index.ts:
```typescript
import { orgRouter } from "./org";

// Add org routes (URL-based, matches ROADMAP)
router.use("/org", orgRouter);
```

#### Done Criteria:
- [ ] Org router created
- [ ] Membership validation middleware works
- [ ] GET /api/org/:orgId/gateways works
- [ ] GET /api/org/:orgId/plugins works
- [ ] GET /api/org/:orgId/quota works
- [ ] GET /api/org/:orgId/departments works
- [ ] Non-members get 403 Forbidden

---

### Task 6.7.1.3: Create Department Router Separation

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.7.1.2 complete

#### Problem:
Current `organizationRouter` defines `/departments/:id` routes which become `/api/organizations/departments/:id` (wrong path).

#### Solution:
Move department routes to `/api/org/:orgId/departments/:deptId/*` pattern within org router.

#### Deliverables:
- [ ] Move department routes from organization.ts to org.ts
- [ ] Update department route paths
- [ ] Remove old `/departments/:id` routes from organizationRouter

#### Routes to migrate:
```
FROM: /api/organizations/departments/:id
TO:   /api/org/:orgId/departments/:deptId

FROM: /api/organizations/departments/:id/members
TO:   /api/org/:orgId/departments/:deptId/members

FROM: /api/organizations/departments/:id/quotas
TO:   /api/org/:orgId/departments/:deptId/quotas
```

#### Done Criteria:
- [ ] Department routes under /api/org/:orgId/departments/:deptId
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
gatewayRouter.get("/", deprecated("/api/user/gateways or /api/org/:orgId/gateways"), ...);
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

#### Files to update:
- [ ] src/app/(dashboard)/dashboard/page.tsx
- [ ] src/app/(dashboard)/dashboard/gateways/page.tsx
- [ ] src/app/(dashboard)/dashboard/plugins/page.tsx
- [ ] src/app/(dashboard)/dashboard/my-plugins/page.tsx
- [ ] src/app/(dashboard)/dashboard/settings/billing/page.tsx

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
- [ ] Dashboard uses /api/user/* URLs
- [ ] No more context-based API calls for personal resources
- [ ] All dashboard features work

---

### Task 6.7.2.2: Update Org Pages to `/api/org/*` URLs

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.7.2.1 complete

#### Files to update:
- [ ] src/app/(dashboard)/dashboard/settings/organization/**
- [ ] Any page that shows org resources

#### Changes:
```typescript
// FROM:
fetch("/api/organizations/${orgId}/gateways", ...)
fetch("/api/quota/status", ...) // with org context token

// TO:
fetch("/api/org/${orgId}/gateways", ...)
fetch("/api/org/${orgId}/quota", ...)
```

#### Done Criteria:
- [ ] Org pages use /api/org/:orgId/* URLs
- [ ] orgId explicitly in URL, not derived from token
- [ ] All org features work

---

### Task 6.7.2.3: Update Next.js Proxy Routes

**Session Type:** Frontend
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.7.2.2 complete

#### Create new proxy routes:
- [ ] src/app/api/user/gateways/route.ts
- [ ] src/app/api/user/plugins/route.ts
- [ ] src/app/api/user/quota/route.ts
- [ ] src/app/api/org/[orgId]/gateways/route.ts
- [ ] src/app/api/org/[orgId]/plugins/route.ts
- [ ] src/app/api/org/[orgId]/quota/route.ts
- [ ] src/app/api/org/[orgId]/departments/route.ts
- [ ] src/app/api/org/[orgId]/departments/[deptId]/route.ts

#### Implementation pattern:
```typescript
// src/app/api/user/gateways/route.ts
export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization");
  
  const response = await fetch(`${BACKEND_URL}/api/user/gateways`, {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: token }),
    },
  });
  
  return NextResponse.json(await response.json(), { status: response.status });
}
```

#### Done Criteria:
- [ ] All new proxy routes created
- [ ] Proxy routes forward to correct backend URLs
- [ ] Authorization headers passed correctly

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
// - Navigate to appropriate pages
// - DO NOT refresh token (no longer needed)

function switchWorkspace(workspace: 'personal' | OrgInfo) {
  setActiveWorkspace(workspace);
  
  if (workspace === 'personal') {
    router.push('/dashboard');
  } else {
    router.push(`/dashboard/org/${workspace.id}`);
  }
}
```

#### Done Criteria:
- [ ] Context switcher updates UI only
- [ ] No token refresh on context switch
- [ ] Navigation works correctly
- [ ] API calls use explicit URLs

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
- [ ] src/modules/auth/auth.types.ts
- [ ] src/lib/jwt.ts
- [ ] src/modules/auth/auth.service.ts

#### Done Criteria:
- [ ] activeContext removed from token
- [ ] Token is simpler and smaller
- [ ] Login still works
- [ ] No context switching endpoint needed

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
- [ ] Auth middleware simplified
- [ ] No ServiceContext creation from token
- [ ] User routes work
- [ ] Org routes use URL-based membership validation

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
- [ ] AuthProvider simplified
- [ ] No context in auth state
- [ ] activeWorkspace for UI only
- [ ] Organizations fetched via API

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
## API Patterns

### Personal Resources
GET  /api/user/gateways     - List personal gateways
GET  /api/user/plugins      - List installed plugins
GET  /api/user/quota        - Personal quota status
GET  /api/user/organizations - List user's org memberships

### Organization Resources
GET  /api/org/:orgId/gateways           - Org gateways
GET  /api/org/:orgId/plugins            - Org plugins
GET  /api/org/:orgId/quota              - Org quota
GET  /api/org/:orgId/members            - Org members
GET  /api/org/:orgId/departments        - Org departments
GET  /api/org/:orgId/departments/:deptId - Department details

### Deprecated (will be removed in v2)
GET  /api/gateways          - Use /api/user/gateways or /api/org/:orgId/gateways
GET  /api/plugins/user/plugins - Use /api/user/plugins
```

#### Done Criteria:
- [ ] API documentation updated
- [ ] Migration guide written
- [ ] Deprecation timeline documented
- [ ] Examples updated

---

### Task 6.7.4.2: Architecture Alignment Smoke Test

**Session Type:** Testing
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.7.4.1 complete

#### Test Checklist:

**Personal Workspace Tests:**
```bash
# User routes
curl -X GET /api/user/gateways -H "Authorization: Bearer $TOKEN"
curl -X GET /api/user/plugins -H "Authorization: Bearer $TOKEN"
curl -X GET /api/user/quota -H "Authorization: Bearer $TOKEN"
curl -X GET /api/user/organizations -H "Authorization: Bearer $TOKEN"

# Should only return personal resources (organizationId = null)
```

**Organization Workspace Tests:**
```bash
# Org routes (user is member)
curl -X GET /api/org/$ORG_ID/gateways -H "Authorization: Bearer $TOKEN"
curl -X GET /api/org/$ORG_ID/plugins -H "Authorization: Bearer $TOKEN"
curl -X GET /api/org/$ORG_ID/quota -H "Authorization: Bearer $TOKEN"
curl -X GET /api/org/$ORG_ID/departments -H "Authorization: Bearer $TOKEN"

# Should return org resources
# Non-member should get 403
```

**Deprecated Route Tests:**
```bash
# Old routes should still work but return deprecation headers
curl -X GET /api/gateways -H "Authorization: Bearer $TOKEN"
# Should return data + Deprecation: true header
```

**UI Tests:**
- [ ] Dashboard loads with /api/user/* calls
- [ ] Context switcher changes navigation
- [ ] Org pages load with /api/org/:orgId/* calls
- [ ] No token refresh on context switch

#### Done Criteria:
- [ ] All new endpoints work
- [ ] Deprecated endpoints warn but work
- [ ] Non-members cannot access org resources
- [ ] UI works with new URL patterns

---

### Task 6.7.4.3: Production Deployment Re-verification

**Session Type:** DevOps
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.7.4.2 complete

#### Re-verification Checklist:

**Backend:**
- [ ] All new routes registered
- [ ] Deprecation middleware active
- [ ] Logging shows URL-based calls
- [ ] No errors in logs

**Frontend:**
- [ ] Build succeeds with new API calls
- [ ] No console errors
- [ ] All pages load correctly

**Database:**
- [ ] No schema changes needed
- [ ] Queries perform well

**Monitoring:**
- [ ] New routes appear in metrics
- [ ] Deprecated route usage tracked
- [ ] No increase in errors

**Security:**
- [ ] Org membership validated per-request
- [ ] No unauthorized access to org resources
- [ ] Token payload simplified (smaller attack surface)

**Documentation:**
- [ ] README reflects new architecture
- [ ] API docs updated
- [ ] Team informed of changes

#### Done Criteria:
- [ ] Production deployment successful
- [ ] All features work
- [ ] Monitoring shows healthy metrics
- [ ] Architecture alignment complete!

---

## ✅ Phase 6.7 Completion Checklist

- [ ] /api/user/* routes created and working
- [ ] /api/org/:orgId/* routes created and working
- [ ] Department routes properly nested
- [ ] Old endpoints deprecated with warnings
- [ ] Dashboard uses URL-based APIs
- [ ] Org pages use URL-based APIs
- [ ] Next.js proxy routes updated
- [ ] Context switcher is UI-only
- [ ] JWT token simplified
- [ ] Auth middleware updated
- [ ] Frontend auth provider updated
- [ ] API documentation updated
- [ ] Smoke tests passing
- [ ] Production re-verified

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

**After Phase 6.7, proceed to Phase 7 or Public Launch! 🚀**
