# Credits System Audit Report

**Date:** 2026-02-10  
**Scope:** Full credit system — display formatting, backend logic, resource displays  
**Status:** AUDIT COMPLETE — Fixes recommended below

---

## Executive Summary

The credit system backend is **architecturally sound** — clean service layering, proper wallet isolation (personal vs org), fractional credit accumulation, and correct pricing integration. However, there are **17 duplicate formatting functions** scattered across the codebase with **3 different behaviors**, causing inconsistent user-facing displays. There is also one **CRITICAL** race condition in credit deduction that can allow negative balances.

---

## CRITICAL Issues (Must Fix)

### 🔴 C1: Race Condition — Negative Balance Possible

**File:** `src/modules/credits/wallet.service.ts` lines 255-287  
**Problem:** `deductCredits()` does a blind `{ decrement: amount }` inside a transaction but never checks if balance would go negative. The pre-flight check in `2bot-ai-credit.service.ts` (lines 353-365) reads the wallet balance BEFORE the transaction, creating a TOCTOU (time-of-check-time-of-use) race:

```
Thread A: checks balance = 5, amount = 3 → OK
Thread B: checks balance = 5, amount = 4 → OK
Thread A: decrement 3 → balance = 2
Thread B: decrement 4 → balance = -2  ← NEGATIVE!
```

**Fix:** Add a WHERE clause guard to the update:
```typescript
const wallet = await tx.creditWallet.update({
  where: { id: walletId, balance: { gte: amount } },
  data: {
    balance: { decrement: amount },
    monthlyUsed: { increment: amount },
  },
});
```
If no row matches, throw `InsufficientCreditsError`. Same issue exists in `accumulateAndDeductCredits()` at line 335.

**Severity:** CRITICAL  
**Impact:** Financial — users can go negative, losing platform revenue  

### 🔴 C2: No Automated Monthly Reset (Cron Not Wired)

**File:** `src/server/routes/admin.ts` lines 1776-1805  
**Problem:** The monthly credit reset endpoint exists (`POST /api/admin/credits/reset`) but there is **no actual cron job** scheduled anywhere in the server code. `CRON_SECRET` is empty in `.env.local`. The `node-cron` package is only referenced in roadmap docs, not in actual code.

**Impact:** Monthly allocations never reset automatically. Users on FREE plan (15 credits/month) will hit their limit and never recover unless an admin manually triggers the endpoint.

**Fix:** Either:
1. Add `node-cron` to the Express server startup to call `resetMonthlyUsage` on a schedule
2. Or set up an external cron (systemd timer, GitHub Action, etc.) to hit the endpoint

**Severity:** CRITICAL  
**Impact:** All plans with monthly credit allocations are effectively one-time allocations

---

## HIGH Issues (Should Fix)

### 🟠 H1: 11 Duplicate `formatCredits` Functions — 3 Different Behaviors

This is the **core display problem** the user noticed.

| # | File | `<1000` behavior | Difference |
|---|------|-------------------|------------|
| 1 | `credits-balance-display.tsx:37` | `toLocaleString()` | ✅ Standard (commas) |
| 2 | `credits-balance-card.tsx:31` | `toLocaleString()` | ✅ Standard (commas) |
| 3 | `credits-usage-breakdown.tsx:73` | `toLocaleString()` | ✅ Standard (commas) |
| 4 | `credits-display.tsx:96` (2bot-ai) | `.toString()` | ❌ NO commas |
| 5 | `credits-usage-chart.tsx:46` | `.toString()` | ❌ NO commas |
| 6 | `credits-transaction-history.tsx:74` | `Math.abs()` + `toLocaleString()` | ⚠️ Strips sign + commas |
| 7 | `credits-purchase-packages.tsx:47` | `toLocaleString()` | ⚠️ Custom K logic (fractional K handling) |
| 8 | `credits.ts` (server):424 | `.toString()` | ❌ NO commas |
| 9 | `org-credits.ts` (server):40 | `.toString()` | ❌ NO commas |
| 10 | `2bot-ai-metrics.service.ts:429` | `.toString()` | ❌ NO commas |
| 11 | `credits-balance-display.tsx:155` (tooltip) | `balance.toLocaleString()` | ⚠️ Inline, not using formatCredits |

