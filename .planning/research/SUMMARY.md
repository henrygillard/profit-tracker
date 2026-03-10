# Project Research Summary

**Project:** Shopify Profit Tracker — React frontend milestone
**Domain:** Shopify embedded profit analytics dashboard ($10K–$200K/month merchants)
**Researched:** 2026-03-10
**Confidence:** MEDIUM (all research based on training knowledge through August 2025; no live web lookups available)

## Executive Summary

This is a Shopify embedded analytics app that layers a profit calculation engine and React dashboard on top of an existing Express/PostgreSQL/Shopify OAuth scaffold. The established pattern for this class of product is: sync orders and products from Shopify into a local database, compute profit at sync time (not at query time), and serve pre-computed aggregates to a React frontend via authenticated API routes. Every serious competitor in this space (Triple Whale, BeProfit, Lifetimely) follows this architecture, and there are well-understood patterns for each layer. The recommended build order is database schema first, then sync service, then analytics API routes, then React frontend — each phase depends entirely on the previous one.

The highest-leverage stack choice is Vite + React 18 + Shopify Polaris + App Bridge 4.x for the frontend, with Recharts for charting and TanStack Query for API data fetching. Polaris is non-negotiable for Shopify App Store compliance. The key backend addition is a background sync service using webhooks as the primary trigger and 15-minute polling as a fallback, writing pre-computed profit fields to a normalized PostgreSQL schema. This approach keeps dashboard queries as simple single-table aggregates even at 10,000+ orders.

The most dangerous risks are data correctness failures that erode merchant trust before the app ever gets traction: COGS NULL values silently treated as $0 (inflates profit), fee rates hardcoded without accounting for merchant plan tiers (systematically wrong for all merchants not on Basic), and COGS changes retroactively rewriting historical reports (destroys dashboard credibility). These must be correct from day one — they cannot be retrofitted once merchants have historical data. Secondary risks are app review blockers: the existing toml file requests 60+ scopes (will cause rejection) and GDPR webhook stubs are currently empty (guaranteed rejection). Both must be resolved before any App Store submission.

## Key Findings

### Recommended Stack

The frontend requires a separate `client/` directory with its own build pipeline. Vite 5 builds the React app to `public/app/` which Express serves as static files — clean separation with no meta-framework conflicts. App Bridge 4.x is injected by Shopify Admin's iframe context; the React package `@shopify/app-bridge-react` wraps it in a context provider and provides `useAppBridge()` hooks for session token retrieval. All Express API calls from React must include a fresh App Bridge session token (60-second TTL) as a Bearer header — do not cache tokens in state.

**Core technologies:**
- React 18 + Vite 5: SPA build pipeline, served as static files from Express — Vite is the unambiguous community standard for non-framework React in 2025; CRA is deprecated
- `@shopify/app-bridge-react` ^4.x: Embedded app context, session tokens — required for Shopify Admin iframe integration
- `@shopify/polaris` ^13.x: UI component library — required for App Store compliance and admin look-and-feel
- Recharts ^2.x: Charting — React-native, SVG-based, ComposedChart supports bar+line overlays needed for profit dashboards
- TanStack Query ^5.x: Server state management — eliminates fetch boilerplate, handles loading/error states, caching
- `date-fns` ^3.x: Date manipulation — moment.js is deprecated; date-fns is tree-shakeable and TypeScript-first
- `react-router-dom` ^6.x: Routing — conditional; only needed if multi-page; Polaris Tabs suffice for single-page layout

**Critical version note:** All version numbers should be verified with `npm show [package] version` before installation — package versions and names may have advanced since August 2025 training cutoff.

### Expected Features

**Must have (table stakes):**
- Store-level P&L overview with KPI cards (revenue, COGS, fees, net profit, margin %) — every competitor leads with this
- Date range filtering (daily/weekly/monthly/custom) — without this, the tool is useless for decision-making
- Profit per order table (sortable) — merchants need to diagnose individual order losses
- Profit per product/SKU table with best/worst ranking — the primary diagnostic unit
- Manual COGS entry per variant — MVP path; required before any profit number is meaningful
- Shopify fee calculation engine (plan-based transaction fees + gateway processing fees) — major profit leak invisible to merchants
- Orders sync from Shopify API (foundation for all calculations)
- Products/variants sync (for SKU mapping and COGS entry)
- Line chart: profit over time — merchants expect visual trends, not just tables

