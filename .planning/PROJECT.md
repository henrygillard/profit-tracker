# Shopify Profit Analytics App

## What This Is

A Shopify-native profit clarity dashboard that shows merchants their **actual profit margins** — not just revenue — by automatically factoring in COGS, Shopify fees, shipping costs, and payout data. Targeting Shopify stores doing $10K–$200K/month frustrated by the gap between revenue and what they actually take home. Priced at $29/month (single plan validated at MVP; two-tier post-traction).

The app is a full-stack Node.js/Express + PostgreSQL + React application embedded in Shopify Admin via App Bridge, with background order sync, payout fee attribution, COGS management, and a subscription billing gate. Ready for Shopify App Store submission.

## Core Value

Merchants see what they actually kept — not just what came in — within 10 minutes of installing.

## Requirements

### Validated

- ✓ Shopify OAuth installation flow (auth initiation, callback, HMAC verification) — existing
- ✓ Per-shop session management (PostgreSQL via Prisma) — existing
- ✓ App uninstall webhook with session cleanup — existing
- ✓ Embedded admin UI framework (CSP headers, app served in Shopify iframe) — existing
- ✓ Multi-shop support (shop-isolated sessions) — existing
- ✓ Railway deployment infrastructure (Dockerfile, env config) — existing
- ✓ GDPR webhook handlers (customer data request, customer erasure, shop redact) with real DB operations — v1.0
- ✓ OAuth scopes pruned to minimum required — v1.0
- ✓ Server validates all required env vars at startup and fails fast — v1.0
- ✓ All /api/* routes validate Shopify App Bridge session tokens (JWT) — v1.0
- ✓ Full historical order sync via GraphQL Bulk Operations on install — v1.0
- ✓ Real-time order sync via webhooks (paid/updated/cancelled/refunded) + 15-min polling backstop — v1.0
- ✓ Shopify Payments payout sync for exact transaction fee amounts — v1.0
- ✓ COGS manual entry per variant, auto-populate from Shopify inventoryItem.unitCost, CSV bulk import — v1.0
- ✓ COGS stored as insert-only time-series — cost changes never rewrite historical profit — v1.0
- ✓ Fee calculation: Shopify plan auto-detection, payout exact fees, third-party gateway rate config, refund reversal — v1.0
- ✓ Profit dashboard: store-level overview, per-order, per-product/SKU, trend chart, COGS coverage indicator — v1.0
- ✓ Shopify Billing API: $29/month subscription gate before granting access — v1.0

### Active

- [ ] Meta Ads account connection + spend attribution per order (ADS-01)
- [ ] Google Ads account connection + spend attribution per order (ADS-02)
- [ ] True profit per campaign after COGS and fees (ADS-03)
- [ ] Customer cohort LTV builder — 30/60/90/180/365 day curves (ADV-01, ADV-02)
- [ ] Margin trend per SKU over time with deterioration alerts (ADV-03)
- [ ] Two-tier pricing (Basic / Pro) — evaluate after single-plan validation (BILL-02)

### Out of Scope

- Multi-channel (Amazon, eBay, etc.) — Shopify-only focus; single platform, single API
- Mobile app — web-first via Shopify embedded admin
- Real-time streaming data — batch sync sufficient for profit analytics
- Usage-based billing — fixed monthly price simpler for MVP
- Multi-currency reporting — single-currency MVP first
- AI-generated insights — out of scope for profit clarity tool
- Seasonal profitability patterns — ADV-04, deferred post-traction

## Context

**Shipped v1.0** with ~4,664 LOC JavaScript/JSX across 4 phases in 4 days (2026-03-10 → 2026-03-14).

**Tech stack:** Node.js/Express backend, PostgreSQL via Prisma ORM, React 18 + Vite 4 frontend (served from Express /admin), Recharts for data visualization. Deployed on Railway via Docker.

**Known open questions from v1.0 development:**
- GraphQL Bulk Operations `transaction.fees` field path needs live verification against 2025-10 schema
- Shopify Payments payout-to-order 1:1 mapping should be confirmed against a real Shopify Payments store before v1.1

**Tech debt from v1.0:**
- Phase 2 ROADMAP listed 6 plans; a 7th gap-closure plan (02-07) was inserted — ROADMAP checkboxes not updated
- Billing status/subscriptionId nullable String? — consider a proper billing status enum in v1.1

## Constraints

- **Tech Stack**: Node.js/Express backend — no framework switch. Align new code with existing patterns
- **Database**: PostgreSQL via Prisma — extend schema, don't replace
- **Hosting**: Railway — Docker-based deployment already configured
- **Shopify**: Must work as embedded app (App Bridge + CSP requirements already in place)
- **Time-to-value**: Merchant sees meaningful profit data within 10 minutes of install — drives UX decisions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shopify-only (no multi-channel) | Simpler integration, clearer value prop, avoids scope creep | ✓ Good — clean MVP scope |
| Manual COGS input first, CSV import second | Fast time-to-value; CSV is second-order optimization | ✓ Good — both shipped in v1.0 |
| Phase 2 (ads) post-traction | Validate core profit dashboard before adding complexity | ✓ Good — kept MVP focused |
| Single plan at $29/month | Undercut competitors; validate willingness-to-pay before tiering | — Pending validation |
| Railway hosting | Consistent with existing Promify infrastructure | ✓ Good |
| PostgreSQL + Prisma | Already in place, good fit for relational profit data | ✓ Good |
| COGS as insert-only time-series | Cost changes must not rewrite historical profit — audit trail | ✓ Good — clean architecture |
| Batch sync over real-time | Webhook + 15-min polling backstop sufficient for profit analytics | ✓ Good — no infra complexity |
| TDD scaffold approach (failing tests first) | Catch regressions early; Nyquist compliance requirement | ✓ Good — 51+ passing tests at ship |
| App Bridge CDN + Polaris CDN (no npm packages) | Node 16 + compatibility constraints; avoid breaking embedded context | ✓ Good — avoided multiple blockers |
| Vite 4 for SPA scaffold | Node 16.20.2 compatibility — Vite 9 requires Node 20+ | ✓ Good |

---
*Last updated: 2026-03-14 after v1.0 milestone*
