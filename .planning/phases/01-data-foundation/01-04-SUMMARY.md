---
phase: 01-data-foundation
plan: "04"
subsystem: infra
tags: [shopify, oauth, env-validation, toml]

# Dependency graph
requires:
  - phase: 01-data-foundation plan 01
    provides: Test infrastructure (Jest 29 + Supertest, scopes.test.js and env.test.js scaffold)
provides:
  - "shopify.app.profit-tracker.toml with scopes = \"\" (no excess scopes for App Review)"
  - "server.js REQUIRED_ENV includes SHOPIFY_SCOPES — startup fails fast on misconfiguration"
affects:
  - 02-sync-profit-engine
  - any deployment that sets env vars

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REQUIRED_ENV fail-fast array in server.js — add new env vars here before using them"
    - "toml access_scopes: empty for Phase 1, Phase 2 scopes listed as comments for reviewers"

key-files:
  created: []
  modified:
    - shopify.app.profit-tracker.toml
    - server.js

key-decisions:
  - "Phase 1 scopes set to empty string — App Review rejects unjustified scopes, no Admin API calls in Phase 1"
  - "Phase 2 scopes (read_orders, read_products, read_inventory, read_shopify_payments_payouts) documented as comments in toml, not active"
  - "read_all_orders requires Partner Dashboard pre-approval — submit before Phase 2 starts"

patterns-established:
  - "Scope roadmap pattern: active scopes empty, future scopes as inline comments in toml"

requirements-completed:
  - FOUND-02
  - FOUND-03

# Metrics
duration: 3min
completed: "2026-03-11"
---

# Phase 1 Plan 04: Scope Pruning and Env Validation Summary

**Replaced 150-scope Shopify CLI default with scopes = "" and added SHOPIFY_SCOPES to server.js REQUIRED_ENV fail-fast check**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T03:28:57Z
- **Completed:** 2026-03-11T03:31:30Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Removed 150-scope default string from shopify.app.profit-tracker.toml — Phase 1 makes no Admin API calls
- Added Phase 2 scope roadmap as comments (read_orders, read_products, read_inventory, read_shopify_payments_payouts)
- Added SHOPIFY_SCOPES to REQUIRED_ENV array in server.js — deployment fails fast if not set
- All 4 target tests pass: scopes.test.js (1 test) + env.test.js (3 tests); full suite 12/12

## Task Commits

Each task was committed atomically:

1. **Task 1: Prune toml scope list to empty and add SHOPIFY_SCOPES to env validation** - `38289bb` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD task — tests were pre-existing scaffold from Plan 01; implementation makes them green_

## Files Created/Modified
- `shopify.app.profit-tracker.toml` - Replaced 150-scope string with scopes = "" plus Phase 2 roadmap comments
- `server.js` - Added 'SHOPIFY_SCOPES' to REQUIRED_ENV array (line 4)

## Decisions Made
- Phase 1 scopes set to empty string per plan — App Review requires justification for every scope; no Admin API calls happen in Phase 1
- Phase 2 scopes documented as inline comments so they are visible to reviewers without being active
- read_all_orders requires Partner Dashboard pre-approval (submit to read-all-orders-request@shopify.com before Phase 2)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FOUND-02 (scope pruning) and FOUND-03 (env validation) requirements are complete
- Phase 1 data foundation plans are all done — ready for Phase 2 sync/profit engine
- Before Phase 2: submit read_all_orders approval to Shopify Partner Dashboard

---
*Phase: 01-data-foundation*
*Completed: 2026-03-11*
