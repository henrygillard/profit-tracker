---
phase: 05-payout-fee-accuracy
plan: "02"
subsystem: api
tags: [profitEngine, syncOrders, syncPayouts, webhooks, feeSource, state-machine]

# Dependency graph
requires:
  - phase: 05-payout-fee-accuracy-01
    provides: feeSource column in OrderProfit schema (Prisma migration + RED test scaffolds)

provides:
  - calculateOrderProfit returns feeSource in result (pending|estimated)
  - determineFeeSourceFromOrder pure helper exported from profitEngine
  - upsertOrder writes feeSource at order write time (6th arg existingFeeSource passthrough)
  - syncPayouts writes feeSource: verified alongside feesTotal
  - refunds/create webhook reads and preserves existing feeSource from order.profit.feeSource
  - dashboard/orders API response includes feeSource field

affects:
  - 05-payout-fee-accuracy-03
  - UI badge rendering (feeSource field now in API response)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "feeSource state machine: pending (SP + no fee) | estimated (3rd-party or SP with fee) | verified (syncPayouts only)"
    - "existingFeeSource passthrough: refund handler reads DB feeSource and passes as 6th arg to upsertOrder"
    - "jest.mock call-through wrapper: module-level mock wraps real implementation in jest.fn for spying"

key-files:
  created: []
  modified:
    - lib/profitEngine.js
    - lib/syncOrders.js
    - lib/syncPayouts.js
    - routes/webhooks.js
    - routes/api.js
    - tests/fees.test.js
    - tests/webhooks.test.js

key-decisions:
  - "determineFeeSourceFromOrder never returns 'verified' — only syncPayouts may set that value"
  - "existingFeeSource passthrough: OR operator (existingFeeSource || profitResult.feeSource) so null/undefined falls through to computed value"
  - "jest.mock with call-through wrapper chosen over jest.spyOn because routes/webhooks.js destructures upsertOrder at require time — spy on module property cannot intercept cached binding"
  - "FEEX-02 (feeSource in API response) fixed as Rule 2 deviation — pre-existing RED test from Plan 01 scaffolds"

patterns-established:
  - "feeSource in orderProfit upsert: always include feeSource in both create and update blocks"
  - "Refund handler pattern: read existingFeeSource from order.profit?.feeSource before calling upsertOrder"

requirements-completed:
  - FEEX-01
  - FEEX-03
  - FEEX-04

# Metrics
duration: 25min
completed: 2026-03-18
---

# Phase 05 Plan 02: feeSource State Machine Implementation Summary

**feeSource state machine wired across all three write paths: profitEngine (pending/estimated), syncPayouts (verified), refund webhook (passthrough) — plus feeSource in dashboard API response**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-18T20:34:15Z
- **Completed:** 2026-03-18T21:05:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- `calculateOrderProfit` now returns `feeSource` (`pending` | `estimated`) in result object
- `upsertOrder` writes `feeSource` to `orderProfit` create/update data with 6th arg passthrough for refund handler
- `syncPayouts` writes `feeSource: 'verified'` alongside `feesTotal` — the only code path that sets verified
- `refunds/create` webhook reads `order.profit.feeSource` and preserves it through upsert, preventing verified orders from being downgraded
- Dashboard orders API endpoint now includes `feeSource` in response for UI badge rendering (FEEX-02)
- All 68 tests green with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add feeSource to profitEngine and upsertOrder write path** - `27d3860` (feat)
2. **Task 2: syncPayouts writes 'verified' + refund handler preserves feeSource** - `90aefe3` (feat)
3. **Task 3: Wire refund feeSource tests and run full suite** - `34472e4` (feat)

_Note: TDD tasks — tests were pre-written as RED scaffolds in Plan 01; implementation made them GREEN in this plan_

## Files Created/Modified

