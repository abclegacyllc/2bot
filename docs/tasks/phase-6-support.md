# Phase 6: Support System

> **Goal:** Build comprehensive customer support system with FAQ, tickets, chat, and support dashboard
> **Estimated Sessions:** 12-15
> **Prerequisites:** Phase 5 complete

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Knowledge Base** ||||
| 6.1.1 | Create KBArticle model | ⬜ | |
| 6.1.2 | Create KB service + API | ⬜ | |
| 6.1.3 | Create KB article list UI (user) | ⬜ | |
| 6.1.4 | Create KB article view UI (user) | ⬜ | |
| **Ticket System** ||||
| 6.2.1 | Create SupportTicket + TicketMessage models | ⬜ | |
| 6.2.2 | Create ticket service + API | ⬜ | |
| 6.2.3 | Create context capture utility | ⬜ | |
| 6.2.4 | Create ticket submission UI | ⬜ | |
| 6.2.5 | Create user ticket list/detail UI | ⬜ | |
| **Support Button** ||||
| 6.3.1 | Create QuickIssue model + seed data | ⬜ | |
| 6.3.2 | Create support button component | ⬜ | |
| 6.3.3 | Create support modal (tabbed) | ⬜ | |
| **Support Dashboard** ||||
| 6.4.1 | Create support dashboard layout | ⬜ | |
| 6.4.2 | Create ticket queue page | ⬜ | |
| 6.4.3 | Create ticket detail + reply UI | ⬜ | |
| 6.4.4 | Create user lookup page | ⬜ | |
| 6.4.5 | Create KB editor page | ⬜ | |
| **--- CHECKPOINT: Core Support Complete ---** ||||
| **Chat Support (Optional for MVP)** ||||
| 6.5.1 | Create ChatSession + ChatMessage models | ⬜ | Optional |
| 6.5.2 | Create AI chat service | ⬜ | Optional |
| 6.5.3 | Create chat UI (user side) | ⬜ | Optional |
| 6.5.4 | Create chat queue (support side) | ⬜ | Optional |
| 6.5.5 | Implement human handoff flow | ⬜ | Optional |
| **Future Enhancements** ||||
| 6.6.1 | Create ScheduledCall model | ⬜ | Future |
| 6.6.2 | Create call scheduling UI | ⬜ | Future |

---

## 📝 Detailed Tasks

### Task 6.1.1: Create KBArticle Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Phase 5 complete

#### Context Files:
- prisma/schema.prisma

#### Schema:
```prisma
// ===========================================
// Knowledge Base Article (Phase 6: Support)
// ===========================================
model KBArticle {
  id            String    @id @default(cuid())
  slug          String    @unique
  title         String
  content       String    @db.Text  // Markdown content
  excerpt       String?   // Short summary for list view
  category      String    // getting_started, gateways, plugins, billing, troubleshooting
  
  // Search & Discovery
  tags          String[]  // Array of tags for filtering
  viewCount     Int       @default(0) @map("view_count")
  helpfulCount  Int       @default(0) @map("helpful_count")
  notHelpfulCount Int     @default(0) @map("not_helpful_count")
  
  // Status
  isPublished   Boolean   @default(false) @map("is_published")
  
  // Timestamps
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  publishedAt   DateTime? @map("published_at")
  
  // Author (support/admin user)
  authorId      String    @map("author_id")
  author        User      @relation("KBArticleAuthor", fields: [authorId], references: [id])
  
  @@index([slug])
  @@index([category])
  @@index([isPublished])
  @@index([viewCount])
  @@map("kb_articles")
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] KBArticle table exists
- [ ] Relation to User (author) working
- [ ] Indexes created

---

### Task 6.1.2: Create KB Service + API

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.1.1 complete

#### Deliverables:
- [ ] src/modules/support/kb.service.ts
- [ ] src/modules/support/kb.types.ts
- [ ] src/server/routes/kb.ts

#### Service Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';

class KBService {
  // Public endpoints (no auth required)
  async getPublishedArticles(filters?: KBFilters): Promise<KBArticle[]>
  async getArticleBySlug(slug: string): Promise<KBArticle | null>
  async searchArticles(query: string): Promise<KBArticle[]>
  async incrementViewCount(id: string): Promise<void>
  async recordFeedback(id: string, helpful: boolean): Promise<void>
  
  // Admin/Support endpoints (require auth + role)
  async createArticle(ctx: ServiceContext, data: CreateKBArticleRequest): Promise<KBArticle>
  async updateArticle(ctx: ServiceContext, id: string, data: UpdateKBArticleRequest): Promise<KBArticle>
  async deleteArticle(ctx: ServiceContext, id: string): Promise<void>
  async publishArticle(ctx: ServiceContext, id: string): Promise<KBArticle>
  async unpublishArticle(ctx: ServiceContext, id: string): Promise<KBArticle>
  async getAllArticles(ctx: ServiceContext): Promise<KBArticle[]> // Include unpublished
}
```

#### API Endpoints:
```typescript
// Public (no auth)
GET  /api/kb/articles              // List published articles
GET  /api/kb/articles/:slug        // Get article by slug
GET  /api/kb/search?q=query        // Search articles
POST /api/kb/articles/:id/feedback // Record helpful/not helpful

// Support/Admin (requires support:kb:read permission)
GET  /api/support/kb/articles      // All articles including drafts
POST /api/support/kb/articles      // Create article (support:kb:write)
PUT  /api/support/kb/articles/:id  // Update article (support:kb:write)
DELETE /api/support/kb/articles/:id // Delete article (support:kb:write)
POST /api/support/kb/articles/:id/publish   // Publish
POST /api/support/kb/articles/:id/unpublish // Unpublish
```

