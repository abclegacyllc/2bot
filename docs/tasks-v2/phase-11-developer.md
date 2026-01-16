# Phase 11: Developer Dashboard (V2)

> **Goal:** Build developer verification system and portal for publishing to marketplace
> **Estimated Sessions:** 12-15
> **Prerequisites:** Phase 10 complete

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Developer Models** ||||
| 11.1.1 | Create Developer model | ⬜ | Verified publisher |
| 11.1.2 | Create DeveloperVerification model | ⬜ | Verification requests |
| 11.1.3 | Create developer types + validation | ⬜ | |
| **Developer Service** ||||
| 11.2.1 | Create developer service | ⬜ | Apply, verify |
| 11.2.2 | Create developer API endpoints | ⬜ | |
| 11.2.3 | Integrate Stripe Connect | ⬜ | For payouts |
| **Developer Portal UI** ||||
| 11.3.1 | Create developer application page | ⬜ | Apply to become developer |
| 11.3.2 | Create developer dashboard | ⬜ | Stats, earnings |
| 11.3.3 | Create plugin management page | ⬜ | CRUD for dev's plugins |
| 11.3.4 | Create plugin submission flow | ⬜ | Submit for review |
| 11.3.5 | Create earnings/payout page | ⬜ | Revenue tracking |
| **Admin Review** ||||
| 11.4.1 | Create developer review queue | ⬜ | Admin: approve/reject |
| 11.4.2 | Create plugin review queue | ⬜ | Admin: review submissions |
| 11.4.3 | Create verification document viewer | ⬜ | View uploaded docs |
| **Plugin Publishing** ||||
| 11.5.1 | Update Plugin model for marketplace | ⬜ | authorId, pricing, etc |
| 11.5.2 | Create plugin version system | ⬜ | Multiple versions |
| 11.5.3 | Create plugin review workflow | ⬜ | Draft → Review → Published |

---

## 👨‍💻 Developer System Architecture

### Developer Types

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPER TYPES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INDIVIDUAL                        COMPANY                       │
│  ────────────                      ────────                      │
│  • Personal developer              • Business entity             │
│  • Government ID verification      • Business license/EIN        │
│  • Lower payout limits             • Higher payout limits        │
│  • Simpler approval                • More documentation          │
│                                                                  │
│  Verification:                     Verification:                 │
│  • Stripe Identity (passport/ID)   • EIN/Tax ID                  │
│  • Phone verification              • Business registration       │
│  • Email verification              • Domain ownership            │
│                                    • Authorized representative   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFICATION FLOW                             │
│                                                                  │
│  1. USER APPLIES                                                │
│     └── Fills form: type, name, contact info                    │
│                                                                  │
│  2. BASIC CHECKS (Automatic)                                    │
│     ├── Email verified ✓                                        │
│     ├── Account age > 7 days ✓                                  │
│     └── No violations ✓                                         │
│                                                                  │
│  3. IDENTITY VERIFICATION                                       │
│     ├── Individual: Stripe Identity (ID upload)                 │
│     └── Company: Document upload + manual review                │
│                                                                  │
│  4. ADMIN REVIEW                                                │
│     ├── Review documents                                        │
│     ├── Verify information                                      │
│     └── Approve / Request more info / Reject                    │
│                                                                  │
│  5. STRIPE CONNECT SETUP                                        │
│     └── Developer completes Stripe onboarding for payouts       │
│                                                                  │
│  6. APPROVED ✓                                                  │
│     └── Can publish to marketplace                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Payout Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAYOUT ARCHITECTURE                           │
│                                                                  │
│  User purchases plugin ($10)                                    │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │   Stripe     │                                               │
│  │  Checkout    │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Platform receives $10                                    │  │
│  │                                                           │  │
│  │  Split:                                                   │  │
│  │  • Platform fee (30%): $3.00                              │  │
│  │  • Developer share (70%): $7.00                           │  │
│  │  • Stripe fees (~3%): $0.30                               │  │
│  │                                                           │  │
│  │  Developer receives: $6.70                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │   Stripe     │ → Developer's bank account                   │
│  │   Connect    │   (automatic payout)                         │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Detailed Tasks

