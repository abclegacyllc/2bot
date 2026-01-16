# Phase 12: Marketplace (V2)

> **Goal:** Build public marketplace for plugins, themes, and widgets with purchase/install flow
> **Estimated Sessions:** 15-18
> **Prerequisites:** Phase 11 complete

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Marketplace Models** ||||
| 12.1.1 | Create Purchase model | ⬜ | User purchases |
| 12.1.2 | Create Review model | ⬜ | Ratings + reviews |
| 12.1.3 | Create InstallationLog model | ⬜ | Track installs |
| 12.1.4 | Create marketplace types | ⬜ | |
| **Marketplace Service** ||||
| 12.2.1 | Create marketplace service | ⬜ | Listing, search |
| 12.2.2 | Create purchase service | ⬜ | Buy flow |
| 12.2.3 | Create install service | ⬜ | Install to bot |
| 12.2.4 | Create review service | ⬜ | Rating system |
| 12.2.5 | Create marketplace API endpoints | ⬜ | |
| **Public Marketplace UI** ||||
| 12.3.1 | Create marketplace browse page | ⬜ | Discover items |
| 12.3.2 | Create search + filter | ⬜ | Category, tags, price |
| 12.3.3 | Create plugin detail page | ⬜ | Full item view |
| 12.3.4 | Create developer profile page | ⬜ | Public profile |
| 12.3.5 | Create review/rating UI | ⬜ | Leave reviews |
| **Purchase Flow** ||||
| 12.4.1 | Create purchase checkout | ⬜ | Stripe checkout |
| 12.4.2 | Create purchase confirmation | ⬜ | Success page |
| 12.4.3 | Create my purchases page | ⬜ | Purchase history |
| 12.4.4 | Handle Stripe webhooks | ⬜ | Payment events |
| **Install Flow** ||||
| 12.5.1 | Create install modal | ⬜ | Select bot, configure |
| 12.5.2 | Create installed items page | ⬜ | Manage installed |
| 12.5.3 | Create update flow | ⬜ | Update to new version |
| **Collections & Discovery** ||||
| 12.6.1 | Create featured section | ⬜ | Curated picks |
| 12.6.2 | Create collections | ⬜ | Grouped items |
| 12.6.3 | Create trending/popular | ⬜ | Based on downloads |

---

## 🏪 Marketplace Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MARKETPLACE ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   PLUGINS   │    │   THEMES    │    │  WIDGETS    │          │
│  │             │    │             │    │             │          │
│  │ Bot logic   │    │ UI styles   │    │ Dashboard   │          │
│  │ Automation  │    │ Colors      │    │ components  │          │
│  │ Integrations│    │ Layouts     │    │             │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│         │                 │                  │                   │
│         └────────────┬────┴──────────────────┘                  │
│                      ▼                                           │
│              ┌───────────────┐                                   │
│              │  MARKETPLACE  │                                   │
│              │    LISTING    │                                   │
│              └───────────────┘                                   │
│                      │                                           │
│         ┌────────────┼────────────┐                             │
│         ▼            ▼            ▼                             │
│  ┌─────────────┐ ┌──────────┐ ┌──────────┐                     │
│  │   BROWSE    │ │  SEARCH  │ │ PURCHASE │                     │
│  │  Featured   │ │  Filter  │ │  Install │                     │
│  │ Collections │ │  Sort    │ │  Update  │                     │
│  └─────────────┘ └──────────┘ └──────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Item Flow: Developer → User

```
┌─────────────────────────────────────────────────────────────────┐
│                    ITEM LIFECYCLE                                │
│                                                                  │
│  DEVELOPER                     PLATFORM                  USER   │
│  ─────────                     ────────                  ────   │
│                                                                  │
│  1. Create item                                                 │
│     └─────────────────────────▶ 2. Review queue                 │
│                                    │                             │
│                                    ▼                             │
│                                 3. Admin review                  │
│                                    │                             │
│                                    ▼                             │
│  4. Notification ◀──────────── APPROVED                         │
│                                    │                             │
│                                    ▼                             │
│                                 5. Listed in ───────▶ 6. Browse │
│                                    marketplace           │       │
│                                                          ▼       │
│                                                       7. View   │
│                                                       details   │
│                                                          │       │
│                                                          ▼       │
│                                 8. Purchase ◀───────── Buy      │
│                                    record                │       │
│                                    │                     │       │
│  9. Earnings ◀─────────────────────┤                     │       │
│     credited                       │                     │       │
│                                    ▼                     ▼       │
│                                                       10. Install│
│                                                       to bot     │
│                                                          │       │
│                                                          ▼       │
│                                                       11. Use!  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Price Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRICING OPTIONS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FREE                                                           │
│  ────                                                           │
│  • Open source / community plugins                              │
│  • Developer gets exposure                                      │
│  • Can have "Pro" version                                       │
│                                                                  │
│  ONE-TIME PURCHASE                                              │
│  ─────────────────                                              │
│  • Pay once, own forever                                        │
│  • Includes updates (same major version)                        │
│  • Developer sets price ($1 - $999)                             │
│  • 70% to developer, 30% platform fee                           │
│                                                                  │
│  SUBSCRIPTION (future)                                          │
│  ────────────────────                                           │
│  • Monthly/yearly recurring                                     │
│  • Access while subscribed                                      │
│  • Continuous updates                                           │
│  • For premium plugins with ongoing features                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Detailed Tasks

---

### Task 12.1.1: Create Purchase Model

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Phase 11 complete

#### Schema:
```prisma
// Purchase status
enum PurchaseStatus {
  PENDING           // Payment initiated
  COMPLETED         // Payment successful
  FAILED            // Payment failed
  REFUNDED          // Money returned
}

