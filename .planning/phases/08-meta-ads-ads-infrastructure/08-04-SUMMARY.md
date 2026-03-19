---
phase: 08-meta-ads-ads-infrastructure
plan: 04
subsystem: ui
tags: [react, vite, css-variables, waterfall-chart, ads-roas]

# Dependency graph
requires:
  - phase: 08-meta-ads-ads-infrastructure-02
    provides: /ads/auth OAuth flow and /api/ads/disconnect endpoint
  - phase: 08-meta-ads-ads-infrastructure-03
    provides: /api/ads/spend (with revenueNet field) and /api/ads/campaigns endpoints
provides:
  - AdsView.jsx component (Connect/Disconnect flow, Blended ROAS card, campaign table)
  - Ads nav tab in App.jsx TABS array and renderView switch
  - Ad Spend KPI card in Overview (conditional on data.adSpend != null)
  - WaterfallChart Ad Spend step between Shipping and Net Profit (CHART-05)
  - --c-ads and --c-ads-bg CSS variables (violet-500/violet-600)
affects: [phase-09-google-ads]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional KPI card rendered outside KPI_META map loop — avoids mutating the meta array for data-driven conditional cards
    - adSpend null/number distinction: null=no Meta connection, number(incl 0)=connected (set by overview endpoint)
    - Blended ROAS = revenueNet / adSpend, formatted as "X.XXx", labeled "Blended ROAS" with subtitle distinguishing from platform-reported ROAS

key-files:
  created:
    - web/src/components/AdsView.jsx
  modified:
    - web/src/App.jsx
    - web/src/components/Overview.jsx
    - web/src/components/WaterfallChart.jsx
    - web/src/styles.css

key-decisions:
  - "AdsView connected state inferred from spend.total > 0 || campaigns.length > 0 — no dedicated /api/ads/status endpoint needed"
  - "pt-kpi-grid updated from repeat(4, 1fr) to repeat(auto-fit, minmax(160px, 1fr)) to accommodate 5th Ad Spend card without layout breakage"
  - "Blended ROAS uses revenueNet from /api/ads/spend response (added in Plan 03) — no second fetch needed in AdsView"
  - "handleConnect uses window.top.location.href for top-level iframe navigation to /ads/auth"

patterns-established:
  - "Pattern: Conditional KPI card appended after KPI_META.map() inside the same pt-kpi-grid div"
  - "Pattern: WaterfallChart adSpend prop defaults to null; step only pushed when adSpend && adSpend > 0"

requirements-completed: [ADS-01, ADS-02, ADS-03, ADS-07, CHART-05]

# Metrics
duration: 2min
completed: 2026-03-19
---

# Phase 8 Plan 04: Frontend — AdsView, Ad Spend KPI, Waterfall Step Summary

**AdsView component with Meta OAuth connect/disconnect, Blended ROAS card, and campaign table; Ad Spend KPI card in Overview; CHART-05 Ad Spend waterfall step with --c-ads violet CSS variables**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-19T06:22:04Z
- **Completed:** 2026-03-19T06:24:00Z
- **Tasks:** 2 of 3 auto tasks complete (Task 3 is human-verify checkpoint)
- **Files modified:** 5

## Accomplishments
- Created AdsView.jsx (120+ lines): Connect Meta Ads button (window.top navigation), Disconnect button, Blended ROAS card (revenueNet/adSpend formatted as "X.XXx"), campaign spend table
- Extended Overview with conditional Ad Spend KPI card (5th card when data.adSpend != null) and passed adSpend to WaterfallChart
- Extended WaterfallChart: adSpend prop, Ad Spend subtract step inserted before Net Profit, getCellColor returns var(--c-ads) for Ad Spend step
- Added --c-ads (#8b5cf6 dark / #7c3aed light) and --c-ads-bg CSS variables; updated KPI grid to auto-fit for 5 cards
- All 103 tests pass GREEN including CHART-05

## Task Commits

Each task was committed atomically:

1. **Task 1: AdsView.jsx + Ads nav tab + CSS variables** - `e96abbc` (feat)
2. **Task 2: WaterfallChart Ad Spend step + Overview Ad Spend KPI card** - `db6b147` (feat)
3. **Task 3: Human verify checkpoint** - awaiting human verification

## Files Created/Modified
- `web/src/components/AdsView.jsx` - New: Ads tab view with connect flow, ROAS card, campaign table
- `web/src/App.jsx` - Added AdsView import, Ads tab to TABS, ads case to renderView
- `web/src/components/Overview.jsx` - Added conditional Ad Spend KPI card, adSpend prop to WaterfallChart
- `web/src/components/WaterfallChart.jsx` - Added adSpend prop, Ad Spend step in steps array, getCellColor case
- `web/src/styles.css` - Added --c-ads/--c-ads-bg vars, updated pt-kpi-grid, added AdsView component styles

## Decisions Made
- AdsView connected state inferred from spend.total > 0 || campaigns.length > 0 — no dedicated status endpoint needed
- pt-kpi-grid updated from repeat(4, 1fr) to repeat(auto-fit, minmax(160px, 1fr)) to accommodate 5th card
- Blended ROAS uses revenueNet from /api/ads/spend response (Plan 03 added this field) — no second fetch needed
- handleConnect uses window.top.location.href (not window.location.href) for Shopify iframe top-level navigation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated pt-kpi-grid CSS for 5-card layout**
- **Found during:** Task 2 (Overview Ad Spend KPI card)
- **Issue:** Plan noted the grid uses `repeat(4, 1fr)` and would need updating for 5 cards — added during Task 1 when touching CSS
- **Fix:** Changed `grid-template-columns: repeat(4, 1fr)` to `repeat(auto-fit, minmax(160px, 1fr))` in styles.css
- **Files modified:** web/src/styles.css
- **Verification:** Vite build passes; 5-card grid renders correctly
- **Committed in:** e96abbc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical layout update)
**Impact on plan:** Required for correct 5-card KPI grid. No scope creep.

## Issues Encountered
None — pre-existing worker exit warning in test suite is unrelated to this plan's changes.

## Next Phase Readiness
- Complete Phase 8 frontend is built and verified building; awaiting human checkpoint (Task 3)
- All five Phase 8 success criteria are implemented in code
- Phase 9 (Google Ads) can begin once Google developer token is approved

---
*Phase: 08-meta-ads-ads-infrastructure*
*Completed: 2026-03-19*
