# Milestones

## v1.0 MVP (Shipped: 2026-03-14)

**Phases completed:** 4 phases, 19 plans
**Requirements:** 22/22 v1 requirements shipped
**Timeline:** 2026-03-10 → 2026-03-14 (4 days)
**Codebase:** ~4,664 LOC JavaScript/JSX

**Key accomplishments:**
- Cleared Shopify App Review blockers: real GDPR handlers, minimal scopes, JWT session-token middleware, env validation at startup
- Full order sync engine: historical bulk import via GraphQL Bulk Operations, real-time webhooks (paid/updated/cancelled/refunded), 15-min polling backstop
- Profit engine: COGS time-series (insert-only, no retroactive rewrite), Shopify Payments payout fee attribution, third-party gateway rate config, shipping cost tracking
- Merchant COGS management: manual per-variant entry, CSV bulk import, auto-population from Shopify inventoryItem.unitCost
- React profit dashboard (Vite + Polaris): Overview KPIs, Orders table, Products table, Trend chart, COGS coverage indicator — served from Express /admin
- Shopify Billing API: $29/month subscription with 7-day trial, gating OAuth callback + /admin + /api, full lifecycle including app_subscriptions/update webhook

---

