---
phase: 6
slug: waterfall-chart
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest tests/chart.test.js tests/dashboard.test.js --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/chart.test.js tests/dashboard.test.js --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green (68+ tests)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | CHART-01, CHART-03, CHART-04 | unit | `npx jest tests/chart.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 0 | CHART-01, CHART-02 | unit | `npx jest tests/dashboard.test.js -t "shippingCost" --no-coverage` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 1 | CHART-01 | unit | `npx jest tests/chart.test.js -t "computeWaterfallData" --no-coverage` | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 1 | CHART-01 | unit | `npx jest tests/dashboard.test.js -t "shippingCost" --no-coverage` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 2 | CHART-02 | unit | `npx jest tests/dashboard.test.js -t "shippingCost" --no-coverage` | ❌ W0 | ⬜ pending |
| 6-04-01 | 04 | 2 | CHART-03 | unit | `npx jest tests/chart.test.js -t "COGS unknown" --no-coverage` | ❌ W0 | ⬜ pending |
| 6-05-01 | 05 | 2 | CHART-04 | unit | `npx jest tests/chart.test.js -t "loss order" --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/chart.test.js` — new file; stubs for `computeWaterfallData` covering CHART-01, CHART-03, CHART-04
- [ ] `tests/dashboard.test.js` — extend existing tests to assert `shippingCost` in overview and orders responses (CHART-01, CHART-02)

*(No mock changes needed — `shippingCost` is already on `orderProfit` shape in the existing mock; API changes only add a field to the serialized response)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Store-level waterfall chart renders correctly in Overview screen | CHART-01 | No jsdom/RTL in project; visual rendering | Load Overview, select date range, confirm waterfall shows Revenue, COGS, Fees, Shipping, Net Profit bars |
| Per-order waterfall modal opens on row click | CHART-02 | Visual interaction in browser | Click an order row, confirm modal opens with waterfall decomposition |
| COGS warning annotation visible when COGS data missing | CHART-03 | Visual UI state | Open order with missing COGS data, confirm warning banner shown and COGS/Net Profit bars absent |
| Loss order Net Profit bar is red and extends below baseline | CHART-04 | Visual rendering correctness | Find/seed a loss order, open waterfall, confirm red bar below zero baseline |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