---

### Task 11.1.1: Create Developer Model

**Session Type:** Database
**Estimated Time:** 30 minutes
**Prerequisites:** Phase 10 complete

#### Schema:
```prisma
// Developer type
enum DeveloperType {
  INDIVIDUAL
  COMPANY
}

// Developer verification status
enum DeveloperStatus {
  PENDING           // Application submitted
  DOCUMENTS_REQUIRED // Need more documents
  UNDER_REVIEW      // Admin reviewing
  APPROVED          // Verified, can publish
  SUSPENDED         // Temporarily disabled
  REJECTED          // Application denied
}

// Verified developer/publisher account
model Developer {
  id                String          @id @default(cuid())
  userId            String          @unique @map("user_id")
  
  // Identity
  type              DeveloperType
  displayName       String          @map("display_name")
  slug              String          @unique  // URL-friendly: "acme-inc"
  
  // Contact
  email             String          // Business/support email
  website           String?
  
  // Company details (if type = COMPANY)
  companyName       String?         @map("company_name")
  companyCountry    String?         @map("company_country")
  companyAddress    String?         @map("company_address")
  taxId             String?         @map("tax_id")  // EIN/VAT (encrypted)
  
  // Profile (public)
  bio               String?         @db.Text
  avatarUrl         String?         @map("avatar_url")
  bannerUrl         String?         @map("banner_url")
  socialLinks       Json?           @map("social_links")  // { twitter, github, etc }
  
  // Verification
  status            DeveloperStatus @default(PENDING)
  verifiedAt        DateTime?       @map("verified_at")
  verificationNotes String?         @map("verification_notes")  // Admin notes
  
  // Payout (Stripe Connect)
  stripeAccountId   String?         @unique @map("stripe_account_id")
  stripeOnboarded   Boolean         @default(false) @map("stripe_onboarded")
  payoutEnabled     Boolean         @default(false) @map("payout_enabled")
  
  // Stats (denormalized for performance)
  totalPlugins      Int             @default(0) @map("total_plugins")
  totalDownloads    Int             @default(0) @map("total_downloads")
  totalEarnings     Decimal         @default(0) @db.Decimal(12, 2) @map("total_earnings")
  rating            Decimal?        @db.Decimal(2, 1)  // 4.5 average
  
  // Timestamps
  appliedAt         DateTime        @default(now()) @map("applied_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")
  
  // Relations
  user              User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  verifications     DeveloperVerification[]
  plugins           Plugin[]
  themes            ThemeDefinition[]
  widgets           WidgetDefinition[]
  
  @@index([status])
  @@index([type])
  @@index([slug])
  @@map("developers")
}
```

#### Done Criteria:
- [ ] Developer model created
- [ ] Both individual and company support
- [ ] Stripe Connect fields
- [ ] Migration applied

---

### Task 11.1.2: Create DeveloperVerification Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 11.1.1 complete

#### Schema:
```prisma
// Document types for verification
enum VerificationDocType {
  GOVERNMENT_ID       // Passport, driver's license
  BUSINESS_LICENSE    // Business registration
  TAX_DOCUMENT        // EIN letter, tax certificate
  DOMAIN_PROOF        // Domain ownership proof
  OTHER               // Other supporting documents
}

// Verification request/document
model DeveloperVerification {
  id              String              @id @default(cuid())
  developerId     String              @map("developer_id")
  
  // Document info
  docType         VerificationDocType @map("doc_type")
  docName         String              @map("doc_name")  // Original filename
  docUrl          String              @map("doc_url")   // Secure storage URL
  
  // Stripe Identity (for individuals)
  stripeIdentityId String?            @map("stripe_identity_id")
  
  // Review
  status          String              @default("pending")  // pending, approved, rejected
  reviewedBy      String?             @map("reviewed_by")  // Admin user ID
  reviewedAt      DateTime?           @map("reviewed_at")
  reviewNotes     String?             @map("review_notes")
  
  // Timestamps
  submittedAt     DateTime            @default(now()) @map("submitted_at")
  expiresAt       DateTime?           @map("expires_at")  // For ID documents
  
  // Relations
  developer       Developer           @relation(fields: [developerId], references: [id], onDelete: Cascade)
  
  @@index([developerId])
  @@index([status])
  @@map("developer_verifications")
}
```

