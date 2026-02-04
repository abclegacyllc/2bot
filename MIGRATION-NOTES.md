# AI Modules Migration Notes

## Overview
Migrated from single `ai-tokens/` module to separate `ai-usage/` and `ai-credits/` modules for better separation of concerns.

## New Structure

### `/src/modules/ai-usage/`
**Purpose**: Track raw AI usage metrics (BYOK + 2Bot)
- Records actual usage: tokens, characters, images, audio/video seconds
- Tracks for both BYOK (bring-your-own-key) and 2Bot AI
- No billing logic - pure metrics tracking

**Exports**:
- `aiUsageService` - Main service for recording usage
- `RecordUsageData` types
- `getUsageStats()` - Get aggregated usage statistics

### `/src/modules/ai-credits/`
**Purpose**: Universal billing currency (2Bot only)
- Converts raw metrics to credits (universal currency)
- Manages credit balance and transactions
- Handles credit deductions and top-ups
- **2Bot AI only** - not for BYOK

**Exports**:
- `aiCreditService` - Main service for credit operations
- `CreditCheckResult`, `CreditDeductionResult` types
- Credit calculation and balance management

### `/src/modules/ai-tokens/` (OLD - Still exists temporarily)
**Status**: Deprecated but still in use for plan-limit tracking
**Contains**: Old implementations that need to be migrated
**TODO**: 
- Move plan-limit tracking methods (`getTokenUsage`, `getOrgTokenUsage`, `checkTokenLimit`, etc.) to appropriate service
- Delete after full migration

## Current State

### ✅ Completed
- Created new module directories
- Copied core services to new locations
- Updated imports in:
  - `/src/modules/2bot-ai-provider/2bot-ai.provider.ts`
  - `/src/modules/gateway/providers/ai.provider.ts`
  - `/src/server/routes/credits.ts`
- All 763 tests passing
- TypeScript compilation successful

### ⚠️ Temporary Workarounds
The following files still import from old `ai-tokens/` module:
1. `/src/server/routes/credits.ts` - For plan-limit tracking methods
2. `/src/modules/quota/quota.service.ts` - For plan-limit tracking methods

**Reason**: These methods track usage against plan limits (e.g., "10K tokens/month"). They don't fit cleanly in either `ai-usage` (which is about recording metrics) or `ai-credits` (which is about universal currency).

### 🔄 TODO: Phase 2
1. **Decision needed**: Where should plan-limit tracking live?
   - Option A: Add to `ai-usage` service (tracks usage against limits)
   - Option B: Add to `ai-credits` service (related to billing)
   - Option C: Create new `ai-plan-limits` service (separate concern)
   - Option D: Move to `quota` service (already handles quotas)

2. **Methods to migrate**:
   - `getTokenUsage(userId)` - Get monthly token usage vs plan limit
   - `getOrgTokenUsage(organizationId)` - Org-level usage tracking
   - `checkTokenLimit(userId, estimate)` - Pre-flight limit check
   - `getTokenBreakdown(userId, period)` - Usage by action type
   - `formatTokens(tokens)` - Display formatting
   - `getMonthlyTokens()` - Aggregate monthly usage

3. **After migration**:
   - Delete `/src/modules/ai-tokens/` folder
   - Remove temporary import workarounds
   - Update documentation

## Key Changes

### Service Naming
- `aiTokenService` → Split into:
  - `aiUsageService` - For metrics tracking
  - `aiCreditService` - For billing currency
  - `aiTokenService` - Temporarily kept for plan limits

### Method Renaming
In `2bot-ai.provider.ts`:
- `calculateTokens()` → `calculateCredits()`
- `checkTokens()` → `checkCredits()`
- `deductTokens()` → `deductCredits()`
- `tokenCheck` → `creditCheck`
- `hasTokens` → `hasCredits`
- `tokensUsed` → `creditsUsed`

### Architecture Benefits
1. **Clear separation**: Metrics vs billing
2. **BYOK support**: Usage tracking works for both BYOK and 2Bot
3. **Universal currency**: Credits work for all AI types (chat, images, audio, video)
4. **Better maintainability**: Each module has single responsibility

## Testing
All tests passing: 763/763 ✅
- Auth: 33 tests
- Billing: 19 tests  
- Gateway: 58 tests
- Quota: 22 tests
- AI Usage: 12 tests
- Password: 29 tests
- And more...

## Files Modified
- `/src/modules/2bot-ai-provider/2bot-ai.provider.ts`
- `/src/modules/gateway/providers/ai.provider.ts`
- `/src/modules/quota/quota.service.ts`
- `/src/server/routes/credits.ts`

## Files Created
- `/src/modules/ai-usage/ai-usage.service.ts`
- `/src/modules/ai-usage/index.ts`
- `/src/modules/ai-usage/__tests__/ai-usage.service.test.ts`
- `/src/modules/ai-credits/ai-credit.service.ts`
- `/src/modules/ai-credits/index.ts`

---

**Migration Date**: January 2025
**Status**: Phase 1 Complete ✅ | Phase 2 Pending ⚠️
