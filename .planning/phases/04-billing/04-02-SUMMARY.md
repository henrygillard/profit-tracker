---
phase: 04-billing
plan: "02"
subsystem: payments
tags: [shopify-billing-api, graphql, prisma, jest, tdd, webhooks, hmac]

# Dependency graph
requires:
  - phase: 04-billing
    plan: 01
    provides: "tests/billing.test.js with 8 RED stubs; ShopSession.billingStatus and subscriptionId schema fields"
provides:
  - "routes/billing.js: createBillingSubscription (appSubscriptionCreate mutation, $29/month, 7-day trial), checkBillingStatus (activeSubscriptions query), billingWebhookRouter (app_subscriptions/update handler)"
  - "routes/webhooks.js: POST /webhooks/app_subscriptions/update handler with HMAC verification and live billing status query"
  - "tests/__mocks__/billing.js: jest mock for routes/billing enabling test isolation"
affects: [04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "billingWebhookRouter exported from routes/billing.js — allows test app and webhooks.js to both mount the same handler"
    - "jest.requireActual in mock file: routes/billing mock re-exports real billingWebhookRouter but provides jest.fn() for createBillingSubscription and checkBillingStatus"
    - "moduleNameMapper entry for routes/billing — same pattern as lib/shopifyClient and lib/prisma mocks"

key-files:
  created:
    - routes/billing.js
    - tests/__mocks__/billing.js
  modified:
    - routes/webhooks.js
    - jest.config.js
    - tests/billing.test.js

key-decisions:
  - "billingWebhookRouter exported from routes/billing.js: test file imports billingWebhookRouter directly (not from webhooks.js) so handler must live in billing.js; webhooks.js imports it via checkBillingStatus and duplicates the handler inline for production routing"
  - "routes/billing mock: createBillingSubscription/checkBillingStatus as jest.fn() for test isolation; billingWebhookRouter via jest.requireActual so HMAC logic is exercised in tests 7 and 8"
  - "Test 5 remains RED: live-check-overrides-null-billingStatus behavior requires Plan 03 server.js changes — test is a forward contract, not a Plan 02 deliverable"

patterns-established:
  - "Billing webhook reads shop from x-shopify-shop-domain header (not body) — Shopify empty payload bug since API 2024-07"
  - "checkBillingStatus fails closed: returns false on exception — never grants access on Shopify API error"

requirements-completed: [BILL-01]

# Metrics
duration: 15min
completed: 2026-03-14
---

# Phase 4 Plan 02: Billing Core Implementation Summary

**Shopify Billing API helpers (createBillingSubscription + checkBillingStatus) and app_subscriptions/update webhook handler with HMAC verification and live subscription status query**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-14T16:13:11Z
- **Completed:** 2026-03-14T16:28:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `routes/billing.js` with `createBillingSubscription` ($29/month, EVERY_30_DAYS, 7-day trial, stores subscriptionId in DB), `checkBillingStatus` (queries activeSubscriptions, fails closed), and `billingWebhookRouter` (POST /app_subscriptions/update with HMAC verification and setImmediate async pattern)
- Added `POST /webhooks/app_subscriptions/update` handler to `routes/webhooks.js` importing `checkBillingStatus` from billing module — reads shop from `x-shopify-shop-domain` header, performs live GraphQL status query, updates `billingStatus` to ACTIVE/INACTIVE in DB
- Created `tests/__mocks__/billing.js` and added `moduleNameMapper` entry so `createBillingSubscription`/`checkBillingStatus` are `jest.fn()` while `billingWebhookRouter` uses real implementation for HMAC test coverage
- 7/8 billing tests now GREEN (test 5 remains RED — requires Plan 03 server.js live-check pattern); prior 51 tests remain GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Create routes/billing.js with createBillingSubscription and checkBillingStatus** - `10fa620` (feat)
2. **Task 2: Add app_subscriptions/update handler to routes/webhooks.js** - `51c0281` (feat)

**Plan metadata:** *(this commit)*

## Files Created/Modified

- `routes/billing.js` - createBillingSubscription, checkBillingStatus, billingWebhookRouter exports
- `tests/__mocks__/billing.js` - Jest mock: jest.fn() for helper functions, real router via requireActual
- `routes/webhooks.js` - Added POST /app_subscriptions/update handler and checkBillingStatus import
- `jest.config.js` - Added `^../routes/billing$` to moduleNameMapper
- `tests/billing.test.js` - [Rule 1 bug fix] Added X-Shopify-Shop-Domain header to test 7

## Decisions Made

- **billingWebhookRouter exported from billing.js:** Test file imports `billingWebhookRouter` directly from `routes/billing` (not `routes/webhooks`). To satisfy the test contract without duplicating the handler, the handler lives in `billing.js` as a router export. `routes/webhooks.js` imports `checkBillingStatus` (satisfying key_link) and also duplicates the handler inline for production routing clarity.
- **Billing mock uses jest.requireActual for router:** `createBillingSubscription` and `checkBillingStatus` need to be `jest.fn()` so tests 2 & 3 can call `.mockResolvedValue()`. But `billingWebhookRouter` must contain real HMAC logic for tests 7 & 8. `jest.requireActual('../../routes/billing').billingWebhookRouter` provides the real router while dependencies (prisma, shopifyClient) are still mocked via moduleNameMapper.
- **Test 5 left RED:** Test 5 expects `/admin` to query Shopify live when `billingStatus=null` and update DB — this is Pattern 5 from research.md, implemented in Plan 03 server.js. Attempting to implement it in Plan 02 would conflict with Plan 03's scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing X-Shopify-Shop-Domain header in billing test 7**
- **Found during:** Task 1 (running billing tests after creating routes/billing.js)
- **Issue:** Test 7 (valid HMAC webhook) expected `prisma.shopSession.update` to be called with `billingStatus: 'INACTIVE'`, but never set the `X-Shopify-Shop-Domain` request header. The handler reads shop from this header — without it, `shop` is `undefined`, handler exits early in `setImmediate`, and DB update never happens.
- **Fix:** Added `.set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')` to the supertest request chain in test 7.
- **Files modified:** `tests/billing.test.js`
- **Verification:** Test 7 passes GREEN after fix
- **Committed in:** `10fa620` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Created tests/__mocks__/billing.js and added moduleNameMapper entry**
- **Found during:** Task 1 (diagnosing why tests 2 & 3 failed with `mockResolvedValue is not a function`)
- **Issue:** Tests 2 & 3 call `createBillingSubscription.mockResolvedValue(...)` on the destructured import. CommonJS destructuring captures the value at import time — `jest.spyOn` on the module object doesn't retroactively make the local variable a mock function. Without a `moduleNameMapper` entry, `createBillingSubscription` is a plain function with no `.mockResolvedValue` method.
- **Fix:** Created `tests/__mocks__/billing.js` with `createBillingSubscription = jest.fn()` and `checkBillingStatus = jest.fn()`. Added `'^../routes/billing$'` to `jest.config.js` moduleNameMapper. Used `jest.requireActual('../../routes/billing').billingWebhookRouter` to preserve real webhook handler logic for HMAC tests.
- **Files modified:** `tests/__mocks__/billing.js` (created), `jest.config.js`
- **Verification:** Tests 2, 3, 7, 8 all pass GREEN after fix
- **Committed in:** `10fa620` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical test infrastructure)
**Impact on plan:** Both auto-fixes essential for test correctness. No scope creep.

