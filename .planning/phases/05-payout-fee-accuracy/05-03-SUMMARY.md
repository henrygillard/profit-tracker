---
phase: 05-payout-fee-accuracy
plan: "03"
subsystem: ui
tags: [react, jsx, css, badge, tooltip, createPortal]

# Dependency graph
requires:
  - phase: 05-payout-fee-accuracy plan 02
    provides: feeSource written to DB by syncPayouts and upsertOrder; API includes feeSource in /api/dashboard/orders response
provides:
  - FeeCell component rendering Pending/Est./verified fee states in the Orders table
  - Portal-based tooltip on Est. and verified fee cells using existing pt-info-popup CSS
  - pt-badge-info CSS class for "Pending" state
  - feeSource field included in DASH-02 test mock and assertion
affects:
  - 05-payout-fee-accuracy (FEEX-02 fully visible)
  - any future Orders table UI work

# Tech tracking
tech-stack:
  added: []
  patterns:
    - FeeCellTooltip uses createPortal + useRef + useState for hover-triggered tooltip — same pattern as InfoTooltip in Overview.jsx

key-files:
  created: []
  modified:
    - web/src/components/OrdersTable.jsx
    - web/src/styles.css
    - routes/api.js
    - tests/dashboard.test.js

key-decisions:
  - "Portal-based tooltip (createPortal + pt-info-popup) used instead of native title= attribute — browsers suppress title in modern UIs"
  - "FeeCellTooltip is a separate component that calculates its own position on mount, matching the existing InfoTooltip pattern"

patterns-established:
  - "Inline tooltip pattern: wrap target in span with onMouseEnter/Leave, render FeeCellTooltip only when hovered, portal to document.body"

requirements-completed:
  - FEEX-02

# Metrics
duration: 35min
completed: 2026-03-18
---

# Phase 5 Plan 03: Fee Status Badges Summary

**feeSource surfaced in Orders table UI via FeeCell component with portal-based tooltips — Pending/Est./verified states all visible with correct badges and hover tooltips**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-18T21:00:00Z
- **Completed:** 2026-03-18T21:35:00Z
- **Tasks:** 2 (+ 1 tooltip fix after checkpoint)
- **Files modified:** 4

## Accomplishments
- Added `feeSource` to `/api/dashboard/orders` response with `|| 'estimated'` fallback for pre-Phase-5 rows
- Updated DASH-02 test mock and assertion to include `feeSource`; FEEX-02 API test turns green
- Added `pt-badge-info` CSS class (blue pill) for Pending state
- Implemented `FeeCell` component — three distinct states: Pending badge, Est. badge + amount, verified amount
- Fixed tooltip rendering: replaced non-functional `title=` attribute with `FeeCellTooltip` using `createPortal` + `pt-info-popup`, matching the existing `InfoTooltip` pattern in Overview.jsx

## Task Commits

Each task was committed atomically:

1. **Task 1: Add feeSource to API response and update dashboard test** - `6470345` (feat)
2. **Task 2: Add pt-badge-info CSS, implement FeeCell** - `322aef3` (feat)
3. **Task 2 fix: Replace title attribute with portal-based tooltip in FeeCell** - `889b0de` (fix)

## Files Created/Modified
- `web/src/components/OrdersTable.jsx` - Added FeeCellTooltip and FeeCell components; added useRef and createPortal imports
- `web/src/styles.css` - Added pt-badge-info CSS class after pt-badge-danger block
- `routes/api.js` - Added feeSource field to /api/dashboard/orders response mapping
- `tests/dashboard.test.js` - Updated DASH-02 mock and assertion to include feeSource

## Decisions Made
- **Portal tooltip over native title:** Native `title=` attributes are suppressed or delayed in modern browsers (especially inside tables). Used `createPortal` + `pt-info-popup` to match the existing `InfoTooltip` pattern already established in Overview.jsx — consistent UX, works reliably on hover.
- **FeeCellTooltip as separate component:** Position calculation runs in a `useEffect` on mount, which gives it access to the rendered anchor rect immediately. This avoids flicker from double renders compared to calculating in the parent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced non-functional title= tooltip with portal-based tooltip**
- **Found during:** Task 2 checkpoint (human verification)
- **Issue:** FeeCell used native `title=` attribute for hover tooltip. Modern browsers suppress `title` tooltips in many contexts, especially inside `<table>` cells. User confirmed badges were visible but tooltip on "Est." did not appear.
- **Fix:** Added `FeeCellTooltip` sub-component using `createPortal`, `useRef`, and `useState` for hover state. Renders `pt-info-popup` into `document.body`, matching the `InfoTooltip` pattern in Overview.jsx.
- **Files modified:** `web/src/components/OrdersTable.jsx`
- **Verification:** 68 tests still pass; tooltip confirmed visible by human user
- **Committed in:** `889b0de`

---

**Total deviations:** 1 auto-fixed (1 bug — non-functional browser title attribute)
**Impact on plan:** Essential fix for the tooltip requirement; no scope creep.

## Issues Encountered
- None beyond the tooltip deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FEEX-02 is complete: feeSource flows end-to-end from DB → API → UI with three visible states
- All four FEEX requirements now have passing tests (FEEX-01 through FEEX-04)
- Phase 5 complete — payout fee accuracy data quality gate is in place for downstream phases

---
*Phase: 05-payout-fee-accuracy*
*Completed: 2026-03-18*

## Self-Check: PASSED

- FOUND: 05-03-SUMMARY.md
- FOUND: OrdersTable.jsx
- FOUND: styles.css
- FOUND commit: 889b0de (tooltip fix)
- FOUND commit: 322aef3 (FeeCell + badge CSS)
- FOUND commit: 6470345 (feeSource in API)
