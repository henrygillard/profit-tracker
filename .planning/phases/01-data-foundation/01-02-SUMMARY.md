---
phase: 01-data-foundation
plan: 02
subsystem: api
tags: [express, shopify, webhooks, hmac, gdpr, prisma]

# Dependency graph
requires:
  - phase: 01-data-foundation/01-01
    provides: Jest 29 test infrastructure with supertest and prisma mock setup
provides:
  - Three GDPR-compliant webhook handlers with HMAC verification for Shopify App Store submission
  - customers/redact handler verifying HMAC and logging audit trail
  - shop/redact handler verifying HMAC and deleting ShopSession records via Prisma
  - customers/data_request handler verifying HMAC and logging audit trail
affects:
  - Phase 2 (when order data is stored, customers/redact and customers/data_request need real deletion/export logic)
  - App Store submission readiness

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GDPR webhook pattern: verify HMAC first, then parse payload, then perform operation"
    - "Phase-annotated compliance stubs: log-only in Phase 1, annotated for Phase 2+ expansion"

key-files:
  created: []
  modified:
    - routes/webhooks.js

key-decisions:
  - "customers/redact and customers/data_request log-only in Phase 1 because no customer PII is stored — real deletion/export deferred to Phase 2+ when order data is added"
  - "shop/redact uses identical deleteMany pattern as app_uninstalled handler — both ensure full shop data removal on redact"

patterns-established:
  - "GDPR handler pattern: HMAC verify → JSON.parse → operation → 200, or 401 on auth failure"
  - "Phase annotation pattern: inline comments marking Phase 1 limitations and Phase 2+ expansion points"

requirements-completed: [FOUND-01]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 1 Plan 02: GDPR Webhook Handlers Summary

**Three GDPR-compliant webhook handlers replacing stubs in routes/webhooks.js — HMAC-verified via x-shopify-hmac-sha256 header, shop/redact deletes all ShopSession records, blocking App Store submission risk eliminated**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-10T05:49:33Z
- **Completed:** 2026-03-10T05:55:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced three non-verifying GDPR stub handlers with real implementations that check HMAC before processing
- shop/redact now calls prisma.shopSession.deleteMany matching app_uninstalled pattern for full data deletion
- customers/redact and customers/data_request log audit trail (Phase 1 has no customer PII stored)
- All 4 webhook tests pass: valid HMAC returns 200, invalid HMAC returns 401, shop/redact calls Prisma deleteMany

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace GDPR stub handlers with real HMAC-verified implementations** - `a9e0aa2` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD — tests already existed from 01-01 (RED). This plan delivered the GREEN implementation._

## Files Created/Modified
- `routes/webhooks.js` - Replaced three stub handlers with HMAC-verified GDPR handlers; kept all existing code above stubs intact

## Decisions Made
- customers/redact and customers/data_request are log-only in Phase 1 because no customer PII is stored — Phase 2+ will add actual deletion/export when order records are introduced
- shop/redact uses the identical deleteMany({ where: { shop: myshopify_domain } }) pattern already proven in app_uninstalled

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - implementation matched the provided code snippets directly; tests passed on first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GDPR compliance requirement FOUND-01 is resolved — App Store submission blocker eliminated
- routes/webhooks.js has no remaining console.warn TODO stubs
- Phase 2: when order data is added, update customers/redact and customers/data_request with real deletion/export logic (annotated in code)

## Self-Check: PASSED

- routes/webhooks.js: FOUND
- 01-02-SUMMARY.md: FOUND
- Commit a9e0aa2: FOUND

---
*Phase: 01-data-foundation*
*Completed: 2026-03-10*
