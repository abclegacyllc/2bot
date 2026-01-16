# Phase 1: Authentication System

> **Goal:** Complete user authentication with email/password
> **Estimated Sessions:** 12-15
> **Prerequisites:** Phase 0 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| 1.1.1 | Create User model (full schema) | ✅ | 2026-01-13 |
| 1.1.2 | Create Session model | ✅ | 2026-01-13 |
| 1.1.3 | Create auth types + validation schemas | ✅ | 2026-01-13 |
| 1.2.1 | Create password hashing utility | ✅ | 2026-01-13 |
| 1.2.2 | Create JWT utility | ✅ | 2026-01-13 |
| 1.2.3 | Create auth service | ✅ | 2026-01-13 |
| 1.3.1 | Create registration endpoint | ✅ | 2026-01-13 |
| 1.3.2 | Create login endpoint | ✅ | 2026-01-13 |
| 1.3.3 | Create logout endpoint | ✅ | 2026-01-13 |
| 1.3.4 | Create /me endpoint | ✅ | 2026-01-13 |
| 1.3.5 | Create auth middleware | ✅ | 2026-01-13 |
| 1.4.1 | Create forgot password endpoint | ✅ | 2026-01-13 |
| 1.4.2 | Create reset password endpoint | ✅ | 2026-01-13 |
| 1.4.3 | Create email service (basic) | ✅ | 2026-01-13 |
| 1.5.1 | Create registration page UI | ✅ | 2026-01-13 |
| 1.5.2 | Create login page UI | ✅ | 2026-01-13 |
| 1.5.3 | Create forgot password UI | ✅ | 2026-01-13 |
| 1.5.4 | Create reset password UI | ✅ | 2026-01-13 |
| 1.6.1 | Create auth context/provider | ✅ | 2026-01-13 |
| 1.6.2 | Create protected route wrapper | ✅ | 2026-01-13 |

---

## 📝 Detailed Tasks

### Task 1.1.1: Create User Model (Full Schema)

**Session Type:** Database
**Estimated Time:** 20-25 minutes
**Prerequisites:** Phase 0 complete

#### Context Files:
- prisma/schema.prisma
- src/shared/types/index.ts

#### Deliverables:
- [ ] User model with all V1 fields
- [ ] Migration created
- [ ] Types exported

#### Schema:
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String?
  emailVerified DateTime?
  image         String?
  
  // Subscription
  plan          PlanType  @default(FREE)
  stripeCustomerId String? @unique
  
  // Status
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  
  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  sessions      Session[]
  gateways      Gateway[]
  userPlugins   UserPlugin[]
  
  @@index([email])
  @@index([stripeCustomerId])
}

enum PlanType {
  FREE
  PRO
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] Prisma Studio shows User table
- [ ] Types generated

---

### Task 1.1.2: Create Session Model

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.1.1 complete

#### Schema:
```prisma
model Session {
  id           String   @id @default(cuid())
  userId       String
  token        String   @unique
  expiresAt    DateTime
  userAgent    String?
  ipAddress    String?
  
  createdAt    DateTime @default(now())
  
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([token])
  @@index([expiresAt])
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] Session table in database

---

### Task 1.1.3: Create Auth Types + Validation Schemas

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.1.2 complete

#### Context Files:
- src/shared/types/index.ts

#### Deliverables:
- [ ] src/modules/auth/auth.types.ts
- [ ] src/modules/auth/auth.validation.ts (Zod schemas)

#### Types:
```typescript
// Request DTOs
RegisterRequest { email, password, name? }
LoginRequest { email, password }
ForgotPasswordRequest { email }
ResetPasswordRequest { token, password }

// Response DTOs
AuthResponse { user, token }
UserResponse { id, email, name, plan, ... }
```

#### Validations (Zod):
```typescript
registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(2).max(100).optional()
})
```

#### Done Criteria:
- [ ] All DTOs defined
- [ ] Zod schemas validate correctly
- [ ] Types exported

---

### Task 1.2.1: Create Password Hashing Utility

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.1.3 complete

#### Deliverables:
- [ ] src/lib/password.ts
- [ ] hashPassword(password) function
- [ ] verifyPassword(password, hash) function

#### Implementation:
```typescript
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string>
export async function verifyPassword(password: string, hash: string): Promise<boolean>
```

#### Done Criteria:
- [ ] Can hash a password
- [ ] Can verify correct password
- [ ] Rejects wrong password

---

### Task 1.2.2: Create JWT Utility

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.2.1 complete

#### Deliverables:
- [ ] src/lib/jwt.ts
- [ ] generateToken(payload) function
- [ ] verifyToken(token) function
- [ ] Token types defined

#### Implementation:
```typescript
import jwt from 'jsonwebtoken'

