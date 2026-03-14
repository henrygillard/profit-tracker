---
phase: 3
slug: profit-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (existing) |
| **Config file** | `jest.config.js` (root) |
| **Quick run command** | `npm test -- --testPathPattern=dashboard` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=dashboard`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-xx-01 | TBD | 0 | DASH-01–05 | setup | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-02 | TBD | 1 | DASH-01 | integration | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-03 | TBD | 1 | DASH-01 | unit | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-04 | TBD | 1 | DASH-02 | integration | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-05 | TBD | 1 | DASH-02 | unit | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-06 | TBD | 1 | DASH-03 | integration | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-07 | TBD | 1 | DASH-04 | integration | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-08 | TBD | 1 | DASH-04 | unit | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-09 | TBD | 1 | DASH-05 | unit | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |
| 3-xx-10 | TBD | 1 | DASH-05 | unit | `npm test -- --testPathPattern=dashboard` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/dashboard.test.js` — stubs for DASH-01 through DASH-05 (all backend route behaviors)
- [ ] No framework install needed — Jest 29 + Supertest already present in the project

*Existing test infrastructure (`tests/__mocks__/prisma.js`, `jest.config.js`) covers all setup needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Polaris Web Components render correctly in Shopify Admin iframe | DASH-01–05 | Requires live Shopify store embedded context; not reproducible in Jest | Install app on dev store, open `/admin`, verify s-table / s-banner / s-badge elements render with correct styling |
| `shopify.idToken()` resolves within 5 seconds and returns valid token | DASH-01–05 | App Bridge CDN behavior depends on embedded context; cannot be mocked reliably | Open app in admin iframe, check DevTools network tab — confirm `Authorization: Bearer <token>` header on all `/api/dashboard/*` calls |
| Profit trend line chart renders with correct data points | DASH-04 | Recharts renders to SVG/canvas; no Jest DOM renderer in project | Load dashboard with a date range that has known data; verify line chart displays correct number of data points and tooltip shows correct values |
| NULL COGS orders show warning badge (not $0) in Orders table | DASH-05 | Requires visual inspection of rendered Polaris components | Create a test order with no product cost; open Orders view; verify the COGS column shows "Unknown" badge and net profit column shows "—" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
