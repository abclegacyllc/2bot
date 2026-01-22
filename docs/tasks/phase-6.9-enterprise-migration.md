# Phase 6.9: Enterprise Migration (Single → Multi-Subdomain)

> **Goal:** Remove single-domain logic and fully migrate to enterprise subdomain architecture
> **Estimated Sessions:** 2-3
> **Prerequisites:** Phase 6.8 complete (plan architecture fixes), Cloudflare subdomains configured
> **Execution Order:** ⚠️ Complete Phase 6.8 FIRST (critical bug fixes)
> **Why:** Simplify architecture - no more proxy routes, direct API calls

---

## 🎯 Target Architecture

```
2bot.org           → Landing/Marketing
dash.2bot.org      → Dashboard (Next.js)
api.2bot.org       → Backend API (Express) - NO /api prefix
admin.2bot.org     → Admin Panel
```

**Key Change:** Frontend calls `api.2bot.org` directly, no Next.js proxy needed!

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| **Configuration** ||||
| 6.9.1.1 | Update CORS to enterprise-only | ⬜ | 1 |
| 6.9.1.2 | Update URL config to enterprise-only | ⬜ | 1 |
| 6.9.1.3 | Set API_PREFIX="" as default | ⬜ | 1 |
| 6.9.1.4 | Update environment files | ⬜ | 1 |
| **Frontend Migration** ||||
| 6.9.2.1 | Create API client utility | ⬜ | 1 |
| 6.9.2.2 | Update auth-provider to use API client | ⬜ | 1 |
| 6.9.2.3 | Update all dashboard pages to use API client | ⬜ | 1-2 |
| 6.9.2.4 | Update all components to use API client | ⬜ | 2 |
| **Cleanup** ||||
| 6.9.3.1 | Remove Next.js API proxy routes | ⬜ | 2 |
| 6.9.3.2 | Remove deprecated backend routes | ⬜ | 2 |
| 6.9.3.3 | Remove single-domain nginx config | ⬜ | 2 |
| 6.9.3.4 | Update docker-compose (enterprise only) | ⬜ | 2 |
| **Verification** ||||
| 6.9.4.1 | Test all API endpoints | ⬜ | 3 |
| 6.9.4.2 | Test CORS from all subdomains | ⬜ | 3 |
| 6.9.4.3 | Production deployment | ⬜ | 3 |

---

## 📝 Detailed Tasks

### Task 6.9.1.1: Update CORS to Enterprise-Only

**Session Type:** Backend
**Estimated Time:** 10 minutes

**File:** `src/server/middleware/cors.ts`

**Changes:**
- Remove all `localhost` origins
- Keep only production subdomains
- Remove development fallbacks

```typescript
// src/server/middleware/cors.ts - ENTERPRISE ONLY
const allowedOrigins = [
  // Production - Main domain
  "https://2bot.org",
  "https://www.2bot.org",
  
  // Production - Enterprise Subdomains
  "https://dash.2bot.org",
  "https://admin.2bot.org",
  "https://support.2bot.org",
  "https://docs.2bot.org",
  "https://dev.2bot.org",
  
  // Environment-configured URLs (for flexibility)
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.NEXT_PUBLIC_DASHBOARD_URL,
  process.env.NEXT_PUBLIC_ADMIN_URL,
].filter(Boolean) as string[];
```

#### Done Criteria:
- [ ] Remove localhost origins
- [ ] Only production subdomains allowed
- [ ] CORS_ORIGINS env var still works for custom deployments

---

### Task 6.9.1.2: Update URL Config to Enterprise-Only

**Session Type:** Backend/Frontend
**Estimated Time:** 15 minutes

**File:** `src/shared/config/urls.ts`

**Changes:**
- Remove localhost fallbacks
- Production URLs as defaults
- Simpler configuration