export function generateToken(payload: TokenPayload): string
export function verifyToken(token: string): TokenPayload | null

interface TokenPayload {
  userId: string
  email: string
  plan: PlanType
}
```

#### Done Criteria:
- [ ] Can generate JWT
- [ ] Can verify valid JWT
- [ ] Rejects invalid/expired JWT

---

### Task 1.2.3: Create Auth Service

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Tasks 1.2.1, 1.2.2 complete

#### Deliverables:
- [ ] src/modules/auth/auth.service.ts
- [ ] register() method
- [ ] login() method
- [ ] logout() method
- [ ] validateSession() method

#### Methods:
```typescript
class AuthService {
  async register(data: RegisterRequest): Promise<AuthResponse>
  async login(data: LoginRequest): Promise<AuthResponse>
  async logout(sessionId: string): Promise<void>
  async validateSession(token: string): Promise<User | null>
  async createSession(userId: string, meta: SessionMeta): Promise<Session>
}
```

#### Done Criteria:
- [ ] Can register new user
- [ ] Can login with credentials
- [ ] Can logout (invalidate session)
- [ ] Session stored in database

---

### Task 1.3.1: Create Registration Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.2.3 complete

#### Deliverables:
- [ ] POST /api/auth/register endpoint
- [ ] Input validation
- [ ] Proper error handling
- [ ] Returns user + token

#### Response:
```json
{
  "user": { "id", "email", "name", "plan" },
  "token": "jwt..."
}
```

#### Done Criteria:
- [ ] Can register via curl
- [ ] Rejects duplicate email (409)
- [ ] Validates password requirements

---

### Task 1.3.2: Create Login Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.3.1 complete

#### Deliverables:
- [x] POST /api/auth/login endpoint
- [x] Input validation
- [x] **Auth-specific rate limits** (see below)
- [x] Returns user + token

#### Add Auth Rate Limits to rate-limits.ts:
```typescript
import { addEndpointRateLimit } from '@/shared/constants/rate-limits';

// Register auth endpoint rate limits (brute force protection)
addEndpointRateLimit('POST:/api/auth/login', {
  points: 5,           // 5 attempts
  duration: 60,        // per minute
  blockDuration: 300,  // block for 5 minutes if exceeded
});

addEndpointRateLimit('POST:/api/auth/register', {
  points: 3,           // 3 attempts
  duration: 3600,      // per hour
  blockDuration: 3600,
});

