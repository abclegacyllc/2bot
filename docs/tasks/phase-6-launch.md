# Phase 6: Polish & Launch

> **Goal:** Final polish, testing, and launch preparation
> **Estimated Sessions:** 6
> **Prerequisites:** Phase 5 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| **Pages** ||||
| 6.1.1 | Create landing page | ✅ | 1 |
| 6.1.2 | Create dashboard home | ✅ | 1 |
| 6.1.3 | Create settings page (profile) | ✅ | 1 |
| **Theme System** ||||
| 6.2.1 | Install and configure next-themes | ✅ | 2 |
| 6.2.2 | Create theme toggle component | ✅ | 2 |
| 6.2.3 | Add theme persistence | ✅ | 2 |
| **UX Polish** ||||
| 6.3.1 | Add loading states everywhere | ✅ | 3 |
| 6.3.2 | Add error boundaries | ✅ | 3 |
| 6.3.3 | Add toast notifications | ✅ | 3 |
| **Monitoring** ||||
| 6.4.1 | Setup Sentry error tracking | ✅ | 4 |
| 6.4.2 | Create basic monitoring dashboard | ✅ | 4 |
| **Legal** ||||
| 6.5.1 | Create Terms of Service page | ✅ | 5 |
| 6.5.2 | Create Privacy Policy page | ✅ | 5 |
| **Launch Prep** ||||
| 6.6.1 | End-to-end smoke test | ⬜ | 6 |
| 6.6.2 | Production deployment prep | ⬜ | 6 |

> **📌 Note:** Phase 6.7 (Architecture Alignment) is in a separate document:
> [phase-6.7-architecture.md](phase-6.7-architecture.md)

---

## 📝 Detailed Tasks

### Task 6.1.1: Create Landing Page

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Phase 4 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/page.tsx (landing)
- [x] Hero section
- [x] Features section
- [x] Pricing section
- [x] CTA buttons

#### Sections:
```
1. Hero
   - Headline: "Automate Your Telegram with AI"
   - Subheadline: Brief description
   - CTA: "Get Started Free" / "View Pricing"

2. Features
   - Telegram Bot Integration
   - AI-Powered Automation
   - Analytics & Insights
   - Simple Setup

3. Pricing
   - Free tier card
   - Pro tier card
   - Feature comparison

4. Footer
   - Links: Terms, Privacy, Contact
   - Copyright
```

#### Done Criteria:
- [x] Responsive design
- [x] Clear value proposition
- [x] Working CTA buttons
- [x] Professional appearance

---

### Task 6.1.2: Create Dashboard Home

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 6.1.1 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/(dashboard)/dashboard/page.tsx
- [x] Overview cards
- [x] Quick actions
- [x] Recent activity

#### Components:
```
1. Welcome message with user name
2. Stats cards:
   - Active Gateways (X of Y)
   - Installed Plugins (X)
   - Executions Today (X of Y limit)
3. Quick Actions:
   - Add Gateway
   - Browse Plugins
   - View Analytics
4. Gateway Status List (mini)
5. Plan info (if free, show upgrade prompt)
```

#### Done Criteria:
- [x] Shows relevant stats
- [x] Quick navigation works
- [x] Upgrade prompt for free users
- [x] Responsive layout

#### Bonus: Dashboard Layout Architecture
Created shared dashboard layout with sidebar navigation and header:
- [x] src/app/(dashboard)/layout.tsx - Shared layout with ProtectedRoute
- [x] Collapsible sidebar with navigation
- [x] Header with context switcher and user menu
- [x] Moved all dashboard pages inside (dashboard)/ route group

---

### Task 6.1.3: Create Settings Page (Profile)

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.1.2 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/(dashboard)/dashboard/settings/page.tsx
- [x] Profile edit form
- [x] Password change form
- [x] Account info display

#### Features:
```
1. Profile Section
   - Name (editable)
   - Email (display only)
   - Avatar (future)

2. Security Section
   - Change password form
   - Current password required

3. Account Info
   - Member since date
   - Current plan
   - Link to billing settings
```

#### Done Criteria:
- [x] Can update name
- [x] Can change password
- [x] Shows account info
- [x] Links to billing

#### API Endpoints Created:
- [x] PATCH /api/auth/profile - Update user profile
- [x] POST /api/auth/change-password - Change user password

---

## 🎨 Theme System Tasks

### Task 6.2.1: Install and Configure next-themes

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.1.3 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] Install next-themes package
- [x] Create ThemeProvider wrapper
- [x] Update root layout

#### Implementation:
```bash
npm install next-themes
```

```typescript
// src/components/providers/theme-provider.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
```