#### Done Criteria:
- [ ] Verification model created
- [ ] Document types defined
- [ ] Review tracking
- [ ] Migration applied

---

### Task 11.1.3: Create Developer Types + Validation

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 11.1.2 complete

#### Deliverables:
- [ ] src/modules/developer/developer.types.ts
- [ ] src/modules/developer/developer.validation.ts

#### Types:
```typescript
// src/modules/developer/developer.types.ts

import type { Developer, DeveloperType, DeveloperStatus } from "@prisma/client";

export type { Developer } from "@prisma/client";

// Public developer profile
export interface DeveloperProfile {
  id: string;
  slug: string;
  displayName: string;
  type: DeveloperType;
  bio?: string;
  avatarUrl?: string;
  website?: string;
  socialLinks?: SocialLinks;
  isVerified: boolean;
  stats: {
    plugins: number;
    downloads: number;
    rating?: number;
  };
}

export interface SocialLinks {
  twitter?: string;
  github?: string;
  linkedin?: string;
  website?: string;
}

// Application request
export interface DeveloperApplicationRequest {
  type: DeveloperType;
  displayName: string;
  slug: string;
  email: string;
  bio?: string;
  website?: string;
  
  // Company fields (required if type = COMPANY)
  companyName?: string;
  companyCountry?: string;
  companyAddress?: string;
}

// Dashboard stats for developer
export interface DeveloperDashboardStats {
  totalPlugins: number;
  activePlugins: number;
  pendingReview: number;
  totalDownloads: number;
  downloadsThisMonth: number;
  totalEarnings: number;
  earningsThisMonth: number;
  pendingPayout: number;
  rating: number | null;
  reviewCount: number;
}

// Earnings breakdown
export interface EarningsBreakdown {
  period: string;  // "2026-01"
  gross: number;
  platformFee: number;
  stripeFee: number;
  net: number;
  payoutStatus: 'pending' | 'paid' | 'failed';
}
```

#### Validation:
```typescript
// src/modules/developer/developer.validation.ts

import { z } from "zod";

export const developerSlugSchema = z.string()
  .min(3, "Slug must be at least 3 characters")
  .max(30, "Slug must be less than 30 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");

export const developerApplicationSchema = z.object({
  type: z.enum(["INDIVIDUAL", "COMPANY"]),
  displayName: z.string().min(2).max(100),
  slug: developerSlugSchema,
  email: z.string().email(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional(),
  
  // Company fields
  companyName: z.string().min(2).max(200).optional(),
  companyCountry: z.string().length(2).optional(),  // ISO country code
  companyAddress: z.string().max(500).optional(),
}).refine(data => {
  // If company, require company fields
  if (data.type === "COMPANY") {
    return !!data.companyName && !!data.companyCountry;
  }
  return true;
}, {
  message: "Company name and country are required for company developers",
  path: ["companyName"]
});

export const updateDeveloperProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional().nullable(),
  socialLinks: z.object({
    twitter: z.string().optional(),
    github: z.string().optional(),
    linkedin: z.string().optional(),
  }).optional(),
});
```

#### Done Criteria:
- [ ] Types defined
- [ ] Validation schemas
- [ ] Company-specific validation

---

### Task 11.2.1: Create Developer Service

**Session Type:** Backend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 11.1.3 complete

#### Deliverables:
- [ ] src/modules/developer/developer.service.ts

