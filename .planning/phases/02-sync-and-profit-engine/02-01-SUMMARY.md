---
phase: 02-sync-and-profit-engine
plan: "01"
subsystem: database, testing
tags: [prisma, postgresql, jest, shopify, node-cron, multer, csv-parser]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: Prisma schema with ShopSession/OAuthState, Jest test infrastructure, existing mock patterns
provides:
  - Order, LineItem, ProductCost, OrderProfit, ShopConfig Prisma models pushed to database
  - node-cron, multer, csv-parser packages installed as production dependencies
  - tests/__mocks__/shopifyClient.js mock registered in jest.config.js moduleNameMapper
  - 19 RED (failing) test scaffolds across sync.test.js, profit.test.js, cogs.test.js, fees.test.js
affects: [02-02, 02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: [node-cron@4.2.1, multer@2.1.1, csv-parser@3.2.0]
  patterns:
    - COGS time-series via insert-only ProductCost rows (never update — new row on cost change)
    - cogsTotal NULL (not 0) signals unknown COGS — propagates to netProfit=NULL and cogsKnown=false
    - shopifyClient mock follows same jest.fn() pattern as existing prisma mock

key-files:
  created:
    - prisma/schema.prisma (extended with 5 new models)
    - tests/__mocks__/shopifyClient.js
    - tests/sync.test.js
    - tests/profit.test.js
    - tests/cogs.test.js
    - tests/fees.test.js
  modified:
    - jest.config.js (added shopifyClient moduleNameMapper entries)
    - package.json (node-cron, multer, csv-parser added to dependencies)

key-decisions:
  - "node-cron, multer, csv-parser installed as production dependencies (not devDependencies) — required at runtime for scheduling, file upload, and CSV parsing"
  - "shopifyClient mock uses jest.fn().mockResolvedValue({}) pattern identical to prisma mock — consistent mock style across all external dependencies"
  - "All 19 test scaffolds use expect(false).toBe(true) pattern for clear RED state — immediately visible why they fail without requiring any module to exist"

patterns-established:
  - "External API mocks: jest.fn() in tests/__mocks__/, registered via jest.config.js moduleNameMapper with both ../ and ./ path variants"
  - "TDD scaffold pattern: describe block per requirement ID, RED tests with expect(false).toBe(true) and message explaining what needs implementing"

requirements-completed: [SYNC-01, SYNC-02, SYNC-03, SYNC-04, COGS-01, COGS-02, COGS-03, COGS-04, FEES-01, FEES-02, FEES-03, FEES-04]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 2 Plan 01: Foundation Wave Summary

**Extended Prisma schema with 5 new models (Order, LineItem, ProductCost, OrderProfit, ShopConfig), installed 3 runtime packages, and scaffolded 19 RED test cases covering all 12 Phase 2 requirements**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T15:06:56Z
- **Completed:** 2026-03-11T15:10:18Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extended prisma/schema.prisma with 5 new models pushed to Railway PostgreSQL — Order (with line items + profit relations), LineItem, ProductCost (insert-only time-series), OrderProfit (write-time snapshot with nullable cogsTotal), ShopConfig (per-shop sync state)
- Installed node-cron (scheduler), multer (file upload), csv-parser (COGS CSV import) as production dependencies
- Created tests/__mocks__/shopifyClient.js and registered it in jest.config.js — prevents real Shopify API calls in all Phase 2 tests
- Scaffolded 4 test files with 19 RED tests covering SYNC-01 through SYNC-04, COGS-01 through COGS-04, FEES-01 through FEES-04 — all fail with assertion errors, none fail with import crashes

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Prisma schema with 5 new models and install Phase 2 packages** - `9557e54` (feat)
2. **Task 2: Create test scaffolds and shopifyClient mock** - `351011b` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `prisma/schema.prisma` - Added Order, LineItem, ProductCost, OrderProfit, ShopConfig models
- `package.json` - Added node-cron, multer, csv-parser to production dependencies
- `package-lock.json` - Updated with 11 new packages
- `tests/__mocks__/shopifyClient.js` - Jest mock for lib/shopifyClient.js
- `jest.config.js` - Added shopifyClient moduleNameMapper entries (both ../ and ./ variants)
- `tests/sync.test.js` - 7 RED scaffolds for SYNC-01 through SYNC-03
- `tests/profit.test.js` - 3 RED scaffolds for refund reversal and null COGS
- `tests/cogs.test.js` - 5 RED scaffolds for COGS-01 through COGS-04
- `tests/fees.test.js` - 4 RED scaffolds for FEES-01 through FEES-04

## Decisions Made

- node-cron, multer, csv-parser installed as production dependencies (not devDependencies) — required at runtime for scheduling, file upload, and CSV parsing
- shopifyClient mock uses jest.fn().mockResolvedValue({}) pattern identical to prisma mock — consistent mock style across all external dependencies
- All 19 test scaffolds use expect(false).toBe(true) pattern for clear RED state — immediately visible why they fail without requiring any module to exist

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npx prisma db push` succeeded immediately against Railway PostgreSQL database. All 3 npm packages installed without conflicts.

## User Setup Required

None - no external service configuration required. DATABASE_URL was already configured in .env from Phase 1.

## Next Phase Readiness

- All Phase 2 database tables now exist — sync code (02-02) and profit engine (02-03) can start immediately
- 19 failing tests define the exact TDD targets for subsequent plans
- shopifyClient mock ready — no real Shopify API calls will fire during any Phase 2 test runs
- node-cron available for scheduler implementation in 02-04
- multer and csv-parser available for COGS CSV import in 02-03

---
*Phase: 02-sync-and-profit-engine*
*Completed: 2026-03-11*

## Self-Check: PASSED

- FOUND: prisma/schema.prisma (7 models: 2 existing + 5 new)
- FOUND: tests/__mocks__/shopifyClient.js
- FOUND: tests/sync.test.js
- FOUND: tests/profit.test.js
- FOUND: tests/cogs.test.js
- FOUND: tests/fees.test.js
- FOUND: 02-01-SUMMARY.md
- FOUND commit 9557e54: feat(02-01): extend Prisma schema with 5 new models and install Phase 2 packages
- FOUND commit 351011b: feat(02-01): create shopifyClient mock and 4 failing test scaffold files
- Jest run: 19 tests FAIL (assertion errors only), 12 Phase 1 tests PASS
