---
phase: 02-sync-and-profit-engine
plan: "03"
subsystem: sync, database, testing
tags: [shopify, bulk-operations, jsonl, prisma, node-cron, jest, incremental-sync]

# Dependency graph
requires:
  - phase: 02-sync-and-profit-engine
    plan: "01"
    provides: Prisma schema with Order/LineItem/OrderProfit/ShopConfig models, node-cron installed, shopifyClient mock registered, sync.test.js scaffolds
  - phase: 02-sync-and-profit-engine
    plan: "02"
    provides: calculateOrderProfit and getCOGSAtTime (mocked in tests, real lib available when running in production alongside 02-02)
provides:
  - lib/syncOrders.js with triggerBulkSync, processBulkResult, upsertOrder, syncIncrementalOrders, extractCOGS, parseOrderFromShopify
  - lib/scheduler.js with startScheduler (node-cron 15-minute schedule, noOverlap)
  - server.js wired to call startScheduler(prisma, syncIncrementalOrders) after all routes mounted
  - tests/sync.test.js: 5 tests GREEN (bulk trigger, JSONL parser, upsert, scheduler x2); webhook scaffolds remain RED for Plan 04
  - tests/__mocks__/profitEngine.js mock for calculateOrderProfit and getCOGSAtTime
affects: [02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bulk JSONL streaming via Node built-ins (https.get + readline) — no extra packages needed
    - JSONL child-to-parent assembly: buffer children by __parentId, attach to root orders on rl.close
    - upsertOrder uses prisma.$transaction([...]) array form for atomicity across Order, LineItem, and OrderProfit
    - syncIncrementalOrders uses cursor pagination (endCursor) until hasNextPage is false
    - Scheduler catches per-shop errors so one shop failure never aborts the rest

key-files:
  created:
    - lib/syncOrders.js
    - lib/scheduler.js
    - tests/__mocks__/profitEngine.js
  modified:
    - tests/sync.test.js (replaced scaffolds 1-3 and 7 with real assertions)
    - server.js (added scheduler + syncOrders requires, startScheduler call)
    - jest.config.js (added profitEngine and ./shopifyClient moduleNameMapper entries)

key-decisions:
  - "profitEngine mock uses jest.mock(..., { virtual: true }) inline in sync.test.js (NOT added to moduleNameMapper) — profit.test.js, fees.test.js, and cogs.test.js will import the real lib/profitEngine once Plan 02-02 creates it"
  - "Added './shopifyClient' (no lib/ prefix) moduleNameMapper entry because lib/syncOrders.js requires siblings without path prefix; profitEngine uses inline virtual mock instead"
  - "upsertOrder uses array form of prisma.$transaction (not callback form) — matches Prisma recommendation for simple sequential writes"
  - "processBulkResult uses Node built-in https + readline for JSONL streaming — avoids adding a new npm package for a one-off operation"

patterns-established:
  - "Sibling-require mocking: add '^./ModuleName$' to moduleNameMapper alongside '^../lib/ModuleName$' for modules in lib/ that require other lib/ siblings"
  - "Scheduler error isolation: per-shop try/catch inside the cron callback — one failing shop must never abort the scheduler run"

requirements-completed: [SYNC-01, SYNC-02, SYNC-03]

# Metrics
duration: 7min
completed: 2026-03-11
---

# Phase 2 Plan 03: Order Sync Engine Summary

**Streaming JSONL bulk sync, paginated incremental sync, atomic order+profit upserts, and 15-minute cron polling backstop wired into production server**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-11T15:13:28Z
- **Completed:** 2026-03-11T15:20:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Implemented lib/syncOrders.js with 6 exports: bulk trigger (bulkOperationRunQuery mutation), streaming JSONL parser (https + readline, no extra packages), atomic upsertOrder (Order + LineItems + OrderProfit in single prisma.$transaction), incremental paginated sync from lastOrderSyncedAt cursor, extractCOGS, and parseOrderFromShopify normalizer
- Implemented lib/scheduler.js with startScheduler using node-cron 15-minute schedule and noOverlap option — per-shop errors are caught and logged so one failing shop never aborts the rest
- Wired startScheduler(prisma, syncIncrementalOrders) into server.js after all routes are mounted so the SYNC-03 polling backstop is live in production
- Replaced 4 scaffold tests with real assertions: 5/8 sync tests now GREEN; webhook scaffolds intentionally remain RED for Plan 04

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement lib/syncOrders.js — bulk trigger, JSONL parser, order upsert** - `df14aa9` (feat)
2. **Task 2: Implement lib/scheduler.js, make scheduler test green, wire into server.js** - `3f74c7e` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `lib/syncOrders.js` - 6 exports: triggerBulkSync, processBulkResult, upsertOrder, syncIncrementalOrders, extractCOGS, parseOrderFromShopify
- `lib/scheduler.js` - startScheduler with node-cron 15-minute cron, noOverlap, per-shop error isolation
- `tests/__mocks__/profitEngine.js` - Jest mock for calculateOrderProfit and getCOGSAtTime
- `tests/sync.test.js` - Replaced scaffolds 1-3 and 7-8 with real test logic; 5 tests GREEN
- `server.js` - Added scheduler + syncOrders requires; startScheduler called after all routes mounted
- `jest.config.js` - Added profitEngine and ./shopifyClient (sibling-require) moduleNameMapper entries

## Decisions Made

- Added `'^./shopifyClient$'` and `'^./profitEngine$'` to jest.config.js moduleNameMapper alongside the existing `'^../lib/shopifyClient$'` entries — lib/ modules that require siblings use `'./name'` paths, not `'../lib/name'` paths, so both variants are needed.
- Used array form of `prisma.$transaction([...])` for upsertOrder rather than the callback (interactive transaction) form — simpler for a fixed set of 4 sequential operations.
- processBulkResult uses Node's built-in `https` and `readline` for JSONL streaming — avoids adding a dependency for a single streaming use-case.
- Scheduler wraps each `syncFn` call in try/catch — prevents one shop's sync failure from blocking all remaining shops in the same cron tick.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ./shopifyClient and ./profitEngine moduleNameMapper entries**
- **Found during:** Task 1 (running GREEN phase tests)
- **Issue:** Jest moduleNameMapper only had `'^../lib/shopifyClient$'` and `'^./lib/shopifyClient$'` patterns. When lib/syncOrders.js requires `'./shopifyClient'` (sibling require, no lib/ prefix), Jest could not find the mock and loaded the real shopifyClient.js, which called `fetch` (undefined in Node 16 test env).
- **Fix:** Added `'^./shopifyClient$'` and `'^./profitEngine$'` patterns to jest.config.js, and created tests/__mocks__/profitEngine.js mock file.
- **Files modified:** jest.config.js, tests/__mocks__/profitEngine.js
- **Verification:** All 3 Task 1 tests pass GREEN after fix.
- **Committed in:** df14aa9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Auto-fix was essential for test isolation correctness. No scope creep — fix stays within the mock infrastructure pattern established in Plan 01.

## Issues Encountered

None beyond the moduleNameMapper deviation above, which was self-contained.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- lib/syncOrders.js and lib/scheduler.js are complete — Plan 04 (webhook handlers) can import upsertOrder and parseOrderFromShopify immediately
- Webhook scaffold tests in sync.test.js are clearly marked RED with assertion messages explaining what needs implementing
- profitEngine mock is registered — Plan 04 webhook tests will work without waiting for Plan 02 to complete
- startScheduler is live in production server.js — SYNC-03 polling backstop is operational as soon as server restarts

---
*Phase: 02-sync-and-profit-engine*
*Completed: 2026-03-11*

## Self-Check: PASSED

- FOUND: lib/syncOrders.js (6 exports verified)
- FOUND: lib/scheduler.js (startScheduler export verified)
- FOUND: tests/__mocks__/profitEngine.js
- FOUND: 02-03-SUMMARY.md
- FOUND commit df14aa9: feat(02-03): implement lib/syncOrders.js
- FOUND commit 3f74c7e: feat(02-03): implement lib/scheduler.js and wire startScheduler into server.js
- Jest sync.test.js: 5 PASS (bulk trigger, JSONL parser, upsert, scheduler x2), 3 FAIL (webhook scaffolds - intentionally RED for Plan 04)
