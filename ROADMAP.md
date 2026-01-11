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

---

## 🛠️ Tech Stack

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
| Stripe | Payments | Subscriptions, marketplace payments |
| Telegram Bot API | Gateway | Official bot platform |
| GramJS/MTProto | Gateway | Telegram user account automation |
| AI APIs | Gateway | AI-powered features (OpenAI, Gemini, Claude, etc.) |

### DevOps
| Technology | Purpose | Why |
|------------|---------|-----|
| Docker | Containers | Consistent environments |
| Docker Compose | Local dev | Multi-service setup |
| GitHub Actions | CI/CD | Automated testing/deployment |

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
# ENCRYPTION (for gateway credentials)
# ===========================================
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# ===========================================
# STRIPE (Billing)
# ===========================================
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_YEARLY=price_...

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
    'UserWidget',     // Preserve history
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
  // Per-user row limits
  maxExecutionLogsPerUser: 10000,  // Keep last 10K logs
  maxPluginConfigsPerUser: 100,    // Max 100 plugin configs
  maxGatewaysPerUser: 20,          // Max 20 gateways
  maxServicesPerUser: 50,          // Max 50 services
  maxWidgetsPerUser: 30,           // Max 30 widgets
  
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
├── 📁 docs/                             # ⭐ NEW: Documentation
│   ├── 📄 ARCHITECTURE.md               # Detailed architecture docs
│   ├── 📄 API.md                        # API documentation
│   ├── 📄 DEVELOPMENT.md                # Development setup guide
│   ├── 📄 DEPLOYMENT.md                 # Deployment procedures
│   ├── 📄 TESTING.md                    # Testing guidelines
│   ├── 📄 SECURITY.md                   # Security policies
│   └── 📁 adr/                          # Architecture Decision Records
│       ├── 📄 001-modular-monolith.md
│       ├── 📄 002-workspace-isolation.md
│       └── 📄 003-queue-system.md
│
├── 📁 scripts/                          # ⭐ NEW: Utility scripts
│   ├── 📄 setup.sh                      # Initial setup script
│   ├── 📄 seed-dev.ts                   # Development data seeding
│   ├── 📄 seed-test.ts                  # Test data seeding
│   ├── 📄 migrate-prod.sh               # Production migration script
│   ├── 📄 backup-db.sh                  # Database backup
│   ├── 📄 generate-api-docs.ts          # OpenAPI spec generation
│   └── 📄 health-check.ts               # Health check script
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
│   │   └── 📁 api/                      # API Routes
│   │       ├── 📁 auth/
│   │       ├── 📁 gateways/
│   │       ├── 📁 marketplace/
│   │       ├── 📁 plugins/
│   │       ├── 📁 themes/
│   │       ├── 📁 widgets/
│   │       ├── 📁 services/
│   │       ├── 📁 billing/
│   │       ├── 📁 workspace/            # ⭐ Workspace management API
│   │       └── 📁 webhooks/
│   │
│   ├── 📁 modules/                      # Backend Modules (Modular Monolith)
│   │   ├── 📁 auth/
│   │   ├── 📁 users/
│   │   ├── 📁 workspace/                # ⭐ Workspace orchestration
│   │   │   ├── 📄 workspace.service.ts  # Container lifecycle management
│   │   │   ├── 📄 workspace.orchestrator.ts  # Job routing to workspaces
│   │   │   ├── 📄 resource-monitor.ts   # Resource usage tracking
│   │   │   └── 📄 container-manager.ts  # Docker/K8s integration
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
│   │   └── 📄 feature-flags.config.ts   # Feature flags definitions
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
│   │   │   └── 📄 sidebar.tsx
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
│   │   └── 📁 widgets/                  # Widget components
│   │       └── 📄 widget-renderer.tsx   # ⭐ Dynamic widget loading
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
  - [ ] Development fixtures for testing
