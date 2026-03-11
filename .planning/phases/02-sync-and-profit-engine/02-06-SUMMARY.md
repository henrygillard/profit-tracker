---
phase: 02-sync-and-profit-engine
plan: "06"
subsystem: payments
tags: [shopify-payments, graphql, prisma, balance-transactions, fees]

# Dependency graph
requires:
  - phase: 02-sync-and-profit-engine/02-02
    provides: shopifyGraphQL client and profitEngine with Shopify Payments fee support
  - phase: 02-sync-and-profit-engine/02-03
    provides: OrderProfit records written by syncOrders (required before feesTotal can be updated)

provides:
  - lib/syncPayouts.js with syncPayouts(prisma, shop, accessToken) function
  - POST /api/sync/payouts trigger endpoint behind JWT middleware
  - feesTotal populated from real Shopify Payments balance transaction data

affects: [03-dashboard, Phase 3 profit display relies on accurate feesTotal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Paginated GraphQL query with cursor-based pagination accumulating results before DB writes"
    - "Sum CHARGE type fees per order across multiple balance transactions before single update"
    - "P2025 graceful skip — orders not yet synced are logged and skipped without error"

key-files:
  created:
    - lib/syncPayouts.js
  modified:
    - routes/api.js
    - tests/fees.test.js

key-decisions:
  - "Filter CHARGE type only — REFUND/ADJUSTMENT/PAYOUT transactions excluded; totalRefunded already handles revenue adjustment"
  - "Sum multiple CHARGE transactions per order — partial capture creates multiple CHARGE nodes for same associatedOrder.id"
  - "Idempotent by design — repeated calls overwrite feesTotal with same value, safe to call after OAuth or manually"

patterns-established:
  - "syncPayouts: accumulate all fees in Map first, then bulk-update DB — avoids interleaved reads/writes"
  - "POST /api/sync/payouts: retrieve accessToken from ShopSession, delegate to lib function, return 200/404/500"

requirements-completed: [SYNC-04]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 02 Plan 06: Payout Fee Attribution Summary

**syncPayouts queries Shopify Payments balanceTransactions, sums CHARGE fees per order, and writes exact feesTotal to OrderProfit — replacing the placeholder 0 set by upsertOrder**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T15:25:00Z
- **Completed:** 2026-03-11T15:30:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- lib/syncPayouts.js implements full paginated balance transaction sync with CHARGE-type filtering and per-order fee accumulation
- POST /api/sync/payouts endpoint added to routes/api.js for manual and post-OAuth triggering
- Test 2-03-06 (payout fee attribution SYNC-04) is GREEN — feesTotal is no longer permanently 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement lib/syncPayouts.js and make test 2-03-06 green** - `742c368` (feat) + `baa7647` (test)
2. **Task 2: Add POST /api/sync/payouts trigger endpoint** - `8569ea0` (feat)

## Files Created/Modified
- `lib/syncPayouts.js` - syncPayouts(prisma, shop, accessToken) — paginates balance transactions, sums CHARGE fees per associatedOrder.id, calls prisma.orderProfit.update for each matched order, gracefully skips P2025 (order not yet synced)
- `routes/api.js` - Added POST /api/sync/payouts endpoint; requires syncPayouts and calls it with stored accessToken from ShopSession
- `tests/fees.test.js` - Replaced RED scaffold with real test: mocks shopifyGraphQL and prisma.orderProfit.update, verifies correct feesTotal written for each order

## Decisions Made
- Filter CHARGE type only — REFUND transactions do not represent processing fees, and OrderProfit.totalRefunded already handles revenue adjustments from refunds
- Sum multiple CHARGE transactions per order before updating — Shopify can create multiple CHARGE nodes (partial capture) for a single order
- Idempotent design — calling syncPayouts multiple times overwrites feesTotal with the same computed value

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required. The read_shopify_payments_payouts scope was already added to shopify.app.toml in prior plans.

## Next Phase Readiness
- All Shopify Payments orders now have accurate feesTotal after syncPayouts runs
- The POST /api/sync/payouts endpoint is ready to be called post-OAuth so first-install data is accurate immediately
- FEES-03 (shipping cost extraction) remains a planned RED test — will be addressed in a future sync plan
- Phase 3 dashboard can display correct net profit figures for Shopify Payments merchants

---
*Phase: 02-sync-and-profit-engine*
*Completed: 2026-03-11*
