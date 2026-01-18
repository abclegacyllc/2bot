# Phase 6: Polish & Launch

> **Goal:** Final polish, testing, and launch preparation
> **Estimated Sessions:** 8-10
> **Prerequisites:** Phase 5 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| **Pages** ||||
| 6.1.1 | Create landing page | ⬜ | - |
| 6.1.2 | Create dashboard home | ⬜ | - |
| 6.1.3 | Create settings page (profile) | ⬜ | - |
| **Theme System** ||||
| 6.2.1 | Install and configure next-themes | ⬜ | - |
| 6.2.2 | Create theme toggle component | ⬜ | - |
| 6.2.3 | Add theme persistence | ⬜ | - |
| **UX Polish** ||||
| 6.3.1 | Add loading states everywhere | ⬜ | - |
| 6.3.2 | Add error boundaries | ⬜ | - |
| 6.3.3 | Add toast notifications | ⬜ | - |
| **Monitoring** ||||
| 6.4.1 | Setup Sentry error tracking | ⬜ | - |
| 6.4.2 | Create basic monitoring dashboard | ⬜ | - |
| **Legal** ||||
| 6.5.1 | Create Terms of Service page | ⬜ | - |
| 6.5.2 | Create Privacy Policy page | ⬜ | - |
| **Launch Prep** ||||
| 6.6.1 | End-to-end smoke test | ⬜ | - |
| 6.6.2 | Production deployment prep | ⬜ | - |

---

## 📝 Detailed Tasks

### Task 6.1.1: Create Landing Page

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Phase 4 complete

#### Deliverables:
- [ ] src/app/page.tsx (landing)
- [ ] Hero section
- [ ] Features section
- [ ] Pricing section
- [ ] CTA buttons

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
- [ ] Responsive design
- [ ] Clear value proposition
- [ ] Working CTA buttons
- [ ] Professional appearance

---

### Task 6.1.2: Create Dashboard Home

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 6.1.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/dashboard/page.tsx
- [ ] Overview cards
- [ ] Quick actions
- [ ] Recent activity

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
- [ ] Shows relevant stats
- [ ] Quick navigation works
- [ ] Upgrade prompt for free users
- [ ] Responsive layout

---

### Task 6.1.3: Create Settings Page (Profile)

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.1.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/settings/page.tsx
- [ ] Profile edit form
- [ ] Password change form
- [ ] Account info display

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
- [ ] Can update name
- [ ] Can change password
- [ ] Shows account info
- [ ] Links to billing

---

## 🎨 Theme System Tasks

### Task 6.2.1: Install and Configure next-themes

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.1.3 complete

#### Deliverables:
- [ ] Install next-themes package
- [ ] Create ThemeProvider wrapper
- [ ] Update root layout

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
- [ ] next-themes installed
- [ ] ThemeProvider wrapping app
- [ ] No hydration errors
- [ ] Dark mode works by default

---

### Task 6.2.2: Create Theme Toggle Component

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.2.1 complete

#### Deliverables:
- [ ] src/components/ui/theme-toggle.tsx
- [ ] Add to dashboard header

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
- [ ] Toggle component created
- [ ] Shows current theme icon
- [ ] Can switch between light/dark/system
- [ ] Added to dashboard header

---

### Task 6.2.3: Add Theme Persistence

**Session Type:** Frontend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 6.2.2 complete

#### Deliverables:
- [ ] Theme persists in localStorage
- [ ] No flash on page load
- [ ] System preference respected

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
- [ ] Theme persists across sessions
- [ ] No flash of wrong theme
- [ ] System preference works
- [ ] Ready for future custom themes

---

## ✨ UX Polish Tasks

### Task 6.3.1: Add Loading States Everywhere

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.1.3 complete

#### Deliverables:
- [ ] Loading skeletons for all pages
- [ ] Button loading states
- [ ] Consistent loading patterns

#### Pages to Add Loading:
```
- Dashboard: Stats skeleton
- Gateways: List skeleton
- Gateway Detail: Form skeleton
- Plugins: Grid skeleton
- Settings: Form skeleton
```

#### Done Criteria:
- [ ] All pages have loading state
- [ ] Buttons show spinner when submitting
- [ ] Smooth transitions

---

### Task 6.3.2: Add Error Boundaries

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.3.1 complete