- [ ] **Local Development Documentation** ⭐
  - [ ] README.md with step-by-step local setup guide
  - [ ] Makefile or npm scripts for common tasks
  - [ ] Environment variable validation on startup
  - [ ] Docker Compose override for local development
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
- [ ] Widget System
  - [ ] Widget definition schema
  - [ ] Widget sizes (sm, md, lg, xl)
  - [ ] Widget data sources
  - [ ] Widget refresh intervals
  - [ ] Dynamic widget rendering
  - [ ] Dashboard grid layout
  - [ ] Built-in widgets
    - [ ] Stats Card widget
    - [ ] Activity Chart widget
    - [ ] Gateway Status widget

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
- [ ] **Queue Backpressure Handling** ⭐
  - [ ] Queue depth monitoring and alerts
  - [ ] Rate limiting job submission per user
  - [ ] Priority queue starvation prevention
  - [ ] Graceful degradation (reject new jobs at threshold)
  - [ ] Backpressure metrics dashboard
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

### Phase 9: Security & Performance ⏱️ Days 33-36
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
  - [ ] CAPTCHA for suspicious requests
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
  
  // Organization relations
  organization        Organization?       @relation(fields: [organizationId], references: [id])
  department          Department?         @relation(fields: [departmentId], references: [id])
  ownedOrganizations  Organization[]      @relation("OrganizationOwner")
  orgInvitesSent      OrganizationInvite[] @relation("InviteSender")
  orgInvitesReceived  OrganizationInvite[] @relation("InviteRecipient")
  
  @@index([organizationId])
  @@index([departmentId])
}

enum UserRole {
  OWNER       // Full access (future: team owner)
  ADMIN       // Admin access (future: team admin)
  MEMBER      // Standard user
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
  
  // Relations
  owner           User              @relation("OrganizationOwner", fields: [ownerId], references: [id])
  members         User[]
  departments     Department[]
  orgWorkspace    OrganizationWorkspace?
  licenses        OrganizationLicense[]
  invites         OrganizationInvite[]
  auditLogs       AuditLog[]
  partnerLinksFrom OrgPartnerLink[] @relation("OrgLinkFrom")
  partnerLinksTo   OrgPartnerLink[] @relation("OrgLinkTo")
  
  @@index([ownerId])
  @@index([slug])
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
  
  @@unique([organizationId, name])
  @@index([organizationId])
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
  
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
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
  price           Decimal          @default(0) @db.Decimal(10, 2)
  priceType       PriceType        @default(FREE)
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
  reviews         ItemReview[]
  userPlugins     UserPlugin[]
  userThemes      UserTheme[]
  userWidgets     UserWidget[]
  userServices    UserService[]
  purchases       Purchase[]      // ⭐ One-time purchase records
  
  @@index([type])
  @@index([category])
  @@index([minPlanRequired])      // ⭐ For filtering by plan
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
  createdAt DateTime        @default(now())
  
  item      MarketplaceItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  @@unique([itemId, userId])
  @@index([itemId])
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
  
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  item        MarketplaceItem @relation(fields: [itemId], references: [id])
  
  @@index([userId])
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
  
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  item        MarketplaceItem? @relation(fields: [itemId], references: [id])
  executions  ServiceExecution[]
  stepGateways ServiceStepGateway[]
  
  @@index([userId])
  @@index([status])
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
  
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  usageRecords      UsageRecord[]
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

Webhooks:
POST   /api/webhooks/telegram/:gatewayId
POST   /api/webhooks/stripe
POST   /api/webhooks/service/:serviceId    # Service webhook trigger

Organizations: ⭐
GET    /api/org                            # Get user's organization
POST   /api/org                            # Create organization
PATCH  /api/org                            # Update org settings
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
```

---

## 🔗 Gateway System

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
  
  // Events
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  
  // Methods (type-specific)
  execute(method: string, params: any): Promise<any>;
}

// Gateway-specific APIs
interface TelegramBotGateway extends Gateway {
  sendMessage(chatId: string, text: string, options?: MessageOptions): Promise<Message>;
  sendPhoto(chatId: string, photo: InputFile, options?: PhotoOptions): Promise<Message>;
  getChat(chatId: string): Promise<Chat>;
  getChatMembers(chatId: string): Promise<ChatMember[]>;
  answerCallback(callbackId: string, options?: AnswerOptions): Promise<void>;
  setWebhook(url: string): Promise<void>;
}

interface TelegramUserGateway extends Gateway {
  // Uses MTProto protocol under the hood
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
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  complete(prompt: string, options?: CompleteOptions): Promise<string>;
  embed(text: string | string[]): Promise<number[][]>;
  moderate(text: string): Promise<ModerationResult>;
  getProvider(): AIProvider;
  getModel(): string;
}
```

---

## 🧩 Marketplace Items

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
  config: Record<string, any>;
  