```typescript
// Update src/app/layout.tsx
import { ThemeProvider } from "@/components/providers/theme-provider";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

#### Done Criteria:
- [x] next-themes installed
- [x] ThemeProvider wrapping app
- [x] No hydration errors
- [x] Dark mode works by default

---

### Task 6.2.2: Create Theme Toggle Component

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.2.1 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/components/ui/theme-toggle.tsx
- [x] Add to dashboard header

#### Implementation:
```typescript
// src/components/ui/theme-toggle.tsx
"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

#### Done Criteria:
- [x] Toggle component created
- [x] Shows current theme icon
- [x] Can switch between light/dark/system
- [x] Added to dashboard header

---

### Task 6.2.3: Add Theme Persistence

**Session Type:** Frontend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 6.2.2 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] Theme persists in localStorage (handled by next-themes)
- [x] No flash on page load (disableTransitionOnChange + suppressHydrationWarning)
- [x] System preference respected (enableSystem option)

#### Verification:
```
1. Set theme to light
2. Refresh page → should stay light
3. Set theme to system
4. Change OS preference → should follow
5. Set theme to dark
6. Open in incognito → should be dark (default)
```

#### Future Enhancement (V2 Marketplace):
```typescript
// Theme schema for custom themes
interface CustomTheme {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    foreground: string;
    // ... all CSS variables
  };
}

// Theme loader for marketplace themes
function applyCustomTheme(theme: CustomTheme) {
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  localStorage.setItem('custom-theme', JSON.stringify(theme));
}
```

#### Done Criteria:
- [x] Theme persists across sessions
- [x] No flash of wrong theme
- [x] System preference works
- [x] Ready for future custom themes

---

## ✨ UX Polish Tasks

### Task 6.3.1: Add Loading States Everywhere

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.1.3 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] Loading skeletons for all pages
- [x] Button loading states
- [x] Consistent loading patterns

#### Created Files:
- `src/components/ui/skeleton.tsx` - shadcn skeleton component
- `src/components/ui/loading-skeletons.tsx` - Reusable skeleton components
- `src/components/ui/loading-button.tsx` - Button with loading state
- `src/app/(dashboard)/dashboard/loading.tsx` - Dashboard skeleton
- `src/app/(dashboard)/dashboard/gateways/loading.tsx` - Gateways skeleton
- `src/app/(dashboard)/dashboard/gateways/[id]/loading.tsx` - Gateway detail skeleton
- `src/app/(dashboard)/dashboard/plugins/loading.tsx` - Plugins skeleton
- `src/app/(dashboard)/dashboard/my-plugins/loading.tsx` - My plugins skeleton
- `src/app/(dashboard)/dashboard/settings/loading.tsx` - Settings skeleton
- `src/app/(dashboard)/dashboard/settings/billing/loading.tsx` - Billing skeleton
- `src/app/(dashboard)/dashboard/organizations/loading.tsx` - Organizations skeleton

#### Done Criteria:
- [x] All pages have loading state
- [x] Buttons show spinner when submitting
- [x] Smooth transitions

---

### Task 6.3.2: Add Error Boundaries

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.3.1 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/components/error-boundary.tsx
- [x] error.tsx files for route segments
- [x] Fallback UI for errors

#### Created Files:
- `src/components/error-boundary.tsx` - ErrorBoundary class + ErrorFallback + InlineError
- `src/app/global-error.tsx` - Global app error page
- `src/app/(dashboard)/dashboard/error.tsx` - Dashboard error
- `src/app/(dashboard)/dashboard/gateways/error.tsx` - Gateways error
- `src/app/(dashboard)/dashboard/gateways/[id]/error.tsx` - Gateway detail error
- `src/app/(dashboard)/dashboard/plugins/error.tsx` - Plugins error
- `src/app/(dashboard)/dashboard/my-plugins/error.tsx` - My plugins error
- `src/app/(dashboard)/dashboard/settings/error.tsx` - Settings error
- `src/app/(dashboard)/dashboard/settings/billing/error.tsx` - Billing error
- `src/app/(dashboard)/dashboard/organizations/error.tsx` - Organizations error

#### Implementation:
```typescript
// Global error boundary
export function ErrorBoundary({ children }) {
  // Catch and display errors
  // "Something went wrong" UI
  // Retry button
  // Report error to Sentry
}

// Route-level error.tsx
export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

#### Done Criteria:
- [x] Errors don't crash entire app
- [x] User-friendly error messages
- [x] Retry functionality
- [x] Errors logged

---

### Task 6.3.3: Add Toast Notifications

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.3.2 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] Toast provider setup (sonner)
- [x] Success/error/info toasts
- [x] Used throughout app

#### Created Files:
- `src/components/ui/sonner.tsx` - Toaster component with dark theme styling
- Updated `src/app/layout.tsx` - Added Toaster to root layout
- Updated `src/app/(dashboard)/dashboard/settings/page.tsx` - Uses toast for feedback

#### Usage:
```typescript
import { toast } from 'sonner' // or shadcn toast

