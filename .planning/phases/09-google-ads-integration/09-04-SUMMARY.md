---
phase: 09-google-ads-integration
plan: "04"
subsystem: ui
tags: [react, google-ads, meta-ads, ads-integration]

# Dependency graph
requires:
  - phase: 09-google-ads-integration-02
    provides: Google OAuth flow and token storage
  - phase: 09-google-ads-integration-03
    provides: Combined /api/ads/spend total (meta+google), /api/ads/disconnect?platform=, overview returns googleAdSpend
provides:
  - AdsView with separate Meta and Google connection cards, per-platform disconnect, platform badge on campaigns
  - Overview 6th KPI card for googleAdSpend (conditional on non-null)
affects:
  - Future ad platform additions follow the same platform-section pattern in AdsView

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-platform AdsView: each platform has its own section with independent connect/disconnect state"
    - "Connection state inferred from spend.meta > 0 || campaigns.some(c => c.platform === 'meta') — no status endpoint"
    - "handleDisconnect(platform) passes ?platform= query param to /api/ads/disconnect"
    - "handleConnectGoogle uses window.top.location.href to /google-ads/auth (same iframe escape as Meta)"

key-files:
  created: []
  modified:
    - web/src/components/AdsView.jsx
    - web/src/components/Overview.jsx
    - routes/ads-auth.js
    - routes/google-ads-auth.js

key-decisions:
  - "metaConnected inferred from spend.meta > 0 || campaigns.some(c => c.platform === 'meta') — consistent with Phase 08 pattern of no dedicated status endpoint"
  - "googleConnected inferred from spend.google > 0 || campaigns.some(c => c.platform === 'google') — same inference pattern"
  - "Campaign table key changed to platform-campaignId composite to avoid collisions when both platforms have campaigns"
  - "iframe-escape script must be placed at end of <body> — running in <head> causes document.body to be null before body element is parsed"

patterns-established:
  - "Platform section pattern: each ad platform gets its own <div className=pt-ads-platform-section> with independent connect/disconnect"
  - "Platform badge on campaign rows: <span className=pt-ads-platform-badge>{c.platform}</span>"

requirements-completed: [ADS-04, ADS-05, ADS-06]

# Metrics
duration: 15min
completed: 2026-03-19
---

# Phase 9 Plan 04: Frontend Google Ads Connection and KPI Card Summary

**Dual-platform AdsView with independent Meta/Google connection cards and a conditional "Google Ads Spend" KPI card in Overview using window.top.location.href iframe escape and per-platform disconnect**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-19T19:50:25Z
- **Completed:** 2026-03-19T20:05:00Z
- **Tasks:** 3 of 3 (Task 3 human-verify checkpoint — approved)
- **Files modified:** 4

## Accomplishments
- AdsView restructured into two independent platform sections: Meta Ads and Google Ads, each with its own connect/disconnect controls
- "Connect Google Ads" button navigates top-level to /google-ads/auth (same iframe escape pattern as Meta)
- Disconnect buttons pass ?platform=meta or ?platform=google to /api/ads/disconnect
- Campaign table updated to show platform badge per row; composite key prevents duplicates across platforms
- Overview gains a conditional 6th KPI card "Google Ads Spend" rendered when data.googleAdSpend is non-null

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend AdsView.jsx with Google connection card** - `64016c4` (feat)
2. **Task 2: Add Google Ads Spend KPI card to Overview.jsx** - `b3f0048` (feat)
3. **Task 3: Human verification checkpoint** - approved by user

**Bug fix (found during checkpoint review):** `3781158` (fix: move iframe-escape script to end of body)

## Files Created/Modified
- `web/src/components/AdsView.jsx` - Restructured into Meta+Google platform sections; per-platform connect/disconnect handlers; campaign platform badges
- `web/src/components/Overview.jsx` - Added googleAdSpend conditional KPI card after Meta Ad Spend card
- `routes/ads-auth.js` - iframe-escape script moved to end of `<body>` (bug fix)
- `routes/google-ads-auth.js` - iframe-escape script moved to end of `<body>` (bug fix)

## Decisions Made
- Connection state for each platform inferred from spend breakdown and campaign platform field (no dedicated status endpoint) — consistent with Phase 08 decision
- Campaign row key changed from `c.campaignId` to `${c.platform}-${c.campaignId}` to handle cross-platform campaign ID collisions
- `anyConnected` flag controls ROAS card and campaign table visibility (shown when either platform connected)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] iframe-escape script ran before `<body>` existed, causing null reference**
- **Found during:** Task 3 (human verification checkpoint)
- **Issue:** Both `routes/ads-auth.js` and `routes/google-ads-auth.js` had a `<script>` tag in `<head>` that referenced `document.body` to apply a CSS class for iframe-escape detection. Because `<body>` had not been parsed yet when the script ran, `document.body` was `null`, causing a JavaScript TypeError on every OAuth redirect page load.
- **Fix:** Moved the `<script>` block from `<head>` to the end of `<body>` in both files so the DOM element exists when the script executes.
- **Files modified:** `routes/ads-auth.js`, `routes/google-ads-auth.js`
- **Verification:** User observed the fix in-browser and approved the checkpoint.
- **Committed in:** `3781158` (separate fix commit, applied before human approval)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Fix was essential for correct OAuth redirect behavior in both Meta and Google auth flows. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Frontend Google Ads integration is complete once human checkpoint passes
- Phase 9 integration is done; Google Ads data will flow end-to-end once a merchant connects via /google-ads/auth
- Remaining concern: Google Ads developer token approval is an external dependency (tracked in STATE.md blockers)

---
*Phase: 09-google-ads-integration*
*Completed: 2026-03-19*