#### Methods:
```typescript
class DeveloperService {
  // ===== Application =====
  async applyToBeDeveloper(
    ctx: ServiceContext,
    data: DeveloperApplicationRequest
  ): Promise<Developer> {
    // Check if already a developer
    const existing = await prisma.developer.findUnique({
      where: { userId: ctx.userId }
    });
    if (existing) {
      throw new ConflictError("You already have a developer account");
    }
    
    // Check slug availability
    const slugTaken = await prisma.developer.findUnique({
      where: { slug: data.slug }
    });
    if (slugTaken) {
      throw new ValidationError("Slug is already taken", { slug: ["Not available"] });
    }
    
    // Create developer record
    const developer = await prisma.developer.create({
      data: {
        userId: ctx.userId,
        type: data.type,
        displayName: data.displayName,
        slug: data.slug,
        email: data.email,
        bio: data.bio,
        website: data.website,
        companyName: data.companyName,
        companyCountry: data.companyCountry,
        status: 'PENDING',
      }
    });
    
    // Audit
    void auditActions.developerApplied(ctx, developer.id);
    
    return developer;
  }
  
  // ===== Profile =====
  async getMyDeveloperProfile(ctx: ServiceContext): Promise<Developer | null>
  async getDeveloperBySlug(slug: string): Promise<DeveloperProfile | null>
  async updateProfile(ctx: ServiceContext, data: UpdateProfileRequest): Promise<Developer>
  
  // ===== Verification =====
  async submitVerificationDocument(
    ctx: ServiceContext,
    docType: VerificationDocType,
    file: File
  ): Promise<DeveloperVerification>
  
  async startStripeIdentityVerification(
    ctx: ServiceContext
  ): Promise<{ clientSecret: string }>
  
  // ===== Stripe Connect =====
  async createStripeConnectAccount(ctx: ServiceContext): Promise<{ url: string }>
  async completeStripeOnboarding(ctx: ServiceContext): Promise<void>
  async getStripeLoginLink(ctx: ServiceContext): Promise<{ url: string }>
  
  // ===== Stats =====
  async getDashboardStats(ctx: ServiceContext): Promise<DeveloperDashboardStats>
  async getEarningsHistory(
    ctx: ServiceContext,
    options: { startDate: Date; endDate: Date }
  ): Promise<EarningsBreakdown[]>
  
  // ===== Admin =====
  async getDevelopersPendingReview(): Promise<Developer[]>
  async approveDeveloper(developerId: string, adminId: string): Promise<void>
  async rejectDeveloper(developerId: string, adminId: string, reason: string): Promise<void>
  async requestMoreDocuments(developerId: string, adminId: string, notes: string): Promise<void>
}
```

#### Done Criteria:
- [ ] Application flow
- [ ] Profile management
- [ ] Document upload
- [ ] Stripe integration
- [ ] Admin review methods

---

### Task 11.2.2: Create Developer API Endpoints

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 11.2.1 complete

#### Deliverables:
- [ ] src/server/routes/developer.ts

#### Endpoints:
```typescript
// ===== Public =====
GET    /api/developers/:slug       - Get developer profile

// ===== User (become a developer) =====
GET    /api/developer              - Get my developer profile
POST   /api/developer/apply        - Apply to become developer
PUT    /api/developer/profile      - Update my profile
POST   /api/developer/verify/document - Upload verification doc
POST   /api/developer/verify/identity - Start Stripe Identity
POST   /api/developer/stripe/connect  - Create Stripe Connect account
GET    /api/developer/stripe/login    - Get Stripe dashboard link
GET    /api/developer/stats        - Get my stats
GET    /api/developer/earnings     - Get earnings history

// ===== Admin =====
GET    /api/admin/developers/pending  - Get pending applications
POST   /api/admin/developers/:id/approve
POST   /api/admin/developers/:id/reject
POST   /api/admin/developers/:id/request-docs
GET    /api/admin/developers/:id/documents
```

