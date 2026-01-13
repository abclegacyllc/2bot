# Phase 2: Gateway System

> **Goal:** Implement Telegram Bot and AI gateways with full lifecycle management
> **Estimated Sessions:** 10-12
> **Prerequisites:** Phase 1.5 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| 2.1.1 | Create Gateway model | ⬜ | - |
| 2.1.2 | Create gateway types + validation | ⬜ | - |
| 2.1.3 | Create gateway service (CRUD) | ⬜ | - |
| 2.1.4 | Create gateway API endpoints | ⬜ | - |
| 2.2.1 | Create credential encryption utility | ⬜ | - |
| 2.2.2 | Create gateway registry pattern | ⬜ | - |
| 2.2.3 | Create base gateway interface | ⬜ | - |
| 2.3.1 | Implement Telegram Bot gateway | ⬜ | - |
| 2.3.2 | Create Telegram webhook handler | ⬜ | - |
| 2.3.3 | Implement AI gateway (OpenAI) | ⬜ | - |
| 2.4.1 | Create gateway list UI | ⬜ | - |
| 2.4.2 | Create add gateway UI | ⬜ | - |
| 2.4.3 | Create gateway detail/config UI | ⬜ | - |
| 2.4.4 | Create gateway status component | ⬜ | - |
| 2.5.1 | Create gateway test endpoint | ⬜ | - |

---

## 📝 Detailed Tasks

### Task 2.1.1: Create Gateway Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Phase 1 complete

#### Context Files:
- prisma/schema.prisma

#### Schema:
```prisma
model Gateway {
  id              String        @id @default(cuid())
  userId          String        @map("user_id")
  
  // Organization support (from Phase 1.5)
  organizationId  String?       @map("organization_id")
  
  name            String
  type            GatewayType
  status          GatewayStatus @default(DISCONNECTED)
  
  // Encrypted credentials (JSON string)
  credentialsEnc  String        @map("credentials_enc") @db.Text
  
  // Configuration (non-sensitive)
  config          Json          @default("{}")
  
  // Status tracking
  lastConnectedAt DateTime?     @map("last_connected_at")
  lastErrorAt     DateTime?     @map("last_error_at")
  lastError       String?       @map("last_error")
  
  // Timestamps
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")
  
  // Relations
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([organizationId])
  @@index([type])
  @@index([status])
  @@map("gateways")
}

enum GatewayType {
  TELEGRAM_BOT
  AI
}

enum GatewayStatus {
  CONNECTED
  DISCONNECTED
  ERROR
  CONNECTING
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] Gateway table exists
- [ ] Enums created

---

### Task 2.1.2: Create Gateway Types + Validation

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.1.1 complete

#### Deliverables:
- [ ] src/modules/gateway/gateway.types.ts
- [ ] src/modules/gateway/gateway.validation.ts

#### Types:
```typescript
// Credentials per gateway type
interface TelegramBotCredentials {
  botToken: string
}

interface AICredentials {
  provider: 'openai' | 'anthropic'
  apiKey: string
  model?: string
}

// Request DTOs
interface CreateGatewayRequest {
  name: string
  type: GatewayType
  credentials: TelegramBotCredentials | AICredentials
  config?: Record<string, unknown>
}
```

#### Done Criteria:
- [ ] Types for both gateway types
- [ ] Zod validation schemas
- [ ] Credential types separate

---

### Task 2.1.3: Create Gateway Service (CRUD)

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.1.2 complete

#### Deliverables:
- [ ] src/modules/gateway/gateway.service.ts

#### Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';
import { audit, auditActions } from '@/lib/audit';

class GatewayService {
  // All methods receive ServiceContext for user/org context + audit logging
  async create(ctx: ServiceContext, data: CreateGatewayRequest): Promise<Gateway>
  async findById(ctx: ServiceContext, id: string): Promise<Gateway>
  async findByUser(ctx: ServiceContext): Promise<Gateway[]>
  async update(ctx: ServiceContext, id: string, data: UpdateGatewayRequest): Promise<Gateway>
  async delete(ctx: ServiceContext, id: string): Promise<void>
  async updateStatus(id: string, status: GatewayStatus, error?: string): Promise<void>
  async getDecryptedCredentials(gateway: Gateway): Promise<Credentials>
}

// Ownership check should respect organizationId:
// If ctx.organizationId is set, check gateway.organizationId === ctx.organizationId
// Otherwise check gateway.userId === ctx.userId
```