// Purchase record
model Purchase {
  id                String          @id @default(cuid())
  userId            String          @map("user_id")
  
  // Item purchased (polymorphic)
  itemType          String          @map("item_type")  // "plugin", "theme", "widget"
  itemId            String          @map("item_id")
  
  // Developer
  developerId       String          @map("developer_id")
  
  // Payment details
  priceType         String          @map("price_type")  // ONE_TIME, SUBSCRIPTION
  amount            Decimal         @db.Decimal(10, 2)
  currency          String          @default("usd")
  
  // Platform split
  platformFee       Decimal         @db.Decimal(10, 2) @map("platform_fee")
  developerShare    Decimal         @db.Decimal(10, 2) @map("developer_share")
  
  // Stripe
  stripePaymentId   String?         @unique @map("stripe_payment_id")
  stripeSessionId   String?         @map("stripe_session_id")
  
  // Status
  status            PurchaseStatus  @default(PENDING)
  completedAt       DateTime?       @map("completed_at")
  refundedAt        DateTime?       @map("refunded_at")
  refundReason      String?         @map("refund_reason")
  
  // Timestamps
  createdAt         DateTime        @default(now()) @map("created_at")
  
  // Relations
  user              User            @relation(fields: [userId], references: [id])
  developer         Developer       @relation(fields: [developerId], references: [id])
  
  @@index([userId])
  @@index([developerId])
  @@index([itemType, itemId])
  @@index([status])
  @@map("purchases")
}
```

#### Done Criteria:
- [ ] Purchase model created
- [ ] Polymorphic item reference
- [ ] Payment tracking
- [ ] Migration applied

---

### Task 12.1.2: Create Review Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 12.1.1 complete

#### Schema:
```prisma
// Review for marketplace items
model Review {
  id              String    @id @default(cuid())
  userId          String    @map("user_id")
  
  // Item reviewed (polymorphic)
  itemType        String    @map("item_type")  // "plugin", "theme", "widget"
  itemId          String    @map("item_id")
  
  // Rating
  rating          Int       // 1-5 stars
  title           String?   // Optional review title
  content         String?   @db.Text  // Review text
  
  // Moderation
  isPublic        Boolean   @default(true) @map("is_public")
  flagged         Boolean   @default(false)
  flagReason      String?   @map("flag_reason")
  
  // Developer response
  response        String?   @db.Text
  respondedAt     DateTime? @map("responded_at")
  
  // Verification
  verifiedPurchase Boolean  @default(false) @map("verified_purchase")
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  // Relations
  user            User      @relation(fields: [userId], references: [id])
  
  @@unique([userId, itemType, itemId])  // One review per user per item
  @@index([itemType, itemId])
  @@index([rating])
  @@map("reviews")
}
```

#### Done Criteria:
- [ ] Review model created
- [ ] Rating 1-5
- [ ] Verified purchase flag
- [ ] Developer response
- [ ] Migration applied

---

### Task 12.1.3: Create InstallationLog Model

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 12.1.2 complete

#### Schema:
```prisma
// Installation tracking
model Installation {
  id              String    @id @default(cuid())
  userId          String    @map("user_id")
  botId           String    @map("bot_id")
  
  // Item installed
  itemType        String    @map("item_type")  // "plugin", "theme", "widget"
  itemId          String    @map("item_id")
  version         String?   // Version at time of install
  
  // Purchase link (if paid item)
  purchaseId      String?   @map("purchase_id")
  
  // Status
  status          String    @default("active")  // active, disabled, uninstalled
  
  // Configuration snapshot
  configSnapshot  Json?     @map("config_snapshot")
  
  // Timestamps
  installedAt     DateTime  @default(now()) @map("installed_at")
  uninstalledAt   DateTime? @map("uninstalled_at")
  
  // Relations
  user            User      @relation(fields: [userId], references: [id])
  bot             Bot       @relation(fields: [botId], references: [id])
  
  @@unique([botId, itemType, itemId])  // One install per item per bot
  @@index([userId])
  @@index([itemType, itemId])
  @@map("installations")
}
```

#### Done Criteria:
- [ ] Installation model created
- [ ] Tracks version
- [ ] Links to purchase
- [ ] Migration applied

---

### Task 12.1.4: Create Marketplace Types

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 12.1.3 complete

#### Deliverables:
- [ ] src/modules/marketplace/marketplace.types.ts

#### Types:
```typescript
// src/modules/marketplace/marketplace.types.ts