```typescript
// src/shared/config/urls.ts - ENTERPRISE ONLY
export const URLS = {
  api: process.env.NEXT_PUBLIC_API_URL || 'https://api.2bot.org',
  dashboard: process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://dash.2bot.org',
  main: process.env.NEXT_PUBLIC_APP_URL || 'https://2bot.org',
  admin: process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.2bot.org',
  support: process.env.NEXT_PUBLIC_SUPPORT_URL || 'https://support.2bot.org',
};

/**
 * Build API URL for fetch calls
 * @example apiUrl('/user/gateways') → 'https://api.2bot.org/user/gateways'
 */
export function apiUrl(path: string): string {
  const base = URLS.api.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
```

#### Done Criteria:
- [ ] No localhost references
- [ ] Production URLs as defaults
- [ ] apiUrl() helper works correctly

---

### Task 6.9.1.3: Set API_PREFIX="" as Default

**Session Type:** Backend
**Estimated Time:** 5 minutes

**File:** `src/server/app.ts`

**Change:**
```typescript
// FROM:
const API_PREFIX = process.env.API_PREFIX ?? "/api";

// TO:
const API_PREFIX = process.env.API_PREFIX ?? "";  // Enterprise: no prefix
```

**Result:** Routes at `api.2bot.org/user/gateways` (not `/api/user/gateways`)

#### Done Criteria:
- [ ] API_PREFIX defaults to empty string
- [ ] Routes work without /api prefix

---

### Task 6.9.1.4: Update Environment Files

**Session Type:** DevOps
**Estimated Time:** 10 minutes

**File:** `.env.example`

```bash
# ===========================================
# Enterprise Subdomain Configuration
# ===========================================

# API Server (Express)
NEXT_PUBLIC_API_URL=https://api.2bot.org

# Dashboard (Next.js)
NEXT_PUBLIC_DASHBOARD_URL=https://dash.2bot.org

# Main Website
NEXT_PUBLIC_APP_URL=https://2bot.org

# Admin Panel
NEXT_PUBLIC_ADMIN_URL=https://admin.2bot.org

# Support (Phase 7)
NEXT_PUBLIC_SUPPORT_URL=https://support.2bot.org

# API Prefix (empty for enterprise subdomain mode)
API_PREFIX=

# CORS (additional origins, comma-separated)
# CORS_ORIGINS=https://custom.domain.com
```

#### Done Criteria:
- [ ] .env.example updated
- [ ] .env.production updated
- [ ] No localhost references

---

### Task 6.9.2.1: Create API Client Utility

**Session Type:** Frontend
**Estimated Time:** 20 minutes

**File:** `src/lib/api-client.ts` (new)

```typescript
/**
 * API Client for Enterprise Architecture
 * 
 * Calls api.2bot.org directly - no Next.js proxy needed.
 */

import { URLS, apiUrl } from "@/shared/config/urls";

interface FetchOptions extends RequestInit {
  token?: string;
}

/**
 * Make authenticated API request
 */
export async function apiRequest<T>(
  path: string,
  options: FetchOptions = {}
): Promise<{ success: boolean; data?: T; error?: { code: string; message: string } }> {
  const { token, headers, ...rest } = options;
  
  const url = apiUrl(path);
  
  const response = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
  });
  
  return response.json();
}

/**
 * GET request
 */
export function apiGet<T>(path: string, token?: string) {
  return apiRequest<T>(path, { method: "GET", token });
}

/**
 * POST request
 */
export function apiPost<T>(path: string, body: unknown, token?: string) {
  return apiRequest<T>(path, { 
    method: "POST", 
    body: JSON.stringify(body),
    token,
  });
}

/**
 * PUT request
 */
export function apiPut<T>(path: string, body: unknown, token?: string) {
  return apiRequest<T>(path, { 
    method: "PUT", 
    body: JSON.stringify(body),
    token,
  });
}

/**
 * DELETE request
 */
export function apiDelete<T>(path: string, token?: string) {
  return apiRequest<T>(path, { method: "DELETE", token });
}
```