**User sees:** Header shows "2.0K", tooltip shows "1,999", credits page shows "2.0K credits", monthly usage shows "1,462 / ∞" — all different formats.

**Fix:** Create ONE shared `formatCredits()` in `src/shared/lib/format.ts` and replace all 11 copies.

### 🟠 H2: 6 Duplicate `formatNumber` Functions — 2 Different Behaviors

| # | File | `<1000` behavior |
|---|------|-------------------|
| 1 | `resource-item-bar.tsx:96` | `toLocaleString()` | ✅ Commas |
| 2 | `dept-resource-view.tsx:59` | `.toString()` | ❌ NO commas |
| 3 | `departments/[deptId]/page.tsx:224` | `.toString()` | ❌ NO commas |
| 4 | `resources/page.tsx:283` | `.toString()` | ❌ NO commas |
| 5 | `usage-progress-bar.tsx:71` | `.toString()` | ❌ NO commas |
| 6 | `dept-allocation-table.tsx:50` | `.toString()`, accepts `null` → "—" | ⚠️ Different signature |

**Fix:** Create ONE shared `formatNumber()` in `src/shared/lib/format.ts` and replace all 6 copies.

### 🟠 H3: Server Returns `formattedBalance` Using Inconsistent Formatter

**Files:** `credits.ts:63`, `org-credits.ts:84`  
**Problem:** Server-side `formatCredits()` uses `.toString()` (no commas), so `formattedBalance` in API responses differs from what client-side components display. This field is typed in the API response interface but doesn't match frontend behavior.

**Question:** Should server even format this? The frontend already formats it. Consider removing `formattedBalance` from API responses and letting the client handle all formatting.

### 🟠 H4: `credits-purchase-packages.tsx` Has Non-Standard K Formatting

**File:** `credits-purchase-packages.tsx:47-53`  
**Problem:** Custom fractional K logic: `Number.isInteger(k) ? ${k}K : ${k % 1 === 0.5 ? k.toFixed(1) : parseFloat(k.toFixed(2))}K`  
This creates outputs like "1.25K" for 1250 credits, while all other formatCredits produce "1.3K" (single decimal).

**Fix:** Unify with standard `(credits / 1000).toFixed(1)K` like all others.

---

## MEDIUM Issues (Nice to Have)

### 🟡 M1: Transaction History `formatCredits` Strips Sign

**File:** `credits-transaction-history.tsx:74`  
**Problem:** Uses `Math.abs(credits)` — this is intentional for display (shows "+500" or "-3" separately with sign prefix), but it's a different function signature than all others. Should be named `formatCreditAmount()` to distinguish from `formatCredits()`.

### 🟡 M2: Tooltip Shows Full Number While Button Shows Abbreviated

**File:** `credits-balance-display.tsx:149-155`  
**Problem:** Button shows `formatCredits(balance)` → "2.0K", tooltip shows `balance.toLocaleString()` → "1,999". This is actually **good UX** (compact + detailed) but uses an inline expression instead of a shared function.

### 🟡 M3: `plans.ts` Has Its Own Credit Formatting (Yet Another Copy)

**File:** `src/shared/constants/plans.ts:453-460`  
**Problem:** `getPlanFeatures()` has inline formatting logic:
```typescript
if (limits.creditsPerMonth >= 10000) {
  features.push(`${(limits.creditsPerMonth / 1000).toFixed(0)}K credits/month`);
} else if (limits.creditsPerMonth >= 1000) {
  features.push(`${(limits.creditsPerMonth / 1000).toFixed(1)}K credits/month`);
} else {
  features.push(`${limits.creditsPerMonth} credits/month`);
}
```
This is a 4th behavior: ≥10K uses `.toFixed(0)K` (no decimal), ≥1K uses `.toFixed(1)K`.