## Issues Encountered

- `jest.requireActual('../routes/billing')` in mock file used wrong relative path (would resolve to `tests/routes/billing`). Fixed to `../../routes/billing` (relative to `tests/__mocks__/` directory).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `routes/billing.js` ready for Plan 03 to import: `createBillingSubscription` called from `routes/auth.js` OAuth callback; `checkBillingStatus` called from server.js `/admin` live check (Pattern 5)
- `routes/webhooks.js` already has the `app_subscriptions/update` handler — Plan 03 only needs to add `APP_SUBSCRIPTIONS_UPDATE` to WEBHOOK_TOPICS array in `routes/auth.js`
- Test 5 is the contract for Plan 03 server.js implementation — it will turn GREEN when Pattern 5 (live-check in /admin) is added

## Self-Check: PASSED

- routes/billing.js: FOUND
- tests/__mocks__/billing.js: FOUND
- routes/webhooks.js: FOUND (app_subscriptions handler confirmed via grep)
- jest.config.js: FOUND (moduleNameMapper entry confirmed)
- Commit 10fa620 (billing module): FOUND
- Commit 51c0281 (webhooks handler): FOUND
- 7 billing tests: GREEN
- 1 billing test (test 5): RED (expected — Plan 03 contract)
- Prior 51 tests: GREEN (58 total passing)

---
*Phase: 04-billing*
*Completed: 2026-03-14*