export type ItemType = 'plugin' | 'theme' | 'widget';

// Base marketplace item (common fields)
export interface MarketplaceItem {
  id: string;
  type: ItemType;
  name: string;
  slug: string;
  description: string;
  
  // Author
  author: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl?: string;
    isVerified: boolean;
  };
  
  // Pricing
  price: number;
  priceType: 'FREE' | 'ONE_TIME' | 'SUBSCRIPTION';
  currency: string;
  
  // Stats
  downloadCount: number;
  rating: number | null;
  reviewCount: number;
  
  // Assets
  iconUrl?: string;
  screenshotUrls: string[];
  
  // Meta
  category: string;
  tags: string[];
  version: string;
  lastUpdated: Date;
}

// Detailed view (includes readme, changelog, etc)
export interface MarketplaceItemDetail extends MarketplaceItem {
  readme?: string;
  changelog?: string;
  requirements?: {
    gateways?: string[];
    plans?: string[];
  };
  
  // User-specific
  isPurchased: boolean;
  isInstalled: boolean;
  userReview?: {
    rating: number;
    content?: string;
  };
}

// Search/browse options
export interface MarketplaceSearchOptions {
  query?: string;
  type?: ItemType;
  category?: string;
  tags?: string[];
  priceType?: 'FREE' | 'PAID' | 'ALL';
  minRating?: number;
  sortBy?: 'popular' | 'newest' | 'rating' | 'price_asc' | 'price_desc';
  page?: number;
  perPage?: number;
}

// Search result
export interface MarketplaceSearchResult {
  items: MarketplaceItem[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

// Purchase request
export interface PurchaseRequest {
  itemType: ItemType;
  itemId: string;
  returnUrl: string;
}

// Install request
export interface InstallRequest {
  itemType: ItemType;
  itemId: string;
  botId: string;
  config?: Record<string, unknown>;
}

// Review request
export interface CreateReviewRequest {
  itemType: ItemType;
  itemId: string;
  rating: number;
  title?: string;
  content?: string;
}
```

#### Done Criteria:
- [ ] All types defined
- [ ] Search options
- [ ] Purchase/install types

---

### Task 12.2.1: Create Marketplace Service

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 12.1.4 complete

#### Deliverables:
- [ ] src/modules/marketplace/marketplace.service.ts

#### Methods:
```typescript
class MarketplaceService {
  // ===== Browse/Search =====
  async searchMarketplace(
    options: MarketplaceSearchOptions
  ): Promise<MarketplaceSearchResult> {
    const { query, type, category, tags, priceType, minRating, sortBy, page = 1, perPage = 20 } = options;
    
    // Build where clause
    const where: Prisma.PluginWhereInput = {
      publishStatus: 'published',
      ...(type && { /* filter by type */ }),
      ...(category && { category }),
      ...(tags?.length && { tags: { hasSome: tags } }),
      ...(priceType === 'FREE' && { price: 0 }),
      ...(priceType === 'PAID' && { price: { gt: 0 } }),
      ...(minRating && { rating: { gte: minRating } }),
      ...(query && {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: [query] } },
        ]
      }),
    };
    
    // Build orderBy
    const orderBy = this.getOrderBy(sortBy);
    
    // Execute
    const [items, total] = await Promise.all([
      prisma.plugin.findMany({
        where,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
        include: { author: { select: authorSelect } },
      }),
      prisma.plugin.count({ where }),
    ]);
    