### 🟡 M4: `CRON_SECRET` Empty in `.env.local`

**File:** `.env.local:70`  
**Problem:** `CRON_SECRET=""` — even when the cron endpoint is eventually called, there's no authentication protecting it beyond admin auth.

### 🟡 M5: `addCredits` Increments `lifetime` Only for Purchases

**File:** `wallet.service.ts:398-400`  
```typescript
lifetime: type === "purchase" ? { increment: amount } : undefined,
```
Grants, bonuses, and refunds don't increment lifetime. This is likely intentional but should be documented — if a user gets a 500-credit bonus, their "Lifetime" display won't reflect it.

### 🟡 M6: `2bot-ai-metrics.service.ts` Has Stale Token/Credit Naming

**File:** Lines 35-39 — Interface still uses `tokenLimit`, `tokensRemaining`, `percentUsed` naming but these represent credits, not tokens. The `formatTokens()` method at line 410 and `formatCredits()` at line 429 coexist redundantly.

---

## LOW Issues (Cosmetic / Future)

### 🔵 L1: Inconsistent Unlimited Representation

- Plans use `-1` for unlimited (`creditsPerMonth: -1`)
- UI shows "∞" in some places, "Unlimited" in others
- `credits-display.tsx:73`: `limit === -1 ? "Unlimited" : limit.toLocaleString()`
- `2bot-ai-metrics.service.ts:410`: `if (tokens === -1) return "Unlimited"`
- Some progress bars show "∞"

Should standardize: always show "∞" for compact or "Unlimited" for full display.

### 🔵 L2: `formattedBalance` Field Unused by Frontend

The API returns `formattedBalance` in credit responses, but the frontend components all format locally. This field adds payload size but provides no value since the server uses `.toString()` (no commas).

### 🔵 L3: No Decimal Display for Fractional Pending Credits

Users with pending credits (e.g., 0.73 credits accumulated) have no visibility into this. The balance display only shows whole numbers. A tooltip showing "0.73 credits pending" would improve transparency.

---

## Recommended Fix Plan

### Phase 1: CRITICAL Fixes (Do Now)
1. **Fix race condition** — Add `balance: { gte: amount }` guard to `deductCredits()` and `accumulateAndDeductCredits()`
2. **Wire up cron** — Add monthly reset scheduling or document manual process

### Phase 2: Create Shared Formatting (High Priority)
3. **Create `src/shared/lib/format.ts`** with:
   - `formatCredits(credits: number): string` — standard, commas <1K, K/M abbreviation
   - `formatCreditAmount(amount: number): string` — for transactions (handles negative)
   - `formatNumber(num: number): string` — general number formatting
   - `formatNumber(num: number | null, fallback?: string): string` — with null support
4. **Replace all 11 `formatCredits` copies** to import from shared
5. **Replace all 6 `formatNumber` copies** to import from shared

### Phase 3: Cleanup (Nice to Have)
6. Remove `formattedBalance` from API responses or make it use the shared formatter
7. Unify unlimited display (∞ vs "Unlimited")
8. Add pending credits to tooltip display
9. Rename token references in metrics service

---

## Backend Architecture Assessment

✅ **Well designed:**
- Clean 3-layer service architecture (wallet → credit → ai-credit)
- Proper personal/org wallet isolation (no cross-contamination)
- Fractional credit accumulation system (accumulate fractional, deduct whole)
- Centralized pricing in `model-pricing.ts` with DB override support
- Rate caching with TTL in AI credit service
- Proper Prisma transaction usage for atomic operations
- Usage tracking in Redis for real-time billing pool display
- Universal credit categories allowing future marketplace expansion

⚠️ **Needs attention:**
- Race condition in deduction (C1 above)
- No automated reset scheduling (C2 above)
- `deductCredits()` doesn't return error on insufficient funds — it blindly decrements
