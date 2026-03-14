---
phase: 03-profit-dashboard
plan: 04
subsystem: ui
tags: [react, recharts, polaris, shopify-app-bridge, vite, dashboard, spa, frontend]

# Dependency graph
requires:
  - phase: 03-profit-dashboard
    plan: 03
    provides: Vite+React SPA scaffold with App.jsx shell, apiFetch wrapper, view routing
  - phase: 03-profit-dashboard
    plan: 02
    provides: Four GET /api/dashboard/* Express routes (overview, orders, products, trend)

provides:
  - web/src/components/Overview.jsx: KPI cards (revenue/COGS/fees/netProfit) with date range preset selector
  - web/src/components/CogsCoverage.jsx: Warning banner that renders null when missingCogsCount=0
  - web/src/components/TrendChart.jsx: Recharts LineChart inside ResponsiveContainer fetching /api/dashboard/trend
  - web/src/components/OrdersTable.jsx: Sortable orders list with s-badge Unknown for cogsKnown=false, pagination
  - web/src/components/ProductsTable.jsx: Product margin ranking with Top 3/Bottom 3/Partial COGS badges
  - web/src/App.jsx: Updated to import all 5 components, route overview/orders/products views, propagate dateRange

affects:
  - 03-profit-dashboard plan 05 (Vite build output served by Express — all dashboard components complete)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useEffect on dateRange.from/dateRange.to for re-fetch on date change
    - Null-safe COGS display — cogsKnown=false shows s-badge Unknown, never $0
    - Pagination via page state increment, allOrders accumulated client-side
    - Sort state (sortKey, sortDir) with page reset on sort change to avoid stale data

key-files:
  created:
    - web/src/components/Overview.jsx
    - web/src/components/CogsCoverage.jsx
    - web/src/components/TrendChart.jsx
    - web/src/components/OrdersTable.jsx
    - web/src/components/ProductsTable.jsx
  modified:
    - web/src/App.jsx

key-decisions:
  - "OrdersTable resets page and allOrders to [] on dateRange or sort change — prevents stale pages from previous filter from contaminating new results"
  - "TrendChart and OrdersTable each fetch independently — no prop drilling of API data through App.jsx"
  - "useEffect dependency on dateRange.from and dateRange.to primitives (not the object reference) avoids spurious re-fetches"

patterns-established:
  - "Pattern: useEffect deps on primitive fields (dateRange.from, dateRange.to) not object reference — prevents unnecessary fetches on referential inequality"
  - "Pattern: Page reset effect separate from fetch effect — sorting/date changes reset to page 0 before fetch fires"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 3 Plan 04: Dashboard React Components Summary

**Five Polaris+Recharts dashboard components wired into App.jsx — Revenue/COGS/Fees/NetProfit KPI cards, sortable orders table with unknown COGS badge, product margin ranking, and profit trend line chart**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T03:08:24Z
- **Completed:** 2026-03-14T03:11:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Built Overview.jsx with date preset buttons (7/30/90 days), custom date inputs, and 4 KPI cards showing isPartial label for COGS/netProfit when any orders have unknown COGS
- Built CogsCoverage.jsx rendering null when missingCogsCount=0, showing percentage warning banner otherwise — enforces the "NULL COGS never $0" data integrity guarantee
- Built TrendChart.jsx with Recharts LineChart + ResponsiveContainer, fetching /api/dashboard/trend, with empty-state and error handling
- Built OrdersTable.jsx with 7-column sortable table, COGS Unknown badge for cogsKnown=false rows, null-safe net profit and margin cells, and Load More pagination
- Built ProductsTable.jsx with Top 3/Bottom 3 badges (known-COGS rows only) and Partial COGS badge for allCogsKnown=false rows
- Updated App.jsx to import all 5 components, route overview/orders/products views, and propagate dateRange from state to all components

## Task Commits

Each task was committed atomically:

1. **Task 1: Build Overview, CogsCoverage, and TrendChart components** - `1d9a0d3` (feat)
2. **Task 2: Build OrdersTable and ProductsTable, wire all components into App.jsx** - `bfbda4f` (feat)

**Plan metadata:** (committed with this summary)

## Files Created/Modified

- `web/src/components/Overview.jsx` - KPI cards (revenue/COGS/fees/netProfit) with date range selector presets and custom from/to inputs; renders CogsCoverage inline
- `web/src/components/CogsCoverage.jsx` - s-banner tone="warning" showing X of N orders (pct%) with unknown COGS; renders null when missingCogsCount=0
- `web/src/components/TrendChart.jsx` - Recharts LineChart inside ResponsiveContainer, stroke=#008060, tooltip formatter, empty/loading/error states
- `web/src/components/OrdersTable.jsx` - Sortable 7-column s-table; s-badge Unknown for cogsKnown=false; — for null netProfit/marginPct; Load More pagination
- `web/src/components/ProductsTable.jsx` - Product margin ranking; Top 3/Bottom 3 badges on known-COGS rows; Partial COGS badge for allCogsKnown=false
- `web/src/App.jsx` - Imports all 5 components; routes overview/orders/products views; handleDateChange propagates to all children

## Decisions Made

- OrdersTable resets `page` and `allOrders` to 0/[] on dateRange or sort change via a separate useEffect — prevents stale paginated results from a previous filter from contaminating the new result set.
- All components fetch independently via apiFetch rather than centralizing fetches in App.jsx — cleaner separation, no prop drilling of large data arrays.
- useEffect dependencies use primitive values `dateRange.from` and `dateRange.to` (not the object reference) — avoids spurious re-fetches when the parent re-renders with the same date values but a new object.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Build produced a 506kB bundle (warning, not error) due to recharts being a large library — expected for a production chart library. No code changes needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All five DASH requirements are visually complete — Plan 05 can build the Vite output integration and wire Express to serve it
- Build pipeline verified: `cd web && npm run build` produces public/app/ output
- No blockers for Plan 05

## Self-Check: PASSED

- web/src/components/Overview.jsx: FOUND
- web/src/components/CogsCoverage.jsx: FOUND
- web/src/components/TrendChart.jsx: FOUND
- web/src/components/OrdersTable.jsx: FOUND
- web/src/components/ProductsTable.jsx: FOUND
- web/src/App.jsx: FOUND (modified)
- Commit 1d9a0d3 (Task 1): FOUND
- Commit bfbda4f (Task 2): FOUND

---
*Phase: 03-profit-dashboard*
*Completed: 2026-03-14*
