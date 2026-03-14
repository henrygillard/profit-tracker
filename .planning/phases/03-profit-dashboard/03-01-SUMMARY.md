---
phase: 03-profit-dashboard
plan: 01
subsystem: testing
tags: [jest, supertest, prisma, tdd, dashboard, api]

# Dependency graph
requires:
  - phase: 02-sync-and-profit-engine
    provides: orderProfit model, routes/api.js express router, lib/prisma mock pattern, supertest test patterns

provides:
  - Failing test scaffold for all 9 DASH-01–05 dashboard route behaviors
  - Extended prisma mock with orderProfit.aggregate, orderProfit.count, orderProfit.findMany, and $queryRaw
  - Exact API contracts (URL, params, response shape) for Plan 03-02 to implement against
affects:
  - 03-profit-dashboard plan 02 (implements routes to make these tests GREEN)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD RED phase — tests written before any implementation exists
    - Prisma mock extended incrementally (never replaced) to support new model
    - supertest + mocked JWT middleware pattern for API route testing
    - mockResolvedValueOnce per-test setup for isolated prisma behavior

key-files:
  created:
    - tests/dashboard.test.js
  modified:
    - tests/__mocks__/prisma.js

key-decisions:
  - "Dashboard tests use mocked JWT middleware (always-authenticated) — same pattern as cogs.test.js; real JWT tested in auth.test.js"
  - "All 9 tests fail with 404 (not syntax/import errors) — confirms contracts are defined before routes exist (Nyquist compliance)"
  - "prisma.$queryRaw goes at top level of mock object (not nested) — matches real PrismaClient API"
  - "beforeEach(() => jest.clearAllMocks()) used to reset mock state — jest.config.js clearMocks:true also set, belt-and-suspenders"

patterns-established:
  - "Pattern 1: Extend prisma mock incrementally — new models are added to existing object, never replacing it"
  - "Pattern 2: TDD RED scaffold — test file establishes API contract shape before route handler exists"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05]

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 3 Plan 01: Dashboard Test Scaffold Summary

**9 TDD RED test stubs for DASH-01–DASH-05 dashboard API routes with extended prisma mock supporting orderProfit and $queryRaw**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-13T17:00:00Z
- **Completed:** 2026-03-13T17:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended prisma mock with orderProfit (aggregate, count, findMany) and top-level $queryRaw — all existing mocks preserved
- Created tests/dashboard.test.js with 9 failing test stubs covering all DASH-01 through DASH-05 behaviors
- Verified full test suite: 9 failing (dashboard, expected), 42 passing (all pre-existing Phase 2 tests)
- Confirmed failures are assertion failures ("expected 404 to equal 200"), not import/syntax errors — Nyquist compliance achieved

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend prisma mock to support orderProfit and $queryRaw** - `14bf835` (chore)
2. **Task 2: Write failing test stubs for all dashboard route behaviors** - `3ba82ea` (test)

**Plan metadata:** (committed with this summary)

## Files Created/Modified

- `tests/__mocks__/prisma.js` - Extended with orderProfit.aggregate, orderProfit.count, orderProfit.findMany, and $queryRaw
- `tests/dashboard.test.js` - 9 failing TDD RED stubs for DASH-01 through DASH-05

## Decisions Made

- Dashboard tests use mocked JWT middleware (always-authenticated pattern from cogs.test.js) — real JWT testing is in auth.test.js
- All 9 tests intentionally fail with 404 — this is the correct RED state before Plan 03-02 adds the routes
- `prisma.$queryRaw` placed at top-level of mock object (not nested under a model), matching real PrismaClient API
- `beforeEach(() => jest.clearAllMocks())` used to isolate per-test prisma mock state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — the `jest is not defined` error when calling `node -e` to verify the mock is expected behavior (jest globals only exist inside the Jest runtime). Confirmed correctness by running the actual test suite which loaded the mock successfully.

## Next Phase Readiness

- API contracts fully defined in tests/dashboard.test.js — Plan 03-02 implements against these contracts
- All 5 endpoint shapes locked: /api/dashboard/overview, /api/dashboard/orders, /api/dashboard/products, /api/dashboard/trend
- Prisma mock ready for route handlers that use orderProfit and $queryRaw

---
*Phase: 03-profit-dashboard*
*Completed: 2026-03-13*
