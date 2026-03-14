---
phase: 04-billing
plan: "01"
subsystem: testing
tags: [prisma, jest, tdd, billing, shopify-billing-api]

# Dependency graph
requires:
  - phase: 03-profit-dashboard
    provides: "Dashboard routes and /admin route in server.js; verifySessionToken middleware"
provides:
  - "tests/billing.test.js with 8 failing RED stubs for BILL-01 billing behaviors"
  - "ShopSession.billingStatus and ShopSession.subscriptionId fields in Prisma schema"
  - "Migration SQL for billing status columns in shop_sessions table"
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED phase: tests import non-existent routes/billing.js causing MODULE_NOT_FOUND — same pattern as prior TDD plans"
    - "Prisma schema field naming: nullable String? fields with @map() snake_case column names"

key-files:
  created:
    - tests/billing.test.js
    - prisma/migrations/20260314_add_billing_status_to_shop_session/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Wave 0 TDD approach: import routes/billing.js at test file top level — MODULE_NOT_FOUND causes test suite to fail RED cleanly"
  - "Migration SQL created manually (non-interactive env blocks prisma migrate dev) — npx prisma generate regenerates client from schema"
  - "billingStatus and subscriptionId added as nullable String? after updatedAt field, before @@index — consistent with schema ordering conventions"

patterns-established:
  - "Billing test app: minimal express app with raw body for /webhooks, json middleware, mocked JWT for /api, billing gate middleware, /admin route with billing check"
  - "computeHmac helper identical to webhooks.test.js — same pattern for all HMAC-verified webhook tests"

requirements-completed: [BILL-01]

# Metrics
duration: 9min
completed: 2026-03-14
---

# Phase 4 Plan 01: Billing Test Scaffold and Schema Extension Summary

**8 failing RED billing tests and ShopSession schema extended with billingStatus/subscriptionId for Shopify Billing API gate**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-14T16:02:10Z
- **Completed:** 2026-03-14T16:10:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created tests/billing.test.js with 8 BILL-01 test cases covering the full billing lifecycle: OAuth callback redirection, /admin billing gate (null/INACTIVE/ACTIVE/live-check), /api 402 gate, and app_subscriptions/update webhook (valid + invalid HMAC)
- Extended ShopSession Prisma model with `billingStatus String? @map("billing_status")` and `subscriptionId String? @map("subscription_id")` fields
- Created migration SQL and regenerated Prisma client — schema validates and generates cleanly
- Prior 51 tests remain GREEN; billing tests fail RED with MODULE_NOT_FOUND (expected Wave 0 state)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tests/billing.test.js with 8 failing RED stubs** - `115b125` (test)
2. **Task 2: Extend Prisma schema and migrate** - `46d1c56` (feat)

**Plan metadata:** *(this commit)*

## Files Created/Modified

- `tests/billing.test.js` - 8 BILL-01 test stubs: auth callback, /admin billing gate, /api 402 gate, billing webhook HMAC
- `prisma/schema.prisma` - ShopSession extended with billingStatus and subscriptionId nullable fields
- `prisma/migrations/20260314_add_billing_status_to_shop_session/migration.sql` - ALTER TABLE SQL for Railway deployment

## Decisions Made

- **Wave 0 TDD approach:** Tests import `routes/billing.js` at file top level — MODULE_NOT_FOUND causes test suite to fail RED without individual test syntax errors. Plan 04-02 creates this file to turn tests GREEN.
- **Migration created manually:** `prisma migrate dev` requires interactive TTY (non-interactive env blocks it). Created migration SQL manually and ran `prisma generate` to regenerate client from updated schema.
- **Billing test app structure:** Minimal Express app replicating server.js middleware order — raw body before JSON parser for HMAC webhook tests, mocked JWT for /api tests, inline billing gate middleware to verify 402 behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `prisma migrate dev` failed in non-interactive environment — resolved per plan guidance by running `npx prisma generate` only and creating migration SQL manually for deployment tracking.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- tests/billing.test.js is the contract for Plan 04-02 implementation
- ShopSession schema has billing fields — Plan 04-02 can write billingStatus immediately
- Migration SQL ready for `npx prisma migrate deploy` on Railway before Plan 04-02 ships
- 8 tests fail RED, all for the right reason (missing routes/billing.js)

## Self-Check: PASSED

- tests/billing.test.js: FOUND
- prisma/schema.prisma: FOUND (billingStatus + subscriptionId confirmed)
- migration.sql: FOUND
- 04-01-SUMMARY.md: FOUND
- Commit 115b125 (test stubs): FOUND
- Commit 46d1c56 (schema extension): FOUND
- 51 prior tests: GREEN
- 8 billing tests: FAIL RED (MODULE_NOT_FOUND — expected)

---
*Phase: 04-billing*
*Completed: 2026-03-14*