    return {
      items: items.map(this.toMarketplaceItem),
      total,
      page,
      perPage,
      hasMore: page * perPage < total,
    };
  }
  
  async getItemDetail(
    type: ItemType,
    slug: string,
    userId?: string
  ): Promise<MarketplaceItemDetail | null> {
    const item = await this.getItemBySlug(type, slug);
    if (!item) return null;
    
    // Check user-specific data
    let isPurchased = false;
    let isInstalled = false;
    let userReview = null;
    
    if (userId) {
      [isPurchased, isInstalled, userReview] = await Promise.all([
        this.checkPurchased(userId, type, item.id),
        this.checkInstalled(userId, type, item.id),
        this.getUserReview(userId, type, item.id),
      ]);
    }
    
    return {
      ...this.toMarketplaceItem(item),
      readme: item.readme,
      changelog: item.changelog,
      isPurchased,
      isInstalled,
      userReview,
    };
  }
  
  // ===== Featured/Collections =====
  async getFeaturedItems(): Promise<MarketplaceItem[]>
  async getCollection(slug: string): Promise<Collection>
  async getTrendingItems(limit: number): Promise<MarketplaceItem[]>
  async getNewItems(limit: number): Promise<MarketplaceItem[]>
  
  // ===== Categories =====
  async getCategories(): Promise<CategoryWithCount[]>
  async getPopularTags(): Promise<TagWithCount[]>
}
```

#### Done Criteria:
- [ ] Search with filters
- [ ] Sort options
- [ ] Featured/trending
- [ ] Category listing

---

### Task 12.2.2: Create Purchase Service

**Session Type:** Backend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 12.2.1 complete

#### Deliverables:
- [ ] src/modules/marketplace/purchase.service.ts

#### Methods:
```typescript
class PurchaseService {
  /**
   * Create checkout session for item purchase
   */
  async createCheckoutSession(
    ctx: ServiceContext,
    request: PurchaseRequest
  ): Promise<{ checkoutUrl: string }> {
    // Get item
    const item = await this.getItem(request.itemType, request.itemId);
    if (!item) throw new NotFoundError("Item not found");
    if (item.price === 0) throw new ValidationError("This item is free");
    
    // Check not already purchased
    const existing = await prisma.purchase.findFirst({
      where: {
        userId: ctx.userId,
        itemType: request.itemType,
        itemId: request.itemId,
        status: 'COMPLETED',
      }
    });
    if (existing) throw new ConflictError("You already own this item");
    
    // Calculate split
    const platformFee = item.price * 0.30;  // 30% platform fee
    const developerShare = item.price - platformFee;
    
    // Create pending purchase record
    const purchase = await prisma.purchase.create({
      data: {
        userId: ctx.userId,
        itemType: request.itemType,
        itemId: request.itemId,
        developerId: item.authorId,
        priceType: item.priceType,
        amount: item.price,
        platformFee,
        developerShare,
        status: 'PENDING',
      }
    });
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: ctx.user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: `${item.type} by ${item.author.displayName}`,
            images: item.iconUrl ? [item.iconUrl] : [],
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: 1,
      }],
      metadata: {
        purchaseId: purchase.id,
        itemType: request.itemType,
        itemId: request.itemId,
      },
      success_url: `${request.returnUrl}?success=true&purchase=${purchase.id}`,
      cancel_url: `${request.returnUrl}?canceled=true`,
    });
    
    // Update with session ID
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { stripeSessionId: session.id }
    });
    
    return { checkoutUrl: session.url! };
  }
  
  /**
   * Handle successful payment webhook
   */
  async handlePaymentSuccess(
    paymentIntentId: string,
    sessionId: string
  ): Promise<void> {
    const purchase = await prisma.purchase.findFirst({
      where: { stripeSessionId: sessionId }
    });
    if (!purchase) throw new NotFoundError("Purchase not found");
    
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: 'COMPLETED',
        stripePaymentId: paymentIntentId,
        completedAt: new Date(),
      }
    });
    
    // Update developer stats
    await prisma.developer.update({
      where: { id: purchase.developerId },
      data: {
        totalEarnings: { increment: purchase.developerShare },
      }
    });
    
    // Update item download count
    await this.incrementDownloadCount(purchase.itemType, purchase.itemId);
    
    // Create transfer to developer (if Stripe Connect enabled)
    await this.transferToDeveloper(purchase);
    
    // Notify user
    await notificationService.notify(purchase.userId, 'purchase_complete', { purchase });
  }
  
  // ===== Other methods =====
  async getUserPurchases(userId: string): Promise<Purchase[]>
  async checkOwnership(userId: string, itemType: ItemType, itemId: string): Promise<boolean>
  async requestRefund(ctx: ServiceContext, purchaseId: string, reason: string): Promise<void>
}
```

#### Done Criteria:
- [ ] Checkout creation
- [ ] Payment handling
- [ ] Developer payout
- [ ] Purchase history

---

### Task 12.2.3: Create Install Service

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 12.2.2 complete

#### Deliverables:
- [ ] src/modules/marketplace/install.service.ts

#### Methods:
```typescript
class InstallService {
  /**
   * Install item to a bot
   */
  async installItem(
    ctx: ServiceContext,
    request: InstallRequest
  ): Promise<Installation> {
    const { itemType, itemId, botId, config } = request;
    
    // Verify bot ownership
    const bot = await prisma.bot.findFirst({
      where: { id: botId, ownerId: ctx.userId }
    });
    if (!bot) throw new ForbiddenError("Bot not found or not yours");
    
    // Get item
    const item = await this.getItem(itemType, itemId);
    if (!item) throw new NotFoundError("Item not found");
    
    // Check purchase (if paid)
    if (item.price > 0) {
      const isPurchased = await purchaseService.checkOwnership(ctx.userId, itemType, itemId);
      if (!isPurchased) throw new ForbiddenError("You must purchase this item first");
    }
    
    // Check not already installed
    const existing = await prisma.installation.findUnique({
      where: {
        botId_itemType_itemId: { botId, itemType, itemId }
      }
    });
    if (existing && existing.status === 'active') {
      throw new ConflictError("Item already installed on this bot");
    }
    
    // Validate config against schema
    if (config && item.configSchema) {
      await this.validateConfig(config, item.configSchema);
    }
    
    // Create installation
    const installation = await prisma.installation.upsert({
      where: {
        botId_itemType_itemId: { botId, itemType, itemId }
      },
      create: {
        userId: ctx.userId,
        botId,
        itemType,
        itemId,
        version: item.version,
        configSnapshot: config,
        status: 'active',
      },
      update: {
        status: 'active',
        version: item.version,
        configSnapshot: config,
        uninstalledAt: null,
      }
    });
    
    // Activate plugin on bot
    await this.activateOnBot(botId, itemType, itemId, config);
    
    // Update download count (for free items)
    if (item.price === 0) {
      await this.incrementDownloadCount(itemType, itemId);
    }
    
    return installation;
  }
  