- `lib/profitEngine.js` - Added `determineFeeSourceFromOrder` helper + `feeSource` in `calculateOrderProfit` return; exported `determineFeeSourceFromOrder`
- `lib/syncOrders.js` - Added `existingFeeSource = null` 6th param to `upsertOrder`; fixed `calculateOrderProfit` call shape; added `feeSource` to orderProfit upsert create/update
- `lib/syncPayouts.js` - Added `feeSource: 'verified'` to `orderProfit.update` data; updated JSDoc
- `routes/webhooks.js` - Refund handler reads `order.profit?.feeSource` and passes as 6th arg to `upsertOrder`
- `routes/api.js` - Added `feeSource: op.feeSource || 'estimated'` to dashboard/orders response mapping
- `tests/fees.test.js` - Updated SYNC-04 test assertion to expect `feeSource: 'verified'` in update data
- `tests/webhooks.test.js` - Added module-level `jest.mock` call-through wrapper; added FEEX-04 spy-based describe block with 2 tests asserting `callArgs[5] === 'verified'`

## Decisions Made

- `determineFeeSourceFromOrder` never returns `'verified'` — only `syncPayouts` may set that state. This is a hard invariant enforced by design.
- Used `existingFeeSource || profitResult.feeSource` (OR fallthrough) in `upsertOrder` so refund handler can pass `null` to get computed value or pass `'verified'` to preserve status.
- `jest.mock` with call-through wrapper (`jest.fn(actualFn)`) chosen for FEEX-04 spy tests because `routes/webhooks.js` destructures `upsertOrder` at module require time — `jest.spyOn` cannot intercept the already-bound local reference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed calculateOrderProfit call in upsertOrder**
- **Found during:** Task 1 (Add feeSource to profitEngine and upsertOrder)
- **Issue:** `syncOrders.js` was calling `calculateOrderProfit(obj1, obj2)` with two separate objects, but the function signature accepts a single `order` object. `shopifyPaymentsFee` and `planDisplayName` (passed as `shopPlan`) were being silently ignored.
- **Fix:** Merged the two argument objects into one correctly shaped call with all fields including `shopifyPaymentsFee` and `planDisplayName: shopPlan`
- **Files modified:** `lib/syncOrders.js`
- **Verification:** FEEX-03 tests pass; fee calculation works correctly with plan rates
- **Committed in:** `27d3860` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed jest.spyOn not intercepting destructured upsertOrder**
- **Found during:** Task 3 (Wire refund feeSource tests)
- **Issue:** `jest.spyOn(syncOrders, 'upsertOrder')` after module load cannot intercept calls in `routes/webhooks.js` because the route destructures `upsertOrder` into a local `const` at require time. The spy modifies the module export property but the route holds a cached reference to the original function.
- **Fix:** Added `jest.mock('../lib/syncOrders', ...)` with a call-through factory (`jest.fn(actual.upsertOrder)`) at the top of the test file so the mock is in place before the router module loads. Both the call-through behavior (for existing tests) and the spy override (for FEEX-04 tests) are available.
- **Files modified:** `tests/webhooks.test.js`
- **Verification:** All 68 tests pass including the 2 new FEEX-04 spy tests
- **Committed in:** `34472e4` (Task 3 commit)

**3. [Rule 2 - Missing Critical] Added feeSource to dashboard orders API response**
- **Found during:** Task 3 (full test suite run)
- **Issue:** `routes/api.js` dashboard/orders endpoint was not including `feeSource` in the response mapping. The FEEX-02 test (written as RED scaffold in Plan 01) was failing.
- **Fix:** Added `feeSource: op.feeSource || 'estimated'` to the response map — defaults to `'estimated'` for pre-Phase-5 rows that have no feeSource stored.
- **Files modified:** `routes/api.js`
- **Verification:** FEEX-02 dashboard test passes; full suite green
- **Committed in:** `34472e4` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 bug, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness and test validity. No scope creep.

## Issues Encountered

- None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three feeSource write paths confirmed working: `syncOrders` (pending/estimated), `syncPayouts` (verified), `webhooks refund` (passthrough)
- FEEX-01, FEEX-03, FEEX-04 requirements complete
- FEEX-02 (dashboard API) complete as deviation fix
- Plan 03 can proceed to wire the frontend UI badge rendering using the `feeSource` field now in the API response

---
*Phase: 05-payout-fee-accuracy*
*Completed: 2026-03-18*