#### Done Criteria:
- [ ] All endpoints implemented
- [ ] Auth + role checks
- [ ] Admin routes protected

---

### Task 11.2.3: Integrate Stripe Connect

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 11.2.2 complete

#### Deliverables:
- [ ] src/lib/stripe-connect.ts

#### Implementation:
```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export class StripeConnectService {
  /**
   * Create a Stripe Connect account for a developer
   */
  async createConnectAccount(developer: Developer): Promise<Stripe.Account> {
    const account = await stripe.accounts.create({
      type: 'express',
      email: developer.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: developer.type === 'COMPANY' ? 'company' : 'individual',
      metadata: {
        developerId: developer.id,
        userId: developer.userId,
      },
    });
    
    return account;
  }
  
  /**
   * Generate onboarding link for developer
   */
  async createOnboardingLink(
    stripeAccountId: string,
    returnUrl: string
  ): Promise<string> {
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${returnUrl}?refresh=true`,
      return_url: `${returnUrl}?success=true`,
      type: 'account_onboarding',
    });
    
    return accountLink.url;
  }
  
  /**
   * Check if account is fully onboarded
   */
  async checkOnboardingStatus(stripeAccountId: string): Promise<{
    complete: boolean;
    requirements: string[];
  }> {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    
    return {
      complete: account.details_submitted && !account.requirements?.currently_due?.length,
      requirements: account.requirements?.currently_due || [],
    };
  }
  
  /**
   * Create a transfer to developer
   */
  async createTransfer(
    stripeAccountId: string,
    amount: number,
    currency: string,
    metadata: Record<string, string>
  ): Promise<Stripe.Transfer> {
    return stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      destination: stripeAccountId,
      metadata,
    });
  }
  
  /**
   * Generate login link for developer's Stripe dashboard
   */
  async createLoginLink(stripeAccountId: string): Promise<string> {
    const link = await stripe.accounts.createLoginLink(stripeAccountId);
    return link.url;
  }
}

export const stripeConnectService = new StripeConnectService();
```

#### Done Criteria:
- [ ] Account creation
- [ ] Onboarding flow
- [ ] Status checking
- [ ] Transfer capability
- [ ] Dashboard access

---

### Task 11.3.1: Create Developer Application Page

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 11.2.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/developer/apply/page.tsx

#### Features:
```
- Type selection (Individual / Company)
- Profile info form
- Company details (conditional)
- Terms agreement
- Submit application
```

#### Implementation:
```tsx
export default function DeveloperApplyPage() {
  const [step, setStep] = useState<'type' | 'info' | 'review'>('type');
  const [type, setType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL');
  
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Become a Developer</h1>
      <p className="text-muted-foreground">
        Publish plugins, themes, and widgets to the marketplace
      </p>
      
      {/* Progress steps */}
      <Steps current={step} steps={['Type', 'Information', 'Review']} />
      
      {step === 'type' && (
        <TypeSelection value={type} onChange={setType} onNext={() => setStep('info')} />
      )}
      
      {step === 'info' && (
        <ApplicationForm type={type} onBack={() => setStep('type')} onNext={() => setStep('review')} />
      )}
      
      {step === 'review' && (
        <ReviewAndSubmit onBack={() => setStep('info')} />
      )}
    </div>
  );
}
```

#### Done Criteria:
- [ ] Type selection UI
- [ ] Multi-step form
- [ ] Company fields conditional
- [ ] Submit working

---

### Task 11.3.2: Create Developer Dashboard

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 11.3.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/developer/page.tsx

#### Features:
```
- Overview stats (plugins, downloads, earnings)
- Recent activity
- Quick actions
- Verification status banner
- Payout status
```

#### Done Criteria:
- [ ] Stats cards
- [ ] Verification banner
- [ ] Quick action buttons
- [ ] Activity feed

---

### Task 11.3.3: Create Plugin Management Page

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 11.3.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/developer/plugins/page.tsx
- [ ] src/app/(dashboard)/developer/plugins/[id]/page.tsx

#### Features:
```
- List developer's plugins
- Status badges (Draft, Pending Review, Published)
- Downloads/revenue per plugin
- Edit/delete actions
- Create new plugin button
```

#### Done Criteria:
- [ ] Plugin list
- [ ] Status badges
- [ ] Per-plugin stats
- [ ] Edit/delete

---

### Task 11.3.4: Create Plugin Submission Flow

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 11.3.3 complete

#### Deliverables:
- [ ] src/app/(dashboard)/developer/plugins/new/page.tsx
- [ ] Multi-step plugin creation wizard

#### Steps:
```
1. Basic Info
   - Name, slug, description
   - Category, tags
   