#### Done Criteria:
- [ ] CRUD operations work
- [ ] Uses ServiceContext for all operations
- [ ] Ownership checks work for both user and org context
- [ ] Credentials encrypted on save
- [ ] Audit events created for create/delete

---

### Task 2.1.4: Create Gateway API Endpoints

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 2.1.3 complete

#### Deliverables:
- [ ] GET /api/gateways - List user's gateways
- [ ] POST /api/gateways - Create gateway
- [ ] GET /api/gateways/:id - Get gateway
- [ ] PUT /api/gateways/:id - Update gateway
- [ ] DELETE /api/gateways/:id - Delete gateway

#### Implementation Notes:
```typescript
// Create ServiceContext from req.user in each route:
import { createServiceContext } from '@/shared/types/context';

router.get('/', requireAuth, async (req, res) => {
  const ctx = createServiceContext(req.user, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  
  const gateways = await gatewayService.findByUser(ctx);
  // ...
});
```

#### Done Criteria:
- [ ] All endpoints require auth
- [ ] ServiceContext created and passed to service
- [ ] User/org isolation enforced
- [ ] Proper validation on create/update
- [ ] Credentials never returned in response

---

### Task 2.2.1: Create Credential Encryption Utility

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.1.4 complete

#### Deliverables:
- [ ] src/lib/encryption.ts
- [ ] encrypt(plaintext) function
- [ ] decrypt(ciphertext) function
- [ ] Uses AES-256-GCM

#### Implementation:
```typescript
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = process.env.ENCRYPTION_KEY! // 32 bytes

export function encrypt(plaintext: string): string
export function decrypt(ciphertext: string): string
```

#### Done Criteria:
- [ ] Can encrypt/decrypt credentials
- [ ] Different output each time (random IV)
- [ ] Fails gracefully on wrong key

---

### Task 2.2.2: Create Gateway Registry Pattern

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.2.1 complete

#### Deliverables:
- [ ] src/modules/gateway/gateway.registry.ts
- [ ] Register gateway implementations
- [ ] Get gateway by type

#### Implementation:
```typescript
class GatewayRegistry {
  private providers: Map<GatewayType, GatewayProvider>
  
  register(type: GatewayType, provider: GatewayProvider): void
  get(type: GatewayType): GatewayProvider
  getAll(): GatewayProvider[]
}

export const gatewayRegistry = new GatewayRegistry()
```

#### Done Criteria:
- [ ] Can register gateway providers
- [ ] Can retrieve by type
- [ ] Singleton pattern

---

### Task 2.2.3: Create Base Gateway Interface

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.2.2 complete

#### Deliverables:
- [ ] src/modules/gateway/providers/base.provider.ts

#### Interface:
```typescript
interface GatewayProvider {
  type: GatewayType
  
  // Lifecycle
  connect(gateway: Gateway): Promise<void>
  disconnect(gateway: Gateway): Promise<void>
  
  // Validation
  validateCredentials(credentials: unknown): Promise<boolean>
  
  // Actions (gateway-specific)
  execute(gateway: Gateway, action: string, params: unknown): Promise<unknown>
  
  // Health
  getStatus(gateway: Gateway): Promise<GatewayStatus>
}
```

#### Done Criteria:
- [ ] Interface defined
- [ ] Type-safe implementations required
- [ ] Documented methods

---

### Task 2.3.1: Implement Telegram Bot Gateway

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 2.2.3 complete

#### Deliverables:
- [ ] src/modules/gateway/providers/telegram-bot.provider.ts
- [ ] Implements GatewayProvider interface
- [ ] Uses node-telegram-bot-api or grammy