  /**
   * Uninstall item from bot
   */
  async uninstallItem(
    ctx: ServiceContext,
    botId: string,
    itemType: ItemType,
    itemId: string
  ): Promise<void> {
    const installation = await prisma.installation.findUnique({
      where: {
        botId_itemType_itemId: { botId, itemType, itemId }
      }
    });
    
    if (!installation || installation.userId !== ctx.userId) {
      throw new NotFoundError("Installation not found");
    }
    
    await prisma.installation.update({
      where: { id: installation.id },
      data: {
        status: 'uninstalled',
        uninstalledAt: new Date(),
      }
    });
    
    // Deactivate on bot
    await this.deactivateOnBot(botId, itemType, itemId);
  }
  
  // ===== Other methods =====
  async getUserInstallations(userId: string, botId?: string): Promise<Installation[]>
  async updateInstallation(ctx: ServiceContext, installId: string, config: unknown): Promise<void>
  async checkForUpdates(userId: string): Promise<AvailableUpdate[]>
  async updateToLatestVersion(ctx: ServiceContext, installId: string): Promise<void>
}
```

#### Done Criteria:
- [ ] Install with ownership check
- [ ] Config validation
- [ ] Uninstall
- [ ] Update detection

---

### Task 12.2.4: Create Review Service

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 12.2.3 complete

#### Deliverables:
- [ ] src/modules/marketplace/review.service.ts

#### Methods:
```typescript
class ReviewService {
  /**
   * Create or update review
   */
  async createReview(
    ctx: ServiceContext,
    request: CreateReviewRequest
  ): Promise<Review> {
    const { itemType, itemId, rating, title, content } = request;
    
    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new ValidationError("Rating must be between 1 and 5");
    }
    
    // Check item exists
    const item = await this.getItem(itemType, itemId);
    if (!item) throw new NotFoundError("Item not found");
    
    // Check if verified purchase
    const verifiedPurchase = await purchaseService.checkOwnership(
      ctx.userId, itemType, itemId
    );
    
    // Create/update review
    const review = await prisma.review.upsert({
      where: {
        userId_itemType_itemId: { userId: ctx.userId, itemType, itemId }
      },
      create: {
        userId: ctx.userId,
        itemType,
        itemId,
        rating,
        title,
        content,
        verifiedPurchase,
      },
      update: {
        rating,
        title,
        content,
        updatedAt: new Date(),
      }
    });
    
    // Update item average rating
    await this.updateItemRating(itemType, itemId);
    
    return review;
  }
  
  /**
   * Get reviews for item
   */
  async getItemReviews(
    itemType: ItemType,
    itemId: string,
    options: { page?: number; sortBy?: 'newest' | 'highest' | 'lowest' }
  ): Promise<ReviewListResult> {
    // ...
  }
  
  /**
   * Developer response to review
   */
  async respondToReview(
    ctx: ServiceContext,
    reviewId: string,
    response: string
  ): Promise<Review> {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { item: true }
    });
    
    // Verify developer owns the item
    if (review?.item?.authorId !== ctx.developerId) {
      throw new ForbiddenError("Not your item");
    }
    
    return prisma.review.update({
      where: { id: reviewId },
      data: {
        response,
        respondedAt: new Date(),
      }
    });
  }
  
  // ===== Helpers =====
  private async updateItemRating(itemType: ItemType, itemId: string): Promise<void> {
    const { _avg, _count } = await prisma.review.aggregate({
      where: { itemType, itemId, isPublic: true },
      _avg: { rating: true },
      _count: true,
    });
    
    // Update item's rating
    await prisma.plugin.update({
      where: { id: itemId },
      data: {
        rating: _avg.rating,
        reviewCount: _count,
      }
    });
  }
}
```

#### Done Criteria:
- [ ] Create/update review
- [ ] Verified purchase badge
- [ ] Developer response
- [ ] Rating aggregation

---

### Task 12.2.5: Create Marketplace API Endpoints

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 12.2.4 complete

#### Deliverables:
- [ ] src/server/routes/marketplace.ts

#### Endpoints:
```typescript
// ===== Browse/Search =====
GET    /api/marketplace                    - Search/browse items
GET    /api/marketplace/featured           - Get featured items
GET    /api/marketplace/trending           - Get trending items
GET    /api/marketplace/new                - Get newest items
GET    /api/marketplace/categories         - Get categories
GET    /api/marketplace/tags               - Get popular tags