#### Done Criteria:
- [ ] Public endpoints work without auth
- [ ] Admin endpoints require proper role
- [ ] Search works (title, content, tags)
- [ ] View count increments
- [ ] Feedback recording works

---

### Task 6.1.3: Create KB Article List UI (User)

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.1.2 complete

#### Deliverables:
- [ ] src/app/(public)/help/page.tsx
- [ ] src/components/support/kb-article-card.tsx
- [ ] src/components/support/kb-category-filter.tsx

#### UI Structure:
```
┌─────────────────────────────────────────────────────────┐
│  Help Center                                            │
├─────────────────────────────────────────────────────────┤
│  [🔍 Search articles...]                                │
├─────────────────────────────────────────────────────────┤
│  Categories: [All] [Getting Started] [Gateways] ...     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Article Title   │  │ Article Title   │              │
│  │ Short excerpt...│  │ Short excerpt...│              │
│  │ 👁 123 views    │  │ 👁 456 views    │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

#### Features:
- Search input with debounce
- Category filter tabs/buttons
- Article cards with title, excerpt, view count
- Click to view full article
- Responsive grid layout

#### Done Criteria:
- [ ] Lists published articles
- [ ] Search filters results
- [ ] Category filter works
- [ ] Links to article detail
- [ ] Mobile responsive

---

### Task 6.1.4: Create KB Article View UI (User)

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.1.3 complete

#### Deliverables:
- [ ] src/app/(public)/help/[slug]/page.tsx
- [ ] src/components/support/kb-article-content.tsx
- [ ] src/components/support/kb-feedback.tsx

#### UI Structure:
```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Help Center                                  │
├─────────────────────────────────────────────────────────┤
│  Category: Gateways                                     │
│                                                         │
│  # Article Title                                        │
│                                                         │
│  Markdown content rendered here...                      │
│  - Lists                                                │
│  - Code blocks                                          │
│  - Images                                               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Was this article helpful?                              │
│  [👍 Yes]  [👎 No]                                      │
│                                                         │
│  Related Articles:                                      │
│  - Related article 1                                    │
│  - Related article 2                                    │
└─────────────────────────────────────────────────────────┘
```

#### Features:
- Markdown rendering (react-markdown)
- Syntax highlighting for code blocks
- "Was this helpful?" feedback buttons
- Related articles (same category)
- Back navigation

#### Done Criteria:
- [ ] Renders markdown properly
- [ ] Code blocks have syntax highlighting
- [ ] Feedback buttons work
- [ ] View count increments on load
- [ ] Related articles shown

---

### Task 6.2.1: Create SupportTicket + TicketMessage Models

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.1.4 complete

#### Schema:
```prisma
// ===========================================
// Support Ticket (Phase 6: Support)
// ===========================================
model SupportTicket {
  id            String    @id @default(cuid())
  ticketNumber  String    @unique @map("ticket_number") // TICKET-0001
  userId        String    @map("user_id")
  
  // Ticket Info
  type          String    // bug, question, billing, feature_request, other
  category      String    // gateway, plugin, billing, account, other
  severity      String    @default("medium") // low, medium, high, critical
  title         String
  description   String    @db.Text
  
  // Auto-captured Context (JSON)
  contextData   Json      @default("{}") @map("context_data")
  // Structure: { url, browser, os, screenSize, recentActions, gatewayStatus, errorLogs }
  
  // Optional Attachments
  screenshotUrl String?   @map("screenshot_url")
  attachments   Json      @default("[]") // Array of { name, url, size }
  
  // Status & Assignment
  status        String    @default("open") // open, in_progress, waiting_user, resolved, closed
  priority      Int       @default(0) // For queue ordering (higher = more urgent)
  assignedToId  String?   @map("assigned_to_id")
  
  // Resolution
  resolution    String?   @db.Text
  resolvedAt    DateTime? @map("resolved_at")
  
  // Linked Resources
  relatedArticleId String? @map("related_article_id")
  sentryEventId    String? @map("sentry_event_id")
  
  // Timestamps
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  // Relations
  user          User      @relation("UserTickets", fields: [userId], references: [id])
  assignedTo    User?     @relation("AssignedTickets", fields: [assignedToId], references: [id])
  messages      TicketMessage[]
  
  @@index([userId])
  @@index([status])
  @@index([assignedToId])
  @@index([type])
  @@index([priority])
  @@index([createdAt])
  @@map("support_tickets")
}

