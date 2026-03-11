---
phase: 2
slug: sync-and-profit-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x + Supertest 7.x (existing from Phase 1) |
| **Config file** | `jest.config.js` — already exists |
| **Quick run command** | `npx jest --testPathPattern=tests/(sync\|profit\|cogs\|fees)` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=tests/profit` (profit engine is pure — fastest feedback)
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | SYNC-01 | unit | `npx jest tests/sync.test.js -t "bulk operation"` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 0 | SYNC-01 | unit | `npx jest tests/sync.test.js -t "JSONL parser"` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 0 | SYNC-01 | integration | `npx jest tests/sync.test.js -t "upsert creates profit"` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 0 | SYNC-02 | integration | `npx jest tests/sync.test.js -t "orders/paid webhook"` | ❌ W0 | ⬜ pending |
| 2-01-05 | 01 | 0 | SYNC-02 | integration | `npx jest tests/sync.test.js -t "orders/paid 401"` | ❌ W0 | ⬜ pending |
| 2-01-06 | 01 | 0 | SYNC-02 | integration | `npx jest tests/sync.test.js -t "refunds/create"` | ❌ W0 | ⬜ pending |
| 2-01-07 | 01 | 0 | SYNC-03 | unit | `npx jest tests/sync.test.js -t "scheduler"` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 0 | COGS-01 | integration | `npx jest tests/cogs.test.js -t "manual COGS entry"` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 0 | COGS-02 | unit | `npx jest tests/cogs.test.js -t "auto-populate from Shopify"` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 0 | COGS-03 | integration | `npx jest tests/cogs.test.js -t "CSV import"` | ❌ W0 | ⬜ pending |
| 2-02-04 | 02 | 0 | COGS-03 | unit | `npx jest tests/cogs.test.js -t "CSV invalid row"` | ❌ W0 | ⬜ pending |
| 2-02-05 | 02 | 0 | COGS-04 | unit | `npx jest tests/cogs.test.js -t "time-series lookup"` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 0 | FEES-01 | unit | `npx jest tests/fees.test.js -t "plan fee rates"` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 0 | FEES-02 | unit | `npx jest tests/fees.test.js -t "Shopify Payments fee"` | ❌ W0 | ⬜ pending |
| 2-03-03 | 03 | 0 | FEES-03 | unit | `npx jest tests/sync.test.js -t "shipping cost"` | ❌ W0 | ⬜ pending |
| 2-03-04 | 03 | 0 | FEES-04 | unit | `npx jest tests/profit.test.js -t "refund profit reversal"` | ❌ W0 | ⬜ pending |
| 2-03-05 | 03 | 0 | FEES-04 | unit | `npx jest tests/profit.test.js -t "partial refund COGS"` | ❌ W0 | ⬜ pending |
| 2-03-06 | 03 | 0 | SYNC-04 | unit | `npx jest tests/fees.test.js -t "payout fee attribution"` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 0 | (all) | unit | `npx jest tests/profit.test.js -t "unknown COGS"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sync.test.js` — JSONL parser, order upsert, webhook handlers, scheduler
- [ ] `tests/profit.test.js` — profit engine pure function tests, refund reversal, null COGS
- [ ] `tests/cogs.test.js` — manual entry, auto-populate, CSV import, time-series lookup
- [ ] `tests/fees.test.js` — plan detection map, payout fee attribution, third-party fallback
- [ ] `tests/__mocks__/shopifyClient.js` — mock for Shopify GraphQL calls (avoid real API in tests)
- [ ] Schema migration: `npx prisma db push` after adding new models (Order, OrderProfit, ProductCost, ShopConfig)
- [ ] Install: `npm install node-cron multer csv-parser`

*Existing Jest + Supertest infrastructure from Phase 1 covers runner, config, and Prisma mock pattern.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Historical sync (500 orders) lands fully in DB | SYNC-01 | Requires live Shopify dev store with bulk ops approved | Install app on dev store with >500 orders; verify count in DB matches Shopify admin |
| Webhook fires within minutes of paid order | SYNC-02 | Requires real webhook delivery pipeline | Place test order on dev store; confirm record in DB within 2 minutes |
| Payout fee sign convention under partial refund | FEES-04 | Sign behavior undocumented for partial refunds | Create partial refund on Shopify Payments order; verify `feeAmount` sign in DB |
| Shopify Plus third-party rate accuracy | FEES-01 | Conflicting sources (0.15% vs 0.2%) | Verify at shopify.com/pricing before shipping |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