**Should have (competitive differentiators):**
- Shopify `costPerItem` auto-import — pre-populates COGS for merchants already using Shopify's cost field; quick win with high delight
- CSV COGS import with SKU matching — essential for stores with 50+ variants; manual entry doesn't scale
- Fee breakdown transparency — show exactly what Shopify/gateway took; high emotional value, low build cost once fee calc is done
- Profit waterfall chart per order — visual decomposition of where revenue went; strong UX differentiator
- Margin health alerts — "3 products below 10% margin" pushes insight rather than requiring the merchant to find it
- COGS coverage indicator — "42 orders missing COGS, profit may be understated by $X" — prevents misleading data

**Defer (v2+):**
- Ad spend integration (Meta/Google) — explicitly Phase 2 per PROJECT.md
- Payout reconciliation view — high complexity, niche early-user use case; payouts don't map 1:1 to orders
- Date-based COGS versioning — Lifetimely differentiator; significant complexity
- Multi-currency handling beyond display conversion
- Accounting software sync (QuickBooks, Xero) — manual CSV export sufficient for MVP
- Customer LTV/cohort analysis — different product category entirely

**Anti-features to avoid building:**
- Multi-channel (Amazon, eBay) — doubles scope for <20% of users; stay Shopify-only
- Real-time live order feed — profit analytics is inherently batch; "live" creates false precision
- AI/ML profit forecasting — requires long history and merchant trust; not appropriate for v1
- Inventory management — separate product category; COGS input is the correct stopping point

### Architecture Approach

The architecture adds three subsystems to the existing Express/PostgreSQL scaffold without replacing anything: a Data Ingestion Subsystem (background sync from Shopify API), an Analytics API Subsystem (authenticated Express routes serving pre-computed aggregates), and a React Frontend Subsystem (App Bridge embedded SPA). The critical design decision is pre-computing profit fields (`grossProfit`, `profitMargin`, `transactionFees`, `totalCOGS`) at sync time and storing them on the Order record. Dashboard queries then become simple single-table aggregates — fast even at 10,000+ orders. Real-time join-based computation at query time is the primary anti-pattern to avoid.

**Major components:**
1. Prisma Schema Extension — `Order`, `LineItem`, `Product`, `ProductVariant`, `COGS`, `SyncState` models; must be built first; everything depends on it
2. Background Sync Service — webhook-triggered (primary) + 15-minute polling (fallback); writes pre-computed profit to DB; rate limit aware
3. Analytics API Routes — session-token-authenticated Express routes serving aggregates; reads only from local DB; no Shopify API calls at request time
4. React Frontend — App Bridge embedded SPA; Polaris UI; all data from Analytics API; session token on every fetch

**Key patterns:**
- Pre-compute profit at write time (sync), read at query time (dashboard)
- Webhook primary, polling backup (15 min cadence)
- Shop-scoped everything — `shopDomain` on every model, extracted from JWT not query string
- Snapshot COGS onto line items at sync time — prevents retroactive COGS changes from rewriting history
- SyncState per shop — merchants need to know data freshness; essential for trust

**Shopify API strategy:**
- GraphQL Bulk Operations for initial historical sync (avoids REST cursor expiry and rate limit issues at scale)
- REST `updated_at_min` filter for incremental sync (simpler, adequate for 50–2,000 orders/month target stores)
- REST single-order fetch for webhook-triggered updates

### Critical Pitfalls

1. **COGS NULL silently treated as $0** — Never use `COALESCE(cogs, 0)` in profit calculations. Track COGS coverage percentage per order; show a dashboard banner when coverage is below 100%. Use a three-state model: known / estimated / unknown.

2. **Shopify plan-dependent fee rates hardcoded** — Fetch `shop.plan_name` on install; store in `ShopSession`; use a config table to map plan to transaction fee rate. This affects every profit figure for every merchant not on Basic. Also applies to Shopify Payments processing rates (2.9% Basic vs 2.4% Advanced).

3. **COGS changes retroactively rewriting historical reports** — Snapshot `unitCOGS` onto `LineItem` at sync time. When COGS changes, run an explicit recompute job rather than joining to current COGS at query time.

4. **REST pagination cursor expiry corrupting historical sync** — `page_info` tokens expire in ~30 seconds. Use GraphQL Bulk Operations for initial historical syncs. For incremental, persist a `updated_at_min` high-water mark per shop, not a cursor.

5. **App Bridge JWT not validated on every API request** — Create `requireAppBridgeAuth` middleware validating the JWT on every `/api/*` route. Extract shop from the JWT `dest` claim. Never trust `req.query.shop` for authorization.

6. **App review blockers that must be fixed before submission** — Trim the existing 60+ scopes in the toml to only scopes actually used (rejection guaranteed otherwise). Implement real GDPR webhook handlers (`customers/redact`, `customers/data_request`, `shop/redact`) that perform actual data operations — Shopify tests these.

