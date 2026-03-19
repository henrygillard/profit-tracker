---
phase: 8
slug: meta-ads-ads-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-19
revised: 2026-03-19
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js |
| **Quick run command** | `npm test -- --testPathPattern=ads` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=ads`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | ADS-01, ADS-02, ADS-03 | unit | `npm test -- --testPathPattern=ads` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | ADS-01, CHART-05 | unit | `npm test -- --testPathPattern="encrypt\|chart"` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 2 | ADS-01 | unit | `npm test -- --testPathPattern=ads 2>&1 \| head -40` | ✅ | ⬜ pending |
| 8-02-02 | 02 | 2 | ADS-01 | unit | `npm test -- --testPathPattern=webhooks` | ✅ | ⬜ pending |
| 8-03-01 | 03 | 2 | ADS-02, ADS-03 | unit | `node -e "const s = require('./lib/syncAdSpend'); console.log(typeof s.syncAdSpend)"` | ❌ W0 | ⬜ pending |
| 8-03-02 | 03 | 2 | ADS-02, ADS-03, ADS-07 | unit | `npm test -- --testPathPattern=ads` | ✅ | ⬜ pending |
| 8-04-01 | 04 | 3 | ADS-01, ADS-07, CHART-05 | unit | `cd web && npm run build 2>&1 \| tail -10` | ✅ | ⬜ pending |
| 8-04-02 | 04 | 3 | ADS-07, CHART-05 | unit | `npm test -- --testPathPattern=chart` | ✅ | ⬜ pending |
| 8-04-03 | 04 | 3 | ALL | human | human checkpoint | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 test infrastructure is created in Plan 01 Task 2. The single test file for ads routes is:

- [x] `tests/ads.test.js` — stubs for ADS-01 (OAuth flow), ADS-02 (spend endpoint), ADS-03 (campaigns endpoint), ADS-07 (ROAS assertions)
- [x] `tests/encrypt.test.js` — AES-256-GCM round-trip and error tests
- [x] `tests/chart.test.js` — CHART-05 6-step waterfall sequence (extends existing file)
- [x] `tests/__mocks__/prisma.js` — adConnection and adSpend mock objects (extends existing file)

*Note: All Wave 0 stubs are in tests/ads.test.js (not split into ads-schema.test.js, ads-oauth.test.js, etc. — those names were from an earlier planning iteration).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Meta OAuth flow works in Safari within Shopify Admin iframe | ADS-01 | Browser environment required; popup-less form.submit pattern must be verified visually | 1. Open app in Shopify Admin on Safari. 2. Navigate to Ads tab. 3. Click "Connect Meta Ads". 4. Complete OAuth in same tab/window. 5. Verify redirect back to app with connected state. |
| OAuth does not open a popup window | ADS-01 | Requires real browser testing | Follow above steps; confirm no popup appears |
| Campaign spend breakdown table shows correct data | ADS-03 | Requires live Meta test ad account | Connect test ad account; verify campaign names and spend amounts match Meta Ads Manager |
| Ad Spend step appears in waterfall chart after connection | CHART-05 | Requires connected Meta account + visual verification | Connect Meta Ads; check waterfall shows Revenue → COGS → Fees → Shipping → Ad Spend → Net Profit |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (tests/ads.test.js created in Plan 01 Task 2)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