// ===========================================
// Ticket Message (Conversation Thread)
// ===========================================
model TicketMessage {
  id            String    @id @default(cuid())
  ticketId      String    @map("ticket_id")
  senderId      String    @map("sender_id")
  
  content       String    @db.Text
  isInternal    Boolean   @default(false) @map("is_internal") // Internal notes (support only)
  
  // Attachments
  attachments   Json      @default("[]") // Array of { name, url }
  
  createdAt     DateTime  @default(now()) @map("created_at")
  
  // Relations
  ticket        SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  sender        User      @relation("TicketMessageSender", fields: [senderId], references: [id])
  
  @@index([ticketId])
  @@index([senderId])
  @@map("ticket_messages")
}
```

#### Also update User model relations:
```prisma
// Add to User model:
tickets          SupportTicket[] @relation("UserTickets")
assignedTickets  SupportTicket[] @relation("AssignedTickets")
ticketMessages   TicketMessage[] @relation("TicketMessageSender")
kbArticles       KBArticle[]     @relation("KBArticleAuthor")
```

#### Done Criteria:
- [ ] Migration applied
- [ ] SupportTicket table exists
- [ ] TicketMessage table exists
- [ ] User relations working
- [ ] Auto-increment ticket number working

---

### Task 6.2.2: Create Ticket Service + API

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 6.2.1 complete

#### Deliverables:
- [ ] src/modules/support/ticket.service.ts
- [ ] src/modules/support/ticket.types.ts
- [ ] src/server/routes/ticket.ts

#### Service Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';
import { auditActions } from '@/lib/audit';

class TicketService {
  // User endpoints
  async createTicket(ctx: ServiceContext, data: CreateTicketRequest): Promise<SupportTicket>
  async getUserTickets(ctx: ServiceContext): Promise<SupportTicket[]>
  async getTicketById(ctx: ServiceContext, id: string): Promise<SupportTicket | null>
  async addMessage(ctx: ServiceContext, ticketId: string, content: string): Promise<TicketMessage>
  
  // Support endpoints
  async getAllTickets(ctx: ServiceContext, filters?: TicketFilters): Promise<PaginatedTickets>
  async getMyAssignedTickets(ctx: ServiceContext): Promise<SupportTicket[]>
  async assignTicket(ctx: ServiceContext, ticketId: string, assigneeId: string): Promise<SupportTicket>
  async updateTicketStatus(ctx: ServiceContext, ticketId: string, status: string): Promise<SupportTicket>
  async addInternalNote(ctx: ServiceContext, ticketId: string, content: string): Promise<TicketMessage>
  async resolveTicket(ctx: ServiceContext, ticketId: string, resolution: string): Promise<SupportTicket>
  async linkArticle(ctx: ServiceContext, ticketId: string, articleId: string): Promise<SupportTicket>
  
  // Helpers
  private async generateTicketNumber(): Promise<string> // TICKET-0001, TICKET-0002, etc.
}
```

#### API Endpoints:
```typescript
// User endpoints (require auth)
POST /api/tickets                   // Create ticket
GET  /api/tickets                   // List user's tickets
GET  /api/tickets/:id               // Get ticket detail
POST /api/tickets/:id/messages      // Add message to ticket

// Support endpoints (require support:tickets:read/write)
GET  /api/support/tickets           // All tickets with filters
GET  /api/support/tickets/assigned  // My assigned tickets
GET  /api/support/tickets/:id       // Get ticket (includes internal notes)
PUT  /api/support/tickets/:id       // Update ticket (status, priority, assignee)
POST /api/support/tickets/:id/assign    // Assign ticket
POST /api/support/tickets/:id/resolve   // Resolve ticket
POST /api/support/tickets/:id/internal  // Add internal note
POST /api/support/tickets/:id/link-article // Link KB article
```

#### Done Criteria:
- [ ] User can create tickets
- [ ] User can view own tickets only
- [ ] Support can view all tickets
- [ ] Assignment works
- [ ] Status updates work
- [ ] Internal notes hidden from users
- [ ] Audit logging for important actions

---

### Task 6.2.3: Create Context Capture Utility

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.2.2 complete

#### Deliverables:
- [ ] src/lib/capture-context.ts
- [ ] src/hooks/use-ticket-context.ts

#### Implementation:
```typescript
// src/lib/capture-context.ts

interface CapturedContext {
  // Page info
  url: string;
  referrer: string;
  
  // Browser/Device
  browser: string;
  browserVersion: string;
  os: string;
  screenSize: string;
  language: string;
  
  // Timestamp
  timestamp: string;
  timezone: string;
  
  // App State (from API calls)
  recentActions?: Array<{
    action: string;
    timestamp: string;
  }>;
  gatewayStatuses?: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
  
  // Error Context (if from error boundary)
  errorMessage?: string;
  errorStack?: string;
  componentStack?: string;
}

export async function captureContext(): Promise<CapturedContext> {
  // 1. Get browser/device info from navigator
  // 2. Fetch recent audit log entries for user (last 10)
  // 3. Fetch gateway statuses
  // 4. Return structured context
}

export function captureBrowserInfo(): Partial<CapturedContext> {
  // Synchronous browser info only (for immediate capture)
}
```

#### Hook Usage:
```typescript
// src/hooks/use-ticket-context.ts
export function useTicketContext() {
  const [context, setContext] = useState<CapturedContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const capture = useCallback(async () => {
    setIsLoading(true);
    const ctx = await captureContext();
    setContext(ctx);
    setIsLoading(false);
    return ctx;
  }, []);
  
  return { context, capture, isLoading };
}
```

#### Done Criteria:
- [ ] Captures browser/device info
- [ ] Fetches recent user actions
- [ ] Fetches gateway statuses
- [ ] Works in error boundary context
- [ ] Privacy-safe (no sensitive data)

---

### Task 6.2.4: Create Ticket Submission UI

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 6.2.3 complete

#### Deliverables:
- [ ] src/components/support/ticket-form.tsx
- [ ] src/components/support/quick-issue-selector.tsx
- [ ] src/components/support/context-preview.tsx

#### UI Structure:
```
┌─────────────────────────────────────────────────────────┐
│  Submit a Support Ticket                                │
├─────────────────────────────────────────────────────────┤
│  Common Issues (click to auto-fill):                    │
│  [Gateway not connecting] [Billing question] [Bug]      │
├─────────────────────────────────────────────────────────┤
│  Type: [Bug ▼]  Category: [Gateway ▼]                   │
│                                                         │
│  Title: [_________________________________]             │
│                                                         │
│  Description:                                           │
│  [                                                    ] │
│  [                                                    ] │
│                                                         │
│  ☑ Include browser & session info                       │
│  ☐ Include screenshot                                   │
│                                                         │
│  Context Preview: ▼                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Browser: Chrome 120 | OS: macOS                 │   │
│  │ Page: /dashboard/gateways                       │   │
│  │ Recent: Gateway created, Login...               │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│                              [Cancel] [Submit Ticket]   │
└─────────────────────────────────────────────────────────┘
```

