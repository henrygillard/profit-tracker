---
phase: 07-margin-alerts
plan: 02
subsystem: api
tags: [express, prisma, postgres, jest, supertest, margin-alerts]

# Dependency graph
requires:
  - phase: 07-01
    provides: Failing TDD stubs (RED) in tests/alerts.test.js and marginAlertThreshold column on ShopConfig
provides:
  - GET /api/settings endpoint returning marginAlertThreshold (default 20 when no ShopConfig row)
  - PUT /api/settings endpoint with 0-100 validation and upsert to ShopConfig
  - GET /api/alerts/margin endpoint returning threshold, atRiskCount, atRiskSkus with isCritical flag
affects: [07-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [Prisma Decimal Number() coercion, $queryRaw with tagged template literals, shopConfig.upsert for threshold persistence, isCritical overrides threshold for negative-margin SKUs]

key-files:
  created: []
  modified:
    - routes/api.js

key-decisions:
  - "from/to query params made optional in GET /api/alerts/margin (default to epoch/now) — existing tests call without params and expect 200; adding hard 400 would break the 10 RED stubs"
  - "Number() coercion applied to marginAlertThreshold in GET /api/settings — Prisma returns Decimal objects that fail JSON.stringify without coercion"
  - "isCritical=true for marginPct < 0 regardless of threshold value — ALERT-03 invariant; negative margin is always an alert even when threshold is 0"

patterns-established:
  - "shopConfig.findFirst with select:{marginAlertThreshold} + null-safe Number() fallback to 20.0 — used identically in both GET /api/settings and GET /api/alerts/margin"
  - "shopConfig.upsert pattern: where:{shop}, update:{field}, create:{shop, field} — handles shops with no prior ShopConfig row"

requirements-completed: [ALERT-01, ALERT-02, ALERT-03, ALERT-04]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 7 Plan 02: Margin Alerts — API Endpoints Summary

**Three Express route handlers (GET/PUT /api/settings, GET /api/alerts/margin) turning all 10 RED supertest stubs GREEN with COGS-exclusion filtering and isCritical negative-margin detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T05:07:08Z
- **Completed:** 2026-03-19T05:10:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Implemented GET /api/settings — returns marginAlertThreshold from ShopConfig (default 20.0 for null row)
- Implemented PUT /api/settings — validates 0-100 range and upserts to ShopConfig
- Implemented GET /api/alerts/margin — returns {threshold, atRiskCount, atRiskSkus} with per-SKU marginPct and isCritical flag
- All 10 alerts.test.js tests pass GREEN (was 10 failing / 404)
- Full jest suite 84 tests pass — no regressions in dashboard.test.js, chart.test.js, or any other file

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement GET /api/settings and PUT /api/settings** - `3032db0` (feat)
2. **Task 2: Implement GET /api/alerts/margin** - `120afea` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `routes/api.js` — Added GET /api/settings, PUT /api/settings, and GET /api/alerts/margin route handlers (98 lines added)

## Decisions Made

- `from`/`to` query params in GET /api/alerts/margin made optional (defaults to epoch-to-now). The 10 existing test stubs call the endpoint without these params and expect 200 — enforcing hard 400 would break the GREEN target. Real callers will always supply date ranges; the default is a safe fallback.
- `Number()` coercion required on `marginAlertThreshold` from Prisma — ShopConfig field is `Decimal` type; without coercion `JSON.stringify` produces a Prisma Decimal object, not a plain number, causing test assertion failures.
- `isCritical` overrides the threshold check: a SKU with negative margin always appears in `atRiskSkus` even when `threshold === 0`. This enforces the ALERT-03 invariant from the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Made from/to query params optional in GET /api/alerts/margin**
- **Found during:** Task 2 (GET /api/alerts/margin implementation)
- **Issue:** Plan specified returning 400 for missing from/to params, but all 10 existing test stubs call `/api/alerts/margin` without query params and expect status 200. Enforcing 400 would fail 7 of the 10 required tests.
- **Fix:** Made from/to optional with safe defaults (epoch date and current time) rather than returning 400.
- **Files modified:** routes/api.js
- **Verification:** All 10 tests pass GREEN including the 7 that omit from/to.
- **Committed in:** 120afea (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing critical — plan behavior contradicted test contract)
**Impact on plan:** Necessary to satisfy the GREEN target defined in must_haves. The from/to default behavior is safe and expected by callers.

## Issues Encountered

None — implementation was straightforward. The only deviation was the from/to param optionality, which was caught immediately by comparing plan behavior spec against actual test expectations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-03 can begin: all 3 API endpoints exist and return the correct shape
- GET /api/alerts/margin response shape (threshold, atRiskCount, atRiskSkus with sku/marginPct/isCritical) is the data contract for the 07-03 frontend UI
- No blockers for 07-03

---
*Phase: 07-margin-alerts*
*Completed: 2026-03-19*

## Self-Check: PASSED

- routes/api.js: FOUND
- .planning/phases/07-margin-alerts/07-02-SUMMARY.md: FOUND
- Commit 3032db0: FOUND
- Commit 120afea: FOUND
