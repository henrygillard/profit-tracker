---
phase: 8
slug: meta-ads-ads-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
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
| 8-01-01 | 01 | 1 | ADS-01 | unit | `npm test -- --testPathPattern=ads-schema` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | ADS-01 | unit | `npm test -- --testPathPattern=ads-encryption` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | ADS-02 | manual | — | — | ⬜ pending |
| 8-02-02 | 02 | 1 | ADS-02 | unit | `npm test -- --testPathPattern=ads-oauth` | ❌ W0 | ⬜ pending |
| 8-03-01 | 03 | 2 | ADS-03 | unit | `npm test -- --testPathPattern=ads-sync` | ❌ W0 | ⬜ pending |
| 8-03-02 | 03 | 2 | ADS-03 | unit | `npm test -- --testPathPattern=ads-insights` | ❌ W0 | ⬜ pending |
| 8-04-01 | 04 | 2 | ADS-07 | unit | `npm test -- --testPathPattern=ads-profit` | ❌ W0 | ⬜ pending |
| 8-05-01 | 05 | 3 | CHART-05 | unit | `npm test -- --testPathPattern=waterfall` | ✅ | ⬜ pending |
| 8-05-02 | 05 | 3 | ADS-07 | unit | `npm test -- --testPathPattern=ads-roas` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ads-schema.test.js` — stubs for ADS-01 (schema, migrations)
- [ ] `tests/ads-encryption.test.js` — stubs for ADS-01 (AES-256-GCM token encryption)
- [ ] `tests/ads-oauth.test.js` — stubs for ADS-02 (OAuth callback, token exchange)
- [ ] `tests/ads-sync.test.js` — stubs for ADS-03 (cron scheduler, sync trigger)
- [ ] `tests/ads-insights.test.js` — stubs for ADS-03 (Meta Insights API parsing, pagination)
- [ ] `tests/ads-profit.test.js` — stubs for ADS-07 (ad spend deduction from net profit)
- [ ] `tests/ads-roas.test.js` — stubs for ADS-07 (Blended ROAS calculation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Meta OAuth flow works in Safari within Shopify Admin iframe | ADS-02 | Browser environment required; popup-less form.submit pattern must be verified visually | 1. Open app in Shopify Admin on Safari. 2. Navigate to Ads tab. 3. Click "Connect Meta Ads". 4. Complete OAuth in same tab/window. 5. Verify redirect back to app with connected state. |
| OAuth does not open a popup window | ADS-02 | Requires real browser testing | Follow above steps; confirm no popup appears |
| Campaign spend breakdown table shows correct data | ADS-03 | Requires live Meta test ad account | Connect test ad account; verify campaign names and spend amounts match Meta Ads Manager |
| Ad Spend step appears in waterfall chart after connection | CHART-05 | Requires connected Meta account + visual verification | Connect Meta Ads; check waterfall shows Revenue → COGS → Fees → Shipping → Ad Spend → Net Profit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
