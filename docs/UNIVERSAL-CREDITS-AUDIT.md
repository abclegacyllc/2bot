# Universal Credits System - Final Audit

## Summary

The credits system has been updated to support **universal credits** - a single currency
that can be used across all 2Bot platform features.

## ✅ Core Architecture - READY

### Wallet Separation (FIXED)
- **Personal wallets**: Belong to USER only
- **Organization wallets**: Belong to ORG only  
- **NO FALLBACK**: `deductPersonalCredits()` and `deductOrgCredits()` are completely separate
- **NO CROSS-VISIBILITY**: Each wallet type has its own methods

### Universal Categories (NEW)
```typescript
type CreditUsageCategory =
  | "ai_usage"           // 2Bot AI (chat, image, TTS, STT)
  | "marketplace"        // Plugin/theme/template purchases
  | "premium_feature"    // Premium feature unlocks
  | "subscription"       // Auto-deductions for subscriptions
  | "transfer"           // Credit transfers (future)
  | "other";             // Miscellaneous
```

### Module Structure
```
/src/modules/credits/
├── index.ts                 # Barrel exports
├── wallet.service.ts        # Low-level wallet storage (Prisma)
├── credit.service.ts        # Universal credit operations
└── ai-credit.service.ts     # AI-specific rate calculations
```

## ✅ API Routes - READY

### Personal Credits (`/api/credits/*`)
- `GET /api/credits` - Get balance
- `GET /api/credits/tokens` - Get token usage for AI widget
- `GET /api/credits/history` - Transaction history (with type/category filter)
- `GET /api/credits/usage` - Usage stats with `byCategory` breakdown
- `GET /api/credits/packages` - Available credit packages
- `POST /api/credits/purchase` - Stripe checkout

### Organization Credits (`/api/orgs/:orgId/credits/*`)
- `GET /api/orgs/:orgId/credits` - Get balance
- `GET /api/orgs/:orgId/credits/history` - Transaction history
- `GET /api/orgs/:orgId/credits/usage` - Usage stats
- `POST /api/orgs/:orgId/credits/purchase` - Stripe checkout

## ✅ UI Components - READY

```
/src/components/credits/
├── index.ts                          # Barrel exports + types
├── credits-balance-card.tsx          # Balance display with progress
├── credits-balance-display.tsx       # Compact header display (NEW)
├── credits-usage-chart.tsx           # Daily usage bar chart
├── credits-transaction-history.tsx   # Transaction table with filters
├── credits-purchase-packages.tsx     # Purchase package grid
├── credits-usage-breakdown.tsx       # Category breakdown + AI details
├── buy-credits-modal.tsx             # Purchase modal
└── credits-limit-warning.tsx         # Low balance/limit warnings
```

## ✅ Pages - READY

### Personal Credits Page
- `/app/(dashboard)/credits/page.tsx`
- `/app/(dashboard)/credits/client.tsx`
- `/app/(dashboard)/credits/loading.tsx`

### Organization Credits Page
- `/app/(dashboard)/organizations/[orgSlug]/credits/page.tsx`
- `/app/(dashboard)/organizations/[orgSlug]/credits/client.tsx`
- `/app/(dashboard)/organizations/[orgSlug]/credits/loading.tsx`

## ✅ Dashboard Integration - READY

### Top Bar Credits Display
- `CreditsBalanceDisplay` component added to dashboard header
- Shows current balance with low/critical warning states
- Links to credits page
- Auto-refreshes every 60 seconds
- Context-aware (personal vs organization)

### Sidebar Navigation
- Added "Credits" link with Coins icon
- Both personal and organization contexts
- Positioned above "Billing"

## ✅ 2Bot AI Integration - READY

### Credit Flow
1. User sends message → `POST /api/2bot-ai/chat`
2. Provider calls `aiCreditService.checkPersonalCredits()` or `checkOrgCredits()`
3. If sufficient → execute AI request
4. Provider calls `aiCreditService.deductPersonalCredits()` or `deductOrgCredits()`
5. Response includes `newBalance` → UI updates via `onCreditsUpdate` callback

### Widget Integration
- `TwoBotAIAssistantWidget` fetches from `/api/credits/tokens`
- Shows token usage in header
- Updates balance after each message
- Warning when above 80% usage

## ✅ Future-Proof Design

### Ready for Marketplace
When marketplace launches, call:
```typescript
await creditService.deductPersonalCredits(userId, price, {
  category: "marketplace",
  description: "Plugin: AI Assistant Pro",
  metadata: { pluginId, version, sellerId }
});
```

### Ready for Premium Features
```typescript
await creditService.deductPersonalCredits(userId, unlockPrice, {
  category: "premium_feature",
  description: "Unlocked: Advanced Analytics",
  metadata: { featureId }
});
```

### Ready for Subscriptions
```typescript
await creditService.deductOrgCredits(orgId, monthlyFee, {
  category: "subscription",
  description: "Monthly: Premium Plugin Suite",
  metadata: { subscriptionId, period }
});
```

## No Blocking Concerns

| Concern | Status | Notes |
|---------|--------|-------|
| Wallet separation | ✅ Fixed | No fallback between personal/org |
| Category tracking | ✅ Added | `CreditUsageCategory` type |
| Transaction filtering | ✅ Added | Filter by type and category |
| Usage breakdown | ✅ Added | `byCategory` in usage endpoint |
| Marketplace ready | ✅ Ready | Just pass `category: "marketplace"` |
| Premium features ready | ✅ Ready | Just pass `category: "premium_feature"` |
| UI components | ✅ Complete | All 8 components created |
| Personal page | ✅ Complete | With tabs for usage/history/purchase |
| Org page | ✅ Complete | Admin-only purchase, all members view |
| Header display | ✅ Complete | Shows balance in top bar |
| Sidebar nav | ✅ Complete | Credits link added |
| 2Bot AI integration | ✅ Complete | Uses credit service, no hardcoding |

## Next Steps (Optional Enhancements)

1. **Credit Transfers** - Transfer between users or orgs
2. **Refund System** - Self-service refunds for marketplace
3. **Credit Expiry** - Expire bonus credits after X days
4. **Bulk Purchase Discounts** - Dynamic pricing for large purchases
5. **Auto-recharge** - Stripe subscription for auto-refill

## Conclusion

The universal credits system is **fully operational** and ready for:
- Current AI usage ✅
- Future marketplace ✅
- Future premium features ✅
- Future subscriptions ✅

No architectural changes needed when these features are implemented.