#### Features:
- Quick issue buttons (pre-fill type/category)
- Type dropdown (bug, question, billing, feature_request, other)
- Category dropdown (gateway, plugin, billing, account, other)
- Title input (required)
- Description textarea (required)
- Context inclusion toggle (default: on)
- Context preview (expandable)
- Screenshot capture (optional, uses html2canvas)

#### Done Criteria:
- [ ] Form validation works
- [ ] Quick issues auto-fill form
- [ ] Context captured and previewed
- [ ] Screenshot capture works
- [ ] Submits to API
- [ ] Shows success message

---

### Task 6.2.5: Create User Ticket List/Detail UI

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 6.2.4 complete

#### Deliverables:
- [ ] src/app/(dashboard)/support/page.tsx (user's tickets list)
- [ ] src/app/(dashboard)/support/[id]/page.tsx (ticket detail)
- [ ] src/components/support/ticket-status-badge.tsx
- [ ] src/components/support/ticket-conversation.tsx

#### List UI:
```
┌─────────────────────────────────────────────────────────┐
│  My Support Tickets                    [+ New Ticket]   │
├─────────────────────────────────────────────────────────┤
│  Filter: [All ▼]                                        │
├─────────────────────────────────────────────────────────┤
│  #TICKET-0042 | Gateway not connecting                  │
│  🟡 In Progress | Bug | 2 hours ago                     │
│  ───────────────────────────────────────────────────── │
│  #TICKET-0041 | How do I upgrade my plan?               │
│  🟢 Resolved | Question | 3 days ago                    │
└─────────────────────────────────────────────────────────┘
```

#### Detail UI:
```
┌─────────────────────────────────────────────────────────┐
│  ← Back   #TICKET-0042                                  │
├─────────────────────────────────────────────────────────┤
│  Gateway not connecting                                 │
│  Status: 🟡 In Progress | Type: Bug | Created: 2h ago   │
├─────────────────────────────────────────────────────────┤
│  You (2 hours ago):                                     │
│  My Telegram bot gateway shows disconnected...          │
│  ─────────────────────────────────────────────────────  │
│  Support (1 hour ago):                                  │
│  Thanks for reporting. Can you try reconnecting...      │
├─────────────────────────────────────────────────────────┤
│  [Reply to this ticket...]                              │
│                                          [Send Reply]   │
└─────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [ ] Shows user's tickets only
- [ ] Status badges colored
- [ ] Can filter by status
- [ ] Click opens detail
- [ ] Conversation thread displayed
- [ ] Can reply to ticket

---

### Task 6.3.1: Create QuickIssue Model + Seed Data

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.2.5 complete

#### Schema:
```prisma
// ===========================================
// Quick Issue Templates (Phase 6: Support)
// ===========================================
model QuickIssue {
  id            String    @id @default(cuid())
  title         String    // "Gateway not connecting"
  description   String?   // Brief help text
  
  // Auto-fill values
  suggestedType     String @map("suggested_type")     // bug, question, etc.
  suggestedCategory String @map("suggested_category") // gateway, billing, etc.
  
  // Link to KB Article (if exists)
  articleSlug   String?   @map("article_slug")
  
  // Usage tracking
  useCount      Int       @default(0) @map("use_count")
  
  // Display
  icon          String?   // Emoji or icon name
  sortOrder     Int       @default(0) @map("sort_order")
  isActive      Boolean   @default(true) @map("is_active")
  
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  @@index([isActive])
  @@index([sortOrder])
  @@map("quick_issues")
}
```

#### Seed Data:
```typescript
const quickIssues = [
  {
    title: "Gateway not connecting",
    description: "Telegram bot or AI gateway won't connect",
    suggestedType: "bug",
    suggestedCategory: "gateway",
    icon: "🔌",
    sortOrder: 1,
  },
  {
    title: "Billing question",
    description: "Questions about plans, payments, or invoices",
    suggestedType: "question",
    suggestedCategory: "billing",
    icon: "💳",
    sortOrder: 2,
  },
  {
    title: "Feature request",
    description: "Suggest a new feature or improvement",
    suggestedType: "feature_request",
    suggestedCategory: "other",
    icon: "💡",
    sortOrder: 3,
  },
  {
    title: "Plugin not working",
    description: "Issues with installed plugins",
    suggestedType: "bug",
    suggestedCategory: "plugin",
    icon: "🧩",
    sortOrder: 4,
  },
  {
    title: "Account issue",
    description: "Login problems, profile, or settings",
    suggestedType: "question",
    suggestedCategory: "account",
    icon: "👤",
    sortOrder: 5,
  },
  {
    title: "Report a bug",
    description: "Something isn't working as expected",
    suggestedType: "bug",
    suggestedCategory: "other",
    icon: "🐛",
    sortOrder: 6,
  },
];
```

#### Done Criteria:
- [ ] Migration applied
- [ ] QuickIssue table exists
- [ ] Seed data inserted
- [ ] API endpoint to fetch active quick issues

---

### Task 6.3.2: Create Support Button Component

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.3.1 complete

#### Deliverables:
- [ ] src/components/support/support-button.tsx
- [ ] Add to dashboard layout

#### Implementation:
```tsx
// src/components/support/support-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircleQuestion } from 'lucide-react';
import { SupportModal } from './support-modal';

export function SupportButton() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      {/* Floating button - bottom right */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
      >
        <MessageCircleQuestion className="h-6 w-6" />
        <span className="sr-only">Get Support</span>
      </Button>
      
      <SupportModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
```

#### Placement:
```tsx
// In src/app/(dashboard)/layout.tsx
import { SupportButton } from '@/components/support/support-button';

export default function DashboardLayout({ children }) {
  return (
    <div>
      {/* ... existing layout */}
      {children}
      <SupportButton />
    </div>
  );
}
```

#### Done Criteria:
- [ ] Button visible on all dashboard pages
- [ ] Fixed position bottom-right
- [ ] Opens support modal on click
- [ ] Accessible (screen reader label)
- [ ] Mobile friendly

---

### Task 6.3.3: Create Support Modal (Tabbed)

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.3.2 complete

#### Deliverables:
- [ ] src/components/support/support-modal.tsx
- [ ] src/components/support/tabs/faq-tab.tsx
- [ ] src/components/support/tabs/ticket-tab.tsx
- [ ] src/components/support/tabs/chat-tab.tsx (placeholder)
- [ ] src/components/support/tabs/call-tab.tsx (placeholder)

#### Modal Structure:
```tsx
// src/components/support/support-modal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Book, MessageSquare, Ticket, Phone } from 'lucide-react';

export function SupportModal({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Support</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="faq" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="faq">
              <Book className="h-4 w-4 mr-2" />
              FAQ
            </TabsTrigger>
            <TabsTrigger value="ticket">
              <Ticket className="h-4 w-4 mr-2" />
              Ticket
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="call" disabled>
              <Phone className="h-4 w-4 mr-2" />
              Call
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="faq">
            <FAQTab onOpenArticle={...} />
          </TabsContent>
          
          <TabsContent value="ticket">
            <TicketTab onSuccess={() => onOpenChange(false)} />
          </TabsContent>
          
          <TabsContent value="chat">
            <ChatTabPlaceholder />
          </TabsContent>
          
          <TabsContent value="call">
            <CallTabPlaceholder />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

#### FAQ Tab:
```tsx
// Search bar
// Popular articles (by view count)
// Quick issue buttons that link to articles
// "Can't find answer? Submit a ticket" link
```

#### Ticket Tab:
```tsx
// Quick issue buttons
// Ticket form (from Task 6.2.4)
// Recent tickets list (collapsible)
```

#### Chat Tab (Placeholder):
```tsx
// "Coming soon" message
// Or basic AI chat interface (Phase 6.5)
```

#### Done Criteria:
- [ ] Tabs switch smoothly
- [ ] FAQ tab shows articles + search
- [ ] Ticket tab has form
- [ ] Chat tab shows placeholder (or AI chat if Phase 6.5 done)
- [ ] Call tab disabled/coming soon
- [ ] Mobile responsive
- [ ] Closes on successful ticket submit

---

### Task 6.4.1: Create Support Dashboard Layout

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.3.3 complete

#### Deliverables:
- [ ] src/app/(support)/layout.tsx
- [ ] src/app/(support)/support-dashboard/page.tsx
- [ ] src/components/support/dashboard/support-nav.tsx

#### Route Structure:
```
/support-dashboard           - Dashboard home
/support-dashboard/tickets   - Ticket queue
/support-dashboard/tickets/[id] - Ticket detail
/support-dashboard/users     - User lookup
/support-dashboard/kb        - KB articles management
/support-dashboard/kb/new    - Create article
/support-dashboard/kb/[id]/edit - Edit article
```

#### Access Control:
```typescript
// src/app/(support)/layout.tsx
import { requireRole } from '@/server/middleware/role';

// Middleware or layout check
// Requires: SUPPORT, ADMIN, or SUPER_ADMIN role
```

#### Dashboard Home Stats:
```tsx
interface SupportStats {
  tickets: {
    open: number;
    inProgress: number;
    waitingUser: number;
    resolvedToday: number;
    avgResponseTime: string; // "2h 15m"
  };
  articles: {
    total: number;
    published: number;
    drafts: number;
  };
}
```

#### Sidebar Navigation:
```
📊 Dashboard
👥 Users
🎫 Tickets
   ├─ All Tickets
   ├─ My Tickets
   └─ Unassigned
📚 Knowledge Base
   ├─ All Articles
   └─ New Article
💬 Chats (Phase 6.5)
📞 Calls (Future)
⚙️ Settings
```

#### Done Criteria:
- [ ] Only accessible by support+ roles
- [ ] Sidebar navigation works
- [ ] Dashboard stats displayed
- [ ] Responsive layout

---

### Task 6.4.2: Create Ticket Queue Page

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 6.4.1 complete

#### Deliverables:
- [ ] src/app/(support)/support-dashboard/tickets/page.tsx
- [ ] src/components/support/dashboard/ticket-table.tsx
- [ ] src/components/support/dashboard/ticket-filters.tsx

#### UI Structure:
```
┌─────────────────────────────────────────────────────────────────────┐
│  Tickets                                         [Refresh] [Export] │
├─────────────────────────────────────────────────────────────────────┤
│  Filters:                                                           │
│  Status: [All ▼]  Type: [All ▼]  Assigned: [All ▼]  Search: [___]  │
├─────────────────────────────────────────────────────────────────────┤
│  □ | # | User | Title | Type | Status | Priority | Assigned | Time │
│  ──────────────────────────────────────────────────────────────────│
│  □ | 42| user@..| Gateway... | Bug | 🟡 In Prog | ⬆ High | Me | 2h │
│  □ | 41| user@..| Billing... | Q | 🟢 Resolved | - | John | 3d │
│  □ | 40| user@..| Feature... | FR | 🔵 Open | - | - | 5d │
├─────────────────────────────────────────────────────────────────────┤
│  Bulk Actions: [Assign to me] [Change Status ▼]                     │
│  Showing 1-20 of 156 tickets              [< Prev] [1] [2] [Next >] │
└─────────────────────────────────────────────────────────────────────┘
```

#### Features:
- Sortable columns
- Filter by status, type, assignee, date range
- Search by ticket number, title, user email
- Bulk actions (assign, change status)
- Pagination
- Click row to open detail

#### Done Criteria:
- [ ] Lists all tickets
- [ ] Filters work
- [ ] Sorting works
- [ ] Bulk actions work
- [ ] Pagination works
- [ ] Links to ticket detail

---

### Task 6.4.3: Create Ticket Detail + Reply UI

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.4.2 complete

#### Deliverables:
- [ ] src/app/(support)/support-dashboard/tickets/[id]/page.tsx
- [ ] src/components/support/dashboard/ticket-detail-header.tsx
- [ ] src/components/support/dashboard/ticket-conversation-support.tsx
- [ ] src/components/support/dashboard/ticket-sidebar.tsx
- [ ] src/components/support/dashboard/ticket-reply-form.tsx

#### UI Structure:
```
┌────────────────────────────────────────────────────────────────────────┐
│  ← Back to Queue   #TICKET-0042                        [Actions ▼]    │
├──────────────────────────────────────────────┬─────────────────────────┤
│                                              │ Status:                 │
│  Gateway not connecting                      │ [In Progress ▼]         │
│  ─────────────────────────────────────────── │                         │
│  User (john@example.com) - 2 hours ago       │ Priority:               │
│  My Telegram bot gateway shows as            │ [High ▼]                │
│  disconnected and I can't send messages...   │                         │
│                                              │ Assigned:               │
│  ─────────────────────────────────────────── │ [Select agent ▼]        │
│  You - 1 hour ago                            │                         │
│  Thanks for reporting this. Can you try      │ ─────────────────────── │
│  reconnecting the gateway from the settings? │ User Info:              │
│                                              │ 📧 john@example.com     │
│  ─────────────────────────────────────────── │ 📋 Pro Plan             │
│  🔒 Internal Note - 30 mins ago              │ 📅 Since Jan 2026       │
│  Checked their gateway - token is valid.     │ 🎫 3 total tickets      │
│  Might be Telegram API issue.                │                         │
│                                              │ ─────────────────────── │
├──────────────────────────────────────────────│ Context:                │
│  [Reply] [Internal Note]                     │ 🌐 Chrome 120 / macOS   │
│  ┌────────────────────────────────────────┐ │ 📄 /dashboard/gateways  │
│  │                                        │ │                         │
│  │                                        │ │ Gateways:               │
│  └────────────────────────────────────────┘ │ 🔴 TG Bot - Error       │
│  [Canned Responses ▼]          [Send Reply] │ 🟢 OpenAI - Connected   │
│                                              │                         │
│                                              │ Quick Actions:          │
│                                              │ [📚 Link Article]       │
│                                              │ [🔗 View in Sentry]     │
│                                              │ [✓ Resolve Ticket]      │
└──────────────────────────────────────────────┴─────────────────────────┘
```

#### Features:
- Full conversation thread
- Internal notes (yellow background, support only)
- Reply vs Internal Note toggle
- Status/Priority/Assignee dropdowns
- User info sidebar
- Context data display (browser, page, gateways)
- Link to KB article action
- Resolve ticket action
- Canned responses (future enhancement)

#### Done Criteria:
- [ ] Shows full conversation
- [ ] Can send reply (visible to user)
- [ ] Can add internal note (support only)
- [ ] Can change status/priority/assignee
- [ ] Context data displayed
- [ ] Can resolve ticket
- [ ] Can link KB article

---

### Task 6.4.4: Create User Lookup Page

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.4.3 complete

#### Deliverables:
- [ ] src/app/(support)/support-dashboard/users/page.tsx
- [ ] src/components/support/dashboard/user-search.tsx
- [ ] src/components/support/dashboard/user-detail-modal.tsx

#### UI Structure:
```
┌─────────────────────────────────────────────────────────────────────┐
│  User Lookup                                                        │
├─────────────────────────────────────────────────────────────────────┤
│  Search: [user@example.com________________] [Search]                │
├─────────────────────────────────────────────────────────────────────┤
│  Results:                                                           │
│  ───────────────────────────────────────────────────────────────── │
│  📧 john@example.com | Pro Plan | 3 gateways | 5 tickets           │
│  📧 jane@example.com | Free Plan | 1 gateway | 2 tickets           │
└─────────────────────────────────────────────────────────────────────┘
```

#### User Detail Modal:
```
┌─────────────────────────────────────────────────────────────────────┐
│  User: john@example.com                                         ✕   │
├─────────────────────────────────────────────────────────────────────┤
│  Account Info:                                                      │
│  • Name: John Doe                                                   │
│  • Plan: Pro                                                        │
│  • Role: Member                                                     │
│  • Joined: Jan 10, 2026                                            │
│  • Last Login: 2 hours ago                                         │
│                                                                     │
│  Gateways (3):                                                      │
│  • 🔴 My Telegram Bot - Error (last error: 2h ago)                 │
│  • 🟢 OpenAI GPT - Connected                                       │
│  • 🟢 Anthropic Claude - Connected                                 │
│                                                                     │
│  Recent Tickets (5):                                                │
│  • #42 Gateway not connecting (In Progress)                        │
│  • #38 How to configure AI? (Resolved)                             │
│                                                                     │
│  Actions:                                                           │
│  [View All Tickets] [View Audit Log]                               │
└─────────────────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [ ] Search by email works
- [ ] Shows user list results
- [ ] Click opens detail modal
- [ ] Shows user's gateways
- [ ] Shows user's tickets
- [ ] Links to full ticket list

---

### Task 6.4.5: Create KB Editor Page

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 6.4.4 complete

#### Deliverables:
- [ ] src/app/(support)/support-dashboard/kb/page.tsx (list)
- [ ] src/app/(support)/support-dashboard/kb/new/page.tsx (create)
- [ ] src/app/(support)/support-dashboard/kb/[id]/edit/page.tsx (edit)
- [ ] src/components/support/dashboard/kb-article-editor.tsx

#### List Page:
```
┌─────────────────────────────────────────────────────────────────────┐
│  Knowledge Base                                    [+ New Article]  │
├─────────────────────────────────────────────────────────────────────┤
│  Filter: [All ▼]  Status: [All ▼]  Search: [_______________]       │
├─────────────────────────────────────────────────────────────────────┤
│  Title | Category | Status | Views | Helpful | Updated             │
│  ───────────────────────────────────────────────────────────────── │
│  Getting Started | getting_started | 🟢 Published | 1.2k | 89% | 2d │
│  Connect Telegram | gateways | 🟢 Published | 856 | 92% | 5d        │
│  Draft Article | billing | 📝 Draft | - | - | 1h                    │
└─────────────────────────────────────────────────────────────────────┘
```

#### Editor Page:
```
┌─────────────────────────────────────────────────────────────────────┐
│  Edit Article                                [Preview] [Save Draft] │
├─────────────────────────────────────────────────────────────────────┤
│  Title: [Getting Started with 2Bot_________________________]       │
│  Slug: [getting-started_____________________________________]       │
│  Category: [Getting Started ▼]                                      │
│  Tags: [tutorial] [beginner] [+]                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Content (Markdown):                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ # Getting Started with 2Bot                                 │   │
│  │                                                             │   │
│  │ Welcome to 2Bot! This guide will help you...              │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│  Status: 📝 Draft                                                   │
│  [Publish Article] [Delete]                                        │
└─────────────────────────────────────────────────────────────────────┘
```

#### Features:
- Markdown editor with preview
- Auto-generate slug from title
- Category dropdown
- Tags input
- Save as draft
- Publish/Unpublish
- Delete confirmation

#### Done Criteria:
- [ ] Can create new article
- [ ] Can edit existing article
- [ ] Markdown preview works
- [ ] Can publish/unpublish
- [ ] Can delete article
- [ ] Auto-generates slug

---

## 🎯 CORE SUPPORT COMPLETE CHECKPOINT

> **After Task 6.4.5, core support system is fully functional:**
> - ✅ Knowledge Base with articles
> - ✅ Ticket system with user + support views
> - ✅ Support button modal (FAQ + Tickets tabs)
> - ✅ Support dashboard for agents
> 
> **Tasks 6.5.x (Chat Support) are optional enhancements.**
> Can be deferred if timeline is tight.

---

### Task 6.5.1: Create ChatSession + ChatMessage Models (Optional)

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.4.5 complete
**Priority:** Optional

#### Schema:
```prisma
// ===========================================
// Chat Support Models (Phase 6: Support - Optional)
// ===========================================
model ChatSession {
  id            String    @id @default(cuid())
  userId        String    @map("user_id")
  
  // Session Info
  type          String    @default("ai") // ai, human, escalated
  status        String    @default("active") // active, waiting, closed
  topic         String?   // Initial topic/question
  
  // Assignment (for human chats)
  assignedToId  String?   @map("assigned_to_id")
  
  // AI Context (for continuity)
  aiContext     Json      @default("{}") @map("ai_context")
  // Structure: { summary, lastTopics, sentiment }
  
  // Stats
  messageCount  Int       @default(0) @map("message_count")
  
  // Timestamps
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  closedAt      DateTime? @map("closed_at")
  
  // Relations
  user          User      @relation("UserChats", fields: [userId], references: [id])
  assignedTo    User?     @relation("AssignedChats", fields: [assignedToId], references: [id])
  messages      ChatMessage[]
  
  @@index([userId])
  @@index([status])
  @@index([assignedToId])
  @@map("chat_sessions")
}

model ChatMessage {
  id            String    @id @default(cuid())
  sessionId     String    @map("session_id")
  
  role          String    // user, assistant (AI), support (human agent)
  content       String    @db.Text
  
  // AI Metadata
  aiModel       String?   @map("ai_model")
  tokensUsed    Int?      @map("tokens_used")
  
  createdAt     DateTime  @default(now()) @map("created_at")
  
  // Relations
  session       ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  @@index([sessionId])
  @@map("chat_messages")
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] ChatSession table exists
- [ ] ChatMessage table exists
- [ ] Relations working

---

### Task 6.5.2: Create AI Chat Service (Optional)

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 6.5.1 complete
**Priority:** Optional

#### Deliverables:
- [ ] src/modules/support/chat.service.ts
- [ ] src/modules/support/chat.types.ts
- [ ] System prompt for support AI

#### Service Methods:
```typescript
class ChatService {
  // User endpoints
  async startSession(ctx: ServiceContext, topic?: string): Promise<ChatSession>
  async sendMessage(ctx: ServiceContext, sessionId: string, content: string): Promise<ChatMessage>
  async getSession(ctx: ServiceContext, sessionId: string): Promise<ChatSession>
  async getActiveSessions(ctx: ServiceContext): Promise<ChatSession[]>
  async closeSession(ctx: ServiceContext, sessionId: string): Promise<void>
  async requestHumanSupport(ctx: ServiceContext, sessionId: string): Promise<ChatSession>
  
  // Support endpoints
  async getWaitingChats(ctx: ServiceContext): Promise<ChatSession[]>
  async acceptChat(ctx: ServiceContext, sessionId: string): Promise<ChatSession>
  async sendSupportMessage(ctx: ServiceContext, sessionId: string, content: string): Promise<ChatMessage>
  
  // AI
  private async generateAIResponse(session: ChatSession, userMessage: string): Promise<string>
}
```

#### System Prompt:
```typescript
const SUPPORT_AI_PROMPT = `You are a helpful support assistant for 2Bot, 
a Telegram automation platform with AI integration.

Your role:
- Answer questions about using the platform
- Help troubleshoot common issues
- Guide users to relevant documentation
- Know when to escalate to human support

Platform features:
- Telegram Bot gateways
- AI gateways (OpenAI, Anthropic, etc.)
- Plugins for automation
- Analytics and monitoring

If you cannot help or the user is frustrated, offer to connect them with human support.`;
```

#### Done Criteria:
- [ ] Can start chat session
- [ ] AI responds to messages
- [ ] Context maintained across messages
- [ ] Can escalate to human
- [ ] Human support can respond

---

### Task 6.5.3: Create Chat UI (User Side) (Optional)

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 6.5.2 complete
**Priority:** Optional

#### Deliverables:
- [ ] Update src/components/support/tabs/chat-tab.tsx
- [ ] src/components/support/chat-interface.tsx
- [ ] src/components/support/chat-message.tsx

#### UI Structure:
```
┌─────────────────────────────────────────────────────────┐
│  Chat Support                      [Request Human Help] │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🤖 Hi! How can I help you today?               │   │
│  │                                                 │   │
│  │                 My gateway won't connect 👤    │   │
│  │                                                 │   │
│  │ 🤖 I can help with that! First, let's check   │   │
│  │    a few things...                             │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Type your message...                        ] [Send]  │
└─────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [ ] Chat interface in support modal
- [ ] Messages display in real-time
- [ ] AI responds (with typing indicator)
- [ ] Can request human support
- [ ] Shows when human takes over
- [ ] Persists conversation

---

### Task 6.5.4: Create Chat Queue (Support Side) (Optional)

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.5.3 complete
**Priority:** Optional

#### Deliverables:
- [ ] src/app/(support)/support-dashboard/chats/page.tsx
- [ ] src/components/support/dashboard/chat-queue.tsx
- [ ] src/components/support/dashboard/chat-window.tsx

#### Done Criteria:
- [ ] Shows waiting chats
- [ ] Can accept chat
- [ ] Chat window for conversation
- [ ] Real-time message updates

---

### Task 6.5.5: Implement Human Handoff Flow (Optional)

**Session Type:** Full-stack
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.5.4 complete
**Priority:** Optional

#### Features:
- User clicks "Request Human Help"
- Session status changes to "waiting"
- Appears in support queue
- Support accepts chat
- User notified of handoff
- Support can see AI conversation history

#### Done Criteria:
- [ ] User can request human
- [ ] Support sees in queue
- [ ] Accept assigns chat
- [ ] User sees "Connected to support"
- [ ] AI history visible to support

---

### Task 6.6.1: Create ScheduledCall Model (Future)

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Phase 6.5 complete
**Priority:** Future

#### Schema:
```prisma
// ===========================================
// Scheduled Calls (Phase 6: Support - Future)
// ===========================================
model ScheduledCall {
  id            String    @id @default(cuid())
  userId        String    @map("user_id")
  assignedToId  String?   @map("assigned_to_id")
  
  scheduledAt   DateTime  @map("scheduled_at")
  duration      Int       @default(30) // minutes
  topic         String?
  
  status        String    @default("scheduled") // scheduled, completed, cancelled, no_show
  notes         String?   @db.Text
  meetingUrl    String?   @map("meeting_url") // Zoom/Meet link
  
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  user          User      @relation("UserCalls", fields: [userId], references: [id])
  assignedTo    User?     @relation("AssignedCalls", fields: [assignedToId], references: [id])
  
  @@index([userId])
  @@index([assignedToId])
  @@index([scheduledAt])
  @@map("scheduled_calls")
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] Model exists for future use

---

### Task 6.6.2: Create Call Scheduling UI (Future)

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 6.6.1 complete
**Priority:** Future

#### Features:
- Calendar view for available slots
- User selects time slot
- Confirmation email sent
- Support sees scheduled calls
- Can cancel/reschedule

#### Done Criteria:
- [ ] Calendar picker works
- [ ] Can schedule call
- [ ] Confirmation sent
- [ ] Shows in support dashboard

---

## ✅ Phase 6 Completion Checklist

### Core Support (Required)
- [ ] KB articles model + API
- [ ] KB user UI (list + view)
- [ ] Ticket model + API
- [ ] Context capture utility
- [ ] Ticket user UI (submit + list + detail)
- [ ] Quick issues + support button
- [ ] Support modal (tabbed)
- [ ] Support dashboard layout
- [ ] Ticket queue + detail (support)
- [ ] User lookup
- [ ] KB editor

### Chat Support (Optional)
- [ ] Chat models
- [ ] AI chat service
- [ ] Chat UI (user)
- [ ] Chat queue (support)
- [ ] Human handoff

### Future
- [ ] Call scheduling model
- [ ] Call scheduling UI

**When complete:** Update CURRENT-STATE.md and AI-WORKFLOW.md

---

## 📌 Permissions Reference

Add to `src/shared/constants/permissions.ts`:

```typescript
support: {
  'support:tickets:read': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  'support:tickets:write': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  'support:tickets:assign': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  'support:chats:read': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  'support:chats:write': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  'support:users:read': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  'support:kb:read': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  'support:kb:write': ['ADMIN', 'SUPER_ADMIN'], // Only admins edit KB
},
```

---

## 📌 Notes

### Why This Phase Structure
- KB first: Users can self-serve before submitting tickets
- Tickets before chat: Async support is easier to scale
- Chat optional: AI chat requires OpenAI integration, can defer
- Calls future: High complexity, defer until user demand

### Integration Points
- **Error Boundaries (Phase 5.2.2):** Auto-open ticket form on crash
- **Sentry (Phase 5.3.1):** Link tickets to Sentry events
- **Audit Log (Phase 1.5):** Show recent actions in ticket context
- **Gateways (Phase 2):** Show gateway status in ticket context