#### Done Criteria:
- [ ] API client created
- [ ] Supports GET, POST, PUT, DELETE
- [ ] Token passed in Authorization header

---

### Task 6.9.2.2: Update auth-provider to Use API Client

**Session Type:** Frontend
**Estimated Time:** 20 minutes

**File:** `src/components/providers/auth-provider.tsx`

**Changes:**
```typescript
// FROM:
const response = await fetch("/api/auth/login", { ... });
const response = await fetch("/api/user/organizations", { ... });

// TO:
import { apiUrl } from "@/shared/config/urls";
const response = await fetch(apiUrl("/auth/login"), { ... });
const response = await fetch(apiUrl("/user/organizations"), { ... });
```

#### Done Criteria:
- [ ] All fetch calls use apiUrl()
- [ ] Auth flows work with api.2bot.org

---

### Task 6.9.2.3: Update All Dashboard Pages to Use API Client

**Session Type:** Frontend
**Estimated Time:** 45 minutes

**Files to update:**
- `src/app/(auth)/register/page.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/gateways/page.tsx`
- `src/app/(dashboard)/dashboard/gateways/new/page.tsx`
- `src/app/(dashboard)/dashboard/plugins/page.tsx`
- `src/app/(dashboard)/dashboard/organizations/page.tsx`
- `src/app/(dashboard)/dashboard/organizations/new/page.tsx`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/(dashboard)/dashboard/settings/billing/page.tsx`
- `src/app/(dashboard)/dashboard/settings/billing/upgrade/page.tsx`
- `src/app/(dashboard)/dashboard/settings/organization/monitoring/page.tsx`
- `src/app/(dashboard)/dashboard/settings/organization/resources/page.tsx`
- `src/app/(dashboard)/dashboard/settings/organization/departments/[id]/quotas/page.tsx`

**Pattern:**
```typescript
// FROM:
fetch("/api/user/gateways", { headers: { Authorization: ... } })

// TO:
import { apiUrl } from "@/shared/config/urls";
fetch(apiUrl("/user/gateways"), { headers: { Authorization: ... } })
```

#### Done Criteria:
- [ ] All dashboard pages use apiUrl()
- [ ] No hardcoded /api/ paths

---

### Task 6.9.2.4: Update All Components to Use API Client

**Session Type:** Frontend
**Estimated Time:** 20 minutes

**Files to update:**
- `src/components/organization/alert-settings.tsx`
- `src/components/billing/subscription-badge.tsx`

**Pattern same as 6.9.2.3**

#### Done Criteria:
- [ ] All components use apiUrl()
- [ ] No hardcoded /api/ paths

---

### Task 6.9.3.1: Remove Next.js API Proxy Routes

**Session Type:** Frontend
**Estimated Time:** 15 minutes

**Action:** Delete entire `src/app/api/` directory

**Why:** In enterprise mode, frontend calls `api.2bot.org` directly. No proxy needed.

```bash
rm -rf src/app/api/
```

#### Done Criteria:
- [ ] src/app/api/ directory deleted
- [ ] No Next.js proxy routes remain
- [ ] Build succeeds without API routes

---

### Task 6.9.3.2: Remove Deprecated Backend Routes

**Session Type:** Backend
**Estimated Time:** 15 minutes

**Files to clean up:**
- Remove `deprecated()` middleware usage from routes
- Remove old context-based endpoints that are no longer needed

**Routes to review:**
- `src/server/routes/gateway.ts` - Remove deprecated GET /gateways
- `src/server/routes/plugin.ts` - Remove deprecated /plugins/user/plugins
- `src/server/routes/quota.ts` - Remove deprecated /quota/status

#### Done Criteria:
- [ ] Deprecated routes removed
- [ ] Only URL-based routes remain

---

### Task 6.9.3.3: Remove Single-Domain Nginx Config

**Session Type:** DevOps
**Estimated Time:** 5 minutes

**Action:**
```bash
# Remove single-domain config
rm nginx/2bot.org.conf

