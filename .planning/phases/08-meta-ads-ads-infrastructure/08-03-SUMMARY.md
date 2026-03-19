---
phase: 08-meta-ads-ads-infrastructure
plan: 03
subsystem: api
tags: [meta-ads, insights-api, cron, scheduler, prisma, express]

# Dependency graph
requires:
  - phase: 08-meta-ads-ads-infrastructure-01
    provides: AdSpend/AdConnection schema, encrypt/decrypt utilities, test mocks
  - phase: 08-meta-ads-ads-infrastructure-02
    provides: routes/ads-auth.js OAuth flow that stores AdConnection rows

provides:
  - lib/syncAdSpend.js exporting syncAdSpend(shop, platform) with pagination + parseFloat
  - lib/scheduler.js 6-hour ad spend cron job registered when syncAdSpendFn provided
  - routes/ads.js serving GET /api/ads/spend, GET /api/ads/campaigns, DELETE /api/ads/disconnect
  - routes/api.js GET /api/dashboard/overview extended with adSpend field (null or number)

affects:
  - phase 08 frontend (AdsView needs spend/campaigns/roas from these endpoints)
  - phase 09 (Google Ads will add a google branch to syncAdSpend)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "syncAdSpend: error-190 no-throw pattern — scheduler continues for other shops"
    - "Optional scheduler job — registered only when syncAdSpendFn arg is provided"
    - "adSpend null/number distinction — null = no connection, 0 = connected but no spend"
    - "ROAS computed in /api/ads/spend response so frontend needs only one fetch"

key-files:
  created:
    - lib/syncAdSpend.js
    - routes/ads.js
    - tests/syncAdSpend.test.js
  modified:
    - lib/scheduler.js
    - routes/api.js
    - server.js
    - tests/ads.test.js

key-decisions:
  - "routes/ads.js mounted at /api/ads (not /api) in server.js so routes use /spend, /campaigns, /disconnect without /ads/ prefix — matches test mount point"
  - "roas field added to GET /api/ads/spend response (revenueNet/total, null when total=0) — ADS-07 requires ROAS; frontend can compute without second fetch"
  - "ADS-03 test mock updated from findMany to groupBy — implementation uses groupBy for SQL aggregation; test stub was pre-written with wrong mock method"
  - "netProfit in overview adjusted by adSpend when adConnection exists — shows true margin after ad costs; backward compatible (adSpend=null leaves netProfit unchanged)"
  - "syncAdSpend syncs last 90 days per invocation — keeps cache warm for arbitrary date-range queries in the UI"

patterns-established:
  - "Error-190 no-throw pattern: syncAdSpend logs and returns empty results on token expiry so scheduler loop continues"
  - "Optional scheduler param: startScheduler(prisma, syncFn, syncAdSpendFn?) — 6-hour job registered only when arg provided"
  - "adSpend null-vs-number in API response: null = shop has no Meta connection, number (including 0) = connected"

requirements-completed: [ADS-02, ADS-03, ADS-07]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 08 Plan 03: Meta Ads Sync and Spend Endpoints Summary

**Meta Insights sync (lib/syncAdSpend.js) with campaign pagination + parseFloat, 6-hour scheduler cron, and JWT-protected /api/ads/spend, /api/ads/campaigns, /api/ads/disconnect endpoints; dashboard overview extended with adSpend field and ROAS**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T07:14:09Z
- **Completed:** 2026-03-19T07:19:05Z
- **Tasks:** 2 (each with TDD RED + GREEN commits)
- **Files modified:** 7

## Accomplishments

- lib/syncAdSpend.js: fetches Meta Insights per-campaign with pagination, upserts AdSpend rows with parseFloat(spend), handles error-190 no-throw and other errors via throw
- lib/scheduler.js: extended with optional 6-hour ad spend cron job, backward compatible
- routes/ads.js: GET /api/ads/spend (total+revenueNet+roas), GET /api/ads/campaigns (groupBy sorted DESC), DELETE /api/ads/disconnect (JWT-protected)
- routes/api.js: dashboard overview now includes adSpend (null/number) and adjusts netProfit when connected

## Task Commits

Each task was committed atomically:

1. **TDD RED: syncAdSpend tests** - `d042b7f` (test)
2. **Task 1: syncAdSpend + scheduler** - `45edd01` (feat)
3. **Task 2: routes/ads.js + overview adSpend** - `792eacd` (feat)

## Files Created/Modified

- `lib/syncAdSpend.js` - Meta Insights API sync: per-campaign spend with pagination and parseFloat
- `lib/scheduler.js` - Extended with optional 6-hour adSpend cron job
- `routes/ads.js` - GET /spend, GET /campaigns, DELETE /disconnect endpoints
- `routes/api.js` - GET /api/dashboard/overview extended with adSpend + adjusted netProfit
- `server.js` - Mounts routes/ads at /api/ads; passes syncAdSpend to startScheduler
- `tests/syncAdSpend.test.js` - TDD tests for syncAdSpend (7 tests, all GREEN)
- `tests/ads.test.js` - Fixed ADS-03 mock from findMany to groupBy

## Decisions Made

- `routes/ads.js` mounted at `/api/ads` (not `/api`) in server.js so routes can use `/spend`, `/campaigns`, `/disconnect` without an `/ads/` prefix — matches the test mount point in `ads.test.js`
- `roas` field added to the `/api/ads/spend` response (`revenueNet / total`, null when total=0) — ADS-07 requires ROAS calculation; embedding it in the spend response avoids a second frontend fetch
- `adSpend` null/number distinction preserved in overview: null = no Meta connection for shop, number (including 0) = connected; this lets frontend show "Connect Meta" vs actual spend
- `netProfit` in the overview is adjusted by `adSpend` when an AdConnection exists, showing true margin after ad costs; when `adSpend` is null, the field is unchanged for backward compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ADS-03 test used wrong mock method (findMany vs groupBy)**
- **Found during:** Task 2 (routes/ads.js implementation)
- **Issue:** The pre-written test stub called `prisma.adSpend.findMany.mockResolvedValueOnce(...)` but `adSpend.findMany` is not defined in `tests/__mocks__/prisma.js`. The implementation correctly uses `groupBy` for SQL aggregation.
- **Fix:** Updated the ADS-03 test to use `prisma.adSpend.groupBy.mockResolvedValueOnce(...)` with the groupBy result shape (`{ campaignId, campaignName, platform, _sum: { spend } }`)
- **Files modified:** tests/ads.test.js
- **Verification:** ADS-03 test passes GREEN with groupBy mock
- **Committed in:** 792eacd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test stub)
**Impact on plan:** Fix necessary for tests to run; no scope creep; implementation correctness unaffected.

## Issues Encountered

None — plan executed as specified with one test stub correction.

## User Setup Required

None — no external service configuration required for this plan.

## Next Phase Readiness

- Backend for Phase 8 is complete (Plan 01: schema/encrypt, Plan 02: OAuth, Plan 03: sync + API)
- Frontend AdsView can now call `/api/ads/spend` (for total+roas) and `/api/ads/campaigns` (for campaign table)
- Phase 9 (Google Ads) will add a `google` branch to `syncAdSpend` using the same upsert pattern

## Self-Check: PASSED

All created files exist on disk. All task commits verified in git log.

---
*Phase: 08-meta-ads-ads-infrastructure*
*Completed: 2026-03-19*
