# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-14
**Phases:** 4 | **Plans:** 19 | **Timeline:** 4 days (2026-03-10 → 2026-03-14)

### What Was Built
- App Review-compliant backend: real GDPR handlers, JWT middleware, minimal scopes, env validation
- Full sync + profit engine: GraphQL Bulk Operations historical import, real-time webhooks, 15-min polling, payout fee attribution, COGS time-series, CSV bulk import
- React profit dashboard: Overview KPIs, Orders table, Products table, Trend chart, COGS coverage indicator — embedded in Shopify Admin via App Bridge
- Shopify Billing API: $29/month subscription with 7-day trial gating OAuth callback, /admin, and /api middleware

### What Worked
- TDD scaffold approach (failing RED tests first) — caught contract mismatches early and made all 19 plans verifiable
- COGS time-series insert-only model — clean architecture that prevents subtle historical profit corruption
- Wave-based plan structure within phases — clear dependency ordering, easy to reason about parallelization
- Coarse granularity (4 phases instead of 10+) — kept context manageable and each phase delivered one coherent capability

### What Was Inefficient
- Phase 2 ROADMAP was created with 6 plans but a 7th gap-closure plan (02-07) was inserted without updating ROADMAP phase count or checkboxes — minor but created a misleading progress display
- Node 16.20.2 compatibility issues hit multiple times: jest@30 → jest@29, Vite 9 → Vite 4, create-vite@4 — should have established Node version constraints in Phase 1 as a project convention
- Payout-to-order mapping and GraphQL transaction.fees field path were flagged as needing live verification but not resolved — these are latent risks entering v1.1

### Patterns Established
- Manual Jest mock at `tests/__mocks__/prisma.js` with `moduleNameMapper` — consistent across all test files
- Respond-first pattern for all webhook handlers (200 before async) — Shopify 5-second delivery timeout
- Insert-only pattern for COGS time-series (ProductCost rows, never update) with NULL propagation to netProfit for unknown COGS
- Dual-aggregate query pattern for dashboard overview to prevent NULL poisoning from COGS-unknown orders
- App Bridge CDN first in `<head>` (hard requirement for `window.shopify` global)
- TDD RED scaffold in Wave 0 of each phase — all tests fail before any implementation

### Key Lessons
1. Node version constraints should be declared upfront — `jest@30`, `Vite 9`, and `create-vite@9` all required version downgrades discovered mid-phase
2. Live API verification (payout mapping, GraphQL field paths) should be done before building dependent sync logic — not deferred as blockers
3. Insert-only data patterns are worth the query complexity tradeoff — time-series COGS is much cleaner than mutable records with audit logs
4. Billing should be planned last but implemented before dashboard — reversed order would have required rework

### Cost Observations
- Model mix: balanced profile (sonnet primary)
- Sessions: multiple across 4 days
- Notable: coarse granularity (4 phases) kept each session focused on one capability; minimal context reloading needed

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 19 | Initial baseline — TDD scaffold pattern established |

### Cumulative Quality

| Milestone | Tests | Notes |
|-----------|-------|-------|
| v1.0 | 51+ | All passing at ship; covers all 4 phases end-to-end |

### Top Lessons (Verified Across Milestones)

1. TDD RED scaffolds before implementation — prevents shipping untested edge cases
2. Coarse phase granularity (4-7 phases per milestone) — keeps context manageable per session