2. Configuration
   - Required gateways
   - Config schema builder
   
3. Pricing
   - Free / One-time / Subscription
   - Price input
   
4. Assets
   - Icon upload
   - Screenshots
   - README
   
5. Review & Submit
   - Preview
   - Submit for review
```

#### Done Criteria:
- [ ] Multi-step wizard
- [ ] Config schema builder
- [ ] Asset upload
- [ ] Submit for review

---

### Task 11.3.5: Create Earnings/Payout Page

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 11.3.4 complete

#### Deliverables:
- [ ] src/app/(dashboard)/developer/earnings/page.tsx

#### Features:
```
- Total earnings
- Pending payout
- Monthly breakdown chart
- Transaction history
- Stripe dashboard link
```

#### Done Criteria:
- [ ] Earnings overview
- [ ] Chart visualization
- [ ] Transaction list
- [ ] Stripe link

---

### Task 11.4.1: Create Developer Review Queue

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 11.2.2 complete

#### Deliverables:
- [ ] src/app/(admin)/developers/page.tsx

#### Features:
```
- List pending applications
- Filter by status
- Quick approve/reject
- View details modal
```

#### Done Criteria:
- [ ] Pending list
- [ ] Status filtering
- [ ] Quick actions
- [ ] Detail view

---

### Task 11.4.2: Create Plugin Review Queue

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 11.4.1 complete

#### Deliverables:
- [ ] src/app/(admin)/plugins/review/page.tsx

#### Features:
```
- List plugins pending review
- Preview plugin details
- Approve / Request changes / Reject
- Review notes
```

#### Done Criteria:
- [ ] Review list
- [ ] Plugin preview
- [ ] Review actions
- [ ] Notes input

---

### Task 11.4.3: Create Verification Document Viewer

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 11.4.2 complete

#### Deliverables:
- [ ] src/components/admin/document-viewer.tsx

#### Features:
```
- Secure document display
- PDF viewer
- Image zoom
- Approve/reject per document
```

#### Done Criteria:
- [ ] Document display
- [ ] Zoom/pan
- [ ] Status update

---

### Task 11.5.1: Update Plugin Model for Marketplace

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Task 11.4.3 complete

#### Schema Update:
```prisma
model Plugin {
  // ... existing fields
  
  // Author (for marketplace plugins)
  authorId        String?         @map("author_id")
  author          Developer?      @relation(fields: [authorId], references: [id])
  
  // Pricing
  price           Decimal         @default(0) @db.Decimal(10, 2)
  priceType       String          @default("FREE")  // FREE, ONE_TIME, SUBSCRIPTION
  
  // Publication status
  publishStatus   String          @default("draft")  // draft, pending_review, published, rejected
  publishedAt     DateTime?       @map("published_at")
  
  // Review
  reviewedBy      String?         @map("reviewed_by")
  reviewNotes     String?         @map("review_notes")
  
  // Stats
  downloadCount   Int             @default(0) @map("download_count")
  rating          Decimal?        @db.Decimal(2, 1)
  reviewCount     Int             @default(0) @map("review_count")
  
  // Assets
  iconUrl         String?         @map("icon_url")
  screenshotUrls  String[]        @map("screenshot_urls")
  readmeUrl       String?         @map("readme_url")
  
  @@index([authorId])
  @@index([publishStatus])
}
```

#### Done Criteria:
- [ ] Author relation added
- [ ] Pricing fields
- [ ] Publication status
- [ ] Migration applied

---

### Task 11.5.2: Create Plugin Version System

**Session Type:** Database/Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 11.5.1 complete

#### Schema:
```prisma
model PluginVersion {
  id              String    @id @default(cuid())
  pluginId        String    @map("plugin_id")
  
  version         String    // Semver: "1.0.0", "1.1.0"
  changelog       String?   @db.Text
  
  // Code/logic reference
  codeHash        String?   @map("code_hash")  // For verification
  
  // Status
  status          String    @default("draft")  // draft, published, deprecated
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  publishedAt     DateTime? @map("published_at")
  
  // Relations
  plugin          Plugin    @relation(fields: [pluginId], references: [id], onDelete: Cascade)
  
  @@unique([pluginId, version])
  @@map("plugin_versions")
}
```

#### Done Criteria:
- [ ] Version model created
- [ ] Changelog support
- [ ] Version status

---

### Task 11.5.3: Create Plugin Review Workflow

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 11.5.2 complete

#### Implementation:
```typescript
class PluginReviewService {
  async submitForReview(ctx: ServiceContext, pluginId: string): Promise<void> {
    const plugin = await this.getPluginWithOwnerCheck(ctx, pluginId);
    
    if (plugin.publishStatus !== 'draft') {
      throw new ValidationError("Plugin is not in draft status");
    }
    
    // Validate plugin has all required fields
    await this.validatePluginComplete(plugin);
    
    await prisma.plugin.update({
      where: { id: pluginId },
      data: { publishStatus: 'pending_review' }
    });
    
    // Notify admins
    await notificationService.notifyAdmins('new_plugin_review', { plugin });
  }
  
