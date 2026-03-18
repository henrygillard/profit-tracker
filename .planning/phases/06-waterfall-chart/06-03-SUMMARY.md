---
phase: 06-waterfall-chart
plan: "03"
subsystem: ui
tags: [react, recharts, waterfall-chart, modal, createPortal]

# Dependency graph
requires:
  - phase: 06-waterfall-chart/06-02
    provides: WaterfallChart.jsx component with computeWaterfallData, modal CSS, shippingCost in API responses
  - phase: 05-payout-fee-accuracy
    provides: per-order fee data (feesTotal, feeSource) accurate enough to visualize in waterfall

provides:
  - Store-level waterfall chart rendered in Overview.jsx below KPI cards
  - Per-order waterfall modal triggered by clicking any row in OrdersTable.jsx
  - CHART-01 and CHART-02 acceptance criteria verified in browser

affects:
  - Phase 8 (Meta Ads integration) — ad spend will become a 6th waterfall step (CHART-05)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - WaterfallModal via createPortal to document.body (same portal pattern as FeeCellTooltip)
    - Escape key + overlay click + X button triple-close pattern for modals
    - Body scroll lock (document.body.style.overflow = 'hidden') while modal open
    - cogsKnown={cogsKnownCount > 0} threshold guard for partial COGS data in overview context

key-files:
  created: []
  modified:
    - web/src/components/Overview.jsx
    - web/src/components/OrdersTable.jsx

key-decisions:
  - "WaterfallModal uses createPortal to document.body — same pattern as FeeCellTooltip, avoids z-index stacking issues"
  - "cogsKnown computed as cogsKnownCount > 0 in Overview (not isPartial) — shows COGS bar if any orders have cost data"
  - "Row click uses inline onClick on <tr> with cursor:pointer — no additional button element needed"
  - "WaterfallModal added as module-level component above OrdersTable export — not inlined — for readability"

patterns-established:
  - "Modal pattern: createPortal + Escape listener + overlay click + scroll lock — use for all future modals"
  - "Fragment wrapper (<>) when adding sibling JSX inside an existing conditional block"

requirements-completed: [CHART-01, CHART-02]

# Metrics
duration: 20min
completed: 2026-03-18
---

# Phase 6 Plan 03: Wire WaterfallChart into Overview and OrdersTable Summary

**WaterfallChart wired into both consumer screens — store-level in Overview.jsx and per-order modal in OrdersTable.jsx — with Escape/overlay/button close and browser-verified rendering**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-18T21:20:00Z
- **Completed:** 2026-03-18T21:46:11Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Overview.jsx now renders a 5-step store-level waterfall chart (Revenue, COGS, Fees, Shipping, Net Profit) below the KPI cards for any selected date range
- OrdersTable.jsx opens a per-order WaterfallModal on row click, showing that order's individual cost decomposition; modal closes via X button, overlay click, or Escape key
- All 4 acceptance criteria (CHART-01 through CHART-04 — store-level chart, per-order modal, COGS warning annotation, loss-order red bar below zero baseline) confirmed passing in browser

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire WaterfallChart into Overview.jsx** - `f1c2d6f` (feat)
2. **Task 2: Add WaterfallModal to OrdersTable.jsx with row click handler** - `95142a4` (feat)
3. **Task 3: Visual checkpoint — CHART-01 through CHART-04 verified** - User approved

## Files Created/Modified

- `web/src/components/Overview.jsx` - Added WaterfallChart import and render below KPI grid, wrapped conditional in Fragment, passed all 9 data props including cogsKnown threshold
- `web/src/components/OrdersTable.jsx` - Added WaterfallChart import, WaterfallModal component (createPortal + Escape listener + scroll lock), selectedOrder state, onClick on `<tr>`, modal render

## Decisions Made

- **cogsKnown threshold:** In the Overview context `cogsKnown` is computed as `data.cogsKnownCount > 0` rather than `!data.isPartial` — this shows the COGS and Net Profit bars whenever any orders have cost data, rather than hiding them for a partially-known dataset.
- **WaterfallModal placement:** Added as a module-level component (above OrdersTable export) rather than inlined for readability. Same pattern as FeeCell.
- **Portal target:** `document.body` — same as FeeCellTooltip — avoids z-index stacking with table overflow:hidden containers.
- **Fragment wrapper:** The Overview conditional now wraps KPI grid + WaterfallChart in `<>...</>` since the conditional returns two sibling elements.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 (Waterfall Chart) is now fully complete across all 3 plans
- CHART-01 (store-level), CHART-02 (per-order modal), CHART-03 (COGS warning), CHART-04 (loss-order red bar) all confirmed in browser
- Phase 7 can proceed — the waterfall visualization foundation is complete for future ad spend step (CHART-05) in Phase 8

---
*Phase: 06-waterfall-chart*
*Completed: 2026-03-18*