7. **CSP missing directives for App Bridge + Polaris** — Extend the existing CSP to include `script-src cdn.shopify.com`, `style-src 'unsafe-inline' cdn.shopify.com`, `img-src cdn.shopify.com`, `connect-src {shop}`. Blank white screen in production is the failure mode.

## Implications for Roadmap

All research converges on a clear 4-phase dependency chain. Each phase has a hard prerequisite on the prior phase. There is no parallelism opportunity between phases.

### Phase 1: Data Foundation
**Rationale:** Everything in the system — sync service, API routes, and frontend — requires Prisma models to exist. This is the critical path blocker. Also includes OAuth scope cleanup and GDPR handler implementation, which must happen before any App Store submission. The schema design decisions (variant-level COGS, COGS snapshotting on line items, three-state profit model) are irreversible — getting them wrong requires a migration and data recompute.
**Delivers:** Extended Prisma schema (`Order`, `LineItem`, `Product`, `ProductVariant`, `COGS`, `SyncState`), migrations, scope cleanup, GDPR handlers
**Addresses:** Table stakes foundation; resolves existing CONCERNS.md gaps
**Avoids:** Pitfall 7 (product-level COGS), Pitfall 6 (COGS history), Pitfall 8 (NULL COGS), Pitfall 13 (60+ scopes), Pitfall 14 (GDPR stubs)

### Phase 2: Backend Sync Service
**Rationale:** Once models exist, data must flow into them before API routes can return real data. Building the sync service second means Phase 3 (API routes) can be immediately tested against real synced data rather than stubs. This phase also establishes the profit calculation engine, which is the core business logic of the product.
**Delivers:** `lib/shopify-api.js` (rate-limited REST wrapper), `lib/profit-calculator.js` (pure function), `lib/sync.js` (orchestration), historical sync on OAuth callback, webhook handlers for `orders/paid`/`orders/updated`/`orders/cancelled`/`orders/refunded`, 15-minute polling job
**Uses:** GraphQL Bulk Operations for historical sync; REST with `updated_at_min` for incremental
**Avoids:** Pitfall 1 (cursor expiry), Pitfall 2 (rate limits), Pitfall 3 (plan-dependent fees), Pitfall 4 (Shopify Payments processing tiers), Pitfall 5 (refund fee model), Pitfall 16 (financial status filtering), Pitfall 21 (draft orders)

### Phase 3: Analytics API Routes
**Rationale:** With real data in the database, API routes can be built and tested with curl/Postman before any React work begins. Separating this phase from the frontend means API contracts are stable before the frontend builds against them. Session token middleware must be implemented here — this is the security boundary.
**Delivers:** `lib/session-middleware.js` (App Bridge JWT validation), `routes/api.js` (overview, orders, products, COGS CRUD, sync status endpoints)
**Implements:** Analytics API subsystem
**Avoids:** Pitfall 9 (App Bridge auth), Anti-Pattern 4 (shop from query string)

### Phase 4: React Frontend
**Rationale:** Built last, when all plumbing exists. React becomes a presentation layer over working, tested APIs. Polaris components map directly to the data model (DataTable for orders/products, Card for KPI cards, DatePicker for date range). The frontend build pipeline (Vite + Express static serving) is well-understood.
**Delivers:** React SPA with overview dashboard, orders table, products table, COGS entry form; CSP header updates; Vite build pipeline in `client/` directory; Docker build step addition
**Uses:** Vite 5, React 18, Polaris 13, App Bridge 4.x, Recharts, TanStack Query, date-fns
**Avoids:** Pitfall 10 (CSP directives), Pitfall 17 (cache headers), Pitfall 18 (session token expiry handling)

### Phase 5: Polish and Differentiators
**Rationale:** After the core profit loop is working and validated with real merchants, add the features that differentiate from competitors. CSV COGS import becomes necessary once manual entry proves painful for stores with large catalogs. The `costPerItem` auto-import is a quick win that significantly improves onboarding time.
**Delivers:** CSV COGS import with SKU matching, Shopify `costPerItem` auto-import, COGS coverage banner, fee breakdown UI, margin health alerts
**Addresses:** "10-minute to value" constraint; differentiator features from FEATURES.md

### Phase Ordering Rationale