// On success
toast.success('Gateway created successfully')

// On error
toast.error('Failed to connect gateway')

// On info
toast.info('Checking connection...')
```

#### Done Criteria:
- [x] Toasts appear for all actions
- [x] Success actions confirmed
- [x] Errors shown clearly
- [x] Auto-dismiss after timeout

---

## 📊 Monitoring Tasks

### Task 6.4.1: Setup Sentry Error Tracking

**Session Type:** Config
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.3.3 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] Sentry SDK installed (@sentry/nextjs)
- [x] sentry.client.config.ts
- [x] sentry.server.config.ts
- [x] sentry.edge.config.ts
- [x] Environment variables in .env.example
- [x] src/lib/sentry.ts - Utility helpers

#### Configuration:
```typescript
// sentry.client.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})
```

#### Utility Helpers:
- `setSentryUser(user)` - Set user context
- `clearSentryUser()` - Clear user context
- `setSentryOrganization(org)` - Set org context
- `captureError(error, context)` - Capture with extra context
- `addBreadcrumb(message, category)` - Add breadcrumb

#### Done Criteria:
- [x] Errors sent to Sentry
- [x] User context helpers available
- [x] Error filtering in client config
- [x] Performance monitoring enabled

---

### Task 6.4.2: Create Basic Admin Dashboard

**Session Type:** Full-stack
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.4.1 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/(admin)/admin/layout.tsx - Admin layout with role guard
- [x] src/app/(admin)/admin/page.tsx - Dashboard home with stats
- [x] src/app/(admin)/admin/users/page.tsx - User list with pagination
- [x] src/app/(admin)/admin/gateways/page.tsx - Gateway overview
- [x] src/server/routes/admin.ts - Express admin routes
- [x] src/app/api/admin/stats/route.ts - Next.js API proxy
- [x] src/app/api/admin/users/route.ts - Next.js API proxy
- [x] src/app/api/admin/gateways/route.ts - Next.js API proxy
- [x] Loading and error pages for all admin routes

#### Access Control:
Uses `requireAdmin` middleware (Phase 1.5). Only ADMIN/SUPER_ADMIN can access.
Dashboard layout includes `AdminRoleGuard` component for client-side protection.

#### Features Implemented:
1. **Admin Home** (`/admin`)
   - User counts (total, active today, new this week)
   - Subscriptions by plan (Free/Starter/Pro/Business/Enterprise)
   - Gateway status overview (connected/errored/disconnected)
   - MRR display (calculated from subscriptions)
   - Workflow runs count (today/this week)

2. **Users Page** (`/admin/users`)
   - User list with search by name/email
   - Filter by subscription plan
   - Pagination with configurable page size
   - Shows: name, email, role, plan, gateway count, created/last login dates

3. **Gateways Page** (`/admin/gateways`)
   - All gateways across all users
   - Filter by status (CONNECTED/DISCONNECTED/ERROR/SUSPENDED)
   - Filter by gateway type
   - Shows: name, type, status, owner (user/org), execution count, created date
   - Pagination support

#### API Endpoint:
```typescript
GET /api/admin/stats
// Response:
{
  users: {
    total: number
    activeToday: number
    newThisWeek: number
  },
  subscriptions: {
    free: number
    starter: number
    pro: number
    business: number
    enterprise: number
    mrr: number
  },
  gateways: {
    total: number
    connected: number
    errored: number
    disconnected: number
  },
  executions: {
    today: number
    thisWeek: number
  }
}
```

#### Done Criteria:
- [x] Admin routes protected by role (requireAuth + requireAdmin middleware)
- [x] Can view all users with basic info (search, pagination, plan filter)
- [x] Can see gateway health overview (status counts, type filter)
- [x] Stats accurate and update on refresh
- [x] Responsive layout
- [x] Admin link in dashboard sidebar for ADMIN/SUPER_ADMIN users

---

## 📜 Legal Tasks

### Task 6.5.1: Create Terms of Service Page

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Any task complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/terms/page.tsx
- [x] Basic ToS content
- [x] Last updated date

#### Content Sections:
```
1. Acceptance of Terms
2. Description of Service
3. User Responsibilities
4. Prohibited Uses
5. Payment Terms
6. Intellectual Property
7. Limitation of Liability
8. Termination
9. Changes to Terms
10. Contact Information
```

#### Done Criteria:
- [x] Page accessible at /terms
- [x] Linked from footer
- [x] Linked from registration

---

### Task 6.5.2: Create Privacy Policy Page

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.5.1 complete
**Status:** ✅ COMPLETE

#### Deliverables:
- [x] src/app/privacy/page.tsx
- [x] Privacy policy content
- [x] Last updated date

#### Content Sections:
```
1. Information We Collect
2. How We Use Information
3. Information Sharing
4. Data Security
5. Your Rights
6. Cookies and Tracking
7. Third-Party Services
8. Data Retention
9. Children's Privacy
10. International Transfers
11. Changes to Policy
12. Contact
```

#### Done Criteria:
- [x] Page accessible at /privacy
- [x] Linked from footer
- [x] Linked from registration

---

## 🚀 Launch Prep Tasks

### Task 6.6.1: End-to-End Smoke Test

**Session Type:** Testing
**Estimated Time:** 45 minutes
**Prerequisites:** All previous tasks complete

#### Test Checklist:
```
Authentication:
- [ ] Can register new account
- [ ] Can login with credentials
- [ ] Can logout
- [ ] Can reset password
- [ ] Protected routes redirect to login