#### Deliverables:
- [ ] src/components/error-boundary.tsx
- [ ] error.tsx files for route segments
- [ ] Fallback UI for errors

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
- [ ] Errors don't crash entire app
- [ ] User-friendly error messages
- [ ] Retry functionality
- [ ] Errors logged

---

### Task 6.3.3: Add Toast Notifications

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.3.2 complete

#### Deliverables:
- [ ] Toast provider setup (shadcn/ui)
- [ ] Success/error/info toasts
- [ ] Used throughout app

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
- [ ] Toasts appear for all actions
- [ ] Success actions confirmed
- [ ] Errors shown clearly
- [ ] Auto-dismiss after timeout

---

## 📊 Monitoring Tasks

### Task 6.4.1: Setup Sentry Error Tracking

**Session Type:** Config
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.3.3 complete

#### Deliverables:
- [ ] Sentry SDK installed
- [ ] sentry.client.config.ts
- [ ] sentry.server.config.ts
- [ ] Environment variables

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

#### Done Criteria:
- [ ] Errors sent to Sentry
- [ ] Source maps uploaded
- [ ] User context attached
- [ ] Performance monitoring

---

### Task 6.4.2: Create Basic Admin Dashboard

**Session Type:** Full-stack
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.4.1 complete

#### Deliverables:
- [ ] src/app/(admin)/admin/layout.tsx
- [ ] src/app/(admin)/admin/page.tsx - Dashboard home
- [ ] src/app/(admin)/admin/users/page.tsx - User list
- [ ] src/app/(admin)/admin/gateways/page.tsx - Gateway overview
- [ ] GET /api/admin/stats (admin only)

#### Access Control:
Uses `requireAdmin` middleware (Phase 1.5). Only ADMIN/SUPER_ADMIN can access.

#### Pages:
1. **Admin Home** (`/admin`)
   - User counts (total, active today, new this week)
   - Subscriptions by plan (Free/Starter/Pro/Business/Enterprise)
   - Gateway status overview (connected/errored counts)
   - MRR display

2. **Users Page** (`/admin/users`)
   - User list with search
   - Show: email, plan, role, last login, created date
   - Link to user details (future)

3. **Gateways Page** (`/admin/gateways`)
   - All gateways across users
   - Filter by status (connected/errored/disconnected)
   - Show: user email, gateway name, type, status, last error

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
- [ ] Admin routes protected by role
- [ ] Can view all users with basic info
- [ ] Can see gateway health overview
- [ ] Stats accurate and update on refresh
- [ ] Responsive layout

---

## 📜 Legal Tasks

### Task 6.5.1: Create Terms of Service Page

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Any task complete

#### Deliverables:
- [ ] src/app/terms/page.tsx
- [ ] Basic ToS content
- [ ] Last updated date

#### Content Sections:
```
1. Acceptance of Terms
2. Description of Service
3. User Responsibilities
4. Prohibited Uses
5. Payment Terms
6. Limitation of Liability
7. Termination
8. Changes to Terms
9. Contact Information
```

#### Done Criteria:
- [ ] Page accessible at /terms
- [ ] Linked from footer
- [ ] Linked from registration

---

### Task 6.5.2: Create Privacy Policy Page

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.5.1 complete

#### Deliverables:
- [ ] src/app/privacy/page.tsx
- [ ] Privacy policy content
- [ ] Last updated date

#### Content Sections:
```
1. Information We Collect
2. How We Use Information
3. Information Sharing
4. Data Security
5. Your Rights
6. Cookies
7. Third-Party Services
8. Changes to Policy
9. Contact
```

#### Done Criteria:
- [ ] Page accessible at /privacy
- [ ] Linked from footer
- [ ] Linked from registration

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

- [ ] Landing page live
- [ ] Dashboard complete
- [ ] Settings page working
- [ ] Loading states everywhere
- [ ] Error handling complete
- [ ] Toast notifications active
- [ ] Sentry tracking errors
- [ ] Terms & Privacy pages
- [ ] Smoke tests passing
- [ ] Production deployed

---

## 🚀 LAUNCH!

When Phase 6 is complete:

1. **Soft Launch**
   - Share with 10-20 beta users
   - Gather feedback
   - Fix critical bugs

2. **Public Launch**
   - Announce on social media
   - Submit to directories
   - Start marketing

3. **Post-Launch**
   - Monitor errors (Sentry)
   - Track metrics
   - Respond to support
   - Plan V1.1 features

---

**Congratulations! 🎉 V1 is complete!**
