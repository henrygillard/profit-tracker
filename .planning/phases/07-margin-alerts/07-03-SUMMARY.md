---
phase: 07-margin-alerts
plan: "03"
subsystem: ui
tags: [react, jsx, css, margin-alerts, banner, settings, nav-badge]

# Dependency graph
requires:
  - phase: 07-margin-alerts-02
    provides: GET /api/alerts/margin and GET/PUT /api/settings endpoints

provides:
  - "MarginAlertBanner.jsx — dismissible WARNING + undismissable CRITICAL banner on Overview dashboard"
  - "SettingsScreen.jsx — threshold configuration UI with persistence"
  - "Products tab nav badge showing at-risk SKU count before navigation"
  - "Full Phase 7 margin alert surface — backend + frontend integrated"

affects:
  - 08-meta-ads
  - 09-google-ads

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate JSX elements for CRITICAL vs WARNING alerts — dismissed state only wraps WARNING, never CRITICAL"
    - "onAtRiskCount callback prop bubbles count from Overview child to App parent without second fetch"
    - "Absolute-positioned nav badge via .pt-tab-badge to avoid layout shift on tab buttons"
    - "Date range change resets dismissed state — new context should always be visible"

key-files:
  created:
    - web/src/components/MarginAlertBanner.jsx
    - web/src/components/SettingsScreen.jsx
  modified:
    - web/src/App.jsx
    - web/src/components/Overview.jsx
    - web/src/styles.css

key-decisions:
  - "CRITICAL section rendered as independent JSX element with no dismissed condition — enforces ALERT-03 invariant in UI layer"
  - "MarginAlertBanner mounted inside Overview.jsx (not App.jsx) so it has direct access to dateRange prop without prop-drilling through App"
  - "pt-tab { position: relative } scoped to tab buttons so absolute badge positioning does not affect layout of surrounding elements"

patterns-established:
  - "Alert banner pattern: separate elements per severity, only lower severity is dismissible"
  - "Nav badge pattern: absolute positioning on tab button, pointer-events: none to avoid click interference"

requirements-completed: [ALERT-01, ALERT-02, ALERT-03, ALERT-04]

# Metrics
duration: ~30min
completed: 2026-03-19
---

# Phase 7 Plan 03: Frontend Margin Alert Surface Summary

**Dismissible warning + undismissable critical margin alert banner, Settings threshold screen, and at-risk nav badge — completing Phase 7 end-to-end**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-19T05:10:00Z
- **Completed:** 2026-03-19T05:40:00Z
- **Tasks:** 2 auto tasks + 1 human checkpoint
- **Files modified:** 5

## Accomplishments
- MarginAlertBanner.jsx renders on Overview: CRITICAL (negative-margin) section is always visible with no dismiss button; WARNING section is dismissible and resets on date range change
- SettingsScreen.jsx allows merchants to configure margin alert threshold with persistence via PUT /api/settings — survives hard reload
- Products tab in App.jsx shows a red numeric badge with the at-risk SKU count before the merchant navigates — ALERT-04 implemented
- All four ALERT requirements (ALERT-01 through ALERT-04) browser-verified and approved at human checkpoint

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MarginAlertBanner.jsx and SettingsScreen.jsx** - `37d762b` (feat)
2. **Task 2: Wire App.jsx — Settings tab, nav badge, MarginAlertBanner in Overview** - `0b8d969` (feat)
3. **Task 3: Human verification checkpoint** - approved (no code commit)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `web/src/components/MarginAlertBanner.jsx` — Dismissible banner calling /api/alerts/margin; separate CRITICAL and WARNING sections
- `web/src/components/SettingsScreen.jsx` — Settings view with threshold number input and Save button; persists via PUT /api/settings
- `web/src/App.jsx` — Added Settings tab to TABS array, atRiskCount state, conditional badge on Products tab, SettingsScreen case in renderView
- `web/src/components/Overview.jsx` — Imports MarginAlertBanner, passes dateRange and onAtRiskCount callback
- `web/src/styles.css` — Added .pt-tab-badge rule (absolute positioning, red background, no layout shift)

## Decisions Made
- CRITICAL section is a separate JSX element with no `dismissed` condition — this enforces ALERT-03 at the UI layer independently of backend logic
- MarginAlertBanner mounted in Overview (not App) so dateRange is available directly without additional prop drilling through App
- `pt-tab { position: relative }` scoped only to tab buttons to enable absolute badge positioning without causing layout shift on surrounding navigation

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 7 is fully complete: DB migration (Plan 01), API endpoints (Plan 02), and frontend surface (Plan 03) all done
- All four ALERT requirements (ALERT-01 through ALERT-04) browser-verified
- Phase 8 (Meta Ads) can begin — no blockers from Phase 7

---
*Phase: 07-margin-alerts*
*Completed: 2026-03-19*
