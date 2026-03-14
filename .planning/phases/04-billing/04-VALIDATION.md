---
phase: 4
slug: billing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest tests/billing.test.js --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/billing.test.js --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 4-01-04 | 01 | 1 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 2 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 3 | BILL-01 | unit | `npx jest tests/billing.test.js --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/billing.test.js` — stubs for all BILL-01 behaviors (new install redirect, active subscription passthrough, cancelled/expired gate, webhook update with HMAC verification, empty payload live query fallback)

*Follows `tests/webhooks.test.js` pattern: supertest + jest mocks for prisma and shopifyClient*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Merchant sees Shopify subscription approval page UI | BILL-01 | Requires real Shopify partner dev store + browser | Install app, check redirect to `myshopify.com/admin/charges/confirm_recurring` |
| Subscription shows in Shopify Partners dashboard | BILL-01 | Requires real billing environment | Accept charge, verify in Partners > Apps > {app} > Billing |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
