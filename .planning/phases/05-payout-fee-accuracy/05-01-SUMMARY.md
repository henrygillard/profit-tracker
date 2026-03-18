---
phase: 05-payout-fee-accuracy
plan: "01"
subsystem: database
tags: [prisma, postgres, schema-migration, tdd, fee-accuracy]

# Dependency graph
requires: []
provides:
  - "OrderProfit.feeSource column (fee_source VARCHAR DEFAULT 'estimated') in Railway Postgres"
  - "Red test baseline for FEEX-01 (calculateOrderProfit returns feeSource), FEEX-02 (API serializes feeSource), FEEX-03 (upsertOrder writes correct feeSource), FEEX-04 (refunds/create preserves feeSource)"
  - "Extended prisma mock with order, lineItem, shopConfig, orderProfit.upsert, $transaction for full upsertOrder test support"
affects: [05-02, 05-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "prisma db push (not migrate dev) for schema changes — Railway Postgres uses push workflow"
    - "Red baseline TDD: failing assertions on feeSource document contract for Plans 02 and 03"

key-files:
  created:
    - ".planning/phases/05-payout-fee-accuracy/05-01-SUMMARY.md"
  modified:
    - "prisma/schema.prisma"
    - "tests/fees.test.js"
    - "tests/dashboard.test.js"
    - "tests/webhooks.test.js"
    - "tests/__mocks__/prisma.js"

key-decisions:
  - "feeSource defaults to 'estimated' so all pre-Phase-5 rows are safe without data loss"
  - "FEEX-03 tests use a full mock prisma (order, lineItem, shopConfig, orderProfit.upsert) so upsertOrder runs to completion and fails on the feeSource assertion — not on a TypeError"
  - "FEEX-04 second test uses setTimeout(50ms) to wait for setImmediate handler and asserts on prisma.orderProfit.upsert (not update) matching the actual route code"
  - "Extended tests/__mocks__/prisma.js with order, lineItem, shopConfig mocks to support upsertOrder testing in fees.test.js and webhooks.test.js"

patterns-established:
  - "Test mock shape must match real prisma call graph — full mock ensures tests fail on assertion, not TypeError"
  - "Red baseline tests include expected failure messages in comments so Plan 02/03 executors understand the contract"

requirements-completed: [FEEX-01, FEEX-02, FEEX-03, FEEX-04]

# Metrics
duration: 15min
completed: 2026-03-18
---

# Phase 5 Plan 01: Schema Foundation and Red Test Baseline Summary

**feeSource VARCHAR DEFAULT 'estimated' column added to order_profits table via prisma db push, with 6 red baseline tests documenting the FEEX-01..04 contract for Plans 02 and 03**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-18T20:15:00Z
- **Completed:** 2026-03-18T20:32:58Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Applied `ALTER TABLE order_profits ADD COLUMN fee_source VARCHAR DEFAULT 'estimated'` to Railway Postgres via prisma db push (non-blocking, all existing rows received 'estimated')
- Verified Prisma client can read/write feeSource without error (returned 'estimated' on first query)
- Created 6 red baseline tests across fees.test.js, dashboard.test.js, and webhooks.test.js that assert the full feeSource contract
- Extended the shared prisma mock to support complete upsertOrder execution (order.upsert, lineItem.deleteMany/createMany, orderProfit.upsert, shopConfig.findFirst, $transaction)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add feeSource to OrderProfit schema and apply migration** - `993bfc3` (feat)
2. **Task 2: Create failing test scaffolds for feeSource behaviors** - `a9e513d` (test)

## Files Created/Modified
- `prisma/schema.prisma` - Added feeSource field to OrderProfit model
- `tests/fees.test.js` - Added 4 new describe blocks: FEEX-01 (calculateOrderProfit), FEEX-01 (syncPayouts), FEEX-03 (upsertOrder Shopify Payments), FEEX-03 (upsertOrder third-party)
- `tests/dashboard.test.js` - Added FEEX-02 test inside DASH-02 describe block
- `tests/webhooks.test.js` - Added FEEX-04 describe block with 2 tests for refunds/create feeSource preservation
- `tests/__mocks__/prisma.js` - Extended mock with order, lineItem, shopConfig, orderProfit.upsert, $transaction

## Decisions Made
- Used `feeSource String @default("estimated")` — 'estimated' is the safe default for all pre-Phase-5 orders that never went through syncPayouts
- For FEEX-03 tests, built a full mock prisma (not just `$transaction`) so `upsertOrder` runs completely and the test fails on the feeSource assertion rather than crashing on `TypeError: Cannot read properties of undefined (reading 'upsert')`
- For FEEX-04, the second test uses `setTimeout(50ms)` to allow the `setImmediate` async handler in routes/webhooks.js to complete before asserting on `prisma.orderProfit.upsert`
- Extended the shared `tests/__mocks__/prisma.js` rather than creating per-test mocks — this keeps dashboard.test.js and webhooks.test.js using the same mock base

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed FEEX-03 test mock shape to prevent TypeError**
- **Found during:** Task 2 (test scaffold creation)
- **Issue:** Plan specified a mock with only `$transaction` and `shopConfig`, but `upsertOrder` calls `prisma.order.upsert`, `prisma.lineItem.deleteMany`, `prisma.lineItem.createMany`, and `prisma.orderProfit.upsert` — all were undefined, causing TypeErrors instead of assertion failures
- **Fix:** Built a `makeFullMockPrisma()` helper with all required properties so the function runs to completion and fails on the feeSource assertion
- **Files modified:** tests/fees.test.js
- **Verification:** Tests now fail with "Expected: ObjectContaining {feeSource: 'pending'}, Received: {cogsKnown: true, ...}" — the correct red baseline
- **Committed in:** a9e513d

**2. [Rule 1 - Bug] Fixed FEEX-04 second test to use orderProfit.upsert not .update**
- **Found during:** Task 2 (webhooks test scaffold)
- **Issue:** Plan template used `prisma.orderProfit.update` but the actual refunds/create route calls `upsertOrder` which uses `prisma.orderProfit.upsert`; also `prisma.orderProfit.update` was not in the shared mock causing a "Matcher error: received value must be a mock or spy function"
- **Fix:** Changed assertion to `prisma.orderProfit.upsert`, added `setTimeout(50ms)` to wait for setImmediate handler, added `order.findUnique` mock setup; extended shared prisma mock with `orderProfit.upsert`
- **Files modified:** tests/webhooks.test.js, tests/__mocks__/prisma.js
- **Verification:** Test now fails with correct assertion: "Expected: ObjectContaining {feeSource: 'verified'}, Received: {cogsKnown: true, ...}"
- **Committed in:** a9e513d

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs in plan's proposed test mock shapes)
**Impact on plan:** Both fixes necessary for red baseline to work correctly. No scope creep — all changes are within the test scaffolding task.

## Issues Encountered
- DATABASE_URL was not in the shell environment — loaded from `.env` file using `export $(grep -v '^#' .env | xargs)` before running `prisma db push`. Migration applied successfully on first attempt.

## User Setup Required
None - no external service configuration required beyond what already existed.

## Next Phase Readiness
- `fee_source` column exists in Railway Postgres with 'estimated' default — Plans 02 and 03 can write to it immediately
- 6 red tests document the full feeSource contract: calculateOrderProfit must return feeSource, syncPayouts must write 'verified', upsertOrder must write 'pending'/'estimated' by gateway, refunds/create must preserve 'verified'
- Existing SYNC-04 test at line 132 (expects `data: { feesTotal: 2.50 }`) will FAIL when Plan 02 adds `feeSource: 'verified'` — this is expected and documented in the plan context

---
*Phase: 05-payout-fee-accuracy*
*Completed: 2026-03-18*
