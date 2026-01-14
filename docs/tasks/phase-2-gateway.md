# Phase 2: Gateway System

> **Goal:** Implement Telegram Bot and AI gateways with full lifecycle management
> **Estimated Sessions:** 10-12
> **Prerequisites:** Phase 1.5 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| 2.1.1 | Create Gateway model | ✅ Done (Phase 1.5) | - |
| 2.1.2 | Create gateway types + validation | ✅ Done | - |
| 2.1.3 | Create gateway service (CRUD) | ✅ Done | - |
| 2.1.4 | Create gateway API endpoints | ✅ Done | - |
| 2.2.1 | Create credential encryption utility | ✅ Done (with 2.1.3) | - |
| 2.2.2 | Create gateway registry pattern | ✅ Done | - |
| 2.2.3 | Create base gateway interface | ✅ Done | - |
| 2.3.1 | Implement Telegram Bot gateway | ✅ Done | - |
| 2.3.2 | Create Telegram webhook handler | ✅ Done | - |
| 2.3.3 | Implement AI gateway (OpenAI) | ✅ Done | - |
| 2.4.1 | Create gateway list UI | ✅ Done | - |
| 2.4.2 | Create add gateway UI | ✅ Done | - |
| 2.4.3 | Create gateway detail/config UI | ✅ Done | - |
| 2.4.4 | Create gateway status component | ✅ Done | - |
| 2.5.1 | Create gateway test endpoint | ✅ Done | - |
| 2.5.2 | Create gateway health check worker | ⬜ (Optional) | Defer to Phase 6 |

---

## 📝 Detailed Tasks

### Task 2.1.1: Create Gateway Model

**Status:** ✅ Already Complete (Phase 1.5, Task 1.5.1.3)

> **Note:** Gateway model, GatewayType, and GatewayStatus enums were created in Phase 1.5.
> Skip this task and proceed to Task 2.1.2.

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
  TELEGRAM_BOT    // Telegram Bot API (uses botToken)
  AI              // All AI providers (OpenAI, Anthropic, DeepSeek, etc.)
  WEBHOOK         // Generic webhooks
  // TELEGRAM_ACCOUNT - V2 (MTProto, requires phone auth)
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
// AI Provider support (expandable)
type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'grok' | 'gemini' | 'mistral' | 'groq' | 'ollama'

// Credentials per gateway type
interface TelegramBotCredentials {
  botToken: string
}