# Rename enterprise config as the main config
mv nginx/2bot.enterprise.conf nginx/2bot.conf
```

#### Done Criteria:
- [ ] Single-domain nginx config removed
- [ ] Enterprise config is the main config

---

### Task 6.9.3.4: Update docker-compose (Enterprise Only)

**Session Type:** DevOps
**Estimated Time:** 10 minutes

**Action:**
```bash
# Remove old single-domain compose
rm docker-compose.yml

# Rename enterprise as main
mv docker-compose.enterprise.yml docker-compose.yml

# Update production compose
mv docker-compose.prod.yml docker-compose.prod.yml.backup
# Create new prod compose based on enterprise
```

#### Done Criteria:
- [ ] Single-domain docker-compose removed
- [ ] Enterprise compose is the default

---

### Task 6.9.4.1: Test All API Endpoints

**Session Type:** Testing
**Estimated Time:** 30 minutes

**Test script:**
```bash
# Set your token
TOKEN="your-jwt-token"

# Test from dash.2bot.org calling api.2bot.org
echo "=== User endpoints ==="
curl -H "Authorization: Bearer $TOKEN" https://api.2bot.org/user/gateways
curl -H "Authorization: Bearer $TOKEN" https://api.2bot.org/user/plugins
curl -H "Authorization: Bearer $TOKEN" https://api.2bot.org/user/quota
curl -H "Authorization: Bearer $TOKEN" https://api.2bot.org/user/organizations

echo "=== Auth endpoints ==="
curl -X POST https://api.2bot.org/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test"}'

echo "=== Org endpoints ==="
curl -H "Authorization: Bearer $TOKEN" https://api.2bot.org/orgs/$ORG_ID/gateways
```

#### Done Criteria:
- [ ] All endpoints return correct responses
- [ ] No 404 errors
- [ ] CORS headers present

---

### Task 6.9.4.2: Test CORS from All Subdomains

**Session Type:** Testing
**Estimated Time:** 15 minutes

**Test in browser console from each subdomain:**
```javascript
// From dash.2bot.org
fetch('https://api.2bot.org/health')
  .then(r => r.json())
  .then(console.log);

// Should work without CORS errors
```

#### Done Criteria:
- [ ] dash.2bot.org can call api.2bot.org
- [ ] admin.2bot.org can call api.2bot.org
- [ ] 2bot.org can call api.2bot.org

---

### Task 6.9.4.3: Production Deployment

**Session Type:** DevOps
**Estimated Time:** 30 minutes

**Deployment steps:**
1. Deploy API to api.2bot.org
2. Deploy Dashboard to dash.2bot.org
3. Deploy Admin to admin.2bot.org
4. Verify all services

#### Done Criteria:
- [ ] All subdomains accessible
- [ ] All API calls work
- [ ] No errors in logs

---

## ✅ Phase 6.9 Completion Checklist

- [ ] CORS updated to enterprise-only
- [ ] URL config updated to enterprise-only
- [ ] API_PREFIX="" as default
- [ ] Environment files updated
- [ ] API client utility created
- [ ] All frontend fetch calls use apiUrl()
- [ ] Next.js API proxy routes deleted
- [ ] Deprecated backend routes removed
- [ ] Single-domain nginx config removed
- [ ] docker-compose updated to enterprise
- [ ] All endpoints tested
- [ ] CORS tested from all subdomains
- [ ] Production deployed

---

## 📊 Before/After Comparison

| Aspect | Before (Single) | After (Enterprise) |
|--------|-----------------|-------------------|
| API calls | `fetch("/api/user/gateways")` | `fetch("https://api.2bot.org/user/gateways")` |
| Next.js proxy | 66 route files | 0 (deleted) |
| API URL | `2bot.org/api/*` | `api.2bot.org/*` |
| CORS | localhost + production | production only |
| Nginx config | 2 configs | 1 config (enterprise) |

---

**After Phase 6.9, your architecture is fully enterprise-ready! 🚀**