- The schema must exist before sync can write to it; sync must produce data before API routes are useful; API routes must exist before React has anything to call. This is a strict dependency chain with no shortcuts.
- Profit calculation correctness (fee tiers, NULL COGS, refund handling) belongs in Phase 2 where it can be unit-tested in isolation before the frontend displays the numbers to real merchants.
- App review blockers (GDPR, scope cleanup) are in Phase 1 so they never become last-minute blockers. They're low-effort and removing them early reduces risk across all remaining phases.
- Waterfall chart and payout reconciliation are not suggested phases because FEATURES.md explicitly defers them and the architectural complexity (payout-to-order matching) makes them Phase 2+ candidates.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Sync Service):** GraphQL Bulk Operations polling pattern, `transaction.fees` field availability in API version 2025-10, exact Shopify Payments payout GraphQL field names — all require verification against live API. Recommend `/gsd:research-phase` before building this phase.
- **Phase 4 (React Frontend):** Verify `@shopify/app-bridge-react` package name and version, Polaris current version (v13 or v14), `shopify.idToken()` vs `getSessionToken()` method name in App Bridge 4.x — all changed in recent major versions.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** Prisma schema design is standard; patterns are well-established and based on direct code inspection of existing scaffold.
- **Phase 3 (Analytics API Routes):** JWT middleware validation and Express route structure are well-documented patterns. No Shopify-specific uncertainty.
- **Phase 5 (Differentiators):** CSV import, UI enhancements — all standard web development patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Vite, React 18, Recharts are clear community consensus; Polaris and App Bridge are Shopify-mandated. Specific package versions need `npm show` verification. |
| Features | HIGH | Competitor feature analysis is consistent across sources; profit calculation arithmetic is deterministic; API field existence is well-documented |
| Architecture | HIGH | Pre-compute pattern, webhook+polling sync, shop-scoped DB design are standard and confirmed by multiple sources. GraphQL Bulk Operations field names are MEDIUM (verify in 2025-10 schema). |
| Pitfalls | HIGH | Fee structures, rate limit mechanics, pagination behavior, App Bridge auth, and billing flow are stable, documented Shopify behaviors. Refund fee recouping is MEDIUM (processor-specific). |

**Overall confidence:** MEDIUM-HIGH

All research is based on training knowledge through August 2025 with no live web lookups available. The architecture and feature decisions are high-confidence because they derive from stable API mechanics and competitor patterns. The specific API field names (GraphQL transaction fees, payout fields) and package versions are MEDIUM confidence — they require live verification before building.

### Gaps to Address

- **Shopify Payments per-transaction fee field:** `balance/transactions` has a `fee` field but 1:1 mapping to individual orders is unconfirmed. Test against a real Shopify Payments store before building fee sync logic.
- **`transaction.fees` in GraphQL 2025-10 schema:** The bulk operations query in ARCHITECTURE.md references `transactions { fees { flatFee { amount } rateFee percentageFee } }` — verify this field path exists in the 2025-10 GraphQL schema before building.
- **Third-party gateway rates:** Shopify API does not expose the actual gateway fee charged by PayPal, Stripe, etc. The recommended MVP escape hatch is a "gateway rate settings" page where merchants input their own rates. Do not rely on a hardcoded rate table for third-party gateways.
- **App Bridge package name in 2026:** `@shopify/app-bridge-react` — may have been renamed or consolidated since August 2025 training cutoff. Run `npm show @shopify/app-bridge-react` before beginning Phase 4.
- **Shopify plan name values:** The `plan_name` field from `GET /admin/api/shop.json` — exact string values (e.g., `"basic"`, `"shopify"`, `"advanced"`) should be verified against a live API response before building the fee rate config table.
- **Existing scope list cleanup:** The toml file currently has 60+ scopes. The exact list of minimum required scopes for Phase 1 MVP needs to be verified against the actual API endpoints used. PITFALLS.md lists the expected required scopes but the full audit should happen in Phase 1.

## Sources

### Primary (HIGH confidence)
- Existing project files: `shopify.app.profit-tracker.toml`, `server.js`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/CONCERNS.md` — direct code inspection
- Shopify Admin REST API documentation (training data through Aug 2025) — order/product/transaction object structure, rate limits, pagination mechanics
- App Bridge 4.x documentation (training data) — session token flow, JWT validation pattern
- Shopify Billing API documentation (training data) — charge status flow, test mode behavior
- Shopify App Review guidelines (training data) — scope minimization, GDPR webhook requirements

### Secondary (MEDIUM confidence)
- Competitor product analysis: Triple Whale, BeProfit, Lifetimely, Peel Insights — feature sets as of August 2025 training cutoff (products change; verify current state)
- Shopify fee structure — plan pricing and gateway rates accurate as of training data; verify against live pricing page before shipping fee calculator
- GraphQL Bulk Operations field names — verify `transaction.fees` path against 2025-10 schema
- r/shopify merchant community patterns — feature expectations and pain points

### Tertiary (LOW confidence)
- `inventory_item.cost` population rate among target merchants — assumed low based on community knowledge; instrument to confirm
- Shopify `plan_name` API field exact string values — needs live verification

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
