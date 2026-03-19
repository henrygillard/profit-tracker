---
phase: 9
slug: google-ads-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 |
| **Config file** | `jest.config.js` (root) — `testMatch: ['**/tests/**/*.test.js']` |
| **Quick run command** | `npm test -- --testPathPattern=google-ads\|syncAdSpend\|ads` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=google-ads|syncAdSpend|ads`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 0 | ADS-04 | unit | `npm test -- --testPathPattern=google-ads` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 0 | ADS-04 | unit | `npm test -- --testPathPattern=ads` | ✅ extend | ⬜ pending |
| 9-01-03 | 01 | 0 | ADS-05 | unit | `npm test -- --testPathPattern=syncAdSpend` | ✅ extend | ⬜ pending |
| 9-01-04 | 01 | 0 | ADS-05 | unit | `npm test -- --testPathPattern=dashboard` | ✅ extend | ⬜ pending |
| 9-02-01 | 02 | 1 | ADS-04 | unit | `npm test -- --testPathPattern=google-ads` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | ADS-04 | unit | `npm test -- --testPathPattern=google-ads` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 2 | ADS-05 | unit | `npm test -- --testPathPattern=syncAdSpend` | ✅ extend | ⬜ pending |
| 9-03-02 | 03 | 2 | ADS-05 | unit | `npm test -- --testPathPattern=dashboard` | ✅ extend | ⬜ pending |
| 9-03-03 | 03 | 2 | ADS-06 | unit | `npm test -- --testPathPattern=ads` | ✅ extend | ⬜ pending |
| 9-04-01 | 04 | 3 | ADS-06 | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/google-ads.test.js` — ADS-04: GET /google-ads/auth iframe escape HTML, GET /google-ads/callback encrypted token upsert, DELETE /api/ads/disconnect?platform=google
- [ ] Extend `tests/syncAdSpend.test.js` — ADS-05: Google branch happy path micros conversion (`parseInt / 1_000_000`), `invalid_grant` no-throw + deleteMany, `platform='google'` no longer throws unsupported
- [ ] Extend `tests/ads.test.js` — ADS-04/ADS-06: DELETE /disconnect?platform=google, Google campaign rows in campaigns endpoint
- [ ] Extend `tests/dashboard.test.js` — ADS-05: overview returns `metaAdSpend`, `googleAdSpend`, `totalAdSpend` fields

*Existing infrastructure: `tests/__mocks__/prisma.js` has adConnection/adSpend mocks; `global.fetch = jest.fn()` pattern established; `makeApp()` factory established; `process.env.ADS_ENCRYPTION_KEY` mock established. New env var needed: `process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-dev-token'`*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth consent screen shown in iframe | ADS-04 | Requires browser + real Google OAuth flow | Navigate to /google-ads/auth in Shopify Admin iframe; confirm consent screen appears without popup |
| Connect button appears in AdsView settings | ADS-04 | React UI state check | Load AdsView in dev; confirm "Connect Google Ads" button visible when no GoogleAdConnection |
| Disconnect button removes connection | ADS-04 | React UI state check | With connection present, click disconnect; confirm button reverts to "Connect" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
