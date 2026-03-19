---
phase: 07-margin-alerts
plan: 01
subsystem: testing
tags: [jest, supertest, prisma, postgres, tdd]

# Dependency graph
requires:
  - phase: 06-waterfall-chart
    provides: routes/api.js and express app structure used by test makeApp() pattern
provides:
  - Failing test stubs (RED) for ALERT-01 through ALERT-04 in tests/alerts.test.js
  - marginAlertThreshold column on ShopConfig (Decimal @default(20), migration applied)
affects: [07-02-PLAN, 07-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD RED state — 10 failing tests confirm routes do not exist, makeApp() supertest pattern extended to alerts domain]

key-files:
  created:
    - tests/alerts.test.js
    - prisma/migrations/20260318_add_margin_alert_threshold/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Migration applied via prisma db execute (not migrate dev) because Railway shadow DB is missing shop_sessions table — same pattern used by all prior migrations in this project"
  - "Manual migration file created in prisma/migrations/20260318_add_margin_alert_threshold/ following existing migration folder convention"
  - "Threshold range 0–100 enforced at PUT /api/settings validation — negative threshold has no meaning, above 100% margin is impossible"

patterns-established:
  - "alerts.test.js follows dashboard.test.js exactly: same makeApp(), same mocked JWT middleware, same supertest style"
  - "GET /api/alerts/margin mocks prisma.$queryRaw with raw SQL row shape (snake_case keys: variant_id, sku, product_name, revenue, net_profit_attr, all_cogs_known)"

requirements-completed: [ALERT-01, ALERT-02, ALERT-03, ALERT-04]

# Metrics
duration: 2min
completed: 2026-03-19
---

# Phase 7 Plan 01: Margin Alerts — TDD RED Phase Summary

**10 failing supertest stubs covering ALERT-01 through ALERT-04 and marginAlertThreshold Decimal column added to ShopConfig via manual migration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-19T05:02:37Z
- **Completed:** 2026-03-19T05:04:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created tests/alerts.test.js with 10 failing test stubs — all 404 (routes do not exist yet)
- Added marginAlertThreshold Decimal @default(20) to ShopConfig in prisma/schema.prisma
- Created and applied migration SQL to Railway DB via prisma db execute
- Full pre-existing test suite (74 tests) remains GREEN — no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing test stubs for ALERT-01 through ALERT-04** - `a980f8d` (test)
2. **Task 2: Add marginAlertThreshold to ShopConfig schema and apply migration** - `af12230` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `tests/alerts.test.js` — 10 failing supertest stubs covering GET /api/settings, PUT /api/settings, GET /api/alerts/margin
- `prisma/schema.prisma` — Added marginAlertThreshold Decimal @default(20) @map("margin_alert_threshold") @db.Decimal(6,2) to ShopConfig
- `prisma/migrations/20260318_add_margin_alert_threshold/migration.sql` — ALTER TABLE shop_configs ADD COLUMN margin_alert_threshold DECIMAL(6,2) NOT NULL DEFAULT 20

## Decisions Made

- Migration applied via `prisma db execute` rather than `migrate dev` — Railway's shadow DB is missing the shop_sessions table (P3006/P1014 error). This is the same constraint all prior migrations have encountered in this project.
- Manual migration folder created following exact naming convention of existing migrations (YYYYMMDD_description).
- Threshold validation range [0, 100] chosen: negative thresholds are meaningless, margins above 100% are impossible for physical goods.

## Deviations from Plan

None — plan executed exactly as written. The `prisma migrate dev` failure was anticipated in the plan ("If the migration command fails...create the SQL manually") and the fallback was used.

## Issues Encountered

- `prisma migrate dev` failed with P3006 (shadow DB missing shop_sessions) — resolved by manually creating migration SQL and running `prisma db execute` as the plan specified as fallback.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-02 can begin: all 10 RED tests define the contract for GET /api/settings, PUT /api/settings, GET /api/alerts/margin
- marginAlertThreshold column exists in the live Railway DB — backend implementation can query against real schema
- No blockers for 07-02

---
*Phase: 07-margin-alerts*
*Completed: 2026-03-19*

## Self-Check: PASSED

- tests/alerts.test.js: FOUND
- prisma/schema.prisma: FOUND
- prisma/migrations/20260318_add_margin_alert_threshold/migration.sql: FOUND
- .planning/phases/07-margin-alerts/07-01-SUMMARY.md: FOUND
- Commit a980f8d: FOUND
- Commit af12230: FOUND