// ===== Item detail =====
GET    /api/marketplace/:type/:slug        - Get item detail
GET    /api/marketplace/:type/:slug/reviews - Get item reviews

// ===== Purchase =====
POST   /api/marketplace/purchase           - Create checkout session
GET    /api/marketplace/purchases          - Get my purchases
POST   /api/marketplace/purchases/:id/refund - Request refund

// ===== Install =====
POST   /api/marketplace/install            - Install to bot
DELETE /api/marketplace/install/:id        - Uninstall
GET    /api/marketplace/installations      - My installations
GET    /api/marketplace/updates            - Check for updates
POST   /api/marketplace/install/:id/update - Update to latest

// ===== Reviews =====
POST   /api/marketplace/:type/:slug/reviews - Create review
PUT    /api/marketplace/reviews/:id        - Update my review
DELETE /api/marketplace/reviews/:id        - Delete my review
POST   /api/marketplace/reviews/:id/respond - Developer respond

// ===== Developer profile =====
GET    /api/marketplace/developers/:slug   - Developer profile
GET    /api/marketplace/developers/:slug/items - Developer's items

// ===== Webhooks =====
POST   /api/webhooks/stripe/marketplace    - Stripe payment webhook
```

#### Done Criteria:
- [ ] All endpoints implemented
- [ ] Auth where required
- [ ] Webhook handling

---

### Task 12.3.1: Create Marketplace Browse Page

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 12.2.5 complete

#### Deliverables:
- [ ] src/app/(public)/marketplace/page.tsx

#### Features:
```
- Hero banner with search
- Category navigation
- Item grid with cards
- Infinite scroll or pagination
- Quick filters (Free, Paid, Rating)
```

#### Implementation:
```tsx
export default function MarketplacePage() {
  const searchParams = useSearchParams();
  
  const { data, isLoading, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['marketplace', searchParams.toString()],
    queryFn: ({ pageParam = 1 }) => 
      marketplaceApi.search({ ...paramsFromQuery(searchParams), page: pageParam }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
  
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 py-16">
        <h1 className="text-4xl font-bold text-white text-center">
          Marketplace
        </h1>
        <p className="text-white/80 text-center mt-2">
          Discover plugins, themes, and widgets for your bots
        </p>
        <SearchInput className="max-w-xl mx-auto mt-6" />
      </section>
      
      {/* Categories */}
      <CategoryNav />
      
      {/* Filters + Grid */}
      <div className="container py-8">
        <div className="flex gap-8">
          <FilterSidebar />
          <div className="flex-1">
            <ItemGrid items={data?.pages.flatMap(p => p.items) ?? []} />
            {hasNextPage && (
              <Button onClick={() => fetchNextPage()}>Load More</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### Done Criteria:
- [ ] Hero with search
- [ ] Category nav
- [ ] Item grid
- [ ] Pagination/infinite scroll

---

### Task 12.3.2: Create Search + Filter

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 12.3.1 complete

#### Deliverables:
- [ ] src/components/marketplace/filter-sidebar.tsx
- [ ] src/components/marketplace/search-input.tsx
- [ ] src/components/marketplace/sort-select.tsx

#### Features:
```
- Full text search
- Category filter
- Tag filter (multi-select)
- Price filter (Free / Paid / All)
- Rating filter (min stars)
- Sort options
```

#### Done Criteria:
- [ ] Search with debounce
- [ ] Category filter
- [ ] Tag multi-select
- [ ] Price filter
- [ ] Sort select

---

### Task 12.3.3: Create Plugin Detail Page

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 12.3.2 complete

#### Deliverables:
- [ ] src/app/(public)/marketplace/[type]/[slug]/page.tsx

#### Features:
```
- Item header (icon, name, author, price)
- Action buttons (Buy / Install / Installed)
- Screenshots gallery
- Description / README
- Reviews section
- Similar items
```

#### Layout:
```tsx
export default async function ItemDetailPage({ params }: Props) {
  const item = await marketplaceService.getItemDetail(params.type, params.slug);
  
  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex gap-6">
        <ItemIcon size="lg" src={item.iconUrl} />
        <div>
          <h1 className="text-3xl font-bold">{item.name}</h1>
          <Link href={`/marketplace/developers/${item.author.slug}`}>
            By {item.author.displayName}
          </Link>
          <div className="flex items-center gap-2 mt-2">
            <StarRating value={item.rating} />
            <span>({item.reviewCount} reviews)</span>
          </div>
        </div>
        <div className="ml-auto text-right">
          <Price amount={item.price} />
          <ActionButton item={item} />
        </div>
      </div>
      
      {/* Screenshots */}
      <ScreenshotGallery images={item.screenshotUrls} />
      
      {/* Tabs: Description | Reviews | Changelog */}
      <Tabs defaultValue="description">
        <TabsList>
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({item.reviewCount})</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
        </TabsList>
        <TabsContent value="description">
          <Markdown content={item.readme} />
        </TabsContent>
        <TabsContent value="reviews">
          <ReviewList itemType={item.type} itemId={item.id} />
        </TabsContent>
        <TabsContent value="changelog">
          <Markdown content={item.changelog} />
        </TabsContent>
      </Tabs>
      
      {/* Similar items */}
      <SimilarItems category={item.category} excludeId={item.id} />
    </div>
  );
}
```

#### Done Criteria:
- [ ] Item header
- [ ] Screenshots gallery
- [ ] Readme/description
- [ ] Reviews tab
- [ ] Action button

---

### Task 12.3.4: Create Developer Profile Page

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 12.3.3 complete

#### Deliverables:
- [ ] src/app/(public)/marketplace/developers/[slug]/page.tsx

#### Features:
```
- Developer header (avatar, name, verified badge)
- Bio
- Social links
- Stats (items, downloads, rating)
- Item list (plugins, themes, widgets by this dev)
```

#### Done Criteria:
- [ ] Developer header
- [ ] Verified badge
- [ ] Stats display
- [ ] Items grid

---

### Task 12.3.5: Create Review/Rating UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 12.3.4 complete

#### Deliverables:
- [ ] src/components/marketplace/review-list.tsx
- [ ] src/components/marketplace/review-form.tsx
- [ ] src/components/marketplace/star-rating.tsx

#### Features:
```
- Rating breakdown chart
- Review cards with verified badge
- Developer response display
- Write review form (for purchasers)
```

#### Done Criteria:
- [ ] Rating breakdown
- [ ] Review cards
- [ ] Review form
- [ ] Star input

---

### Task 12.4.1: Create Purchase Checkout

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 12.3.5 complete

#### Deliverables:
- [ ] Purchase flow integration in detail page

#### Flow:
```
1. Click "Buy" button
2. Confirmation modal (price, what you get)
3. Redirect to Stripe Checkout
4. Return to success page
```

#### Done Criteria:
- [ ] Buy button triggers checkout
- [ ] Confirmation modal
- [ ] Stripe redirect
- [ ] Loading states

---

### Task 12.4.2: Create Purchase Confirmation

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 12.4.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/marketplace/purchase/success/page.tsx

#### Features:
```
- Success message
- Item details
- "Install Now" button
- Receipt link
```

#### Done Criteria:
- [ ] Success display
- [ ] Install CTA
- [ ] Receipt access

---

### Task 12.4.3: Create My Purchases Page

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 12.4.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/marketplace/purchases/page.tsx

#### Features:
```
- List all purchases
- Filter by item type
- Download/install actions
- Refund request link
```

#### Done Criteria:
- [ ] Purchase list
- [ ] Quick actions
- [ ] Receipt access

---

### Task 12.4.4: Handle Stripe Webhooks

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 12.4.3 complete

#### Deliverables:
- [ ] src/server/routes/webhooks/stripe-marketplace.ts

#### Events to handle:
```typescript
// Webhook handler
export async function handleStripeWebhook(req: Request, res: Response) {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature']!,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
  
  switch (event.type) {
    case 'checkout.session.completed':
      await purchaseService.handlePaymentSuccess(
        event.data.object.payment_intent,
        event.data.object.id
      );
      break;
      
    case 'payment_intent.payment_failed':
      await purchaseService.handlePaymentFailed(
        event.data.object.id
      );
      break;
      
    case 'charge.refunded':
      await purchaseService.handleRefund(
        event.data.object.payment_intent
      );
      break;
  }
  
  res.json({ received: true });
}
```

#### Done Criteria:
- [ ] Webhook signature verification
- [ ] Payment success handling
- [ ] Payment failed handling
- [ ] Refund handling

---

### Task 12.5.1: Create Install Modal

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 12.4.4 complete

#### Deliverables:
- [ ] src/components/marketplace/install-modal.tsx

#### Features:
```
- Select bot dropdown
- Configuration form (from schema)
- Install button
- Success message
```

#### Done Criteria:
- [ ] Bot selector
- [ ] Config form
- [ ] Install action
- [ ] Success feedback

---

### Task 12.5.2: Create Installed Items Page

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 12.5.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/bots/[id]/installed/page.tsx

#### Features:
```
- List installed items per bot
- Status badges
- Enable/disable toggle
- Configure button
- Uninstall button
```

#### Done Criteria:
- [ ] Installed list
- [ ] Quick actions
- [ ] Config access
- [ ] Uninstall

---

### Task 12.5.3: Create Update Flow

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 12.5.2 complete

#### Deliverables:
- [ ] Update notification + modal

#### Features:
```
- Badge showing updates available
- Update modal with changelog
- Update button
- Version comparison
```

#### Done Criteria:
- [ ] Update detection
- [ ] Changelog display
- [ ] Update action

---

### Task 12.6.1: Create Featured Section

**Session Type:** Full Stack
**Estimated Time:** 30 minutes
**Prerequisites:** Task 12.5.3 complete

#### Deliverables:
- [ ] Featured items API + admin curation
- [ ] Homepage featured section

#### Admin Features:
```
- Mark items as featured
- Set featured order
- Featured start/end dates
```

#### Done Criteria:
- [ ] Admin curation
- [ ] Featured API
- [ ] Homepage display

---

### Task 12.6.2: Create Collections

**Session Type:** Full Stack
**Estimated Time:** 35 minutes
**Prerequisites:** Task 12.6.1 complete

#### Schema:
```prisma
model Collection {
  id            String    @id @default(cuid())
  name          String
  slug          String    @unique
  description   String?
  imageUrl      String?   @map("image_url")
  
  items         CollectionItem[]
  
  createdAt     DateTime  @default(now()) @map("created_at")
  
  @@map("collections")
}

model CollectionItem {
  id            String    @id @default(cuid())
  collectionId  String    @map("collection_id")
  itemType      String    @map("item_type")
  itemId        String    @map("item_id")
  order         Int       @default(0)
  
  collection    Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  
  @@unique([collectionId, itemType, itemId])
  @@map("collection_items")
}
```

#### Features:
```
- Create collections (admin)
- Add/remove items
- Collection page
- Homepage collections carousel
```

#### Done Criteria:
- [ ] Collection model
- [ ] Admin CRUD
- [ ] Collection page
- [ ] Homepage display

---

### Task 12.6.3: Create Trending/Popular

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 12.6.2 complete

#### Implementation:
```typescript
class TrendingService {
  /**
   * Calculate trending score based on recent activity
   */
  async calculateTrendingScore(itemId: string): Promise<number> {
    const now = new Date();
    const weekAgo = subDays(now, 7);
    
    // Recent downloads (weighted)
    const recentDownloads = await prisma.installation.count({
      where: {
        itemId,
        installedAt: { gte: weekAgo }
      }
    });
    
    // Recent reviews
    const recentReviews = await prisma.review.count({
      where: {
        itemId,
        createdAt: { gte: weekAgo }
      }
    });
    
    // Calculate score
    return (recentDownloads * 2) + (recentReviews * 5);
  }
  
  /**
   * Get trending items
   */
  async getTrending(limit: number = 10): Promise<MarketplaceItem[]> {
    // Either calculated on-the-fly or from cached scores
    // ...
  }
}
```

#### Done Criteria:
- [ ] Trending algorithm
- [ ] Popular by downloads
- [ ] Time-weighted scoring

---

## ✅ Phase 12 Completion Checklist

### Marketplace Models
- [ ] Purchase model
- [ ] Review model
- [ ] Installation model
- [ ] Types defined

### Marketplace Service
- [ ] Browse/search
- [ ] Purchase flow
- [ ] Install flow
- [ ] Review system
- [ ] API endpoints

### Public Marketplace UI
- [ ] Browse page
- [ ] Search + filters
- [ ] Item detail
- [ ] Developer profile
- [ ] Reviews UI

### Purchase Flow
- [ ] Checkout
- [ ] Confirmation
- [ ] Purchase history
- [ ] Stripe webhooks

### Install Flow
- [ ] Install modal
- [ ] Installed items page
- [ ] Update flow

### Collections & Discovery
- [ ] Featured section
- [ ] Collections
- [ ] Trending/popular

---

## 📊 Task Summary

| Section | Tasks | Estimated Time |
|---------|-------|----------------|
| Marketplace Models | 4 | 85 min |
| Marketplace Service | 5 | 185 min |
| Public Marketplace UI | 5 | 180 min |
| Purchase Flow | 4 | 105 min |
| Install Flow | 3 | 90 min |
| Collections & Discovery | 3 | 90 min |
| **Total** | **24** | **~12-13 hours** |

---

**When complete:** Full marketplace operational! Update CURRENT-STATE.md and celebrate 🎉
