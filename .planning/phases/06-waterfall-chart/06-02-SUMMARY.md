---
phase: 06-waterfall-chart
plan: "02"
subsystem: ui
tags: [react, recharts, waterfall-chart, api, jsx, tdd, green-phase]

requires:
  - phase: 06-waterfall-chart plan 01
    provides: failing tests for computeWaterfallData and shippingCost API assertions
provides:
  - routes/api.js with shippingCost in overview and orders API responses
  - web/src/components/WaterfallChart.jsx with computeWaterfallData (named) and WaterfallChart (default)
  - web/src/styles.css with pt-modal-overlay, pt-modal, pt-modal-header, pt-modal-close CSS classes
  - babel.config.js enabling Jest to parse JSX files in the root project
affects:
  - Plan 06-03 (WaterfallModal integration uses WaterfallChart component and modal CSS)
  - Phase 8 and beyond (waterfall chart reused for ad spend step)

tech-stack:
  added:
    - "@babel/preset-react (devDependency — enables Jest JSX parsing)"
    - "@babel/preset-env (devDependency — pairs with preset-react for node-target transforms)"
  patterns:
    - "Named export computeWaterfallData + default export WaterfallChart from one file"
    - "Pure transform function (computeWaterfallData) co-located with React component for testability"
    - "Conditional step array assembly before passing to computeWaterfallData (avoids null in pure fn)"
    - "getCellColor dispatches on entry.type and entry.label for per-bar theme color"
    - "babel.config.js at repo root for Jest JSX transform (Vite handles web/ via @vitejs/plugin-react)"

key-files:
  created:
    - web/src/components/WaterfallChart.jsx
    - babel.config.js
  modified:
    - routes/api.js
    - web/src/styles.css
    - package.json

key-decisions:
  - "Added babel.config.js with @babel/preset-react to root project — Jest needs JSX parsing for chart.test.js; Vite (web/) already handles JSX via @vitejs/plugin-react"
  - "computeWaterfallData does not guard against null inputs — caller (WaterfallChart component) is responsible for filtering null steps before calling; invariant enforced by conditional push logic"
  - "WaterfallChart empty-state guard uses !revenueNet (falsy check) to cover both 0 and undefined"

patterns-established:
  - "TDD GREEN: implement production code to satisfy failing tests written in RED phase"
  - "Recharts waterfall pattern: Bar dataKey returns [barBottom, barTop] tuple; Cell per-bar color via getCellColor"
  - "Modal CSS appended to styles.css under named comment block — no new CSS file created"

requirements-completed: [CHART-01, CHART-03, CHART-04]

duration: 15min
completed: 2026-03-18
---

# Phase 6 Plan 2: Waterfall Chart Implementation Summary

**Recharts waterfall chart component with computeWaterfallData transform, shippingCost added to both API endpoints, and modal CSS — turns 4+4 RED tests GREEN (74 total passing)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-18T21:30:00Z
- **Completed:** 2026-03-18T21:45:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `shippingCost` to overview aggregate and orders serialization in routes/api.js (zero query changes)
- Created WaterfallChart.jsx with pure `computeWaterfallData` (named export) and `WaterfallChart` component (default export) using recharts BarChart with [barBottom, barTop] tuple bars and per-bar Cell color
- Appended modal CSS (pt-modal-overlay, pt-modal, pt-modal-header, pt-modal-close) to styles.css for Plan 03 WaterfallModal
- Added babel.config.js with @babel/preset-react so Jest can parse JSX from WaterfallChart.jsx

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shippingCost to overview and orders API responses** - `674a6a5` (feat)
2. **Task 2: Create WaterfallChart.jsx with computeWaterfallData + modal CSS** - `530a35c` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `routes/api.js` - Added shippingCost field to overview response (line ~200) and orders map (line ~241)
- `web/src/components/WaterfallChart.jsx` - New: computeWaterfallData + getCellColor + WaterfallTooltip + WaterfallChart (recharts)
- `web/src/styles.css` - Appended pt-modal-overlay, pt-modal, pt-modal-header, pt-modal-close CSS blocks
- `babel.config.js` - New: @babel/preset-env + @babel/preset-react for Jest JSX transform
- `package.json` - Added @babel/preset-react and @babel/preset-env as devDependencies

## Decisions Made

- **babel.config.js needed (Rule 3 - Blocking):** chart.test.js imports computeWaterfallData from WaterfallChart.jsx. Once the file existed, Jest failed to parse JSX because no transform was configured at the root level. Added babel.config.js with @babel/preset-react. Vite (web/) already handles JSX via @vitejs/plugin-react — this is additive only for the root Jest runner.
- **Null guard is caller responsibility:** computeWaterfallData receives only well-formed steps. WaterfallChart conditionally pushes steps (checks cogsKnown && cogsTotal !== null before COGS step, checks cogsKnown && netProfit !== null before Net Profit step) so null values never reach the pure transform.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added babel.config.js + @babel/preset-react for Jest JSX parsing**
- **Found during:** Task 2 (Create WaterfallChart.jsx)
- **Issue:** Jest's `testEnvironment: 'node'` has no JSX transform. Once WaterfallChart.jsx existed, chart.test.js failed with `SyntaxError: Support for the experimental syntax 'jsx' isn't currently enabled` instead of the expected module-not-found error.
- **Fix:** Installed `@babel/preset-react` and `@babel/preset-env` as devDependencies; created `babel.config.js` with both presets targeting `node: 'current'`.
- **Files modified:** babel.config.js (new), package.json, package-lock.json
- **Verification:** `npx jest tests/chart.test.js --no-coverage` → 4 passed; full suite → 74 passed, 0 failed.
- **Committed in:** 530a35c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for any JSX file to be testable under root Jest runner. No scope creep — babel.config.js is a standard Jest+React setup artifact.

## Issues Encountered

None beyond the JSX transform blocking issue documented above.

## Next Phase Readiness

- WaterfallChart.jsx is ready for integration in Plan 03 (WaterfallModal + Overview wiring)
- Modal CSS classes are in place for WaterfallModal component
- All 74 tests green — no blockers
- Plan 03 can import `WaterfallChart` (default) and optionally `computeWaterfallData` (named) from `web/src/components/WaterfallChart.jsx`

---
*Phase: 06-waterfall-chart*
*Completed: 2026-03-18*