addEndpointRateLimit('POST:/api/auth/forgot-password', {
  points: 3,           // 3 attempts
  duration: 3600,      // per hour
  blockDuration: 3600,
});
```

#### Done Criteria:
- [ ] Can login via curl
- [ ] Rejects wrong password (401)
- [ ] Creates session in DB
- [ ] **Login limited to 5 attempts/min per IP**

---

### Task 1.3.3: Create Logout Endpoint

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.3.2 complete

#### Deliverables:
- [ ] POST /api/auth/logout endpoint
- [ ] Requires authentication
- [ ] Invalidates session

#### Done Criteria:
- [ ] Session deleted from DB
- [ ] Token no longer valid

---

### Task 1.3.4: Create /me Endpoint

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 1.3.3 complete

#### Deliverables:
- [ ] GET /api/auth/me endpoint
- [ ] Requires authentication
- [ ] Returns current user

#### Done Criteria:
- [ ] Returns user data with valid token
- [ ] Returns 401 without token

---

### Task 1.3.5: Create Auth Middleware

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.3.4 complete

#### Deliverables:
- [ ] src/server/middleware/auth.ts
- [ ] requireAuth middleware
- [ ] optionalAuth middleware
- [ ] Attaches user to request

#### Implementation:
```typescript
export const requireAuth = async (req, res, next) => {
  // Extract token from Authorization header
  // Verify token
  // Attach user to req.user
  // Or return 401
}
```

#### Done Criteria:
- [ ] Protected routes require valid token
- [ ] User attached to request
- [ ] 401 for invalid/missing token

---

### Task 1.4.1: Create Forgot Password Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.3.5 complete

#### Deliverables:
- [ ] POST /api/auth/forgot-password
- [ ] Generates reset token
- [ ] Stores token with expiry
- [ ] (Email sent in 1.4.3)

#### Done Criteria:
- [ ] Token generated and stored
- [ ] Returns success (even if email not found - security)
- [ ] Token expires in 1 hour

---

### Task 1.4.2: Create Reset Password Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.4.1 complete

#### Deliverables:
- [ ] POST /api/auth/reset-password
- [ ] Validates reset token
- [ ] Updates password
- [ ] Invalidates token

#### Done Criteria:
- [ ] Password updated with valid token
- [ ] Token rejected after use
- [ ] Token rejected after expiry

---

### Task 1.4.3: Create Email Service (Basic)

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 1.4.2 complete

#### Deliverables:
- [ ] src/lib/email.ts
- [ ] sendEmail() function
- [ ] Reset password email template
- [ ] Uses Resend or console.log in dev

#### Implementation:
```typescript
export async function sendEmail(options: EmailOptions): Promise<void>
export async function sendPasswordResetEmail(email: string, token: string): Promise<void>
```

#### Done Criteria:
- [ ] Email sent (or logged in dev)
- [ ] Reset link includes token
- [ ] Works with Resend in prod

---

### Task 1.5.1: Create Registration Page UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 1.3.1 complete

#### Deliverables:
- [ ] src/app/(auth)/register/page.tsx
- [ ] Registration form component
- [ ] Form validation (client-side)
- [ ] API integration
- [ ] Error handling UI

#### Done Criteria:
- [ ] Form renders at /register
- [ ] Can submit and create account
- [ ] Shows validation errors
- [ ] Redirects to dashboard on success

---

### Task 1.5.2: Create Login Page UI

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 1.5.1 complete

#### Deliverables:
- [ ] src/app/(auth)/login/page.tsx
- [ ] Login form component
- [ ] "Forgot password?" link
- [ ] Remember me option

#### Done Criteria:
- [ ] Form renders at /login
- [ ] Can login with credentials
- [ ] Shows error on wrong password
- [ ] Redirects to dashboard

---

### Task 1.5.3: Create Forgot Password UI

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.5.2 complete

#### Deliverables:
- [ ] src/app/(auth)/forgot-password/page.tsx
- [ ] Email input form
- [ ] Success message

#### Done Criteria:
- [ ] Form at /forgot-password
- [ ] Shows success after submit
- [ ] Links back to login

---

### Task 1.5.4: Create Reset Password UI

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.5.3 complete

#### Deliverables:
- [ ] src/app/(auth)/reset-password/page.tsx
- [ ] Password input form
- [ ] Token from URL query

#### Done Criteria:
- [ ] Form at /reset-password?token=xxx
- [ ] Can set new password
- [ ] Redirects to login

---

### Task 1.6.1: Create Auth Context/Provider

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 1.5.4 complete

#### Deliverables:
- [ ] src/components/providers/auth-provider.tsx
- [ ] useAuth() hook
- [ ] login(), logout(), user state
- [ ] Token storage (localStorage or cookie)

#### Implementation:
```typescript
interface AuthContext {
  user: User | null
  isLoading: boolean
  login: (email, password) => Promise<void>
  logout: () => Promise<void>
  register: (data) => Promise<void>
}

export function useAuth(): AuthContext
```

#### Done Criteria:
- [ ] Auth state persists on refresh
- [ ] useAuth() works in components
- [ ] Auto-logout on token expiry

---

### Task 1.6.2: Create Protected Route Wrapper

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 1.6.1 complete

#### Deliverables:
- [ ] src/components/auth/protected-route.tsx
- [ ] Redirects to login if not authenticated
- [ ] Shows loading while checking

#### Done Criteria:
- [ ] /dashboard redirects to /login if not auth
- [ ] Shows spinner while loading
- [ ] Works with auth context

---

## ✅ Phase 1 Completion Checklist

- [ ] User can register with email/password
- [ ] User can login
- [ ] User can logout
- [ ] User can reset password
- [ ] JWT authentication working
- [ ] Sessions stored in database
- [ ] Auth UI pages complete
- [ ] Protected routes working
- [ ] Auth context provides user state

**When complete:** Update CURRENT-STATE.md and proceed to Phase 2
