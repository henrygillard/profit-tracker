---
phase: 02-sync-and-profit-engine
plan: "05"
subsystem: api
tags: [cogs, multer, csv-parser, express, prisma, supertest]

# Dependency graph
requires:
  - phase: 02-sync-and-profit-engine
    provides: "ProductCost prisma model (Plan 01), profitEngine.getCOGSAtTime (Plan 02), JWT middleware (Phase 01)"
provides:
  - "POST /api/cogs — manual variant COGS entry (time-series insert, source: 'manual')"
  - "POST /api/cogs/csv — bulk CSV upload (multer memoryStorage + csv-parser, source: 'csv')"
  - "Input validation: variantId required, costAmount numeric, duplicate second → 409"
  - "CSV invalid rows skipped with error logging — import continues (not aborted)"
affects: ["03-dashboard", "profit-calculation", "cogs-lookup"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Time-series insert: always prisma.productCost.create, never update — COGS-04 rule enforced"
    - "multer memoryStorage → Readable.from(buffer) → csv-parser stream for CSV parsing"
    - "JWT middleware tested via real verifySessionToken in makeAppWithRealAuth() for 401 coverage"
    - "CSV source uses SKU as variantId placeholder (variantId can be null for CSV imports per COGS-03)"

key-files:
  created: []
  modified:
    - "routes/api.js — added POST /api/cogs and POST /api/cogs/csv endpoints with multer + csv-parser"
    - "tests/cogs.test.js — real supertest tests replacing scaffolds for COGS-01 and COGS-03"

key-decisions:
  - "CSV imports store variantId=sku as placeholder — SKU-only entries are valid per COGS-03, variantId can be null"
  - "Sub-millisecond effectiveFrom offset (now + imported count) prevents unique constraint collision on same-second CSV batch"
  - "Invalid CSV rows (non-numeric cost, missing sku) are skipped with console.log, not abort — partial success is valid"

patterns-established:
  - "Time-series COGS insert: always create, never upsert or update — P2002 unique constraint → 409 response"
  - "CSV parsing from buffer: multer memoryStorage → req.file.buffer → Readable.from → pipe to csv-parser"

requirements-completed: [COGS-01, COGS-02, COGS-03]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 2 Plan 05: COGS Management API Summary

**POST /api/cogs (manual variant entry) and POST /api/cogs/csv (multer + csv-parser bulk import) behind JWT middleware, with time-series insert-only pattern (COGS-04)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T18:33:37Z
- **Completed:** 2026-03-11T18:38:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- POST /api/cogs endpoint inserts a new ProductCost row per request (time-series, never updates) with validation: missing variantId → 400, missing/invalid costAmount → 400, duplicate within same second → 409
- POST /api/cogs/csv endpoint accepts multipart file upload via multer, parses CSV through csv-parser stream, skips invalid rows with logging, returns { imported, skipped, errors } summary
- All 9 cogs.test.js tests passing: manual entry (201, 400, 401), CSV import (2 rows imported), invalid CSV row skipping

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POST /api/cogs manual entry endpoint** - `fe74faf` (feat) — both tasks combined
2. **Task 2: Add POST /api/cogs/csv bulk import endpoint** - `fe74faf` (feat) — included in same commit

**Plan metadata:** (created after this summary)

_Note: Both TDD tasks were committed together in fe74faf as implementation was complete at task discovery_

## Files Created/Modified
- `routes/api.js` - Added POST /api/cogs (manual, time-series insert, 401/400/409 handling) and POST /api/cogs/csv (multer + csv-parser, invalid row skip logic)
- `tests/cogs.test.js` - Real supertest tests: makeApp() with mocked JWT, makeAppWithRealAuth() for 401 coverage, CSV attach() with Buffer

## Decisions Made
- CSV imports store variantId=sku as placeholder since CSV format has no variantId column — per COGS-03, SKU + cost is the minimum required
- Sub-millisecond effectiveFrom offset prevents unique constraint collision when importing multiple rows in same batch within the same millisecond
- Invalid CSV rows logged and skipped (not abort) — partial success is valid per COGS-03 requirement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing RED failing test in fees.test.js (line 43: `expect(false).toBe(true)`) is an intentional placeholder for shipping cost work (FEES-03) — out of scope for this plan, not caused by any changes here

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- COGS data entry API complete — merchants can now enter product costs manually or via CSV bulk import
- Profit engine has COGS data to work with — cogsTotal will be populated for orders where SKU matches
- Phase 3 dashboard can query OrderProfit records with populated cogsTotal/netProfit fields

---
*Phase: 02-sync-and-profit-engine*
*Completed: 2026-03-11*
