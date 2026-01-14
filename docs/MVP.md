# 🎯 2Bot MVP (V1.0) - Minimum Viable Product

> **Goal:** Ship the smallest possible product that provides value and generates revenue
> **Target:** 50-70 AI sessions to complete

---

## ✅ V1 Scope (INCLUDE)

| Feature | Description | Why Essential |
|---------|-------------|---------------|
| **Email/Password Auth** | Register, login, logout, password reset | Core requirement |
| **User Profile** | Basic settings, profile management | User identity |
| **Telegram Bot Gateway** | Connect Telegram bots, receive/send messages | Core value prop |
| **AI Gateway** | Connect OpenAI/other AI, basic chat/completion | Core value prop |
| **1 Built-in Plugin** | Analytics plugin (message stats) | Demonstrate plugin system |
| **Basic Dashboard** | Overview page, gateway status | User needs to see something |
| **Stripe Subscriptions** | Free + Pro ($29) plans only | Revenue |
| **Workspace Container** | Basic Docker isolation per user | Core architecture |
| **Resource Monitoring** | Show RAM/CPU usage | Users need to know limits |

---

## ❌ V2 Scope (DEFER)

| Feature | Why Defer |
|---------|-----------|
| OAuth (Google, GitHub) | Email/password is enough for launch |
| Telegram User (MTProto) | Legal risk, complex, niche use case |
| Plugin Marketplace | Need users first, then creators |
| Theme System | Nice-to-have, not essential |
| Widget System | Nice-to-have, not essential |
| Service/Workflow Builder | Complex, can launch without it |
| Credit System | Subscription is simpler to start |
| Organizations/Teams | Single user is enough for MVP |
| Multiple AI Providers | OpenAI only is fine for V1 |
| 2FA | Can add post-launch |
| Advanced Analytics | Basic stats are enough |

---

## 📊 V1 Technical Scope

### Database Models (V1 Only)
```
User              - Basic user account (with role, orgId fields)
Session           - Auth sessions
Gateway           - Gateway configurations (TG_BOT, AI)
Plugin            - Plugin definitions (built-in only)
UserPlugin        - User's installed plugins
Subscription      - Stripe subscription data
AuditLog          - Security audit trail
CreditBalance     - User credit balance (prepared for V2)
CreditTransaction - Credit usage history (prepared for V2)
```

### API Endpoints (V1 Only)
```
Auth:
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/logout
  POST /api/auth/forgot-password
  POST /api/auth/reset-password
  GET  /api/auth/me

User:
  GET  /api/user/profile
  PUT  /api/user/profile
  PUT  /api/user/password

Gateways:
  GET    /api/gateways
  POST   /api/gateways
  GET    /api/gateways/:id
  PUT    /api/gateways/:id
  DELETE /api/gateways/:id
  POST   /api/gateways/:id/test

Plugins:
  GET  /api/plugins              (available plugins)
  GET  /api/user/plugins         (installed)
  POST /api/user/plugins/:id/install
  POST /api/user/plugins/:id/uninstall
  PUT  /api/user/plugins/:id/config

Billing:
  GET  /api/billing/subscription
  POST /api/billing/create-checkout
  POST /api/billing/create-portal
  POST /api/webhooks/stripe

Workspace:
  GET  /api/workspace/status
  POST /api/workspace/start
  POST /api/workspace/stop
```

### Pages (V1 Only)
```
Public:
  /                    - Landing page
  /login               - Login form
  /register            - Registration form
  /forgot-password     - Password reset request
  /reset-password      - Password reset form

Dashboard:
  /dashboard           - Main dashboard
  /gateways            - Gateway list
  /gateways/new        - Add gateway
  /gateways/:id        - Gateway detail/config
  /plugins             - Available plugins
  /my-plugins          - Installed plugins
  /settings            - User settings
  /settings/billing    - Subscription management
```

---

## 🏗️ V1 Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────┐
│                      V1 ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FRONTEND (Next.js 14)                              │   │
│  │  - Landing, Auth, Dashboard, Settings               │   │
│  │  - shadcn/ui components                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PLATFORM API (Express)                             │   │
│  │  - Auth, User, Gateway, Plugin, Billing APIs        │   │
│  │  - Workspace orchestrator                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐          │
│  │ PostgreSQL│    │   Redis   │    │  BullMQ   │          │
│  │  (Data)   │    │  (Cache)  │    │  (Queue)  │          │
│  └───────────┘    └───────────┘    └───────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  USER WORKSPACE (Docker Container)                   │   │
│  │  - Gateway workers (TG Bot, AI)                      │   │
│  │  - Plugin runtime                                    │   │
│  │  - Resource limits per plan                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 💰 V1 Pricing (Simplified)

| Plan | Price | Limits |
|------|-------|--------|
| **FREE** | $0 | 1 gateway, 1 plugin, 100 exec/day, 256MB |
| **PRO** | $29/mo | 10 gateways, unlimited plugins, 10K exec/day, 1GB |

That's it. Two plans. Simple.

---

## 📅 V1 Phases

| Phase | Tasks | Sessions | Focus | Status |
|-------|-------|----------|-------|--------|
| **Phase 0** | 15 | 8-10 | Project setup, tooling, database | ✅ Complete |
| **Phase 1** | 20 | 12-15 | Authentication system | ✅ Complete |
| **Phase 1.5** | 14 | 2-3 | Architecture prep (roles, audit, context) | ✅ Complete |
| **Phase 2** | 16 | 10-12 | Gateway system (TG Bot + AI) | 🔄 In Progress |
| **Phase 3** | 12 | 8-10 | Plugin system + 1 plugin | ⬜ Not Started |
| **Phase 4** | 15 | 10-12 | Billing + Workspace (checkpoint) | ⬜ Not Started |
| **Phase 5** | 12 | 8-10 | Polish, testing, launch prep | ⬜ Not Started |
| **Phase 6** | 22 | 10-15 | Support system (optional for V1) | ⬜ Not Started |
| **TOTAL** | **126** | **68-87** | | |

> **Note:** Phase 1.5 was added for architecture preparation. Phase 6 Support is optional for MVP launch.

---

## ✅ V1 Launch Checklist

### Before Launch
- [ ] All V1 features working
- [ ] Landing page complete
- [ ] Stripe in production mode
- [ ] Error tracking (Sentry) active
- [ ] Basic monitoring setup
- [ ] Terms of Service page
- [ ] Privacy Policy page
- [ ] Domain + SSL configured
- [ ] Database backups configured
- [ ] Status page created

### Launch Day
- [ ] Final smoke test
- [ ] Enable production Stripe
- [ ] Announce to beta list
- [ ] Monitor for errors

---

## 🎯 V1 Success Criteria

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Registered users | 100 | Month 1 |
| Active users (weekly) | 50 | Month 1 |
| Paying customers | 10 | Month 1 |
| MRR | $290 | Month 1 |
| Uptime | 99% | Month 1 |

---

*V1 focused. Ship fast. Iterate based on feedback.*
