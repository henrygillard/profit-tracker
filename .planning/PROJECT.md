# Shopify Profit Analytics App

## What This Is

A Shopify-native profit clarity dashboard that shows merchants their **actual profit margins** — not just revenue — by automatically factoring in COGS, Shopify fees, shipping costs, and ad spend. Targeting Shopify stores doing $10K–$200K/month who are frustrated by the gap between revenue and what they actually take home. Priced at $19–$49/month to undercut Triple Whale significantly.

## Core Value

Merchants see what they actually kept — not just what came in — within 10 minutes of installing.

## Requirements

### Validated

<!-- Already built in the current scaffold -->

- ✓ Shopify OAuth installation flow (auth initiation, callback, HMAC verification) — existing
- ✓ Per-shop session management (PostgreSQL via Prisma) — existing
- ✓ App uninstall webhook with session cleanup — existing
- ✓ Embedded admin UI framework (CSP headers, app served in Shopify iframe) — existing
- ✓ Multi-shop support (shop-isolated sessions) — existing
- ✓ Railway deployment infrastructure (Dockerfile, env config) — existing

### Active

<!-- Phase 1 MVP — building toward these -->

- [ ] Merchant can enter COGS per SKU (manual) and import via CSV
- [ ] App automatically calculates Shopify transaction fees and payment processor fees per order
- [ ] Merchant can view store-level profit overview with date range filtering (daily/weekly/monthly/custom)
- [ ] Merchant can view profit and margin % per order
- [ ] Merchant can view profit and margin % per product/SKU
- [ ] App shows best and worst performing products by margin
- [ ] App syncs orders, products, and payouts from Shopify API

### Out of Scope

- Meta/Google ad integration — Phase 2, post-traction
- Customer cohort LTV analysis — Phase 3
- Margin trend analysis per SKU — Phase 3
- Multi-channel support (Amazon, eBay, etc.) — Shopify-only, single platform focus
- Mobile app — web-first via Shopify embedded admin
- Real-time data — batch sync is sufficient for profit analytics

## Context

**Existing infrastructure:** The codebase is a working Shopify app scaffold with full OAuth, session management, webhook handling, and PostgreSQL via Prisma. The foundation is solid — all profit analytics features build on top of this. Deployed on Railway.

**Tech stack:** Node.js / Express, PostgreSQL, Prisma ORM. No frontend framework yet — admin UI is currently inline HTML. The MVP plan calls for a React frontend embedded in Shopify Admin via App Bridge, but this will need to be introduced.

**Market context:** Competitors (Triple Whale at $129/mo, BeProfit, Peel Insights) are either expensive or have UX complaints. The opportunity is an affordable ($19–$49/mo), simple, fast-to-value profit dashboard that works exclusively on Shopify.

**Shopify API strategy:** Admin REST API + GraphQL for orders, products, and payouts. Shopify Shipping API for label costs may need investigation — manual input may be the MVP fallback.

## Constraints

- **Tech Stack**: Node.js/Express backend — no framework switch. Align new code with existing patterns
- **Database**: PostgreSQL via Prisma — extend schema, don't replace
- **Hosting**: Railway — Docker-based deployment already configured
- **Shopify**: Must work as embedded app (App Bridge + CSP requirements already in place)
- **Time-to-value**: Merchant sees meaningful profit data within 10 minutes of install — drives UX decisions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shopify-only (no multi-channel) | Simpler integration, clearer value prop, avoids scope creep | — Pending |
| Manual COGS input first, CSV import second | Fast time-to-value; CSV is second-order optimization | — Pending |
| Phase 2 (ads) post-traction | Validate core profit dashboard before adding complexity | — Pending |
| $19–$49/month pricing | Undercut Triple Whale ($129/mo) significantly | — Pending |
| Railway hosting | Consistent with existing Promify infrastructure | ✓ Good |
| PostgreSQL + Prisma | Already in place, good fit for relational profit data | ✓ Good |

---
*Last updated: 2026-03-10 after initialization*
