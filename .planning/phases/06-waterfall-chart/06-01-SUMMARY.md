---
phase: 06-waterfall-chart
plan: "01"
subsystem: tests
tags: [tdd, red-phase, chart, waterfall, wave-0]
dependency_graph:
  requires: []
  provides:
    - tests/chart.test.js with computeWaterfallData unit tests (RED)
    - tests/dashboard.test.js with shippingCost assertions (RED)
  affects:
    - Plan 06-02 (implementation must make these tests GREEN)
    - Plan 06-03 (visual integration must not break these tests)
tech_stack:
  added: []
  patterns:
    - TDD RED phase — test-first, implementation follows in Plan 02
    - Jest describe/test structure matching existing dashboard.test.js conventions
key_files:
  created:
    - tests/chart.test.js
  modified:
    - tests/dashboard.test.js
decisions:
  - "Import computeWaterfallData as named export (not default) from WaterfallChart.jsx — matches the named export pattern documented in RESEARCH.md"
  - "4 shippingCost assertions fail total (2 in DASH-01/DASH-02 toMatchObject + 2 in dedicated CHART-01/CHART-02 blocks) — all expected RED"
  - "chart.test.js fails at module resolution (0 tests counted) because WaterfallChart.jsx does not exist; this is correct RED state"
metrics:
  duration: "3 minutes"
  completed: "2026-03-18"
  tasks_completed: 2
  files_modified: 2
---

# Phase 6 Plan 1: Waterfall Chart TDD RED Phase Summary

Wave 0 test scaffolds created — failing unit tests for `computeWaterfallData` and failing API field assertions for `shippingCost` that gate Plan 02 implementation.

## What Was Built

### Task 1: tests/chart.test.js (new file)

Created 4 unit tests for `computeWaterfallData` imported from `../web/src/components/WaterfallChart.jsx`:

1. **Normal 5-step sequence** (CHART-01): Revenue=1000, COGS=300, Fees=50, Shipping=20, NetProfit=630 — asserts exact `barBottom`/`barTop` for each step
2. **Loss order** (CHART-04): Revenue=500, COGS=300, Fees=150, Shipping=100 → running=-50 — asserts total bar has `barBottom=-50, barTop=0`
3. **COGS unknown omit** (CHART-03): 4-step input with no COGS step — asserts function does not throw and no null/undefined bar values
4. **All-zero guard**: 5 steps all zero — asserts no NaN or undefined in output

All fail with `Cannot find module '../web/src/components/WaterfallChart.jsx'` — correct RED state.

### Task 2: tests/dashboard.test.js (extended)

Added `shippingCost` assertions in 4 places:

- **DASH-01 toMatchObject**: Added `shippingCost: expect.any(Number)` — fails because API response does not include the field
- **DASH-02 first test**: Added `shippingCost: 15.0` to mock and `shippingCost: expect.any(Number)` to assertion — fails same reason
- **CHART-01 describe block** (new): Exact value assertion `expect(res.body.shippingCost).toBe(25)` — fails
- **CHART-02 describe block** (new): Per-order assertion `expect(res.body[0].shippingCost).toBe(8)` — fails

## Test Results

```
tests/chart.test.js  — FAIL: Cannot find module (0 tests run, module missing)
tests/dashboard.test.js — FAIL: 4 failed, 8 passed (all failures are new shippingCost assertions)
```

Previously passing tests: 66 passing — no regressions introduced.

## Deviations from Plan

None — plan executed exactly as written.

The plan noted the DASH-01 first test would need `shippingCost` in toMatchObject — this caused that existing test to fail (RED). Similarly the DASH-02 first test now fails. Both are expected and correct: Plan 02 will add `shippingCost` to both API responses, turning these GREEN.

## Self-Check

### Created files exist:
- tests/chart.test.js — FOUND
- tests/dashboard.test.js — FOUND (modified)

### Commits exist:
- 70c1d72 — test(06-01): add failing computeWaterfallData tests (RED)
- 0d668b8 — test(06-01): extend dashboard tests with shippingCost assertions (RED)

## Self-Check: PASSED