#### Implementation:
```typescript
class TelegramBotProvider implements GatewayProvider {
  type = GatewayType.TELEGRAM_BOT
  
  async connect(gateway: Gateway): Promise<void>
  async disconnect(gateway: Gateway): Promise<void>
  async validateCredentials(credentials: TelegramBotCredentials): Promise<boolean>
  async execute(gateway: Gateway, action: string, params: unknown): Promise<unknown>
}

// Actions: sendMessage, getMe, setWebhook, etc.
```

#### Done Criteria:
- [ ] Can validate bot token
- [ ] Can send test message
- [ ] Registers with gateway registry

---

### Task 2.3.2: Create Telegram Webhook Handler

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 2.3.1 complete

#### Deliverables:
- [ ] POST /api/webhooks/telegram/:gatewayId
- [ ] Verify webhook authenticity
- [ ] Route updates to gateway

#### Implementation:
```typescript
// Webhook receives Telegram updates
// - Verify it's for valid gateway
// - Process update (message, callback, etc.)
// - Trigger plugins (Phase 3)
```

#### Done Criteria:
- [ ] Webhook receives messages
- [ ] Invalid requests rejected
- [ ] Updates logged

---

### Task 2.3.3: Implement AI Gateway (OpenAI)

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.3.1 complete

#### Deliverables:
- [ ] src/modules/gateway/providers/ai.provider.ts
- [ ] Implements GatewayProvider interface
- [ ] Uses OpenAI SDK

#### Implementation:
```typescript
class AIProvider implements GatewayProvider {
  type = GatewayType.AI
  
  async connect(gateway: Gateway): Promise<void>
  async disconnect(gateway: Gateway): Promise<void>
  async validateCredentials(credentials: AICredentials): Promise<boolean>
  async execute(gateway: Gateway, action: string, params: unknown): Promise<unknown>
}

// Actions: chat, completion, etc.
```

#### Done Criteria:
- [ ] Can validate API key
- [ ] Can make chat completion request
- [ ] Returns proper response

---

### Task 2.4.1: Create Gateway List UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.1.4 complete

#### Deliverables:
- [ ] src/app/(dashboard)/gateways/page.tsx
- [ ] Gateway list component
- [ ] Status indicators
- [ ] Add gateway button

#### Done Criteria:
- [ ] Shows user's gateways
- [ ] Status badges (connected/disconnected/error)
- [ ] Links to detail page

---

### Task 2.4.2: Create Add Gateway UI

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 2.4.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/gateways/new/page.tsx
- [ ] Gateway type selector
- [ ] Dynamic credential form per type
- [ ] Form validation

#### Done Criteria:
- [ ] Can select gateway type
- [ ] Shows correct form for type
- [ ] Validates and submits
- [ ] Redirects to gateway list

---

### Task 2.4.3: Create Gateway Detail/Config UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.4.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/gateways/[id]/page.tsx
- [ ] Gateway info display
- [ ] Edit configuration
- [ ] Delete gateway button
- [ ] Test connection button

#### Done Criteria:
- [ ] Shows gateway details
- [ ] Can update config
- [ ] Can delete gateway
- [ ] Can test connection

---

### Task 2.4.4: Create Gateway Status Component

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.4.3 complete

#### Deliverables:
- [ ] src/components/gateways/gateway-status.tsx
- [ ] Real-time status indicator
- [ ] Error display
- [ ] Last connected time

#### Done Criteria:
- [ ] Shows current status
- [ ] Color-coded (green/yellow/red)
- [ ] Shows last error if any

---

### Task 2.5.1: Create Gateway Test Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.3.3 complete

#### Deliverables:
- [ ] POST /api/gateways/:id/test
- [ ] Tests gateway connection
- [ ] Returns success/failure

#### Done Criteria:
- [ ] Tests Telegram bot token validity
- [ ] Tests AI API key validity
- [ ] Returns meaningful error message

---

## ✅ Phase 2 Completion Checklist

- [ ] Gateway CRUD working
- [ ] Telegram Bot gateway implemented
- [ ] AI gateway implemented
- [ ] Credentials encrypted
- [ ] Gateway UI complete
- [ ] Can test gateway connections
- [ ] Webhook receiving messages
- [ ] Status tracking working

**When complete:** Update CURRENT-STATE.md and proceed to Phase 3
