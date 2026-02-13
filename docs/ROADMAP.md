# 🚀 2Bot Platform - Complete Development Roadmap

> **Mission:** Build the first commercially successful SaaS platform with 100% AI-generated code
> 
> **Vision:** A modular automation platform where users connect gateways (Telegram Bot, Telegram User Account, AI, and more) and install marketplace items (plugins, themes, widgets, services) to automate their workflows without coding.

---

## 📋 Table of Contents

1. [Product Overview](#product-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Security Architecture](#security-architecture)
5. [Folder Structure](#folder-structure)
6. [Development Phases](#development-phases)
7. [Database Schema](#database-schema)
8. [API Structure](#api-structure)
9. [Gateway System](#gateway-system)
10. [Marketplace Items](#marketplace-items)
    - [Plugins](#plugin-system)
    - [Themes](#theme-system)
    - [Widgets](#widget-system)
    - [Services (Workflows)](#service-system)
11. [Monetization](#monetization)
12. [Success Metrics](#success-metrics)
13. [Current Status](#current-status)
14. [Notes](#notes)
15. [Future Considerations](#future-considerations)

---

## 🎯 Product Overview

### What is 2Bot?

2Bot is a **modular automation platform** that allows users to:

1. **Connect Gateways** - Set up connections to various platforms (Telegram Bot, Telegram User Account, AI, future: Discord Bot, Slack Bot, WhatsApp, etc.)
2. **Install Plugins** - Choose from a marketplace of automation plugins
3. **Automate Everything** - Plugins use gateways to perform automated tasks
4. **Scale Infinitely** - Gateways can communicate with each other for complex workflows

### Target Users

| User Type | Use Case |
|-----------|----------|
| Content Creators | Auto-reply, welcome messages, analytics, auto-posting |
| Community Managers | Moderation, engagement tracking |
| HR Managers | Employee tracking, bonus systems |
| Marketers | Campaign automation, lead generation |
| Developers | Build and sell custom plugins, themes, widgets, services |
| **Organizations** | **Companies needing shared automation across departments** |

### Organization Use Cases (Enterprise)

| Industry | Departments | Example Plugins/Services |
|----------|-------------|-------------------------|
| **Trucking Company** | HR, Driver, Fleet, Safety, Dispatch, Accounting | KPI Tracking, Bonus Calculator, Tire Inspection, PTI Checklist, Dispatch Notifications |
| **Marketing Agency** | Creative, Social Media, Analytics, Sales | Content Maker, Auto-Poster, Lead Generator, Campaign Tracker |
| **E-commerce** | Customer Support, Inventory, Marketing, Shipping | Auto-Reply, Stock Alert, Review Manager, Shipping Notification |
| **Real Estate** | Agents, Listings, Marketing, Admin | Lead Capture, Property Alert, Tour Scheduler, Commission Tracker |

**Organization Benefits:**
- 🎫 **Buy Once, Share Many** - Purchase plugin/service once, share across all employees
- 🏢 **Department Control** - Assign specific tools to specific departments
- 👥 **Seat-Based Licensing** - Pay per user seat, not per plugin per user
- 📊 **Centralized Billing** - One invoice for entire organization
- 🔒 **Shared Data** - Organization-wide database for cross-department insights
- 🔐 **Permission Control** - Fine-grained access per department/role

### Marketplace Item Types

| Item Type | Description | Example |
|-----------|-------------|---------|
| **Plugin** | Single-purpose automation module | Analytics, Welcome Message, HR Bonus |
| **Theme** | UI customization for dashboard | Dark Mode, Ocean Breeze, Custom Branding |
| **Widget** | Dashboard display components | Stats Card, Activity Chart, Gateway Status |
| **Service (Workflow)** | Multi-gateway workflow pipeline | Content Maker, Auto-Poster, Lead Generator |

### Terminology Clarification

> **⚠️ IMPORTANT:** This document uses specific terms consistently:
>
> | Term | Meaning | NOT to confuse with |
> |------|---------|---------------------|
> | **Platform** | Shared infrastructure (Auth, Billing, API) | User's workspace |
> | **Workspace** | User's isolated Docker container | Platform services |
> | **Service (Marketplace)** | User-created workflow/automation pipeline | Backend services |
> | **Backend Service** | Platform code module (auth.service.ts) | Marketplace service |
> | **Plugin** | Single-purpose automation (runs inside workspace) | Backend module |
> | **Gateway** | External connection (Telegram, AI) | Internal messaging |
> | **Orchestrator** | Container lifecycle manager | Workflow engine |
> | **Workflow Engine** | Executes Service (marketplace) steps | Orchestrator |
> | **Organization** | Company/team that owns shared resources | Individual user account |
> | **Department** | Sub-group within organization (HR, Fleet) | Workspace |
> | **Seat** | User license within organization | Individual subscription |
> | **Partner Link** | Approved connection between two orgs for data sharing | Team collaboration |
> | **Resource Pool** | Shared org container resources (RAM, CPU, Storage) | Individual workspace |
> | **Hot Swap** | Zero-downtime container upgrade/plan change | Cold restart |
> | **Circuit Breaker** | Fault isolation pattern to prevent cascading failures | Simple error handling |
> | **Bulkhead** | Intra-workspace process isolation pattern | Container isolation |
> | **Lazy Start** | Container only starts when user first needs it | Always-on container |
> | **Container Sleep** | Auto-hibernate idle containers to save resources | Container stop |
> | **Right-sizing** | Matching container resources to actual usage | Over-provisioning |
> | **Spot Instance** | Cheaper, preemptible cloud compute for non-critical workloads | On-demand instance |
> | **Backpressure** | Queue flow control to prevent overload | Rate limiting |

### Core Value Proposition

- ✅ **No coding required** - Just connect credentials and install items from marketplace
- ✅ **Pay for what you use** - Modular pricing per item type
- ✅ **Infinitely extensible** - New gateways, plugins, themes, widgets, services added continuously
- ✅ **Inter-gateway communication** - Build complex multi-platform automations
- ✅ **Visual Service Builder** - Drag-and-drop workflow creation
- ✅ **Customizable UI** - Themes and widgets personalize your dashboard

### What 2Bot is NOT ⚠️

> **Setting clear expectations helps users choose the right tool:**

| 2Bot is NOT | Use Instead | Why |
|-------------|-------------|-----|
| A general-purpose Zapier clone | Zapier, Make | 2Bot focuses on **messaging platforms** (Telegram, Discord, Slack) not 5000+ integrations |
| A chatbot builder with NLP | Dialogflow, Rasa | 2Bot automates workflows, doesn't build conversational AI |
| A no-code app builder | Bubble, Glide | 2Bot is for automation, not custom application development |
| A CRM system | HubSpot, Salesforce | 2Bot can integrate with CRMs but isn't one |
| Self-hosted only | n8n, Huginn | 2Bot is SaaS-first (self-hosted may come later for Enterprise) |
| Free/Open source | n8n, Huginn | 2Bot is commercial SaaS with free tier |

**2Bot IS:** A specialized automation platform for **messaging-first workflows** with focus on Telegram ecosystem, AI integration, and team/organization collaboration.

### Competitive Differentiators ⭐

| Feature | 2Bot | Zapier | Make | n8n |
|---------|------|--------|------|-----|
| **Telegram User Account** | ✅ MTProto support | ❌ Bot only | ❌ Bot only | ❌ Bot only |
| **AI-Native** | ✅ Built-in multi-provider | ⚠️ Via integrations | ⚠️ Via integrations | ⚠️ Via integrations |
| **Per-User Isolation** | ✅ Docker containers | ❌ Shared | ❌ Shared | ⚠️ Self-host only |
| **Organization/Teams** | ✅ Departments, seats, shared licenses | ⚠️ Team plans | ⚠️ Team plans | ❌ Manual |
| **Marketplace** | ✅ Plugins, themes, widgets, services | ❌ Templates only | ⚠️ Templates | ⚠️ Community nodes |
| **Visual Dashboard** | ✅ Customizable widgets | ❌ Task history only | ❌ Scenario list | ❌ Workflow list |
| **Pricing** | 💰 Resource-based | 💸 Task-based (expensive) | 💸 Operation-based | 💚 Free (self-host) |

**Key Differentiator:** 2Bot is the **only platform** with native Telegram User Account (MTProto) support + AI + isolated workspaces + organization management in one package.

### Pricing Tiers Overview ⭐

| Tier | Monthly | Target User | Key Limits |
|------|---------|-------------|------------|
| **FREE** | $0 | Hobbyists, Testing | 1 gateway, 3 plugins, 100 executions/day, 256MB RAM |
| **STARTER** | $9 | Solo creators | 3 gateways, 10 plugins, 1K executions/day, 512MB RAM |
| **PRO** | $29 | Power users | 10 gateways, unlimited plugins, 10K executions/day, 1GB RAM |
| **BUSINESS** | $79 | Small teams | 25 gateways, priority support, 50K executions/day, 2GB RAM |
| **ENTERPRISE** | Custom | Organizations | Unlimited, SLA, dedicated support, 4GB+ RAM, custom integrations |

**Cost Comparison vs Competitors:**

| Usage Level | 2Bot | Zapier | Make |
|-------------|------|--------|------|
| 1,000 tasks/month | **$9** (STARTER) | $29.99 | $10.59 |
| 10,000 tasks/month | **$29** (PRO) | $73.50 | $18.82 |
| 50,000 tasks/month | **$79** (BUSINESS) | $448.50 | $82.12 |
| 100,000+ tasks/month | **Custom** | $898+ | $164+ |

*2Bot uses resource-based pricing (RAM, executions) not per-task pricing, making it significantly cheaper for high-volume users.*

### 💳 Credit System (Hybrid Model) ⭐

> **Subscriptions for predictable features + Credits for variable costs**

#### Credit Basics

| Aspect | Value |
|--------|-------|
| **Exchange Rate** | **$1 = 100 credits** |
| **Minimum Purchase** | $5 (500 credits) |
| **Credit Expiry** | **Never** (credits don't expire) |
| **Refund Policy** | Unused credits refundable within 30 days |

#### Credit Packages (with Bonuses)

| Package | Price | Credits | Bonus | Best For |
|---------|-------|---------|-------|----------|
| **Starter** | $5 | 500 | - | Try it out |
| **Basic** | $10 | 1,000 | - | Light users |
| **Popular** | $25 | 2,750 | +10% | Regular use |
| **Value** | $50 | 6,000 | +20% | Power users |
| **Pro** | $100 | 13,000 | +30% | Heavy AI users |
| **Enterprise** | $500+ | 70,000+ | +40% | Bulk purchase |

#### What Credits Are Used For

| Use Case | Credit Cost | Why Credits? |
|----------|-------------|--------------|
| **AI Token Overages** | Variable (see below) | AI costs unpredictable |
| **Plan Execution Overages** | 1 credit = 10 extra executions | Don't get blocked |
| **Marketplace One-time Items** | Item price in credits | No subscription needed |
| **Early Access / Beta Features** | Feature-specific | Unlock before release |
| **Priority Queue Processing** | 10 credits/job | Skip the line |
| **Extra Storage** | 50 credits = 100MB/month | Beyond plan limit |
| **Extended Audit Logs** | 100 credits = +30 days | Keep logs longer |
| **Custom Domain SSL** | 500 credits one-time | PRO+ feature unlock |
| **Investment/Pre-order** | Feature-specific | Future feature funding |

#### AI Token Credit Costs

> **Credits provide cost transparency for AI usage**

| AI Provider | Model | Credits per 1K Tokens | Approx. $ |
|-------------|-------|----------------------|-----------|
| **OpenAI** | GPT-4 Turbo | 3 credits | $0.03 |
| **OpenAI** | GPT-4o | 1.5 credits | $0.015 |
| **OpenAI** | GPT-3.5 Turbo | 0.2 credits | $0.002 |
| **Anthropic** | Claude 3 Opus | 4 credits | $0.04 |
| **Anthropic** | Claude 3 Sonnet | 0.8 credits | $0.008 |
| **Anthropic** | Claude 3 Haiku | 0.05 credits | $0.0005 |
| **Google** | Gemini Pro | 0.1 credits | $0.001 |
| **Google** | Gemini 1.5 Pro | 1 credit | $0.01 |
| **Groq** | Llama 3 70B | 0.1 credits | $0.001 |
| **Local/Ollama** | Any | 0 credits | Free |

*Prices include 20% platform margin for infrastructure costs*

#### Free AI Allowance by Plan

| Plan | Free AI Credits/Month | Approx. GPT-4 Tokens |
|------|----------------------|---------------------|
| **FREE** | 50 credits | ~16K tokens |
| **STARTER** | 200 credits | ~66K tokens |
| **PRO** | 1,000 credits | ~333K tokens |
| **BUSINESS** | 3,000 credits | ~1M tokens |
| **ENTERPRISE** | Custom | Negotiated |

*Unused AI credits don't roll over (use it or lose it)*

#### Credit System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CREDIT SYSTEM FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────────┐    ┌──────────────────────────┐    │
│  │   Stripe    │───→│  Credit Ledger  │───→│    User Credit Balance   │    │
│  │  (Payment)  │    │   (Immutable)   │    │   (Real-time Tracking)   │    │
│  └─────────────┘    └─────────────────┘    └──────────────────────────┘    │
│        │                    │                          │                    │
│        │                    │                          │                    │
│        ▼                    ▼                          ▼                    │
│  ┌───────────────────────────────────────────────────────────────────┐     │
│  │                    CREDIT TRANSACTIONS                            │     │
│  │                                                                   │     │
│  │  Type: PURCHASE | USAGE | REFUND | BONUS | GRANT | EXPIRE         │     │
│  │                                                                   │     │
│  │  ┌─────────────────────────────────────────────────────────────┐ │     │
│  │  │  id: uuid                                                    │ │     │
│  │  │  userId: string                                              │ │     │
│  │  │  type: TransactionType                                       │ │     │
│  │  │  amount: number (+ for credit, - for debit)                  │ │     │
│  │  │  balanceAfter: number                                        │ │     │
│  │  │  description: string                                         │ │     │
│  │  │  metadata: { stripeId?, itemId?, aiProvider?, model? }       │ │     │
│  │  │  createdAt: timestamp                                        │ │     │
│  │  └─────────────────────────────────────────────────────────────┘ │     │
│  └───────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│                           USAGE TRIGGERS                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ AI Request   │  │ Plan Overage │  │ Marketplace  │  │ Feature      │    │
│  │ Completed    │  │ Detected     │  │ Purchase     │  │ Unlock       │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│        │                 │                 │                 │              │
│        └────────────────────────────┬─────────────────────────┘              │
│                                     │                                       │
│                                     ▼                                       │
│                          ┌─────────────────┐                                │
│                          │ Deduct Credits  │                                │
│                          │ (if balance > 0)│                                │
│                          └─────────────────┘                                │
│                                     │                                       │
│                    ┌────────────────┼────────────────┐                      │
│                    │                │                │                      │
│                    ▼                ▼                ▼                      │
│             ┌───────────┐    ┌───────────┐    ┌───────────┐                 │
│             │ Success   │    │ Low       │    │ Blocked   │                 │
│             │ Continue  │    │ Balance   │    │ No Credit │                 │
│             │           │    │ Warning   │    │ Buy More  │                 │
│             └───────────┘    └───────────┘    └───────────┘                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Credit Settings & Controls

```typescript
// User credit preferences
interface CreditPreferences {
  // Auto-purchase when balance low
  autoTopUp: {
    enabled: boolean;
    threshold: number;      // Trigger when balance below (e.g., 100)
    amount: number;         // Amount to purchase (e.g., 1000)
    maxPerMonth: number;    // Safety limit (e.g., 5000)
  };
  
  // Spending limits
  limits: {
    dailyLimit: number;     // Max credits/day (0 = unlimited)
    perActionLimit: number; // Max per single action
    aiOnlyLimit: number;    // Separate AI budget
  };
  
  // Alerts
  alerts: {
    lowBalance: number;     // Alert when below (e.g., 200)
    dailyUsageReport: boolean;
    unusualSpending: boolean;
  };
  
  // AI preferences
  ai: {
    preferCheapModels: boolean;     // Auto-select cheaper models
    blockExpensiveModels: boolean;  // Block GPT-4/Claude Opus
    fallbackToFree: boolean;        // Use free credits first
  };
}
```

#### Credit API Endpoints

```
POST   /api/credits/purchase         # Buy credit package
GET    /api/credits/balance          # Current balance
GET    /api/credits/transactions     # Transaction history
POST   /api/credits/transfer         # Transfer to org member (BUSINESS+)
GET    /api/credits/usage            # Usage analytics
PUT    /api/credits/settings         # Update preferences
POST   /api/credits/estimate         # Estimate cost before action
GET    /api/credits/packages         # Available packages
```

#### Organization Credits (BUSINESS+)

| Feature | Description |
|---------|-------------|
| **Shared Credit Pool** | Organization-wide credit balance |
| **Department Budgets** | Allocate credits per department |
| **Member Allowances** | Set per-member spending limits |
| **Credit Transfer** | Move credits between members |
| **Usage Reports** | Who used what, when |
| **Admin Controls** | Admins can grant/revoke credits |

```typescript
// Organization credit allocation
interface OrgCreditConfig {
  sharedPool: number;              // Org-wide balance
  departmentBudgets: {
    [deptId: string]: {
      monthlyBudget: number;       // Auto-replenish monthly
      currentBalance: number;
      rollover: boolean;           // Unused rolls to next month?
    };
  };
  memberAllowances: {
    [memberId: string]: {
      dailyLimit: number;
      monthlyLimit: number;
      canUseSharedPool: boolean;
    };
  };
}
```

#### Credit Use Case Examples

| Scenario | How Credits Help |
|----------|-----------------|
| **Heavy AI Day** | User hits plan AI limit, credits cover extra ~50K tokens |
| **Viral Automation** | Execution limit hit, credits allow 10K more executions |
| **Marketplace Theme** | Buy premium theme (1,500 credits) without subscription upgrade |
| **Beta Testing** | Unlock new gateway beta (2,000 credits) before public release |
| **Bulk AI Processing** | Pre-buy credits at 30% bonus for known large batch job |
| **Team Budget** | Org allocates 10K credits/month per department |
| **Investor Perks** | Early backers receive bonus credits + exclusive items |

#### Implementation Priority

| Phase | Feature | Priority |
|-------|---------|----------|
| **MVP** | Basic purchase + balance + AI deduction | P0 |
| **MVP** | Transaction history | P0 |
| **V1.1** | Auto top-up | P1 |
| **V1.1** | Spending limits | P1 |
| **V1.2** | Marketplace credit payments | P1 |
| **V1.3** | Organization credit pools | P2 |
| **V1.4** | Early access/beta unlocks | P2 |
| **V2.0** | Credit transfer + gifting | P3 |

### Geographic & Compliance ⭐

| Aspect | Details |
|--------|---------|
| **Primary Markets** | US, EU, UK, Canada, Australia |
| **Data Residency** | US (default), EU (on request for BUSINESS+) |
| **Compliance Targets** | GDPR, SOC 2 Type II (roadmap), CCPA |
| **Data Centers** | AWS us-east-1 (primary), eu-west-1 (EU customers) |

### Service Level Agreements ⭐

| Tier | Uptime SLA | Support Response | Maintenance Window |
|------|------------|------------------|-------------------|
| FREE | Best effort | Community only | Anytime |
| STARTER | 99.0% | 48 hours | Anytime |
| PRO | 99.5% | 24 hours | Scheduled |
| BUSINESS | 99.9% | 4 hours | Scheduled + notice |
| ENTERPRISE | 99.95% | 1 hour | Coordinated |

*SLA credits: 10% credit per 0.1% below SLA (max 30% monthly credit)*

### Legal & Risk Disclaimers ⚠️

> **Telegram User Account (MTProto) Warning:**
> 
> Using Telegram User Account connections (MTProto) may violate Telegram's Terms of Service. 
> This feature is provided "as-is" with the following risks:
> - ⚠️ Account may be banned by Telegram
> - ⚠️ User assumes all responsibility for ToS violations
> - ⚠️ 2Bot is not liable for account suspensions
> - ⚠️ Not available in FREE tier (requires STARTER+)
> - ⚠️ Rate limits are conservative to minimize ban risk
>
> **Recommended:** Use official Telegram Bot API when possible. MTProto is for advanced users who understand the risks.

> **Data Processing:**
> - User data is processed in accordance with our Privacy Policy
> - Organization data sharing requires explicit admin consent
> - Third-party gateway credentials are encrypted at rest (AES-256)
> - We do not sell or share user data with third parties
> - GDPR data export/deletion available on request

---

## 🏗️ Architecture

### Architecture Pattern: Platform + Isolated Workspaces + Organizations

| Aspect | Choice | Reason |
|--------|--------|--------|
| **Pattern** | Platform Layer + User Workspaces | Resource isolation, fair billing |
| **Platform** | Modular Monolith (shared) | Auth, Billing, Dashboard - predictable resources |
| **Workspaces** | Container-isolated per user | Plugins, Services, Gateways - variable resources |
| **Organizations** | Shared licenses + resources pool | Enterprise cost savings |
| **Data** | Multi-tenant (userId + orgId isolation) | SaaS + Enterprise requirement |
| **Communication** | Message Queue (BullMQ) | Async processing, reliability |
| **Resource Control** | cgroups/Docker limits | Hard limits per user/org tier |
| **Scaling** | Workspace containers scale | Pay-for-resources model |
| **Deployment** | Docker Compose → K8s | Simple start, production-ready path |

### Why Platform + Workspace Separation?

```
┌────────────────────────────────────────────────────────────────────────────┐
│  THE PROBLEM: Without Isolation                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   User A installs heavy AI plugin     →  Uses 8GB RAM                     │
│   User B runs complex workflow        →  Uses 4GB RAM                     │
│   User C (free tier) browses          →  Uses 100MB RAM                   │
│                                                                            │
│   Total: 12GB+ RAM on shared server   →  💥 Server crashes for everyone!  │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│  THE SOLUTION: Isolated Workspaces                                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   Platform (shared): Auth, Billing, API  →  Fixed 2GB (predictable)       │
│   User A workspace: 2GB limit (Pro)      →  Isolated, can't exceed        │
│   User B workspace: 4GB limit (Business) →  Isolated, can't exceed        │
│   User C workspace: 512MB limit (Free)   →  Isolated, can't exceed        │
│                                                                            │
│   Result: Each user limited, platform stable, fair billing! ✅            │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### High-Level Architecture: Platform + Workspaces

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     2Bot Platform - Isolated Architecture                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    FRONTEND (Next.js 14 + TypeScript)                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │  │
│  │  │   Auth   │ │Dashboard │ │Workspace │ │Marketplace│ │   Service    │    │  │
│  │  │  Pages   │ │ + Widgets│ │  Config  │ │  (4 types)│ │   Builder    │    │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│ ═══════════════════════════════════════════════════════════════════════════════ │
│                           PLATFORM LAYER (Shared)                               │
│                        Fixed Resources: 2-4 CPU, 4-8GB RAM                      │
│ ═══════════════════════════════════════════════════════════════════════════════ │
│                                      │                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │              PLATFORM API (Node.js + Express) - Shared Services           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────────┐ │  │
│  │  │  Auth   │ │ Billing │ │  User   │ │Marketplace│ │  Workspace        │ │  │
│  │  │ Service │ │ Service │ │ Service │ │  Service │ │  Orchestrator     │ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────────────┘ │  │
│  │                                                        │                  │  │
│  │  These services are SHARED, predictable resource usage │                  │  │
│  └────────────────────────────────────────────────────────┼──────────────────┘  │
│                                                           │                     │
│                                    ┌──────────────────────┘                     │
│                                    │                                            │
│                              ┌─────▼─────┐                                      │
│                              │  BullMQ   │                                      │
│                              │  Router   │                                      │
│                              │  (Redis)  │                                      │
│                              └─────┬─────┘                                      │
│                                    │                                            │
│ ═══════════════════════════════════════════════════════════════════════════════ │
│                      WORKSPACE LAYER (Isolated per User)                        │
│                    Resources vary by plan, hard-limited per container           │
│ ═══════════════════════════════════════════════════════════════════════════════ │
│                                    │                                            │
│      ┌─────────────────────────────┼─────────────────────────────┐             │
│      ▼                             ▼                             ▼             │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐              │
│  │   WORKSPACE     │   │   WORKSPACE     │   │   WORKSPACE     │              │
│  │   Container     │   │   Container     │   │   Container     │              │
│  │   (User A)      │   │   (User B)      │   │   (User C)      │              │
│  │                 │   │                 │   │                 │              │
│  │  ┌───────────┐  │   │  ┌───────────┐  │   │  ┌───────────┐  │              │
│  │  │ Gateway   │  │   │  │ Gateway   │  │   │  │ Gateway   │  │              │
│  │  │ Workers   │  │   │  │ Workers   │  │   │  │ Workers   │  │              │
│  │  ├───────────┤  │   │  ├───────────┤  │   │  ├───────────┤  │              │
│  │  │ Plugin    │  │   │  │ Plugin    │  │   │  │ Plugin    │  │              │
│  │  │ Runtime   │  │   │  │ Runtime   │  │   │  │ Runtime   │  │              │
│  │  ├───────────┤  │   │  ├───────────┤  │   │  ├───────────┤  │              │
│  │  │ Service   │  │   │  │ Service   │  │   │  │ Service   │  │              │
│  │  │ Executor  │  │   │  │ Executor  │  │   │  │ Executor  │  │              │
│  │  └───────────┘  │   │  └───────────┘  │   │  └───────────┘  │              │
│  │                 │   │                 │   │                 │              │
│  │  ┌───────────┐  │   │  ┌───────────┐  │   │  ┌───────────┐  │              │
│  │  │  LIMITS   │  │   │  │  LIMITS   │  │   │  │  LIMITS   │  │              │
│  │  │  512MB    │  │   │  │  2GB RAM  │  │   │  │  4GB RAM  │  │              │
│  │  │  0.5 CPU  │  │   │  │  2 CPU    │  │   │  │  4 CPU    │  │              │
│  │  │  FREE     │  │   │  │  PRO      │  │   │  │  BUSINESS │  │              │
│  │  └───────────┘  │   │  └───────────┘  │   │  └───────────┘  │              │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘              │
│                                                                                 │
│ ═══════════════════════════════════════════════════════════════════════════════ │
│                        SHARED DATA LAYER (Multi-tenant)                         │
│ ═══════════════════════════════════════════════════════════════════════════════ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │ PostgreSQL  │  │   Redis     │  │   BullMQ    │  │  S3/MinIO   │      │  │
│  │  │ (Primary)   │  │  (Cache)    │  │  (Queues)   │  │  (Storage)  │      │  │
│  │  │             │  │             │  │             │  │             │      │  │
│  │  │ User data   │  │ Sessions    │  │ Job queues  │  │ User files  │      │  │
│  │  │ isolated    │  │ Cache       │  │ per user    │  │ per user    │      │  │
│  │  │ by userId   │  │ Pub/Sub     │  │ priority    │  │ quota       │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Platform vs Workspace Components

| Component | Layer | Resource Usage | Isolation |
|-----------|-------|----------------|------------|
| Auth Service | Platform | Low, predictable | Shared |
| Billing Service | Platform | Low, predictable | Shared |
| User/Profile API | Platform | Low, predictable | Shared |
| Marketplace API | Platform | Low, predictable | Shared |
| Dashboard API | Platform | Low, predictable | Shared |
| Workspace Orchestrator | Platform | Medium | Shared |
| Organization Service | Platform | Low, predictable | Shared |
| Gateway Workers | **Workspace** | **Variable, high** | **Per-user container** |
| Plugin Runtime | **Workspace** | **Variable, high** | **Per-user container** |
| Service Executor | **Workspace** | **Variable, high** | **Per-user container** |
| Workflow Engine | **Workspace** | **Variable, high** | **Per-user container** |

### Organization Architecture (Enterprise)

```
+-------------------------------------------------------------------------------+
|                      ORGANIZATION: ABC Trucking Company                       |
|                      Plan: Organization Pro (50 seats)                        |
+-------------------------------------------------------------------------------+
|                                                                               |
|  ORGANIZATION LICENSES (Buy Once, Share Many)                                 |
|  |-- KPI Tracking Service        ->  Assigned to: HR, Driver, Fleet          |
|  |-- Bonus Calculator Plugin     ->  Assigned to: HR only                    |
|  |-- Tire Inspection Service     ->  Assigned to: Driver, Fleet, Safety      |
|  |-- PTI Checklist Plugin        ->  Assigned to: Driver, Safety             |
|  +-- Dispatch Notification       ->  Assigned to: Driver, Dispatcher         |
|                                                                               |
|  DEPARTMENTS                                                                  |
|  +-------------+ +-------------+ +-------------+ +-------------+ +-----------+|
|  |     HR      | |   Driver    | |    Fleet    | |   Safety    | | Dispatch  ||
|  |   3 seats   | |  30 seats   | |   5 seats   | |   2 seats   | | 10 seats  ||
|  +-------------+ +-------------+ +-------------+ +-------------+ +-----------+|
|  | - KPI       | | - KPI       | | - KPI       | | - Tire Insp | | - Dispatch||
|  | - Bonus     | | - Tire Insp | | - Tire Insp | | - PTI Check | |   Notif.  ||
|  |             | | - PTI Check | |             | |             | |           ||
|  |             | | - Dispatch  | |             | |             | |           ||
|  +-------------+ +-------------+ +-------------+ +-------------+ +-----------+|
|                                                                               |
|  =============================================================================|
|                    ORGANIZATION WORKSPACE (Shared Resource Pool)              |
|  =============================================================================|
|                                                                               |
|  +-------------------------------------------------------------------------+ |
|  |  SHARED ORG DATABASE (Isolated from other organizations)                | |
|  |  - All departments can query org-wide data                              | |
|  |  - HR can see Driver KPIs for bonus calculations                        | |
|  |  - Fleet can see Driver tire inspection reports                         | |
|  |  - Data isolation: ABC Trucking cannot see XYZ Logistics data           | |
|  +-------------------------------------------------------------------------+ |
|                                                                               |
|  +-------------------------------------------------------------------------+ |
|  |  RESOURCE POOL (Shared, still billed by usage!)                         | |
|  |  Total: 16GB RAM, 8 vCPU, 100GB Storage                                 | |
|  |  - Resources shared across all org members                              | |
|  |  - Per-department soft quotas (HR: 2GB, Driver: 8GB, Fleet: 4GB...)     | |
|  |  - Owner can reallocate resources between departments                   | |
|  |  - Billing: Base subscription + resource usage + overage                | |
|  +-------------------------------------------------------------------------+ |
|                                                                               |
+-------------------------------------------------------------------------------+
|  BILLING: One Invoice                                                         |
|  - Organization Pro Plan: $199/mo (includes 50 seats)                         |
|  - Extra seats: $5/seat/mo (beyond 50)                                        |
|  - Resource usage: $0.05/GB-hour RAM, $0.10/vCPU-hour                         |
|  - Marketplace items: One-time or subscription (org-wide license)             |
+-------------------------------------------------------------------------------+
```

### Organization vs Individual Comparison

| Aspect | Individual User | Organization |
|--------|-----------------|--------------|
| **Workspace** | 1 container per user | Shared resource pool |
| **Marketplace Items** | Buy per user | Buy once, share across seats |
| **Database** | Isolated per user | Shared within org, isolated from other orgs |
| **Billing** | Per-user subscription | Single org invoice |
| **Permissions** | User controls own items | Owner/Admin controls all |
| **Departments** | N/A | Group users by function |
| **Seats** | N/A | License per user in org |

### Inter-Organization Communication (Optional)

```
+-------------------------+     APPROVED LINK        +-------------------------+
|  ABC Trucking           | -----------------------> |  XYZ Logistics          |
|  (Trucking Company)     |   Owner A invited        |  (Partner Company)      |
|                         |   Owner B accepted       |                         |
+-------------------------+                          +-------------------------+
|  - Dispatch Service     |   Can Send:              |  - Load Tracking        |
|    can send loads       |   - Load requests        |    can receive loads    |
|    to partner           |   - Status updates       |    from partner         |
|                         |                          |                         |
|  - Resources: SEPARATE  |   Billing: SEPARATE      |  - Resources: SEPARATE  |
|    (each org pays own)  |   (no cost sharing)      |    (each org pays own)  |
+-------------------------+                          +-------------------------+

- Each organization remains isolated (separate databases, separate billing)
- Only approved services can communicate (explicit permission)
- Resources are NOT shared (each org pays for their own usage)
- Use case: Partnerships, supply chain, franchise networks
```

### Service (Workflow) Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTENT MAKER SERVICE (Example Flow)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                 │
│  │   TRIGGER   │      │   STEP 1    │      │   STEP 2    │                 │
│  │  (Schedule  │ ───► │ TELEGRAM    │ ───► │  Service    │                 │
│  │   or Event) │      │   _USER     │      │  Database   │                 │
│  │             │      │  Gateway    │      │             │                 │
│  │ "Every 2h"  │      │ Read posts  │      │ Store &     │                 │
│  │ "On trigger"│      │ from source │      │ Filter data │                 │
│  └─────────────┘      │ channel     │      │             │                 │
│                       └─────────────┘      └──────┬──────┘                 │
│                                                   │                         │
│                                                   ▼                         │
│                 ┌─────────────┐      ┌─────────────┐                       │
│                 │   STEP 4    │      │   STEP 3    │                       │
│                 │  Service    │ ◄─── │     AI      │                       │
│                 │  Engine     │      │   Gateway   │                       │
│                 │             │      │             │                       │
│                 │ Process AI  │      │ Analyze &   │                       │
│                 │ output      │      │ Generate    │                       │
│                 │             │      │ content     │                       │                       │
│                 └──────┬──────┘      └─────────────┘                       │
│                        │                                                    │
│                        ▼                                                    │
│                 ┌─────────────┐      ┌─────────────┐                       │
│                 │   STEP 5    │      │   RESULT    │                       │
│                 │  Telegram   │ ───► │  Posted!    │                       │
│                 │  Bot Gateway│      │             │                       │
│                 │             │      │  ✅ Done    │                       │
│                 │ Post to     │      │  📊 Logged  │                       │
│                 │ channel     │      │             │                       │
│                 └─────────────┘      └─────────────┘                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Failure Scenarios & Recovery ⭐

> **What happens when things fail?**

| Component | Failure Mode | Impact | Recovery Strategy |
|-----------|--------------|--------|-------------------|
| **PostgreSQL** | Connection lost | All writes fail | Auto-reconnect with exponential backoff; Read replica failover |
| **Redis** | Instance crash | Cache miss, session loss | Fallback to DB for sessions; Cache rebuilds automatically |
| **BullMQ** | Queue unavailable | Jobs not processed | Jobs persisted in Redis; Resume on recovery |
| **Workspace Container** | OOM / Crash | User's plugins stop | Auto-restart via orchestrator; PM2 restarts internal processes |
| **Platform API** | Process crash | 502 errors | PM2/K8s auto-restart; Load balancer routes to healthy instance |
| **Gateway (Telegram)** | Rate limited / Banned | Messages not sent | Circuit breaker opens; Queue jobs for retry; Alert user |
| **Gateway (AI)** | API timeout | Workflow step fails | Retry with backoff; Fallback to cheaper model (optional) |
| **S3/MinIO** | Storage unavailable | File uploads fail | Queue uploads for retry; Local buffer (temp) |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FAILURE ISOLATION BOUNDARIES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User A's container crashes                                                 │
│  ┌─────────────────┐                                                       │
│  │ ❌ WORKSPACE A  │ ──► Platform continues ✅                             │
│  │    (crashed)    │ ──► User B unaffected ✅                              │
│  └─────────────────┘ ──► User A's jobs queued, retry on restart ✅         │
│                                                                             │
│  Redis cache fails                                                          │
│  ┌─────────────────┐                                                       │
│  │ ❌ REDIS        │ ──► Sessions: Fallback to DB (slower) ✅              │
│  │    (down)       │ ──► Cache: Miss & rebuild ✅                          │
│  └─────────────────┘ ──► BullMQ: Jobs paused until recovery ⚠️             │
│                                                                             │
│  AI Gateway rate limited                                                    │
│  ┌─────────────────┐                                                       │
│  │ ⚠️ AI GATEWAY   │ ──► Circuit breaker OPEN                              │
│  │   (rate limit)  │ ──► Jobs queued for retry                             │
│  └─────────────────┘ ──► User notified, other gateways work ✅             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Network Topology ⭐

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NETWORK TOPOLOGY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INTERNET                                                                   │
│      │                                                                      │
│      ▼                                                                      │
│  ┌─────────┐     ┌─────────┐                                               │
│  │   CDN   │────►│   WAF   │  (Cloudflare / AWS CloudFront)                │
│  │ (static)│     │(protect)│                                               │
│  └─────────┘     └────┬────┘                                               │
│                       │                                                     │
│                       ▼                                                     │
│              ┌────────────────┐                                            │
│              │ Load Balancer  │  (nginx / ALB / Traefik)                   │
│              └───────┬────────┘                                            │
│                      │                                                      │
│  ════════════════════╪══════════════════════════════════════════════════   │
│  PRIVATE NETWORK     │     (VPC / Docker Network)                          │
│  ════════════════════╪══════════════════════════════════════════════════   │
│                      │                                                      │
│         ┌────────────┼────────────┐                                        │
│         ▼            ▼            ▼                                        │
│    ┌─────────┐ ┌─────────┐ ┌─────────┐                                    │
│    │Platform │ │Platform │ │Platform │   (Scalable API instances)         │
│    │ API #1  │ │ API #2  │ │ API #N  │                                    │
│    └────┬────┘ └────┬────┘ └────┬────┘                                    │
│         │           │           │                                          │
│         └───────────┼───────────┘                                          │
│                     │                                                       │
│         ┌───────────┼───────────┐                                          │
│         ▼           ▼           ▼                                          │
│    ┌─────────┐ ┌─────────┐ ┌─────────┐                                    │
│    │  Redis  │ │PostgreSQL│ │  MinIO  │   (Shared Data Layer)             │
│    │ Cluster │ │ Primary  │ │   S3    │                                    │
│    └─────────┘ │+ Replica │ └─────────┘                                    │
│                └─────────┘                                                  │
│                     │                                                       │
│  ═══════════════════╪═══════════════════════════════════════════════════   │
│  WORKSPACE NETWORK  │    (Isolated per user / org)                         │
│  ═══════════════════╪═══════════════════════════════════════════════════   │
│                     │                                                       │
│    ┌────────────────┼────────────────┐                                     │
│    ▼                ▼                ▼                                     │
│  ┌──────┐       ┌──────┐        ┌──────┐                                  │
│  │User A│       │User B│        │Org X │   (Isolated containers)          │
│  │ 512MB│       │ 2GB  │        │ 16GB │                                  │
│  └──────┘       └──────┘        └──────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architecture Cost Optimizations ⭐

| Optimization | How It Works | Estimated Savings |
|--------------|--------------|-------------------|
| **Platform Auto-scaling** | Scale API instances to 0-1 during off-peak (2am-6am) | 20-30% compute |
| **Spot Instances for Free Tier** | Run free user workspaces on preemptible instances | 60-80% on free tier compute |
| **CDN for Static Assets** | Cache JS/CSS/images at edge, reduce origin requests | 50-80% bandwidth |
| **S3 Intelligent-Tiering** | Auto-move old files (>30 days) to cheaper storage | 40% storage costs |
| **Redis Memory Optimization** | Use Redis hashes instead of strings for small objects | 30% Redis memory |
| **Connection Pooling (PgBouncer)** | Share DB connections across API instances | Fewer DB connections needed |
| **Lazy Container Start** | Don't start workspace until user needs it | 60-80% idle compute |
| **Container Sleep** | Hibernate idle containers after 15-60 min | 40-60% compute |
| **Right-sizing Alerts** | Notify users who pay for 2GB but use 400MB | Better user experience + potential upsell |

### Storage Architecture ⭐

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STORAGE TIERS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  HOT STORAGE (Frequently accessed)                                         │
│  ├── PostgreSQL: User data, configs, active records                        │
│  ├── Redis: Sessions, cache, real-time data                                │
│  └── S3 Standard: Recent uploads (< 30 days)                               │
│                                                                             │
│  WARM STORAGE (Occasionally accessed)                                       │
│  ├── S3 Intelligent-Tiering: Files 30-90 days old                          │
│  └── PostgreSQL: Execution logs (queryable but less frequent)              │
│                                                                             │
│  COLD STORAGE (Rarely accessed)                                            │
│  ├── S3 Glacier Instant: Files 90+ days (audit, compliance)                │
│  └── Archived PostgreSQL: Old audit logs (compressed, partitioned)         │
│                                                                             │
│  COST COMPARISON:                                                           │
│  ┌─────────────────┬──────────────┬──────────────┬─────────────┐          │
│  │ Tier            │ Cost/GB/mo   │ Retrieval    │ Use Case    │          │
│  ├─────────────────┼──────────────┼──────────────┼─────────────┤          │
│  │ S3 Standard     │ $0.023       │ Instant      │ Active      │          │
│  │ S3 Int-Tiering  │ $0.01-0.023  │ Instant      │ Variable    │          │
│  │ S3 Glacier Inst │ $0.004       │ Milliseconds │ Archive     │          │
│  │ S3 Glacier Deep │ $0.00099     │ 12 hours     │ Compliance  │          │
│  └─────────────────┴──────────────┴──────────────┴─────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Disaster Recovery & Backup Strategy ⭐

> **Critical for business continuity and data protection**

#### Recovery Objectives

| Metric | Target | Description |
|--------|--------|-------------|
| **RTO** (Recovery Time Objective) | < 4 hours | Max time to restore service after disaster |
| **RPO** (Recovery Point Objective) | < 1 hour | Max acceptable data loss (time since last backup) |
| **MTTR** (Mean Time To Recovery) | < 2 hours | Average time to recover from incidents |

#### Backup Schedule & Retention

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKUP STRATEGY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POSTGRESQL BACKUPS                                                         │
│  ├── Continuous: WAL (Write-Ahead Log) streaming to cloud storage          │
│  ├── Hourly: Incremental backup (pg_basebackup)                            │
│  ├── Daily: Full backup at 03:00 UTC (low traffic)                         │
│  ├── Weekly: Full backup + verification test                                │
│  └── Monthly: Full backup archived to Glacier                               │
│                                                                             │
│  REDIS BACKUPS                                                              │
│  ├── Continuous: AOF (Append-Only File) persistence                        │
│  ├── Hourly: RDB snapshot to cloud storage                                  │
│  └── Daily: Full RDB snapshot + upload to S3                                │
│                                                                             │
│  FILE STORAGE (S3/MinIO)                                                    │
│  ├── Real-time: Cross-region replication (us-east-1 → eu-west-1)           │
│  └── Versioning: Keep 30 days of file versions                              │
│                                                                             │
│  RETENTION POLICY                                                           │
│  ├── Hourly backups: Keep 24 hours                                          │
│  ├── Daily backups: Keep 30 days                                            │
│  ├── Weekly backups: Keep 12 weeks                                          │
│  ├── Monthly backups: Keep 12 months                                        │
│  └── Yearly backups: Keep 7 years (compliance)                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Cloud Backup Providers & Security ⭐

| Provider | Use Case | Encryption | Security Features |
|----------|----------|------------|-------------------|
| **AWS S3** | Primary backup storage | AES-256 at rest, TLS in transit | IAM policies, bucket policies, versioning |
| **AWS Glacier** | Long-term archive | AES-256 at rest | Vault lock (WORM compliance) |
| **Cloudflare R2** | Cost-effective alternative | AES-256 at rest | Zero egress fees, S3-compatible |
| **Backblaze B2** | Budget backup option | AES-256 at rest | Application keys, bucket restrictions |
| **Google Cloud Storage** | Multi-cloud DR | AES-256 + customer-managed keys | IAM, audit logging |

**Backup Security Requirements:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKUP SECURITY CHECKLIST                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✅ ENCRYPTION                                                              │
│  ├── At-rest: AES-256 encryption for all backups                           │
│  ├── In-transit: TLS 1.3 for all backup transfers                          │
│  ├── Key management: AWS KMS / HashiCorp Vault                             │
│  └── Key rotation: Automatic every 90 days                                  │
│                                                                             │
│  ✅ ACCESS CONTROL                                                          │
│  ├── Separate backup IAM role (not shared with app)                        │
│  ├── Principle of least privilege                                           │
│  ├── MFA required for backup restore operations                            │
│  └── Audit logging for all backup access                                    │
│                                                                             │
│  ✅ INTEGRITY                                                               │
│  ├── Checksums verified after each backup                                   │
│  ├── Weekly restore test to verify backup validity                         │
│  ├── Immutable backups (WORM) for compliance data                          │
│  └── Cross-region replication for disaster recovery                        │
│                                                                             │
│  ✅ MONITORING                                                              │
│  ├── Alert if backup fails                                                  │
│  ├── Alert if backup size anomaly (±50%)                                   │
│  ├── Alert if backup age > RPO target                                      │
│  └── Monthly backup audit report                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Multi-Region Disaster Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-REGION DR ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PRIMARY REGION (us-east-1)              SECONDARY REGION (eu-west-1)       │
│  ┌─────────────────────────┐            ┌─────────────────────────┐        │
│  │  ┌─────────────────┐    │            │    ┌─────────────────┐  │        │
│  │  │   PostgreSQL    │────┼── WAL ────►│    │  PostgreSQL     │  │        │
│  │  │    Primary      │    │  Streaming │    │   Replica       │  │        │
│  │  └─────────────────┘    │            │    └─────────────────┘  │        │
│  │                         │            │                         │        │
│  │  ┌─────────────────┐    │            │    ┌─────────────────┐  │        │
│  │  │     Redis       │────┼── Async ──►│    │     Redis       │  │        │
│  │  │    Primary      │    │  Replicate │    │    Replica      │  │        │
│  │  └─────────────────┘    │            │    └─────────────────┘  │        │
│  │                         │            │                         │        │
│  │  ┌─────────────────┐    │            │    ┌─────────────────┐  │        │
│  │  │    S3 Bucket    │────┼── CRR ────►│    │   S3 Bucket     │  │        │
│  │  │   (Primary)     │    │ (Cross-    │    │   (Replica)     │  │        │
│  │  └─────────────────┘    │  Region)   │    └─────────────────┘  │        │
│  └─────────────────────────┘            └─────────────────────────┘        │
│                                                                             │
│  FAILOVER PROCEDURE:                                                        │
│  1. Detect primary failure (health checks fail for 3+ minutes)              │
│  2. Promote PostgreSQL replica to primary                                   │
│  3. Update DNS (Cloudflare) to point to secondary region                   │
│  4. Scale up secondary region compute                                       │
│  5. Notify on-call team via PagerDuty                                      │
│  6. Estimated failover time: 5-15 minutes                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Secrets Management Architecture ⭐

> **Never store secrets in code, environment files, or git**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECRETS MANAGEMENT                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SECRETS VAULT                                     │   │
│  │              (AWS Secrets Manager / HashiCorp Vault)                 │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  Platform Secrets                                            │   │   │
│  │  │  ├── DATABASE_URL (PostgreSQL connection string)             │   │   │
│  │  │  ├── REDIS_URL (Redis connection string)                     │   │   │
│  │  │  ├── STRIPE_SECRET_KEY                                       │   │   │
│  │  │  ├── NEXTAUTH_SECRET                                         │   │   │
│  │  │  ├── JWT_SECRET                                              │   │   │
│  │  │  └── ENCRYPTION_KEY (for user credentials)                   │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  User Gateway Credentials (Encrypted per-user)               │   │   │
│  │  │  ├── user:{id}:telegram_bot_token                            │   │   │
│  │  │  ├── user:{id}:telegram_mtproto_session                      │   │   │
│  │  │  ├── user:{id}:openai_api_key                                │   │   │
│  │  │  └── user:{id}:custom_webhook_auth                           │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  SECRET FLOW:                                                               │
│  1. User enters API key in dashboard                                        │
│  2. Key encrypted with AES-256 using platform encryption key                │
│  3. Encrypted key stored in PostgreSQL (never plaintext)                    │
│  4. Workspace requests decrypted key via internal API                       │
│  5. Key decrypted in memory, used, then zeroed                              │
│  6. Key never written to logs or disk in workspace                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Container Security Hardening ⭐

> **Prevent container escape and privilege escalation**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKSPACE CONTAINER SECURITY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DOCKER SECURITY FLAGS (applied to every user workspace):                   │
│                                                                             │
│  docker run \                                                               │
│    --security-opt=no-new-privileges:true \   # Prevent privilege escalation │
│    --security-opt=seccomp=2bot-seccomp.json\ # Restrict syscalls            │
│    --security-opt=apparmor=2bot-apparmor \   # AppArmor profile             │
│    --cap-drop=ALL \                          # Drop all capabilities        │
│    --cap-add=NET_BIND_SERVICE \              # Only needed cap              │
│    --read-only \                             # Read-only filesystem         │
│    --tmpfs /tmp:size=100M \                  # Writable tmp with limit      │
│    --user 1000:1000 \                        # Non-root user                │
│    --memory=512m \                           # Memory limit                 │
│    --memory-swap=512m \                      # No swap                      │
│    --cpus=0.5 \                              # CPU limit                    │
│    --pids-limit=100 \                        # Process limit                │
│    --network=workspace-net \                 # Isolated network             │
│    --dns=10.0.0.2 \                          # Internal DNS only            │
│    2bot-workspace:latest                                                    │
│                                                                             │
│  NETWORK ISOLATION:                                                         │
│  ├── Workspaces CANNOT communicate with each other                         │
│  ├── Workspaces CAN access: Platform API (internal), external internet     │
│  ├── Workspaces CANNOT access: Host network, other containers, metadata    │
│  └── Egress filtering: Block access to cloud metadata endpoints            │
│                                                                             │
│  FILESYSTEM:                                                                │
│  ├── Root filesystem: Read-only                                             │
│  ├── /tmp: tmpfs (RAM disk) with 100MB limit                               │
│  ├── /app/data: Mounted volume for persistent data (per-user quota)        │
│  └── No access to host filesystem                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rate Limiting Architecture ⭐

> **Two layers: Network (Cloudflare) + Application (per-user)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RATE LIMITING LAYERS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAYER 1: CLOUDFLARE (Edge Protection) ✅ FREE with Cloudflare             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ├── DDoS Protection: Automatic (free tier)                         │   │
│  │  ├── Rate Limiting Rules: 10,000 requests/min per IP (configurable) │   │
│  │  ├── Bot Protection: Challenge suspicious traffic                   │   │
│  │  ├── WAF Rules: Block SQL injection, XSS attempts                   │   │
│  │  ├── Geo Blocking: Block high-risk countries (optional)             │   │
│  │  └── Under Attack Mode: Emergency protection (manual toggle)        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  LAYER 2: APPLICATION (Business Logic)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  PER-USER API LIMITS (by plan tier):                                │   │
│  │  ┌─────────────┬────────────┬────────────┬────────────────────────┐│   │
│  │  │ Plan        │ Requests   │ Burst      │ Executions/day         ││   │
│  │  ├─────────────┼────────────┼────────────┼────────────────────────┤│   │
│  │  │ FREE        │ 60/min     │ 10/sec     │ 100                    ││   │
│  │  │ STARTER     │ 300/min    │ 30/sec     │ 1,000                  ││   │
│  │  │ PRO         │ 1000/min   │ 100/sec    │ 10,000                 ││   │
│  │  │ BUSINESS    │ 3000/min   │ 300/sec    │ 50,000                 ││   │
│  │  │ ENTERPRISE  │ Custom     │ Custom     │ Unlimited              ││   │
│  │  └─────────────┴────────────┴────────────┴────────────────────────┘│   │
│  │                                                                      │   │
│  │  PER-ENDPOINT LIMITS (sensitive endpoints):                          │   │
│  │  ├── POST /api/auth/login: 5/min per IP (brute force protection)    │   │
│  │  ├── POST /api/auth/register: 3/hour per IP                         │   │
│  │  ├── POST /api/auth/forgot-password: 3/hour per email               │   │
│  │  ├── POST /api/gateways/*/test: 10/min per user                     │   │
│  │  └── POST /api/admin/*: 100/min (admin actions logged)              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  IMPLEMENTATION:                                                            │
│  ├── Cloudflare: Configure via dashboard or Terraform                      │
│  ├── Application: Redis-based sliding window (rate-limiter-flexible)       │
│  ├── Headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After        │
│  └── Response: 429 Too Many Requests with retry information                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Service-to-Service Security (mTLS) ⭐

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTERNAL COMMUNICATION SECURITY                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ALL internal service communication uses mTLS (mutual TLS):                 │
│                                                                             │
│  ┌─────────────┐         mTLS          ┌─────────────┐                     │
│  │  Platform   │ ◄──────────────────► │  Workspace  │                     │
│  │     API     │   Both sides verify   │  Container  │                     │
│  └─────────────┘   certificates        └─────────────┘                     │
│                                                                             │
│  ┌─────────────┐         mTLS          ┌─────────────┐                     │
│  │  Platform   │ ◄──────────────────► │  PostgreSQL │                     │
│  │     API     │   Server + Client     │   Server    │                     │
│  └─────────────┘   certificates        └─────────────┘                     │
│                                                                             │
│  ┌─────────────┐         mTLS          ┌─────────────┐                     │
│  │  Platform   │ ◄──────────────────► │    Redis    │                     │
│  │     API     │   TLS encryption      │   Server    │                     │
│  └─────────────┘                       └─────────────┘                     │
│                                                                             │
│  CERTIFICATE MANAGEMENT:                                                    │
│  ├── CA: Internal CA (cert-manager) or AWS ACM Private CA                  │
│  ├── Rotation: Automatic every 90 days                                      │
│  ├── Distribution: Mounted as secrets in containers                        │
│  └── Revocation: CRL/OCSP for compromised certificates                     │
│                                                                             │
│  NETWORK POLICIES (Kubernetes):                                             │
│  ├── Platform → Database: Allow                                             │
│  ├── Platform → Redis: Allow                                                │
│  ├── Platform → Workspace: Allow (internal API only)                       │
│  ├── Workspace → Platform: Allow (internal API only)                       │
│  ├── Workspace → Workspace: DENY                                            │
│  ├── Workspace → Internet: Allow (for gateway connections)                 │
│  └── Workspace → Cloud Metadata: DENY (prevent SSRF)                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Monitoring & Alerting Architecture ⭐

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         METRICS (Prometheus)                          │ │
│  │  ├── Platform API: Request latency, error rates, throughput           │ │
│  │  ├── Workspace: CPU, memory, process count per container              │ │
│  │  ├── Database: Connection pool, query latency, deadlocks              │ │
│  │  ├── Redis: Memory usage, hit rate, connected clients                 │ │
│  │  ├── BullMQ: Queue depth, job processing time, failure rate           │ │
│  │  └── Business: Active users, executions, revenue metrics              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        VISUALIZATION (Grafana)                        │ │
│  │  ├── Dashboard: System health overview                                 │ │
│  │  ├── Dashboard: Per-user workspace metrics                             │ │
│  │  ├── Dashboard: Business metrics (MRR, churn, usage)                  │ │
│  │  └── Dashboard: Security events                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      ALERTING (AlertManager)                          │ │
│  │                                                                        │ │
│  │  CRITICAL (PagerDuty - immediate):                                    │ │
│  │  ├── Service down > 2 minutes                                         │ │
│  │  ├── Database unreachable                                              │ │
│  │  ├── Error rate > 10%                                                  │ │
│  │  └── Security: Unauthorized access attempts                           │ │
│  │                                                                        │ │
│  │  WARNING (Slack - within 1 hour):                                     │ │
│  │  ├── High latency (p99 > 2s)                                          │ │
│  │  ├── Queue depth > 1000                                                │ │
│  │  ├── Disk usage > 80%                                                  │ │
│  │  └── Backup failed                                                     │ │
│  │                                                                        │ │
│  │  INFO (Email - daily digest):                                         │ │
│  │  ├── Daily backup completed                                            │ │
│  │  ├── Certificate expiry in 30 days                                    │ │
│  │  └── Weekly security scan results                                      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                          LOGS (Loki)                                   │ │
│  │  ├── Structured JSON logging (all services)                           │ │
│  │  ├── Request tracing (correlation ID)                                  │ │
│  │  ├── Security audit logs (separate retention)                         │ │
│  │  └── 30-day retention (90 days for security logs)                     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Estimated Infrastructure Costs ⭐

| Component | Startup (100 users) | Growth (1,000 users) | Scale (10,000 users) |
|-----------|---------------------|----------------------|----------------------|
| **Compute (Platform)** | $50/mo (1x t3.medium) | $200/mo (2x t3.large) | $800/mo (4x t3.xlarge) |
| **Compute (Workspaces)** | $100/mo (spot) | $500/mo (mixed) | $3,000/mo (mixed) |
| **PostgreSQL (RDS)** | $30/mo (db.t3.small) | $100/mo (db.t3.medium) | $400/mo (db.r5.large) |
| **Redis (ElastiCache)** | $15/mo (cache.t3.micro) | $50/mo (cache.t3.small) | $200/mo (cache.r5.large) |
| **Storage (S3)** | $5/mo | $20/mo | $100/mo |
| **Bandwidth** | $10/mo | $50/mo | $300/mo |
| **Monitoring** | $0 (self-hosted) | $50/mo | $200/mo |
| **Backup Storage** | $5/mo | $20/mo | $100/mo |
| **Cloudflare** | $0 (free) | $20/mo (Pro) | $200/mo (Business) |
| **Total** | **~$215/mo** | **~$1,010/mo** | **~$5,300/mo** |

**Cost per user:**
- Startup: ~$2.15/user/mo
- Growth: ~$1.01/user/mo
- Scale: ~$0.53/user/mo (economy of scale)

---

## 🛠️ Tech Stack

### Runtime Requirements ⭐

| Requirement | Version | Why |
|-------------|---------|-----|
| **Node.js** | 20.x LTS | Long-term support, latest features, security patches |
| **pnpm** | 8.x+ | Fast, disk-efficient package manager |
| **Docker** | 24.x+ | Container runtime for workspaces |
| **PostgreSQL** | 15.x+ | Latest features, performance improvements |
| **Redis** | 7.x+ | Streams, better memory management |

```bash
# .nvmrc
20.11.0

# .node-version (for other version managers)
20.11.0
```

### Frontend
| Technology | Purpose | Why |
|------------|---------|-----|
| Next.js 14 | Framework | App router, SSR, API routes |
| TypeScript | Language | Type safety, better DX |
| Tailwind CSS | Styling | Rapid UI development |
| shadcn/ui | Components | Beautiful, accessible, customizable |
| Zustand | State | Simple, lightweight state management |
| React Query | Data fetching | Caching, sync, background updates |

### Backend
| Technology | Purpose | Why |
|------------|---------|-----|
| Node.js | Runtime | Great for real-time, Telegram libs |
| Express.js | Framework | Mature, flexible, middleware ecosystem |
| TypeScript | Language | Type safety across full stack |
| Prisma | ORM | Type-safe database queries |
| BullMQ | Queue | Background jobs, plugin tasks |
| Socket.io | Real-time | Live updates, gateway events |

### Database & Cache
| Technology | Purpose | Why |
|------------|---------|-----|
| PostgreSQL | Primary DB | Reliable, scalable, JSONB for plugins |
| Redis | Cache/Queue | Fast, BullMQ backend, sessions |

### External Services
| Technology | Purpose | Why |
|------------|---------|-----|
| Stripe | Payments | Subscriptions, marketplace payments, **credits** |
| Telegram Bot API | Gateway | Official bot platform |
| GramJS/MTProto | Gateway | Telegram user account automation |
| AI APIs | Gateway | AI-powered features (OpenAI, Gemini, Claude, etc.) |
| **Resend** | Email | Transactional emails (welcome, invoices, alerts) |
| **Sentry** | Error Tracking | Error monitoring, performance tracking |

### AI Provider Fallback Chain ⭐

> **When one AI provider fails or is rate-limited, automatically try the next**

```typescript
const AI_PROVIDER_FALLBACK = {
  // Primary provider
  primary: 'openai',
  
  // Fallback chain (in order)
  fallbackChain: [
    { provider: 'openai', model: 'gpt-4-turbo', costPer1kTokens: 0.01 },
    { provider: 'anthropic', model: 'claude-3-sonnet', costPer1kTokens: 0.003 },
    { provider: 'google', model: 'gemini-pro', costPer1kTokens: 0.00025 },
    { provider: 'groq', model: 'llama-3-70b', costPer1kTokens: 0.0007 },
    { provider: 'ollama', model: 'llama3', costPer1kTokens: 0 }, // Self-hosted
  ],
  
  // Fallback triggers
  triggers: {
    rateLimit: true,      // 429 error
    timeout: true,        // > 30s response
    serverError: true,    // 5xx errors
    quotaExceeded: true,  // Account quota hit
  },
  
  // User preference
  allowFallback: true,    // User can disable fallback
  notifyOnFallback: true, // Notify user when fallback used
};
```

### Testing Framework ⭐

| Tool | Purpose | Why |
|------|---------|-----|
| **Vitest** | Unit tests | Fast, Vite-native, Jest-compatible |
| **Playwright** | E2E tests | Cross-browser, reliable, auto-wait |
| **MSW** | API mocking | Mock external APIs in tests |
| **Faker** | Test data | Generate realistic test data |

```bash
# Test commands
pnpm test           # Run unit tests
pnpm test:e2e       # Run E2E tests
pnpm test:coverage  # Coverage report
```

### API Documentation ⭐

| Tool | Purpose |
|------|---------|
| **OpenAPI 3.1** | API specification |
| **Scalar** | Interactive API docs (replaces Swagger UI) |
| **TypeSpec** | Generate OpenAPI from TypeScript |

```
/api/docs          → Interactive API documentation
/api/openapi.json  → OpenAPI spec (for code generation)
```

### DevOps
| Technology | Purpose | Why |
|------------|---------|-----|
| Docker | Containers | Consistent environments |
| Docker Compose | Local dev | Multi-service setup |
| GitHub Actions | CI/CD | Automated testing/deployment |

### Version Pinning & Supply Chain Security ⭐

> **Critical for production stability and security**

```json
// package.json - Pin exact versions
{
  "dependencies": {
    "next": "14.2.3",           // ✅ Exact version, not ^14.2.3
    "react": "18.3.1",
    "prisma": "5.14.0"
  }
}
```

| Practice | Implementation | Why |
|----------|----------------|-----|
| **Exact versions** | Remove `^` and `~` prefixes | Prevent unexpected breaking changes |
| **Lock files** | Commit `package-lock.json` / `pnpm-lock.yaml` | Reproducible builds |
| **Renovate/Dependabot** | Automated PR for updates | Stay current with security patches |
| **npm audit** | Run in CI pipeline | Catch known vulnerabilities |
| **Package provenance** | Enable `npm audit signatures` | Verify package authenticity |
| **Private registry** | Optional: Verdaccio/Artifactory | Cache & scan packages before use |

```bash
# CI Pipeline - Security checks
npm audit --audit-level=high     # Fail on high/critical vulnerabilities
npx lockfile-lint --path package-lock.json --type npm --allowed-hosts npm
```

---

## 🔐 Environment Variables

```bash
# .env.example

# ===========================================
# APP
# ===========================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=2Bot
NODE_ENV=development

# ===========================================
# LOGGING ⭐
# ===========================================
LOG_LEVEL=info                           # error, warn, info, debug, trace
LOG_FORMAT=json                          # json, pretty (pretty for dev)
LOG_OUTPUT=stdout                        # stdout, file, both
LOG_FILE_PATH=/var/log/2bot/app.log      # File path if LOG_OUTPUT includes file
LOG_ROTATION_SIZE=10m                    # Rotate at 10MB
LOG_RETENTION_DAYS=30                    # Keep logs for 30 days

# ===========================================
# DATABASE
# ===========================================
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/twobot?schema=public"
REDIS_URL="redis://localhost:6379"

# ===========================================
# AUTHENTICATION (NextAuth.js)
# ===========================================
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-min-32-chars-here

# OAuth Providers (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ===========================================
# CORS & SECURITY ⭐
# ===========================================
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://app.2bot.io
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,PATCH,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization,X-API-Key
CORS_CREDENTIALS=true                    # Allow cookies cross-origin
CORS_MAX_AGE=86400                       # Preflight cache (24 hours)

# CSP (Content Security Policy)
CSP_REPORT_URI=https://api.2bot.io/csp-report
CSP_REPORT_ONLY=false                    # Set true to test without blocking

# ===========================================
# ENCRYPTION (for gateway credentials)
# ===========================================
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# ===========================================
# STRIPE (Billing)
# ===========================================
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Subscription Price IDs
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_YEARLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_YEARLY=price_...

# ===========================================
# STRIPE CREDIT PACKAGES ⭐
# ===========================================
STRIPE_CREDIT_PACKAGE_500=price_...      # $5 = 500 credits
STRIPE_CREDIT_PACKAGE_1000=price_...     # $10 = 1,000 credits
STRIPE_CREDIT_PACKAGE_2750=price_...     # $25 = 2,750 credits (+10%)
STRIPE_CREDIT_PACKAGE_6000=price_...     # $50 = 6,000 credits (+20%)
STRIPE_CREDIT_PACKAGE_13000=price_...    # $100 = 13,000 credits (+30%)

# ===========================================
# AI PROVIDERS ⭐
# ===========================================
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=                           # Optional: Organization ID
OPENAI_DEFAULT_MODEL=gpt-4-turbo         # Default model to use
OPENAI_MAX_TOKENS=4096                   # Default max tokens

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229
ANTHROPIC_MAX_TOKENS=4096

# Google AI (Gemini)
GOOGLE_AI_API_KEY=AIza...
GOOGLE_AI_DEFAULT_MODEL=gemini-pro
GOOGLE_AI_PROJECT_ID=                    # Optional: GCP Project ID

# Groq (Fast inference)
GROQ_API_KEY=gsk_...
GROQ_DEFAULT_MODEL=llama-3-70b-8192

# AI Fallback Configuration
AI_PRIMARY_PROVIDER=openai               # Primary provider
AI_FALLBACK_ENABLED=true                 # Enable fallback chain
AI_FALLBACK_ON_RATE_LIMIT=true           # Fallback when rate limited
AI_FALLBACK_ON_TIMEOUT=true              # Fallback when timeout
AI_REQUEST_TIMEOUT=60000                 # AI request timeout (ms)

# Local AI (Ollama - optional)
OLLAMA_BASE_URL=http://localhost:11434   # Ollama server URL
OLLAMA_DEFAULT_MODEL=llama3              # Default local model

# ===========================================
# EMAIL SERVICE ⭐
# ===========================================
# Resend (recommended)
EMAIL_PROVIDER=resend                    # resend, sendgrid, ses
RESEND_API_KEY=re_...
EMAIL_FROM_ADDRESS=noreply@2bot.io
EMAIL_FROM_NAME=2Bot
EMAIL_REPLY_TO=support@2bot.io

# SendGrid (alternative)
SENDGRID_API_KEY=SG....

# AWS SES (alternative)
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=
AWS_SES_SECRET_ACCESS_KEY=

# Email Templates
EMAIL_TEMPLATE_WELCOME=d-...             # Template ID for welcome email
EMAIL_TEMPLATE_INVOICE=d-...             # Template ID for invoices
EMAIL_TEMPLATE_ALERT=d-...               # Template ID for alerts
EMAIL_TEMPLATE_PASSWORD_RESET=d-...      # Password reset template

# ===========================================
# ERROR TRACKING (Sentry) ⭐
# ===========================================
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ORG=2bot
SENTRY_PROJECT=2bot-api
SENTRY_AUTH_TOKEN=                       # For source maps upload
SENTRY_ENVIRONMENT=development           # development, staging, production
SENTRY_RELEASE=                          # Auto-set from git or package.json
SENTRY_TRACES_SAMPLE_RATE=0.1            # Sample 10% of transactions
SENTRY_PROFILES_SAMPLE_RATE=0.1          # Sample 10% for profiling
SENTRY_DEBUG=false                       # Enable Sentry debug mode
SENTRY_ATTACH_STACKTRACE=true            # Attach stack traces to events

# ===========================================
# CLOUDFLARE ⭐
# ===========================================
CLOUDFLARE_API_TOKEN=                    # API token for Cloudflare API
CLOUDFLARE_ZONE_ID=                      # Zone ID for your domain
CLOUDFLARE_ACCOUNT_ID=                   # Account ID

# Cloudflare R2 (S3-compatible storage)
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=2bot-backups
CLOUDFLARE_R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com

# Cloudflare Turnstile (CAPTCHA alternative)
CLOUDFLARE_TURNSTILE_SITE_KEY=
CLOUDFLARE_TURNSTILE_SECRET_KEY=

# ===========================================
# BACKUP & DISASTER RECOVERY ⭐
# ===========================================
BACKUP_ENABLED=true
BACKUP_PROVIDER=s3                       # s3, r2, backblaze, gcs

# AWS S3 (Primary backup)
AWS_S3_BACKUP_BUCKET=2bot-backups-prod
AWS_S3_BACKUP_REGION=us-east-1
AWS_S3_ACCESS_KEY_ID=
AWS_S3_SECRET_ACCESS_KEY=
AWS_S3_GLACIER_BUCKET=2bot-archives      # Long-term archive

# Backblaze B2 (Cost-effective backup)
BACKBLAZE_B2_KEY_ID=
BACKBLAZE_B2_APP_KEY=
BACKBLAZE_B2_BUCKET=2bot-backups

# Google Cloud Storage (Alternative)
GCS_BACKUP_BUCKET=2bot-backups
GCS_PROJECT_ID=
GCS_KEY_FILE=/path/to/service-account.json

# Backup Schedule
BACKUP_SCHEDULE_HOURLY=true              # Database snapshots
BACKUP_SCHEDULE_DAILY=true               # Full daily backup
BACKUP_SCHEDULE_WEEKLY=true              # Weekly full + verification
BACKUP_RETENTION_DAILY_DAYS=30           # Keep daily for 30 days
BACKUP_RETENTION_WEEKLY_WEEKS=12         # Keep weekly for 12 weeks
BACKUP_RETENTION_MONTHLY_MONTHS=12       # Keep monthly for 12 months

# Backup Encryption
BACKUP_ENCRYPTION_ENABLED=true
BACKUP_ENCRYPTION_KEY=                   # 256-bit encryption key
BACKUP_ENCRYPTION_ALGORITHM=aes-256-gcm

# ===========================================
# TELEGRAM (for webhooks)
# ===========================================
TELEGRAM_WEBHOOK_DOMAIN=https://your-domain.com

# ===========================================
# RATE LIMITING
# ===========================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# ===========================================
# API REQUEST SAFEGUARDS
# ===========================================
API_REQUEST_SIZE_LIMIT=1mb               # Default request body size
API_UPLOAD_SIZE_LIMIT=10mb               # File upload size limit
API_REQUEST_TIMEOUT=30000                # Request timeout (ms)
API_SLOW_REQUEST_THRESHOLD=3000          # Log requests slower than 3s

# ===========================================
# DATABASE SAFEGUARDS
# ===========================================
DB_QUERY_TIMEOUT=10000                   # Query timeout (ms)
DB_POOL_SIZE=20                          # Max connections per service
DB_TRANSACTION_TIMEOUT=30000             # Transaction timeout (ms)
DB_SLOW_QUERY_THRESHOLD=5000             # Log queries slower than 5s

# ===========================================
# EXTERNAL API SAFEGUARDS
# ===========================================
EXTERNAL_API_TIMEOUT_DEFAULT=30000       # Default timeout for external APIs
EXTERNAL_API_TIMEOUT_AI=60000            # AI APIs need longer timeout
EXTERNAL_API_TIMEOUT_WEBHOOK=10000       # Webhook calls timeout
EXTERNAL_API_MAX_RETRIES=3               # Max retry attempts
EXTERNAL_API_RETRY_BACKOFF=1000,2000,4000 # Backoff delays (ms)

# ===========================================
# FILE UPLOAD SAFEGUARDS
# ===========================================
UPLOAD_MAX_SIZE_IMAGE=10485760           # 10MB for images
UPLOAD_MAX_SIZE_OTHER=52428800           # 50MB for other files
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/gif,application/pdf
UPLOAD_VIRUS_SCAN_ENABLED=false          # Enable ClamAV scanning

# ===========================================
# DDOS & ABUSE PROTECTION
# ===========================================
IP_RATE_LIMIT_WINDOW=60000               # 1 minute window
IP_RATE_LIMIT_MAX=1000                   # Max requests per IP
IP_BLOCK_THRESHOLD=5000                  # Auto-block after this many
IP_BLOCK_DURATION=3600                   # Block duration (seconds)
SUSPICIOUS_LOGIN_THRESHOLD=5             # Failed logins before CAPTCHA

# ===========================================
# GRACEFUL DEGRADATION
# ===========================================
DEGRADED_MODE_ENABLED=false              # Enable degraded mode
REDIS_FALLBACK_TO_DB=true                # Fall back to DB if Redis down
BILLING_GRACE_PERIOD_HOURS=24            # Grace period if Stripe down

# ===========================================
# MEMORY & DISK SAFEGUARDS
# ===========================================
MEMORY_RESTART_THRESHOLD=80              # Restart process at 80% memory
DISK_WARNING_THRESHOLD=70                # Warn at 70% disk usage
DISK_CRITICAL_THRESHOLD=85               # Critical at 85%
DISK_EMERGENCY_THRESHOLD=95              # Emergency cleanup at 95%

# ===========================================
# FEATURE FLAGS
# ===========================================
FEATURE_FLAGS_ENABLED=true               # Enable feature flag system
FEATURE_FLAGS_PROVIDER=local             # local, launchdarkly, unleash
LAUNCHDARKLY_SDK_KEY=                    # LaunchDarkly SDK key (if used)

# ===========================================
# MONITORING (Optional but recommended)
# ===========================================
SENTRY_DSN=
LOGTAIL_TOKEN=

# ===========================================
# ORGANIZATION (Enterprise)
# ===========================================
ORG_MAX_SEATS_TRIAL=5                    # Max seats during org trial
ORG_TRIAL_DAYS=14                        # Organization trial period
ORG_SSO_ENABLED=false                    # Enable SSO/SAML (Enterprise only)
ORG_SSO_CALLBACK_URL=                    # SAML callback URL
ORG_SSO_ISSUER=                          # SAML issuer

# ===========================================
# SECRET ROTATION
# ===========================================
SECRET_ROTATION_ENABLED=false            # Enable automatic secret rotation
SECRET_ROTATION_PROVIDER=vault           # vault, aws-secrets-manager, manual
SECRET_ROTATION_CHECK_INTERVAL=86400     # Check for rotation daily (seconds)
SECRET_ROTATION_GRACE_PERIOD=3600        # 1 hour grace period for old secrets

# Encryption Key Rotation
ENCRYPTION_KEY_CURRENT=                  # Current active encryption key
ENCRYPTION_KEY_PREVIOUS=                 # Previous key (for decryption during rotation)
ENCRYPTION_KEY_ROTATION_DATE=            # ISO date of last rotation

# JWT Secret Rotation
JWT_ACCESS_SECRET_CURRENT=               # Current JWT signing secret
JWT_ACCESS_SECRET_PREVIOUS=              # Previous secret (validate during rotation)
JWT_REFRESH_SECRET_CURRENT=
JWT_REFRESH_SECRET_PREVIOUS=

# API Key Rotation
API_KEY_VERSION=1                        # Increment when rotating platform API keys
API_KEY_DEPRECATION_WARNING_DAYS=30      # Warn users 30 days before old key expires

# ===========================================
# WORKSPACE CONTAINERS
# ===========================================
WORKSPACE_REGISTRY=docker.io             # Container registry URL
WORKSPACE_IMAGE_TAG=latest               # Workspace runtime image tag
WORKSPACE_NETWORK=2bot-workspace-net     # Docker network for workspaces
WORKSPACE_STARTUP_TIMEOUT=30000          # Container startup timeout (ms)
WORKSPACE_HEALTH_INTERVAL=10000          # Health check interval (ms)

# ===========================================
# WORKSPACE COST OPTIMIZATION
# ===========================================
# Lazy Start (don't start container until needed)
WORKSPACE_LAZY_START_ENABLED=true        # Enable lazy container start
WORKSPACE_PREWARMED_POOL_SIZE=0          # Prewarmed containers (paid feature)

# Container Sleep/Hibernate
WORKSPACE_SLEEP_ENABLED=true             # Enable auto-sleep for idle containers
WORKSPACE_SLEEP_FREE_MINUTES=15          # Free tier: sleep after 15 min idle
WORKSPACE_SLEEP_STARTER_MINUTES=30       # Starter tier: sleep after 30 min
WORKSPACE_SLEEP_PRO_MINUTES=60           # Pro+ tier: sleep after 60 min (configurable)
WORKSPACE_WAKE_ON_DEMAND=true            # Auto-wake when job arrives

# Resource Alerts
RESOURCE_ALERT_INFO_THRESHOLD=70         # Info notification at 70%
RESOURCE_ALERT_WARNING_THRESHOLD=85      # Warning at 85%
RESOURCE_ALERT_CRITICAL_THRESHOLD=95     # Critical at 95%
RESOURCE_ALERT_EMAIL_ENABLED=true        # Send email alerts
RESOURCE_ALERT_WEBHOOK_URL=              # Webhook for alerts (pro+)

# ===========================================
# KUBERNETES (Production)
# ===========================================
K8S_NAMESPACE=2bot-workspaces            # Kubernetes namespace for workspaces
K8S_WORKSPACE_CPU_REQUEST=0.25           # Default CPU request (cores)
K8S_WORKSPACE_CPU_LIMIT=0.5              # Default CPU limit (cores)
K8S_WORKSPACE_MEM_REQUEST=256Mi          # Default memory request
K8S_WORKSPACE_MEM_LIMIT=512Mi            # Default memory limit

# ===========================================
# KUBERNETES COST OPTIMIZATION
# ===========================================
# Spot/Preemptible Instances
K8S_SPOT_ENABLED=true                    # Enable spot instances for workspaces
K8S_SPOT_FREE_TIER_ONLY=true             # Only free tier uses spot (paid = on-demand)
K8S_SPOT_FALLBACK_ENABLED=true           # Fallback to on-demand when spot unavailable
K8S_SPOT_NODE_POOL=spot-pool             # Node pool name for spot instances
K8S_ONDEMAND_NODE_POOL=standard-pool     # Node pool for on-demand instances

# Right-sizing
K8S_RIGHTSIZING_ENABLED=true             # Enable resource usage analysis
K8S_RIGHTSIZING_SAMPLE_DAYS=7            # Days to analyze for recommendations
K8S_OVERPROVISIONED_THRESHOLD=50         # Alert if using <50% of allocated

# ===========================================
# MONITORING PERFORMANCE (Prevent Overhead)
# ===========================================
# Aggregation Settings
MONITORING_AGGREGATION_INTERVAL=60000    # Aggregate metrics every 60 seconds
MONITORING_DASHBOARD_CACHE_TTL=60        # Cache dashboard data for 60 seconds
MONITORING_STALE_WHILE_REVALIDATE=true   # Serve stale data while refreshing

# Time-Series Database
TIMESERIES_DB_ENABLED=true               # Use InfluxDB/TimescaleDB for metrics
TIMESERIES_DB_URL=                       # InfluxDB/TimescaleDB connection URL
TIMESERIES_RETENTION_RAW_DAYS=7          # Keep raw data for 7 days
TIMESERIES_RETENTION_5MIN_DAYS=30        # Keep 5-min aggregates for 30 days
TIMESERIES_RETENTION_HOURLY_DAYS=365     # Keep hourly aggregates for 1 year

# Event Sampling (High-volume events)
MONITORING_SAMPLE_RATE_DEFAULT=100       # Sample 100% by default
MONITORING_SAMPLE_RATE_GATEWAY_MSG=10    # Sample 10% of gateway messages
MONITORING_SAMPLE_RATE_ERRORS=100        # Sample 100% of errors (never skip)

# Rate Limiting for Monitoring Endpoints
MONITORING_RATE_LIMIT_WINDOW=60000       # 1 minute window
MONITORING_RATE_LIMIT_MAX=10             # Max 10 monitoring API calls/minute
MONITORING_DASHBOARD_MIN_INTERVAL=10000  # Min 10 seconds between dashboard refresh
```

---

## 🔒 Security Architecture

### Security Layers

| Layer | Implementation | Purpose |
|-------|----------------|----------|
| **Authentication** | NextAuth.js + JWT | User identity verification |
| **Authorization** | RBAC (Role-Based Access Control) | Permission management |
| **API Security** | API Keys + Rate Limiting | Protect endpoints |
| **Data Encryption** | AES-256-GCM | Encrypt sensitive credentials |
| **Input Validation** | Zod schemas | Prevent injection attacks |
| **Audit Logging** | All sensitive actions logged | Compliance & debugging |
| **Webhook Security** | HMAC signature verification | Prevent MITM attacks |
| **CSP Headers** | Content Security Policy | Prevent XSS, clickjacking |
| **CORS** | Strict origin validation | Prevent cross-origin attacks |
| **CSRF Protection** | Double-submit cookie pattern | Prevent request forgery |
| **Secrets Management** | Environment + Vault | Secure credential storage |

### Authentication Configuration ⭐

```typescript
// src/config/auth.config.ts

export const AUTH_CONFIG = {
  // JWT Token Configuration
  jwt: {
    accessToken: {
      secret: process.env.JWT_ACCESS_SECRET!,
      expiresIn: '15m',              // 15 minutes
    },
    refreshToken: {
      secret: process.env.JWT_REFRESH_SECRET!,
      expiresIn: '7d',               // 7 days
    },
    // For password reset, email verification
    verificationToken: {
      expiresIn: '24h',              // 24 hours
    },
  },
  
  // Password Hashing (bcrypt)
  password: {
    saltRounds: 12,                  // bcrypt cost factor (12 = ~300ms)
    minLength: 8,
    requireUppercase: true,
    requireNumber: true,
    requireSpecialChar: true,
  },
  
  // Session Configuration (NextAuth)
  session: {
    strategy: 'jwt' as const,       // Use JWT, not database sessions
    maxAge: 30 * 24 * 60 * 60,       // 30 days
    updateAge: 24 * 60 * 60,         // 24 hours (refresh session age)
  },
  
  // Rate Limiting for Auth Endpoints
  rateLimit: {
    login: { window: 15 * 60, max: 5 },      // 5 attempts / 15 min
    register: { window: 60 * 60, max: 3 },   // 3 accounts / hour / IP
    passwordReset: { window: 60 * 60, max: 3 }, // 3 resets / hour
  },
};
```

### Account Lockout Mechanism ⭐

```typescript
// src/shared/security/account-lockout.ts

export const ACCOUNT_LOCKOUT_CONFIG = {
  // Failed attempt tracking
  maxFailedAttempts: 5,              // Lock after 5 failed attempts
  lockoutDuration: 15 * 60 * 1000,   // 15 minutes lockout
  attemptWindow: 15 * 60 * 1000,     // Count attempts within 15 min window
  
  // Progressive lockout (increases with repeated lockouts)
  progressiveLockout: {
    enabled: true,
    multiplier: 2,                   // Double lockout each time
    maxDuration: 24 * 60 * 60 * 1000, // Max 24 hour lockout
  },
  
  // Unlock options
  unlockMethods: {
    automatic: true,                 // Auto-unlock after duration
    emailVerification: true,         // Unlock via email link
    adminManual: true,               // Admin can unlock
  },
  
  // Notification
  notifyOnLockout: true,             // Email user when locked
  notifyOnUnlock: true,              // Email when unlocked
};

// Implementation
export class AccountLockoutService {
  async recordFailedAttempt(userId: string, ip: string): Promise<void> {
    const key = `lockout:${userId}`;
    const attempts = await redis.incr(key);
    
    if (attempts === 1) {
      await redis.expire(key, ACCOUNT_LOCKOUT_CONFIG.attemptWindow / 1000);
    }
    
    if (attempts >= ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts) {
      await this.lockAccount(userId);
    }
    
    // Also track by IP for distributed attacks
    await this.recordIpAttempt(ip);
  }
  
  async lockAccount(userId: string): Promise<void> {
    const lockCount = await redis.incr(`lockcount:${userId}`);
    
    let duration = ACCOUNT_LOCKOUT_CONFIG.lockoutDuration;
    if (ACCOUNT_LOCKOUT_CONFIG.progressiveLockout.enabled) {
      duration = Math.min(
        duration * Math.pow(ACCOUNT_LOCKOUT_CONFIG.progressiveLockout.multiplier, lockCount - 1),
        ACCOUNT_LOCKOUT_CONFIG.progressiveLockout.maxDuration
      );
    }
    
    await redis.set(`locked:${userId}`, Date.now() + duration, 'PX', duration);
    
    // Invalidate all sessions
    await this.invalidateAllSessions(userId);
    
    // Send notification
    if (ACCOUNT_LOCKOUT_CONFIG.notifyOnLockout) {
      await emailService.send({
        to: user.email,
        template: 'account-locked',
        data: { duration: formatDuration(duration) }
      });
    }
    
    // Audit log
    await auditLog.create({
      action: 'account.locked',
      userId,
      metadata: { duration, lockCount }
    });
  }
  
  async isAccountLocked(userId: string): Promise<{ locked: boolean; remainingMs?: number }> {
    const lockedUntil = await redis.get(`locked:${userId}`);
    if (!lockedUntil) return { locked: false };
    
    const remaining = parseInt(lockedUntil) - Date.now();
    if (remaining <= 0) {
      await redis.del(`locked:${userId}`);
      return { locked: false };
    }
    
    return { locked: true, remainingMs: remaining };
  }
}
```

### Two-Factor Authentication (2FA/MFA) ⭐

```typescript
// src/shared/security/two-factor.ts
import { authenticator } from 'otplib';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';

export const TWO_FACTOR_CONFIG = {
  // Who can use 2FA
  availability: {
    FREE: false,          // Not available
    STARTER: false,       // Not available
    PRO: true,            // Optional
    BUSINESS: true,       // Optional (recommended)
    ENTERPRISE: true,     // Required for some features
  },
  
  // Supported methods
  methods: {
    totp: true,           // Time-based OTP (Google Authenticator, Authy)
    webauthn: true,       // Hardware keys (YubiKey), biometrics (TouchID/FaceID)
    sms: false,           // Disabled - not secure (SIM swap attacks)
    email: true,          // Email OTP (fallback only)
  },
  
  // TOTP Configuration
  totp: {
    issuer: '2Bot',
    algorithm: 'SHA1',    // Standard for Google Authenticator compatibility
    digits: 6,
    period: 30,           // 30 second window
    window: 1,            // Accept 1 period before/after (drift tolerance)
  },
  
  // WebAuthn Configuration
  webauthn: {
    rpName: '2Bot',
    rpID: '2bot.io',      // Must match domain
    origin: 'https://app.2bot.io',
    attestation: 'none',  // Don't require attestation (more compatible)
    userVerification: 'preferred', // Biometric if available
  },
  
  // Backup codes
  backupCodes: {
    count: 10,            // Generate 10 backup codes
    length: 8,            // 8 characters each
    oneTimeUse: true,     // Each code can only be used once
  },
  
  // Recovery
  recovery: {
    allowEmailRecovery: true,  // Send recovery link to email
    requireAdminApproval: false, // For ENTERPRISE, require admin approval
  },
};

// TOTP Implementation
export class TOTPService {
  generateSecret(userId: string): { secret: string; qrCode: string } {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(userId, TWO_FACTOR_CONFIG.totp.issuer, secret);
    
    // Generate QR code (use qrcode library)
    const qrCode = await QRCode.toDataURL(otpauth);
    
    return { secret, qrCode };
  }
  
  verify(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }
  
  generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < TWO_FACTOR_CONFIG.backupCodes.count; i++) {
      codes.push(randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }
}

// WebAuthn Implementation
export class WebAuthnService {
  async generateRegistrationOptions(user: User) {
    return generateRegistrationOptions({
      rpName: TWO_FACTOR_CONFIG.webauthn.rpName,
      rpID: TWO_FACTOR_CONFIG.webauthn.rpID,
      userID: user.id,
      userName: user.email,
      attestationType: TWO_FACTOR_CONFIG.webauthn.attestation,
      authenticatorSelection: {
        userVerification: TWO_FACTOR_CONFIG.webauthn.userVerification,
        residentKey: 'preferred',
      },
    });
  }
  
  // ... verification methods
}
```

### Session Security & Invalidation ⭐

```typescript
// src/shared/security/session.ts

export const SESSION_SECURITY_CONFIG = {
  // IP binding
  ipBinding: {
    enabled: true,
    strictMode: false,    // If true, exact IP match required
    allowSubnetChange: true, // Allow changes within same /24 subnet
  },
  
  // Device fingerprinting
  deviceFingerprint: {
    enabled: true,
    factors: ['userAgent', 'acceptLanguage', 'timezone', 'screenResolution'],
  },
  
  // Suspicious activity detection
  suspiciousActivity: {
    // Detect impossible travel (login from different country in short time)
    impossibleTravel: {
      enabled: true,
      maxSpeedKmH: 1000,   // Flag if "traveling" faster than 1000 km/h
    },
    
    // Detect multiple sessions from different locations
    multiLocationSessions: {
      enabled: true,
      maxLocations: 3,     // Allow up to 3 different locations
      notifyUser: true,    // Email user about new location
    },
    
    // New device detection
    newDevice: {
      enabled: true,
      notifyUser: true,    // Email user about new device
      requireVerification: false, // Require email verification for new device
    },
  },
  
  // Events that invalidate sessions
  invalidateOn: {
    passwordChange: true,   // ⭐ Force logout on password change
    emailChange: true,      // Force logout on email change
    twoFactorEnabled: true, // Force re-login after enabling 2FA
    twoFactorDisabled: true,
    roleChange: true,       // For org members, re-verify permissions
    accountLocked: true,
    securityAlert: true,    // Manual security flag
  },
};

// Session invalidation implementation
export class SessionService {
  async invalidateAllSessions(userId: string, reason: string): Promise<void> {
    // 1. Increment session version (invalidates all JWTs)
    await prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } }
    });
    
    // 2. Clear any cached sessions in Redis
    await redis.del(`sessions:${userId}:*`);
    
    // 3. Audit log
    await auditLog.create({
      action: 'sessions.invalidated_all',
      userId,
      metadata: { reason }
    });
  }
  
  async invalidateSession(sessionId: string): Promise<void> {
    await redis.del(`session:${sessionId}`);
  }
  
  // Check if session is still valid (called on every request)
  async validateSession(session: Session): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { sessionVersion: true, lockedAt: true }
    });
    
    // Check session version matches
    if (user?.sessionVersion !== session.version) {
      return false; // Session invalidated
    }
    
    // Check if account is locked
    if (user?.lockedAt) {
      return false;
    }
    
    // Check IP binding if enabled
    if (SESSION_SECURITY_CONFIG.ipBinding.enabled) {
      if (!this.isIpAllowed(session.ip, session.originalIp)) {
        await this.flagSuspiciousActivity(session, 'ip_change');
        return false;
      }
    }
    
    return true;
  }
}
```

### OAuth Security (State Parameter) ⭐

```typescript
// src/shared/security/oauth.ts
import { randomBytes, createHash } from 'crypto';

export const OAUTH_SECURITY_CONFIG = {
  // State parameter (CSRF protection)
  state: {
    length: 32,           // 32 bytes = 256 bits entropy
    expiresIn: 10 * 60,   // 10 minutes validity
    storage: 'redis',     // Store state in Redis (not cookies)
  },
  
  // PKCE (Proof Key for Code Exchange) - for mobile/SPA
  pkce: {
    enabled: true,
    method: 'S256',       // SHA-256 (recommended)
  },
  
  // Nonce (for OpenID Connect)
  nonce: {
    enabled: true,
    length: 32,
  },
  
  // Allowed redirect URIs (prevent open redirect)
  allowedRedirectUris: [
    'https://app.2bot.io/auth/callback',
    'https://app.2bot.io/auth/callback/google',
    'https://app.2bot.io/auth/callback/github',
    'http://localhost:3000/auth/callback',  // Dev only
  ],
};

// OAuth state management
export class OAuthStateService {
  async generateState(userId?: string): Promise<string> {
    const state = randomBytes(OAUTH_SECURITY_CONFIG.state.length).toString('hex');
    
    // Store in Redis with metadata
    await redis.setex(
      `oauth:state:${state}`,
      OAUTH_SECURITY_CONFIG.state.expiresIn,
      JSON.stringify({
        createdAt: Date.now(),
        userId, // If linking account to existing user
      })
    );
    
    return state;
  }
  
  async validateState(state: string): Promise<{ valid: boolean; userId?: string }> {
    const data = await redis.get(`oauth:state:${state}`);
    
    if (!data) {
      return { valid: false }; // State not found or expired
    }
    
    // Delete state (one-time use)
    await redis.del(`oauth:state:${state}`);
    
    const parsed = JSON.parse(data);
    return { valid: true, userId: parsed.userId };
  }
  
  // PKCE code verifier/challenge
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return { codeVerifier, codeChallenge };
  }
  
  // Validate redirect URI
  isValidRedirectUri(uri: string): boolean {
    return OAUTH_SECURITY_CONFIG.allowedRedirectUris.includes(uri);
  }
}
```

### Password Breach Check (HaveIBeenPwned) ⭐

```typescript
// src/shared/security/password-breach.ts
import { createHash } from 'crypto';

export const PASSWORD_BREACH_CONFIG = {
  // HaveIBeenPwned API
  hibp: {
    enabled: true,
    apiUrl: 'https://api.pwnedpasswords.com/range/',
    timeout: 5000,         // 5 second timeout
    failOpen: true,        // If API fails, allow password (don't block registration)
  },
  
  // When to check
  checkOn: {
    registration: true,    // Check on new account
    passwordChange: true,  // Check on password change
    login: false,          // Don't check on every login (performance)
  },
  
  // Threshold
  minBreachCount: 1,       // Block if password appeared even once
  
  // User feedback
  messages: {
    breached: 'This password has appeared in a data breach. Please choose a different password.',
    suggestion: 'Consider using a password manager to generate secure passwords.',
  },
};

export class PasswordBreachService {
  async isPasswordBreached(password: string): Promise<{ breached: boolean; count: number }> {
    try {
      // Hash password with SHA-1 (HIBP uses SHA-1)
      const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      
      // K-anonymity: Only send first 5 chars of hash
      const response = await fetch(`${PASSWORD_BREACH_CONFIG.hibp.apiUrl}${prefix}`, {
        headers: { 'User-Agent': '2Bot-Security-Check' },
        signal: AbortSignal.timeout(PASSWORD_BREACH_CONFIG.hibp.timeout),
      });
      
      if (!response.ok) {
        // Fail open - don't block if API is down
        console.warn('HIBP API error:', response.status);
        return { breached: false, count: 0 };
      }
      
      const text = await response.text();
      const lines = text.split('\n');
      
      for (const line of lines) {
        const [hashSuffix, count] = line.split(':');
        if (hashSuffix === suffix) {
          const breachCount = parseInt(count, 10);
          return { 
            breached: breachCount >= PASSWORD_BREACH_CONFIG.minBreachCount, 
            count: breachCount 
          };
        }
      }
      
      return { breached: false, count: 0 };
    } catch (error) {
      console.error('Password breach check failed:', error);
      // Fail open
      return { breached: false, count: 0 };
    }
  }
}

// Usage in registration/password change
const breachCheck = await passwordBreachService.isPasswordBreached(newPassword);
if (breachCheck.breached) {
  throw new ValidationError(PASSWORD_BREACH_CONFIG.messages.breached);
}
```

### Webhook Signature Verification ⭐

```typescript
// src/shared/security/webhook-verification.ts
import { createHmac, timingSafeEqual } from 'crypto';

export const WEBHOOK_SIGNATURE_CONFIG = {
  // Algorithm
  algorithm: 'sha256',
  
  // Header names (varies by provider)
  headers: {
    stripe: 'stripe-signature',
    github: 'x-hub-signature-256',
    telegram: 'x-telegram-bot-api-secret-token',
    custom: 'x-2bot-signature',
  },
  
  // Timestamp tolerance (prevent replay attacks)
  timestampTolerance: 5 * 60 * 1000, // 5 minutes
  
  // Our outgoing webhooks
  outgoing: {
    signatureHeader: 'X-2Bot-Signature',
    timestampHeader: 'X-2Bot-Timestamp',
    algorithm: 'sha256',
  },
};

export class WebhookVerificationService {
  // Verify incoming Stripe webhooks
  verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
    // Stripe signature format: t=timestamp,v1=signature
    const elements = signature.split(',');
    const timestamp = elements.find(e => e.startsWith('t='))?.slice(2);
    const sig = elements.find(e => e.startsWith('v1='))?.slice(3);
    
    if (!timestamp || !sig) return false;
    
    // Check timestamp (prevent replay)
    const timestampMs = parseInt(timestamp, 10) * 1000;
    if (Date.now() - timestampMs > WEBHOOK_SIGNATURE_CONFIG.timestampTolerance) {
      return false; // Too old
    }
    
    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSig = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    
    // Timing-safe comparison
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  }
  
  // Verify incoming GitHub webhooks
  verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSig = 'sha256=' + createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  }
  
  // Verify incoming Telegram webhooks
  verifyTelegramSignature(secretToken: string, expectedToken: string): boolean {
    return timingSafeEqual(Buffer.from(secretToken), Buffer.from(expectedToken));
  }
  
  // Sign OUTGOING webhooks (to user endpoints)
  signOutgoingWebhook(payload: string, secret: string): { signature: string; timestamp: number } {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    
    const signature = createHmac(WEBHOOK_SIGNATURE_CONFIG.outgoing.algorithm, secret)
      .update(signedPayload)
      .digest('hex');
    
    return { 
      signature: `t=${timestamp},v1=${signature}`,
      timestamp 
    };
  }
}

// Middleware for webhook verification
export const webhookVerificationMiddleware = (provider: 'stripe' | 'github' | 'telegram') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers[WEBHOOK_SIGNATURE_CONFIG.headers[provider]] as string;
    
    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }
    
    const rawBody = req.rawBody; // Need raw body for signature verification
    const secret = getWebhookSecret(provider);
    
    const isValid = webhookService.verify(provider, rawBody, signature, secret);
    
    if (!isValid) {
      await auditLog.create({
        action: 'webhook.signature_invalid',
        metadata: { provider, ip: req.ip }
      });
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    next();
  };
};
```

### Sensitive Data Masking in Logs ⭐

```typescript
// src/shared/logging/log-sanitizer.ts

export const LOG_SANITIZER_CONFIG = {
  // Fields to completely redact (replace with [REDACTED])
  redactFields: [
    'password',
    'newPassword',
    'currentPassword',
    'confirmPassword',
    'secret',
    'apiKey',
    'api_key',
    'token',
    'accessToken',
    'refreshToken',
    'bearerToken',
    'authorization',
    'creditCard',
    'cardNumber',
    'cvv',
    'ssn',
    'socialSecurityNumber',
    'encryptionKey',
    'privateKey',
    'sessionToken',
  ],
  
  // Fields to mask (show first/last few chars)
  maskFields: [
    { field: 'email', showFirst: 2, showLast: 4 },      // ab***@example.com
    { field: 'phone', showFirst: 0, showLast: 4 },      // ***1234
    { field: 'stripeCustomerId', showFirst: 4, showLast: 4 }, // cus_***abcd
  ],
  
  // Regex patterns to redact
  patterns: [
    { regex: /sk_live_[a-zA-Z0-9]+/g, replacement: 'sk_live_[REDACTED]' },
    { regex: /sk_test_[a-zA-Z0-9]+/g, replacement: 'sk_test_[REDACTED]' },
    { regex: /Bearer [a-zA-Z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
    { regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CARD]' },
  ],
  
  // Max length for any logged value
  maxValueLength: 1000,
};

export class LogSanitizer {
  sanitize(data: any): any {
    if (data === null || data === undefined) return data;
    
    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item));
    }
    
    if (typeof data === 'object') {
      return this.sanitizeObject(data);
    }
    
    return data;
  }
  
  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if field should be completely redacted
      if (LOG_SANITIZER_CONFIG.redactFields.some(f => lowerKey.includes(f.toLowerCase()))) {
        result[key] = '[REDACTED]';
        continue;
      }
      
      // Check if field should be masked
      const maskConfig = LOG_SANITIZER_CONFIG.maskFields.find(
        f => lowerKey.includes(f.field.toLowerCase())
      );
      if (maskConfig && typeof value === 'string') {
        result[key] = this.maskValue(value, maskConfig.showFirst, maskConfig.showLast);
        continue;
      }
      
      // Recursively sanitize
      result[key] = this.sanitize(value);
    }
    
    return result;
  }
  
  private sanitizeString(str: string): string {
    let result = str;
    
    // Apply regex patterns
    for (const { regex, replacement } of LOG_SANITIZER_CONFIG.patterns) {
      result = result.replace(regex, replacement);
    }
    
    // Truncate if too long
    if (result.length > LOG_SANITIZER_CONFIG.maxValueLength) {
      result = result.slice(0, LOG_SANITIZER_CONFIG.maxValueLength) + '...[TRUNCATED]';
    }
    
    return result;
  }
  
  private maskValue(value: string, showFirst: number, showLast: number): string {
    if (value.length <= showFirst + showLast) {
      return '*'.repeat(value.length);
    }
    
    const first = value.slice(0, showFirst);
    const last = value.slice(-showLast);
    const masked = '*'.repeat(Math.min(value.length - showFirst - showLast, 10));
    
    return `${first}${masked}${last}`;
  }
}

// Logger wrapper
export const secureLogger = {
  info: (message: string, data?: any) => {
    logger.info(message, logSanitizer.sanitize(data));
  },
  error: (message: string, data?: any) => {
    logger.error(message, logSanitizer.sanitize(data));
  },
  warn: (message: string, data?: any) => {
    logger.warn(message, logSanitizer.sanitize(data));
  },
  debug: (message: string, data?: any) => {
    logger.debug(message, logSanitizer.sanitize(data));
  },
};
```

### Security Headers Configuration ⭐

```typescript
// src/shared/security/headers.ts

export const SECURITY_HEADERS = {
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires these
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // XSS Protection (legacy browsers)
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions policy
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  
  // HSTS (only in production with HTTPS)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
```

### Soft Delete Strategy ⭐

```typescript
// src/shared/database/soft-delete.ts

// STRATEGY: Soft delete for user data, hard delete for system data
// Reason: GDPR compliance + audit trail + accidental deletion recovery

export const SOFT_DELETE_CONFIG = {
  // Tables that use soft delete (have deletedAt column)
  softDeleteTables: [
    'User',           // Required for GDPR - user can request deletion
    'Gateway',        // User may want to restore
    'UserPlugin',     // Preserve history
    'UserService',    // Preserve history
    'UserWidget',     // Preserve history (dashboard layouts)
    'Organization',   // Enterprise audit requirements
    'OrgMember',      // Track membership changes
  ],
  
  // Tables that use hard delete (no recovery needed)
  hardDeleteTables: [
    'Session',        // Temporary by nature
    'VerificationToken', // Single-use
    'UsageRecord',    // Aggregated data, can be recreated
    'AuditLog',       // Archive instead of delete
  ],
  
  // Retention periods before permanent deletion
  retentionPeriods: {
    User: 30,         // 30 days after soft delete, then purge
    Gateway: 30,
    UserPlugin: 30,
    UserService: 30,
    Organization: 90, // Enterprise: 90 days
  },
  
  // What happens when parent is deleted
  cascadeRules: {
    User: ['Gateway', 'UserPlugin', 'UserService', 'UserWidget'],
    Organization: ['OrgMember', 'OrgLicense'],
  },
};

// Prisma middleware for automatic soft delete
// Add to schema: deletedAt DateTime?
export const softDeleteMiddleware = async (params: any, next: any) => {
  if (SOFT_DELETE_CONFIG.softDeleteTables.includes(params.model)) {
    if (params.action === 'delete') {
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }
    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      params.args.data = { deletedAt: new Date() };
    }
    // Auto-filter deleted records on find
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = { ...params.args.where, deletedAt: null };
    }
  }
  return next(params);
};
```

### CORS Configuration ⭐

```typescript
// src/shared/security/cors.ts

export const CORS_CONFIG = {
  // Allowed origins (environment-based)
  origins: {
    development: ['http://localhost:3000', 'http://localhost:3001'],
    production: ['https://2bot.app', 'https://app.2bot.app'],
  },
  
  // Allowed methods per route type
  methods: {
    public: ['GET', 'HEAD', 'OPTIONS'],
    authenticated: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    webhooks: ['POST', 'OPTIONS'],
  },
  
  // Allowed headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-CSRF-Token',
  ],
  
  // Exposed headers (client can read)
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  
  // Credentials (cookies, auth headers)
  credentials: true,
  
  // Preflight cache (seconds)
  maxAge: 86400, // 24 hours
};
```

### CSRF Protection ⭐

```typescript
// CSRF protection strategy: Double-submit cookie pattern
// Works well with Next.js and doesn't require server-side state

const CSRF_CONFIG = {
  // Cookie settings
  cookieName: '__csrf',
  cookieOptions: {
    httpOnly: false,       // Client needs to read it
    secure: true,          // HTTPS only in production
    sameSite: 'strict',    // Prevent cross-site requests
    path: '/',
    maxAge: 60 * 60,       // 1 hour
  },
  
  // Header name for token submission
  headerName: 'X-CSRF-Token',
  
  // Routes exempt from CSRF (webhooks use signature verification)
  exemptRoutes: [
    '/api/webhooks/stripe',
    '/api/webhooks/telegram/*',
    '/api/health',
    '/api/health/*',
  ],
};
```

### Input Validation with Zod ⭐

```typescript
// src/shared/validation/schemas.ts
import { z } from 'zod';

// ============================================
// USER INPUT SCHEMAS
// ============================================

export const userCreateSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .transform(e => e.toLowerCase().trim()),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  name: z.string()
    .min(2, 'Name too short')
    .max(100, 'Name too long')
    .regex(/^[\p{L}\p{N}\s'-]+$/u, 'Invalid characters in name'),
});

export const gatewayCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['telegram_bot', 'telegram_user', 'openai', 'gemini', 'claude', 'discord']),
  credentials: z.record(z.string()).refine(
    (creds) => !JSON.stringify(creds).includes('<script>'),
    'Invalid characters in credentials'
  ),
});

// ============================================
// PAGINATION & QUERY SCHEMAS
// ============================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// ============================================
// WEBHOOK PAYLOAD SCHEMAS
// ============================================

export const webhookPayloadSchema = z.object({
  event: z.string().max(100),
  data: z.record(z.unknown()).refine(
    (data) => JSON.stringify(data).length < 1024 * 100, // 100KB max
    'Payload too large'
  ),
  timestamp: z.string().datetime(),
});

// ============================================
// VALIDATION MIDDLEWARE
// ============================================

export const validate = <T extends z.ZodSchema>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }
    
    req.validated = result.data;
    next();
  };
};
```

### SQL Injection Prevention ⭐

```typescript
// STRATEGY: Prisma ORM handles SQL injection prevention automatically
// NEVER use raw SQL with user input - always use parameterized queries

// ✅ SAFE - Prisma parameterizes automatically
const user = await prisma.user.findFirst({
  where: { email: userInput },  // Prisma escapes this
});

// ✅ SAFE - Parameterized raw query (when raw SQL is needed)
const results = await prisma.$queryRaw`
  SELECT * FROM "User" WHERE email = ${userInput}
`;  // ${} is parameterized, NOT string interpolation

// ❌ DANGEROUS - Never do this!
const bad = await prisma.$queryRawUnsafe(
  `SELECT * FROM "User" WHERE email = '${userInput}'`  // SQL INJECTION!
);

// ============================================
// ADDITIONAL PROTECTIONS
// ============================================

const SQL_INJECTION_PATTERNS = [
  /('|(%27))/i,                    // Single quotes
  /(%23)|(#)/i,                    // Hash comments
  /((%3D)|(=))[^\n]*((%27)|')/i, // Equals + quote
  /\w*(%27)|'(%6F)|o(%72)|r/i,  // OR injection
  /(%27)|(')union/i,               // UNION attacks
];

// Input sanitization layer (defense in depth)
export const sanitizeInput = (input: string): string => {
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      throw new ValidationError('Potentially malicious input detected');
    }
  }
  return input;
};
```

### API Key Format & Generation ⭐

```typescript
// src/shared/security/api-keys.ts
import { randomBytes, createHash } from 'crypto';

// ============================================
// API KEY FORMAT
// ============================================
// Format: 2bot_{type}_{random}_{checksum}
// Example: 2bot_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6_x7y8
//
// Prefix: 2bot_ (identifies our platform)
// Type: live_ or test_ (environment)
// Random: 32 chars alphanumeric (256 bits entropy)
// Checksum: 4 chars (first 4 of SHA256 hash)

export const API_KEY_CONFIG = {
  prefix: '2bot',
  types: ['live', 'test', 'internal'] as const,
  randomLength: 32,
  checksumLength: 4,
  
  // Regex for validation
  pattern: /^2bot_(live|test|internal)_[a-zA-Z0-9]{32}_[a-zA-Z0-9]{4}$/,
};

export const generateApiKey = (
  type: 'live' | 'test' | 'internal' = 'live'
): { key: string; hash: string } => {
  // Generate random portion
  const random = randomBytes(24).toString('base64url').slice(0, 32);
  
  // Create checksum
  const payload = `${API_KEY_CONFIG.prefix}_${type}_${random}`;
  const checksum = createHash('sha256')
    .update(payload)
    .digest('hex')
    .slice(0, API_KEY_CONFIG.checksumLength);
  
  const key = `${payload}_${checksum}`;
  
  // Store hash, not the key itself
  const hash = createHash('sha256').update(key).digest('hex');
  
  return { key, hash };
};

export const validateApiKey = (key: string): boolean => {
  if (!API_KEY_CONFIG.pattern.test(key)) return false;
  
  // Verify checksum
  const parts = key.split('_');
  const checksum = parts.pop()!;
  const payload = parts.join('_');
  
  const expectedChecksum = createHash('sha256')
    .update(payload)
    .digest('hex')
    .slice(0, API_KEY_CONFIG.checksumLength);
  
  return checksum === expectedChecksum;
};

// ============================================
// API KEY STORAGE (Database)
// ============================================
// NEVER store raw API keys - only store hashes
//
// Table: ApiKey
// - id: UUID
// - userId: UUID (owner)
// - name: string ("Production Key")
// - keyPrefix: string ("2bot_live_a1b2..." - first 12 chars for identification)
// - keyHash: string (SHA256 hash for lookup)
// - type: enum (live, test)
// - scopes: string[] (["read:gateways", "write:plugins"])
// - lastUsedAt: DateTime?
// - expiresAt: DateTime?
// - createdAt: DateTime
// - revokedAt: DateTime?
```

### Secrets Management Strategy ⭐

```typescript
// Secrets hierarchy (from most to least preferred)
const SECRETS_STRATEGY = {
  // 1. Production: Use secrets manager
  production: {
    provider: 'vault',      // HashiCorp Vault, AWS Secrets Manager, etc.
    rotation: true,         // Auto-rotate secrets
    audit: true,            // Log all access
  },
  
  // 2. Staging: Environment variables from CI/CD
  staging: {
    provider: 'environment',
    source: 'github-secrets',
  },
  
  // 3. Development: .env.local (gitignored)
  development: {
    provider: 'dotenv',
    file: '.env.local',
  },
  
  // Secrets that MUST be rotated regularly
  rotationRequired: [
    'ENCRYPTION_KEY',        // Every 90 days
    'NEXTAUTH_SECRET',       // Every 90 days
    'DATABASE_URL',          // Password rotation
    'STRIPE_SECRET_KEY',     // If compromised
  ],
  
  // Secrets that should NEVER be logged
  neverLog: [
    'password', 'secret', 'key', 'token', 'credential',
    'api_key', 'apikey', 'auth', 'bearer',
  ],
};
```

### API Key System

```typescript
// API Key scopes for fine-grained access control
const API_KEY_SCOPES = {
  // Read scopes
  'read:gateways': 'View gateway configurations',
  'read:plugins': 'View installed plugins',
  'read:services': 'View service configurations',
  'read:analytics': 'View analytics data',
  
  // Write scopes
  'write:gateways': 'Create/update gateways',
  'write:plugins': 'Install/configure plugins',
  'write:services': 'Create/manage services',
  
  // Execute scopes
  'execute:services': 'Trigger service runs',
  'execute:plugins': 'Execute plugin actions',
};
```

### Plugin Sandboxing

```typescript
// Plugin execution is sandboxed using isolated-vm
import ivm from 'isolated-vm';

const SANDBOX_LIMITS = {
  memoryLimit: 128,        // 128MB max memory
  timeout: 5000,           // 5 second execution limit
  cpuTime: 1000,           // 1 second CPU time
};

// Plugins run in isolated context with limited API access
const allowedAPIs = [
  'gateways.execute',      // Gateway method calls
  'storage.get',           // Plugin storage read
  'storage.set',           // Plugin storage write
  'logger.info',           // Logging
  'logger.error',
];
```

### Intra-Workspace Isolation (Bulkhead Pattern)

**Problem:** Multiple plugins/services share one workspace container. A buggy plugin could consume all resources.

**Solution:** Per-component resource limits + Process Manager

```typescript
// Each component within workspace gets SUB-LIMITS
const WORKSPACE_INTERNAL_LIMITS = {
  // Per-plugin limits (within the workspace's total allocation)
  perPluginRamMb: 64,              // Each plugin max 64MB
  perPluginCpuPercent: 20,         // Each plugin max 20% of container CPU
  perPluginTimeout: 5000,          // 5 second max execution
  
  // Per-gateway limits
  perGatewayRamMb: 128,            // Gateways need more for connections
  perGatewayReconnectAttempts: 5,  // Max reconnect before circuit open
  
  // Per-service limits  
  perServiceRamMb: 256,            // Services/workflows need more RAM
  perServiceSteps: 50,             // Max steps per workflow
  
  // Total workspace limits (these come from pricing tier)
  maxConcurrentPlugins: 10,        // Max plugins running at once
  maxConcurrentServices: 5,        // Max services running at once
  maxConcurrentGateways: 5,        // Max gateways connected at once
};

// Process Manager: PM2 inside each workspace container
const PROCESS_MANAGER_CONFIG = {
  // Each plugin runs as separate PM2 process
  pluginProcesses: {
    instances: 1,
    max_memory_restart: '64M',     // Auto-restart if exceeds 64MB
    restart_delay: 1000,
    max_restarts: 3,               // Max 3 restarts in window
    min_uptime: 5000,              // Must run 5s to count as "up"
  },
  
  // Gateways run as separate processes too
  gatewayProcesses: {
    instances: 1,
    max_memory_restart: '128M',
    restart_delay: 5000,           // Longer delay for reconnection
    max_restarts: 5,
    min_uptime: 10000,
  },
  
  // If one process crashes, ONLY that process restarts
  // Other plugins/gateways continue running!
};
```

### Fault Isolation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKSPACE CONTAINER (User A - 2GB Total)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     PM2 Process Manager (Supervisor)                  │
│  │   PROCESS 1     │     Monitors and restarts crashed processes           │
│  │  Gateway: TG    │───┐                                                   │
│  │  RAM: 128MB max │   │                                                   │
│  └─────────────────┘   │                                                   │
│                        │  If TG gateway crashes:                           │
│  ┌─────────────────┐   │  → Only Process 1 restarts                        │
│  │   PROCESS 2     │   │  → Process 2, 3, 4 keep running ✅                │
│  │  Plugin: Stats  │───┤                                                   │
│  │  RAM: 64MB max  │   │                                                   │
│  └─────────────────┘   │                                                   │
│                        │  If Plugin uses >64MB:                            │
│  ┌─────────────────┐   │  → PM2 auto-restarts Process 2 only               │
│  │   PROCESS 3     │   │  → Other processes unaffected ✅                  │
│  │  Plugin: AI     │───┤                                                   │
│  │  RAM: 64MB max  │   │                                                   │
│  └─────────────────┘   │                                                   │
│                        │  Crash Isolation:                                 │
│  ┌─────────────────┐   │  ✅ Plugin crash → only that plugin restarts      │
│  │   PROCESS 4     │───┘  ✅ Gateway crash → only that gateway restarts    │
│  │  Service: Post  │      ✅ Service fail → step retry, not container      │
│  │  RAM: 256MB max │      ✅ Container crash → platform unaffected          │
│  └─────────────────┘                                                       │
│                                                                             │
│  📊 TOTAL USED: 512MB / 2GB limit                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Circuit Breaker Pattern

```typescript
// Prevent cascading failures when external services fail
const CIRCUIT_BREAKER_CONFIG = {
  // Gateway circuit breaker
  gateway: {
    failureThreshold: 5,           // Open circuit after 5 failures
    successThreshold: 2,           // Close after 2 successes
    timeout: 30000,                // Try again after 30 seconds
    
    // States: CLOSED → OPEN → HALF_OPEN → CLOSED
    // CLOSED: Normal operation
    // OPEN: All requests fail fast (don't hammer failing service)
    // HALF_OPEN: Test with single request
  },
  
  // External API circuit breaker (AI, webhooks, etc.)
  externalApi: {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 60000,                // Longer timeout for external APIs
  },
  
  // Database circuit breaker
  database: {
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 10000,                // Quick retry for DB
  },
};

// Implementation: Use 'opossum' library for circuit breaker
// npm install opossum
```

### Redis Isolation (Per-User Namespacing)

```typescript
// Prevent one user from flooding Redis and affecting others
const REDIS_ISOLATION = {
  // Each user's data is namespaced
  keyPrefix: 'user:{userId}:',     // e.g., user:abc123:cache:plugins
  
  // Per-user memory limits (enforced by checking key count/size)
  maxKeysPerUser: 10000,           // Max 10K keys per user
  maxKeySize: 1024 * 100,          // Max 100KB per key
  maxTotalSize: 1024 * 1024 * 50,  // Max 50MB total per user
  
  // Automatic expiration
  defaultTtl: 3600,                // 1 hour default TTL
  maxTtl: 86400,                   // Max 24 hour TTL
  
  // Rate limiting on Redis operations
  maxOpsPerSecond: 100,            // Max 100 Redis ops/second per user
};

// BullMQ Queue Limits
const QUEUE_LIMITS = {
  maxJobsPerUser: 1000,            // Max jobs in queue per user
  maxJobSize: 1024 * 100,          // Max 100KB per job payload
  maxJobAge: 86400000,             // Max 24 hours job age
  maxRetries: 3,                   // Max retry attempts
  
  // Priority queues by tier
  priorities: {
    enterprise: 1,                 // Highest priority
    business: 2,
    pro: 3,
    starter: 4,
    free: 5,                       // Lowest priority
  },
};
```

### Security Incident Response Plan ⭐

```
INCIDENT SEVERITY LEVELS:

P1 - CRITICAL (Response: 15 min)
├── Data breach confirmed
├── Payment system compromised  
├── Authentication bypass discovered
└── Actions: All hands, notify legal, public disclosure prep

P2 - HIGH (Response: 1 hour)
├── Vulnerability discovered (not exploited)
├── Suspicious access patterns detected
├── API key leaked (not used)
└── Actions: Security team, rotate credentials, investigate

P3 - MEDIUM (Response: 24 hours)
├── Failed attack attempts (blocked)
├── Rate limit abuse
├── Spam/abuse reports
└── Actions: Monitor, block IPs, review logs

P4 - LOW (Response: 72 hours)
├── Security scan findings
├── Dependency vulnerabilities (no exploit)
├── Configuration improvements
└── Actions: Plan fix, add to backlog

RESPONSE CHECKLIST:
[ ] Identify scope of incident
[ ] Contain the threat (block access, revoke tokens)
[ ] Preserve evidence (logs, snapshots)
[ ] Notify affected parties (if data breach)
[ ] Root cause analysis
[ ] Implement fix
[ ] Post-mortem document
[ ] Update security measures
```

### Database Row Limits

```typescript
// Prevent one user from filling the database
const DATABASE_LIMITS = {
  // Absolute maximums (even Enterprise can't exceed these without approval)
  // These protect the platform from abuse, separate from plan limits
  maxExecutionLogsPerUser: 10000,  // Keep last 10K logs
  maxPluginConfigsPerUser: 100,    // Max 100 plugin configs
  maxGatewaysPerUser: 50,          // Max 50 gateways (Enterprise can request more)
  maxServicesPerUser: 100,         // Max 100 services (Enterprise can request more)
  maxWidgetsPerUser: 50,           // Max 50 widgets
  
  // Automatic cleanup (cron job)
  retentionDays: {
    executionLogs: 30,             // Keep 30 days of logs
    auditLogs: 90,                 // Keep 90 days of audit
    resourceLogs: 7,               // Keep 7 days of resource usage
  },
  
  // Size limits on JSONB fields
  maxJsonbSize: 1024 * 100,        // Max 100KB per JSONB field
};
```

### Workflow Execution Safeguards

```typescript
const WORKFLOW_LIMITS = {
  maxSteps: 50,                    // Max steps per workflow
  maxDuration: 5 * 60 * 1000,      // 5 minutes max execution
  maxIterations: 1000,             // Loop iteration limit
  maxVariableSize: 1024 * 1024,    // 1MB per variable
  maxRetries: 3,                   // Retry attempts
  retryBackoff: [1000, 5000, 15000], // Exponential backoff (ms)
  maxConcurrentExecutions: 10,     // Per user limit
};
```

---

## 📁 Folder Structure

```
/home/abcdev/projects/2bot/
├── 📄 ROADMAP.md
├── 📄 README.md
├── 📄 CHANGELOG.md                      # ⭐ NEW: Version history
├── 📄 CONTRIBUTING.md                   # ⭐ NEW: Contribution guidelines
├── 📄 package.json
├── 📄 pnpm-lock.yaml                    # ⭐ Use pnpm for performance
├── 📄 docker-compose.yml
├── 📄 docker-compose.prod.yml
├── 📄 docker-compose.test.yml           # ⭐ NEW: Test environment
├── 📄 Makefile                          # ⭐ NEW: Common commands
├── 📄 .env.example
├── 📄 .env.local
├── 📄 .env.test                         # ⭐ NEW: Test environment vars
├── 📄 .gitignore
├── 📄 .dockerignore                     # ⭐ NEW: Docker build optimization
├── 📄 .nvmrc                            # ⭐ NEW: Node version lock
├── 📄 tsconfig.json
├── 📄 tsconfig.build.json               # ⭐ NEW: Production build config
├── 📄 next.config.js
├── 📄 tailwind.config.ts
├── 📄 vitest.config.ts                  # ⭐ NEW: Test configuration
├── 📄 playwright.config.ts              # ⭐ NEW: E2E test configuration
├── 📄 .prettierrc                       # ⭐ NEW: Code formatting
├── 📄 .eslintrc.js                      # ⭐ NEW: Linting rules
├── 📄 commitlint.config.js              # ⭐ NEW: Commit message standards
├── 📄 sentry.client.config.ts           # ⭐ NEW: Sentry client-side config
├── 📄 sentry.server.config.ts           # ⭐ NEW: Sentry server-side config
├── 📄 sentry.edge.config.ts             # ⭐ NEW: Sentry edge runtime config
│
├── 📁 .github/                          # ⭐ NEW: GitHub configurations
│   ├── 📁 workflows/
│   │   ├── 📄 ci.yml                    # CI pipeline (lint, test, build)
│   │   ├── 📄 cd.yml                    # CD pipeline (deploy)
│   │   ├── 📄 security.yml              # Dependency scanning
│   │   └── 📄 release.yml               # Release automation
│   ├── 📁 ISSUE_TEMPLATE/
│   └── 📄 PULL_REQUEST_TEMPLATE.md
│
├── 📁 .storybook/                       # ⭐ NEW: Component documentation
│   ├── 📄 main.ts                       # Storybook configuration
│   ├── 📄 preview.ts                    # Global decorators, parameters
│   └── 📄 manager.ts                    # Manager UI customization
│
├── 📁 infrastructure/                   # ⭐ NEW: Infrastructure as Code
│   ├── 📁 terraform/                    # Terraform configurations
│   │   ├── 📁 environments/
│   │   │   ├── 📁 dev/                  # Development environment
│   │   │   ├── 📁 staging/              # Staging environment
│   │   │   └── 📁 prod/                 # Production environment
│   │   ├── 📁 modules/
│   │   │   ├── 📁 vpc/                  # VPC configuration
│   │   │   ├── 📁 eks/                  # Kubernetes cluster
│   │   │   ├── 📁 rds/                  # PostgreSQL RDS
│   │   │   ├── 📁 elasticache/          # Redis ElastiCache
│   │   │   ├── 📁 s3/                   # S3 buckets (backups, uploads)
│   │   │   ├── 📁 cloudfront/           # CDN configuration
│   │   │   └── 📁 secrets/              # AWS Secrets Manager
│   │   ├── 📄 main.tf                   # Root module
│   │   ├── 📄 variables.tf              # Input variables
│   │   ├── 📄 outputs.tf                # Output values
│   │   └── 📄 providers.tf              # Provider configuration
│   ├── 📁 kubernetes/                   # K8s manifests (Helm charts)
│   │   ├── 📁 charts/
│   │   │   ├── 📁 2bot-api/             # API deployment chart
│   │   │   ├── 📁 2bot-workers/         # Worker deployment chart
│   │   │   └── 📁 2bot-workspace/       # Workspace runtime chart
│   │   ├── 📁 base/                     # Kustomize base configs
│   │   └── 📁 overlays/                 # Environment overlays
│   │       ├── 📁 dev/
│   │       ├── 📁 staging/
│   │       └── 📁 prod/
│   └── 📁 ansible/                      # Configuration management (optional)
│       └── 📁 playbooks/
│
├── 📁 security/                         # ⭐ NEW: Security scanning configs
│   ├── 📄 .snyk                         # Snyk configuration
│   ├── 📄 trivy.yaml                    # Trivy container scanning config
│   ├── 📄 semgrep.yml                   # Semgrep SAST rules
│   ├── 📄 gitleaks.toml                 # Secret detection config
│   ├── 📄 SECURITY.md                   # Security policy
│   ├── 📁 policies/                     # OPA/Rego policies
│   │   ├── 📄 container-policies.rego   # Container security policies
│   │   └── 📄 api-policies.rego         # API security policies
│   └── 📁 reports/                      # Security scan reports (gitignored)
│       └── 📄 .gitkeep
│
├── 📁 docs/                             # ⭐ NEW: Documentation
│   ├── 📄 ARCHITECTURE.md               # Detailed architecture docs
│   ├── 📄 API.md                        # API documentation
│   ├── 📄 DEVELOPMENT.md                # Development setup guide
│   ├── 📄 DEPLOYMENT.md                 # Deployment procedures
│   ├── 📄 TESTING.md                    # Testing guidelines
│   ├── 📄 SECURITY.md                   # Security policies
│   ├── 📁 api/                          # ⭐ NEW: API Documentation
│   │   ├── 📄 openapi.yaml              # OpenAPI 3.1 specification
│   │   └── 📄 README.md                 # API docs readme
│   └── 📁 adr/                          # Architecture Decision Records
│       ├── 📄 001-modular-monolith.md
│       ├── 📄 002-workspace-isolation.md
│       ├── 📄 003-queue-system.md
│       └── 📄 004-credit-system.md      # ⭐ NEW: Credit system ADR
│
├── 📁 scripts/                          # ⭐ NEW: Utility scripts
│   ├── 📄 setup.sh                      # Initial setup script
│   ├── 📄 seed-dev.ts                   # Development data seeding
│   ├── 📄 seed-test.ts                  # Test data seeding
│   ├── 📄 migrate-prod.sh               # Production migration script
│   ├── 📄 generate-api-docs.ts          # OpenAPI spec generation
│   ├── 📄 health-check.ts               # Health check script
│   ├── 📁 backup/                       # ⭐ NEW: Backup scripts
│   │   ├── 📄 backup-db.sh              # Database backup script
│   │   ├── 📄 backup-redis.sh           # Redis backup script
│   │   ├── 📄 backup-uploads.sh         # User uploads backup
│   │   ├── 📄 restore-db.sh             # Database restore script
│   │   ├── 📄 verify-backup.sh          # Backup integrity check
│   │   └── 📄 backup-to-glacier.sh      # Archive old backups to Glacier
│   └── 📁 migrations/                   # ⭐ NEW: Data migration scripts
│       ├── 📄 README.md                 # Migration documentation
│       ├── 📄 migrate-users-v2.ts       # Example user migration
│       ├── 📄 migrate-credits.ts        # Credit system migration
│       └── 📄 rollback-template.ts      # Rollback template
│
├── 📁 monitoring/                       # ⭐ NEW: Observability Configuration
│   ├── 📁 prometheus/
│   │   ├── 📄 prometheus.yml            # Prometheus scrape config
│   │   ├── 📄 alerts.yml                # Alerting rules
│   │   └── 📄 recording-rules.yml       # Pre-computed metrics
│   ├── 📁 grafana/
│   │   ├── 📁 dashboards/               # Pre-built dashboards
│   │   │   ├── 📄 platform-overview.json    # Main platform metrics
│   │   │   ├── 📄 workspace-health.json     # Workspace container metrics
│   │   │   ├── 📄 gateway-status.json       # Gateway connection status
│   │   │   ├── 📄 api-performance.json      # API latency & errors
│   │   │   ├── 📄 billing-metrics.json      # Revenue & usage metrics
│   │   │   └── 📄 business-kpis.json        # Business KPIs dashboard
│   │   ├── 📁 provisioning/
│   │   │   ├── 📄 datasources.yml       # Prometheus, Loki datasources
│   │   │   └── 📄 dashboards.yml        # Dashboard provisioning
│   │   └── 📄 grafana.ini               # Grafana configuration
│   ├── 📁 loki/                         # Log aggregation
│   │   └── 📄 loki-config.yml           # Loki configuration
│   ├── 📁 alertmanager/
│   │   └── 📄 alertmanager.yml          # Alert routing (Slack, PagerDuty, email)
│   └── 📄 docker-compose.monitoring.yml # Monitoring stack compose file
│
├── 📁 prisma/
│   ├── 📄 schema.prisma
│   ├── 📁 migrations/
│   ├── 📄 seed.ts                       # Production seed (categories, etc.)
│   └── 📁 seeds/                        # ⭐ NEW: Seed data files
│       ├── 📄 categories.json
│       ├── 📄 plans.json
│       └── 📄 builtin-items.json
│
├── 📁 src/
│   │
│   ├── 📁 app/                          # Next.js App Router
│   │   ├── 📄 layout.tsx                # Root layout with ThemeProvider
│   │   ├── 📄 page.tsx                  # Landing page
│   │   ├── 📄 globals.css               # Global styles + theme variables
│   │   │
│   │   ├── 📁 (auth)/                   # Auth group (public)
│   │   │   ├── 📁 login/
│   │   │   ├── 📁 register/
│   │   │   └── 📁 forgot-password/
│   │   │
│   │   ├── 📁 (dashboard)/              # Dashboard group (protected)
│   │   │   ├── 📄 layout.tsx            # Dashboard layout (sidebar)
│   │   │   ├── 📁 dashboard/            # Main dashboard with widgets
│   │   │   ├── 📁 gateways/             # Gateway management
│   │   │   │   ├── 📄 page.tsx
│   │   │   │   ├── 📁 new/
│   │   │   │   └── 📁 [id]/
│   │   │   ├── 📁 marketplace/          # Unified marketplace
│   │   │   │   ├── 📄 page.tsx          # Marketplace home (all types)
│   │   │   │   ├── 📁 plugins/
│   │   │   │   ├── 📁 themes/
│   │   │   │   ├── 📁 widgets/
│   │   │   │   └── 📁 services/
│   │   │   ├── 📁 my-items/             # User's installed items
│   │   │   │   ├── 📁 plugins/
│   │   │   │   ├── 📁 themes/
│   │   │   │   ├── 📁 widgets/
│   │   │   │   └── 📁 services/
│   │   │   ├── 📁 services/             # Service workflow management
│   │   │   │   ├── 📄 page.tsx          # List user services
│   │   │   │   ├── 📁 builder/          # Visual workflow builder
│   │   │   │   └── 📁 [id]/             # Service detail/logs
│   │   │   ├── 📁 org/                  # ⭐ Organization management (Enterprise)
│   │   │   │   ├── 📄 page.tsx          # Org overview dashboard
│   │   │   │   ├── 📁 create/           # Create new organization
│   │   │   │   ├── 📁 settings/         # Org settings, branding
│   │   │   │   ├── 📁 members/          # Member management
│   │   │   │   │   ├── 📄 page.tsx      # List members
│   │   │   │   │   ├── 📁 invite/       # Invite new members
│   │   │   │   │   └── 📁 [id]/         # Member detail/role edit
│   │   │   │   ├── 📁 departments/      # Department management
│   │   │   │   │   ├── 📄 page.tsx      # List departments
│   │   │   │   │   ├── 📁 new/          # Create department
│   │   │   │   │   └── 📁 [id]/         # Dept detail/members/items
│   │   │   │   ├── 📁 licenses/         # Org marketplace licenses
│   │   │   │   │   ├── 📄 page.tsx      # List all org licenses
│   │   │   │   │   └── 📁 [id]/         # License detail/assignment
│   │   │   │   ├── 📁 billing/          # Org billing (separate from user)
│   │   │   │   │   ├── 📄 page.tsx      # Org billing overview
│   │   │   │   │   ├── 📁 plans/        # Org plan selection
│   │   │   │   │   └── 📁 invoices/     # Invoice history
│   │   │   │   ├── 📁 analytics/        # Cross-dept analytics
│   │   │   │   └── 📁 partners/         # Inter-org partner links
│   │   │   ├── 📁 billing/
│   │   │   └── 📁 settings/
│   │   │       ├── 📁 profile/
│   │   │       ├── 📁 appearance/       # Theme settings
│   │   │       └── 📁 security/
│   │   │
│   │   ├── 📁 (admin)/                  # ⭐ NEW: Admin Dashboard (Platform Owner)
│   │   │   ├── 📄 layout.tsx            # Admin layout with permission check (role: ADMIN)
│   │   │   ├── 📁 admin/                # Admin home dashboard
│   │   │   │   └── 📄 page.tsx          # Platform overview, key metrics
│   │   │   ├── 📁 users/                # User Management
│   │   │   │   ├── 📄 page.tsx          # User list with search, filters
│   │   │   │   ├── 📁 [id]/             # User detail
│   │   │   │   │   ├── 📄 page.tsx      # User profile, activity log
│   │   │   │   │   ├── 📁 impersonate/  # Login as user (support)
│   │   │   │   │   ├── 📁 ban/          # Ban user action
│   │   │   │   │   ├── 📁 suspend/      # Temporary suspension
│   │   │   │   │   └── 📁 reset-password/ # Force password reset
│   │   │   │   └── 📁 export/           # Export users (CSV, JSON)
│   │   │   ├── 📁 organizations/        # Organization Management
│   │   │   │   ├── 📄 page.tsx          # List all organizations
│   │   │   │   └── 📁 [id]/             # Org detail, members, usage
│   │   │   ├── 📁 marketplace/          # Marketplace Administration
│   │   │   │   ├── 📄 page.tsx          # Marketplace stats overview
│   │   │   │   ├── 📁 submissions/      # Developer submissions queue
│   │   │   │   │   ├── 📄 page.tsx      # Pending review list
│   │   │   │   │   └── 📁 [id]/         # Review submission detail
│   │   │   │   ├── 📁 items/            # All marketplace items
│   │   │   │   │   ├── 📄 page.tsx      # Item list (feature, delist)
│   │   │   │   │   └── 📁 [id]/         # Item detail, edit, reports
│   │   │   │   └── 📁 developers/       # Developer accounts
│   │   │   │       ├── 📄 page.tsx      # Developer list
│   │   │   │       └── 📁 [id]/         # Developer detail, payouts
│   │   │   ├── 📁 billing/              # Platform Billing Admin
│   │   │   │   ├── 📄 page.tsx          # Revenue dashboard
│   │   │   │   ├── 📁 subscriptions/    # All active subscriptions
│   │   │   │   ├── 📁 invoices/         # Invoice lookup
│   │   │   │   ├── 📁 refunds/          # Refund requests
│   │   │   │   └── 📁 payouts/          # Developer payouts
│   │   │   ├── 📁 feature-flags/        # Feature Flag Management
│   │   │   │   ├── 📄 page.tsx          # List all flags
│   │   │   │   ├── 📁 new/              # Create new flag
│   │   │   │   └── 📁 [id]/             # Flag detail, overrides
│   │   │   ├── 📁 announcements/        # Platform Announcements
│   │   │   │   ├── 📄 page.tsx          # Announcement list
│   │   │   │   ├── 📁 new/              # Create announcement
│   │   │   │   └── 📁 [id]/             # Edit announcement
│   │   │   ├── 📁 support/              # Support Tickets (optional)
│   │   │   │   ├── 📄 page.tsx          # Ticket queue
│   │   │   │   └── 📁 [id]/             # Ticket detail, responses
│   │   │   ├── 📁 system/               # System Settings
│   │   │   │   ├── 📄 page.tsx          # System config overview
│   │   │   │   ├── 📁 settings/         # Platform settings
│   │   │   │   ├── 📁 rate-limits/      # Rate limit configuration
│   │   │   │   ├── 📁 plans/            # Plan configuration
│   │   │   │   ├── 📁 maintenance/      # Maintenance mode toggle
│   │   │   │   └── 📁 api-keys/         # Platform API keys
│   │   │   ├── 📁 monitoring/           # System Monitoring
│   │   │   │   ├── 📄 page.tsx          # Health dashboard
│   │   │   │   ├── 📁 workspaces/       # Active workspace containers
│   │   │   │   ├── 📁 queues/           # BullMQ queue status
│   │   │   │   ├── 📁 errors/           # Error logs, exceptions
│   │   │   │   └── 📁 performance/      # Performance metrics
│   │   │   ├── 📁 reports/              # Analytics & Reports
│   │   │   │   ├── 📄 page.tsx          # Report dashboard
│   │   │   │   ├── 📁 revenue/          # Revenue reports
│   │   │   │   ├── 📁 usage/            # Usage reports
│   │   │   │   ├── 📁 growth/           # User growth analytics
│   │   │   │   └── 📁 export/           # Export reports
│   │   │   └── 📁 audit-log/            # Admin Audit Log
│   │   │       ├── 📄 page.tsx          # Admin action history
│   │   │       └── 📁 export/           # Export audit logs
│   │   │
│   │   ├── 📁 (developer)/              # ⭐ NEW: Developer Portal Dashboard
│   │   │   ├── 📄 layout.tsx            # Developer layout with permission check (role: DEVELOPER)
│   │   │   ├── 📁 developer/            # Developer home dashboard
│   │   │   │   └── 📄 page.tsx          # Developer overview, stats
│   │   │   ├── 📁 items/                # My Published Items
│   │   │   │   ├── 📄 page.tsx          # List my items
│   │   │   │   ├── 📁 [id]/             # Item management
│   │   │   │   │   ├── 📄 page.tsx      # Item detail, stats
│   │   │   │   │   ├── 📁 edit/         # Edit item
│   │   │   │   │   ├── 📁 versions/     # Version history
│   │   │   │   │   └── 📁 analytics/    # Item analytics
│   │   │   │   └── 📁 new/              # Start new submission
│   │   │   ├── 📁 submit/               # Submission Workflow
│   │   │   │   ├── 📄 page.tsx          # Submission type selector
│   │   │   │   ├── 📁 plugin/           # Submit plugin
│   │   │   │   ├── 📁 theme/            # Submit theme
│   │   │   │   ├── 📁 widget/           # Submit widget
│   │   │   │   └── 📁 service/          # Submit service
│   │   │   ├── 📁 reviews/              # Customer Reviews
│   │   │   │   ├── 📄 page.tsx          # All reviews for my items
│   │   │   │   └── 📁 [id]/             # Review detail, respond
│   │   │   ├── 📁 analytics/            # Analytics Dashboard
│   │   │   │   ├── 📄 page.tsx          # Overview dashboard
│   │   │   │   ├── 📁 downloads/        # Download trends
│   │   │   │   ├── 📁 revenue/          # Revenue analytics
│   │   │   │   └── 📁 ratings/          # Rating trends
│   │   │   ├── 📁 earnings/             # Earnings Overview
│   │   │   │   └── 📄 page.tsx          # Earnings summary
│   │   │   ├── 📁 payouts/              # Payout Management
│   │   │   │   ├── 📄 page.tsx          # Payout history
│   │   │   │   └── 📁 settings/         # Payout method settings
│   │   │   └── 📁 settings/             # Developer Settings
│   │   │       ├── 📄 page.tsx          # Settings overview
│   │   │       ├── 📁 profile/          # Developer profile
│   │   │       ├── 📁 api-keys/         # Developer API keys
│   │   │       └── 📁 webhooks/         # Webhook notifications
│   │   │
│   │   └── 📁 api/                      # API Routes
│   │       ├── 📁 v1/                   # ⭐ NEW: API Versioning
│   │       │   ├── 📁 auth/
│   │       │   ├── 📁 gateways/
│   │       │   ├── 📁 marketplace/
│   │       │   ├── 📁 plugins/
│   │       │   ├── 📁 themes/
│   │       │   ├── 📁 widgets/
│   │       │   ├── 📁 services/
│   │       │   ├── 📁 billing/
│   │       │   ├── 📁 workspace/
│   │       │   ├── 📁 credits/          # ⭐ NEW: Credits API
│   │       │   │   ├── 📄 route.ts      # GET/POST /credits
│   │       │   │   ├── 📁 balance/      # GET /credits/balance
│   │       │   │   ├── 📁 purchase/     # POST /credits/purchase
│   │       │   │   ├── 📁 transactions/ # GET /credits/transactions
│   │       │   │   ├── 📁 packages/     # GET /credits/packages
│   │       │   │   └── 📁 settings/     # PUT /credits/settings
│   │       │   ├── 📁 org/              # Organization API
│   │       │   ├── 📁 admin/            # ⭐ NEW: Admin API
│   │       │   │   ├── 📁 users/        # Admin user management
│   │       │   │   ├── 📁 organizations/# Admin org management
│   │       │   │   ├── 📁 marketplace/  # Admin marketplace control
│   │       │   │   ├── 📁 billing/      # Admin billing management
│   │       │   │   ├── 📁 feature-flags/# Feature flag API
│   │       │   │   ├── 📁 announcements/# Announcement API
│   │       │   │   ├── 📁 system/       # System settings API
│   │       │   │   ├── 📁 monitoring/   # Monitoring API
│   │       │   │   ├── 📁 reports/      # Reports API
│   │       │   │   └── 📁 audit-log/    # Audit log API
│   │       │   └── 📁 developer/        # ⭐ NEW: Developer Portal API
│   │       │       ├── 📁 items/        # Developer's items
│   │       │       ├── 📁 submissions/  # Item submissions
│   │       │       ├── 📁 analytics/    # Developer analytics
│   │       │       ├── 📁 earnings/     # Earnings data
│   │       │       └── 📁 payouts/      # Payout API
│   │       ├── 📁 v2/                   # ⭐ Future API version (when needed)
│   │       │   └── 📄 .gitkeep          # Placeholder for future version
│   │       ├── 📁 webhooks/             # Webhooks don't need versioning
│   │       │   ├── 📁 stripe/
│   │       │   ├── 📁 telegram/
│   │       │   └── 📁 gateway/          # Generic gateway webhooks
│   │       ├── 📁 internal/             # ⭐ NEW: Internal APIs (workspace ↔ platform)
│   │       │   ├── 📄 health/           # Health check endpoints
│   │       │   ├── 📄 metrics/          # Prometheus metrics endpoint
│   │       │   └── 📄 workspace-rpc/    # Workspace-to-platform RPC
│   │       └── 📁 public/               # ⭐ NEW: Public APIs (no auth required)
│   │           ├── 📄 health/           # Public health check
│   │           ├── 📄 version/          # API version info
│   │           └── 📁 docs/             # ⭐ NEW: API Documentation
│   │               ├── 📄 route.ts      # Interactive API docs (Scalar UI)
│   │               └── 📄 openapi.json/ # OpenAPI spec endpoint
│   │
│   ├── 📁 modules/                      # Backend Modules (Modular Monolith)
│   │   ├── 📁 auth/
│   │   ├── 📁 users/
│   │   ├── 📁 workspace/                # ⭐ Workspace orchestration
│   │   │   ├── 📄 workspace.service.ts  # Container lifecycle management
│   │   │   ├── 📄 workspace.orchestrator.ts  # Job routing to workspaces
│   │   │   ├── 📄 resource-monitor.ts   # Resource usage tracking
│   │   │   └── 📄 container-manager.ts  # Docker/K8s integration
│   │   ├── 📁 credits/                  # ⭐ NEW: Credit System Module
│   │   │   ├── 📄 credit.service.ts     # Credit balance operations
│   │   │   ├── 📄 credit-transaction.service.ts  # Immutable ledger
│   │   │   ├── 📄 credit-package.service.ts  # Package management
│   │   │   ├── 📄 credit-usage.service.ts    # Usage tracking (AI, overages)
│   │   │   ├── 📄 auto-topup.service.ts      # Auto top-up logic
│   │   │   ├── 📄 org-credit-pool.service.ts # Organization credit pools
│   │   │   └── 📄 credit.controller.ts       # Credit API endpoints
│   │   ├── 📁 organization/             # ⭐ Organization (Enterprise)
│   │   │   ├── 📄 organization.service.ts    # Org CRUD, settings
│   │   │   ├── 📄 department.service.ts      # Department management
│   │   │   ├── 📄 membership.service.ts      # Member invites, roles
│   │   │   ├── 📄 license.service.ts         # Org marketplace licenses
│   │   │   ├── 📄 org-workspace.service.ts   # Org shared workspace
│   │   │   ├── 📄 partner-link.service.ts    # Inter-org communication
│   │   │   └── 📄 org-billing.service.ts     # Org-level billing
│   │   ├── 📁 gateways/
│   │   │   ├── 📄 gateway.service.ts
│   │   │   ├── 📁 providers/            # Gateway implementations
│   │   │   │   ├── 📄 base.gateway.ts
│   │   │   │   ├── 📄 telegram-bot.gateway.ts
│   │   │   │   ├── 📄 telegram-user.gateway.ts
│   │   │   │   └── 📄 ai.gateway.ts           # Supports multiple AI providers
│   │   │   └── 📁 bridge/               # Inter-gateway communication
│   │   ├── 📁 marketplace/              # Unified marketplace logic
│   │   ├── 📁 plugins/
│   │   │   ├── 📄 plugin.runtime.ts     # Plugin execution engine
│   │   │   └── 📁 builtin/              # Built-in plugins
│   │   ├── 📁 themes/
│   │   │   ├── 📄 theme.service.ts
│   │   │   └── 📁 builtin/              # Built-in themes
│   │   ├── 📁 widgets/
│   │   │   ├── 📄 widget.service.ts
│   │   │   └── 📁 builtin/              # Built-in widgets
│   │   ├── 📁 services/                 # SERVICE = WORKFLOW ENGINE
│   │   │   ├── 📄 service.service.ts
│   │   │   ├── 📄 workflow-engine.ts    # ⭐ Core workflow executor
│   │   │   ├── 📄 step-executor.ts
│   │   │   ├── 📄 data-transformer.ts
│   │   │   └── 📁 builtin/              # Built-in services
│   │   ├── 📁 billing/
│   │   │   ├── 📄 billing.service.ts
│   │   │   ├── 📄 stripe.service.ts     # Stripe API wrapper
│   │   │   ├── 📄 usage.service.ts      # Usage tracking
│   │   │   ├── 📄 invoice.service.ts    # Invoice generation
│   │   │   └── 📄 webhook-handlers.ts   # Stripe webhook handlers
│   │   ├── 📁 monitoring/               # ⭐ NEW: Observability module
│   │   │   ├── 📄 metrics.service.ts    # Prometheus metrics
│   │   │   ├── 📄 health.service.ts     # Health check logic
│   │   │   ├── 📄 alerts.service.ts     # Alert threshold checks
│   │   │   └── 📄 analytics.service.ts  # Usage analytics aggregation
│   │   ├── 📁 notifications/            # ⭐ NEW: Notification module
│   │   │   ├── 📄 notification.service.ts
│   │   │   ├── 📄 email.service.ts      # Email sending (Resend/SendGrid)
│   │   │   ├── 📄 push.service.ts       # Push notifications (future)
│   │   │   └── 📁 templates/            # Email templates
│   │   │       ├── 📄 welcome.tsx       # React Email templates
│   │   │       ├── 📄 password-reset.tsx
│   │   │       └── 📄 invoice.tsx
│   │   └── 📁 admin/                    # ⭐ NEW: Admin-only module
│   │       ├── 📄 admin.service.ts      # Admin operations
│   │       ├── 📄 user-management.ts    # User admin actions
│   │       └── 📄 platform-stats.ts     # Platform analytics
│   │
│   ├── 📁 config/                       # ⭐ NEW: Centralized Configuration
│   │   ├── 📄 index.ts                  # Config loader with validation
│   │   ├── 📄 app.config.ts             # App-level config
│   │   ├── 📄 database.config.ts        # Database connection config
│   │   ├── 📄 redis.config.ts           # Redis connection config
│   │   ├── 📄 auth.config.ts            # Auth settings
│   │   ├── 📄 billing.config.ts         # Stripe, pricing config
│   │   ├── 📄 workspace.config.ts       # Container limits per plan
│   │   ├── 📄 gateway.config.ts         # GATEWAY_TYPE_CONFIG
│   │   ├── 📄 marketplace.config.ts     # MARKETPLACE_TYPE_CONFIG
│   │   ├── 📄 security.config.ts        # CORS, CSP, rate limits
│   │   ├── 📄 feature-flags.config.ts   # Feature flags definitions
│   │   └── 📄 dashboard.config.ts       # ⭐ NEW: DASHBOARD_TYPE_CONFIG (extensible roles)
│   │
│   ├── 📁 i18n/                         # ⭐ NEW: Internationalization
│   │   ├── 📄 index.ts                  # i18n setup (next-intl or i18next)
│   │   ├── 📄 config.ts                 # Supported locales, default locale
│   │   ├── 📁 locales/                  # Translation files
│   │   │   ├── 📁 en/                   # English (default)
│   │   │   │   ├── 📄 common.json       # Common strings (buttons, labels)
│   │   │   │   ├── 📄 auth.json         # Auth-related strings
│   │   │   │   ├── 📄 dashboard.json    # Dashboard strings
│   │   │   │   ├── 📄 marketplace.json  # Marketplace strings
│   │   │   │   ├── 📄 billing.json      # Billing/pricing strings
│   │   │   │   ├── 📄 errors.json       # Error messages
│   │   │   │   └── 📄 emails.json       # Email template strings
│   │   │   ├── 📁 es/                   # Spanish
│   │   │   ├── 📁 fr/                   # French
│   │   │   ├── 📁 de/                   # German
│   │   │   ├── 📁 pt/                   # Portuguese
│   │   │   ├── 📁 ru/                   # Russian
│   │   │   ├── 📁 zh/                   # Chinese (Simplified)
│   │   │   ├── 📁 ja/                   # Japanese
│   │   │   └── 📁 ar/                   # Arabic (RTL support)
│   │   └── 📄 middleware.ts             # Locale detection middleware
│   │
│   ├── 📁 feature-flags/                # ⭐ NEW: Feature Flag System
│   │   ├── 📄 index.ts                  # Feature flag service
│   │   ├── 📄 flags.ts                  # Flag definitions with metadata
│   │   ├── 📄 provider.tsx              # React context provider
│   │   ├── 📄 hooks.ts                  # useFeatureFlag, useFeatureFlags hooks
│   │   ├── 📄 server.ts                 # Server-side flag evaluation
│   │   └── 📁 definitions/              # Flag category files
│   │       ├── 📄 billing.flags.ts      # Billing-related flags
│   │       ├── 📄 marketplace.flags.ts  # Marketplace feature flags
│   │       ├── 📄 workspace.flags.ts    # Workspace/container flags
│   │       └── 📄 experimental.flags.ts # Beta/experimental features
│   │
│   ├── 📁 shared/                       # Shared Kernel
│   │   ├── 📁 database/                 # Prisma + Redis clients
│   │   │   ├── 📄 prisma.ts             # Prisma client singleton
│   │   │   ├── 📄 redis.ts              # Redis client singleton
│   │   │   └── 📄 transaction.ts        # ⭐ NEW: Transaction helpers
│   │   ├── 📁 cache/                    # Redis caching layer
│   │   │   ├── 📄 cache.service.ts      # Cache operations
│   │   │   ├── 📄 cache.constants.ts    # TTL configurations
│   │   │   └── 📄 cache.decorators.ts   # ⭐ NEW: @Cacheable decorator
│   │   ├── 📁 queue/                    # BullMQ setup
│   │   │   ├── 📄 queue.service.ts      # Queue management
│   │   │   ├── 📄 queue.constants.ts    # ⭐ NEW: Queue names, priorities
│   │   │   ├── 📄 dead-letter.ts        # Dead letter queue handler
│   │   │   └── 📄 backpressure.ts       # ⭐ NEW: Queue overflow protection
│   │   ├── 📁 events/                   # Event bus
│   │   │   ├── 📄 event-emitter.ts      # ⭐ NEW: Typed event emitter
│   │   │   └── 📄 events.constants.ts   # ⭐ NEW: Event type definitions
│   │   ├── 📁 auth/                     # Session, permissions
│   │   │   ├── 📄 session.ts            # Session management
│   │   │   ├── 📄 permissions.ts        # RBAC permissions
│   │   │   └── 📄 api-keys.ts           # API key validation
│   │   ├── 📁 crypto/                   # Encryption for credentials
│   │   │   ├── 📄 encrypt.ts            # AES-256-GCM encryption
│   │   │   └── 📄 hash.ts               # Hashing utilities
│   │   ├── 📁 security/                 # Security utilities
│   │   │   ├── 📄 sandbox.ts            # Plugin sandboxing (isolated-vm)
│   │   │   ├── 📄 sanitize.ts           # Log sanitization
│   │   │   └── 📄 webhook-verify.ts     # Webhook signature verification
│   │   ├── 📁 errors/                   # Custom error classes
│   │   │   ├── 📄 app-error.ts          # Base error class
│   │   │   ├── 📄 api-errors.ts         # API-specific errors
│   │   │   └── 📄 gateway-errors.ts     # Gateway-specific errors
│   │   ├── 📁 middleware/               # Express/Next middleware
│   │   │   ├── 📄 rate-limiter.ts       # Rate limiting
│   │   │   ├── 📄 auth-guard.ts         # Auth protection
│   │   │   ├── 📄 api-key-guard.ts      # API key authentication
│   │   │   └── 📄 error-handler.ts      # Global error handler
│   │   ├── 📁 utils/                    # Logger, validators
│   │   │   ├── 📄 logger.ts             # Structured logging
│   │   │   ├── 📄 validators.ts         # Zod schemas
│   │   │   ├── 📄 helpers.ts            # Utility functions
│   │   │   ├── 📄 async-utils.ts        # ⭐ NEW: Promise utilities (retry, timeout)
│   │   │   └── 📄 date-utils.ts         # ⭐ NEW: Date/timezone helpers
│   │   ├── 📁 types/                    # TypeScript types
│   │   │   ├── 📄 api.types.ts          # API request/response types
│   │   │   ├── 📄 gateway.types.ts      # Gateway interface types
│   │   │   ├── 📄 marketplace.types.ts  # Marketplace item types
│   │   │   └── 📄 index.ts              # Re-export all types
│   │   ├── 📁 constants/                # ⭐ NEW: All constants centralized
│   │   │   ├── 📄 plan-limits.ts        # PLAN_LIMITS configuration
│   │   │   ├── 📄 error-codes.ts        # Error code constants
│   │   │   ├── 📄 audit-actions.ts      # Audit log action constants
│   │   │   └── 📄 index.ts              # Re-export all constants
│   │   └── 📁 decorators/               # ⭐ NEW: Custom decorators
│   │       ├── 📄 rate-limit.ts         # @RateLimit decorator
│   │       ├── 📄 audit-log.ts          # @AuditLog decorator
│   │       └── 📄 validate.ts           # @Validate decorator
│   │
│   ├── 📁 components/                   # React Components
│   │   ├── 📁 ui/                       # shadcn/ui components
│   │   ├── 📁 layout/
│   │   │   ├── 📄 theme-provider.tsx    # ⭐ Theme system provider
│   │   │   ├── 📄 header.tsx
│   │   │   ├── 📄 sidebar.tsx
│   │   │   └── 📄 dashboard-switcher.tsx # ⭐ NEW: Switch between dashboards (user/admin/dev)
│   │   ├── 📁 layouts/                  # ⭐ NEW: Role-based layouts
│   │   │   ├── 📄 DashboardLayout.tsx   # User dashboard layout
│   │   │   ├── 📄 AdminLayout.tsx       # Admin dashboard layout
│   │   │   ├── 📄 DeveloperLayout.tsx   # Developer portal layout
│   │   │   └── 📄 OrgAdminLayout.tsx    # Organization admin layout
│   │   ├── 📁 dashboard/
│   │   │   └── 📄 widget-grid.tsx       # ⭐ Dynamic widget rendering
│   │   ├── 📁 gateways/
│   │   ├── 📁 marketplace/
│   │   ├── 📁 services/
│   │   │   └── 📄 workflow-builder.tsx  # ⭐ Visual drag-drop builder
│   │   ├── 📁 workspace/                # ⭐ Workspace management UI
│   │   │   ├── 📄 workspace-status.tsx  # Container status display
│   │   │   ├── 📄 resource-usage.tsx    # RAM/CPU/Storage charts
│   │   │   └── 📄 workspace-controls.tsx # Start/Stop/Restart controls
│   │   ├── 📁 widgets/                  # Widget components
│   │   │   └── 📄 widget-renderer.tsx   # ⭐ Dynamic widget loading
│   │   ├── 📁 admin/                    # ⭐ NEW: Admin-specific components
│   │   │   ├── 📄 AdminNav.tsx          # Admin sidebar navigation
│   │   │   ├── 📄 StatsCard.tsx         # Metric display card
│   │   │   ├── 📄 UserTable.tsx         # User list table with actions
│   │   │   ├── 📄 UserDetail.tsx        # User detail panel
│   │   │   ├── 📄 BanUserDialog.tsx     # Ban user modal
│   │   │   ├── 📄 ImpersonateButton.tsx # Login as user button
│   │   │   ├── 📄 SubmissionReview.tsx  # Marketplace submission review
│   │   │   ├── 📄 FeatureFlagToggle.tsx # Toggle feature flag
│   │   │   ├── 📄 AnnouncementForm.tsx  # Create/edit announcement
│   │   │   ├── 📄 QueueMonitor.tsx      # BullMQ queue status display
│   │   │   ├── 📄 ErrorLogViewer.tsx    # Error log display
│   │   │   ├── 📄 RevenueChart.tsx      # Revenue visualization
│   │   │   ├── 📄 AuditLogTable.tsx     # Admin audit log display
│   │   │   └── 📄 WorkspaceManager.tsx  # Active workspaces control panel
│   │   └── 📁 developer/                # ⭐ NEW: Developer portal components
│   │       ├── 📄 DeveloperNav.tsx      # Developer sidebar navigation
│   │       ├── 📄 ItemCard.tsx          # Developer's item card
│   │       ├── 📄 SubmissionWizard.tsx  # Multi-step submission form
│   │       ├── 📄 EarningsChart.tsx     # Earnings visualization
│   │       ├── 📄 PayoutHistory.tsx     # Payout history table
│   │       ├── 📄 ReviewsList.tsx       # Customer reviews list
│   │       └── 📄 AnalyticsOverview.tsx # Item analytics dashboard
│   │
│   ├── 📁 hooks/
│   │   ├── 📄 use-auth.ts
│   │   ├── 📄 use-theme.ts              # ⭐ Theme hook
│   │   ├── 📄 use-widgets.ts
│   │   └── 📄 use-workspace.ts          # ⭐ Workspace status hook
│   │
│   ├── 📁 lib/
│   │   ├── 📄 utils.ts
│   │   ├── 📄 api-client.ts             # Frontend API client
│   │   └── 📄 constants.ts              # App constants
│   │
│   └── 📁 styles/
│       └── 📁 themes/                   # ⭐ Theme CSS files
│           ├── 📄 default.css
│           ├── 📄 dark.css
│           └── 📄 variables.css
│
├── 📁 workspace-runtime/                # ⭐ Code that runs INSIDE user containers
│   ├── 📄 Dockerfile                    # User workspace container image
│   ├── 📄 entrypoint.ts                 # Container startup script
│   ├── � ecosystem.config.js           # ⭐ PM2 process manager config
│   ├── 📁 core/
│   │   ├── 📄 process-manager.ts        # ⭐ PM2 wrapper for process lifecycle
│   │   ├── 📄 circuit-breaker.ts        # ⭐ Circuit breaker implementation
│   │   ├── 📄 health-reporter.ts        # Reports health to platform
│   │   └── 📄 resource-watcher.ts       # Monitors per-process resources
│   ├── 📁 gateway-workers/
│   │   ├── 📄 telegram-bot.worker.ts    # Long-running webhook/polling
│   │   └── 📄 telegram-user.worker.ts   # Long-running MTProto session
│   ├── 📁 plugin-runtime/
│   │   ├── 📄 sandbox.ts                # Sandboxed plugin execution
│   │   └── 📄 plugin-process.ts         # ⭐ Plugin process wrapper (isolated)
│   ├── 📁 service-executor/
│   │   ├── 📄 workflow.executor.ts      # Executes service workflows
│   │   └── 📄 step-circuit.ts           # ⭐ Per-step circuit breaker
│   └── 📁 scheduler/
│       └── 📄 cron.handler.ts           # Handles scheduled triggers
│
├── 📁 workers/                          # Platform workers (NOT user workspaces)
│   ├── 📄 index.ts
│   ├── 📁 workspace-manager/            # ⭐ Manages user containers
│   │   ├── 📄 container.worker.ts       # Start/stop containers
│   │   └── 📄 health-check.worker.ts    # Monitor container health
│   ├── 📁 job-router/
│   │   └── 📄 router.worker.ts          # Route jobs to correct workspace
│   ├── 📁 billing-worker/
│   │   └── 📄 usage.worker.ts           # Track and bill resource usage
│   └── 📁 scheduler/
│       └── 📄 cron.worker.ts            # Platform-level scheduled tasks
│
├── 📁 public/
│
└── 📁 tests/                            # ⭐ Test Structure
    # CONVENTION: Use *.test.ts for all test files (not *.spec.ts)
    # Example: auth.service.test.ts, user.controller.test.ts
    ├── 📁 unit/                         # Unit tests (mirror src/ structure)
    │   ├── 📁 modules/
    │   │   ├── 📁 auth/
    │   │   ├── 📁 gateways/
    │   │   ├── 📁 plugins/
    │   │   ├── 📁 services/
    │   │   ├── 📁 workspace/
    │   │   └── 📁 organization/
    │   └── 📁 shared/
    │       ├── 📁 crypto/
    │       ├── 📁 security/
    │       └── 📁 utils/
    ├── 📁 integration/                  # Integration tests
    │   ├── 📁 api/                      # API endpoint tests
    │   ├── 📁 workspace/                # Container lifecycle tests
    │   ├── 📁 billing/                  # Stripe integration tests
    │   └── 📁 organization/             # Org multi-tenant tests
    ├── 📁 e2e/                          # End-to-end tests (Playwright)
    │   ├── 📁 auth/                     # Auth flow tests
    │   ├── 📁 dashboard/                # Dashboard UI tests
    │   ├── 📁 marketplace/              # Marketplace flow tests
    │   ├── 📁 services/                 # Service builder tests
    │   └── 📁 org/                      # Organization flow tests
    ├── 📁 fixtures/                     # Test data and factories
    │   ├── 📄 users.ts
    │   ├── 📄 organizations.ts
    │   ├── 📄 gateways.ts
    │   └── 📄 plugins.ts
    └── 📁 mocks/                        # Mock services and APIs
        ├── 📄 stripe.mock.ts
        ├── 📄 telegram.mock.ts
        └── 📄 ai.mock.ts
```

---

## 📅 Development Phases

### ⭐ Extensibility Architecture (Built-in from Day 1)

> **Design Principle:** The platform should be extendable WITHOUT code changes where possible.

#### Dynamic Category System

```typescript
// Categories are stored in database, not code!
// Admin can add/edit/remove categories without deployment

model MarketplaceCategory {
  id              String           @id @default(cuid())
  slug            String           @unique   // "analytics", "hr-tools"
  name            String                     // "Analytics"
  description     String?
  icon            String?                    // Icon name or URL
  parentId        String?                    // For sub-categories
  itemTypes       MarketplaceType[]          // Which item types use this category
  sortOrder       Int              @default(0)
  isActive        Boolean          @default(true)
  metadata        Json?                      // Extra config per category
  
  parent          MarketplaceCategory?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children        MarketplaceCategory[] @relation("CategoryHierarchy")
  items           MarketplaceItem[]
  
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  
  @@index([parentId])
  @@index([isActive, sortOrder])
}

// Update MarketplaceItem to use relation instead of string
model MarketplaceItem {
  // ... existing fields ...
  categoryId      String           // FK to MarketplaceCategory
  category        MarketplaceCategory @relation(fields: [categoryId], references: [id])
}
```

#### Adding New Marketplace Item Types (Step-by-Step)

```
To add a NEW marketplace item type (e.g., "TEMPLATE", "CONNECTOR"):

1. DATABASE (Migration required):
   - Add to MarketplaceType enum in schema.prisma
   - Create UserTemplate model (copy UserPlugin structure)
   - Add userTemplates relation to User model
   - Add userTemplates relation to MarketplaceItem model
   - Run: npx prisma migrate dev --name add_template_type

2. BACKEND (Code changes):
   - Add to MARKETPLACE_TYPE_CONFIG in constants
   - Create src/modules/templates/template.service.ts
   - Create API routes in src/app/api/user/templates/
   - Add validation schemas in src/shared/schemas/

3. FRONTEND (Code changes):
   - Add page: src/app/(dashboard)/marketplace/templates/page.tsx
   - Add page: src/app/(dashboard)/my-items/templates/page.tsx
   - Add components in src/components/templates/
   - Update marketplace navigation

4. CONFIGURATION (No code, just config):
   - Add categories for templates in database
   - Add pricing config if different from other types
   - Update plan limits for templates

Estimated time: 4-6 hours for a skilled developer
```

#### Adding New Gateway Types (Step-by-Step)

```
To add a NEW gateway type (e.g., "TWITTER", "NOTION"):

1. DATABASE (Migration required):
   - Add to GatewayType enum in schema.prisma
   - Run: npx prisma migrate dev --name add_twitter_gateway

2. BACKEND (Code changes):
   - Create src/modules/gateways/providers/twitter.gateway.ts
   - Implement Gateway interface (connect, disconnect, execute, etc.)
   - Add credential schema in gateway-schemas.ts
   - Register in gateway.registry.ts
   - Add to GATEWAY_TYPE_CONFIG

3. WORKSPACE RUNTIME (Code changes):
   - Create workspace-runtime/gateway-workers/twitter.worker.ts
   - Add to PM2 process configuration

4. FRONTEND (Code changes):
   - Add credential form in components/gateways/TwitterGatewayForm.tsx
   - Add icon and display config

5. CONFIGURATION (No code):
   - Set rate limits in GATEWAY_TYPE_CONFIG
   - Set tier requirements
   - Add documentation page

Estimated time: 8-16 hours depending on API complexity
```

#### Feature Flags for Safe Rollouts

```typescript
// Feature flags allow gradual rollout of new types
const FEATURE_FLAGS = {
  // New marketplace types (rollout by percentage)
  'marketplace.templates': {
    enabled: false,
    rolloutPercentage: 0,       // 0-100% of users
    allowedTiers: ['ENTERPRISE'],
    allowedUserIds: ['admin-123'], // Beta testers
  },
  
  // New gateway types
  'gateway.twitter': {
    enabled: true,
    rolloutPercentage: 10,      // 10% of users see it
    allowedTiers: ['PRO', 'BUSINESS', 'ENTERPRISE'],
  },
  
  // New features
  'service.ai-builder': {
    enabled: false,
    rolloutPercentage: 0,
    allowedUserIds: ['beta-user-1', 'beta-user-2'],
  },
};
```

---

### Phase -1: Prerequisites ⏱️ Before Starting ⭐
> **Complete these BEFORE writing any code!**

#### Development Environment
- [ ] Node.js 20+ LTS installed
- [ ] pnpm installed (preferred) or npm 10+
- [ ] Docker Desktop installed and running
- [ ] Docker Compose v2 installed
- [ ] Git configured with SSH keys
- [ ] PostgreSQL client (psql) for debugging
- [ ] Redis CLI (redis-cli) for debugging
- [ ] VS Code with extensions:
  - [ ] ESLint
  - [ ] Prettier
  - [ ] Prisma
  - [ ] Tailwind CSS IntelliSense
  - [ ] GitLens
  - [ ] Thunder Client or REST Client
  - [ ] Docker extension

#### External Accounts (Test/Development)
- [ ] **Stripe** test account created
  - [ ] Test API keys obtained (sk_test_*, pk_test_*)
  - [ ] Webhook endpoint configured for local (use Stripe CLI)
  - [ ] Test products/prices created
  - [ ] Credit package prices created (5 packages) ⭐
- [ ] **Telegram** bot created via @BotFather
  - [ ] Bot token obtained
  - [ ] Test group/channel created
- [ ] **AI Provider** account (at least one):
  - [ ] OpenAI API key, OR
  - [ ] Google AI (Gemini) API key, OR
  - [ ] Anthropic (Claude) API key
- [ ] **Email Service** (for transactional emails)
  - [ ] Resend.com account (recommended), OR
  - [ ] SendGrid account, OR
  - [ ] AWS SES configured
- [ ] **Error Tracking**
  - [ ] Sentry account created
  - [ ] Sentry DSN obtained
- [ ] **Cloudflare** (CDN & Security) ⭐
  - [ ] Cloudflare account created
  - [ ] Domain added to Cloudflare
  - [ ] API token generated
  - [ ] R2 bucket created (for backups)
  - [ ] Turnstile site key obtained (CAPTCHA)
- [ ] **Load Testing Tool** ⭐
  - [ ] k6 installed locally, OR
  - [ ] Artillery installed locally
  - [ ] Test scripts folder created
  - [ ] Performance baseline targets documented

#### Domain & Infrastructure (Can be done during Phase 9-10)
- [ ] Domain name purchased
- [ ] SSL certificate strategy decided (Let's Encrypt/Cloudflare)
- [ ] Cloud provider account:
  - [ ] DigitalOcean (recommended for start), OR
  - [ ] AWS, OR
  - [ ] Google Cloud, OR
  - [ ] Hetzner (budget option)
- [ ] Container registry access (Docker Hub or private)

#### Database Hosting Decision ⭐ (REQUIRED)
- [ ] Choose PostgreSQL hosting:
  - [ ] **Supabase** (recommended for MVP: free tier, built-in auth backup)
  - [ ] **Neon** (serverless, auto-scaling, good for variable load)
  - [ ] **Railway** (simple, integrated with deploy)
  - [ ] **Self-hosted** (full control, requires maintenance)
- [ ] Document decision in `docs/ARCHITECTURE.md`
- [ ] Note: Redis always self-hosted in Docker for low latency

#### Plugin Sandboxing Strategy ⭐ (REQUIRED)
- [ ] **Decision: Use Docker Container Isolation** (NOT VM2/isolated-vm)
  - Plugins run inside user's isolated Docker workspace container
  - Container has cgroups limits (CPU, RAM, network)
  - No need for JavaScript sandbox libraries
  - Plugins cannot escape container boundary
  - If plugin crashes, only that user's workspace affected
- [ ] For extra security (Enterprise tier):
  - [ ] gVisor container runtime (optional)
  - [ ] Seccomp profiles
  - [ ] AppArmor/SELinux policies
- [ ] Document in `docs/SECURITY.md`

#### Documentation Preparation
- [ ] Create `docs/` folder structure:
  ```
  docs/
  ├── ARCHITECTURE.md
  ├── API.md
  ├── DEVELOPMENT.md
  ├── DEPLOYMENT.md
  └── TESTING.md
  ```
- [ ] Decide on documentation tool (Docusaurus, GitBook, or plain MD)

#### Legal & Compliance
- [ ] Privacy Policy draft prepared
- [ ] Terms of Service draft prepared
- [ ] GDPR compliance checklist reviewed
- [ ] Cookie consent requirements understood

#### Incident Management Preparation ⭐
- [ ] **Emergency Contacts**
  - [ ] On-call rotation defined (if team)
  - [ ] Emergency contact list documented
  - [ ] Escalation matrix created
- [ ] **Communication Channels**
  - [ ] Status page provider selected (Statuspage.io, Instatus)
  - [ ] Incident Slack/Discord channel created
  - [ ] Customer communication templates prepared
- [ ] **Runbook Templates**
  - [ ] Database outage runbook template
  - [ ] API outage runbook template
  - [ ] Payment system failure runbook
  - [ ] Security incident response checklist
  - [ ] Data breach notification procedure

---

### Phase 0: Project Setup ⏱️ Day 1-2
- [x] Clean repository
- [x] Create roadmap
- [ ] Initialize Next.js project with TypeScript
- [ ] Configure Tailwind CSS + shadcn/ui
- [ ] Set up ESLint + Prettier
- [ ] Configure project structure (folders)
- [ ] Set up Docker Compose (PostgreSQL + Redis + PgBouncer)
- [ ] Initialize Prisma with full schema
- [ ] Create README.md
- [ ] Set up theme system foundation
- [ ] Create .env.example with all required variables
- [ ] Set up global error handling
  - [ ] Custom error class hierarchy (AppError, ValidationError, AuthError, GatewayError)
  - [ ] API error response format standard (code, message, details, requestId)
  - [ ] Error serialization for logging (no sensitive data)
- [ ] Configure rate limiting middleware
- [ ] Set up health check endpoints (/api/health, /api/health/ready, /api/health/live)
- [ ] Configure Sentry for error tracking
- [ ] Set up BullMQ dashboard (bull-board)
- [ ] Initialize Redis caching layer
- [ ] **Project Scripts & Tooling** ⭐
  - [ ] package.json scripts (dev, build, start, test, lint, format, db:push, db:seed, db:studio)
  - [ ] Jest/Vitest testing configuration
  - [ ] Husky pre-commit hooks (lint, type-check)
  - [ ] lint-staged configuration
  - [ ] GitHub Actions CI workflow (.github/workflows/ci.yml)
  - [ ] GitHub Actions CD workflow (.github/workflows/deploy.yml)
- [ ] **CI/CD Security Scanning** ⭐ (CRITICAL)
  - [ ] **SAST (Static Application Security Testing)**
    - [ ] Semgrep rules configuration
    - [ ] CodeQL setup for TypeScript
    - [ ] npm audit in CI pipeline
    - [ ] Snyk integration for dependencies
  - [ ] **DAST (Dynamic Application Security Testing)**
    - [ ] OWASP ZAP baseline scan in staging
    - [ ] API security testing script
  - [ ] **Container Security**
    - [ ] Trivy scan for Docker images
    - [ ] Base image vulnerability check
    - [ ] Dockerfile best practices linting (hadolint)
  - [ ] **Secret Detection**
    - [ ] Gitleaks pre-commit hook
    - [ ] GitHub secret scanning enabled
    - [ ] .gitignore verification (no secrets committed)
  - [ ] **CI Pipeline Stages**
    - [ ] Stage 1: Lint + Type check (fast fail)
    - [ ] Stage 2: Unit tests
    - [ ] Stage 3: Security scans (parallel)
    - [ ] Stage 4: Build + Integration tests
    - [ ] Stage 5: Deploy to staging
- [ ] **API Versioning Implementation** ⭐
  - [ ] Create `/api/v1/` folder structure
  - [ ] Version routing middleware
  - [ ] API version header support (`X-API-Version`)
  - [ ] Deprecation warning middleware
  - [ ] API changelog template
- [ ] **TypeScript Configuration** ⭐
  - [ ] Strict mode enabled
  - [ ] Path aliases (@/, @components/, @lib/, @modules/, etc.)
  - [ ] Separate tsconfig for workspace-runtime
- [ ] **Logging Standards** ⭐
  - [ ] Structured logging format (JSON with correlation IDs)
  - [ ] Log levels definition (error, warn, info, debug, trace)
  - [ ] Sensitive data scrubbing in logs (passwords, tokens, API keys)
  - [ ] Request/response logging middleware (with body truncation)
  - [ ] Log rotation configuration
- [ ] **Feature Flag Foundation** ⭐
  - [ ] Feature flag service interface
  - [ ] Environment-based feature flags for local dev
  - [ ] Feature flag constants file
- [ ] **Security Foundation** ⭐ (NEW)
  - [ ] Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
  - [ ] CORS configuration per environment
  - [ ] CSRF protection middleware (double-submit cookie)
  - [ ] Input sanitization utility (DOMPurify for user content)
  - [ ] SQL injection prevention verification (Prisma handles, but verify raw queries)
  - [ ] Security constants file (headers, CORS origins, exempt routes)
- [ ] **Extensibility Foundation** ⭐ (NEW)
  - [ ] MarketplaceCategory database model (dynamic categories)
  - [ ] MARKETPLACE_TYPE_CONFIG constants file
  - [ ] GATEWAY_TYPE_CONFIG constants file
  - [ ] Registry pattern for gateways (gateway.registry.ts)
  - [ ] Registry pattern for marketplace item types
  - [ ] Plugin/Gateway interface contracts (TypeScript interfaces)
- [ ] **Redis Isolation** (per-user namespacing + limits) ⭐
  - [ ] Per-user key prefix (`user:{userId}:*`)
  - [ ] Max keys per user enforcement
  - [ ] Redis ops rate limiting per user
- [ ] **BullMQ Queue Limits** ⭐
  - [ ] Max jobs per user in queue
  - [ ] Priority queues by subscription tier
  - [ ] Job size limits
- [ ] Create AuditLog service foundation
- [ ] Set up structured logging with sanitization
- [ ] **Database Row Limits** ⭐
  - [ ] Per-user row count limits
  - [ ] JSONB field size limits
  - [ ] Automatic cleanup cron jobs
- [ ] **Development Seed Data** ⭐
  - [ ] Seed script with test users (free, starter, pro, business, enterprise)
  - [ ] Seed script with sample gateways (mock credentials)
  - [ ] Seed script with sample plugins, themes, widgets
  - [ ] Seed script with sample services/workflows
  - [ ] Seed script with sample organization + departments
  - [ ] Seed script with credit packages (5 tiers) ⭐
  - [ ] Seed script with credit balances for test users ⭐
  - [ ] Development fixtures for testing
- [ ] **Local Development Documentation** ⭐
  - [ ] README.md with step-by-step local setup guide
  - [ ] Makefile or npm scripts for common tasks
  - [ ] Environment variable validation on startup
  - [ ] Docker Compose override for local development
- [ ] **Editor Configuration** ⭐
  - [ ] .editorconfig for consistent formatting across editors
  - [ ] VS Code workspace settings (.vscode/settings.json)
  - [ ] Recommended extensions list (.vscode/extensions.json)
- [ ] **PgBouncer Configuration** ⭐
  - [ ] Pool mode: `transaction` for stateless queries
  - [ ] max_client_conn: 1000
  - [ ] default_pool_size: 20 per service
  - [ ] reserve_pool_size: 5 for burst traffic
  - [ ] Connection pool metrics monitoring
- [ ] **Database Indexing Strategy** ⭐
  - [ ] Document required indexes for common queries
  - [ ] Composite indexes for multi-column queries (e.g., `[userId, deletedAt]`)
  - [ ] Partial indexes for soft-deleted records: `WHERE deletedAt IS NULL`
  - [ ] GIN indexes for JSONB fields that are queried frequently
  - [ ] Index analysis query for identifying missing indexes
- [ ] **Pagination Strategy** ⭐
  - [ ] Cursor-based pagination for large datasets (marketplace, logs)
  - [ ] Pre-computed counts cached in Redis for list endpoints
  - [ ] Offset pagination only for admin/small datasets
  - [ ] Pagination helper utility with consistent response format
- [ ] **CDN Configuration** ⭐
  - [ ] CDN setup for static assets (images, fonts, JS/CSS)
  - [ ] Plugin/theme/widget assets served via CDN
  - [ ] Marketplace screenshots and icons via CDN
  - [ ] Cache headers configuration (immutable for hashed assets)
  - [ ] CDN invalidation strategy for updates
- [ ] **Database Migration Strategy** ⭐
  - [ ] Zero-downtime migration approach document
  - [ ] Rollback procedures for each migration
  - [ ] Data backfill scripts template
  - [ ] Migration testing checklist
- [ ] **API Versioning Strategy** ⭐
  - [ ] Version in URL (`/api/v1/`) approach
  - [ ] API version header support (`X-API-Version`)
  - [ ] Deprecation policy document (6-month warning)
  - [ ] Breaking change communication template
- [ ] **API Request Safeguards** ⭐
  - [ ] Request body size limit (1MB default, 10MB for uploads)
  - [ ] Request timeout (30 seconds default)
  - [ ] Slow request logging (>3 seconds)
  - [ ] Request ID tracking (X-Request-ID header)
  - [ ] Response compression (gzip)
- [ ] **Database Safeguards** ⭐
  - [ ] Query timeout (10 seconds default)
  - [ ] Connection pool limits (max 20 per service)
  - [ ] Connection pool exhaustion alerts
  - [ ] Deadlock detection and logging
  - [ ] Long-running query alerts (>5 seconds)
  - [ ] Transaction timeout (30 seconds)
- [ ] **Redis Safeguards** ⭐
  - [ ] Memory eviction policy (allkeys-lru)
  - [ ] Max memory limit configuration
  - [ ] Connection timeout (5 seconds)
  - [ ] Retry with backoff on connection failure
- [ ] **File Upload Safeguards** ⭐
  - [ ] Max file size (10MB images, 50MB other)
  - [ ] Allowed file types whitelist
  - [ ] Virus scanning integration (ClamAV)
  - [ ] Storage quota per user
  - [ ] Secure file naming (no path traversal)

### Phase 1: Authentication & Core UI ⏱️ Days 3-5
- [ ] Implement NextAuth.js authentication
  - [ ] Email/password login
  - [ ] OAuth (Google, GitHub)
  - [ ] Session management
  - [ ] Email verification flow
  - [ ] Password reset flow
- [ ] Implement RBAC (Role-Based Access Control)
  - [ ] Define roles (OWNER, ADMIN, MEMBER - for future teams)
  - [ ] Permission constants and checking utilities
  - [ ] Role-based route protection
- [ ] API Key System
  - [ ] API key generation with scopes
  - [ ] API key validation middleware
  - [ ] Key rotation support with grace period
  - [ ] API keys management UI
- [ ] Create base layouts
  - [ ] Public layout (landing, auth pages)
  - [ ] Dashboard layout (sidebar, header)
  - [ ] Theme provider with CSS variables
- [ ] Build core pages
  - [ ] Landing page
  - [ ] Login/Register pages
  - [ ] Dashboard home (widget-ready)
- [ ] User settings page
  - [ ] Profile settings
  - [ ] Appearance settings (theme selection)
  - [ ] Security settings (password change, 2FA prep)
  - [ ] API keys management
  - [ ] Active sessions management (view/revoke) ⭐
- [ ] **Session Security** ⭐
  - [ ] Refresh token rotation strategy
  - [ ] Session invalidation on password change
  - [ ] Concurrent session limits per plan (Free: 2, Pro: 5, Enterprise: unlimited)
  - [ ] Account lockout after 5 failed attempts (15 min)
  - [ ] Suspicious login detection (new device/location alert)
  - [ ] "Log out all devices" functionality
- [ ] Notification system foundation
  - [ ] Notification model and service
  - [ ] WebSocket connection for real-time
  - [ ] Notification bell component
  - [ ] Notification preferences (email, in-app, push prep) ⭐

### Phase 2: Gateway System ⏱️ Days 6-9
- [ ] Gateway architecture
  - [ ] Base gateway interface
  - [ ] Gateway registry
  - [ ] Gateway lifecycle management
  - [ ] Credential encryption (AES-256-GCM)
  - [ ] Gateway health monitoring service
  - [ ] Webhook signature verification
  - [ ] **Circuit Breaker Interface** (abstract, implemented in Phase 7) ⭐
    - [ ] ICircuitBreaker interface definition
    - [ ] Circuit states enum (CLOSED, OPEN, HALF_OPEN)
    - [ ] Failure threshold configuration
    - [ ] Success threshold configuration
  - [ ] **Gateway Health Reporting Interface** ⭐
    - [ ] IHealthReporter interface
    - [ ] Health status enum (HEALTHY, DEGRADED, UNHEALTHY)
    - [ ] Health check interval configuration
    - [ ] Platform health aggregation hook
  - [ ] **Gateway Reconnection Hooks** ⭐
    - [ ] onDisconnect callback
    - [ ] onReconnectAttempt callback
    - [ ] onReconnectSuccess callback
    - [ ] onReconnectFailed callback
    - [ ] Exponential backoff configuration
- [ ] Telegram Bot Gateway (TELEGRAM_BOT)
  - [ ] Token configuration UI
  - [ ] Connection testing
  - [ ] Webhook setup with signature verification
  - [ ] Event handling
  - [ ] Rate limiting per bot
  - [ ] **Webhook vs Long-polling decision** ⭐
    - [ ] Auto-detect based on environment (webhook for prod, polling for dev)
    - [ ] Fallback from webhook to polling on failure
- [ ] Telegram User Gateway (TELEGRAM_USER) ⚠️
  - [ ] **ToS Warning Modal** (user must acknowledge risks)
  - [ ] Phone/API credentials UI
  - [ ] Session management (MTProto)
  - [ ] Session persistence and rotation
  - [ ] **Session storage strategy** ⭐
    - [ ] Encrypted session string in database
    - [ ] Session file backup to S3/MinIO
    - [ ] Session migration on container restart
  - [ ] 2FA handling
  - [ ] Message reading/sending
  - [ ] Aggressive rate limiting (prevent bans)
  - [ ] Enterprise-tier recommendation notice
- [ ] AI Gateway (AI)
  - [ ] Provider selection (OpenAI, Gemini, Claude, Mistral, Ollama)
  - [ ] API key configuration
  - [ ] Model selection per provider
  - [ ] Chat/completion methods
  - [ ] Usage tracking with token counting
  - [ ] Cost estimation display
  - [ ] **Streaming support** ⭐
    - [ ] SSE (Server-Sent Events) for chat streaming
    - [ ] Token-by-token streaming to frontend
    - [ ] Stream cancellation support
  - [ ] **Pre-call token estimation** ⭐
    - [ ] Estimate tokens before API call
    - [ ] Warn user if cost exceeds threshold
    - [ ] Hard limit enforcement per plan
- [ ] **Gateway Bridge Architecture** ⭐
  - [ ] Inter-gateway messaging
  - [ ] Event routing
  - [ ] Data transformation
  - [ ] Bridge routing methods
    - [ ] `bridge.route(fromGateway, toGateway, transformer)`
    - [ ] `bridge.broadcast(event, data)` - All gateways receive
    - [ ] `bridge.pipe(gateway1, gateway2, ...)` - Chain data flow
  - [ ] Bridge use case implementations
    - [ ] Content flow: TELEGRAM_USER → AI → TELEGRAM_BOT
    - [ ] Auto-reply: TELEGRAM_BOT → AI → TELEGRAM_BOT
    - [ ] Analytics: TELEGRAM_BOT events → Widget update
- [ ] **Gateway Credential Management** ⭐
  - [ ] Credential rotation without disconnection
  - [ ] Credential expiration warnings
  - [ ] Bulk credential update (for org admins)
  - [ ] Credential health check (validate before save)
- [ ] Gateway monitoring
  - [ ] Health status dashboard
  - [ ] Connection status WebSocket updates
  - [ ] Error alerting
- [ ] **Gateway Memory & Stability** ⭐
  - [ ] Gateway worker memory monitoring (restart if >80% of limit)
  - [ ] Periodic connection refresh (every 24h) for long-running gateways
  - [ ] Event listener cleanup on disconnect
  - [ ] Buffer accumulation prevention (max message queue size)
- [ ] **Webhook Endpoint Security** ⭐
  - [ ] Webhook endpoint rate limiting (separate from user rate limit)
  - [ ] Webhook payload size limit (1MB max)
  - [ ] Webhook timeout (10s max processing time)
  - [ ] Dead-letter queue for failed webhook deliveries
  - [ ] Outbound webhook retry with exponential backoff
- [ ] **Gateway Monitoring Dashboard (User)** ⭐
  - [ ] Gateway uptime history (24h, 7d, 30d)
  - [ ] Connection/disconnection timeline
  - [ ] Error rate per gateway
  - [ ] Messages sent/received counters
  - [ ] Last activity timestamp
  - [ ] Gateway health score (0-100)

### Phase 3: Plugin System ⏱️ Days 10-13
- [ ] Plugin architecture
  - [ ] Plugin interface/contract
  - [ ] Plugin lifecycle (install, enable, disable, uninstall)
  - [ ] Plugin configuration schema (Zod validation)
  - [ ] Gateway requirements declaration
  - [ ] Plugin versioning system
- [ ] Plugin runtime (Security Critical)
  - [ ] **Sandboxed execution using isolated-vm**
  - [ ] Memory limit enforcement (128MB)
  - [ ] CPU time limit (1 second)
  - [ ] Execution timeout (5 seconds)
  - [ ] Allowed API whitelist only
  - [ ] Gateway access API (controlled)
  - [ ] State management (size-limited)
  - [ ] Event subscriptions
- [ ] Plugin security
  - [ ] Input sanitization
  - [ ] Output validation
  - [ ] Resource usage tracking
  - [ ] Malicious code detection basics
- [ ] **Plugin Packaging for Containers** ⭐
  - [ ] Plugin bundle format (tarball with manifest.json)
  - [ ] Plugin dependency declaration (package.json subset)
  - [ ] Plugin process interface (IPC with PM2 wrapper)
  - [ ] Plugin entry point specification
  - [ ] Plugin asset bundling (CSS, images)
  - [ ] Plugin version compatibility matrix
  - [ ] Plugin signature verification (future: signed plugins)
- [ ] Plugin UI
  - [ ] Installation flow
  - [ ] Configuration UI (dynamic forms from JSON Schema)
  - [ ] Status/logs viewer
  - [ ] Resource usage display
- [ ] **Plugin Lifecycle Management** ⭐
  - [ ] Plugin dependency resolution (plugin A requires plugin B)
  - [ ] Plugin conflict detection (two plugins on same event)
  - [ ] Plugin upgrade/migration path (v1 → v2 config migration)
  - [ ] Plugin rollback mechanism (keep previous version)
  - [ ] Plugin changelog display
  - [ ] Breaking change warnings
- [ ] Built-in plugins
  - [ ] Analytics Plugin (channel/group analysis)
  - [ ] Welcome Plugin (new member messages)
  - [ ] HR Bonus Plugin (employee tracking)

### Phase 4: Theme & Widget System ⏱️ Days 14-16
- [ ] Theme System
  - [ ] Theme definition schema (JSON)
  - [ ] CSS variable injection
  - [ ] Theme switching without reload
  - [ ] User theme persistence
  - [ ] Built-in themes (Default, Dark, System)
  - [ ] **Theme Preview** ⭐
    - [ ] Live preview before applying theme
    - [ ] Preview panel with sample components
    - [ ] "Try before you buy" for marketplace themes
    - [ ] Reset to default option
- [ ] Widget System
  - [ ] Widget definition schema
  - [ ] Widget sizes (sm, md, lg, xl)
  - [ ] Widget data sources
  - [ ] Widget refresh intervals
  - [ ] Dynamic widget rendering
  - [ ] Dashboard grid layout
  - [ ] **Widget Security** ⭐
    - [ ] Widget data source permission model (what data can widget access)
    - [ ] Widget sandboxing (no access to other widgets' data)
    - [ ] Widget API rate limiting
    - [ ] Sensitive data masking in widgets (e.g., API keys shown as ****)
  - [ ] **Widget Permissions** ⭐
    - [ ] Read-only vs interactive widgets
    - [ ] Widget gateway access control (which gateways can widget query)
    - [ ] Admin-only widgets (for org dashboards)
    - [ ] Widget data freshness indicator (last updated timestamp)
  - [ ] Built-in widgets
    - [ ] Stats Card widget
    - [ ] Activity Chart widget
    - [ ] Gateway Status widget
    - [ ] Quick Actions widget ⭐
    - [ ] Recent Activity feed widget ⭐

### Phase 5: Service (Workflow) System ⏱️ Days 17-21
- [ ] Service Architecture
  - [ ] Service definition schema
  - [ ] Step types (gateway, transform, condition, loop, delay)
  - [ ] Trigger types (schedule, event, manual, webhook)
  - [ ] Variable templating ({{config.x}}, {{steps.y.output}})
- [ ] Workflow Engine
  - [ ] Step executor
  - [ ] Data transformer between steps
  - [ ] Error handling & retry logic with exponential backoff
  - [ ] Service state persistence
  - [ ] Execution logging
- [ ] Workflow Safeguards (Critical)
  - [ ] Max steps limit (50 per workflow)
  - [ ] Execution timeout (5 minutes max)
  - [ ] Loop iteration limit (1000 max)
  - [ ] Variable size limit (1MB per variable)
  - [ ] Concurrent execution limit (10 per user)
  - [ ] Dead-letter queue for failed jobs
  - [ ] Execution cost estimation
- [ ] **Execution State Persistence** ⭐
  - [ ] Save step progress to database (not just in-memory)
  - [ ] Execution checkpoint after each step completion
  - [ ] Resume from last successful step after container restart
  - [ ] Step result serialization/deserialization
  - [ ] Execution state cleanup (after completion/failure)
  - [ ] Orphaned execution detection and recovery
- [ ] **Execution Safety** ⭐
  - [ ] Idempotency keys for service step execution (prevent duplicate API calls on retry)
  - [ ] Step-level idempotency token generation
  - [ ] Idempotent external API call wrapper
  - [ ] Duplicate execution detection within time window
- [ ] **Service Execution Cost** ⭐
  - [ ] Cost estimation BEFORE running service (show estimated AI tokens, API calls)
  - [ ] Cost confirmation for expensive operations
  - [ ] Real-time cost tracking during execution
  - [ ] Cost limit enforcement (stop if exceeds user-defined threshold)
- [ ] **Queue Backpressure Handling** ⭐
  - [ ] Queue depth monitoring and alerts
  - [ ] Rate limiting job submission per user
  - [ ] Priority queue starvation prevention
  - [ ] Graceful degradation (reject new jobs at threshold)
  - [ ] Backpressure metrics dashboard
- [ ] **Service Concurrency Control** ⭐
  - [ ] Queue-level concurrency (user A's jobs don't block user B)
  - [ ] Priority decay (prevent one user from monopolizing queue)
  - [ ] Fair scheduling across users with weighted priorities
  - [ ] Per-user concurrent execution limit enforcement
- [ ] Service Worker
  - [ ] Background workflow execution
  - [ ] Scheduled trigger processing (cron)
  - [ ] Event-based triggers
  - [ ] Graceful shutdown handling
- [ ] **Workflow Execution Control** ⭐
  - [ ] Per-step timeout (not just workflow total)
  - [ ] Partial execution recovery (resume from last successful step)
  - [ ] Manual intervention hooks (pause and wait for approval)
  - [ ] Service versioning (create new version on edit, keep history)
  - [ ] Execution cancellation API
  - [ ] Dry-run mode (validate without executing)
  - [ ] Step-level retry with different backoff per step type
- [ ] Visual Service Builder UI
  - [ ] Drag-and-drop step nodes
  - [ ] Connection lines between steps
  - [ ] Step configuration panel
  - [ ] Test execution mode (step-by-step debugging)
  - [ ] Execution logs viewer
  - [ ] Cost/resource preview
  - [ ] Undo/redo support ⭐
  - [ ] Service templates (start from template) ⭐
  - [ ] Import/export service as JSON ⭐
- [ ] Built-in services
  - [ ] Content Maker service
  - [ ] Auto-Poster service
  - [ ] Lead Generator service
- [ ] **Service Monitoring Dashboard (User)** ⭐
  - [ ] Service success/failure rate
  - [ ] Average execution time per service
  - [ ] Execution history with filtering
  - [ ] Step-by-step execution breakdown
  - [ ] Resource consumption per execution
  - [ ] Cost per execution estimate
  - [ ] Service health score (reliability %)

### Phase 6: Marketplace ⏱️ Days 22-24
- [ ] Unified Marketplace UI
  - [ ] Item type tabs (Plugins, Themes, Widgets, Services)
  - [ ] Category filtering
  - [ ] Search functionality
  - [ ] Item detail pages
  - [ ] Screenshots gallery
  - [ ] Reviews & ratings
- [ ] Item management
  - [ ] Install/uninstall flow
  - [ ] Enable/disable toggle
  - [ ] Configuration modal
  - [ ] Update notifications
- [ ] User's items page
  - [ ] Installed plugins
  - [ ] Active theme
  - [ ] Dashboard widgets
  - [ ] Running services
- [ ] **Developer Submission Portal** ⭐
  - [ ] Developer registration/verification
  - [ ] Item submission form:
    - [ ] Upload item package (zip/tarball)
    - [ ] Manifest validation (manifest.json)
    - [ ] Screenshot upload (min 3, max 10)
    - [ ] Demo video link (optional)
    - [ ] Documentation/README
    - [ ] Pricing selection (free, one-time, subscription)
  - [ ] Submission guidelines documentation
  - [ ] Sandbox testing environment for developers
  - [ ] Item preview before submission
- [ ] **Review & Approval Process** ⭐
  - [ ] Automated checks:
    - [ ] Malware/security scan
    - [ ] Manifest schema validation
    - [ ] Dependency vulnerability check
    - [ ] Code quality basics (linting)
  - [ ] Manual review queue (admin):
    - [ ] Review dashboard for admins
    - [ ] Approve/reject with reason
    - [ ] Request changes feedback
    - [ ] Review SLA (48-72 hours)
  - [ ] Appeal process for rejections
  - [ ] Fast-track for verified developers
- [ ] **Marketplace Item Versioning** ⭐
  - [ ] Semantic versioning enforcement (1.0.0)
  - [ ] Version history display
  - [ ] Changelog per version (required)
  - [ ] Auto-update vs manual update user preference
  - [ ] Rollback to previous version
  - [ ] Breaking change warnings
  - [ ] Version compatibility matrix (platform version)
- [ ] **Revenue Sharing & Payouts** ⭐
  - [ ] Revenue split configuration (e.g., 70% developer, 30% platform)
  - [ ] Developer earnings dashboard:
    - [ ] Sales count
    - [ ] Revenue earned
    - [ ] Pending payouts
    - [ ] Payout history
  - [ ] Payout methods:
    - [ ] Stripe Connect integration
    - [ ] PayPal (optional)
    - [ ] Bank transfer (Enterprise developers)
  - [ ] Payout schedule (monthly, $50 minimum)
  - [ ] Tax documentation (W-9, W-8BEN)
  - [ ] Refund handling (deduct from developer balance)
- [ ] **Marketplace Analytics (for Developers)** ⭐
  - [ ] Install/uninstall trends
  - [ ] Rating trends over time
  - [ ] Geographic distribution of users
  - [ ] Conversion rate (views → installs)
  - [ ] Revenue per item
  - [ ] User feedback summary

### Phase 7: Workspace Isolation System ⏱️ Days 25-28
- [ ] Workspace Architecture
  - [ ] Design workspace container image (Dockerfile)
  - [ ] Define container resource limits (RAM, CPU, Storage)
  - [ ] Create workspace orchestrator service
  - [ ] Implement container lifecycle management
- [ ] **Intra-Workspace Isolation (Bulkhead Pattern)** ⭐
  - [ ] PM2 Process Manager inside containers
  - [ ] Per-plugin process isolation (separate PM2 processes)
  - [ ] Per-gateway process isolation
  - [ ] Per-process memory limits (auto-restart on exceed)
  - [ ] Crash isolation (one plugin crash ≠ all plugins crash)
  - [ ] Process health monitoring
- [ ] **Circuit Breaker Implementation** ⭐
  - [ ] Gateway circuit breaker (fail fast on connection issues)
  - [ ] External API circuit breaker (AI, webhooks)
  - [ ] Database circuit breaker
  - [ ] Circuit breaker state persistence (Redis)
  - [ ] Circuit breaker UI indicators (open/closed/half-open)
- [ ] Container Management
  - [ ] Docker integration for local/dev
  - [ ] Container start/stop/restart operations
  - [ ] Health check monitoring
  - [ ] Auto-restart on failure
  - [ ] Graceful shutdown handling
- [ ] **Workspace Runtime CI/CD** ⭐
  - [ ] Workspace image build pipeline (GitHub Actions)
  - [ ] Workspace runtime dependency lockfile
  - [ ] Automated image testing before publish
  - [ ] Image vulnerability scanning (Trivy/Snyk)
  - [ ] Multi-arch builds (amd64, arm64)
- [ ] **Container Observability** ⭐
  - [ ] Container log shipping to central logging (Loki/ELK)
  - [ ] Container metrics export (Prometheus format)
  - [ ] Container event tracking (start, stop, OOM, restart)
  - [ ] Resource usage time-series storage
- [ ] **Container Registry Management** ⭐
  - [ ] Private registry authentication
  - [ ] Image pull secrets management
  - [ ] Image garbage collection policy
  - [ ] Registry mirror for faster pulls
- [ ] **Container Image Versioning** ⭐
  - [ ] Semantic versioning for workspace-runtime image (v1.0.0)
  - [ ] Image registry setup (Docker Hub or private registry)
  - [ ] Image tagging strategy (latest, stable, version)
  - [ ] Image promotion pipeline (dev → staging → prod)
  - [ ] Rollback to previous image version
  - [ ] Image changelog documentation
  - [ ] Breaking change alerts for workspace image updates
- [ ] **Kubernetes Resource Strategy** ⭐
  - [ ] Resource requests vs limits ratio (0.5 - 0.8)
  - [ ] Overcommit ratio per node configuration
  - [ ] Node affinity rules for workspace pods
  - [ ] Pod disruption budgets for workspaces
  - [ ] Vertical Pod Autoscaler (VPA) consideration
  - [ ] Resource quota per namespace
- [ ] Resource Monitoring
  - [ ] RAM usage tracking (real-time)
  - [ ] CPU usage tracking (real-time)
  - [ ] Storage usage tracking
  - [ ] Real-time metrics via WebSocket
  - [ ] Usage history logging (for billing)
- [ ] Workspace UI
  - [ ] Workspace status dashboard widget
  - [ ] Resource usage charts (RAM, CPU, Storage)
  - [ ] Start/Stop/Restart controls
  - [ ] Resource limit warnings (80%, 90%, 100%)
  - [ ] Upgrade prompts when near limits
- [ ] **User Monitoring Dashboard** ⭐
  - [ ] Plugin performance metrics:
    - [ ] Execution count per plugin
    - [ ] Average response time
    - [ ] Error rate per plugin
    - [ ] Resource usage per plugin
  - [ ] Activity timeline:
    - [ ] Recent gateway events
    - [ ] Plugin executions
    - [ ] Service runs
    - [ ] System events (container start/stop/sleep)
  - [ ] Usage predictions:
    - [ ] Projected resource usage (end of billing period)
    - [ ] "At current rate, you'll hit limit in X days"
    - [ ] Trend analysis (increasing/decreasing usage)
- [ ] Job Routing
  - [ ] Route gateway jobs to user's workspace
  - [ ] Route plugin executions to workspace
  - [ ] Route service runs to workspace
  - [ ] Handle workspace offline gracefully (queue jobs)
- [ ] Plan Enforcement
  - [ ] Apply resource limits based on subscription
  - [ ] Enforce execution count limits
  - [ ] Overage tracking and billing hooks
  - [ ] Plan upgrade flow
- [ ] **Lazy Container Start (Cost Optimization)** ⭐
  - [ ] Don't start container on user signup (start on first use)
  - [ ] Container startup trigger conditions:
    - [ ] User enables a gateway
    - [ ] User installs a plugin that requires runtime
    - [ ] User creates/enables a service
  - [ ] "Start Workspace" button for manual trigger
  - [ ] Startup time optimization (<10 seconds target)
  - [ ] Prewarmed container pool for instant start (paid tiers)
  - [ ] Prewarmed pool size configuration (2-5 containers)
- [ ] **Container Race Condition Prevention** ⭐
  - [ ] Distributed lock for workspace startup (Redis SETNX)
  - [ ] Prevent duplicate containers from multiple simultaneous requests
  - [ ] Lock timeout with automatic release (30s)
  - [ ] Lock acquisition retry with backoff
- [ ] **Thundering Herd Prevention** ⭐
  - [ ] Staggered workspace wake (add random 0-5s jitter)
  - [ ] Rate-limited batch wake on platform restart
  - [ ] Progressive startup during peak load
- [ ] **Container Sleep/Hibernate (Cost Optimization)** ⭐
  - [ ] Auto-sleep after inactivity period:
    - [ ] Free tier: 15 minutes
    - [ ] Starter tier: 30 minutes
    - [ ] Pro+ tiers: 1 hour (configurable)
  - [ ] Activity detection (gateway events, plugin runs, API calls)
  - [ ] Sleep state persistence (save running processes state)
  - [ ] Wake-on-demand (auto-start when job arrives)
  - [ ] Sleep/wake metrics tracking
  - [ ] "Keep Alive" option for paid tiers (disable auto-sleep)
- [ ] **Resource Usage Alerts** ⭐
  - [ ] Threshold-based alerts:
    - [ ] 70% usage: Info notification
    - [ ] 85% usage: Warning notification + email
    - [ ] 95% usage: Critical alert + dashboard banner
    - [ ] 100% usage: Throttle notification + upgrade prompt
  - [ ] Alert channels: In-app, email, webhook (pro+)
  - [ ] Daily/weekly resource usage summary emails
  - [ ] Projected overage warnings (based on usage trend)
  - [ ] Per-resource alerts (RAM, CPU, Storage, Executions)
- [ ] **Zero-Downtime Upgrades (All Tiers)** ⭐
  - [ ] Hot swap implementation for all users
    - [ ] Spin up new container with new limits
    - [ ] Sync state from old container
    - [ ] Switch job routing to new container
    - [ ] Graceful shutdown of old container
  - [ ] Job queue preservation during upgrades
  - [ ] Upgrade progress indicator in UI
  - [ ] Rollback mechanism if upgrade fails
- [ ] **Graceful Shutdown Handling** ⭐
  - [ ] SIGTERM handler for all workers (finish current job, don't accept new)
  - [ ] Draining period before shutdown (30s default)
  - [ ] Job timeout extension awareness (don't shutdown mid-long-job)
  - [ ] Pending job migration to new container
  - [ ] Gateway disconnection with reconnect flag

### Phase 8a: Core Billing Infrastructure ⏱️ Days 29-30 ⭐
- [ ] Stripe integration foundation
  - [ ] Customer creation on signup
  - [ ] Stripe webhook endpoint
  - [ ] Webhook signature verification
  - [ ] Idempotent webhook handling
  - [ ] Billing error handling
- [ ] Usage tracking foundation
  - [ ] UsageRecord model and service
  - [ ] Usage aggregation jobs
  - [ ] Usage metering API
- [ ] Invoice generation
  - [ ] Invoice model
  - [ ] PDF invoice generation
  - [ ] Invoice email notifications
- [ ] **Cost Dashboard (Admin & User)** ⭐
  - [ ] Real-time cost tracking per user
  - [ ] Cost breakdown by resource type:
    - [ ] Compute (RAM-hours, CPU-hours)
    - [ ] Storage (GB-days)
    - [ ] Executions (plugin runs, service runs)
    - [ ] API calls
    - [ ] AI tokens
  - [ ] Cost trends (daily, weekly, monthly graphs)
  - [ ] Cost comparison (this month vs last month)
  - [ ] Cost projections (estimated month-end bill)
  - [ ] Per-user profitability metrics (admin only)
  - [ ] High-cost user alerts (admin only)
  - [ ] Cost anomaly detection (sudden spikes)
- [ ] **Platform Admin Dashboard** ⭐
  - [ ] Fleet-wide analytics:
    - [ ] Total active users (DAU, WAU, MAU)
    - [ ] Total workspaces running
    - [ ] Total resource consumption (cluster-wide)
    - [ ] API request volume
  - [ ] Revenue dashboard:
    - [ ] MRR (Monthly Recurring Revenue)
    - [ ] ARR (Annual Recurring Revenue)
    - [ ] Revenue by plan tier
    - [ ] Revenue trend graphs
  - [ ] User acquisition funnel:
    - [ ] Signups → Activated → Paid conversion
    - [ ] Funnel drop-off points
    - [ ] Cohort analysis
  - [ ] Churn indicators:
    - [ ] Users with declining activity
    - [ ] Users near plan limits (upgrade candidates)
    - [ ] Users with payment failures
  - [ ] System capacity planning:
    - [ ] Node utilization
    - [ ] Database connection pool usage
    - [ ] Redis memory usage
    - [ ] Queue depth trends
    - [ ] Capacity headroom alerts

### Phase 8b: Individual Plans ⏱️ Days 31-32 ⭐
- [ ] Pricing tiers implementation
  - [ ] Free tier (512MB, 0.5 CPU)
  - [ ] Starter tier ($9/mo - 1GB, 1 CPU)
  - [ ] Pro tier ($29/mo - 2GB, 2 CPU)
  - [ ] Business tier ($79/mo - 4GB, 4 CPU)
  - [ ] Enterprise tier ($199/mo - 8GB+, custom)
- [ ] Resource Add-ons
  - [ ] Extra RAM purchase (+$5/GB)
  - [ ] Extra CPU purchase (+$10/vCPU)
  - [ ] Extra storage purchase (+$0.50/GB)
  - [ ] Overage billing calculation
- [ ] Marketplace item pricing
  - [ ] Free items
  - [ ] One-time purchase
  - [ ] Monthly subscription items
- [ ] Usage tracking details
  - [ ] Workspace resource usage (per hour)
  - [ ] API calls count
  - [ ] Plugin/Service executions count
  - [ ] Gateway messages count
  - [ ] AI token usage
- [ ] Billing UI
  - [ ] Plan selection with resource comparison
  - [ ] Add-on management
  - [ ] Current usage dashboard
  - [ ] Usage projections/estimates
  - [ ] Payment history
  - [ ] Invoice downloads
- [ ] **Billing Edge Cases** ⭐
  - [ ] Failed payment retry schedule (1d, 3d, 7d, 14d)
  - [ ] Dunning email sequence (payment failed notifications)
  - [ ] Subscription pause feature (vacation mode, max 3 months)
  - [ ] Proration calculation for mid-cycle upgrades/downgrades
  - [ ] Refund policy implementation (prorated refunds)
  - [ ] Tax calculation integration (Stripe Tax)
  - [ ] Invoice line item details (per-resource breakdown)
  - [ ] Payment method management (add/remove cards)
  - [ ] Billing email notifications (receipt, upcoming charge, failed)

### Phase 8c: Credit System ⏱️ Days 32-33 ⭐ NEW

> **Credits complement subscriptions for variable costs (AI tokens, overages, marketplace)**

- [ ] **Credit System Core**
  - [ ] CreditBalance model and service
  - [ ] CreditTransaction immutable ledger
  - [ ] CreditPackage model and seed data
  - [ ] Credit purchase flow (Stripe one-time payment)
  - [ ] Credit balance display in dashboard header
  - [ ] Transaction history page

- [ ] **Credit Packages**
  - [ ] Create Stripe Price IDs for 5 packages:
    - [ ] Starter: $5 = 500 credits
    - [ ] Basic: $10 = 1,000 credits
    - [ ] Popular: $25 = 2,750 credits (+10% bonus)
    - [ ] Value: $50 = 6,000 credits (+20% bonus)
    - [ ] Pro: $100 = 13,000 credits (+30% bonus)
  - [ ] Package selection UI with bonus highlights
  - [ ] "Popular" badge on recommended package
  - [ ] Purchase confirmation modal

- [ ] **AI Token Credit Deduction**
  - [ ] AI usage tracking integration with credits
  - [ ] Pre-deduct credits before AI call (reserve)
  - [ ] Refund reserved credits on failure
  - [ ] Credit cost per model tracking
  - [ ] AI usage breakdown in transaction history
  - [ ] Free AI allowance per plan (monthly reset)

- [ ] **Plan Overage Handling**
  - [ ] Detect plan limit exceeded (executions, storage, etc.)
  - [ ] Offer credit payment instead of blocking
  - [ ] Overage credit cost configuration
  - [ ] Soft limit vs hard limit per resource

- [ ] **Auto Top-up**
  - [ ] Auto top-up settings page
  - [ ] Threshold configuration (trigger when below X)
  - [ ] Package selection for auto-purchase
  - [ ] Monthly safety limit
  - [ ] Auto top-up execution and notification

- [ ] **Spending Controls**
  - [ ] Daily spending limit setting
  - [ ] Per-action spending limit
  - [ ] AI-only spending limit
  - [ ] Low balance alerts (email + in-app)
  - [ ] Spending dashboard with trends

- [ ] **Marketplace Credit Payments**
  - [ ] Credit price for one-time marketplace items
  - [ ] Credit checkout flow for marketplace
  - [ ] Mixed payment (subscription + credits) handling

- [ ] **Organization Credit Pools** (BUSINESS+)
  - [ ] Shared credit pool for organization
  - [ ] Department budget allocation
  - [ ] Per-member spending limits
  - [ ] Credit transfer between members
  - [ ] Org credit usage reporting
  - [ ] Admin credit grant capability

- [ ] **Credit API Endpoints**
  - [ ] GET /api/v1/credits/balance
  - [ ] GET /api/v1/credits/transactions
  - [ ] POST /api/v1/credits/purchase
  - [ ] GET /api/v1/credits/packages
  - [ ] PUT /api/v1/credits/settings
  - [ ] POST /api/v1/credits/estimate (cost preview)

- [ ] **Credit Admin Tools**
  - [ ] Admin credit grant/adjustment
  - [ ] Credit usage analytics dashboard
  - [ ] Refund credits on support request
  - [ ] Credit audit log

### Phase 9: Security & Performance ⏱️ Days 34-37
- [ ] Security Audit (OWASP Checklist)
  - [ ] SQL injection prevention verification
  - [ ] XSS prevention verification
  - [ ] CSRF protection verification
  - [ ] Authentication/authorization review
  - [ ] Sensitive data exposure check
  - [ ] Security headers configuration
  - [ ] Dependency vulnerability scan (npm audit)
  - [ ] Container security review
- [ ] Performance Optimization
  - [ ] Redis caching implementation review
  - [ ] Database query optimization
  - [ ] Connection pooling verification (PgBouncer)
  - [ ] Load testing (k6 or Artillery)
  - [ ] Response time benchmarks
  - [ ] Workspace container startup optimization
- [ ] **Network & External API Safeguards** ⭐
  - [ ] External API timeouts:
    - [ ] Telegram API: 30 seconds
    - [ ] AI APIs: 60 seconds (models are slow)
    - [ ] Webhook calls: 10 seconds
  - [ ] Retry configuration:
    - [ ] Max 3 retries with exponential backoff
    - [ ] Jitter to prevent thundering herd
    - [ ] Circuit breaker after 5 failures
  - [ ] Request deduplication (idempotency keys)
- [ ] **DDoS & Abuse Protection** ⭐
  - [ ] WAF integration (Cloudflare/AWS WAF)
  - [ ] IP-based rate limiting (separate from user rate limit)
  - [ ] Suspicious activity detection:
    - [ ] Too many failed logins
    - [ ] Unusual API patterns
    - [ ] Geographic anomalies
  - [ ] Automatic IP blocking (temporary)
  - [ ] Admin IP allowlist for critical endpoints
  - [ ] CAPTCHA for suspicious requests (Cloudflare Turnstile)
- [ ] **Cloudflare Setup** ⭐ (CRITICAL)
  - [ ] Domain DNS configured through Cloudflare
  - [ ] SSL/TLS mode: Full (strict)
  - [ ] Edge caching rules for static assets
  - [ ] Page rules for API bypass (no cache)
  - [ ] WAF rules enabled (OWASP ruleset)
  - [ ] Rate limiting rules configured
  - [ ] Bot management settings
  - [ ] Firewall rules for known bad actors
  - [ ] DDoS protection verified
  - [ ] R2 bucket for backups configured
  - [ ] Workers for edge logic (optional)
- [ ] **Graceful Degradation** ⭐
  - [ ] Service health dependency map
  - [ ] Fallback behaviors:
    - [ ] Redis down → DB fallback for sessions
    - [ ] AI gateway down → queue for retry
    - [ ] Stripe down → grace period for billing
  - [ ] Feature toggles for degraded mode:
    - [ ] Disable non-critical features under load
    - [ ] Read-only mode for DB issues
  - [ ] User-facing status page integration
- [ ] **APM Integration** ⭐
  - [ ] Application Performance Monitoring setup (Datadog, New Relic, or OpenTelemetry)
  - [ ] Distributed tracing for request flows across services
  - [ ] Span correlation for workspace-to-platform calls
  - [ ] Custom spans for critical operations (gateway calls, AI requests)
  - [ ] Performance baseline establishment
- [ ] **Secrets Rotation Automation** ⭐
  - [ ] ENCRYPTION_KEY rotation procedure (without data loss)
  - [ ] Database password rotation automation
  - [ ] API key grace period during rotation (old + new both work)
  - [ ] JWT secret rotation with token invalidation strategy
  - [ ] Stripe webhook secret rotation procedure
- [ ] **WebSocket Security & Limits** ⭐
  - [ ] Max WebSocket connections per user (free: 2, pro: 5, business: 10)
  - [ ] WebSocket message rate limiting (100 msg/min)
  - [ ] WebSocket reconnection backoff enforcement
  - [ ] WebSocket connection authentication validation
  - [ ] Idle WebSocket connection cleanup (30 min)
- [ ] **AI Token Accounting Safety** ⭐
  - [ ] Pre-reserve tokens before AI call (decrement quota atomically)
  - [ ] Release reserved tokens on failure
  - [ ] Token usage reconciliation job (daily)
  - [ ] Concurrent AI call limit per user
- [ ] **Memory & Resource Safeguards** ⭐
  - [ ] Memory leak detection (heapdump on threshold)
  - [ ] Garbage collection monitoring
  - [ ] Process restart on memory threshold (80%)
  - [ ] CPU throttling detection
  - [ ] Disk space monitoring and alerts:
    - [ ] 70% warning
    - [ ] 85% critical
    - [ ] 95% emergency cleanup
- [ ] **Data Integrity Safeguards** ⭐
  - [ ] Transaction patterns:
    - [ ] All multi-step operations in transactions
    - [ ] Optimistic locking for concurrent updates
    - [ ] Idempotent operations where possible
  - [ ] Backup verification:
    - [ ] Daily backup integrity check
    - [ ] Monthly restore test
    - [ ] Backup encryption verification
  - [ ] Data consistency checks:
    - [ ] Foreign key validation job
    - [ ] Orphaned record cleanup
    - [ ] Billing/usage reconciliation
- [ ] **Backup Automation & Testing** ⭐
  - [ ] Weekly automated restore test to staging environment
  - [ ] Backup integrity hash verification
  - [ ] Point-in-time recovery (PITR) configuration
  - [ ] Backup retention policy (daily: 7d, weekly: 4w, monthly: 12m)
  - [ ] Cross-region backup replication (optional)
- [ ] **Internationalization Preparation** ⭐
  - [ ] i18n framework setup (next-intl or react-i18next)
  - [ ] String extraction and cataloging
  - [ ] Timezone handling for schedules (store in UTC, display in user TZ)
  - [ ] Currency handling for marketplace (user's local currency display)
  - [ ] Date/time format localization
  - [ ] RTL language support consideration
- [ ] **Monitoring Performance Safeguards** ⭐ (CRITICAL)
  - [ ] **Async Aggregation Jobs** (don't compute on-demand):
    - [ ] Background worker for metric aggregation
    - [ ] Run aggregations every 1-5 minutes (not per request)
    - [ ] Store pre-computed results in Redis
  - [ ] **Pre-computed Dashboard Cache**:
    - [ ] Dashboard data cached in Redis (1-5 min TTL)
    - [ ] Separate cache keys per user/org
    - [ ] Stale-while-revalidate pattern
  - [ ] **Time-Series Database for Metrics**:
    - [ ] InfluxDB or TimescaleDB for high-volume metrics
    - [ ] Keep only aggregates in PostgreSQL
    - [ ] Automatic downsampling (1min → 5min → 1hr → 1day)
    - [ ] Retention policy (raw: 7d, 5min: 30d, hourly: 1yr)
  - [ ] **Event Sampling** (for high-volume events):
    - [ ] Sample 10% of gateway messages (store count only)
    - [ ] Sample 100% for errors/failures
    - [ ] Configurable sampling rates per event type
  - [ ] **Rate Limit Monitoring Endpoints**:
    - [ ] Max 1 dashboard refresh per 10 seconds
    - [ ] Max 10 monitoring API calls per minute
    - [ ] Burst protection for analytics queries
  - [ ] **Background Metric Workers**:
    - [ ] Separate worker process for metrics (not API process)
    - [ ] Dedicated queue for metric jobs
    - [ ] Low priority (don't compete with user jobs)
  - [ ] **Lazy Loading for Dashboards**:
    - [ ] Load critical metrics first (2 seconds)
    - [ ] Load secondary metrics async
    - [ ] Progressive dashboard rendering
- [ ] **Redis Scaling Strategy** ⭐
  - [ ] Redis Cluster configuration planning
  - [ ] Key slot distribution analysis
  - [ ] Session store migration to Redis Cluster
  - [ ] BullMQ multi-node setup
  - [ ] Redis Sentinel for high availability
  - [ ] Redis memory optimization
- [ ] **PostgreSQL Scaling Strategy** ⭐
  - [ ] Read replica configuration
  - [ ] Prisma read replica support (`$replica`)
  - [ ] Connection string management (read/write split)
  - [ ] Query routing to replica for heavy reads
  - [ ] Replication lag monitoring
  - [ ] Caching layer for expensive queries
- [ ] **Query Caching Strategy** ⭐
  - [ ] Identify expensive queries (analytics, aggregations, reports)
  - [ ] Redis cache for expensive query results:
    - [ ] Marketplace item listings (5 min TTL)
    - [ ] User dashboard stats (1 min TTL)
    - [ ] Organization analytics (5 min TTL)
    - [ ] Billing usage aggregations (15 min TTL)
  - [ ] Cache invalidation strategy:
    - [ ] Event-based invalidation (on data change)
    - [ ] TTL-based expiration
    - [ ] Manual cache purge API (admin)
  - [ ] Cache hit/miss metrics
  - [ ] Query performance monitoring (slow query log)
  - [ ] Database connection pool optimization
- [ ] Compliance
  - [ ] GDPR compliance (data export endpoint)
  - [ ] GDPR compliance (data deletion endpoint)
  - [ ] Privacy policy page
  - [ ] Terms of service page
  - [ ] Cookie consent implementation
- [ ] **Testing Strategy** ⭐
  - [ ] Unit test coverage target (80%+ for critical paths)
  - [ ] Integration test suite
    - [ ] API endpoint tests (all routes)
    - [ ] Database transaction tests
    - [ ] Queue job tests
  - [ ] E2E test suite (Playwright)
    - [ ] Auth flows (login, register, password reset)
    - [ ] Dashboard navigation
    - [ ] Gateway CRUD operations
    - [ ] Marketplace install/uninstall
    - [ ] Service builder basic flow
    - [ ] Billing/checkout flow
  - [ ] Test data management
    - [ ] Test data seeding scripts
    - [ ] Database isolation per test (transactions)
    - [ ] Mock implementations for external services
  - [ ] Performance testing
    - [ ] Load test targets (100 RPS, 1000 concurrent users)
    - [ ] Stress test scenarios
    - [ ] Memory leak detection
  - [ ] Chaos testing (optional but recommended)
    - [ ] Container kill tests
    - [ ] Network partition simulation
    - [ ] Database failover tests

### Phase 10: Polish & Launch Prep ⏱️ Days 37-40
- [ ] Landing page enhancement
  - [ ] Hero section
  - [ ] Features showcase (4 item types)
  - [ ] Workflow demo animation
  - [ ] Pricing table (5 tiers + add-ons + Organization plans)
  - [ ] FAQ
  - [ ] Trust badges / security highlights
- [ ] **Frontend UI/UX Polish (Production Ready)** ⭐ NEW
  - [ ] **Responsive Design**
    - [ ] Mobile-first verification (all pages)
    - [ ] Tablet breakpoint testing
    - [ ] Touch-friendly controls (44px min tap targets)
    - [ ] Mobile navigation (hamburger menu, bottom nav)
    - [ ] Service builder mobile experience (simplified view)
  - [ ] **Loading States**
    - [ ] Skeleton loaders for all data-fetching components
    - [ ] Button loading states (spinner + disabled)
    - [ ] Page transition loading indicators
    - [ ] Optimistic UI updates where appropriate
    - [ ] Progress indicators for long operations
  - [ ] **Error States UI**
    - [ ] Error boundary components (graceful crash handling)
    - [ ] API error toast notifications
    - [ ] Form validation error display (inline + summary)
    - [ ] Network offline indicator
    - [ ] Retry buttons for failed requests
    - [ ] "Something went wrong" fallback pages
  - [ ] **Empty States**
    - [ ] "No gateways yet" with CTA to add
    - [ ] "No plugins installed" with marketplace link
    - [ ] "No services created" with template suggestions
    - [ ] "No activity" with getting started tips
    - [ ] Illustrations for empty states
  - [ ] **Accessibility (WCAG 2.1 AA)** ⭐
    - [ ] Keyboard navigation (all interactive elements)
    - [ ] Focus indicators (visible focus rings)
    - [ ] Screen reader testing (NVDA, VoiceOver)
    - [ ] ARIA labels for icons and buttons
    - [ ] Color contrast verification (4.5:1 minimum)
    - [ ] Alt text for all images
    - [ ] Skip to main content link
    - [ ] Form label associations
    - [ ] Error announcements for screen readers
  - [ ] **Animations & Micro-interactions**
    - [ ] Page transitions (subtle fade/slide)
    - [ ] Button hover/active states
    - [ ] Modal open/close animations
    - [ ] Toast notification animations
    - [ ] Drag-and-drop visual feedback (service builder)
    - [ ] Success/completion celebrations (confetti for milestones)
    - [ ] Respect prefers-reduced-motion
  - [ ] **Dark Mode Polish**
    - [ ] All components verified in dark mode
    - [ ] Chart colors for dark mode
    - [ ] Image assets with dark mode variants
    - [ ] Code block syntax highlighting (dark)
    - [ ] Email templates dark mode support
  - [ ] **Performance (Core Web Vitals)** ⭐
    - [ ] LCP < 2.5s (Largest Contentful Paint)
    - [ ] FID < 100ms (First Input Delay)
    - [ ] CLS < 0.1 (Cumulative Layout Shift)
    - [ ] Image optimization (WebP, lazy loading)
    - [ ] Font optimization (preload, font-display: swap)
    - [ ] Bundle size analysis and code splitting
    - [ ] Lighthouse score 90+ on all pages
- [ ] **User Onboarding Flow** ⭐ NEW
  - [ ] **First-time User Experience**
    - [ ] Welcome modal after signup
    - [ ] Interactive product tour (intro.js or similar)
    - [ ] Guided setup wizard:
      - [ ] Step 1: Connect first gateway
      - [ ] Step 2: Install a starter plugin
      - [ ] Step 3: Create first service (template)
      - [ ] Step 4: Customize dashboard
    - [ ] Progress indicator (4/4 steps complete)
    - [ ] Skip option (for experienced users)
  - [ ] **Contextual Help**
    - [ ] Tooltip hints for complex features
    - [ ] "What's this?" info icons
    - [ ] Feature discovery announcements (new features)
    - [ ] In-app help center/search
  - [ ] **Gamification (Optional)**
    - [ ] Achievement badges (first gateway, first service, etc.)
    - [ ] Progress milestones
    - [ ] Completion percentage on dashboard
- [ ] **PWA Support** ⭐ NEW
  - [ ] Service worker for offline capability
  - [ ] Web app manifest (installable)
  - [ ] Offline fallback page
  - [ ] Push notification preparation
  - [ ] App icon set (all sizes)
  - [ ] Splash screen configuration
- [ ] **SEO Optimization** ⭐ NEW
  - [ ] Meta tags for all public pages
  - [ ] Open Graph tags (social sharing)
  - [ ] Twitter Card tags
  - [ ] Structured data (JSON-LD) for:
    - [ ] Organization
    - [ ] Product (pricing)
    - [ ] FAQ
    - [ ] Breadcrumbs
  - [ ] Sitemap.xml generation
  - [ ] Robots.txt configuration
  - [ ] Canonical URLs
  - [ ] Blog/content pages for organic traffic
- [ ] **Social Proof & Trust** ⭐ NEW
  - [ ] Testimonials section (landing page)
  - [ ] Case studies (2-3 initial)
  - [ ] "As featured in" logos (if applicable)
  - [ ] User count/stats display
  - [ ] Security badges (SSL, SOC2 prep, GDPR)
  - [ ] Integration partner logos
- [ ] **Beta Program Structure** ⭐ NEW
  - [ ] Beta signup landing page
  - [ ] Beta user selection criteria
  - [ ] Beta feedback collection:
    - [ ] In-app feedback widget
    - [ ] Weekly survey emails
    - [ ] User interview scheduling
  - [ ] Beta user communication channel (Discord/Slack)
  - [ ] Beta → GA migration plan
  - [ ] Early adopter rewards (discount, lifetime deal)
- [ ] **Email Templates** ⭐
  - [ ] Welcome email (after registration)
  - [ ] Email verification email
  - [ ] Password reset email
  - [ ] Organization invite email
  - [ ] Payment receipt email
  - [ ] Payment failed email (dunning sequence)
  - [ ] Subscription expiring email (7 days, 3 days, 1 day)
  - [ ] Subscription cancelled confirmation
  - [ ] Resource warning emails (70%, 85%, 95%)
  - [ ] Service execution failed email
  - [ ] Weekly usage summary email (optional)
  - [ ] New login from unknown device alert
- [ ] Documentation
  - [ ] Getting started guide
  - [ ] Gateway setup guides
  - [ ] Plugin/Theme/Widget/Service guides
  - [ ] API documentation
  - [ ] Plugin development guide (for developers)
  - [ ] Workspace resource management guide
  - [ ] **Organization admin guide** ⭐
  - [ ] **Swagger/OpenAPI specification** ⭐
  - [ ] **Postman/Insomnia collection export** ⭐
  - [ ] **Changelog/release notes process** ⭐
- [ ] **Status & Monitoring Pages** ⭐
  - [ ] Public status page setup (Statuspage.io or Instatus)
  - [ ] Uptime monitoring (Better Uptime, UptimeRobot)
  - [ ] Incident communication templates
  - [ ] Maintenance window announcement flow
- [ ] Testing & QA
  - [ ] End-to-end testing (Playwright)
  - [ ] Performance testing results review
  - [ ] Security audit fixes verification
  - [ ] User acceptance testing
  - [ ] Workspace isolation testing
  - [ ] **Organization multi-tenant testing** ⭐
- [ ] Deployment
  - [ ] Production environment setup
  - [ ] Domain & SSL
  - [ ] CDN configuration
  - [ ] Monitoring & alerting (Sentry, uptime)
  - [ ] Logging aggregation
  - [ ] Backup strategy (automated daily)
  - [ ] Disaster recovery plan documentation
  - [ ] Container orchestration setup (Docker Swarm/K8s)

### Phase 11: Organization System (Enterprise) ⏱️ Days 41-48 ⭐
- [ ] **Organization Core**
  - [ ] Organization creation flow
  - [ ] Organization settings page
  - [ ] Organization logo/branding upload
  - [ ] Organization slug/URL generation
  - [ ] Organization deletion (with confirmation)
- [ ] **Department Management**
  - [ ] Department CRUD operations
  - [ ] Department color/icon customization
  - [ ] Department resource quota assignment
  - [ ] Department statistics dashboard
- [ ] **Member Management**
  - [ ] Invite users by email (with role selection)
  - [ ] Bulk invite via CSV upload
  - [ ] Accept/decline invite flow
  - [ ] Member role management (ORG_OWNER, ORG_ADMIN, DEPT_MANAGER, ORG_MEMBER)
  - [ ] Assign members to departments
  - [ ] Remove members from organization
  - [ ] Transfer ownership
- [ ] **Organization Licensing**
  - [ ] Purchase marketplace items at org level
  - [ ] View all org licenses
  - [ ] Assign licenses to departments
  - [ ] License usage tracking (seats used)
  - [ ] License renewal/cancellation
- [ ] **Organization Workspace**
  - [ ] Shared workspace container for org
  - [ ] Resource pool management
  - [ ] Per-department soft quotas
  - [ ] Real-time resource usage by department
  - [ ] Department-level process isolation (PM2 namespaces)
- [ ] **Organization Billing**
  - [ ] Org subscription plans (5 tiers)
  - [ ] Seat-based pricing (extra seats add-on)
  - [ ] Single invoice for entire org
  - [ ] Resource usage billing (per GB-hour, vCPU-hour)
  - [ ] Marketplace item billing at org level
  - [ ] Billing admin role (who can view/pay)
- [ ] **Organization Dashboard**
  - [ ] Org overview (members, departments, usage)
  - [ ] Cross-department analytics
  - [ ] Member activity logs
  - [ ] Resource allocation visualization
  - [ ] Cost breakdown by department
- [ ] **Organization Monitoring Dashboard** ⭐
  - [ ] Department comparison:
    - [ ] Resource usage by department (bar chart)
    - [ ] Cost by department (pie chart)
    - [ ] Activity level by department
    - [ ] Top resource consumers (members)
  - [ ] Per-member usage tracking:
    - [ ] Individual member resource usage
    - [ ] Member activity timeline
    - [ ] Inactive member detection
    - [ ] Heavy user alerts
  - [ ] License utilization:
    - [ ] Licenses purchased vs active
    - [ ] Most/least used marketplace items
    - [ ] License ROI (usage per dollar)
    - [ ] Unused license alerts
  - [ ] Organization health score:
    - [ ] Overall adoption rate
    - [ ] Feature utilization breadth
    - [ ] Member engagement score
    - [ ] Trend direction (improving/declining)
  - [ ] ROI calculator:
    - [ ] Cost comparison vs individual plans
    - [ ] Time saved by automation
    - [ ] Value delivered per department
- [ ] **Organization Permissions**
  - [ ] Role-based access control (RBAC)
  - [ ] Per-department item access control
  - [ ] Audit log for org actions
  - [ ] Permission templates (preset roles)
- [ ] **Individual-to-Organization Migration** ⭐
  - [ ] Migration wizard UI (step-by-step)
  - [ ] Data migration from user workspace to org workspace
    - [ ] Gateway credential migration
    - [ ] Plugin configuration migration
    - [ ] Service/workflow migration
    - [ ] Execution history preservation
  - [ ] Billing transition
    - [ ] Prorate remaining individual plan balance
    - [ ] Apply credit to organization billing
    - [ ] Start org seat for migrated user
  - [ ] Rollback capability (7-day window)
  - [ ] Post-migration cleanup (old workspace deletion)

### Phase 12: Inter-Organization Features ⏱️ Days 49-52 ⭐
- [ ] **Partner Links**
  - [ ] Request partner link to another org
  - [ ] Accept/decline partner requests
  - [ ] Revoke existing partner links
  - [ ] Partner link management UI
- [ ] **Cross-Org Service Communication**
  - [ ] Define which services can communicate
  - [ ] Message passing between org services
  - [ ] Cross-org event triggers
  - [ ] Rate limiting between orgs
- [ ] **Partner Directory** (Optional)
  - [ ] Public partner profile
  - [ ] Partner discovery/search
  - [ ] Partnership request workflow

### Phase 13: Production Infrastructure ⏱️ Days 53-60 ⭐ NEW
- [ ] **Kubernetes Migration**
  - [ ] Kubernetes manifest generation
    - [ ] Platform deployment (API, workers)
    - [ ] Workspace CRD (Custom Resource Definition)
    - [ ] Workspace operator for dynamic container spawning
  - [ ] Horizontal Pod Autoscaler (HPA) for platform
  - [ ] Resource quotas per namespace
  - [ ] Network policies for workspace isolation
- [ ] **Helm Chart Creation**
  - [ ] Platform Helm chart
  - [ ] Workspace runtime Helm chart
  - [ ] Configuration values templating
  - [ ] Environment-specific overlays
- [ ] **CI/CD Pipeline for K8s**
  - [ ] GitHub Actions for Kubernetes deployment
  - [ ] Image build and push automation
  - [ ] Kubernetes manifest validation
  - [ ] Automated rollback on failure
- [ ] **Blue-Green Deployment**
  - [ ] Traffic splitting configuration
  - [ ] Gradual rollout (canary)
  - [ ] Instant rollback capability
  - [ ] Deployment health checks
- [ ] **Deployment Safeguards** ⭐
  - [ ] Feature flags system:
    - [ ] LaunchDarkly or Unleash integration
    - [ ] Per-user feature targeting
    - [ ] Percentage rollouts
    - [ ] Kill switch for new features
  - [ ] Automated rollback triggers:
    - [ ] Error rate spike (>5% increase)
    - [ ] Latency spike (>2x baseline)
    - [ ] Health check failures
    - [ ] Memory/CPU threshold breach
  - [ ] Deployment windows:
    - [ ] Avoid deployments during peak hours
    - [ ] Maintenance window scheduling
    - [ ] User notification for planned downtime
  - [ ] Database migration safeguards:
    - [ ] Migration dry-run before apply
    - [ ] Backward-compatible migrations only
    - [ ] Migration rollback scripts required
    - [ ] Data verification after migration
  - [ ] Smoke tests post-deployment:
    - [ ] Critical path verification
    - [ ] Payment flow test
    - [ ] Gateway connectivity test
- [ ] **Monitoring & Observability**
  - [ ] Prometheus metrics setup
  - [ ] Grafana dashboards
    - [ ] Platform health dashboard
    - [ ] Workspace resource dashboard
    - [ ] Billing/usage dashboard
  - [ ] Alert rules configuration
  - [ ] PagerDuty/Slack integration
- [ ] **Platform Monitoring (Admin)** ⭐
  - [ ] Real-time system metrics:
    - [ ] Request latency percentiles (p50, p95, p99)
    - [ ] Error rate by endpoint
    - [ ] Active WebSocket connections
    - [ ] Background job throughput
  - [ ] Infrastructure metrics:
    - [ ] Container orchestrator health
    - [ ] Node resource utilization
    - [ ] Pod restart frequency
    - [ ] Network throughput
  - [ ] Business metrics dashboard:
    - [ ] New signups (hourly, daily)
    - [ ] Active trials
    - [ ] Conversion rate
    - [ ] Revenue per user (ARPU)
  - [ ] Anomaly detection:
    - [ ] Unusual traffic patterns
    - [ ] Sudden error spikes
    - [ ] Resource usage anomalies
    - [ ] Security incident indicators
  - [ ] SLA monitoring:
    - [ ] Uptime percentage (99.9% target)
    - [ ] Response time SLA compliance
    - [ ] Incident tracking
    - [ ] MTTR (Mean Time to Recovery)
- [ ] **Log Aggregation**
  - [ ] ELK Stack or Loki setup
  - [ ] Structured log format standardization
  - [ ] Log retention policies
  - [ ] Log-based alerting
- [ ] **Multi-Region Preparation** (Documentation)
  - [ ] Multi-region architecture document
  - [ ] Database replication strategy (primary/replica per region)
  - [ ] Redis cross-region sync approach
  - [ ] CDN configuration for static assets
  - [ ] DNS-based traffic routing plan
  - [ ] Region failover procedures
- [ ] **Spot/Preemptible Instances (Cost Optimization)** ⭐
  - [ ] Spot instance strategy for workspace nodes:
    - [ ] Free tier workspaces → Spot nodes (80% cost savings)
    - [ ] Paid tiers → On-demand nodes (reliability)
  - [ ] Spot interruption handling:
    - [ ] 2-minute warning detection
    - [ ] Graceful workspace migration
    - [ ] Job queue preservation
  - [ ] Mixed node pools (spot + on-demand)
  - [ ] Spot instance availability monitoring
  - [ ] Fallback to on-demand when spot unavailable
  - [ ] Cost savings dashboard (spot vs on-demand)
- [ ] **Container Right-sizing (Cost Optimization)** ⭐
  - [ ] Resource usage analysis per tier:
    - [ ] Actual vs allocated RAM/CPU tracking
    - [ ] Peak vs average usage patterns
    - [ ] Idle time percentage
  - [ ] Right-sizing recommendations:
    - [ ] "User X allocated 2GB but averages 400MB"
    - [ ] Admin dashboard for fleet-wide analysis
  - [ ] Tier adjustment suggestions:
    - [ ] Downgrade prompts for over-provisioned users
    - [ ] Upgrade prompts for constrained users
  - [ ] Auto-scaling within tier limits (VPA)
  - [ ] Resource efficiency score per user
  - [ ] Cost-per-execution metrics

### Phase 14: Post-Launch Operations ⏱️ Days 61-70 ⭐ NEW
- [ ] **Runbook Documentation**
  - [ ] Incident response runbooks for common issues
  - [ ] On-call rotation setup
  - [ ] Escalation procedures
  - [ ] Communication templates for incidents
- [ ] **Database Maintenance**
  - [ ] VACUUM/ANALYZE scheduling (PostgreSQL)
  - [ ] Index maintenance and bloat monitoring
  - [ ] Table partitioning for high-volume tables (audit_logs, execution_logs)
  - [ ] Archive strategy for old data
- [ ] **Container Image Maintenance**
  - [ ] Workspace runtime dependency updates (weekly security patches)
  - [ ] Base image updates (monthly)
  - [ ] Image size optimization
  - [ ] Deprecated image cleanup
- [ ] **Security Maintenance**
  - [ ] Dependency vulnerability scanning (weekly)
  - [ ] SSL certificate renewal automation
  - [ ] Security audit scheduling (quarterly)
  - [ ] Penetration testing (annual)
- [ ] **Performance Regression Testing**
  - [ ] Automated performance benchmark suite
  - [ ] Weekly performance regression checks
  - [ ] Performance budget alerts
  - [ ] Query performance degradation detection
- [ ] **User Feedback Loop**
  - [ ] In-app feedback widget
  - [ ] Feature request tracking system
  - [ ] Bug report integration with issue tracker
  - [ ] NPS survey automation (quarterly)

### Phase 15: Admin & Role-Based Dashboards ⏱️ Days 71-80 ⭐ NEW

> **Goal**: Complete admin dashboard with full platform management capabilities
> and extensible dashboard system for future role types.

- [ ] **Admin Dashboard Core**
  - [ ] Admin layout with role-based access control
  - [ ] Admin home overview with key metrics
    - [ ] Total users, active today, new signups
    - [ ] Revenue (MRR, ARR, growth rate)
    - [ ] Active workspaces, average utilization
    - [ ] Marketplace stats (items, sales, developers)
  - [ ] Real-time activity feed
  - [ ] Quick action buttons (ban user, pause service, etc.)

- [ ] **User Management UI**
  - [ ] User list with search, filters, pagination
    - [ ] Filter by: plan, status, role, date range, activity
    - [ ] Bulk actions (email, suspend, delete)
  - [ ] User detail page
    - [ ] Profile information, subscription status
    - [ ] Activity timeline (logins, actions)
    - [ ] Gateways, services, plugins owned
    - [ ] Usage metrics, billing history
  - [ ] User actions:
    - [ ] Impersonate user (login as user for support)
    - [ ] Ban/unban with reason tracking
    - [ ] Suspend/unsuspend (temporary)
    - [ ] Force password reset
    - [ ] Adjust plan/credits manually
    - [ ] Send direct email
  - [ ] User export (CSV, JSON)

- [ ] **Organization Management UI**
  - [ ] Organization list with stats
  - [ ] Organization detail:
    - [ ] Members, departments, settings
    - [ ] Shared workspace usage
    - [ ] Billing and licenses
  - [ ] Organization actions:
    - [ ] Adjust org plan
    - [ ] Add/remove org credits
    - [ ] Suspend/activate org

- [ ] **Marketplace Admin UI**
  - [ ] Submission review queue
    - [ ] Pending submissions list
    - [ ] Review interface with approve/reject/request-changes
    - [ ] Code review tools (sandbox preview)
    - [ ] Security scan results display
  - [ ] Published items management
    - [ ] Feature/unfeature items
    - [ ] Delist/relist items
    - [ ] Edit item metadata
    - [ ] View item reports/complaints
  - [ ] Developer management
    - [ ] Developer list and verification status
    - [ ] Payout processing queue
    - [ ] Revenue share adjustments

- [ ] **Billing Admin UI**
  - [ ] Revenue dashboard
    - [ ] MRR/ARR trends chart
    - [ ] Revenue by plan breakdown
    - [ ] Churn rate visualization
  - [ ] Subscription management
    - [ ] Active subscriptions list
    - [ ] Subscription detail (cancel, refund, adjust)
  - [ ] Invoice lookup and history
  - [ ] Refund processing
  - [ ] Developer payout management
    - [ ] Pending payouts queue
    - [ ] Process payout batch
    - [ ] Payout history

- [ ] **Feature Flag Management UI**
  - [ ] Flag list with current states
  - [ ] Create new flag form
  - [ ] Flag detail/edit page
    - [ ] Toggle global state
    - [ ] Add user/org overrides
    - [ ] Set rollout percentage
    - [ ] Scheduling (enable at date/time)
  - [ ] Flag usage analytics

- [ ] **Announcements System**
  - [ ] Announcement list (active, scheduled, past)
  - [ ] Create announcement form
    - [ ] Target audience (all, plan tier, beta users)
    - [ ] Display type (banner, modal, toast)
    - [ ] Schedule start/end dates
    - [ ] Dismissible or persistent
  - [ ] Announcement analytics (views, dismissals)

- [ ] **Support System** (optional, can use external)
  - [ ] Ticket queue with priority sorting
  - [ ] Ticket detail with conversation thread
  - [ ] Assign tickets to team members
  - [ ] Canned responses
  - [ ] Ticket status workflow (open → in-progress → resolved → closed)

- [ ] **System Settings UI**
  - [ ] Platform settings page
    - [ ] Site name, logo, contact info
    - [ ] Default quota values
    - [ ] Registration settings (open/invite-only)
  - [ ] Rate limit configuration
  - [ ] Plan configuration (edit plan features/limits)
  - [ ] Maintenance mode toggle with message
  - [ ] Platform API key management

- [ ] **Monitoring Dashboard**
  - [ ] System health overview
    - [ ] Service status indicators
    - [ ] Database connection status
    - [ ] Redis connection status
    - [ ] Queue health
  - [ ] Active workspaces list
    - [ ] Container status (running/stopped/error)
    - [ ] Resource usage per workspace
    - [ ] Kill/restart workspace actions
  - [ ] Queue monitoring (BullMQ)
    - [ ] Queue depth per queue type
    - [ ] Failed job list with retry option
    - [ ] Job throughput charts
  - [ ] Error log viewer
    - [ ] Recent exceptions with stack traces
    - [ ] Error frequency charts
    - [ ] Error search/filter
  - [ ] Performance metrics
    - [ ] API response time percentiles
    - [ ] Database query performance
    - [ ] Memory/CPU trends

- [ ] **Reports & Analytics**
  - [ ] Revenue reports
    - [ ] By period (daily, weekly, monthly)
    - [ ] By plan tier
    - [ ] By geography
  - [ ] Usage reports
    - [ ] Gateway usage by type
    - [ ] Service execution counts
    - [ ] API call volume
  - [ ] Growth reports
    - [ ] User signups over time
    - [ ] Conversion funnel
    - [ ] Cohort retention
  - [ ] Export functionality (CSV, PDF)

- [ ] **Admin Audit Log**
  - [ ] All admin actions logged
  - [ ] Filter by admin user, action type, date
  - [ ] Action detail view
  - [ ] Export audit log

- [ ] **Developer Portal Dashboard**
  - [ ] Developer home overview
  - [ ] Item management interface
  - [ ] Submission workflow UI
  - [ ] Analytics dashboard
  - [ ] Earnings and payout management
  - [ ] Developer settings

- [ ] **Extensible Dashboard Architecture**
  - [ ] DASHBOARD_TYPE_CONFIG implementation
  - [ ] Dynamic navigation based on user roles
  - [ ] Role-based layout switching
  - [ ] Permission middleware for all dashboard routes
  - [ ] Dashboard switcher component (for users with multiple roles)

---

## 🗄️ Database Schema

### Core Tables

```prisma
// ============================================
// USER & AUTH (NextAuth.js Compatible)
// ============================================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String?
  image         String?
  emailVerified DateTime?
  role          UserRole  @default(MEMBER)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?       // ⭐ Soft delete support
  
  // Security fields ⭐
  passwordBreachedAt DateTime?   // Set if password found in HaveIBeenPwned
  lastPasswordChange DateTime?   // Track password age
  failedLoginCount   Int         @default(0)
  lockedUntil        DateTime?   // Account lockout timestamp
  
  // Organization membership (null = individual user)
  organizationId String?
  departmentId   String?
  orgRole        OrgRole?          // Role within organization
  
  // Relations
  accounts      Account[]
  sessions      Session[]
  gateways      Gateway[]
  userPlugins   UserPlugin[]
  userTheme     UserTheme?
  userWidgets   UserWidget[]
  userServices  UserService[]
  subscription  Subscription?
  apiKeys       ApiKey[]
  notifications Notification[]
  quota         UserQuota?
  workspace     Workspace?       // ⭐ User's isolated workspace (null if in org)
  auditLogs     AuditLog[]
  referralCode  ReferralCode?
  referredBy    Referral?     @relation("ReferredUser")
  referrals     Referral[]    @relation("ReferrerUser")
  
  // ⭐ Security & 2FA relations
  twoFactor           UserTwoFactor?
  webAuthnCredentials UserWebAuthnCredential[]
  creditBalance       CreditBalance?
  purchases           Purchase[]
  
  // Organization relations
  organization        Organization?       @relation(fields: [organizationId], references: [id])
  department          Department?         @relation(fields: [departmentId], references: [id])
  ownedOrganizations  Organization[]      @relation("OrganizationOwner")
  orgMemberships      OrgMember[]         // ⭐ Explicit org memberships
  orgMembersInvited   OrgMember[]         @relation("OrgMemberInviter") // ⭐ Members this user invited
  orgInvitesSent      OrganizationInvite[] @relation("InviteSender")
  orgInvitesReceived  OrganizationInvite[] @relation("InviteRecipient")
  itemReviews         ItemReview[]        // ⭐ User's marketplace reviews
  developer           Developer?          // ⭐ Developer profile (if marketplace developer)
  
  @@index([organizationId])
  @@index([departmentId])
  @@index([deletedAt])          // ⭐ For soft delete queries
  @@index([email, deletedAt])   // ⭐ For login with soft delete check
}

enum UserRole {
  SUPER_ADMIN   // ⭐ NEW: Full platform control (God mode)
  ADMIN         // Platform administrator
  DEVELOPER     // ⭐ NEW: Marketplace developer
  SUPPORT       // ⭐ NEW: Customer support agent (future)
  MODERATOR     // ⭐ NEW: Content moderator (future)
  OWNER         // Full access (team owner)
  MEMBER        // Standard user (default)
}

// Organization role within a company
enum OrgRole {
  ORG_OWNER       // Organization owner (full control)
  ORG_ADMIN       // Can manage users, departments, items
  DEPT_MANAGER    // Can manage their department only
  ORG_MEMBER      // Regular org member (use assigned items)
}

// API Keys for programmatic access
model ApiKey {
  id           String    @id @default(cuid())
  userId       String
  name         String    // User-friendly name
  keyHash      String    @unique  // Store hashed, never plain
  keyPrefix    String    // First 8 chars for identification (e.g., "2bot_abc1")
  scopes       String[]  // ['read:gateways', 'write:plugins']
  lastUsedAt   DateTime?
  lastUsedIp   String?
  expiresAt    DateTime?
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?
  
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([keyPrefix])
}

// Audit Log for compliance and debugging
model AuditLog {
  id             String        @id @default(cuid())
  userId         String?
  organizationId String?       // ⭐ Track org-level actions
  action         String        // 'gateway.create', 'plugin.install', 'service.run', etc.
  resource       String        // 'gateway', 'plugin', 'service', 'user', 'organization'
  resourceId     String?
  metadata       Json?         // Additional context (sanitized, no secrets)
  ipAddress      String?
  userAgent      String?
  status         String        @default("success") // 'success', 'failure'
  createdAt      DateTime      @default(now())
  
  user           User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  
  @@index([userId])
  @@index([organizationId])
  @@index([createdAt])
  @@index([resource, resourceId])
  @@index([action])
}

// ⭐ NEW: Admin Audit Log - separate log for admin actions
model AdminAuditLog {
  id             String   @id @default(cuid())
  adminId        String   // Admin who performed action
  adminEmail     String   // Denormalized for quick lookup
  action         String   // 'user.ban', 'user.impersonate', 'marketplace.delist', 'system.maintenance'
  targetType     String?  // 'user', 'organization', 'marketplace_item', 'feature_flag'
  targetId       String?  // ID of affected entity
  targetEmail    String?  // If target is a user, their email (denormalized)
  previousValue  Json?    // State before change (for rollback reference)
  newValue       Json?    // State after change
  reason         String?  // Admin's reason for action (required for ban/suspend)
  ipAddress      String
  userAgent      String?
  createdAt      DateTime @default(now())
  
  @@index([adminId])
  @@index([action])
  @@index([targetType, targetId])
  @@index([createdAt])
}

// ⭐ NEW: Announcement model for admin announcements
model Announcement {
  id            String    @id @default(cuid())
  title         String
  content       String    @db.Text
  contentHtml   String?   @db.Text    // Rendered HTML (optional)
  type          String    @default("info") // 'info', 'warning', 'success', 'error'
  displayType   String    @default("banner") // 'banner', 'modal', 'toast'
  targetAudience String   @default("all") // 'all', 'free', 'paid', 'beta', 'developer'
  isDismissible Boolean   @default(true)
  startAt       DateTime?             // Null = immediately
  endAt         DateTime?             // Null = no end
  isActive      Boolean   @default(true)
  createdBy     String
  viewCount     Int       @default(0)
  dismissCount  Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@index([isActive, startAt, endAt])
  @@index([targetAudience])
}

// ⭐ NEW: User announcement dismissals
model AnnouncementDismissal {
  id             String   @id @default(cuid())
  announcementId String
  userId         String
  dismissedAt    DateTime @default(now())
  
  @@unique([announcementId, userId])
  @@index([userId])
}

// ⭐ NEW: Security Log - all security-related events
model SecurityLog {
  id             String   @id @default(cuid())
  type           String   // SecurityEventType enum value
  userId         String?
  userEmail      String?
  ipAddress      String
  userAgent      String?
  path           String?
  method         String?
  metadata       Json?    // Additional context
  timestamp      DateTime @default(now())
  
  @@index([type])
  @@index([userId])
  @@index([ipAddress])
  @@index([timestamp])
}

// ⭐ NEW: IP Block List - temporarily or permanently blocked IPs
model BlockedIp {
  id             String    @id @default(cuid())
  ipAddress      String    @unique
  reason         String    // 'brute_force', 'spam', 'abuse', 'manual'
  blockedBy      String?   // Admin who blocked (null if automatic)
  blockedAt      DateTime  @default(now())
  expiresAt      DateTime? // Null = permanent
  isActive       Boolean   @default(true)
  
  @@index([ipAddress, isActive])
  @@index([expiresAt])
}

// ⭐ NEW: Login Attempt tracking (for rate limiting)
model LoginAttempt {
  id             String   @id @default(cuid())
  email          String   // Attempted email (may not exist)
  ipAddress      String
  userAgent      String?
  success        Boolean
  failureReason  String?  // 'invalid_password', 'user_not_found', 'account_locked', 'ip_blocked'
  attemptedAt    DateTime @default(now())
  
  @@index([email, attemptedAt])
  @@index([ipAddress, attemptedAt])
}

// ============================================
// ORGANIZATION (Enterprise/Team Feature)
// ============================================

// Organization = Company that owns shared resources and licenses
model Organization {
  id              String            @id @default(cuid())
  name            String            // "ABC Trucking Company"
  slug            String            @unique // "abc-trucking" for URLs
  ownerId         String            // Primary owner
  logo            String?
  
  // Subscription & Billing
  plan            OrgPlan           @default(ORG_STARTER)
  maxSeats        Int               @default(10)
  usedSeats       Int               @default(0)
  stripeCustomerId String?
  stripeSubscriptionId String?
  
  // Resource Pool (shared across org)
  totalRamMb      Int               @default(4096)   // 4GB default
  totalCpuCores   Float             @default(2)
  totalStorageMb  Int               @default(10240)  // 10GB default
  
  // Settings
  settings        Json?             // Org-wide settings
  
  // Timestamps
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  deletedAt       DateTime?         // ⭐ Soft delete support
  
  // Relations
  owner           User              @relation("OrganizationOwner", fields: [ownerId], references: [id])
  members         User[]
  orgMembers      OrgMember[]       // ⭐ Explicit membership model
  departments     Department[]
  orgWorkspace    OrganizationWorkspace?
  licenses        OrganizationLicense[]
  invites         OrganizationInvite[]
  auditLogs       AuditLog[]
  creditPool      OrgCreditPool?    // ⭐ Credit pool relation
  partnerLinksFrom OrgPartnerLink[] @relation("OrgLinkFrom")
  partnerLinksTo   OrgPartnerLink[] @relation("OrgLinkTo")
  
  @@index([ownerId])
  @@index([slug])
  @@index([deletedAt])              // ⭐ For soft delete queries
}

enum OrgPlan {
  ORG_STARTER     // 10 seats, 4GB RAM, $49/mo
  ORG_GROWTH      // 25 seats, 8GB RAM, $99/mo
  ORG_PRO         // 50 seats, 16GB RAM, $199/mo
  ORG_BUSINESS    // 100 seats, 32GB RAM, $399/mo
  ORG_ENTERPRISE  // Unlimited seats, custom, contact sales
}

// Departments within an organization
model Department {
  id              String        @id @default(cuid())
  organizationId  String
  name            String        // "HR", "Driver", "Fleet", "Safety"
  description     String?
  color           String?       // For UI display
  
  // Resource quotas (soft limits within org pool)
  ramQuotaMb      Int?          // Optional: soft limit for department
  cpuQuotaCores   Float?
  storageQuotaMb  Int?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  organization    Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  members         User[]
  assignedItems   DepartmentItem[]
  creditAllocations OrgCreditAllocation[] // ⭐ Credit allocations for this dept
  
  @@unique([organizationId, name])
  @@index([organizationId])
}

// ⭐ Organization Member (explicit membership model for context middleware)
model OrgMember {
  id              String        @id @default(cuid())
  organizationId  String
  userId          String
  role            OrgRole       @default(ORG_MEMBER)
  
  // Membership status
  joinedAt        DateTime      @default(now())
  invitedById     String?       // Who invited this member
  
  // Permissions (can override role-based)
  customPermissions String[]    // Additional permissions
  
  // Credit allocation
  creditAllocations OrgCreditAllocation[]
  
  organization    Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  invitedBy       User?         @relation("OrgMemberInviter", fields: [invitedById], references: [id])
  
  @@unique([organizationId, userId])
  @@index([organizationId])
  @@index([userId])
}

// Licenses for marketplace items at org level (buy once, share many)
model OrganizationLicense {
  id              String        @id @default(cuid())
  organizationId  String
  
  // What item is licensed
  itemType        String        // 'plugin', 'service', 'theme', 'widget'
  itemId          String        // Reference to Plugin/Service/Theme/Widget
  
  // License details
  purchaseType    PurchaseType  // ONE_TIME, SUBSCRIPTION
  maxUsers        Int?          // null = unlimited within org
  currentUsers    Int           @default(0)
  
  // Billing
  price           Decimal       @db.Decimal(10, 2)
  stripeSubscriptionItemId String?
  
  // Status
  isActive        Boolean       @default(true)
  expiresAt       DateTime?     // For subscriptions
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  organization    Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  departmentItems DepartmentItem[]
  
  @@unique([organizationId, itemType, itemId])
  @@index([organizationId])
  @@index([itemType, itemId])
}

enum PurchaseType {
  ONE_TIME        // Pay once, use forever
  SUBSCRIPTION    // Monthly/yearly recurring
}

// Assign licensed items to departments
model DepartmentItem {
  id              String              @id @default(cuid())
  departmentId    String
  licenseId       String
  
  // Permissions for this department
  canExecute      Boolean             @default(true)
  canConfigure    Boolean             @default(false) // Can change settings
  
  createdAt       DateTime            @default(now())
  
  department      Department          @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  license         OrganizationLicense @relation(fields: [licenseId], references: [id], onDelete: Cascade)
  
  @@unique([departmentId, licenseId])
  @@index([departmentId])
  @@index([licenseId])
}

// Organization invites (pending members)
model OrganizationInvite {
  id              String            @id @default(cuid())
  organizationId  String
  email           String            // Invited email
  departmentId    String?           // Optional: auto-assign to department
  role            OrgRole           @default(ORG_MEMBER)
  
  // Invite tracking
  invitedById     String
  token           String            @unique
  expiresAt       DateTime
  acceptedAt      DateTime?
  acceptedById    String?           // User who accepted (after registration)
  
  createdAt       DateTime          @default(now())
  
  organization    Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invitedBy       User              @relation("InviteSender", fields: [invitedById], references: [id])
  acceptedBy      User?             @relation("InviteRecipient", fields: [acceptedById], references: [id])
  
  @@index([organizationId])
  @@index([email])
  @@index([token])
}

// Organization workspace (shared resource pool)
model OrganizationWorkspace {
  id              String          @id @default(cuid())
  organizationId  String          @unique
  
  // Container identification
  containerId     String?
  containerStatus WorkspaceStatus @default(STOPPED)
  
  // Current resource usage
  ramUsedMb       Int             @default(0)
  cpuUsedPercent  Float           @default(0)
  storageUsedMb   Int             @default(0)
  
  // Networking
  internalIp      String?
  internalPort    Int?
  
  // Lifecycle
  lastStartedAt   DateTime?
  lastStoppedAt   DateTime?
  lastHealthCheck DateTime?
  healthStatus    HealthStatus    @default(UNKNOWN)
  
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  
  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  resourceLogs    OrgWorkspaceResourceLog[]
}

// Resource usage history for org billing
model OrgWorkspaceResourceLog {
  id              String                @id @default(cuid())
  workspaceId     String
  
  // Snapshot
  ramUsedMb       Int
  cpuPercent      Float
  storageUsedMb   Int
  activeUsers     Int
  activePlugins   Int
  activeServices  Int
  
  periodStart     DateTime
  periodEnd       DateTime
  
  createdAt       DateTime              @default(now())
  
  workspace       OrganizationWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  
  @@index([workspaceId, periodStart])
}

// Inter-organization communication links
model OrgPartnerLink {
  id              String        @id @default(cuid())
  fromOrgId       String
  toOrgId         String
  
  // What can be shared
  allowedServices String[]      // Service IDs that can communicate
  
  // Status
  status          PartnerStatus @default(PENDING)
  requestedAt     DateTime      @default(now())
  acceptedAt      DateTime?
  
  fromOrg         Organization  @relation("OrgLinkFrom", fields: [fromOrgId], references: [id], onDelete: Cascade)
  toOrg           Organization  @relation("OrgLinkTo", fields: [toOrgId], references: [id], onDelete: Cascade)
  
  @@unique([fromOrgId, toOrgId])
  @@index([fromOrgId])
  @@index([toOrgId])
}

enum PartnerStatus {
  PENDING         // Request sent
  ACCEPTED        // Both sides approved
  REJECTED        // Declined
  REVOKED         // Was accepted, now revoked
}

// Password Reset Tokens
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  
  @@index([userId])
  @@index([expiresAt])
}

// User Quotas for rate limiting and plan enforcement
model UserQuota {
  id                  String   @id @default(cuid())
  userId              String   @unique
  
  // Daily limits
  dailyApiCalls       Int      @default(0)
  dailyServiceRuns    Int      @default(0)
  dailyAiTokens       Int      @default(0)
  
  // Monthly limits
  monthlyGatewayMsgs  Int      @default(0)
  monthlyStorageBytes BigInt   @default(0)
  
  // Reset timestamps
  lastResetDaily      DateTime @default(now())
  lastResetMonthly    DateTime @default(now())
  
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// ============================================
// WORKSPACE (Isolated User Environment)
// ============================================

// Each user has ONE workspace container with resource limits
model Workspace {
  id              String          @id @default(cuid())
  userId          String          @unique
  
  // Container identification
  containerId     String?         // Docker container ID when running
  containerStatus WorkspaceStatus @default(STOPPED)
  
  // Resource allocation (based on plan)
  ramMb           Int             @default(512)   // RAM in MB
  cpuCores        Float           @default(0.5)   // CPU cores (can be fractional)
  storageMb       Int             @default(100)   // Storage in MB
  
  // Resource usage (current)
  ramUsedMb       Int             @default(0)
  cpuUsedPercent  Float           @default(0)
  storageUsedMb   Int             @default(0)
  
  // Networking
  internalIp      String?
  internalPort    Int?
  
  // Upgrade handling (for zero-downtime)
  pendingUpgrade  Boolean         @default(false)
  newContainerId  String?         // New container during hot swap
  upgradeStatus   UpgradeStatus?  // Upgrade progress tracking
  
  // Lifecycle
  lastStartedAt   DateTime?
  lastStoppedAt   DateTime?
  lastHealthCheck DateTime?
  healthStatus    HealthStatus    @default(UNKNOWN)
  
  // Timestamps
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  resourceLogs    WorkspaceResourceLog[]
  
  @@index([containerStatus])
}

enum WorkspaceStatus {
  STOPPED         // Container not running
  STARTING        // Container is starting up
  RUNNING         // Container is running
  STOPPING        // Container is shutting down
  UPGRADING       // Container being upgraded (hot swap in progress)
  ERROR           // Container in error state
  SUSPENDED       // Suspended due to billing/abuse
}

enum UpgradeStatus {
  PENDING         // Upgrade requested
  PROVISIONING    // New container being created
  SYNCING         // State syncing to new container
  SWITCHING       // Traffic switching to new container
  CLEANUP         // Old container being removed
  COMPLETED       // Upgrade finished
  FAILED          // Upgrade failed, rolled back
}

enum HealthStatus {
  HEALTHY
  UNHEALTHY
  DEGRADED
  UNKNOWN
}

// Resource usage history for billing and analytics
model WorkspaceResourceLog {
  id            String    @id @default(cuid())
  workspaceId   String
  
  // Snapshot of resource usage
  ramUsedMb     Int
  cpuPercent    Float
  storageUsedMb Int
  activePlugins Int
  activeServices Int
  
  // Billing period
  periodStart   DateTime
  periodEnd     DateTime
  
  createdAt     DateTime  @default(now())
  
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  
  @@index([workspaceId, periodStart])
}

// Notifications
model Notification {
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String
  message   String
  data      Json?            // Additional data (link, action, etc.)
  isRead    Boolean          @default(false)
  readAt    DateTime?
  createdAt DateTime         @default(now())
  
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, isRead])
  @@index([createdAt])
}

enum NotificationType {
  INFO
  SUCCESS
  WARNING
  ERROR
  GATEWAY_STATUS
  PLUGIN_UPDATE
  SERVICE_COMPLETE
  SERVICE_ERROR
  BILLING
  SYSTEM
}

// Referral System
model ReferralCode {
  id        String     @id @default(cuid())
  userId    String     @unique
  code      String     @unique // e.g., "JOHN2BOT"
  uses      Int        @default(0)
  maxUses   Int?       // null = unlimited
  rewardPct Int        @default(20) // % discount for referee
  createdAt DateTime   @default(now())
  
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  referrals Referral[]
}

model Referral {
  id             String        @id @default(cuid())
  referrerId     String
  referredUserId String        @unique
  referralCodeId String
  status         ReferralStatus @default(PENDING)
  rewardAmount   Decimal?      @db.Decimal(10, 2)
  rewardPaidAt   DateTime?
  createdAt      DateTime      @default(now())
  
  referrer       User          @relation("ReferrerUser", fields: [referrerId], references: [id])
  referredUser   User          @relation("ReferredUser", fields: [referredUserId], references: [id])
  referralCode   ReferralCode  @relation(fields: [referralCodeId], references: [id])
  
  @@index([referrerId])
  @@index([referralCodeId])
}

enum ReferralStatus {
  PENDING     // User signed up but not paid
  QUALIFIED   // User made first payment
  REWARDED    // Referrer received reward
  EXPIRED     // Referral expired
}

// NextAuth.js Account (for OAuth providers)
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

// NextAuth.js Session
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  
  // ⭐ Device tracking for suspicious login detection
  ipAddress        String?          // IP at session creation
  userAgent        String?          // Browser/device info
  deviceFingerprint String?         // Device fingerprint hash
  country          String?          // GeoIP country code
  city             String?          // GeoIP city
  isTrusted        Boolean @default(false) // User marked as trusted device
  createdAt        DateTime @default(now())
  lastActiveAt     DateTime @default(now()) // Last activity timestamp
  
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([expires])         // ⭐ Index for cleanup job (delete expired sessions)
  @@index([userId, ipAddress]) // ⭐ For detecting new device logins
}

// ============================================
// TWO-FACTOR AUTHENTICATION ⭐ NEW
// ============================================

// TOTP (Time-based One-Time Password) configuration
model UserTwoFactor {
  id              String    @id @default(cuid())
  userId          String    @unique
  
  // TOTP Configuration
  secret          String              // Encrypted TOTP secret (base32)
  isEnabled       Boolean   @default(false)
  verifiedAt      DateTime?           // When 2FA was verified/enabled
  
  // Backup/Recovery codes (hashed)
  recoveryCodes   String[]            // Array of hashed recovery codes
  recoveryCodesGeneratedAt DateTime?
  recoveryCodesUsedCount Int @default(0)
  
  // Last usage tracking
  lastUsedAt      DateTime?
  failedAttempts  Int       @default(0)
  lockedUntil     DateTime?           // Temporary lockout after failures
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// WebAuthn/Passkey credentials (hardware keys, biometrics)
model UserWebAuthnCredential {
  id              String    @id @default(cuid())
  userId          String
  
  // WebAuthn credential data
  credentialId    String    @unique   // Base64 encoded credential ID
  publicKey       String              // Base64 encoded public key
  counter         Int       @default(0) // Sign counter for replay protection
  transports      String[]            // ['usb', 'ble', 'nfc', 'internal']
  
  // Metadata
  name            String              // User-friendly name ("YubiKey 5", "MacBook TouchID")
  aaguid          String?             // Authenticator AAGUID
  deviceType      String?             // 'hardware_key', 'platform', 'cross_platform'
  isBackupEligible Boolean @default(false)
  isBackedUp      Boolean  @default(false)
  
  // Usage tracking
  lastUsedAt      DateTime?
  usageCount      Int       @default(0)
  
  createdAt       DateTime  @default(now())
  
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([credentialId])
}

// NextAuth.js Verification Token (for email verification)
model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ============================================
// GATEWAYS
// ============================================

model Gateway {
  id          String        @id @default(cuid())
  userId      String
  type        GatewayType
  name        String
  config      Json          // Encrypted credentials
  status      GatewayStatus @default(DISCONNECTED)
  lastActive  DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  pluginGateways PluginGateway[]
  serviceSteps   ServiceStepGateway[]
  
  @@index([userId])
}

enum GatewayType {
  // Platform-Specific Gateways
  TELEGRAM_BOT        // Telegram Bot API
  TELEGRAM_USER       // Telegram MTProto (user account)
  DISCORD_BOT         // Discord Bot (future)
  SLACK_BOT           // Slack Bot (future)
  WHATSAPP_BUSINESS   // WhatsApp Business API (future)
  
  // Universal Gateways
  AI                  // AI/LLM (multiple providers: OpenAI, Gemini, Claude, etc.)
  WEBHOOK             // Custom HTTP endpoints (future)
  EMAIL               // Email services (future)
  
  // ⭐ EXTENSIBILITY: Adding new gateway types
  // To add a new gateway (e.g., TWITTER, SMS, CRM):
  // 1. Add to this enum (requires migration)
  // 2. Create gateway provider in src/modules/gateways/providers/
  // 3. Add to GATEWAY_TYPE_CONFIG below
  // 4. Add credential schema to gateway-schemas.ts
  // 5. Add frontend form in components/gateways/
  // 6. Register in gateway.registry.ts
}

// ⭐ EXTENSIBILITY: Gateway configuration (no migration for config changes)
const GATEWAY_TYPE_CONFIG = {
  TELEGRAM_BOT: {
    displayName: 'Telegram Bot',
    icon: 'bot',
    description: 'Connect your Telegram bot via Bot API',
    docsUrl: '/docs/gateways/telegram-bot',
    credentialFields: ['botToken'],
    features: ['sendMessage', 'receiveMessage', 'webhook', 'commands'],
    rateLimit: { requests: 30, window: 1000 },  // 30 req/sec
    tierRequired: 'FREE',
  },
  TELEGRAM_USER: {
    displayName: 'Telegram User Account',
    icon: 'user',
    description: 'Connect your personal Telegram account (MTProto)',
    docsUrl: '/docs/gateways/telegram-user',
    credentialFields: ['apiId', 'apiHash', 'phoneNumber'],
    features: ['readMessages', 'sendMessages', 'channels', 'groups'],
    rateLimit: { requests: 5, window: 1000 },   // Conservative to avoid ban
    tierRequired: 'STARTER',
    warning: 'May violate Telegram ToS - use at your own risk',
  },
  AI: {
    displayName: 'AI / LLM',
    icon: 'brain',
    description: 'Connect to AI providers (OpenAI, Gemini, Claude, etc.)',
    docsUrl: '/docs/gateways/ai',
    credentialFields: ['provider', 'apiKey', 'model'],
    features: ['chat', 'completion', 'embedding', 'moderation'],
    rateLimit: { requests: 60, window: 60000 }, // Provider limits vary
    tierRequired: 'FREE',
    subProviders: ['OPENAI', 'GOOGLE_GEMINI', 'ANTHROPIC', 'MISTRAL', 'GROQ', 'OLLAMA', 'CUSTOM'],
  },
  WEBHOOK: {
    displayName: 'Webhook / HTTP',
    icon: 'webhook',
    description: 'Connect to any HTTP endpoint',
    docsUrl: '/docs/gateways/webhook',
    credentialFields: ['baseUrl', 'authType', 'authValue'],
    features: ['get', 'post', 'put', 'delete', 'customHeaders'],
    rateLimit: { requests: 100, window: 60000 },
    tierRequired: 'STARTER',
  },
  // Add new gateways here - no code changes needed for basic setup!
};

// ============================================
// ⭐ EXTENSIBLE DASHBOARD SYSTEM
// ============================================
// This architecture allows adding new role-based dashboards
// without significant code changes

enum DashboardType {
  USER          // Regular user dashboard (default)
  ADMIN         // Platform administrator
  DEVELOPER     // Marketplace developer
  ORG_ADMIN     // Organization administrator
  SUPPORT       // Customer support agent (future)
  MODERATOR     // Content moderator (future)
  RESELLER      // White-label reseller (future)
  PARTNER       // Partner/affiliate (future)
}

// ⭐ EXTENSIBILITY: Dashboard configuration (add new roles easily)
const DASHBOARD_TYPE_CONFIG = {
  USER: {
    type: 'USER',
    displayName: 'Dashboard',
    routePrefix: '/dashboard',
    layoutComponent: 'DashboardLayout',
    icon: 'layout-dashboard',
    requiredRole: ['USER', 'ADMIN'],  // Who can access
    description: 'Main user dashboard for managing bots and services',
    navItems: [
      { label: 'Overview', href: '/dashboard', icon: 'home' },
      { label: 'Gateways', href: '/dashboard/gateways', icon: 'plug' },
      { label: 'Services', href: '/dashboard/services', icon: 'workflow' },
      { label: 'Marketplace', href: '/dashboard/marketplace', icon: 'store' },
      { label: 'My Items', href: '/dashboard/my-items', icon: 'package' },
      { label: 'Billing', href: '/dashboard/billing', icon: 'credit-card' },
      { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
    ],
    features: ['gateways', 'services', 'marketplace', 'billing', 'settings'],
  },
  ADMIN: {
    type: 'ADMIN',
    displayName: 'Admin Dashboard',
    routePrefix: '/admin',
    layoutComponent: 'AdminLayout',
    icon: 'shield-check',
    requiredRole: ['ADMIN', 'SUPER_ADMIN'],
    description: 'Platform administration and management',
    navItems: [
      { label: 'Overview', href: '/admin', icon: 'activity' },
      { label: 'Users', href: '/admin/users', icon: 'users' },
      { label: 'Organizations', href: '/admin/organizations', icon: 'building' },
      { label: 'Marketplace', href: '/admin/marketplace', icon: 'store' },
      { label: 'Billing', href: '/admin/billing', icon: 'dollar-sign' },
      { label: 'Feature Flags', href: '/admin/feature-flags', icon: 'flag' },
      { label: 'Announcements', href: '/admin/announcements', icon: 'megaphone' },
      { label: 'Support', href: '/admin/support', icon: 'life-buoy' },
      { label: 'System', href: '/admin/system', icon: 'server' },
      { label: 'Monitoring', href: '/admin/monitoring', icon: 'activity' },
      { label: 'Reports', href: '/admin/reports', icon: 'bar-chart' },
      { label: 'Audit Log', href: '/admin/audit-log', icon: 'clipboard-list' },
    ],
    features: [
      'user-management', 'org-management', 'marketplace-admin',
      'billing-admin', 'feature-flags', 'announcements',
      'support', 'system-settings', 'monitoring', 'reports', 'audit-log',
    ],
    permissions: [
      'users:read', 'users:write', 'users:delete', 'users:impersonate',
      'orgs:read', 'orgs:write', 'orgs:delete',
      'marketplace:review', 'marketplace:feature', 'marketplace:delist',
      'billing:read', 'billing:refund', 'billing:payout',
      'system:read', 'system:write', 'system:maintenance',
      'audit:read', 'audit:export',
    ],
  },
  DEVELOPER: {
    type: 'DEVELOPER',
    displayName: 'Developer Portal',
    routePrefix: '/developer',
    layoutComponent: 'DeveloperLayout',
    icon: 'code-2',
    requiredRole: ['DEVELOPER', 'ADMIN'],
    description: 'Marketplace developer dashboard',
    navItems: [
      { label: 'Overview', href: '/developer', icon: 'home' },
      { label: 'My Items', href: '/developer/items', icon: 'package' },
      { label: 'Submit New', href: '/developer/submit', icon: 'upload' },
      { label: 'Analytics', href: '/developer/analytics', icon: 'bar-chart' },
      { label: 'Reviews', href: '/developer/reviews', icon: 'star' },
      { label: 'Earnings', href: '/developer/earnings', icon: 'dollar-sign' },
      { label: 'Payouts', href: '/developer/payouts', icon: 'credit-card' },
      { label: 'Settings', href: '/developer/settings', icon: 'settings' },
    ],
    features: ['item-management', 'submissions', 'analytics', 'earnings', 'payouts'],
  },
  ORG_ADMIN: {
    type: 'ORG_ADMIN',
    displayName: 'Organization Admin',
    routePrefix: '/org',
    layoutComponent: 'OrgAdminLayout',
    icon: 'building-2',
    requiredRole: ['ORG_ADMIN', 'ORG_OWNER', 'ADMIN'],
    description: 'Organization management for enterprise customers',
    navItems: [
      { label: 'Overview', href: '/org', icon: 'home' },
      { label: 'Members', href: '/org/members', icon: 'users' },
      { label: 'Departments', href: '/org/departments', icon: 'folder-tree' },
      { label: 'Licenses', href: '/org/licenses', icon: 'key' },
      { label: 'Billing', href: '/org/billing', icon: 'credit-card' },
      { label: 'Analytics', href: '/org/analytics', icon: 'bar-chart' },
      { label: 'Settings', href: '/org/settings', icon: 'settings' },
    ],
    features: ['member-management', 'departments', 'licenses', 'org-billing', 'analytics'],
  },
  // ⭐ FUTURE: Add new dashboard types here
  // SUPPORT: { ... },      // Customer support agents
  // MODERATOR: { ... },    // Content moderators
  // RESELLER: { ... },     // White-label resellers
  // PARTNER: { ... },      // Affiliate partners
};

// ⭐ HOW TO ADD A NEW DASHBOARD TYPE:
// 1. Add new role to DashboardType enum above
// 2. Add configuration to DASHBOARD_TYPE_CONFIG above
// 3. Create route group: src/app/(newRole)/
// 4. Create layout: src/components/layouts/NewRoleLayout.tsx
// 5. Add role to User model if needed (see UserRole enum)
// 6. Add permission checks to middleware
// 7. Create navigation component using navItems from config

// Dashboard permission checker
function canAccessDashboard(userRole: UserRole, dashboardType: DashboardType): boolean {
  const config = DASHBOARD_TYPE_CONFIG[dashboardType];
  return config.requiredRole.includes(userRole);
}

// Get user's available dashboards
function getUserDashboards(userRoles: UserRole[]): DashboardType[] {
  return Object.entries(DASHBOARD_TYPE_CONFIG)
    .filter(([_, config]) => 
      config.requiredRole.some(role => userRoles.includes(role))
    )
    .map(([type]) => type as DashboardType);
}

// Dashboard navigation generator
function getDashboardNav(type: DashboardType) {
  return DASHBOARD_TYPE_CONFIG[type]?.navItems ?? [];
}

// ============================================
// ⭐ DASHBOARD ROUTING & SECURITY MIDDLEWARE
// ============================================

// src/middleware.ts - Next.js Edge Middleware
// This runs on EVERY request before it reaches your app

const MIDDLEWARE_CONFIG = `
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Route protection configuration
const ROUTE_PROTECTION = {
  // Public routes - anyone can access
  public: ['/', '/login', '/register', '/forgot-password', '/api/public/*', '/api/webhooks/*'],
  
  // Auth required but any role
  authenticated: ['/dashboard/*', '/api/v1/*'],
  
  // Role-specific routes
  roleRoutes: {
    '/admin/*': ['SUPER_ADMIN', 'ADMIN'],
    '/developer/*': ['DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    '/org/*': ['ORG_OWNER', 'ORG_ADMIN', 'ADMIN', 'SUPER_ADMIN'],
    '/api/v1/admin/*': ['SUPER_ADMIN', 'ADMIN'],
    '/api/v1/developer/*': ['DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
  },
  
  // Super admin only routes (even regular ADMIN can't access)
  superAdminOnly: [
    '/admin/system/danger-zone',
    '/admin/users/*/delete-permanent',
    '/admin/database/*',
    '/api/v1/admin/super/*',
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // ========================================
  // 1. SECURITY HEADERS (apply to ALL routes)
  // ========================================
  const response = NextResponse.next();
  
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection (legacy browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (disable dangerous features)
  response.headers.set('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  
  // Content Security Policy (customize per your needs)
  response.headers.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self' https://api.stripe.com; " +
    "frame-ancestors 'none';"
  );
  
  // ========================================
  // 2. PUBLIC ROUTES - Skip auth check
  // ========================================
  if (isPublicRoute(pathname)) {
    return response;
  }
  
  // ========================================
  // 3. GET USER SESSION
  // ========================================
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });
  
  // No session - redirect to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  const userRole = token.role as string;
  const userId = token.sub as string;
  
  // ========================================
  // 4. CHECK IF USER IS BANNED/SUSPENDED
  // ========================================
  // Cache this in Redis for performance
  const userStatus = await checkUserStatus(userId);
  
  if (userStatus === 'BANNED') {
    return NextResponse.redirect(new URL('/banned', request.url));
  }
  
  if (userStatus === 'SUSPENDED') {
    return NextResponse.redirect(new URL('/suspended', request.url));
  }
  
  // ========================================
  // 5. ROLE-BASED ACCESS CONTROL
  // ========================================
  
  // Super Admin Only routes
  if (matchesRoute(pathname, ROUTE_PROTECTION.superAdminOnly)) {
    if (userRole !== 'SUPER_ADMIN') {
      // Log unauthorized access attempt
      await logSecurityEvent({
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        userId,
        userRole,
        path: pathname,
        ip: request.ip,
      });
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }
  
  // Check role-specific routes
  for (const [routePattern, allowedRoles] of Object.entries(ROUTE_PROTECTION.roleRoutes)) {
    if (matchesRoute(pathname, [routePattern])) {
      if (!allowedRoles.includes(userRole)) {
        // Log unauthorized access attempt
        await logSecurityEvent({
          type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
          userId,
          userRole,
          path: pathname,
          requiredRoles: allowedRoles,
          ip: request.ip,
        });
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }
  }
  
  // ========================================
  // 6. ADMIN ROUTE ADDITIONAL SECURITY
  // ========================================
  if (pathname.startsWith('/admin')) {
    // Require recent authentication for admin routes (re-auth if session > 30 min)
    const sessionAge = Date.now() - (token.iat as number * 1000);
    const MAX_ADMIN_SESSION_AGE = 30 * 60 * 1000; // 30 minutes
    
    if (sessionAge > MAX_ADMIN_SESSION_AGE) {
      const reAuthUrl = new URL('/admin/re-authenticate', request.url);
      reAuthUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(reAuthUrl);
    }
    
    // Log all admin route access
    await logAdminAccess({
      userId,
      path: pathname,
      method: request.method,
      ip: request.ip,
      userAgent: request.headers.get('user-agent'),
    });
  }
  
  // ========================================
  // 7. RATE LIMITING (by route type)
  // ========================================
  const rateLimitResult = await checkRateLimit({
    userId,
    ip: request.ip,
    route: pathname,
    method: request.method,
  });
  
  if (!rateLimitResult.allowed) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': rateLimitResult.retryAfter.toString(),
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimitResult.reset.toString(),
      },
    });
  }
  
  return response;
}

// Route matcher helper
function matchesRoute(pathname: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (pattern.endsWith('/*')) {
      return pathname.startsWith(pattern.slice(0, -2));
    }
    return pathname === pattern;
  });
}

function isPublicRoute(pathname: string): boolean {
  return matchesRoute(pathname, ROUTE_PROTECTION.public);
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
`;

// ============================================
// ⭐ POST-LOGIN REDIRECT LOGIC
// ============================================

const POST_LOGIN_REDIRECT = `
// src/app/api/auth/[...nextauth]/route.ts - NextAuth callbacks

callbacks: {
  async redirect({ url, baseUrl, token }) {
    // After login, redirect to appropriate dashboard based on role
    
    // If there's a callback URL, use it (unless it's a different domain)
    if (url.startsWith(baseUrl)) {
      return url;
    }
    
    // Default redirects based on role
    const role = token?.role as string;
    
    switch (role) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return \`\${baseUrl}/admin\`;
      
      case 'DEVELOPER':
        // Developers also have user access, default to developer portal
        return \`\${baseUrl}/developer\`;
      
      case 'SUPPORT':
        return \`\${baseUrl}/admin/support\`; // Support queue
      
      case 'MODERATOR':
        return \`\${baseUrl}/admin/marketplace/submissions\`; // Review queue
      
      case 'ORG_OWNER':
      case 'ORG_ADMIN':
        // Check if user has personal account too
        if (token?.hasPersonalAccount) {
          return \`\${baseUrl}/dashboard\`; // Let them choose
        }
        return \`\${baseUrl}/org\`;
      
      default:
        return \`\${baseUrl}/dashboard\`;
    }
  },
  
  async jwt({ token, user, trigger }) {
    // Add role to JWT token
    if (user) {
      token.role = user.role;
      token.organizationId = user.organizationId;
      token.hasPersonalAccount = !user.organizationId;
    }
    return token;
  },
  
  async session({ session, token }) {
    // Add role to session
    session.user.role = token.role;
    session.user.organizationId = token.organizationId;
    session.user.hasPersonalAccount = token.hasPersonalAccount;
    return session;
  },
}
`;

// ============================================
// ⭐ CONTEXT & DASHBOARD SWITCHER SYSTEM
// ============================================
// Two separate concepts:
// 1. CONTEXT SWITCHER: Personal vs Organization (WHO am I acting as?)
// 2. DASHBOARD SWITCHER: Dashboard type based on roles (WHAT view?)
//
// VISIBILITY RULES:
// - Context Switcher: ONLY show if user belongs to 1+ organizations
// - Dashboard Switcher: ONLY show if user has access to 2+ dashboard types
// - If only 1 option → HIDE the switcher completely

// ============================================
// ⭐ CONTEXT SWITCHER (Personal vs Organization)
// ============================================

const CONTEXT_SWITCHER = `
// src/components/layout/context-switcher.tsx
// Allows user to switch between Personal account and Organization context

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useContext, createContext, useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { User, Building2, ChevronDown, Check, Plus } from 'lucide-react';

// Context for current organization/personal mode
interface WorkspaceContext {
  type: 'personal' | 'organization';
  organizationId: string | null;
  organizationName: string | null;
  organizationRole: string | null; // User's role in this org
}

const WorkspaceContextContext = createContext<{
  context: WorkspaceContext;
  setContext: (ctx: WorkspaceContext) => void;
  organizations: Organization[];
} | null>(null);

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContextContext);
  if (!ctx) throw new Error('useWorkspaceContext must be used within provider');
  return ctx;
}

// ⭐ CONTEXT SWITCHER COMPONENT
export function ContextSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();
  const { context, setContext, organizations } = useWorkspaceContext();
  
  if (!session?.user) return null;
  
  // ⭐ RULE: Don't show if user has no organizations
  if (organizations.length === 0) return null;
  
  const handleSwitch = (newContext: WorkspaceContext) => {
    setContext(newContext);
    
    // Store in localStorage for persistence
    localStorage.setItem('workspace_context', JSON.stringify(newContext));
    
    // Redirect to dashboard (content will change based on context)
    router.push('/dashboard');
  };
  
  const currentLabel = context.type === 'personal' 
    ? session.user.name || 'Personal'
    : context.organizationName;
  
  const CurrentIcon = context.type === 'personal' ? User : Building2;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-3">
          <CurrentIcon className="h-4 w-4" />
          <span className="max-w-[150px] truncate">{currentLabel}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch Context</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Personal Account Option */}
        <DropdownMenuItem
          onClick={() => handleSwitch({
            type: 'personal',
            organizationId: null,
            organizationName: null,
            organizationRole: null,
          })}
          className="gap-2 cursor-pointer"
        >
          <User className="h-4 w-4" />
          <span className="flex-1">{session.user.name || 'Personal'}</span>
          <span className="text-xs text-muted-foreground">Personal</span>
          {context.type === 'personal' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        
        {/* Organization Options */}
        {organizations.map(org => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch({
              type: 'organization',
              organizationId: org.id,
              organizationName: org.name,
              organizationRole: org.memberRole,
            })}
            className="gap-2 cursor-pointer"
          >
            {org.logo ? (
              <img src={org.logo} className="h-4 w-4 rounded" alt="" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            <span className="flex-1 truncate">{org.name}</span>
            <span className="text-xs text-muted-foreground">{org.memberRole}</span>
            {context.organizationId === org.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push('/org/create')}
          className="gap-2 cursor-pointer text-muted-foreground"
        >
          <Plus className="h-4 w-4" />
          <span>Create Organization</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
`;

// ============================================
// ⭐ DASHBOARD TYPE SWITCHER (Role-based)
// ============================================

const DASHBOARD_SWITCHER = `
// src/components/layout/dashboard-switcher.tsx
// Only shows if user has access to MULTIPLE dashboard types

'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspaceContext } from './context-switcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Shield, 
  Code2, 
  Building2, 
  ChevronDown,
  Check 
} from 'lucide-react';

// Dashboard type definitions
const DASHBOARD_TYPES = {
  USER: {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    description: 'Manage your bots and services',
    // Available to these platform roles
    platformRoles: ['MEMBER', 'OWNER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    // No org role required (everyone can use dashboard)
    orgRoles: null,
  },
  ADMIN: {
    label: 'Admin Panel',
    icon: Shield,
    path: '/admin',
    description: 'Platform administration',
    platformRoles: ['ADMIN', 'SUPER_ADMIN'],
    orgRoles: null, // Platform role only
  },
  DEVELOPER: {
    label: 'Developer Portal',
    icon: Code2,
    path: '/developer',
    description: 'Manage marketplace items',
    platformRoles: ['DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    orgRoles: null, // Platform role only
  },
  ORG_ADMIN: {
    label: 'Org Settings',
    icon: Building2,
    path: '/org',
    description: 'Organization management',
    platformRoles: null, // Org role only
    orgRoles: ['ORG_OWNER', 'ORG_ADMIN'], // Only when in org context
  },
};

export function DashboardSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { context } = useWorkspaceContext();
  
  if (!session?.user) return null;
  
  const userPlatformRole = session.user.role;
  const userOrgRole = context.organizationRole;
  const isInOrgContext = context.type === 'organization';
  
  // Calculate which dashboards user can access
  const availableDashboards = Object.entries(DASHBOARD_TYPES)
    .filter(([key, config]) => {
      // Check platform role
      if (config.platformRoles?.includes(userPlatformRole)) {
        return true;
      }
      
      // Check org role (only if in org context)
      if (isInOrgContext && config.orgRoles?.includes(userOrgRole)) {
        return true;
      }
      
      return false;
    })
    .map(([key, config]) => ({ key, ...config }));
  
  // ⭐ RULE: Don't show switcher if user only has access to ONE dashboard
  if (availableDashboards.length <= 1) {
    return null; // Hide completely
  }
  
  // Find current dashboard based on pathname
  const currentDashboard = availableDashboards.find(d => 
    pathname.startsWith(d.path)
  ) || availableDashboards[0];
  
  const CurrentIcon = currentDashboard.icon;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CurrentIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{currentDashboard.label}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch View</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableDashboards.map(dashboard => {
          const Icon = dashboard.icon;
          const isActive = pathname.startsWith(dashboard.path);
          
          return (
            <DropdownMenuItem
              key={dashboard.key}
              onClick={() => router.push(dashboard.path)}
              className="gap-2 cursor-pointer"
            >
              <Icon className="h-4 w-4" />
              <div className="flex-1">
                <div>{dashboard.label}</div>
                <div className="text-xs text-muted-foreground">
                  {dashboard.description}
                </div>
              </div>
              {isActive && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
`;

// ============================================
// ⭐ COMBINED HEADER WITH BOTH SWITCHERS
// ============================================

const HEADER_WITH_SWITCHERS = `
// src/components/layout/header.tsx

export function Header() {
  return (
    <header className="border-b bg-background">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Bot className="h-6 w-6" />
          <span>2Bot</span>
        </Link>
        
        {/* ⭐ Context Switcher (Personal vs Org) */}
        {/* Only renders if user has organizations */}
        <ContextSwitcher />
        
        <div className="flex-1" />
        
        {/* ⭐ Dashboard Type Switcher */}
        {/* Only renders if user has multiple dashboard types */}
        <DashboardSwitcher />
        
        {/* User Menu */}
        <UserMenu />
      </div>
    </header>
  );
}

// Visual example of header states:

// ┌─────────────────────────────────────────────────────────────────┐
// │ 🤖 2Bot                                              [👤 John ▼]│
// └─────────────────────────────────────────────────────────────────┘
// ↑ User with no orgs and only MEMBER role (no switchers shown)

// ┌─────────────────────────────────────────────────────────────────┐
// │ 🤖 2Bot   [👤 Personal ▼]                            [👤 John ▼]│
// └─────────────────────────────────────────────────────────────────┘
// ↑ User with 1+ orgs but only MEMBER role (only context switcher)

// ┌─────────────────────────────────────────────────────────────────┐
// │ 🤖 2Bot                        [📊 Dashboard ▼]      [👤 John ▼]│
// └─────────────────────────────────────────────────────────────────┘
// ↑ DEVELOPER with no orgs (only dashboard switcher: Dashboard + Developer)

// ┌─────────────────────────────────────────────────────────────────┐
// │ 🤖 2Bot   [🏢 ABC Co ▼]        [📊 Dashboard ▼]      [👤 John ▼]│
// └─────────────────────────────────────────────────────────────────┘
// ↑ ADMIN in org context (both switchers shown)
`;

// ============================================
// ⭐ WORKSPACE CONTEXT PROVIDER
// ============================================

const WORKSPACE_CONTEXT_PROVIDER = `
// src/providers/workspace-context-provider.tsx

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

interface Organization {
  id: string;
  name: string;
  logo: string | null;
  memberRole: 'ORG_OWNER' | 'ORG_ADMIN' | 'DEPT_MANAGER' | 'ORG_MEMBER';
}

interface WorkspaceContext {
  type: 'personal' | 'organization';
  organizationId: string | null;
  organizationName: string | null;
  organizationRole: string | null;
}

interface WorkspaceContextValue {
  context: WorkspaceContext;
  setContext: (ctx: WorkspaceContext) => void;
  organizations: Organization[];
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceContext must be used within WorkspaceContextProvider');
  return ctx;
}

export function WorkspaceContextProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [context, setContextState] = useState<WorkspaceContext>({
    type: 'personal',
    organizationId: null,
    organizationName: null,
    organizationRole: null,
  });
  
  // Fetch user's organizations
  useEffect(() => {
    if (session?.user) {
      fetchOrganizations();
      loadSavedContext();
    }
  }, [session]);
  
  async function fetchOrganizations() {
    try {
      const res = await fetch('/api/v1/user/organizations');
      const data = await res.json();
      setOrganizations(data.organizations || []);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setIsLoading(false);
    }
  }
  
  function loadSavedContext() {
    const saved = localStorage.getItem('workspace_context');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validate the saved org still exists
        setContextState(parsed);
      } catch {
        // Invalid saved context, use default
      }
    }
  }
  
  function setContext(newContext: WorkspaceContext) {
    setContextState(newContext);
    localStorage.setItem('workspace_context', JSON.stringify(newContext));
  }
  
  return (
    <WorkspaceContext.Provider value={{ context, setContext, organizations, isLoading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
`;

// ============================================
// ⭐ API CALLS WITH CONTEXT
// ============================================

const API_WITH_CONTEXT = `
// src/lib/api-client.ts
// All API calls automatically include the current workspace context

import { useWorkspaceContext } from '@/providers/workspace-context-provider';

class ApiClient {
  private getContextHeaders(): Record<string, string> {
    // Get context from localStorage (or could use a global store)
    const saved = localStorage.getItem('workspace_context');
    if (saved) {
      const context = JSON.parse(saved);
      if (context.type === 'organization' && context.organizationId) {
        return {
          'X-Organization-Id': context.organizationId,
        };
      }
    }
    return {};
  }
  
  async fetch(url: string, options: RequestInit = {}) {
    const contextHeaders = this.getContextHeaders();
    
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...contextHeaders,
        ...options.headers,
      },
    });
  }
  
  // Convenience methods
  async get(url: string) {
    return this.fetch(url, { method: 'GET' });
  }
  
  async post(url: string, data: any) {
    return this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();

// Usage in components:
// const { data } = await api.get('/api/v1/gateways');
// If user is in org context, returns org's gateways
// If user is in personal context, returns user's personal gateways
`;

// ============================================
// ⭐ BACKEND: CONTEXT-AWARE API MIDDLEWARE
// ============================================

const BACKEND_CONTEXT_MIDDLEWARE = `
// src/middleware/workspace-context.middleware.ts
// Server-side middleware that reads X-Organization-Id header

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

interface WorkspaceContext {
  userId: string;
  organizationId: string | null;
  isOrgContext: boolean;
  orgRole: string | null;
}

export async function getWorkspaceContext(request: NextRequest): Promise<WorkspaceContext> {
  const token = await getToken({ req: request });
  if (!token?.sub) throw new Error('Unauthorized');
  
  const userId = token.sub;
  const orgId = request.headers.get('X-Organization-Id');
  
  // Personal context
  if (!orgId) {
    return {
      userId,
      organizationId: null,
      isOrgContext: false,
      orgRole: null,
    };
  }
  
  // Organization context - verify membership
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId,
      },
    },
  });
  
  if (!membership) {
    throw new Error('Not a member of this organization');
  }
  
  return {
    userId,
    organizationId: orgId,
    isOrgContext: true,
    orgRole: membership.role,
  };
}

// Usage in API routes:
// export async function GET(request: NextRequest) {
//   const context = await getWorkspaceContext(request);
//   
//   if (context.isOrgContext) {
//     // Return org's gateways
//     return prisma.gateway.findMany({
//       where: { organizationId: context.organizationId }
//     });
//   } else {
//     // Return user's personal gateways
//     return prisma.gateway.findMany({
//       where: { userId: context.userId, organizationId: null }
//     });
//   }
// }
`;

// ============================================
// ⭐ VISIBILITY RULES SUMMARY
// ============================================

/*
SWITCHER VISIBILITY RULES:

┌─────────────────────────────────────────────────────────────────────┐
│ CONTEXT SWITCHER (Personal vs Organization)                        │
├─────────────────────────────────────────────────────────────────────┤
│ Show if:  User belongs to 1 or more organizations                  │
│ Hide if:  User has no organization memberships                     │
│                                                                     │
│ Options shown:                                                      │
│ - "Personal" (always)                                               │
│ - Each organization user belongs to                                 │
│ - "Create Organization" link                                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ DASHBOARD SWITCHER (Dashboard Type)                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Show if:  User has access to 2+ dashboard types                    │
│ Hide if:  User has access to only 1 dashboard type                 │
│                                                                     │
│ Options based on roles:                                             │
│ - Dashboard: Everyone                                               │
│ - Admin Panel: ADMIN, SUPER_ADMIN only                             │
│ - Developer Portal: DEVELOPER, ADMIN, SUPER_ADMIN only             │
│ - Org Settings: ORG_OWNER, ORG_ADMIN (only when in org context)    │
└─────────────────────────────────────────────────────────────────────┘

EXAMPLES:

User Type                    Context Switcher    Dashboard Switcher
─────────────────────────────────────────────────────────────────────
Regular user, no org         ❌ Hidden           ❌ Hidden
Regular user, 1 org          ✅ Shown            ❌ Hidden  
Regular user, 2 orgs         ✅ Shown            ❌ Hidden
Developer, no org            ❌ Hidden           ✅ Shown (Dashboard, Developer)
Developer, 1 org             ✅ Shown            ✅ Shown (Dashboard, Developer)
Admin, no org                ❌ Hidden           ✅ Shown (Dashboard, Developer, Admin)
Admin, is ORG_ADMIN          ✅ Shown            ✅ Shown (all 4 options when in org)
*/

`;

// ============================================
// ⭐ ADMIN RE-AUTHENTICATION (Enhanced Security)
// ============================================

const ADMIN_REAUTH = `
// src/app/(admin)/admin/re-authenticate/page.tsx
// Requires admin to re-enter password for sensitive operations

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function AdminReAuthenticate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin';
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const result = await signIn('credentials', {
        password,
        reauth: true, // Flag for re-authentication
        redirect: false,
      });
      
      if (result?.error) {
        setError('Invalid password. Please try again.');
      } else {
        // Update session timestamp
        router.push(callbackUrl);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-6">
          <Shield className="h-12 w-12 mx-auto text-orange-500 mb-4" />
          <h1 className="text-2xl font-bold">Security Check</h1>
          <p className="text-gray-600 mt-2">
            Please re-enter your password to continue to the admin area.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            This is required for your security after 30 minutes of inactivity.
          </p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Continue to Admin'}
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            Return to Dashboard instead
          </a>
        </div>
      </div>
    </div>
  );
}
`;

// ============================================
// ⭐ IMPERSONATION SECURITY
// ============================================

const IMPERSONATION_SECURITY = `
// Admin impersonation - "Login as User" feature
// CRITICAL: Must have extensive logging and safeguards

// src/lib/impersonation.ts

interface ImpersonationSession {
  adminId: string;         // Who is impersonating
  adminEmail: string;
  targetUserId: string;    // Who is being impersonated
  targetEmail: string;
  reason: string;          // Required reason for audit
  startedAt: Date;
  expiresAt: Date;         // Auto-expires after 30 minutes
  allowedActions: string[];// What the admin can do
}

// Allowed actions while impersonating (NO sensitive actions)
const IMPERSONATION_ALLOWED_ACTIONS = [
  'view_dashboard',
  'view_gateways',
  'view_services',
  'view_settings',
  'view_billing',        // View only, not modify
  // NOT ALLOWED:
  // - change_password
  // - update_email
  // - delete_account
  // - make_purchases
  // - modify_billing
];

// Start impersonation
async function startImpersonation(
  adminId: string,
  targetUserId: string,
  reason: string
): Promise<ImpersonationSession> {
  // 1. Verify admin has permission
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!['SUPER_ADMIN', 'ADMIN'].includes(admin?.role)) {
    throw new Error('Unauthorized');
  }
  
  // 2. Cannot impersonate other admins (unless SUPER_ADMIN)
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (['SUPER_ADMIN', 'ADMIN'].includes(target?.role) && admin?.role !== 'SUPER_ADMIN') {
    throw new Error('Cannot impersonate admin users');
  }
  
  // 3. Create impersonation session
  const session: ImpersonationSession = {
    adminId,
    adminEmail: admin.email,
    targetUserId,
    targetEmail: target.email,
    reason,
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    allowedActions: IMPERSONATION_ALLOWED_ACTIONS,
  };
  
  // 4. Store in Redis
  await redis.setex(
    \`impersonation:\${adminId}\`,
    30 * 60, // 30 minutes
    JSON.stringify(session)
  );
  
  // 5. Log the impersonation start
  await prisma.adminAuditLog.create({
    data: {
      adminId,
      adminEmail: admin.email,
      action: 'user.impersonate.start',
      targetType: 'user',
      targetId: targetUserId,
      targetEmail: target.email,
      reason,
      ipAddress: getClientIp(),
      userAgent: getUserAgent(),
    },
  });
  
  // 6. Send notification to user (optional, for transparency)
  await sendEmail({
    to: target.email,
    subject: '2Bot Support Access Notification',
    template: 'support-access',
    data: {
      adminEmail: admin.email,
      reason,
      startedAt: session.startedAt,
    },
  });
  
  return session;
}

// End impersonation
async function endImpersonation(adminId: string): Promise<void> {
  const sessionData = await redis.get(\`impersonation:\${adminId}\`);
  if (sessionData) {
    const session = JSON.parse(sessionData) as ImpersonationSession;
    
    // Log impersonation end
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        adminEmail: session.adminEmail,
        action: 'user.impersonate.end',
        targetType: 'user',
        targetId: session.targetUserId,
        targetEmail: session.targetEmail,
        metadata: {
          duration: Date.now() - session.startedAt.getTime(),
        },
        ipAddress: getClientIp(),
        userAgent: getUserAgent(),
      },
    });
  }
  
  await redis.del(\`impersonation:\${adminId}\`);
}

// UI indicator when impersonating
// Shows banner: "⚠️ You are viewing as john@example.com [End Session]"
`;

// ============================================
// ⭐ SECURITY LOGGING & MONITORING
// ============================================

const SECURITY_LOGGING = `
// src/lib/security-logging.ts

// All security events are logged for monitoring and alerting

enum SecurityEventType {
  // Authentication
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGIN_BLOCKED = 'auth.login.blocked',  // Too many failures
  LOGOUT = 'auth.logout',
  PASSWORD_CHANGE = 'auth.password.change',
  PASSWORD_RESET_REQUEST = 'auth.password.reset_request',
  MFA_ENABLED = 'auth.mfa.enabled',
  MFA_DISABLED = 'auth.mfa.disabled',
  
  // Authorization
  UNAUTHORIZED_ACCESS_ATTEMPT = 'authz.unauthorized',
  PERMISSION_DENIED = 'authz.permission_denied',
  ROLE_CHANGED = 'authz.role_change',
  
  // Admin actions
  ADMIN_LOGIN = 'admin.login',
  ADMIN_REAUTH = 'admin.reauth',
  ADMIN_IMPERSONATE_START = 'admin.impersonate.start',
  ADMIN_IMPERSONATE_END = 'admin.impersonate.end',
  ADMIN_USER_BAN = 'admin.user.ban',
  ADMIN_USER_UNBAN = 'admin.user.unban',
  ADMIN_USER_SUSPEND = 'admin.user.suspend',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'ratelimit.exceeded',
  
  // API
  API_KEY_CREATED = 'api.key.created',
  API_KEY_REVOKED = 'api.key.revoked',
  API_KEY_USED_AFTER_REVOKE = 'api.key.revoked_usage',
  
  // Suspicious activity
  SUSPICIOUS_IP = 'suspicious.ip',
  SUSPICIOUS_PATTERN = 'suspicious.pattern',
  CREDENTIAL_STUFFING_DETECTED = 'suspicious.credential_stuffing',
}

interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  userEmail?: string;
  ip: string;
  userAgent?: string;
  path?: string;
  method?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  // 1. Store in database
  await prisma.securityLog.create({
    data: {
      type: event.type,
      userId: event.userId,
      userEmail: event.userEmail,
      ipAddress: event.ip,
      userAgent: event.userAgent,
      path: event.path,
      method: event.method,
      metadata: event.metadata,
      timestamp: event.timestamp || new Date(),
    },
  });
  
  // 2. Send to monitoring system (Grafana, Datadog, etc.)
  metrics.increment(\`security_event.\${event.type}\`);
  
  // 3. Check for alert conditions
  await checkSecurityAlerts(event);
}

// Alert thresholds
const SECURITY_ALERTS = {
  // Too many failed logins from same IP
  failedLoginsPerIp: { threshold: 10, window: '5m', action: 'block_ip' },
  
  // Too many failed logins for same user
  failedLoginsPerUser: { threshold: 5, window: '15m', action: 'lock_account' },
  
  // Unauthorized access attempts
  unauthorizedAttempts: { threshold: 5, window: '1m', action: 'alert_admin' },
  
  // Admin impersonation
  adminImpersonation: { threshold: 1, window: '1h', action: 'notify_slack' },
};

async function checkSecurityAlerts(event: SecurityEvent): Promise<void> {
  // Check if event triggers any alerts
  if (event.type === SecurityEventType.LOGIN_FAILURE) {
    const failuresFromIp = await countRecentEvents(
      SecurityEventType.LOGIN_FAILURE,
      { ip: event.ip },
      '5m'
    );
    
    if (failuresFromIp >= SECURITY_ALERTS.failedLoginsPerIp.threshold) {
      // Block IP temporarily
      await blockIp(event.ip, '1h');
      await notifySecurityTeam('IP blocked due to failed logins', event);
    }
  }
  
  if (event.type === SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPT) {
    await notifySlack(\`⚠️ Unauthorized access attempt: \${event.userId} tried to access \${event.path}\`);
  }
}
`;

enum GatewayStatus {
  CONNECTED
  DISCONNECTED
  ERROR
  CONFIGURING
}

// ============================================
// MARKETPLACE ITEMS (Base for all types)
// ============================================

model MarketplaceItem {
  id              String           @id @default(cuid())
  slug            String           @unique
  type            MarketplaceType
  name            String
  description     String
  longDescription String?          @db.Text
  icon            String?
  screenshots     String[]         // Array of URLs
  category        String
  tags            String[]
  dependencies    String[]         // ⭐ Plugin IDs this item depends on
  minPlanRequired PlanType         @default(FREE) // ⭐ Minimum plan to use this item
  version         String
  author          String
  authorUrl       String?
  developerId     String?          // ⭐ Link to Developer account (null for official items)
  price           Decimal          @default(0) @db.Decimal(10, 2)
  priceType       PriceType        @default(FREE)
  revenueShare    Int              @default(70)  // ⭐ Developer's share % (default 70%)
  isOfficial      Boolean          @default(false)
  isActive        Boolean          @default(true)
  installCount    Int              @default(0)
  rating          Float            @default(0)
  reviewCount     Int              @default(0)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  
  // Type-specific config stored as JSON
  config          Json             // Different schema per type
  
  // Relations
  developer       Developer?       @relation(fields: [developerId], references: [id])
  reviews         ItemReview[]
  userPlugins     UserPlugin[]
  userThemes      UserTheme[]
  userWidgets     UserWidget[]
  userServices    UserService[]
  purchases       Purchase[]      // ⭐ One-time purchase records
  
  @@index([type])
  @@index([category])
  @@index([minPlanRequired])      // ⭐ For filtering by plan
  @@index([developerId])          // ⭐ For developer dashboard
}

enum MarketplaceType {
  PLUGIN
  THEME
  WIDGET
  SERVICE
  // ⭐ EXTENSIBILITY: Adding new types
  // To add a new marketplace type (e.g., TEMPLATE, CONNECTOR, INTEGRATION):
  // 1. Add to this enum (requires migration)
  // 2. Create UserXxx model (e.g., UserTemplate)
  // 3. Add relation to MarketplaceItem
  // 4. Add API routes (/api/user/templates/*)
  // 5. Add frontend pages (/marketplace/templates)
  // 6. Add to MARKETPLACE_TYPE_CONFIG below
}

// ⭐ EXTENSIBILITY: Type configuration (no migration needed for config changes)
// This allows adding new categories, changing behavior without DB changes
const MARKETPLACE_TYPE_CONFIG = {
  PLUGIN: {
    displayName: 'Plugins',
    icon: 'puzzle',
    description: 'Single-purpose automation modules',
    allowCustom: false,           // Can users create custom plugins?
    requiresGateway: true,        // Must connect to gateway?
    maxPerUser: 25,               // Plan-based limit key
    categories: ['Analytics', 'Automation', 'Communication', 'HR', 'Marketing', 'Moderation', 'Utility'],
  },
  THEME: {
    displayName: 'Themes',
    icon: 'palette',
    description: 'Dashboard visual customization',
    allowCustom: true,
    requiresGateway: false,
    maxPerUser: 1,                // Only one active theme
    categories: ['Light', 'Dark', 'Colorful', 'Minimal', 'Professional'],
  },
  WIDGET: {
    displayName: 'Widgets',
    icon: 'layout-grid',
    description: 'Dashboard display components',
    allowCustom: false,
    requiresGateway: false,
    maxPerUser: 20,
    categories: ['Analytics', 'Charts', 'Status', 'Activity', 'Utility'],
  },
  SERVICE: {
    displayName: 'Services',
    icon: 'workflow',
    description: 'Multi-step automation workflows',
    allowCustom: true,            // Users can create custom services
    requiresGateway: true,
    maxPerUser: 15,
    categories: ['Content', 'Marketing', 'HR', 'Sales', 'Support', 'Integration'],
  },
};

enum PriceType {
  FREE
  ONE_TIME
  MONTHLY
  YEARLY
}

// Item Reviews
model ItemReview {
  id        String          @id @default(cuid())
  itemId    String
  userId    String
  rating    Int             // 1-5
  title     String?
  content   String?         @db.Text
  isVerified Boolean        @default(false) // ⭐ Verified purchase review
  helpfulCount Int          @default(0)     // ⭐ "Was this helpful?" count
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  
  item      MarketplaceItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade) // ⭐ User relation
  
  @@unique([itemId, userId])
  @@index([itemId])
  @@index([userId])                         // ⭐ For user's reviews
  @@index([itemId, rating])                 // ⭐ For rating aggregation
}

// ============================================
// USER INSTALLED ITEMS
// ============================================

// User's Installed Plugins
model UserPlugin {
  id          String          @id @default(cuid())
  userId      String
  itemId      String          // References MarketplaceItem
  config      Json            // User's plugin configuration
  state       Json?           // Plugin runtime state
  isEnabled   Boolean         @default(true)
  installedAt DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  deletedAt   DateTime?       // ⭐ Soft delete support
  
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  item        MarketplaceItem @relation(fields: [itemId], references: [id])
  gateways    PluginGateway[]
  
  @@unique([userId, itemId])
  @@index([userId])
  @@index([deletedAt])        // ⭐ Index for soft delete queries
}

// Plugin-Gateway Connections
model PluginGateway {
  id           String     @id @default(cuid())
  userPluginId String
  gatewayId    String
  role         String?    // e.g., "source", "target", "ai"
  config       Json?
  
  userPlugin   UserPlugin @relation(fields: [userPluginId], references: [id], onDelete: Cascade)
  gateway      Gateway    @relation(fields: [gatewayId], references: [id], onDelete: Cascade)
  
  @@unique([userPluginId, gatewayId])
}

// User's Active Theme
model UserTheme {
  id          String          @id @default(cuid())
  userId      String          @unique
  itemId      String          // References MarketplaceItem (THEME type)
  customVars  Json?           // User's custom overrides
  activatedAt DateTime        @default(now())
  
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  item        MarketplaceItem @relation(fields: [itemId], references: [id])
}

// User's Dashboard Widgets
model UserWidget {
  id          String          @id @default(cuid())
  userId      String
  itemId      String          // References MarketplaceItem (WIDGET type)
  gridX       Int             // Grid column position (0-based)
  gridY       Int             // Grid row position (0-based)
  width       Int             @default(2) // Grid columns span
  height      Int             @default(1) // Grid rows span
  config      Json?           // User's widget configuration
  isVisible   Boolean         @default(true)
  addedAt     DateTime        @default(now())
  deletedAt   DateTime?       // ⭐ Soft delete support
  
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  item        MarketplaceItem @relation(fields: [itemId], references: [id])
  
  @@index([userId])
  @@index([deletedAt])        // ⭐ Index for soft delete queries
}

enum WidgetSize {
  SMALL       // 1x1 (width: 1, height: 1)
  MEDIUM      // 2x1 (width: 2, height: 1)
  LARGE       // 2x2 (width: 2, height: 2)
  EXTRA_LARGE // 4x2 (width: 4, height: 2)
}

// Widget size to grid dimensions mapping
const WIDGET_SIZE_MAP = {
  SMALL:       { width: 1, height: 1 },
  MEDIUM:      { width: 2, height: 1 },
  LARGE:       { width: 2, height: 2 },
  EXTRA_LARGE: { width: 4, height: 2 },
};

// ============================================
// SERVICES (WORKFLOWS)
// ============================================

// User's Installed/Created Services
model UserService {
  id          String          @id @default(cuid())
  userId      String
  itemId      String?         // NULL if custom, references MarketplaceItem if from marketplace
  name        String
  description String?
  isEnabled   Boolean         @default(true)
  config      Json            // User's service configuration
  
  // Trigger configuration
  triggerType TriggerType
  triggerConfig Json          // Schedule cron, event name, webhook URL, etc.
  
  // Workflow steps (stored as JSON for flexibility)
  steps       Json            // Array of step definitions
  
  // Status
  status      ServiceStatus   @default(IDLE)
  lastRunAt   DateTime?
  nextRunAt   DateTime?
  
  installedAt DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  deletedAt   DateTime?       // ⭐ Soft delete support
  
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  item        MarketplaceItem? @relation(fields: [itemId], references: [id])
  executions  ServiceExecution[]
  stepGateways ServiceStepGateway[]
  
  @@index([userId])
  @@index([status])
  @@index([deletedAt])        // ⭐ Index for soft delete queries
}

enum TriggerType {
  MANUAL      // Run on demand
  SCHEDULE    // Cron-based
  EVENT       // On gateway event
  WEBHOOK     // External HTTP trigger
}

enum ServiceStatus {
  IDLE
  RUNNING
  PAUSED
  ERROR
}

// Service Step - Gateway mapping
model ServiceStepGateway {
  id            String      @id @default(cuid())
  userServiceId String
  stepId        String      // Step ID within the service
  gatewayId     String
  
  userService   UserService @relation(fields: [userServiceId], references: [id], onDelete: Cascade)
  gateway       Gateway     @relation(fields: [gatewayId], references: [id], onDelete: Cascade)
  
  @@unique([userServiceId, stepId, gatewayId])
}

// Service Execution History
model ServiceExecution {
  id            String          @id @default(cuid())
  userServiceId String
  status        ExecutionStatus
  triggeredBy   String          // "schedule", "manual", "event:xxx", "webhook"
  startedAt     DateTime        @default(now())
  completedAt   DateTime?
  error         String?         @db.Text
  
  // Step execution details
  stepResults   Json            // Array of step results
  
  userService   UserService     @relation(fields: [userServiceId], references: [id], onDelete: Cascade)
  
  @@index([userServiceId])
  @@index([startedAt])
}

enum ExecutionStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

// ============================================
// BILLING
// ============================================

model Subscription {
  id                String    @id @default(cuid())
  userId            String    @unique
  stripeCustomerId  String    @unique
  stripeSubId       String?   @unique
  plan              PlanType  @default(FREE)
  status            SubStatus @default(ACTIVE)
  currentPeriodStart DateTime?
  currentPeriodEnd  DateTime?
  cancelAtPeriodEnd Boolean   @default(false)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?               // ⭐ Soft delete support
  
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  usageRecords      UsageRecord[]
  
  @@index([deletedAt])                      // ⭐ For soft delete queries
}

// ⭐ One-Time Purchases (for marketplace items)
model Purchase {
  id                String         @id @default(cuid())
  userId            String
  itemId            String         // MarketplaceItem ID
  stripePaymentId   String         @unique // Stripe PaymentIntent ID
  amount            Decimal        @db.Decimal(10, 2)
  currency          String         @default("usd")
  status            PurchaseStatus @default(COMPLETED)
  receiptUrl        String?        // Stripe receipt URL
  refundedAt        DateTime?      // If refunded
  refundReason      String?
  createdAt         DateTime       @default(now())
  
  user              User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  item              MarketplaceItem @relation(fields: [itemId], references: [id])
  
  @@index([userId])
  @@index([itemId])
  @@index([stripePaymentId])
}

enum PurchaseStatus {
  PENDING
  COMPLETED
  REFUNDED
  FAILED
}

// ============================================
// CREDIT SYSTEM ⭐
// ============================================

// User credit balance (denormalized for fast reads)
model CreditBalance {
  id              String   @id @default(cuid())
  userId          String   @unique
  
  // Current balance (updated on every transaction)
  balance         Int      @default(0)
  
  // Lifetime stats
  totalPurchased  Int      @default(0)
  totalUsed       Int      @default(0)
  totalBonuses    Int      @default(0)
  totalRefunded   Int      @default(0)
  
  // Free monthly AI credits (resets monthly, doesn't accumulate)
  freeAiCredits       Int      @default(0)
  freeAiCreditsUsed   Int      @default(0)
  freeAiCreditsReset  DateTime @default(now())
  
  // Settings
  preferences     Json?    // CreditPreferences JSON
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions    CreditTransaction[]
  autoTopUp       CreditAutoTopUp?
}

// Immutable transaction ledger (never delete, only append)
model CreditTransaction {
  id              String              @id @default(cuid())
  creditBalanceId String
  
  // Transaction details
  type            CreditTransactionType
  amount          Int                 // + for credit, - for debit
  balanceAfter    Int                 // Balance after this transaction
  
  // Description and context
  description     String              // Human-readable description
  metadata        Json?               // { stripeId?, itemId?, aiProvider?, model?, executionId? }
  
  // Stripe reference (for purchases/refunds)
  stripePaymentId String?
  
  // Related entity (what was purchased/used)
  referenceType   String?             // 'ai_usage', 'execution_overage', 'marketplace_item', etc.
  referenceId     String?             // ID of the related entity
  
  // Audit
  createdAt       DateTime            @default(now())
  ipAddress       String?             // For fraud detection
  
  creditBalance   CreditBalance       @relation(fields: [creditBalanceId], references: [id], onDelete: Cascade)
  
  @@index([creditBalanceId])
  @@index([type])
  @@index([createdAt])
  @@index([referenceType, referenceId])
}

// Credit packages available for purchase
model CreditPackage {
  id              String   @id @default(cuid())
  
  name            String   // "Starter", "Popular", "Value", etc.
  description     String?
  
  // Pricing
  priceUsd        Decimal  @db.Decimal(10, 2) // $5, $10, $25, etc.
  credits         Int      // Base credits
  bonusCredits    Int      @default(0) // Bonus credits
  bonusPercent    Int      @default(0) // For display (10%, 20%, etc.)
  
  // Stripe
  stripePriceId   String   @unique // Stripe Price ID
  
  // Display
  isPopular       Boolean  @default(false) // Show "POPULAR" badge
  sortOrder       Int      @default(0)
  isActive        Boolean  @default(true)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// Auto top-up configuration
model CreditAutoTopUp {
  id              String   @id @default(cuid())
  creditBalanceId String   @unique
  
  enabled         Boolean  @default(false)
  threshold       Int      @default(100)    // Trigger when balance below
  packageId       String                     // Which package to buy
  maxPerMonth     Int      @default(5000)   // Safety limit
  
  // Tracking
  lastTopUpAt     DateTime?
  topUpsThisMonth Int      @default(0)
  monthResetAt    DateTime @default(now())
  
  creditBalance   CreditBalance @relation(fields: [creditBalanceId], references: [id], onDelete: Cascade)
  
  @@index([creditBalanceId])
}

// Organization credit pool (BUSINESS+ only)
model OrgCreditPool {
  id              String   @id @default(cuid())
  orgId           String   @unique
  
  // Pool balance
  balance         Int      @default(0)
  
  // Limits
  monthlyBudget   Int?     // Auto-replenish monthly (null = no auto)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  organization    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  allocations     OrgCreditAllocation[]
}

// Per-department or per-member credit allocation
model OrgCreditAllocation {
  id              String   @id @default(cuid())
  orgCreditPoolId String
  
  // Target (either department or member, not both)
  departmentId    String?
  memberId        String?
  
  // Allocation
  monthlyBudget   Int      @default(0)
  currentBalance  Int      @default(0)
  rollover        Boolean  @default(false) // Unused rolls to next month
  
  // Limits
  dailyLimit      Int?     // Max per day (null = no limit)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastResetAt     DateTime @default(now())
  
  orgCreditPool   OrgCreditPool @relation(fields: [orgCreditPoolId], references: [id], onDelete: Cascade)
  department      Department? @relation(fields: [departmentId], references: [id]) // ⭐ Fixed: was OrgDepartment
  member          OrgMember? @relation(fields: [memberId], references: [id])
  
  @@unique([orgCreditPoolId, departmentId])
  @@unique([orgCreditPoolId, memberId])
  @@index([departmentId])
  @@index([memberId])
}

enum CreditTransactionType {
  PURCHASE        // Bought credits
  USAGE           // Used credits (AI, overages, etc.)
  REFUND          // Refunded credits
  BONUS           // Bonus credits (promotions, etc.)
  GRANT           // Admin granted credits
  TRANSFER_IN     // Received from another user
  TRANSFER_OUT    // Sent to another user
  EXPIRE          // Credits expired (if we add expiry later)
  ADJUSTMENT      // Manual admin adjustment
}

enum PlanType {
  FREE
  STARTER
  PRO
  BUSINESS
  ENTERPRISE
}

enum SubStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  TRIALING
  INCOMPLETE
}

// Usage tracking for billing
model UsageRecord {
  id             String       @id @default(cuid())
  subscriptionId String
  type           UsageType
  count          Int
  periodStart    DateTime
  periodEnd      DateTime
  createdAt      DateTime     @default(now())
  
  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  
  @@index([subscriptionId, periodStart])
}

enum UsageType {
  GATEWAY_MESSAGES
  PLUGIN_EXECUTIONS
  SERVICE_RUNS
  AI_TOKENS
  API_CALLS
}

// ============================================
// SYSTEM / PLATFORM
// ============================================

// Platform status for maintenance mode
model PlatformStatus {
  id              String   @id @default("singleton")
  isMaintenanceOn Boolean  @default(false)
  maintenanceMsg  String?
  scheduledStart  DateTime?
  scheduledEnd    DateTime?
  updatedAt       DateTime @updatedAt
}

// ============================================
// FEATURE FLAGS ⭐ NEW
// ============================================

// Feature flags for gradual rollouts and A/B testing
model FeatureFlag {
  id              String         @id @default(cuid())
  key             String         @unique  // e.g., "marketplace.templates", "gateway.twitter"
  name            String                  // Human-readable name
  description     String?
  
  // Rollout configuration
  enabled         Boolean        @default(false)
  rolloutPercent  Int            @default(0)  // 0-100% of users
  
  // Targeting
  allowedTiers    PlanType[]     // Empty = all tiers
  allowedUserIds  String[]       // Specific user IDs for beta testing
  allowedOrgIds   String[]       // Specific org IDs for enterprise beta
  
  // Metadata
  category        String?        // "billing", "marketplace", "gateway", "experimental"
  expiresAt       DateTime?      // Auto-disable after date (for temporary flags)
  
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  
  @@index([key])
  @@index([enabled])
  @@index([category])
}

// Feature flag override for specific users (manual enable/disable)
model FeatureFlagOverride {
  id            String      @id @default(cuid())
  flagId        String
  userId        String?     // Either userId or orgId
  orgId         String?
  enabled       Boolean     // Override value
  reason        String?     // Why this override exists
  expiresAt     DateTime?   // Auto-remove override
  createdAt     DateTime    @default(now())
  createdBy     String      // Admin who created override
  
  @@unique([flagId, userId])
  @@unique([flagId, orgId])
  @@index([userId])
  @@index([orgId])
}

// ============================================
// MARKETPLACE DEVELOPERS ⭐ NEW
// ============================================

// Developer accounts for marketplace publishers
model Developer {
  id                String         @id @default(cuid())
  userId            String         @unique  // Link to user account
  
  // Developer profile
  displayName       String                  // "John's Plugins", "Acme Corp"
  slug              String         @unique  // URL-friendly: "johns-plugins"
  bio               String?        @db.Text
  website           String?
  supportEmail      String?
  avatarUrl         String?
  
  // Verification status
  isVerified        Boolean        @default(false)  // Verified badge
  verifiedAt        DateTime?
  verificationLevel DeveloperTier  @default(STANDARD)
  
  // Payout configuration
  stripeConnectId   String?        // Stripe Connect account ID
  payoutEnabled     Boolean        @default(false)
  payoutEmail       String?        // PayPal email if not using Stripe
  payoutMethod      PayoutMethod   @default(STRIPE_CONNECT)
  
  // Tax information
  taxCountry        String?        // ISO country code
  taxFormSubmitted  Boolean        @default(false)  // W-9 / W-8BEN
  taxFormType       String?        // "W9", "W8BEN", "W8BENE"
  
  // Statistics (denormalized for performance)
  totalItems        Int            @default(0)
  totalInstalls     Int            @default(0)
  totalRevenue      Decimal        @default(0) @db.Decimal(12, 2)
  averageRating     Float          @default(0)
  
  // Status
  status            DeveloperStatus @default(PENDING)
  suspendedAt       DateTime?
  suspendedReason   String?
  
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  deletedAt         DateTime?      // ⭐ Soft delete support
  
  // Relations
  items             MarketplaceItem[]  // Items published by this developer
  payouts           DeveloperPayout[]
  user              User           @relation(fields: [userId], references: [id], onDelete: Cascade) // ⭐ User relation
  
  @@index([userId])
  @@index([status])
  @@index([isVerified])
  @@index([deletedAt])             // ⭐ For soft delete queries
}

enum DeveloperTier {
  STANDARD          // Basic developer
  VERIFIED          // Identity verified
  PARTNER           // Official partner (higher revenue share)
  INTERNAL          // 2Bot internal items
}

enum DeveloperStatus {
  PENDING           // Application submitted
  ACTIVE            // Approved and active
  SUSPENDED         // Temporarily suspended
  BANNED            // Permanently banned
}

enum PayoutMethod {
  STRIPE_CONNECT    // Stripe Connect (recommended)
  PAYPAL            // PayPal
  BANK_TRANSFER     // Direct bank transfer (Enterprise)
  CRYPTO            // Cryptocurrency (future)
}

// ============================================
// MARKETPLACE PAYOUTS ⭐ NEW
// ============================================

// Track developer earnings and payouts
model DeveloperPayout {
  id              String        @id @default(cuid())
  developerId     String
  
  // Payout period
  periodStart     DateTime
  periodEnd       DateTime
  
  // Amounts
  grossRevenue    Decimal       @db.Decimal(12, 2)  // Total sales
  platformFee     Decimal       @db.Decimal(12, 2)  // Platform's cut (30%)
  netRevenue      Decimal       @db.Decimal(12, 2)  // Developer's share (70%)
  refunds         Decimal       @default(0) @db.Decimal(12, 2)  // Refunds deducted
  adjustments     Decimal       @default(0) @db.Decimal(12, 2)  // Manual adjustments
  finalAmount     Decimal       @db.Decimal(12, 2)  // Final payout amount
  
  // Currency
  currency        String        @default("usd")
  
  // Payout details
  status          PayoutStatus  @default(PENDING)
  payoutMethod    PayoutMethod
  transactionId   String?       // External transaction ID (Stripe, PayPal)
  
  // Timestamps
  calculatedAt    DateTime      @default(now())
  scheduledAt     DateTime?     // When payout is scheduled
  processedAt     DateTime?     // When payout was sent
  failedAt        DateTime?     // If payout failed
  failureReason   String?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  developer       Developer     @relation(fields: [developerId], references: [id], onDelete: Cascade)
  
  @@index([developerId])
  @@index([status])
  @@index([periodStart, periodEnd])
}

enum PayoutStatus {
  PENDING           // Calculated, not yet scheduled
  SCHEDULED         // Scheduled for payout
  PROCESSING        // Payout in progress
  COMPLETED         // Successfully paid
  FAILED            // Payout failed
  CANCELLED         // Cancelled (e.g., account suspended)
  ON_HOLD           // On hold (e.g., under review)
}

// Individual sale records (for payout calculation)
model DeveloperSale {
  id              String        @id @default(cuid())
  developerId     String
  itemId          String        // MarketplaceItem ID
  purchaseId      String?       // Purchase ID (for one-time)
  subscriptionId  String?       // Subscription ID (for recurring)
  
  // Sale details
  amount          Decimal       @db.Decimal(10, 2)
  platformFee     Decimal       @db.Decimal(10, 2)  // Calculated at time of sale
  developerShare  Decimal       @db.Decimal(10, 2)
  currency        String        @default("usd")
  
  // Status
  isRefunded      Boolean       @default(false)
  refundedAt      DateTime?
  
  // Payout tracking
  payoutId        String?       // Which payout this was included in
  includedInPayout Boolean      @default(false)
  
  createdAt       DateTime      @default(now())
  
  @@index([developerId])
  @@index([itemId])
  @@index([includedInPayout])
  @@index([createdAt])
}
```

### Caching Strategy

```typescript
// src/shared/cache/cache.constants.ts

export const CACHE_TTL = {
  // Short-lived (frequently changing)
  GATEWAY_STATUS: 30,              // 30 seconds
  USER_QUOTA: 60,                  // 1 minute
  NOTIFICATIONS_COUNT: 60,         // 1 minute
  
  // Medium-lived
  USER_SESSION: 5 * 60,            // 5 minutes
  USER_SUBSCRIPTION: 10 * 60,      // 10 minutes
  USER_THEME: 60 * 60,             // 1 hour
  USER_WIDGETS: 5 * 60,            // 5 minutes
  
  // Long-lived (rarely changing)
  MARKETPLACE_ITEMS: 5 * 60,       // 5 minutes
  MARKETPLACE_CATEGORIES: 60 * 60, // 1 hour
  PLUGIN_DEFINITIONS: 30 * 60,     // 30 minutes
  THEME_DEFINITIONS: 60 * 60,      // 1 hour
  
  // Computed/Aggregated
  ANALYTICS_DAILY: 15 * 60,        // 15 minutes
  ANALYTICS_WEEKLY: 60 * 60,       // 1 hour
};

export const CACHE_KEYS = {
  userSession: (userId: string) => `user:${userId}:session`,
  userTheme: (userId: string) => `user:${userId}:theme`,
  userWidgets: (userId: string) => `user:${userId}:widgets`,
  userQuota: (userId: string) => `user:${userId}:quota`,
  gatewayStatus: (gatewayId: string) => `gateway:${gatewayId}:status`,
  marketplaceItem: (slug: string) => `marketplace:item:${slug}`,
  marketplaceList: (type: string, page: number) => `marketplace:${type}:page:${page}`,
};
```

### Health Check Response Types

```typescript
// GET /api/health
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
}

// GET /api/health/ready
interface ReadyResponse {
  status: 'ready' | 'not_ready';
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    queue: 'ok' | 'error';
  };
  timestamp: string;
}

// GET /api/health/live
interface LiveResponse {
  status: 'alive';
  uptime: number;  // seconds
}
```

### Type-Specific Config Schemas

```typescript
// Audit Log Actions (for consistency)
const AUDIT_ACTIONS = {
  // Auth
  'auth.login': 'User logged in',
  'auth.logout': 'User logged out',
  'auth.password_reset': 'Password reset requested',
  
  // Gateway
  'gateway.create': 'Gateway created',
  'gateway.update': 'Gateway updated',
  'gateway.delete': 'Gateway deleted',
  'gateway.connect': 'Gateway connected',
  'gateway.disconnect': 'Gateway disconnected',
  
  // Plugin
  'plugin.install': 'Plugin installed',
  'plugin.uninstall': 'Plugin uninstalled',
  'plugin.enable': 'Plugin enabled',
  'plugin.disable': 'Plugin disabled',
  'plugin.configure': 'Plugin configured',
  
  // Service
  'service.create': 'Service created',
  'service.update': 'Service updated',
  'service.delete': 'Service deleted',
  'service.run': 'Service executed',
  'service.enable': 'Service enabled',
  'service.disable': 'Service disabled',
  
  // API Key
  'apikey.create': 'API key created',
  'apikey.revoke': 'API key revoked',
  'apikey.rotate': 'API key rotated',
  
  // Billing
  'billing.subscribe': 'Subscription started',
  'billing.cancel': 'Subscription cancelled',
  'billing.payment': 'Payment processed',
};

// Plugin config schema (stored in MarketplaceItem.config)
interface PluginConfig {
  requiredGateways: GatewayType[];  // e.g., ['TELEGRAM_BOT', 'AI']
  configSchema: JSONSchema;         // JSON Schema for user configuration
  events: string[];                 // Events this plugin listens to
  permissions: string[];            // Required permissions
}

// AI Gateway has multiple providers (user selects when creating gateway)
enum AIProvider {
  OPENAI          // GPT-4, GPT-3.5
  GOOGLE_GEMINI   // Gemini Pro, Gemini Ultra
  ANTHROPIC       // Claude 3, Claude 2
  MISTRAL         // Mistral Large, Mixtral
  GROQ            // Fast inference
  OLLAMA          // Local models (Llama, etc.)
  CUSTOM          // Any OpenAI-compatible API
}

// AI Gateway configuration
interface AIGatewayConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;            // e.g., "gpt-4", "gemini-pro", "claude-3-opus"
  baseUrl?: string;         // For custom/self-hosted
  organizationId?: string;  // For OpenAI
  maxTokens?: number;
  temperature?: number;
}

// Theme config schema
interface ThemeConfig {
  type: 'light' | 'dark' | 'system';
  colors: {
    primary: string;
    secondary: string;
    background: string;
    foreground: string;
    card: string;
    border: string;
    muted: string;
    accent: string;
    destructive: string;
    // ... more color tokens
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  borderRadius: string;
  shadows: Record<string, string>;
}

// Widget config schema
interface WidgetConfig {
  defaultSize: WidgetSize;
  allowedSizes: WidgetSize[];
  refreshInterval?: number;     // Seconds, 0 = no auto-refresh
  dataSource?: string;          // API endpoint or data key
  configSchema: JSONSchema;     // User configuration schema
}

// Service config schema (workflow definition)
interface ServiceConfig {
  requiredGateways: GatewayType[];
  configSchema: JSONSchema;     // User configuration schema
  defaultTrigger: {
    type: TriggerType;
    config: Record<string, any>;
  };
  steps: ServiceStep[];
}

interface ServiceStep {
  id: string;
  name: string;
  type: 'gateway' | 'transform' | 'condition' | 'loop' | 'delay' | 'webhook' | 'plugin';
  gateway?: GatewayType;        // Required if type = 'gateway'
  action?: string;              // Method to call
  config: Record<string, any>;  // Step configuration with {{variable}} support
  output?: string;              // Variable name to store result
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;
}
```

---

## 🔌 API Structure

### API Versioning ⭐

All API endpoints use version prefixing for backward compatibility:

```
Base URL: https://api.2bot.app/v1/

Versioning Strategy:
- Current: v1 (stable)
- Breaking changes → new version (v2)
- Non-breaking additions → same version
- Deprecation notice: 6 months before removal
- Old versions supported: minimum 12 months

Version Header (optional override):
X-API-Version: 2026-01-01    # Date-based version pinning
```

### URL-Based Context (GitHub-Style) ⭐ Phase 6.7

2Bot uses **URL-based context** (like GitHub) instead of token-based context switching.
Context (personal vs organization) is determined by the URL path, not the JWT token.

**Benefits:**
- URLs are shareable and bookmarkable
- Clear ownership: URL shows whose resources you're accessing
- Simpler JWT tokens (smaller attack surface)
- No context-switching API calls needed
- Easier debugging (just look at URL)

#### Personal Resources (`/api/user/*`)

Access your personal resources (organizationId = null):

```
GET    /api/user/gateways          # List personal gateways
POST   /api/user/gateways          # Create personal gateway
GET    /api/user/plugins           # List installed plugins
GET    /api/user/quota             # Personal quota status
GET    /api/user/organizations     # List orgs you're a member of
```

#### Organization Resources (`/api/orgs/:orgId/*`)

Access organization resources (requires membership):

```
GET    /api/orgs/:orgId                    # Get organization details
PATCH  /api/orgs/:orgId                    # Update organization
DELETE /api/orgs/:orgId                    # Delete organization (owner only)

GET    /api/orgs/:orgId/gateways           # List org gateways
POST   /api/orgs/:orgId/gateways           # Create org gateway
GET    /api/orgs/:orgId/plugins            # List org plugins
GET    /api/orgs/:orgId/quota              # Org quota status
GET    /api/orgs/:orgId/members            # List org members
POST   /api/orgs/:orgId/members/invite     # Invite member
DELETE /api/orgs/:orgId/members/:memberId  # Remove member

GET    /api/orgs/:orgId/departments                  # List departments
POST   /api/orgs/:orgId/departments                  # Create department
GET    /api/orgs/:orgId/departments/:deptId          # Get department
PATCH  /api/orgs/:orgId/departments/:deptId          # Update department
DELETE /api/orgs/:orgId/departments/:deptId          # Delete department
GET    /api/orgs/:orgId/departments/:deptId/members  # Department members

POST   /api/orgs/:orgId/emergency-stop     # Emergency stop all services
```

#### Authorization Rules

| Route Pattern | Requires | Access Check |
|---------------|----------|--------------|
| `/api/user/*` | Valid JWT | User owns the resource |
| `/api/orgs/:orgId/*` | Valid JWT + Membership | User is member of org |
| `/api/orgs/:orgId/* (write)` | Valid JWT + Admin | User has ADMIN/OWNER role |

#### Deprecated Routes (v1 → v2 Migration)

These routes still work but will be removed in v2:

| Deprecated Route | Replacement | Sunset Date |
|------------------|-------------|-------------|
| `GET /api/gateways` | `/api/user/gateways` or `/api/orgs/:orgId/gateways` | 2026-07-01 |
| `GET /api/plugins/user/plugins` | `/api/user/plugins` | 2026-07-01 |
| `GET /api/quota/status` | `/api/user/quota` or `/api/orgs/:orgId/quota` | 2026-07-01 |
| `GET /api/organizations/me` | `/api/user/organizations` | 2026-07-01 |

Deprecated routes return these headers:
```
Deprecation: true
Link: </api/user/gateways>; rel="successor-version"
Sunset: Fri, 01 Jul 2026 00:00:00 GMT
```

### REST API Endpoints

```
Health & Status:
GET    /api/health              # Basic health check
GET    /api/health/ready        # Full dependency check (DB, Redis, queues)
GET    /api/health/live         # Kubernetes liveness probe
GET    /api/status              # Platform status (maintenance mode)

Authentication:
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/verify-email

Two-Factor Authentication (2FA): ⭐ NEW
GET    /api/auth/2fa/status          # Check if 2FA is enabled
POST   /api/auth/2fa/totp/setup      # Get TOTP secret & QR code
POST   /api/auth/2fa/totp/verify     # Verify code and enable TOTP
DELETE /api/auth/2fa/totp            # Disable TOTP (requires password)
POST   /api/auth/2fa/recovery/generate # Generate new recovery codes
POST   /api/auth/2fa/recovery/verify # Use recovery code
GET    /api/auth/webauthn/options    # Get WebAuthn registration options
POST   /api/auth/webauthn/register   # Register passkey/hardware key
GET    /api/auth/webauthn/credentials # List registered credentials
DELETE /api/auth/webauthn/:id        # Remove a credential
POST   /api/auth/webauthn/authenticate # Verify passkey during login

Session Management: ⭐ NEW
GET    /api/auth/sessions            # List active sessions
GET    /api/auth/sessions/current    # Get current session details
DELETE /api/auth/sessions/:id        # Revoke specific session
POST   /api/auth/sessions/revoke-all # Revoke all except current
POST   /api/auth/sessions/:id/trust  # Mark device as trusted
GET    /api/auth/sessions/devices    # List trusted devices
DELETE /api/auth/sessions/devices/:id # Remove trusted device

API Keys:
GET    /api/api-keys             # List user's API keys
POST   /api/api-keys             # Create new API key
DELETE /api/api-keys/:id         # Revoke API key
POST   /api/api-keys/:id/rotate  # Rotate key (with grace period)

Users:
GET    /api/users/me
PATCH  /api/users/me
DELETE /api/users/me
GET    /api/users/me/export      # GDPR data export
POST   /api/users/me/delete-data # GDPR data deletion request

Notifications:
GET    /api/notifications
PATCH  /api/notifications/:id/read
POST   /api/notifications/mark-all-read
DELETE /api/notifications/:id

Referrals:
GET    /api/referrals/code       # Get user's referral code
POST   /api/referrals/code       # Generate referral code
GET    /api/referrals/stats      # Referral statistics

Gateways:
GET    /api/gateways
POST   /api/gateways
GET    /api/gateways/:id
PATCH  /api/gateways/:id
DELETE /api/gateways/:id
POST   /api/gateways/:id/test
POST   /api/gateways/:id/connect
POST   /api/gateways/:id/disconnect

Marketplace (Unified):
GET    /api/marketplace                    # All items (filterable by type)
GET    /api/marketplace/:slug
GET    /api/marketplace/categories
GET    /api/marketplace/featured
GET    /api/marketplace/:slug/reviews      # ⭐ Get item reviews
POST   /api/marketplace/:slug/reviews      # ⭐ Submit review (must own item)
PATCH  /api/marketplace/:slug/reviews/:id  # ⭐ Edit own review
DELETE /api/marketplace/:slug/reviews/:id  # ⭐ Delete own review
POST   /api/marketplace/:slug/reviews/:id/helpful # ⭐ Mark review as helpful

Plugins:
GET    /api/user/plugins                   # User's installed plugins
POST   /api/user/plugins/:slug/install
DELETE /api/user/plugins/:slug/uninstall
PATCH  /api/user/plugins/:slug/config
POST   /api/user/plugins/:slug/enable
POST   /api/user/plugins/:slug/disable
POST   /api/user/plugins/:slug/gateways

Themes:
GET    /api/user/theme                     # User's active theme
POST   /api/user/theme/:slug/activate
PATCH  /api/user/theme/customize           # Custom overrides

Widgets:
GET    /api/user/widgets                   # User's dashboard widgets
POST   /api/user/widgets/:slug/add
DELETE /api/user/widgets/:id/remove
PATCH  /api/user/widgets/:id              # Update position, size, config
POST   /api/user/widgets/reorder

Services:
GET    /api/user/services                  # User's services
POST   /api/user/services                  # Create custom service
POST   /api/user/services/:slug/install    # Install from marketplace
GET    /api/user/services/:id
PATCH  /api/user/services/:id
DELETE /api/user/services/:id
POST   /api/user/services/:id/enable
POST   /api/user/services/:id/disable
POST   /api/user/services/:id/run          # Manual trigger
GET    /api/user/services/:id/executions   # Execution history
GET    /api/user/services/:id/executions/:execId

Billing:
GET    /api/billing/subscription
POST   /api/billing/subscribe
POST   /api/billing/cancel
GET    /api/billing/invoices
POST   /api/billing/portal
GET    /api/billing/usage

Credits: ⭐ NEW
GET    /api/credits                        # Get credit balance & stats
GET    /api/credits/packages               # List available credit packages
POST   /api/credits/purchase               # Purchase credits (Idempotency-Key required)
GET    /api/credits/transactions           # Transaction history (paginated)
GET    /api/credits/transactions/:id       # Transaction details
GET    /api/credits/usage                  # Credit usage breakdown by type
GET    /api/credits/auto-top-up            # Get auto top-up settings
PUT    /api/credits/auto-top-up            # Configure auto top-up
DELETE /api/credits/auto-top-up            # Disable auto top-up
POST   /api/credits/estimate               # Estimate credits for operation

Organization Credits: ⭐ NEW
GET    /api/org/credits                    # Org credit pool balance
POST   /api/org/credits/purchase           # Purchase org credits
GET    /api/org/credits/transactions       # Org transaction history
GET    /api/org/credits/allocations        # List dept/member allocations
POST   /api/org/credits/allocations        # Create allocation
PATCH  /api/org/credits/allocations/:id    # Update allocation
DELETE /api/org/credits/allocations/:id    # Remove allocation
GET    /api/org/credits/usage              # Usage by department/member

Webhooks:
POST   /api/webhooks/telegram/:gatewayId
POST   /api/webhooks/stripe
POST   /api/webhooks/service/:serviceId    # Service webhook trigger

Organizations: ⭐ (See "URL-Based Context" for new /api/orgs/:orgId/* routes)
# Legacy /api/org/* routes below are deprecated - use /api/orgs/:orgId/* instead
GET    /api/org                            # Get user's organization (DEPRECATED)
POST   /api/org                            # Create organization
PATCH  /api/org                            # Update org settings (DEPRECATED)
DELETE /api/org                            # Delete organization (owner only)

GET    /api/org/members                    # List members
POST   /api/org/members/invite             # Invite member by email
POST   /api/org/members/invite/bulk        # Bulk invite via CSV
DELETE /api/org/members/:id                # Remove member
PATCH  /api/org/members/:id/role           # Change member role
POST   /api/org/members/:id/department     # Assign to department

GET    /api/org/departments                # List departments
POST   /api/org/departments                # Create department
GET    /api/org/departments/:id            # Get department details
PATCH  /api/org/departments/:id            # Update department
DELETE /api/org/departments/:id            # Delete department
GET    /api/org/departments/:id/members    # List department members
GET    /api/org/departments/:id/items      # List department items

GET    /api/org/licenses                   # List org licenses
POST   /api/org/licenses/:itemId           # Purchase org license
GET    /api/org/licenses/:id               # Get license details
DELETE /api/org/licenses/:id               # Cancel license
PATCH  /api/org/licenses/:id/assign        # Assign to departments
GET    /api/org/licenses/:id/usage         # License usage stats

GET    /api/org/workspace                  # Org workspace status
POST   /api/org/workspace/start            # Start org workspace
POST   /api/org/workspace/stop             # Stop org workspace
GET    /api/org/workspace/resources        # Resource usage by dept

GET    /api/org/billing                    # Org billing info
POST   /api/org/billing/subscribe          # Subscribe to org plan
PATCH  /api/org/billing/plan               # Change org plan
GET    /api/org/billing/usage              # Resource usage
GET    /api/org/billing/invoices           # Invoice history
POST   /api/org/billing/seats              # Add/remove seats

GET    /api/org/partners                   # List partner links
POST   /api/org/partners/request           # Request partner link
GET    /api/org/partners/:id               # Partner link details
PATCH  /api/org/partners/:id/accept        # Accept partner request
PATCH  /api/org/partners/:id/reject        # Reject partner request
DELETE /api/org/partners/:id               # Revoke partner link
GET    /api/org/partners/:id/services      # Allowed services

GET    /api/org/analytics                  # Cross-department analytics
GET    /api/org/audit-log                  # Organization audit log

Monitoring (User): ⭐
GET    /api/monitoring/overview            # User monitoring dashboard data
GET    /api/monitoring/gateways            # Gateway health & uptime history
GET    /api/monitoring/gateways/:id/history # Specific gateway uptime timeline
GET    /api/monitoring/plugins             # Plugin performance metrics
GET    /api/monitoring/services            # Service success rates
GET    /api/monitoring/services/:id/stats  # Specific service statistics
GET    /api/monitoring/activity            # Activity timeline (recent events)
GET    /api/monitoring/usage               # Resource usage history
GET    /api/monitoring/predictions         # Usage predictions/projections

Monitoring (Organization): ⭐
GET    /api/org/monitoring/overview        # Org monitoring dashboard
GET    /api/org/monitoring/departments     # Department comparison stats
GET    /api/org/monitoring/members         # Per-member usage tracking
GET    /api/org/monitoring/members/:id     # Specific member stats
GET    /api/org/monitoring/licenses        # License utilization metrics
GET    /api/org/monitoring/health          # Organization health score
GET    /api/org/monitoring/roi             # ROI calculator data

Monitoring (Platform Admin): ⭐
GET    /api/admin/monitoring/overview      # Platform-wide metrics
GET    /api/admin/monitoring/users         # Fleet-wide user analytics
GET    /api/admin/monitoring/revenue       # Revenue/MRR dashboard
GET    /api/admin/monitoring/funnel        # User acquisition funnel
GET    /api/admin/monitoring/churn         # Churn risk indicators
GET    /api/admin/monitoring/capacity      # System capacity metrics
GET    /api/admin/monitoring/sla           # SLA compliance metrics
GET    /api/admin/monitoring/anomalies     # Detected anomalies

Invites:
GET    /api/invites/:token                 # Get invite details
POST   /api/invites/:token/accept          # Accept org invite
POST   /api/invites/:token/decline         # Decline org invite

Developer Portal (Marketplace Publishers): ⭐ NEW
GET    /api/developer                      # Get developer profile
POST   /api/developer                      # Register as developer
PATCH  /api/developer                      # Update developer profile
GET    /api/developer/verification         # Verification status
POST   /api/developer/verification         # Submit verification documents

GET    /api/developer/items                # List developer's items
POST   /api/developer/items                # Submit new item for review
GET    /api/developer/items/:id            # Get item details
PATCH  /api/developer/items/:id            # Update item
DELETE /api/developer/items/:id            # Delete item (if no installs)
POST   /api/developer/items/:id/version    # Submit new version
GET    /api/developer/items/:id/versions   # List all versions
POST   /api/developer/items/:id/publish    # Request publish/review
POST   /api/developer/items/:id/unpublish  # Unpublish from marketplace

GET    /api/developer/analytics            # Overall analytics
GET    /api/developer/analytics/:itemId    # Per-item analytics
GET    /api/developer/analytics/installs   # Install trends
GET    /api/developer/analytics/revenue    # Revenue breakdown

GET    /api/developer/payouts              # List payouts
GET    /api/developer/payouts/:id          # Payout details
GET    /api/developer/earnings             # Current period earnings
POST   /api/developer/payout-settings      # Configure payout method

GET    /api/developer/reviews              # Reviews on developer's items
POST   /api/developer/reviews/:id/respond  # Respond to a review

Admin (Item Review): ⭐ NEW
GET    /api/admin/submissions              # Items pending review
GET    /api/admin/submissions/:id          # Submission details
POST   /api/admin/submissions/:id/approve  # Approve item
POST   /api/admin/submissions/:id/reject   # Reject with reason
POST   /api/admin/submissions/:id/request-changes # Request changes
GET    /api/admin/developers               # List all developers
PATCH  /api/admin/developers/:id/verify    # Verify developer
PATCH  /api/admin/developers/:id/suspend   # Suspend developer
```

### Rate Limiting Headers ⭐ NEW

All API responses include rate limit headers to help clients manage their request rate:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100          # Max requests in window
X-RateLimit-Remaining: 87       # Requests remaining
X-RateLimit-Reset: 1704067200   # Unix timestamp when window resets
X-RateLimit-Policy: 100;w=60    # 100 requests per 60 seconds
Retry-After: 30                 # Seconds to wait (only on 429)
```

#### Rate Limit Tiers

| Endpoint Category | Free | Starter | Pro | Business | Enterprise |
|-------------------|------|---------|-----|----------|------------|
| **General API** | 60/min | 100/min | 200/min | 500/min | 1000/min |
| **Auth endpoints** | 5/15min | 10/15min | 10/15min | 20/15min | 50/15min |
| **Webhook receives** | 100/min | 500/min | 1000/min | 5000/min | 10000/min |
| **File uploads** | 10/hour | 50/hour | 100/hour | 500/hour | Unlimited |
| **Monitoring API** | 10/min | 10/min | 20/min | 50/min | 100/min |
| **Export/Reports** | 5/hour | 10/hour | 20/hour | 50/hour | 100/hour |

#### Rate Limit Response (429 Too Many Requests)

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry after 30 seconds.",
    "retryAfter": 30,
    "limit": 100,
    "remaining": 0,
    "resetAt": "2026-01-12T12:00:00Z"
  }
}
```

#### Rate Limit Best Practices

```typescript
// Client-side rate limit handling
async function apiRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  
  // Track rate limit status
  const rateLimit = {
    limit: parseInt(response.headers.get('X-RateLimit-Limit') || '100'),
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '100'),
    reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0'),
  };
  
  // Handle rate limit exceeded
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
    console.warn(`Rate limited. Retrying in ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return apiRequest(url, options); // Retry
  }
  
  // Proactive backoff when running low
  if (rateLimit.remaining < 10) {
    console.warn(`Low rate limit: ${rateLimit.remaining} remaining`);
    // Slow down requests
  }
  
  return response;
}
```

### Request Headers ⭐ NEW

#### Standard Request Headers

```
Authorization: Bearer <jwt_token>       # JWT from session
X-API-Key: 2bot_abc123...               # Alternative: API key auth
Content-Type: application/json
Accept: application/json
X-Request-Id: uuid-v4                   # Client-generated for tracing
X-Organization-Id: org_123              # Context switcher (org mode)
```

#### Special Purpose Headers

```
Idempotency-Key: uuid-v4                # Required for: POST /credits/purchase, 
                                        # POST /billing/subscribe, mutations
                                        # Prevents duplicate operations
                                        # Key valid for 24 hours

If-Match: "etag-value"                  # Optimistic concurrency control
If-None-Match: "etag-value"             # Cache validation
```

#### Response Headers (All Requests)

```
X-Request-Id: uuid-v4                   # Echo or server-generated
X-Response-Time: 45ms                   # Server processing time
ETag: "hash-of-resource"                # For caching
Cache-Control: private, max-age=60      # Caching directive
```

### Pagination ⭐ NEW

All list endpoints support cursor-based pagination:

#### Request Parameters

```
GET /api/credits/transactions?cursor=abc123&limit=25&sort=createdAt:desc

Parameters:
- cursor: string    # Opaque cursor from previous response (default: start)
- limit: number     # Items per page (default: 20, max: 100)
- sort: string      # Field and direction (e.g., "createdAt:desc")
```

#### Response Format

```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6IjEyMyJ9",      // Next page cursor (null if last page)
    "prevCursor": "eyJpZCI6IjEwMCJ9",  // Previous page cursor (null if first)
    "hasMore": true,                   // More items available
    "total": 150,                      // Total count (optional, expensive)
    "limit": 25                        // Items per page
  }
}
```

#### Pagination Best Practices

```typescript
// Fetch all pages
async function fetchAllTransactions() {
  const transactions = [];
  let cursor: string | null = null;
  
  do {
    const response = await api.get('/api/credits/transactions', {
      params: { cursor, limit: 100 }
    });
    
    transactions.push(...response.data);
    cursor = response.pagination.cursor;
  } while (cursor);
  
  return transactions;
}
```

---

## 🔗 Gateway System

### Gateway Credential Security ⭐ NEW

All gateway credentials are encrypted at rest using AES-256-GCM:

```typescript
// Encryption configuration
const GATEWAY_ENCRYPTION = {
  algorithm: 'aes-256-gcm',
  keyDerivation: 'PBKDF2',
  iterations: 100000,
  saltLength: 32,
  ivLength: 16,
  tagLength: 16,
};

// Key management
// - Master key stored in environment variable (GATEWAY_ENCRYPTION_KEY)
// - Per-user derived keys using PBKDF2 with user ID as salt
// - Key rotation: automatic every 90 days, old keys kept for decryption

interface EncryptedConfig {
  ciphertext: string;     // Base64 encoded
  iv: string;             // Initialization vector
  tag: string;            // Authentication tag
  version: number;        // Encryption version for key rotation
  keyId: string;          // Which key was used
}

// Never log or expose:
// - Bot tokens, API keys, session strings
// - Phone numbers, 2FA codes
// - Any credential-like strings
```

### Gateway Interface

```typescript
interface Gateway {
  // Metadata
  type: GatewayType;
  name: string;
  version: string;
  
  // Configuration
  configSchema: JSONSchema;      // Schema for credentials/config
  
  // Lifecycle
  connect(config: EncryptedConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  getStatus(): GatewayStatus;
  
  // Health monitoring ⭐ NEW
  getHealth(): GatewayHealth;
  getMetrics(): GatewayMetrics;
  
  // Events
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  
  // Methods (type-specific)
  execute(method: string, params: any): Promise<any>;
}

// ⭐ NEW: Gateway health and metrics
interface GatewayHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  lastSuccessfulCall: Date | null;
  consecutiveFailures: number;
  uptime: number;              // Percentage over last 24h
  latencyMs: number;           // Average response time
}

interface GatewayMetrics {
  requestsTotal: number;
  requestsSuccess: number;
  requestsFailed: number;
  tokensUsed?: number;         // For AI gateways
  creditsConsumed?: number;    // Credits charged
  rateLimitHits: number;
  lastReset: Date;
}

// Gateway-specific APIs
interface TelegramBotGateway extends Gateway {
  sendMessage(chatId: string, text: string, options?: MessageOptions): Promise<Message>;
  sendPhoto(chatId: string, photo: InputFile, options?: PhotoOptions): Promise<Message>;
  getChat(chatId: string): Promise<Chat>;
  getChatMembers(chatId: string): Promise<ChatMember[]>;
  answerCallback(callbackId: string, options?: AnswerOptions): Promise<void>;
  setWebhook(url: string, secretToken: string): Promise<void>; // ⭐ Added secretToken
}

interface TelegramUserGateway extends Gateway {
  // Uses MTProto protocol under the hood
  // ⚠️ CONSERVATIVE RATE LIMITS to prevent account ban
  getDialogs(options?: DialogOptions): Promise<Dialog[]>;
  getMessages(peer: Peer, options?: GetMessagesOptions): Promise<Message[]>;
  sendMessage(peer: Peer, text: string): Promise<Message>;
  getParticipants(channel: InputChannel): Promise<Participant[]>;
  getChannelInfo(channel: InputChannel): Promise<ChannelInfo>;
  searchMessages(peer: Peer, query: string): Promise<Message[]>;
}

interface AIGateway extends Gateway {
  // Works with any AI provider (OpenAI, Gemini, Claude, etc.)
  // Provider is configured when user creates the gateway
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<AIResponse>; // ⭐ Returns usage
  complete(prompt: string, options?: CompleteOptions): Promise<AIResponse>;
  embed(text: string | string[]): Promise<EmbedResponse>;
  moderate(text: string): Promise<ModerationResult>;
  getProvider(): AIProvider;
  getModel(): string;
  getUsage(): AIUsageStats;    // ⭐ NEW: Track token usage
}

// ⭐ NEW: AI response with usage tracking for credit billing
interface AIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    creditsCharged: number;    // Credits deducted from user balance
  };
  model: string;
  provider: AIProvider;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}
```

### Gateway Rate Limiting ⭐ NEW

Per-gateway rate limits to prevent API bans and ensure fair usage:

```typescript
const GATEWAY_RATE_LIMITS = {
  TELEGRAM_BOT: {
    // Telegram Bot API limits
    messagesPerSecond: 30,         // Global: 30 msg/sec
    messagesPerChatPerMinute: 20,  // Per chat: 20 msg/min
    bulkMessagesPerSecond: 1,      // Bulk: 1 msg/sec
    burstLimit: 100,               // Max burst before throttle
  },
  
  TELEGRAM_USER: {
    // MTProto - VERY CONSERVATIVE to avoid ban
    requestsPerSecond: 2,          // Max 2 req/sec
    messagesPerMinute: 20,         // Max 20 msg/min to different chats
    floodWaitMultiplier: 2,        // Double wait time on FLOOD_WAIT
    maxDailyMessages: 500,         // Daily limit warning
    // ⚠️ Automatic slowdown on FLOOD_WAIT errors
  },
  
  AI: {
    // Provider-specific (configurable)
    requestsPerMinute: 60,         // Default, adjustable per provider
    tokensPerMinute: 90000,        // TPM limit
    tokensPerDay: 1000000,         // Daily token budget
    concurrentRequests: 5,         // Max parallel requests
  },
  
  WEBHOOK: {
    requestsPerMinute: 100,
    timeoutMs: 30000,
    maxRetries: 3,
  },
};
```

### Gateway Error Handling ⭐ NEW

Retry logic and circuit breaker pattern:

```typescript
// Error classification
enum GatewayErrorType {
  TRANSIENT = 'transient',       // Retry: network issues, 5xx errors
  RATE_LIMITED = 'rate_limited', // Wait and retry with backoff
  AUTH_FAILED = 'auth_failed',   // Don't retry, notify user
  INVALID_REQUEST = 'invalid',   // Don't retry, log error
  PROVIDER_ERROR = 'provider',   // Check provider status
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterPercent: 20,             // Add randomness to prevent thundering herd
};

// Circuit breaker
const CIRCUIT_BREAKER = {
  failureThreshold: 5,           // Open after 5 consecutive failures
  resetTimeoutMs: 60000,         // Try again after 1 minute
  halfOpenRequests: 3,           // Test requests in half-open state
  
  // States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing) -> CLOSED
};

// Timeout configuration per gateway type
const GATEWAY_TIMEOUTS = {
  TELEGRAM_BOT: { connectMs: 5000, requestMs: 30000 },
  TELEGRAM_USER: { connectMs: 10000, requestMs: 60000 },
  AI: { connectMs: 5000, requestMs: 120000 },  // AI can be slow
  WEBHOOK: { connectMs: 5000, requestMs: 30000 },
};
```

### Webhook Security ⭐ NEW

Verifying incoming webhooks from external services:

```typescript
// Telegram webhook verification
async function verifyTelegramWebhook(
  request: Request,
  gatewayId: string
): Promise<boolean> {
  // 1. Check secret token header
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  const gateway = await getGateway(gatewayId);
  
  if (!secretToken || secretToken !== gateway.webhookSecret) {
    logger.warn('Invalid Telegram webhook secret', { gatewayId });
    return false;
  }
  
  // 2. Validate request origin (optional, Telegram IPs)
  const telegramIps = ['149.154.160.0/20', '91.108.4.0/22'];
  // ... IP validation
  
  return true;
}

// Stripe webhook verification
async function verifyStripeWebhook(
  request: Request,
  payload: string
): Promise<boolean> {
  const signature = request.headers.get('Stripe-Signature');
  
  try {
    stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return true;
  } catch (err) {
    logger.warn('Invalid Stripe webhook signature');
    return false;
  }
}

// Generic HMAC webhook verification
function verifyHmacWebhook(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
  const expected = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### Gateway Health Monitoring ⭐ NEW

Automatic health checks and reconnection:

```typescript
// Health check scheduler
const HEALTH_CHECK_CONFIG = {
  intervalMs: 60000,             // Check every minute
  timeoutMs: 10000,              // Health check timeout
  unhealthyThreshold: 3,         // Mark unhealthy after 3 failures
  autoReconnect: true,           // Auto-reconnect on failure
  maxReconnectAttempts: 5,
  reconnectBackoffMs: 5000,
};

// Gateway status events
type GatewayEvent = 
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'
  | 'rate_limited'
  | 'health_check_failed'
  | 'health_restored';

// Notify user on gateway issues
async function onGatewayStatusChange(
  gateway: Gateway,
  event: GatewayEvent
): Promise<void> {
  // Send notification if gateway goes unhealthy
  if (event === 'health_check_failed') {
    await sendNotification(gateway.userId, {
      type: 'GATEWAY_STATUS',
      title: `Gateway "${gateway.name}" is having issues`,
      message: 'We detected connectivity problems and are attempting to reconnect.',
      data: { gatewayId: gateway.id, status: 'unhealthy' },
    });
  }
  
  if (event === 'health_restored') {
    await sendNotification(gateway.userId, {
      type: 'GATEWAY_STATUS', 
      title: `Gateway "${gateway.name}" is back online`,
      message: 'Connectivity has been restored.',
      data: { gatewayId: gateway.id, status: 'healthy' },
    });
  }
}
```

---

## 🧩 Marketplace Items

### Marketplace Item Details ⭐ NEW

Every marketplace item displays comprehensive information:

```typescript
interface MarketplaceItemDisplay {
  // Core info
  id: string;
  slug: string;
  name: string;
  type: MarketplaceType;
  version: string;
  
  // Description
  shortDescription: string;        // Max 150 chars for cards
  longDescription: string;         // Full markdown description
  features: string[];              // Bullet points of key features
  changelog: ChangelogEntry[];     // Version history
  
  // Media
  icon: string;                    // 256x256 icon
  screenshots: Screenshot[];       // Up to 10 screenshots
  videoUrl?: string;               // Demo video (YouTube/Vimeo)
  
  // Author
  author: {
    type: 'official' | 'developer' | 'organization';
    id: string;
    name: string;
    verified: boolean;
    avatarUrl?: string;
  };
  
  // Pricing
  price: number;                   // 0 for free
  priceType: 'free' | 'one_time' | 'subscription';
  currency: string;
  
  // Ratings & Stats ⭐
  rating: {
    average: number;               // 0-5 stars (e.g., 4.7)
    count: number;                 // Total ratings
    distribution: {                // Rating breakdown
      5: number;                   // Count of 5-star ratings
      4: number;
      3: number;
      2: number;
      1: number;
    };
  };
  
  // Download/Install Stats ⭐
  stats: {
    totalDownloads: number;        // All-time installs
    activeInstalls: number;        // Current active users
    weeklyDownloads: number;       // Last 7 days
    trendingScore: number;         // For trending calculation
  };
  
  // Compatibility
  minPlanRequired: PlanType;
  requiredGateways: GatewayType[];
  dependencies: string[];          // Other items this depends on
  platformVersion: string;         // Min platform version (e.g., "1.0.0")
  
  // Metadata
  category: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
  
  // Review status
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'changes_requested';
}

interface Screenshot {
  url: string;
  caption?: string;
  order: number;
}

interface ChangelogEntry {
  version: string;
  date: Date;
  changes: string[];               // List of changes
  breakingChanges?: string[];      // Breaking changes highlighted
}
```

### Plugin Security & Sandboxing ⭐ NEW

All third-party plugins run in a sandboxed environment:

```typescript
// Plugin execution sandbox configuration
const PLUGIN_SANDBOX = {
  // Execution limits
  maxExecutionTimeMs: 30000,       // 30 second timeout per execution
  maxMemoryMb: 128,                // 128MB memory limit
  maxCpuPercent: 25,               // Max CPU usage
  
  // Storage limits (per plugin per user)
  maxStorageKeys: 1000,
  maxStorageSizeMb: 10,
  maxKeyLength: 256,
  maxValueSizeKb: 100,
  
  // Rate limits
  maxGatewayCallsPerMinute: 60,
  maxStorageOpsPerMinute: 100,
  maxHttpCallsPerMinute: 30,       // External webhook calls
  
  // Blocked capabilities (plugins CANNOT)
  blocked: [
    'filesystem',                   // No direct file access
    'network.raw',                  // No raw sockets
    'child_process',                // No subprocess spawning
    'eval',                         // No dynamic code execution
    'require.external',             // No loading external modules
  ],
  
  // Allowed capabilities (plugins CAN)
  allowed: [
    'gateway.telegram',             // Via gateway API only
    'gateway.ai',                   // Via gateway API only
    'storage.scoped',               // Scoped key-value storage
    'logger',                       // Logging (sanitized)
    'http.fetch',                   // Fetch API (with restrictions)
    'crypto.basic',                 // Basic crypto functions
  ],
};

// Plugin permission model
interface PluginPermissions {
  gateways: GatewayType[];         // Which gateways it can access
  storage: boolean;                 // Can use persistent storage
  notifications: boolean;           // Can send user notifications
  webhooks: boolean;                // Can make outbound HTTP calls
  scheduling: boolean;              // Can schedule tasks
}
```

### Plugin System

```typescript
interface PluginDefinition {
  // Metadata
  id: string;
  name: string;
  version: string;
  description: string;
  requiredGateways: GatewayType[];
  configSchema: JSONSchema;
  
  // ⭐ NEW: Version compatibility
  platformVersion: string;         // Min platform version required
  dependencies?: {                 // Plugin dependencies
    pluginId: string;
    minVersion: string;
  }[];
  
  // ⭐ NEW: Permissions declaration
  permissions: PluginPermissions;
  
  // Lifecycle hooks
  onInstall?(context: PluginContext): Promise<void>;
  onEnable?(context: PluginContext): Promise<void>;
  onDisable?(context: PluginContext): Promise<void>;
  onUninstall?(context: PluginContext): Promise<void>;
  
  // Event handlers
  onGatewayEvent?(event: GatewayEvent, context: PluginContext): Promise<void>;
  
  // Scheduled tasks
  scheduledTasks?: ScheduledTask[];
}

interface PluginContext {
  userId: string;
  pluginId: string;                // ⭐ NEW: For scoped operations
  config: Record<string, any>;
  
  // Gateway access (via sandbox)
  gateways: {
    get(type: GatewayType): GatewayAPI | null;
    telegramBot?: TelegramBotGateway;   // TELEGRAM_BOT
    telegramUser?: TelegramUserGateway; // TELEGRAM_USER
    ai?: AIGateway;                      // AI (any provider)
  };
  
  // Storage (scoped to this plugin + user)
  storage: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<string[]>; // ⭐ NEW
    clear(): Promise<void>;                    // ⭐ NEW
  };
  
  // ⭐ NEW: Audit logging (automatic)
  audit: {
    log(action: string, metadata?: Record<string, any>): Promise<void>;
  };
  
  // ⭐ NEW: Credits (for AI usage)
  credits: {
    getBalance(): Promise<number>;
    estimateCost(operation: string, params: any): Promise<number>;
    // Deduction happens automatically via gateway calls
  };
  
  // Logging (sanitized)
  logger: Logger;
}
```

### Theme System

```typescript
interface ThemeDefinition {
  id: string;
  name: string;
  type: 'light' | 'dark';
  
  colors: {
    // Base colors
    background: string;
    foreground: string;
    
    // Component colors
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    
    // Brand colors
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    
    // Semantic colors
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    
    // Utility
    border: string;
    input: string;
    ring: string;
  };
  
  fonts?: {
    heading?: string;
    body?: string;
    mono?: string;
  };
  
  borderRadius?: {
    sm: string;
    md: string;
    lg: string;
  };
  
  // Optional custom CSS (SANITIZED) ⭐
  customCSS?: string;
}

// ⭐ NEW: Theme CSS Sanitization (Security)
const THEME_CSS_SANITIZER = {
  // Blocked CSS properties (security risk)
  blockedProperties: [
    'behavior',                    // IE behaviors
    'expression',                  // CSS expressions (XSS)
    '-moz-binding',                // XBL bindings
  ],
  
  // Blocked values (XSS vectors)
  blockedValues: [
    'javascript:',
    'expression(',
    'url(data:',                   // Data URIs (except safe images)
    'url(javascript:',
  ],
  
  // Allowed URL patterns
  allowedUrlPatterns: [
    /^https:\/\//,                 // HTTPS only
    /^data:image\/(png|jpg|jpeg|gif|svg\+xml);base64,/, // Safe images
  ],
  
  // Max CSS size
  maxSizeKb: 50,
};

function sanitizeThemeCSS(css: string): string {
  // 1. Check size limit
  if (css.length > THEME_CSS_SANITIZER.maxSizeKb * 1024) {
    throw new Error('CSS exceeds maximum size');
  }
  
  // 2. Remove blocked properties and values
  // 3. Validate URLs
  // 4. Return sanitized CSS
  return sanitizedCSS;
}

// Theme Provider applies CSS variables
function applyTheme(theme: ThemeDefinition) {
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${kebabCase(key)}`, value);
  });
  
  // ⭐ Apply sanitized custom CSS
  if (theme.customCSS) {
    const sanitized = sanitizeThemeCSS(theme.customCSS);
    const styleEl = document.getElementById('theme-custom-css') || 
                    document.createElement('style');
    styleEl.id = 'theme-custom-css';
    styleEl.textContent = sanitized;
    document.head.appendChild(styleEl);
  }
}
```

### Widget System

```typescript
interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  
  // Size configuration
  defaultSize: WidgetSize;
  allowedSizes: WidgetSize[];
  
  // Data
  dataSource?: {
    type: 'api' | 'gateway' | 'static';
    endpoint?: string;          // For API type
    gateway?: GatewayType;      // For gateway type
    method?: string;
    params?: Record<string, any>;
  };
  refreshInterval?: number;     // Seconds
  
  // Configuration
  configSchema?: JSONSchema;
  
  // Render component (React)
  component: React.FC<WidgetProps>;
}

interface WidgetProps {
  data: any;
  config: Record<string, any>;
  size: WidgetSize;
  isLoading: boolean;
  error?: Error;
  onRefresh: () => void;
}

// Widget sizes for grid (4-column layout)
const WIDGET_SIZES = {
  SMALL: '1x1',        // 1 column, 1 row
  MEDIUM: '2x1',       // 2 columns, 1 row
  LARGE: '2x2',        // 2 columns, 2 rows
  EXTRA_LARGE: '4x2',  // 4 columns (full width), 2 rows
};

// Grid configuration
const DASHBOARD_GRID = {
  columns: 4,           // 4-column grid
  rowHeight: 150,       // pixels per row
  gap: 16,              // gap between widgets
};
```

### Service (Workflow) System

```typescript
interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  requiredGateways: GatewayType[];
  configSchema: JSONSchema;
  
  // Trigger
  trigger: {
    type: 'manual' | 'schedule' | 'event' | 'webhook';
    config: TriggerConfig;
  };
  
  // Workflow steps
  steps: ServiceStep[];
}

interface ServiceStep {
  id: string;
  name: string;
  type: StepType;
  
  // For gateway steps
  gateway?: GatewayType;
  action?: string;
  
  // Configuration with variable support
  config: Record<string, any>;  // Supports {{variable}} syntax
  
  // Output
  output?: string;              // Variable name to store result
  
  // Error handling
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;
  retryDelay?: number;          // Milliseconds
  
  // Conditional (for 'condition' type)
  condition?: string;           // Expression like "{{steps.step1.count}} > 10"
  onTrue?: string;              // Step ID to jump to
  onFalse?: string;
  
  // Loop (for 'loop' type)
  loopOver?: string;            // Variable containing array
  loopVariable?: string;        // Name for current item
}

type StepType = 
  | 'gateway'     // Call a gateway method
  | 'transform'   // Transform/filter data
  | 'condition'   // If/else branching
  | 'loop'        // Iterate over array
  | 'delay'       // Wait for time
  | 'webhook'     // Call external API
  | 'plugin'      // Execute a plugin method
  | 'script';     // Run custom JavaScript (sandboxed)

// ⭐ NEW: Script Step Sandbox (Security)
// Custom JavaScript runs in isolated VM with strict limits
const SCRIPT_SANDBOX = {
  // Execution environment: isolated-vm or quickjs-emscripten
  runtime: 'isolated-vm',
  
  // Execution limits
  maxExecutionTimeMs: 5000,        // 5 second max
  maxMemoryMb: 32,                 // 32MB memory limit
  
  // Available globals (whitelist only)
  allowedGlobals: [
    'JSON',
    'Math',
    'Date',
    'String',
    'Number',
    'Boolean',
    'Array',
    'Object',
    'Map',
    'Set',
    'Promise',
    'console',                     // Redirected to logger
  ],
  
  // Blocked (NOT available)
  blocked: [
    'fetch',                       // Use 'webhook' step instead
    'XMLHttpRequest',
    'WebSocket',
    'eval',
    'Function',
    'require',
    'import',
    'process',
    'global',
    'window',
    'document',
  ],
  
  // Injected context (read-only)
  injectedContext: [
    'input',                       // Previous step output
    'config',                      // Service configuration
    'steps',                       // All previous step results
    'variables',                   // Workflow variables
  ],
};

// Script step example
const scriptStepExample = {
  id: 'process-data',
  name: 'Process Data',
  type: 'script',
  config: {
    code: `
      // Input from previous step
      const messages = input;
      
      // Transform data
      const processed = messages
        .filter(m => m.views > 100)
        .map(m => ({
          text: m.text,
          score: m.views * 0.1 + m.reactions * 0.5
        }))
        .sort((a, b) => b.score - a.score);
      
      // Return result (becomes step output)
      return processed.slice(0, 5);
    `,
  },
  output: 'topMessages',
};

// Workflow Engine
interface WorkflowEngine {
  execute(
    service: UserService,
    context: WorkflowContext
  ): Promise<ExecutionResult>;
}

interface WorkflowContext {
  userId: string;
  serviceId: string;
  config: Record<string, any>;      // User's service config
  gateways: Map<GatewayType, Gateway>;
  variables: Map<string, any>;      // Shared state between steps
  logger: Logger;
}

interface ExecutionResult {
  status: 'completed' | 'failed' | 'cancelled';
  stepResults: StepResult[];
  error?: Error;
  duration: number;
}
```

### Example Service Definition (Content Maker)

```json
{
  "id": "content-maker",
  "name": "Content Maker",
  "description": "Automatically generate and post content from source channels",
  "requiredGateways": ["TELEGRAM_USER", "AI", "TELEGRAM_BOT"],
  "configSchema": {
    "type": "object",
    "properties": {
      "sourceChannel": { "type": "string", "title": "Source Channel ID" },
      "targetChannel": { "type": "string", "title": "Target Channel ID" },
      "aiPrompt": { "type": "string", "title": "AI Instructions" },
      "minViews": { "type": "number", "title": "Minimum Views", "default": 100 }
    },
    "required": ["sourceChannel", "targetChannel", "aiPrompt"]
  },
  "trigger": {
    "type": "schedule",
    "config": { "cron": "0 */2 * * *" }
  },
  "steps": [
    {
      "id": "fetch",
      "name": "Fetch Source Messages",
      "type": "gateway",
      "gateway": "TELEGRAM_USER",
      "action": "getMessages",
      "config": {
        "peer": "{{config.sourceChannel}}",
        "limit": 20
      },
      "output": "sourceMessages"
    },
    {
      "id": "filter",
      "name": "Filter Popular Messages",
      "type": "transform",
      "config": {
        "input": "{{steps.fetch.sourceMessages}}",
        "filter": "item.views >= {{config.minViews}}"
      },
      "output": "filteredMessages"
    },
    {
      "id": "generate",
      "name": "Generate Content",
      "type": "gateway",
      "gateway": "AI",
      "action": "chat",
      "config": {
        "model": "gpt-4",
        "messages": [
          { "role": "system", "content": "{{config.aiPrompt}}" },
          { "role": "user", "content": "Based on these posts, create original content:\n{{steps.filter.filteredMessages}}" }
        ]
      },
      "output": "generatedContent"
    },
    {
      "id": "post",
      "name": "Post to Channel",
      "type": "gateway",
      "gateway": "TELEGRAM_BOT",
      "action": "sendMessage",
      "config": {
        "chatId": "{{config.targetChannel}}",
        "text": "{{steps.generate.generatedContent.choices[0].message.content}}"
      },
      "output": "postedMessage"
    }
  ]
}
```

### Workspace Templates ⭐ NEW

Workspace Templates allow users and organizations to package and sell their complete workspace configurations. This enables new users to get started quickly with proven, production-ready setups.

```typescript
// ============================================
// WORKSPACE TEMPLATE SYSTEM
// ============================================

// Template = Exportable workspace configuration (NO user data)
interface WorkspaceTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  longDescription: string;        // Markdown with setup guide
  
  // Author (user or organization)
  author: {
    type: 'user' | 'organization';
    id: string;
    name: string;
    verified: boolean;
  };
  
  // Template type
  templateType: TemplateType;
  
  // Pricing (template owners earn revenue)
  pricing: {
    type: 'free' | 'one_time' | 'subscription';
    price: number;                // In cents (0 for free)
    currency: string;
    revenueShare: number;         // Owner's share % (default 70%)
  };
  
  // What's included (schema only - NO user data)
  contents: TemplateContents;
  
  // Requirements
  requirements: {
    minPlan: PlanType;            // Minimum plan to use this template
    requiredGateways: GatewayType[]; // Gateways user must configure
    estimatedCredits: number;     // Monthly credit estimate
  };
  
  // Review status (admin approval required)
  reviewStatus: TemplateReviewStatus;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  
  // Stats
  stats: {
    totalInstalls: number;
    activeInstalls: number;
    rating: number;
    reviewCount: number;
  };
  
  // Metadata
  category: string;
  tags: string[];
  version: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

enum TemplateType {
  STARTER = 'starter',            // Basic setup for beginners
  WORKFLOW = 'workflow',          // Single workflow/service template
  DEPARTMENT = 'department',      // Department configuration
  ORGANIZATION = 'organization',  // Full org structure
  INDUSTRY = 'industry',          // Industry-specific (e.g., "Trucking Company")
}

enum TemplateReviewStatus {
  DRAFT = 'draft',                // Not submitted
  PENDING = 'pending',            // Awaiting admin review
  IN_REVIEW = 'in_review',        // Admin is reviewing
  CHANGES_REQUESTED = 'changes_requested',
  APPROVED = 'approved',          // Ready to publish
  REJECTED = 'rejected',          // Not approved
  PUBLISHED = 'published',        // Live on marketplace
}

// What a template contains (SCHEMA ONLY - no user data!)
interface TemplateContents {
  // ⚠️ IMPORTANT: Templates contain CONFIGURATION only
  // NO actual user data, credentials, or personal information
  
  // Services/Workflows
  services?: ServiceSchema[];     // Service configurations
  
  // Plugins
  plugins?: PluginSchema[];       // Plugin configurations
  
  // Widgets
  widgets?: WidgetSchema[];       // Dashboard widget layouts
  
  // Organization structure (for org templates)
  departments?: DepartmentSchema[];
  roles?: RoleSchema[];
  
  // Gateway placeholders (user fills in credentials)
  gatewayPlaceholders: GatewayPlaceholder[];
  
  // Variable placeholders (user customizes)
  variables: VariablePlaceholder[];
  
  // Setup steps (guided installation)
  setupSteps: SetupStep[];
}

// Service schema (workflow definition without user data)
interface ServiceSchema {
  name: string;
  description: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>; // Template values
  steps: ServiceStep[];
  configSchema: JSONSchema;       // What user needs to configure
}

// Plugin configuration schema
interface PluginSchema {
  pluginSlug: string;             // Marketplace plugin to install
  configTemplate: Record<string, any>; // Default config values
  configPlaceholders: string[];   // Keys user must fill
}

// Widget layout schema
interface WidgetSchema {
  widgetSlug: string;
  position: { x: number; y: number; w: number; h: number };
  configTemplate: Record<string, any>;
}

// Department structure for org templates
interface DepartmentSchema {
  name: string;
  description: string;
  color: string;
  plugins: string[];              // Plugin slugs assigned
  services: string[];             // Service names assigned
  resourceQuotas?: {
    ramMb?: number;
    cpuCores?: number;
    storageMb?: number;
  };
}

// Gateway placeholder (user provides credentials)
interface GatewayPlaceholder {
  type: GatewayType;
  name: string;                   // Suggested name
  description: string;            // What it's used for
  required: boolean;
}

// Variable placeholder (user customizes)
interface VariablePlaceholder {
  key: string;
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];             // For select type
  defaultValue?: any;
  required: boolean;
  example?: string;
}

// Guided setup step
interface SetupStep {
  order: number;
  title: string;
  description: string;
  type: 'info' | 'gateway' | 'variable' | 'confirmation';
  gatewayType?: GatewayType;      // For gateway steps
  variableKeys?: string[];        // For variable steps
}
```

### Template Installation Flow

```typescript
// Step-by-step template installation process
async function installTemplate(
  userId: string,
  templateId: string,
  userInputs: TemplateInputs
): Promise<InstallationResult> {
  const template = await getTemplate(templateId);
  
  // 1. Verify user meets requirements
  await verifyRequirements(userId, template.requirements);
  
  // 2. Process payment (if paid template)
  if (template.pricing.type !== 'free') {
    await processTemplatePurchase(userId, template);
  }
  
  // 3. Create gateways from placeholders
  const gatewayMap = new Map<string, string>();
  for (const placeholder of template.contents.gatewayPlaceholders) {
    const credentials = userInputs.gateways[placeholder.type];
    const gateway = await createGateway(userId, {
      type: placeholder.type,
      name: placeholder.name,
      credentials,
    });
    gatewayMap.set(placeholder.type, gateway.id);
  }
  
  // 4. Apply variable substitutions
  const variables = { ...template.contents.variables, ...userInputs.variables };
  
  // 5. Install plugins
  for (const pluginSchema of template.contents.plugins || []) {
    await installPlugin(userId, pluginSchema.pluginSlug, {
      config: substituteVariables(pluginSchema.configTemplate, variables),
      gateways: gatewayMap,
    });
  }
  
  // 6. Create services
  for (const serviceSchema of template.contents.services || []) {
    await createService(userId, {
      ...serviceSchema,
      config: substituteVariables(serviceSchema.configSchema, variables),
    });
  }
  
  // 7. Setup widgets
  for (const widgetSchema of template.contents.widgets || []) {
    await addWidget(userId, widgetSchema);
  }
  
  // 8. Create departments (for org templates)
  if (template.templateType === 'organization' && userInputs.organizationId) {
    for (const deptSchema of template.contents.departments || []) {
      await createDepartment(userInputs.organizationId, deptSchema);
    }
  }
  
  // 9. Update stats
  await incrementTemplateInstalls(templateId);
  
  return {
    success: true,
    installedPlugins: template.contents.plugins?.length || 0,
    installedServices: template.contents.services?.length || 0,
    createdDepartments: template.contents.departments?.length || 0,
  };
}
```

### Template Export & Publishing

```typescript
// Export current workspace as template
async function exportWorkspaceAsTemplate(
  userId: string,
  options: ExportOptions
): Promise<WorkspaceTemplate> {
  // ⚠️ CRITICAL: Strip ALL user data
  // Only export SCHEMA and CONFIGURATION
  
  const template: Partial<WorkspaceTemplate> = {
    author: { type: 'user', id: userId, name: '', verified: false },
    templateType: options.type,
    contents: {
      services: [],
      plugins: [],
      widgets: [],
      gatewayPlaceholders: [],
      variables: [],
      setupSteps: [],
    },
  };
  
  // Export services (strip user data)
  if (options.includeServices) {
    const services = await getUserServices(userId);
    template.contents!.services = services.map(s => ({
      name: s.name,
      description: s.description || '',
      triggerType: s.triggerType,
      triggerConfig: sanitizeConfig(s.triggerConfig), // Remove secrets
      steps: s.steps.map(step => sanitizeStep(step)),
      configSchema: generateConfigSchema(s),
    }));
    
    // Create gateway placeholders from used gateways
    const usedGateways = new Set<GatewayType>();
    services.forEach(s => s.steps.forEach(step => {
      if (step.gateway) usedGateways.add(step.gateway);
    }));
    
    template.contents!.gatewayPlaceholders = Array.from(usedGateways).map(type => ({
      type,
      name: `${type} Gateway`,
      description: `Required for workflow operations`,
      required: true,
    }));
  }
  
  // Export plugins (strip user config values)
  if (options.includePlugins) {
    const plugins = await getUserPlugins(userId);
    template.contents!.plugins = plugins.map(p => ({
      pluginSlug: p.item.slug,
      configTemplate: generateConfigTemplate(p.config),
      configPlaceholders: extractPlaceholders(p.config),
    }));
  }
  
  return template as WorkspaceTemplate;
}

// Admin review workflow
async function submitTemplateForReview(templateId: string): Promise<void> {
  await updateTemplate(templateId, {
    reviewStatus: 'pending',
    submittedAt: new Date(),
  });
  
  // Notify admins
  await notifyAdmins('template_review', {
    templateId,
    message: 'New template submitted for review',
  });
}

// Admin approval
async function reviewTemplate(
  adminId: string,
  templateId: string,
  decision: 'approve' | 'reject' | 'changes_requested',
  notes?: string
): Promise<void> {
  // Verify admin permission
  await verifyAdminPermission(adminId, 'marketplace:review');
  
  const newStatus = decision === 'approve' ? 'approved' : 
                    decision === 'reject' ? 'rejected' : 'changes_requested';
  
  await updateTemplate(templateId, {
    reviewStatus: newStatus,
    reviewedAt: new Date(),
    reviewedBy: adminId,
    reviewNotes: notes,
    ...(decision === 'approve' && { publishedAt: new Date() }),
  });
  
  // Notify template author
  const template = await getTemplate(templateId);
  await sendNotification(template.author.id, {
    type: 'MARKETPLACE_REVIEW',
    title: `Template ${decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Needs Changes'}`,
    message: notes || `Your template "${template.name}" has been ${decision}.`,
  });
  
  // Log admin action
  await createAdminAuditLog({
    adminId,
    action: 'template.review',
    targetType: 'workspace_template',
    targetId: templateId,
    newValue: { status: newStatus, notes },
  });
}
```

### Template Revenue Sharing

```typescript
// Template owners earn money from sales
const TEMPLATE_REVENUE = {
  // Revenue split
  ownerShare: 70,                 // 70% to template creator
  platformShare: 30,              // 30% to 2Bot
  
  // Minimum payout
  minPayoutAmount: 50,            // $50 minimum
  payoutFrequency: 'monthly',     // Monthly payouts
  
  // Pricing guidelines
  pricing: {
    free: 0,
    starter: { min: 5, max: 25 },       // $5-$25
    workflow: { min: 10, max: 50 },     // $10-$50
    department: { min: 25, max: 100 },  // $25-$100
    organization: { min: 50, max: 500 }, // $50-$500
    industry: { min: 100, max: 1000 },  // $100-$1000
  },
};

// Track template sales
interface TemplateSale {
  id: string;
  templateId: string;
  buyerId: string;
  amount: number;
  ownerEarnings: number;          // After platform cut
  platformFee: number;
  createdAt: Date;
}
```

---

## 💰 Monetization

### Pricing Philosophy: Platform + Workspace Resources

The pricing model separates **Platform features** (what you can do) from **Workspace resources** (how much you can run). This ensures fair billing and protects the platform from resource abuse.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRICING MODEL OVERVIEW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PLATFORM (Same for all)          │    WORKSPACE (Per user, isolated)      │
│  ────────────────────────         │    ─────────────────────────────       │
│  ✓ Authentication                 │    ✓ Gateway workers                   │
│  ✓ Dashboard UI                   │    ✓ Plugin runtime                    │
│  ✓ Marketplace access             │    ✓ Service executor                  │
│  ✓ Billing management             │    ✓ Workflow engine                   │
│                                   │                                        │
│  Cost: Fixed infrastructure       │    Cost: Based on plan resources       │
│                                   │                                        │
│  Free tier users share platform   │    Each user gets isolated container   │
│  resources equally                │    with hard resource limits           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Annual Billing Discount ⭐ NEW

**Save 2 months free with annual billing:**

| Plan | Monthly | Annual | Savings |
|------|---------|--------|--------|
| Starter | $9/mo | $90/yr ($7.50/mo) | $18/yr (17%) |
| Pro | $29/mo | $290/yr ($24.17/mo) | $58/yr (17%) |
| Business | $79/mo | $790/yr ($65.83/mo) | $158/yr (17%) |
| Enterprise | $199/mo | $1,990/yr ($165.83/mo) | $398/yr (17%) |
| Org Starter | $49/mo | $490/yr ($40.83/mo) | $98/yr (17%) |
| Org Growth | $99/mo | $990/yr ($82.50/mo) | $198/yr (17%) |
| Org Pro | $199/mo | $1,990/yr ($165.83/mo) | $398/yr (17%) |
| Org Business | $399/mo | $3,990/yr ($332.50/mo) | $798/yr (17%) |

### Platform Pricing Tiers (Individual Users)

| Feature | Free | Starter ($9/mo) | Pro ($29/mo) | Business ($79/mo) | Enterprise ($199/mo) |
|---------|------|-----------------|--------------|-------------------|----------------------|
| **WORKSPACE** | | | | | |
| RAM | 512MB | 1GB | 2GB | 4GB | 8GB+ |
| CPU | 0.5 vCPU | 1 vCPU | 2 vCPU | 4 vCPU | 8+ vCPU |
| Storage | 100MB | 1GB | 5GB | 20GB | 100GB+ |
| Zero-Downtime Upgrade | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **LIMITS** | | | | | |
| Gateways | 2 | 3 | 5 | 10 | Unlimited |
| Plugins | 3 | 5 | 10 | 25 | Unlimited |
| Services | 1 | 3 | 5 | 15 | Unlimited |
| Widgets | 4 | 6 | 10 | 20 | Unlimited |
| Service runs/day | 50 | 500 | 2,000 | 10,000 | Unlimited |
| **FREE CREDITS** ⭐ | 100/mo | 500/mo | 1,000/mo | 5,000/mo | 10,000/mo |
| Credit Purchase | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| API Keys | 1 | 2 | 5 | 10 | 20 |
| **FEATURES** | | | | | |
| Themes | Built-in | Free | + Premium | + Premium | + Custom |
| TELEGRAM_USER | ❌ No | ⚠️ Limited | ✅ Yes | ✅ Full | ✅ Full |
| Audit Log | 7 days | 14 days | 30 days | 90 days | 1 year |
| Analytics | 7 days | 14 days | 30 days | 90 days | 1 year |
| Support | Community | Email | Priority | Dedicated | SLA |
| Auto-start | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

### Organization Pricing Tiers (Companies/Teams) ⭐

| Feature | Org Starter ($49/mo) | Org Growth ($99/mo) | Org Pro ($199/mo) | Org Business ($399/mo) | Org Enterprise |
|---------|---------------------|---------------------|-------------------|------------------------|----------------|
| **SEATS** | | | | | |
| Included Seats | 10 | 25 | 50 | 100 | Custom |
| Extra Seat Price | $5/seat/mo | $4/seat/mo | $3/seat/mo | $2/seat/mo | Volume discount |
| **SHARED RESOURCES** | | | | | |
| Total RAM Pool | 4GB | 8GB | 16GB | 32GB | Custom |
| Total CPU Pool | 2 vCPU | 4 vCPU | 8 vCPU | 16 vCPU | Custom |
| Total Storage | 10GB | 25GB | 50GB | 100GB | Custom |
| **ORGANIZATION** | | | | | |
| Departments | 3 | 10 | 25 | Unlimited | Unlimited |
| Org Admins | 1 | 3 | 5 | 10 | Unlimited |
| Dept Managers | 3 | 10 | 25 | 50 | Unlimited |
| **LICENSES** | | | | | |
| Marketplace Items | Buy once, share all | Buy once, share all | Buy once, share all | Buy once, share all | Buy once, share all |
| License Limit | 10 items | 25 items | 50 items | 100 items | Unlimited |
| **FEATURES** | | | | | |
| Audit Log | 30 days | 60 days | 90 days | 1 year | Custom |
| Inter-Org Links | ❌ No | 1 partner | 5 partners | 20 partners | Unlimited |
| SSO/SAML | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ✅ Custom |
| Support | Email | Priority | Dedicated | Dedicated | SLA + CSM |
| Custom Branding | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ✅ White-label |

### Organization vs Individual: Cost Comparison

```
Example: 30-person trucking company using 5 plugins + 3 services

OPTION A: Individual Plans (everyone buys separately)
─────────────────────────────────────────────────────
• 30 users × Starter ($9/mo)      = $270/mo
• 30 users × 5 plugins ($5 each)  = $750 (one-time) or $X/mo if subscription
• 30 users × 3 services ($10 each)= $900 (one-time) or $X/mo if subscription
• Total: $270/mo + marketplace costs per user
• Each user manages their own workspace, billing, settings

OPTION B: Organization Plan (company buys once)
─────────────────────────────────────────────────────
• Org Pro (50 seats): $199/mo     = $199/mo
• 5 plugins (org license)         = $25 (one-time) or $X/mo - SHARED!
• 3 services (org license)        = $30 (one-time) or $X/mo - SHARED!
• Total: $199/mo + ONE marketplace license for all
• Central management, one invoice, shared data

SAVINGS: ~$71/mo + massive marketplace savings! ✅
```

### Resource Add-ons (Pay-as-you-grow)

| Resource | Price | Available From |
|----------|-------|----------------|
| Extra RAM | $5/GB/month | Pro+ |
| Extra CPU | $10/vCPU/month | Pro+ |
| Extra Storage | $0.50/GB/month | Starter+ |
| Extra Service Runs | $0.001/run | All tiers |
| Extra AI Tokens | $0.002/1K tokens | All tiers |

### Plan Limits Configuration

```typescript
// src/shared/constants/plan-limits.ts

export const PLAN_LIMITS = {
  FREE: {
    // Workspace resources (isolated container)
    workspace: {
      ramMb: 512,
      cpuCores: 0.5,
      storageMb: 100,
      autoStart: false,  // Manual start required
    },
    // Platform limits
    gateways: 2,
    plugins: 3,
    widgets: 4,
    services: 1,
    serviceRunsPerDay: 50,
    aiTokensPerMonth: 10_000,
    apiKeys: 1,
    auditLogDays: 7,
    analyticsDays: 7,
    allowTelegramUser: false,
    allowAddons: false,
  },
  STARTER: {
    workspace: {
      ramMb: 1024,
      cpuCores: 1,
      storageMb: 1024,
      autoStart: true,
    },
    gateways: 3,
    plugins: 5,
    widgets: 6,
    services: 3,
    serviceRunsPerDay: 500,
    aiTokensPerMonth: 50_000,
    apiKeys: 2,
    auditLogDays: 14,
    analyticsDays: 14,
    allowTelegramUser: true,  // limited
    allowAddons: true,        // storage only
  },
  PRO: {
    workspace: {
      ramMb: 2048,
      cpuCores: 2,
      storageMb: 5120,
      autoStart: true,
    },
    gateways: 5,
    plugins: 10,
    widgets: 10,
    services: 5,
    serviceRunsPerDay: 2000,
    aiTokensPerMonth: 100_000,
    apiKeys: 5,
    auditLogDays: 30,
    analyticsDays: 30,
    allowTelegramUser: true,
    allowAddons: true,
  },
  BUSINESS: {
    workspace: {
      ramMb: 4096,
      cpuCores: 4,
      storageMb: 20480,
      autoStart: true,
    },
    gateways: 10,
    plugins: 25,
    widgets: 20,
    services: 15,
    serviceRunsPerDay: 10_000,
    aiTokensPerMonth: 500_000,
    apiKeys: 10,
    auditLogDays: 90,
    analyticsDays: 90,
    allowTelegramUser: true,
    allowAddons: true,
  },
  ENTERPRISE: {
    workspace: {
      ramMb: 8192,
      cpuCores: 8,
      storageMb: 102400,
      autoStart: true,
    },
    gateways: Infinity,
    plugins: Infinity,
    widgets: Infinity,
    services: Infinity,
    serviceRunsPerDay: Infinity,
    aiTokensPerMonth: 1_000_000,
    apiKeys: 20,
    auditLogDays: 365,
    analyticsDays: 365,
    allowTelegramUser: true,
    allowAddons: true,
    customLimits: true,  // Negotiate custom limits
  },
};

// Addon pricing (cents per unit per month)
export const ADDON_PRICING = {
  ramPerGb: 500,           // $5/GB
  cpuPerCore: 1000,        // $10/vCPU
  storagePerGb: 50,        // $0.50/GB
  serviceRunOverage: 0.1,  // $0.001/run
  aiTokenOverage: 0.2,     // $0.002/1K tokens
};

// Organization Plan Limits
export const ORG_PLAN_LIMITS = {
  ORG_STARTER: {
    workspace: {
      ramMb: 4096,           // 4GB total pool
      cpuCores: 2,
      storageMb: 10240,      // 10GB
    },
    seats: {
      included: 10,
      extraPricePerSeat: 500, // $5/seat/mo
    },
    departments: 3,
    orgAdmins: 1,
    deptManagers: 3,
    marketplaceItems: 10,
    auditLogDays: 30,
    interOrgLinks: 0,
    allowSso: false,
    allowCustomBranding: false,
  },
  ORG_GROWTH: {
    workspace: {
      ramMb: 8192,           // 8GB
      cpuCores: 4,
      storageMb: 25600,      // 25GB
    },
    seats: {
      included: 25,
      extraPricePerSeat: 400, // $4/seat/mo
    },
    departments: 10,
    orgAdmins: 3,
    deptManagers: 10,
    marketplaceItems: 25,
    auditLogDays: 60,
    interOrgLinks: 1,
    allowSso: false,
    allowCustomBranding: true,
  },
  ORG_PRO: {
    workspace: {
      ramMb: 16384,          // 16GB
      cpuCores: 8,
      storageMb: 51200,      // 50GB
    },
    seats: {
      included: 50,
      extraPricePerSeat: 300, // $3/seat/mo
    },
    departments: 25,
    orgAdmins: 5,
    deptManagers: 25,
    marketplaceItems: 50,
    auditLogDays: 90,
    interOrgLinks: 5,
    allowSso: true,
    allowCustomBranding: true,
  },
  ORG_BUSINESS: {
    workspace: {
      ramMb: 32768,          // 32GB
      cpuCores: 16,
      storageMb: 102400,     // 100GB
    },
    seats: {
      included: 100,
      extraPricePerSeat: 200, // $2/seat/mo
    },
    departments: Infinity,
    orgAdmins: 10,
    deptManagers: 50,
    marketplaceItems: 100,
    auditLogDays: 365,
    interOrgLinks: 20,
    allowSso: true,
    allowCustomBranding: true,
  },
  ORG_ENTERPRISE: {
    workspace: {
      ramMb: Infinity,       // Custom
      cpuCores: Infinity,
      storageMb: Infinity,
    },
    seats: {
      included: Infinity,
      extraPricePerSeat: 0,  // Volume negotiated
    },
    departments: Infinity,
    orgAdmins: Infinity,
    deptManagers: Infinity,
    marketplaceItems: Infinity,
    auditLogDays: 365,
    interOrgLinks: Infinity,
    allowSso: true,
    allowCustomBranding: true,
    whiteLabel: true,
  },
};
```

### Marketplace Item Pricing Models

| Model | Description | Example |
|-------|-------------|---------|
| **Free** | Basic items, drives adoption | Default theme, Stats widget |
| **One-time** | Pay once, use forever | Premium theme ($9.99) |
| **Monthly** | Recurring per item | Advanced Analytics plugin ($4.99/mo) |
| **Yearly** | Annual discount | Content Maker service ($49.99/yr) |

### Future Revenue Streams

1. **Developer Marketplace** - 30% commission on third-party items
2. **Workspace Templates** ⭐ - 30% commission on user/org template sales
3. **White-label** - Enterprise customers rebrand the platform
4. **API Access** - Developers pay for API access
5. **Custom Development** - Enterprise custom plugin/service development
6. **Featured Listings** - Pay to feature items in marketplace
7. **Credit Purchases** ⭐ - Pay-as-you-go for AI tokens and overages

### Credit System & Overages ⭐ NEW

**How Credits Work with Plans:**

```typescript
// Credit allocation per plan (monthly, resets on billing cycle)
const FREE_CREDITS_PER_PLAN = {
  FREE: 100,              // ~1,000 GPT-4 tokens or ~10,000 GPT-3.5 tokens
  STARTER: 500,           // ~5,000 GPT-4 tokens
  PRO: 1000,              // ~10,000 GPT-4 tokens
  BUSINESS: 5000,         // ~50,000 GPT-4 tokens
  ENTERPRISE: 10000,      // ~100,000 GPT-4 tokens
  // Organizations get credits via OrgCreditPool
};

// What happens when free credits run out:
const OVERAGE_HANDLING = {
  freeCreditsExhausted: {
    FREE: 'block',              // Block AI usage until next month
    STARTER: 'prompt_purchase', // Prompt to buy credits
    PRO: 'auto_deduct',         // Deduct from purchased balance
    BUSINESS: 'auto_deduct',    // Deduct from purchased balance
    ENTERPRISE: 'auto_deduct',  // Deduct from purchased balance
  },
  
  purchasedCreditsExhausted: {
    autoTopUp: 'if_enabled',    // Auto top-up if user enabled
    fallback: 'block_with_notification', // Block + notify
  },
  
  // Service run overages (beyond daily limit)
  serviceRunOverage: {
    cost: 1,                    // 1 credit per extra run
    maxOverage: 'plan_limit_2x', // Max 2x daily limit as overage
  },
};
```

**Credit Purchase Options:**

| Package | Price | Credits | Bonus | Per Credit |
|---------|-------|---------|-------|------------|
| Starter | $5 | 500 | - | $0.010 |
| Popular | $10 | 1,000 | +100 (10%) | $0.009 |
| Value | $25 | 2,500 | +375 (15%) | $0.008 |
| Pro | $50 | 5,000 | +1,000 (20%) | $0.007 |
| Business | $100 | 10,000 | +2,500 (25%) | $0.006 |

### Billing Policies ⭐ NEW

#### Refund Policy

```typescript
const REFUND_POLICY = {
  // Subscription refunds
  subscription: {
    newSubscriber: {
      window: '14_days',          // 14-day money-back guarantee
      type: 'full_refund',
      conditions: ['first_subscription_only', 'no_abuse'],
    },
    midCycle: {
      type: 'prorated_credit',    // Credit toward next billing
      minDaysRemaining: 7,
    },
    annualDowngrade: {
      type: 'prorated_refund',    // Refund unused months
      fee: '10%',                 // 10% early termination fee
    },
  },
  
  // One-time purchase refunds
  marketplace: {
    window: '7_days',             // 7-day refund window
    conditions: ['not_heavily_used', 'technical_issue'],
    developerNotified: true,
  },
  
  // Credit purchases
  credits: {
    unused: 'refundable_30_days', // Unused credits refundable within 30 days
    used: 'no_refund',
  },
  
  // Templates
  templates: {
    window: '7_days',
    conditions: ['not_installed'],
  },
};
```

#### Cancellation Terms

```typescript
const CANCELLATION_POLICY = {
  // What happens when user cancels
  immediate: false,               // Access continues until period end
  
  // Data retention after cancellation
  dataRetention: {
    FREE: '30_days',              // 30 days to reactivate
    PAID: '90_days',              // 90 days to reactivate
    ENTERPRISE: '1_year',         // 1 year (contractual)
  },
  
  // What's preserved
  preserved: [
    'user_account',               // Account data
    'configuration',              // Gateway configs (encrypted)
    'audit_logs',                 // Per retention policy
  ],
  
  // What's deleted
  deleted: [
    'workspace_container',        // Container stopped + removed
    'runtime_state',              // Plugin/service state
    'cached_data',                // Redis cache cleared
  ],
  
  // Reactivation
  reactivation: {
    withinRetention: 'full_restore',
    afterRetention: 'new_account', // Must start fresh
  },
};
```

#### Payment Failure Handling

```typescript
const PAYMENT_FAILURE_POLICY = {
  // Grace period before service impact
  gracePeriod: {
    duration: '7_days',
    notifications: ['immediate', 'day_3', 'day_5', 'day_7'],
  },
  
  // Retry schedule
  retrySchedule: [
    { day: 1, time: 'original_time' },
    { day: 3, time: 'original_time' },
    { day: 5, time: 'original_time' },
    { day: 7, time: 'original_time' },
  ],
  
  // Service degradation (after grace period)
  degradation: {
    day_8: {
      action: 'downgrade_to_free',
      notification: 'email_sms',
      reversible: true,
    },
    day_14: {
      action: 'suspend_workspace',
      notification: 'email_sms',
      reversible: true,
    },
    day_30: {
      action: 'archive_data',
      notification: 'final_warning',
      reversible: '90_days',
    },
  },
  
  // What happens to marketplace items
  marketplaceItems: {
    ownedOneTime: 'keep_access',   // One-time purchases kept
    subscriptions: 'pause_access', // Subscription items paused
  },
  
  // Credit balance
  creditBalance: 'preserved',      // Credits never expire due to payment failure
};
```

---

## 📊 Success Metrics

### Launch Goals (Month 1)
- [ ] 100 registered users
- [ ] 50 active users (weekly)
- [ ] 10 paying customers
- [ ] 3 working plugins
- [ ] 2 themes (light + dark)
- [ ] 3 widgets
- [ ] 2 services in marketplace

### Credit System Metrics (Month 1) ⭐
- [ ] 10,000 free credits consumed (AI usage traction)
- [ ] 5 users purchased additional credits
- [ ] Average 50 credits/user/week consumption
- [ ] <5% credit purchase failures
- [ ] 20% free-to-paid credit conversion rate

### Growth Goals (Month 3)
- [ ] 1,000 registered users
- [ ] 300 active users (weekly)
- [ ] 100 paying customers
- [ ] 10 plugins
- [ ] 5 themes
- [ ] 8 widgets
- [ ] 5 services
- [ ] $1,500 MRR
- [ ] <8% monthly churn rate
- [ ] 100,000 credits consumed monthly
- [ ] 25% free-to-paid conversion rate

### Organization Goals (Month 3) ⭐
- [ ] 5 organizations onboarded
- [ ] 50 organization seats active
- [ ] 3 departments per org (average)
- [ ] 1 inter-org partner link established
- [ ] $500 MRR from organizations

### Scale Goals (Month 6)
- [ ] 5,000 registered users
- [ ] 1,000 active users (weekly)
- [ ] 500 paying customers
- [ ] 25 plugins (including 3rd party)
- [ ] 10 themes
- [ ] 15 widgets
- [ ] 10 services
- [ ] 5 workspace templates
- [ ] First 3rd-party developer items
- [ ] $10,000 MRR
- [ ] <5% monthly churn rate
- [ ] 500,000 credits consumed monthly
- [ ] $500 credit overage revenue

### Marketplace Creator Goals (Month 6) ⭐
- [ ] 20 registered creators/developers
- [ ] 10 creators with published items
- [ ] $1,000 total creator payouts
- [ ] 3 workspace template creators
- [ ] Average 4.0+ star rating across items

### Organization Goals (Month 6) ⭐
- [ ] 25 organizations
- [ ] 500 organization seats active
- [ ] 10 inter-org partner links
- [ ] 2 enterprise (custom) organizations
- [ ] $5,000 MRR from organizations

### Scale Goals (Month 12) ⭐
- [ ] 20,000 registered users
- [ ] 5,000 active users (weekly)
- [ ] 2,000 paying customers
- [ ] 50+ marketplace items
- [ ] 20 workspace templates
- [ ] 100 organizations
- [ ] 2,000 organization seats
- [ ] $50,000 MRR total
- [ ] $20,000 MRR from organizations
- [ ] $5,000 MRR from templates & marketplace
- [ ] <3% monthly churn rate
- [ ] 2,000,000 credits consumed monthly
- [ ] $3,000 monthly credit overage revenue

### Financial Health Metrics (Month 12) ⭐
- [ ] CAC (Customer Acquisition Cost): <$25 per customer
- [ ] LTV (Lifetime Value): >$300 per customer
- [ ] LTV:CAC ratio: >12:1
- [ ] Payback period: <3 months
- [ ] Gross margin: >80%
- [ ] Net revenue retention: >110%
- [ ] Annual contract value growth: 20% YoY

### Platform Reliability Metrics ⭐
| Metric | Target | Critical Threshold |
|--------|--------|--------------------|
| Uptime | 99.9% | <99.5% triggers incident |
| API Response Time (p95) | <200ms | >500ms triggers alert |
| Error Rate | <0.1% | >1% triggers incident |
| Database Query Time (p95) | <100ms | >500ms triggers review |
| Workspace Start Time | <5s | >15s triggers optimization |
| Webhook Delivery Success | >99% | <95% triggers review |
| Message Processing Time | <2s | >10s triggers alert |

### Security Metrics ⭐
| Metric | Target | Action |
|--------|--------|--------|
| 2FA Adoption Rate | >50% of paid users | Incentivize if below |
| Failed Login Rate | <5% of attempts | Investigate if higher |
| Security Incident Response | <1 hour to acknowledge | On-call escalation |
| Credential Rotation | 100% rotated within 24h of compromise | Automated alert |
| Vulnerability Patch Time | <72 hours for critical | Incident process |
| Suspicious Activity Detection | <5 min detection time | Real-time monitoring |
| Session Anomaly Rate | <0.1% | Review authentication |

### Support & Satisfaction Metrics ⭐
| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| First Response Time | <4 hours | <2 hours | <1 hour |
| Resolution Time | <48 hours | <24 hours | <12 hours |
| Customer Satisfaction (CSAT) | >80% | >85% | >90% |
| Net Promoter Score (NPS) | >20 | >40 | >50 |
| Support Ticket Volume | <50/week | <100/week | <200/week |
| Self-Service Resolution | >30% | >50% | >70% |

### Marketplace Creator Success (Month 12) ⭐
- [ ] 100 registered creators/developers
- [ ] 50 creators with published items
- [ ] $25,000 total creator payouts
- [ ] 15 workspace template creators
- [ ] Average 4.2+ star rating across items
- [ ] <5% item rejection rate
- [ ] Creator retention rate: >80%

---

## ⚡ Performance Architecture & Standards ⭐

### Next.js Performance Optimizations

```typescript
// next.config.js - Production optimizations
const nextConfig = {
  // Enable React Strict Mode for better debugging
  reactStrictMode: true,
  
  // Image optimization
  images: {
    domains: ['cdn.2bot.app', 'avatars.githubusercontent.com'],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 24 hours
  },
  
  // Experimental features for performance
  experimental: {
    // Server Actions (if using)
    serverActions: true,
    // Optimize package imports
    optimizePackageImports: ['lucide-react', '@radix-ui/*'],
  },
  
  // Compression
  compress: true,
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  
  // Redirect www to non-www (or vice versa)
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.2bot.app' }],
        destination: 'https://2bot.app/:path*',
        permanent: true,
      },
    ];
  },
};
```

### Database Performance Standards

```typescript
// Prisma best practices for performance

// 1. ALWAYS use select() to limit fields returned
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    name: true,
    // Don't select passwordHash, large JSON fields unnecessarily
  },
});

// 2. Use include() sparingly - prefer separate queries for large relations
// BAD: Fetches everything
const badQuery = await prisma.user.findUnique({
  where: { id: userId },
  include: { gateways: true, plugins: true, services: true }, // N+1 risk!
});

// GOOD: Paginated, selected
const goodQuery = await prisma.gateway.findMany({
  where: { userId },
  select: { id: true, name: true, type: true, status: true },
  take: 10,
  skip: page * 10,
  orderBy: { createdAt: 'desc' },
});

// 3. Use transactions for multiple related writes
await prisma.$transaction([
  prisma.gateway.create({ data: gatewayData }),
  prisma.auditLog.create({ data: auditData }),
]);

// 4. Index frequently queried fields (already in schema)
// @@index([userId])
// @@index([status, createdAt])
```

### Query Performance Guidelines

| Query Type | Max Time | Action if Exceeded |
|------------|----------|--------------------|
| Simple read | 50ms | Investigate |
| Complex join | 200ms | Add index or cache |
| Aggregation | 500ms | Pre-compute, cache |
| Report/Export | 5s | Background job |

```typescript
// Slow query detection middleware
const SLOW_QUERY_THRESHOLD = 500; // ms

prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  if (duration > SLOW_QUERY_THRESHOLD) {
    logger.warn('Slow query detected', {
      model: params.model,
      action: params.action,
      duration,
      args: sanitizeArgs(params.args), // Remove sensitive data
    });
  }
  
  return result;
});
```

### API Response Time Standards

| Endpoint Type | Target | P95 Max |
|--------------|--------|--------|
| Health checks | 10ms | 50ms |
| Auth endpoints | 100ms | 300ms |
| List endpoints | 150ms | 500ms |
| Detail endpoints | 100ms | 300ms |
| Create/Update | 200ms | 500ms |
| Complex queries | 300ms | 1000ms |
| File uploads | N/A | 30s |

### Caching Strategy Summary

```typescript
// Cache layers (in order of check)
// 1. CDN (static assets, public pages) - hours/days
// 2. Redis (session, computed data) - minutes/hours
// 3. In-memory (hot data) - seconds/minutes
// 4. Database (source of truth) - always

const CACHE_STRATEGY = {
  // Static resources (CDN)
  static: {
    images: '1 year',
    fonts: '1 year',
    js_css: '1 year (hashed filenames)',
  },
  
  // API responses (Redis)
  api: {
    'marketplace/items': '5 min',
    'marketplace/categories': '1 hour',
    'user/profile': '5 min',
    'user/subscription': '10 min',
    'gateway/status': '30 sec',
  },
  
  // Computed data (Redis + Background jobs)
  computed: {
    'analytics/daily': '15 min (background refresh)',
    'dashboard/stats': '1 min (stale-while-revalidate)',
    'org/usage': '5 min',
  },
};
```

### Frontend Performance Standards

```typescript
// Bundle size targets
const BUNDLE_LIMITS = {
  'main.js': '150KB gzipped',
  'page.js (any)': '50KB gzipped',
  'vendor chunk': '200KB gzipped',
  'total first load': '400KB gzipped',
};

// Core Web Vitals targets
const WEB_VITALS_TARGETS = {
  LCP: '< 2.5s',   // Largest Contentful Paint
  FID: '< 100ms',  // First Input Delay
  CLS: '< 0.1',    // Cumulative Layout Shift
  TTFB: '< 600ms', // Time to First Byte
};

// Component lazy loading
import dynamic from 'next/dynamic';

// Heavy components loaded on demand
const WorkflowBuilder = dynamic(
  () => import('@/components/services/workflow-builder'),
  { 
    loading: () => <WorkflowBuilderSkeleton />,
    ssr: false, // Client-side only (uses canvas/drag-drop)
  }
);

const AnalyticsChart = dynamic(
  () => import('@/components/analytics/chart'),
  { loading: () => <ChartSkeleton /> }
);
```

### Connection Pooling Configuration

```typescript
// PostgreSQL connection pooling (PgBouncer recommended)
const DATABASE_POOL = {
  // Development
  development: {
    pool_size: 10,
    connection_limit: 20,
  },
  
  // Production (with PgBouncer)
  production: {
    pool_mode: 'transaction',  // Best for serverless
    pool_size: 20,
    max_client_conn: 1000,
    default_pool_size: 20,
    reserve_pool_size: 5,
  },
};

// Redis connection pooling
const REDIS_POOL = {
  // For BullMQ (needs dedicated connections)
  bullmq: {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
  
  // For caching
  cache: {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  },
};
```

### Background Job Performance

```typescript
// BullMQ job processing configuration
const QUEUE_PERFORMANCE = {
  // Worker concurrency (jobs processed in parallel)
  concurrency: {
    default: 5,
    heavy: 2,          // AI, file processing
    lightweight: 20,   // Notifications, webhooks
  },
  
  // Job timeouts
  timeouts: {
    default: 30000,    // 30 seconds
    workflow: 300000,  // 5 minutes
    export: 600000,    // 10 minutes
  },
  
  // Rate limiting per queue
  rateLimits: {
    email: { max: 100, duration: 60000 },      // 100 emails/min
    telegram: { max: 30, duration: 1000 },     // 30 msg/sec
    ai: { max: 60, duration: 60000 },          // 60 req/min
  },
};
```

### Credit-Based Rate Limiting & Cost Controls ⭐

> **Credits gate ALL variable-cost operations, not just AI**

```typescript
// Credit consumption rate limits (prevent runaway spending)
const CREDIT_RATE_LIMITS = {
  // Per-user limits (credits consumed per time window)
  perUser: {
    perMinute: 100,      // Max 100 credits/min ($1/min max burn)
    perHour: 1000,       // Max 1000 credits/hr ($10/hr max burn)
    perDay: 5000,        // Max 5000 credits/day ($50/day max burn)
  },
  
  // Per-operation limits
  perOperation: {
    aiRequest: 50,       // Max 50 credits per single AI request
    marketplacePurchase: 10000,  // Max $100 single purchase
    storageUpgrade: 500,         // Max 500 credits at once
  },
  
  // Organization multipliers
  orgMultiplier: {
    STARTER: 5,    // 5x individual limits
    BUSINESS: 20,  // 20x individual limits  
    ENTERPRISE: 100, // 100x (essentially unlimited)
  },
};

// Pre-flight credit check for ALL credit operations
async function checkCreditAvailability(userId: string, operation: CreditOperation): Promise<CreditCheckResult> {
  const [balance, rateUsage, pendingHolds] = await Promise.all([
    getCreditBalance(userId),
    getCreditRateUsage(userId),
    getPendingCreditHolds(userId),
  ]);
  
  const availableCredits = balance - pendingHolds;
  const estimatedCost = estimateCreditCost(operation);
  
  // Check balance
  if (availableCredits < estimatedCost) {
    return { allowed: false, reason: 'INSUFFICIENT_CREDITS', available: availableCredits, required: estimatedCost };
  }
  
  // Check rate limits
  if (rateUsage.minute + estimatedCost > CREDIT_RATE_LIMITS.perUser.perMinute) {
    return { allowed: false, reason: 'RATE_LIMIT_MINUTE', retryAfter: 60 };
  }
  
  // Place hold for variable-cost operations (AI, etc.)
  if (operation.type === 'AI_REQUEST') {
    await placeCreditHold(userId, estimatedCost * 1.5); // 50% buffer
  }
  
  return { allowed: true, estimatedCost, holdId: hold?.id };
}
```

### Credit Cost Alerting System ⭐

```typescript
// Automatic alerts when approaching credit limits
const CREDIT_ALERT_THRESHOLDS = {
  // Balance alerts
  balance: [
    { threshold: 500, severity: 'info', message: 'Credits running low' },
    { threshold: 100, severity: 'warning', message: 'Credits critically low' },
    { threshold: 20, severity: 'critical', message: 'Credits almost depleted' },
  ],
  
  // Spending velocity alerts
  velocity: [
    { rate: 100, window: '1h', severity: 'info', message: 'Higher than usual spending' },
    { rate: 500, window: '1h', severity: 'warning', message: 'Unusually high spending' },
    { rate: 1000, window: '1h', severity: 'critical', message: 'Spending spike detected' },
  ],
  
  // Free allowance alerts (monthly)
  freeAllowance: [
    { percent: 80, severity: 'info', message: '80% of free credits used' },
    { percent: 95, severity: 'warning', message: '95% of free credits used' },
    { percent: 100, severity: 'critical', message: 'Free credits exhausted' },
  ],
};

// Alert delivery channels
const ALERT_CHANNELS = {
  info: ['dashboard', 'email_digest'],
  warning: ['dashboard', 'email_immediate', 'telegram_bot'],
  critical: ['dashboard', 'email_immediate', 'telegram_bot', 'sms'],
};

// Spending limits (user-configurable)
interface SpendingLimits {
  dailyMax: number;       // Max credits/day (default: unlimited)
  monthlyMax: number;     // Max credits/month (default: unlimited)
  perOperationMax: number; // Max per single operation (default: 1000)
  autoRechargeEnabled: boolean;
  autoRechargeThreshold: number;  // Recharge when balance falls below
  autoRechargeAmount: number;     // Amount to recharge
}
```
};
```

### Memory Management

```typescript
// Memory limits and monitoring
const MEMORY_MANAGEMENT = {
  // Platform API (Next.js)
  platform: {
    maxHeapSize: '2GB',
    warningThreshold: 0.7,   // 70% - start monitoring
    criticalThreshold: 0.85, // 85% - alert
    restartThreshold: 0.95,  // 95% - auto-restart
  },
  
  // Workspace containers (per user plan)
  workspace: {
    FREE: { limit: '512MB', oom_kill: true },
    STARTER: { limit: '1GB', oom_kill: true },
    PRO: { limit: '2GB', oom_kill: true },
    BUSINESS: { limit: '4GB', oom_kill: true },
    ENTERPRISE: { limit: '8GB', oom_kill: false }, // Alert instead
  },
  
  // Per-process limits inside workspace (PM2)
  processes: {
    plugin: '64MB',
    gateway: '128MB',
    service: '256MB',
  },
};
```

### Database Security & Encryption ⭐

```typescript
// Database encryption configuration
const DATABASE_SECURITY = {
  // Encryption at rest (PostgreSQL TDE)
  encryptionAtRest: {
    enabled: true,
    algorithm: 'AES-256',
    keyManagement: 'AWS_KMS', // or 'VAULT', 'GCP_KMS'
    keyRotation: '90 days',
  },
  
  // Encryption in transit
  encryptionInTransit: {
    ssl: 'required',
    tlsVersion: '1.3',
    certificateValidation: true,
  },
  
  // Column-level encryption (sensitive fields)
  columnEncryption: {
    // Already using AES-256-GCM for credentials
    encryptedFields: [
      'Gateway.credentials',
      'User.twoFactorSecret',
      'ApiKey.hashedKey',
      'Session.deviceFingerprint',
    ],
  },
  
  // Backup encryption
  backupEncryption: {
    enabled: true,
    algorithm: 'AES-256-GCM',
    keyStorage: 'separate_from_data', // Different key than TDE
  },
};

// Database audit logging
const DATABASE_AUDIT = {
  loggedOperations: ['SELECT_SENSITIVE', 'INSERT', 'UPDATE', 'DELETE', 'DDL'],
  sensitiveTablesList: ['User', 'Gateway', 'Session', 'AuditLog', 'Payment'],
  retentionDays: 90,
  alertOn: ['BULK_DELETE', 'SCHEMA_CHANGE', 'PERMISSION_CHANGE'],
};
```

### CDN & Asset Security ⭐

```typescript
// CDN security configuration
const CDN_SECURITY = {
  // Subresource Integrity (SRI) for external scripts
  sri: {
    enabled: true,
    algorithm: 'sha384',
    // Auto-generated during build
  },
  
  // Content Security Policy for CDN assets
  csp: {
    'script-src': ["'self'", 'cdn.2bot.app'],
    'style-src': ["'self'", "'unsafe-inline'", 'cdn.2bot.app'],
    'img-src': ["'self'", 'cdn.2bot.app', 'data:', 'blob:'],
    'font-src': ["'self'", 'cdn.2bot.app'],
    'connect-src': ["'self'", 'api.2bot.app', 'wss://2bot.app'],
  },
  
  // Signed URLs for private assets
  signedUrls: {
    enabled: true,
    expiry: '1 hour',
    scope: ['user-uploads', 'workspace-exports', 'audit-logs'],
  },
  
  // DDoS protection
  ddosProtection: {
    provider: 'cloudflare', // or 'aws_shield'
    rateLimit: '10000 req/min per IP',
    botProtection: true,
    geoBlocking: false, // Enable if needed
  },
};

---

## 📝 Notes

### Development Principles
- All code is 100% AI-generated (GitHub Copilot / Claude)
- Zero human code changes policy
- Focus on production-ready, scalable architecture
- Security-first approach (encrypted credentials, sandboxed plugins)
- Mobile-responsive design from day 1
- Theme system ready for future marketplace expansion
- Service/Workflow engine enables complex multi-gateway automations

### Security Highlights
- 🔐 AES-256-GCM encryption for all gateway credentials
- 🔒 Plugin sandboxing with isolated-vm (memory + CPU limits)
- 🛡️ RBAC (Role-Based Access Control) ready for teams
- 🔑 API key system with scopes and rotation
- 📋 Audit logging for compliance
- ⚠️ Workflow safeguards (timeouts, limits, dead-letter queue)
- 📧 Webhook signature verification
- 🚫 Rate limiting per user and per endpoint
- 🔐 **2FA Support** (TOTP + backup codes, required for org admins)
- 🗄️ **Database Encryption** (TDE at rest, TLS 1.3 in transit)
- 📦 **Workspace Template Validation** (admin review, malware scan, CSP enforcement)
- 💳 **Credit System Safeguards** (rate limits, spending alerts, hold system)

### System-Wide Safeguards ⭐
> **Defense in Depth:** Multiple layers of protection at every level

**API Layer:**
| Safeguard | Default | Purpose |
|-----------|---------|---------|
| Request size limit | 1MB | Prevent memory exhaustion |
| Request timeout | 30s | Free up resources |
| Slow request logging | >3s | Identify bottlenecks |
| Rate limiting (user) | 100/min | Prevent abuse |
| Rate limiting (IP) | 1000/min | DDoS protection |

**Database Layer:**
| Safeguard | Default | Purpose |
|-----------|---------|---------|
| Query timeout | 10s | Prevent long-running queries |
| Connection pool | 20 | Prevent connection exhaustion |
| Transaction timeout | 30s | Prevent deadlocks |
| Row limits per user | Varies | Prevent DB bloat |

**External APIs:**
| Safeguard | Default | Purpose |
|-----------|---------|---------|
| Timeout (default) | 30s | Don't wait forever |
| Timeout (AI) | 60s | AI models are slow |
| Max retries | 3 | Don't hammer failing services |
| Circuit breaker | 5 failures | Prevent cascading failures |

**Graceful Degradation:**
| Scenario | Fallback |
|----------|----------|
| Redis down | DB fallback for sessions |
| AI gateway down | Queue for retry |
| Stripe down | 24h grace period |
| High load | Disable non-critical features |

**Deployment:**
| Safeguard | Purpose |
|-----------|---------|
| Feature flags | Safe rollouts, kill switches |
| Auto-rollback | Revert on error spike |
| Canary deploys | Test with small % of traffic |
| Smoke tests | Verify critical paths |

### Workspace Isolation Benefits
- 🐳 Each user gets isolated Docker container
- 📊 Hard resource limits (RAM, CPU, Storage) per plan
- 💰 Fair billing based on resource allocation
- 🛡️ One user's heavy usage can't crash others
- 📈 Easy scaling - just adjust container limits
- 🔄 Container auto-restart on failure
- 🎯 Real-time resource monitoring
- ⚡ **Zero-downtime upgrades for ALL tiers** (hot swap)

### Intra-Workspace Fault Tolerance
- 🔧 PM2 Process Manager inside each container
- 🧩 Each plugin runs as isolated process (crash isolation)
- 🔌 Each gateway runs as isolated process
- 💥 Plugin crash → only that plugin restarts (others unaffected)
- 🔄 Circuit breaker prevents cascading failures
- ⚡ Per-process memory limits with auto-restart
- 📊 Per-user Redis/Queue limits prevent resource flooding

### Performance Optimizations
- 📦 Redis caching layer with defined TTLs
- 🔄 PgBouncer for connection pooling
- 📈 Execution history with retention policies
- ⚖️ Horizontal scaling via Docker/K8s
- 📊 BullMQ dashboard for queue monitoring
- 🐳 Workspace containers scale independently

### Cost Optimization Strategies ⭐
- 💤 **Lazy Container Start** - Don't provision until user needs it
- 😴 **Container Sleep/Hibernate** - Auto-sleep idle containers (saves 60-80% compute)
- 🎯 **Right-sizing** - Match resources to actual usage, not allocation
- 💰 **Spot Instances** - Use preemptible compute for free tier (80% cheaper)
- 📊 **Cost Dashboard** - Track spend per user, detect anomalies
- ⚠️ **Resource Alerts** - Warn before hitting limits, prevent surprises

### Monitoring & Observability ⭐
**For Individual Users:**
- 📊 Gateway uptime history & health scores
- ⚡ Plugin performance metrics (speed, errors, resource usage)
- 🔄 Service success rates & execution breakdowns
- 📈 Activity timeline (events, executions, system events)
- 🔮 Usage predictions ("At this rate, you'll hit limit in X days")

**For Organization Owners:**
- 🏢 Department comparison dashboards
- 👥 Per-member usage tracking & activity logs
- 🎫 License utilization metrics (ROI per dollar)
- 💯 Organization health score (adoption, engagement)
- 💰 Cost breakdown by department

**For Platform Admins:**
- 🌐 Fleet-wide user analytics (DAU, WAU, MAU)
- 💵 Revenue dashboard (MRR, ARR, ARPU)
- 📈 User acquisition funnel & cohort analysis
- ⚠️ Churn risk indicators
- 🖥️ System capacity planning & SLA monitoring
- 💳 **Credit System Analytics** (total consumption, revenue from credits, top spenders)
- 📊 **Credit Health Dashboard** (low balance users, spending velocity, overage trends)
- 🎯 **Marketplace Credit Flow** (creator payouts, purchase volume, refund rate)

### Monitoring Performance Safeguards ⭐
> **⚠️ CRITICAL:** Monitoring must NOT hurt server performance!
>
> | Safeguard | How It Protects Performance |
> |-----------|----------------------------|
> | **Async Aggregation** | Background jobs compute stats, not API requests |
> | **Pre-computed Cache** | Dashboards read from Redis, not DB |
> | **Time-Series DB** | InfluxDB handles high-volume metrics, not PostgreSQL |
> | **Event Sampling** | 10% sampling for high-volume events (gateway messages) |
> | **Rate Limiting** | Max 10 monitoring API calls/minute per user |
> | **Background Workers** | Metric processing on separate worker, not API process |
> | **Lazy Dashboard Loading** | Critical metrics first, secondary async |
>
> **Result:** Monitoring adds <1% CPU overhead with these safeguards.

### Organization Benefits (Enterprise) ⭐
- 🏢 **Departments** - Organize users by function (HR, Driver, Fleet, etc.)
- 🎫 **Buy Once, Share Many** - One license shared across all org members
- 💰 **Cost Savings** - ~60-80% cheaper than individual subscriptions
- 📊 **Centralized Dashboard** - Cross-department analytics and monitoring
- 🔐 **Permission Control** - Fine-grained access per department/role
- 📄 **Single Invoice** - One bill for entire organization
- 🗄️ **Shared Database** - Cross-department data access (HR sees Driver KPIs)
- 🔗 **Partner Links** - Approved inter-organization service communication

### Race Condition & Concurrency Safeguards ⭐
- 🔒 **Distributed Locking** - Redis SETNX for workspace startup (prevents duplicate containers)
- ⚡ **Thundering Herd Prevention** - Staggered wake with random jitter on platform restart
- 🎯 **Idempotency Keys** - Prevent duplicate API calls on service step retry
- 📦 **Token Pre-reservation** - Atomic decrement before AI calls (prevents exceeding limits)
- 🔄 **Optimistic Locking** - Version field for concurrent database updates

### Stability & Memory Safeguards ⭐
- 🧠 **Gateway Memory Monitoring** - Auto-restart workers exceeding 80% memory limit
- 🔄 **Periodic Connection Refresh** - 24h refresh cycle for long-running gateway connections
- 🧹 **Event Listener Cleanup** - Automatic cleanup on disconnect to prevent leaks
- ⏰ **Graceful Shutdown** - SIGTERM handling with 30s draining period
- 📡 **WebSocket Limits** - Max connections per user, message rate limiting, idle cleanup

### Legal Considerations
- ⚠️ **TELEGRAM_USER gateway** uses MTProto which may violate Telegram ToS
- Users must acknowledge risks before enabling
- Consider Enterprise-tier only restriction
- Implement aggressive rate limiting to prevent bans

---

## 🔮 Future Considerations

### Additional Gateways (Post-Launch)
- DISCORD_BOT - Discord Bot
- SLACK_BOT - Slack Bot
- WHATSAPP_BUSINESS - WhatsApp Business API
- TWITTER - Twitter/X API
- EMAIL - Email services (SMTP, SendGrid)
- SMS - SMS services (Twilio)
- WEBHOOK - Custom HTTP endpoints

### Advanced Features
- Visual workflow builder improvements
- AI-assisted service creation
- Plugin/Service templates
- Team collaboration (shared workspaces)
- Audit logs dashboard
- Advanced analytics dashboard

### Workspace Evolution
- Kubernetes migration for auto-scaling
- Multi-region workspace deployment
- Workspace snapshots/backups
- Shared team workspaces
- Workspace cloning (copy full config)

### AI Gateway Expansion ⭐
- **Claude API** - Direct Anthropic integration
- **Local LLMs** - Ollama, LM Studio support (0 credits)
- **Mistral AI** - European AI option
- **Cohere** - Enterprise embeddings
- **AI Router** - Auto-select cheapest model for task
- **Fine-tuned Models** - Custom model hosting

### Compliance & Certifications ⭐
- **SOC 2 Type II** - Security compliance certification
- **GDPR Tools** - Data export, deletion, consent management
- **HIPAA Ready** - Healthcare compliance (Enterprise)
- **ISO 27001** - Information security management
- **Data Residency** - EU, US, Asia region options

### Organization Evolution ⭐
- Multi-organization management (holding companies)
- Organization templates (industry-specific setups)
- Franchise/dealer network support
- Supply chain integration tools
- Industry-specific compliance packages

### Developer Platform
- SDK for plugin development
- Theme builder tool
- Widget development kit
- Service template marketplace
- Developer documentation portal

---

*Last Updated: January 12, 2026*
*Version: 9.16.0 - Performance/Notes/Future: Added Credit-Based Rate Limiting (per-user spending caps: 100/min, 1000/hr, 5000/day), Credit Cost Alerting System (balance, velocity, free allowance alerts), User-configurable spending limits with auto-recharge, Database Encryption at Rest (AES-256 TDE, key rotation), CDN Security (SRI, signed URLs, DDoS protection), Updated Security Highlights (+2FA, +DB encryption, +template validation, +credit safeguards), Platform Admin Credit Analytics (consumption, health dashboard, marketplace flow), AI Gateway Expansion roadmap (Claude, Local LLMs, Mistral, AI Router), Compliance Roadmap (SOC2, GDPR, HIPAA, ISO 27001)*
