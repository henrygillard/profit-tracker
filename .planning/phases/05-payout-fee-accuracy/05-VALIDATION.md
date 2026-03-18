---
phase: 5
slug: payout-fee-accuracy
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | package.json (jest config) |
| **Quick run command** | `npm test -- --testPathPattern=fee` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=fee`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | FEEX-01 | unit | `npm test -- --testPathPattern=feeSource` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | FEEX-01 | unit | `npm test -- --testPathPattern=feeSource` | ✅ | ⬜ pending |
| 5-02-01 | 02 | 2 | FEEX-01 | unit | `npm test -- --testPathPattern=fees` | ✅ | ⬜ pending |
| 5-02-02 | 02 | 2 | FEEX-03 | unit | `npm test -- --testPathPattern=fees` | ✅ | ⬜ pending |
| 5-02-03 | 02 | 2 | FEEX-04 | unit | `npm test -- --testPathPattern="fees\|webhooks"` | ✅ | ⬜ pending |
| 5-03-01 | 03 | 3 | FEEX-02 | unit | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 3 | FEEX-02 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/fees.test.js` — stub tests for FEEX-01/FEEX-03/FEEX-04 (added in Plan 01, Task 1)
- [x] `tests/webhooks.test.js` — stub tests for FEEX-04 refund passthrough (added in Plan 01, Task 2)
- [ ] `tests/dashboard.test.js` — stubs for FEEX-02 (fee status badge rendering, added in Plan 01 if required; else Plan 03 Task 1 is the W0 step)

*Existing test infrastructure (jest) covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fee status badge visible in Orders table UI | FEEX-02 | UI rendering requires visual inspection | Load Orders page, verify each row shows "Verified", "Estimated", or "Pending" badge — never blank |
| Pending orders show "Pending" not a number | FEEX-03 | Requires live Shopify Payments test store with unsettled orders | Place test order, verify fee column shows "Pending" before payout settles |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