interface AICredentials {
  provider: AIProvider
  apiKey: string
  baseUrl?: string  // For custom endpoints (Ollama, self-hosted)
  model?: string    // Default model for this gateway
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
- [x] Types for both gateway types
- [x] Zod validation schemas
- [x] Credential types separate

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
- [x] CRUD operations work
- [x] Uses ServiceContext for all operations
- [x] Ownership checks work for both user and org context
- [x] Credentials encrypted on save
- [x] Audit events created for create/delete

---

### Task 2.1.4: Create Gateway API Endpoints

**Status:** ✅ Complete

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 2.1.3 complete

#### Files Created:
- `src/server/routes/gateway.ts` - Gateway CRUD endpoints

#### Deliverables:
- [x] GET /api/gateways - List user's gateways (with pagination + filters)
- [x] POST /api/gateways - Create gateway
- [x] GET /api/gateways/:id - Get gateway
- [x] PUT /api/gateways/:id - Update gateway
- [x] PATCH /api/gateways/:id/status - Update gateway status
- [x] DELETE /api/gateways/:id - Delete gateway

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
- [x] All endpoints require auth
- [x] ServiceContext created and passed to service
- [x] User/org isolation enforced
- [x] Proper validation on create/update
- [x] Credentials never returned in response (only credentialInfo)

---

### Task 2.2.1: Create Credential Encryption Utility

**Status:** ✅ Complete (implemented during Task 2.1.3)

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.1.4 complete

#### Files Created:
- `src/lib/encryption.ts` - AES-256-GCM encryption for credentials

#### Deliverables:
- [x] src/lib/encryption.ts
- [x] encrypt(plaintext) function
- [x] decrypt(ciphertext) function
- [x] decryptJson<T>(ciphertext) function
- [x] isEncryptionAvailable() function
- [x] Uses AES-256-GCM

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

**Status:** ✅ Complete

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.2.1 complete

#### Files Created:
- `src/modules/gateway/gateway.registry.ts` - Registry singleton with GatewayProvider interface

#### Deliverables:
- [x] src/modules/gateway/gateway.registry.ts
- [x] Register gateway implementations
- [x] Get gateway by type
- [x] GatewayProvider interface with full lifecycle methods
- [x] GatewayAction metadata type
- [x] GatewayRegistryError with typed error codes

#### Implementation:
```typescript
class GatewayRegistry {
  private providers: Map<GatewayType, GatewayProvider>
  
  register(provider: GatewayProvider, options?: { override?: boolean }): void
  get(type: GatewayType): GatewayProvider
  has(type: GatewayType): boolean
  getAll(): GatewayProvider[]
  getTypes(): GatewayType[]
  getProviderInfo(): ProviderInfo[]
  unregister(type: GatewayType): boolean
  clear(): void
}

export const gatewayRegistry = new GatewayRegistry()
```

#### Done Criteria:
- [x] Can register gateway providers
- [x] Can retrieve by type
- [x] Singleton pattern
- [x] Error handling for duplicates and not found

---

### Task 2.2.3: Create Base Gateway Interface

**Status:** ✅ Complete

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.2.2 complete

#### Files Created:
- `src/modules/gateway/providers/base.provider.ts` - Abstract base class with common functionality
- `src/modules/gateway/providers/index.ts` - Provider exports

#### Deliverables:
- [x] src/modules/gateway/providers/base.provider.ts
- [x] BaseGatewayProvider abstract class
- [x] Connection state management
- [x] Error handling wrappers
- [x] Logging integration
- [x] Custom error classes

#### Implementation:
```typescript
abstract class BaseGatewayProvider<TCredentials, TConfig> implements GatewayProvider {
  abstract readonly type: GatewayType;
  abstract readonly name: string;
  abstract readonly description: string;
  
  // Public interface with error handling
  async connect(gatewayId, credentials, config): Promise<void>
  async disconnect(gatewayId): Promise<void>
  async validateCredentials(credentials): Promise<{ valid, error? }>
  async execute(gatewayId, action, params): Promise<TResult>
  async checkHealth(gatewayId, credentials): Promise<{ healthy, latency?, error? }>
  abstract getSupportedActions(): GatewayAction[]
  
  // Abstract methods for subclasses
  protected abstract doConnect(...): Promise<void>
  protected abstract doDisconnect(...): Promise<void>
  protected abstract doValidateCredentials(...): Promise<{ valid, error? }>
  protected abstract doExecute(...): Promise<TResult>
  protected abstract doCheckHealth(...): Promise<{ healthy, latency?, error? }>
}
```

#### Error Classes:
- `GatewayNotConnectedError` - Action attempted on disconnected gateway
- `UnsupportedActionError` - Invalid action name
- `InvalidCredentialsError` - Credentials failed validation

#### Done Criteria:
- [x] Interface defined (GatewayProvider in gateway.registry.ts)
- [x] Type-safe implementations required (generics for credentials/config)
- [x] Documented methods (JSDoc comments)
- [x] Connection state tracking
- [x] Automatic status updates to database

---

### Task 2.3.1: Implement Telegram Bot Gateway

**Status:** ✅ Complete

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 2.2.3 complete

#### Files Created:
- `src/modules/gateway/providers/telegram-bot.provider.ts` - Full Telegram Bot API implementation

#### Deliverables:
- [x] src/modules/gateway/providers/telegram-bot.provider.ts
- [x] Implements GatewayProvider interface (extends BaseGatewayProvider)
- [x] Uses native fetch (no external dependencies)

#### Implementation:
```typescript
class TelegramBotProvider extends BaseGatewayProvider<TelegramBotCredentials, TelegramBotConfig> {
  type = GatewayType.TELEGRAM_BOT
  
  // Lifecycle
  async doConnect(gatewayId, credentials, config): Promise<void>  // Validates token, caches bot info
  async doDisconnect(gatewayId): Promise<void>                    // Clears caches
  
  // Validation
  async doValidateCredentials(credentials): Promise<{ valid, error? }>
  static isValidTokenFormat(token): boolean
  
  // Actions
  async doExecute(gatewayId, action, params): Promise<unknown>
  
  // Health
  async doCheckHealth(gatewayId, credentials): Promise<{ healthy, latency?, error? }>
}

// Actions: getMe, sendMessage, setWebhook, deleteWebhook, getWebhookInfo
```

#### Done Criteria:
- [x] Can validate bot token (format + API call)
- [x] Can send test message (sendMessage action)
- [x] Registers with gateway registry
- [x] TelegramApiError for API errors

---

### Task 2.3.2: Create Telegram Webhook Handler

**Status:** ✅ Complete

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 2.3.1 complete

#### Files Created:
- `src/server/routes/webhook.ts` - Express webhook handler

#### Deliverables:
- [x] POST /api/webhooks/telegram/:gatewayId
- [x] Verify webhook authenticity (via secret token header)
- [x] Route updates to gateway (Phase 3 plugin routing TODO)

#### Implementation:
```typescript
// POST /api/webhooks/telegram/:gatewayId
webhookRouter.post("/telegram/:gatewayId", async (req, res) => {
  // 1. Validate update payload (update_id required)
  // 2. Find gateway by ID (no auth - webhook uses gatewayId)
  // 3. Verify gateway type is TELEGRAM_BOT
  // 4. Optional: Verify X-Telegram-Bot-Api-Secret-Token header
  // 5. Extract update info (message, callback_query, etc.)
  // 6. Log update for processing
  // 7. Update gateway lastConnectedAt
  // 8. Return 200 (always, to prevent Telegram retries)
});

// GET /api/webhooks/telegram/:gatewayId - Health check
webhookRouter.get("/telegram/:gatewayId", async (req, res) => {
  // Returns gateway status (404 if not found)
});
```

#### Done Criteria:
- [x] Webhook receives messages (validated via curl)
- [x] Invalid requests rejected (missing update_id)
- [x] Updates logged (with update type, chatId, userId)

---

### Task 2.3.3: Implement AI Gateway (OpenAI)

**Status:** ✅ Complete

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.3.1 complete

#### Files Created:
- `src/modules/gateway/providers/ai.provider.ts` - Multi-provider AI gateway

#### Deliverables:
- [x] src/modules/gateway/providers/ai.provider.ts
- [x] Implements GatewayProvider interface (extends BaseGatewayProvider)
- [x] Uses native fetch (no external SDK - consistent with Telegram provider)

#### Implementation:
```typescript
class AIProvider extends BaseGatewayProvider<AICredentials, AIGatewayConfig> {
  type = GatewayType.AI
  
  // Supports 8 providers: openai, anthropic, deepseek, grok, gemini, mistral, groq, ollama
  // Each provider has specific API endpoint and request format

  getSupportedActions(): GatewayAction[]  // chat, listModels, validateKey
  doConnect(gatewayId, credentials, config): Promise<void>
  doDisconnect(gatewayId): Promise<void>
  doValidateCredentials(credentials): Promise<{ valid, error? }>
  doExecute<TParams, TResult>(gatewayId, action, params): Promise<TResult>
  doCheckHealth(gatewayId, credentials): Promise<{ healthy, latency?, error? }>
}

// Provider-specific implementations:
// - OpenAI/Groq/DeepSeek: Standard chat completion API
// - Anthropic: Claude messages API format
// - Google Gemini: GenerateContent API format
// - Ollama: Local API (requires baseUrl)
```

#### Done Criteria:
- [x] Can validate API key (format + API verification)
- [x] Can make chat completion request
- [x] Returns proper response (with AIApiError for errors)

---

### Task 2.4.1: Create Gateway List UI ✅

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.1.4 complete
**Completed:** Session 8

#### Deliverables:
- [x] src/app/dashboard/gateways/page.tsx
- [x] Gateway list component
- [x] Status indicators
- [x] Add gateway button

#### Done Criteria:
- [x] Shows user's gateways
- [x] Status badges (connected/disconnected/error)
- [x] Links to detail page

---

### Task 2.4.2: Create Add Gateway UI ✅

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 2.4.1 complete
**Completed:** Session 8

#### Deliverables:
- [x] src/app/dashboard/gateways/new/page.tsx
- [x] Gateway type selector (Telegram Bot, AI)
- [x] Dynamic credential form per type
- [x] Form validation

#### Done Criteria:
- [x] Can select gateway type
- [x] Shows correct form for type
- [x] Validates and submits
- [x] Redirects to gateway list

---

### Task 2.4.3: Create Gateway Detail/Config UI ✅

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.4.2 complete
**Completed:** Session 8

#### Deliverables:
- [x] src/app/dashboard/gateways/[id]/page.tsx
- [x] Gateway info display
- [x] Edit configuration (rename)
- [x] Delete gateway button (with confirmation)
- [x] Test connection button

#### Done Criteria:
- [x] Shows gateway details
- [x] Can update config
- [x] Can delete gateway
- [x] Can test connection

---

### Task 2.4.4: Create Gateway Status Component ✅

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.4.3 complete
**Completed:** Session 8

#### Deliverables:
- [x] src/components/gateways/gateway-status.tsx
- [x] GatewayStatusBadge component
- [x] GatewayStatusIndicator component (with optional label)
- [x] StatusDot component

#### Done Criteria:
- [x] Shows current status
- [x] Color-coded (green/slate/red)
- [x] Shows last error if any

---

### Task 2.5.1: Create Gateway Test Endpoint ✅

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 2.3.3 complete
**Completed:** Session 8

#### Deliverables:
- [x] POST /api/gateways/:id/test
- [x] Tests gateway connection via provider checkHealth()
- [x] Returns success/failure with latency and error details

#### Implementation:
```typescript
// src/server/routes/gateway.ts
gatewayRouter.post("/:id/test", requireAuth, asyncHandler(async (req, res) => {
  const gateway = await gatewayService.findById(ctx, id);
  const credentials = gatewayService.getDecryptedCredentials(gateway);
  const provider = gatewayRegistry.get(gateway.type);
  
  const healthResult = await provider.checkHealth(id, credentials);
  
  // Update gateway status based on result
  await gatewayService.updateStatus(id, healthResult.healthy ? "CONNECTED" : "ERROR");
  
  return { success: healthResult.healthy, latency, error, details };
}));
```

#### Done Criteria:
- [x] Tests Telegram bot token validity (via getMe API)
- [x] Tests AI API key validity (via provider validation)
- [x] Returns meaningful error message
- [x] Updates gateway status based on result

---

### Task 2.5.2: Create Gateway Health Check Worker (Optional)

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 2.5.1 complete
**Priority:** Optional for MVP (can defer to Phase 6)

#### Deliverables:
- [ ] src/workers/gateway-health.worker.ts
- [ ] BullMQ job for periodic gateway validation

#### Implementation:
```typescript
// Run every 5 minutes per gateway
const gatewayHealthQueue = new Queue('gateway-health');

// Worker validates credentials and updates status
async function checkGatewayHealth(gatewayId: string) {
  const gateway = await gatewayService.findById(gatewayId);
  try {
    await gatewayRegistry.get(gateway.type).validate(gateway);
    await gatewayService.updateStatus(gatewayId, 'CONNECTED');
  } catch (error) {
    await gatewayService.updateStatus(gatewayId, 'ERROR', error.message);
    // Future: Send notification to user
  }
}
```

#### Done Criteria:
- [ ] Worker validates gateway credentials periodically
- [ ] Updates gateway status on failure
- [ ] (Future) Send notification to user

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

---

## 📌 Future: V2 Gateway Types

### TELEGRAM_ACCOUNT (MTProto) - Deferred to V2

> **Not in Phases 1-5 scope.** Added here for reference.

**Why deferred:**
- Requires phone number + 2FA auth flow (complex UX)
- MTProto library integration (gramjs or similar)
- Session persistence and reconnection logic
- Different rate limits and capabilities than Bot API
- Higher security risk (user account access)

**V2 Implementation Notes:**
```typescript
// Future: TELEGRAM_ACCOUNT credentials
interface TelegramAccountCredentials {
  phoneNumber: string
  apiId: number       // From my.telegram.org
  apiHash: string     // From my.telegram.org
  sessionString?: string  // Persisted session
}

// Auth flow:
// 1. User provides phone number + Telegram API credentials
// 2. Send code to phone via Telegram
// 3. User enters code
// 4. Handle 2FA password if enabled
// 5. Store session string (encrypted)
```

**Capabilities over Bot API:**
- Read message history
- Send as user (not bot)
- Join groups/channels as user
- Access to more Telegram features