  async approvePlugin(adminId: string, pluginId: string): Promise<void> {
    await prisma.plugin.update({
      where: { id: pluginId },
      data: {
        publishStatus: 'published',
        publishedAt: new Date(),
        reviewedBy: adminId,
      }
    });
    
    // Notify developer
    await notificationService.notifyDeveloper(plugin.authorId, 'plugin_approved', { plugin });
  }
  
  async rejectPlugin(adminId: string, pluginId: string, reason: string): Promise<void> {
    await prisma.plugin.update({
      where: { id: pluginId },
      data: {
        publishStatus: 'rejected',
        reviewedBy: adminId,
        reviewNotes: reason,
      }
    });
    
    // Notify developer
    await notificationService.notifyDeveloper(plugin.authorId, 'plugin_rejected', { plugin, reason });
  }
}
```

#### Done Criteria:
- [ ] Submit for review
- [ ] Approve workflow
- [ ] Reject workflow
- [ ] Notifications

---

## ✅ Phase 11 Completion Checklist

### Developer Models
- [ ] Developer model with types
- [ ] DeveloperVerification model
- [ ] Types and validation

### Developer Service
- [ ] Application flow
- [ ] Profile management
- [ ] Stripe Connect integration
- [ ] API endpoints

### Developer Portal UI
- [ ] Application page
- [ ] Dashboard with stats
- [ ] Plugin management
- [ ] Submission wizard
- [ ] Earnings page

### Admin Review
- [ ] Developer review queue
- [ ] Plugin review queue
- [ ] Document viewer

### Plugin Publishing
- [ ] Plugin model updated
- [ ] Version system
- [ ] Review workflow

---

## 📊 Task Summary

| Section | Tasks | Estimated Time |
|---------|-------|----------------|
| Developer Models | 3 | 75 min |
| Developer Service | 3 | 120 min |
| Developer Portal UI | 5 | 185 min |
| Admin Review | 3 | 85 min |
| Plugin Publishing | 3 | 85 min |
| **Total** | **17** | **~9-10 hours** |

---

**When complete:** Update CURRENT-STATE.md and proceed to Phase 12 (Marketplace)
