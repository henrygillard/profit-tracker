---
phase: 09-google-ads-integration
plan: "01"
subsystem: testing
tags: [google-ads, oauth, tdd, jest, google-auth-library]

# Dependency graph
requires:
  - phase: 08-meta-ads-ads-infrastructure
    provides: "ads.js, ads-auth.js, syncAdSpend.js, prisma mock with adConnection/adSpend"
provides:
  - "google-auth-library@9.15.1 installed (Node 16 compatible)"
  - "tests/google-ads.test.js — 5 RED stubs for ADS-04 OAuth flow"
  - "tests/__mocks__/prisma.js extended with oAuthState mock methods"
  - "tests/syncAdSpend.test.js extended with 3 RED Google branch stubs"
  - "tests/ads.test.js extended with 2 RED Google stubs (disconnect, campaigns)"
  - "tests/dashboard.test.js extended with 2 RED ADS-05 stubs (split ad spend fields)"
affects:
  - "09-02 (google-ads-auth route implementation — must turn google-ads.test.js GREEN)"
  - "09-03 (syncAdSpend Google branch — must turn sync/ads/dashboard stubs GREEN)"

# Tech tracking
tech-stack:
  added:
    - "google-auth-library@9.15.1"
  patterns:
    - "Wave 0 TDD: write all failing tests before any implementation (same pattern as Phase 8)"
    - "OAuth2Client.prototype.getToken/getAccessToken spy pattern for google-auth-library testing"
    - "try/catch router-load guard: RED via expect(false).toBe(true) when route file missing"

key-files:
  created:
    - "tests/google-ads.test.js"
  modified:
    - "tests/__mocks__/prisma.js"
    - "tests/syncAdSpend.test.js"
    - "tests/ads.test.js"
    - "tests/dashboard.test.js"
    - "package.json"
    - "package-lock.json"

key-decisions:
  - "google-auth-library@^9.15.1 used (not v10) — Node 16 engine compatibility"
  - "OAuth2Client.prototype.getToken spy is the correct intercept point for google-auth-library token exchange (not global.fetch, which the library uses internally)"
  - "ADS-06 campaigns test passes GREEN immediately — existing groupBy query is platform-agnostic; no changes needed to pass campaigns test"
  - "syncAdSpend unsupported platform test remains in old form (throws for google) — new RED test contradicts it but both coexist; Plan 09-03 will make the throws-for-google test the one that changes"

patterns-established:
  - "Google ads tests mirror Meta ads test structure for consistency"
  - "Wave 0 RED baseline: all new Google feature tests fail before any implementation"

requirements-completed:
  - ADS-04
  - ADS-05
  - ADS-06

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 9 Plan 01: Google Ads Wave 0 Test Stubs Summary

**Installed google-auth-library@9.15.1 and wrote 11 failing RED test stubs covering ADS-04 OAuth flow, ADS-05 split ad spend fields, and ADS-06 Google campaign rows**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T15:57:19Z
- **Completed:** 2026-03-19T16:01:52Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Installed google-auth-library@^9.15.1 (Node 16 compatible v9, not v10)
- Extended prisma mock with oAuthState.create/findUnique/delete/deleteMany for OAuth state management
- Created tests/google-ads.test.js with 5 RED describe blocks covering full ADS-04 OAuth flow
- Extended syncAdSpend.test.js with 3 RED blocks for Google platform branch (no-throw, happy path, invalid_grant)
- Extended ads.test.js with 2 blocks (disconnect?platform=google RED, campaigns GREEN — platform-agnostic)
- Extended dashboard.test.js with 2 RED blocks for ADS-05 split ad spend fields (metaAdSpend/googleAdSpend/totalAdSpend)
- All 27 existing tests remain GREEN; 11 new Google tests are RED

## Task Commits

Each task was committed atomically:

1. **Task 1: Install google-auth-library and extend prisma mock** - `8f55c91` (chore)
2. **Task 2: Write google-ads.test.js RED stubs for ADS-04** - `5a3bbf4` (test)
3. **Task 3: Extend sync/ads/dashboard tests with Google RED stubs** - `8160166` (test)

## Files Created/Modified
- `tests/google-ads.test.js` — NEW: 5 describe blocks for ADS-04 OAuth flow (all RED)
- `tests/__mocks__/prisma.js` — Added oAuthState mock block (create, findUnique, delete, deleteMany)
- `tests/syncAdSpend.test.js` — Added OAuth2Client import + 3 Google RED describe blocks
- `tests/ads.test.js` — Added ADS-04 disconnect + ADS-06 campaigns Google describe blocks
- `tests/dashboard.test.js` — Added ADS-05 metaAdSpend/googleAdSpend/totalAdSpend RED describe blocks
- `package.json` / `package-lock.json` — google-auth-library@9.15.1 added

## Decisions Made
- google-auth-library@^9.15.1 (not v10): Node 16.20.2 running in this environment requires v9 due to engine requirements
- OAuth2Client.prototype.getToken spy: google-auth-library uses internal HTTP calls; the correct intercept is the library's public method, not global.fetch
- ADS-06 campaigns test: passes GREEN immediately because existing groupBy campaign query is platform-agnostic — correctly documented in plan as "may already pass"
- oAuthState prisma mock: added after adSpend block without modifying any existing entries, preserving Phase 8 test compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- Wave 0 RED baseline established: 11 tests covering all Google Ads features will turn GREEN as Plans 09-02 and 09-03 implement the routes and sync logic
- Plan 09-02: implement routes/google-ads-auth.js — turns google-ads.test.js GREEN (5 tests)
- Plan 09-03: implement Google branch in syncAdSpend.js and extend ads.js/api.js — turns remaining 6 tests GREEN
- External dependency: Google Ads developer token approval still pending (noted in STATE.md); development proceeds against Test Account Access

---
*Phase: 09-google-ads-integration*
*Completed: 2026-03-19*