Gateways:
- [ ] Can create Telegram Bot gateway
- [ ] Can test gateway connection
- [ ] Can create AI gateway
- [ ] Can delete gateway
- [ ] Gateway status updates

Plugins:
- [ ] Can view available plugins
- [ ] Can install plugin
- [ ] Can configure plugin
- [ ] Can uninstall plugin
- [ ] Analytics plugin tracks messages

Billing:
- [ ] Can view current plan
- [ ] Can initiate upgrade (Stripe checkout)
- [ ] Can access billing portal
- [ ] Plan limits enforced

Workspace:
- [ ] Workspace starts on first gateway
- [ ] Can see resource usage
- [ ] Can restart workspace

General:
- [ ] All pages load without error
- [ ] Mobile responsive
- [ ] No console errors
- [ ] Toasts appear for actions
```

#### Done Criteria:
- [ ] All checklist items pass
- [ ] No critical bugs
- [ ] Ready for production

---

### Task 6.6.2: Production Deployment Prep

**Session Type:** DevOps
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.6.1 complete

#### Checklist:
```
Environment:
- [ ] Production DATABASE_URL configured
- [ ] Production REDIS_URL configured
- [ ] All secrets in production env
- [ ] NEXT_PUBLIC vars correct

Stripe:
- [ ] Switch to live Stripe keys
- [ ] Webhook endpoint configured for production URL
- [ ] Products/prices created in live mode

Database:
- [ ] Production database created
- [ ] Migrations applied
- [ ] Seed data (if needed)
- [ ] Backup configured

Deployment:
- [ ] Docker images built
- [ ] Container registry pushed
- [ ] Domain configured
- [ ] SSL certificate active
- [ ] CDN configured (optional)

Monitoring:
- [ ] Sentry DSN for production
- [ ] Health checks accessible
- [ ] Alerting configured

Documentation:
- [ ] README updated
- [ ] Deployment steps documented
- [ ] Runbook for common issues
```

#### Done Criteria:
- [ ] App accessible at production URL
- [ ] All features working
- [ ] Monitoring active
- [ ] Ready for users!

---

## ✅ Phase 6 Completion Checklist

**Phase 6.1-6.5 (Polish):**
- [x] Landing page live
- [x] Dashboard complete
- [x] Settings page working
- [x] Loading states everywhere
- [x] Error handling complete
- [x] Toast notifications active
- [x] Sentry tracking errors
- [x] Terms & Privacy pages

**Phase 6.6 (Launch Prep):**
- [ ] Smoke tests passing
- [ ] Production deployed

> **📌 Phase 6.7 (Architecture Alignment)** is tracked separately in:
> [phase-6.7-architecture.md](phase-6.7-architecture.md)

---

## 🚀 LAUNCH!

When Phase 6 is complete:

1. **Soft Launch** (After 6.6)
   - Share with 10-20 beta users
   - Gather feedback
   - Fix critical bugs

2. **Architecture Alignment** (Phase 6.7)
   - See [phase-6.7-architecture.md](phase-6.7-architecture.md)
   - Migrate to URL-based API pattern
   - Simplify token structure

3. **Public Launch** (After 6.7)
   - Announce on social media
   - Submit to directories
   - Start marketing

4. **Post-Launch**
   - Monitor errors (Sentry)
   - Track metrics
   - Respond to support
   - Plan V1.1 features

---

**Congratulations! 🎉 V1 is complete!**