  // Gateway access
  gateways: {
    get(type: GatewayType): GatewayAPI | null;
    telegramBot?: TelegramBotGateway;   // TELEGRAM_BOT
    telegramUser?: TelegramUserGateway; // TELEGRAM_USER
    ai?: AIGateway;                      // AI (any provider)
  };
  
  // Storage
  storage: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
  
  // Logging
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
  
  // Optional custom CSS
  customCSS?: string;
}

// Theme Provider applies CSS variables
function applyTheme(theme: ThemeDefinition) {
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${kebabCase(key)}`, value);
  });
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
| AI Tokens/month | 10K | 50K | 100K | 500K | 1M+ |
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
2. **White-label** - Enterprise customers rebrand the platform
3. **API Access** - Developers pay for API access
4. **Custom Development** - Enterprise custom plugin/service development
5. **Featured Listings** - Pay to feature items in marketplace

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

### Growth Goals (Month 3)
- [ ] 1,000 registered users
- [ ] 300 active users (weekly)
- [ ] 100 paying customers
- [ ] 10 plugins
- [ ] 5 themes
- [ ] 8 widgets
- [ ] 5 services
- [ ] $1,500 MRR

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
- [ ] First 3rd-party developer items
- [ ] $10,000 MRR

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
- [ ] 100 organizations
- [ ] 2,000 organization seats
- [ ] $50,000 MRR total
- [ ] $20,000 MRR from organizations

---

## 🚦 Current Status

**Phase:** 0 - Project Setup
**Status:** In Progress
**Next Action:** Initialize Next.js project
**Estimated Launch:** ~60 days from start (includes Organization & Production phases)

### Phase Summary

| Phase | Name | Days | Status |
|-------|------|------|--------|
| -1 | **Prerequisites** ⭐ | Before Day 1 | ⚪ Not Started |
| 0 | Project Setup | 1-2 | 🟡 In Progress |
| 1 | Authentication & Core UI | 3-5 | ⚪ Not Started |
| 2 | Gateway System | 6-9 | ⚪ Not Started |
| 3 | Plugin System | 10-13 | ⚪ Not Started |
| 4 | Theme & Widget System | 14-16 | ⚪ Not Started |
| 5 | Service (Workflow) System | 17-21 | ⚪ Not Started |
| 6 | Marketplace | 22-24 | ⚪ Not Started |
| 7 | **Workspace Isolation** | 25-28 | ⚪ Not Started |
| 8a | **Core Billing Infrastructure** ⭐ | 29-30 | ⚪ Not Started |
| 8b | **Individual Plans** ⭐ | 31-32 | ⚪ Not Started |
| 9 | Security & Performance | 33-36 | ⚪ Not Started |
| 10 | Polish & Launch Prep | 37-40 | ⚪ Not Started |
| 11 | **Organization System** ⭐ | 41-48 | ⚪ Not Started |
| 12 | **Inter-Org Features** ⭐ | 49-52 | ⚪ Not Started |
| 13 | **Production Infrastructure** ⭐ | 53-60 | ⚪ Not Started |

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
- Workspace templates for quick start
- Shared team workspaces

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

*Last Updated: January 11, 2026*
*Version: 6.5.0 - Added Auth Config, Soft Delete Strategy, Purchase Model, Database & Sandbox Decisions*
