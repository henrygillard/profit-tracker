---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x + Supertest 7.x |
| **Config file** | `jest.config.js` — Wave 0 creates this |
| **Quick run command** | `npx jest --testPathPattern=tests/` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=tests/`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | FOUND-01 | integration | `npx jest tests/webhooks.test.js -t "customers/redact"` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | FOUND-01 | integration | `npx jest tests/webhooks.test.js -t "customers/redact 401"` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | FOUND-01 | integration | `npx jest tests/webhooks.test.js -t "shop/redact deletes"` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | FOUND-01 | integration | `npx jest tests/webhooks.test.js -t "data_request"` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 0 | FOUND-02 | unit | `npx jest tests/scopes.test.js` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 0 | FOUND-03 | unit | `npx jest tests/env.test.js -t "missing SHOPIFY_API_KEY"` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 0 | FOUND-03 | unit | `npx jest tests/env.test.js -t "missing DATABASE_URL"` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 0 | FOUND-04 | integration | `npx jest tests/auth.test.js -t "missing token"` | ❌ W0 | ⬜ pending |
| 1-04-02 | 04 | 0 | FOUND-04 | integration | `npx jest tests/auth.test.js -t "valid token"` | ❌ W0 | ⬜ pending |
| 1-04-03 | 04 | 0 | FOUND-04 | integration | `npx jest tests/auth.test.js -t "expired token"` | ❌ W0 | ⬜ pending |
| 1-04-04 | 04 | 0 | FOUND-04 | integration | `npx jest tests/auth.test.js -t "wrong audience"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/webhooks.test.js` — covers FOUND-01 (GDPR handler behavior with mocked Prisma)
- [ ] `tests/auth.test.js` — covers FOUND-04 (JWT middleware: valid, expired, missing, wrong aud)
- [ ] `tests/env.test.js` — covers FOUND-03 (startup validation behavior via child_process)
- [ ] `tests/scopes.test.js` — covers FOUND-02 (toml scope list assertion)
- [ ] `jest.config.js` — test runner configuration
- [ ] `tests/__mocks__/prisma.js` — mock Prisma client for integration tests
- [ ] `npm install --save-dev jest supertest` — framework install

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shopify GDPR test webhook fires and hits live endpoint | FOUND-01 | Requires Partner Dashboard test trigger | Use Partner Dashboard → App → GDPR compliance test |
| `read_all_orders` approval request submitted | FOUND-02 | Requires Partner Dashboard form submission | Submit scope justification form in Partner Dashboard |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
