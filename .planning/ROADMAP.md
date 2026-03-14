# Roadmap: Shopify Profit Analytics App

## Overview

Four phases with a hard dependency chain. The schema must exist before sync can write to it; sync must produce data (with correct fee and COGS calculations) before API routes are useful; API routes must exist before React has anything to call; billing gates access only once the app is worth paying for. Every phase delivers one coherent, verifiable capability — nothing ships until each capability is end-to-end working.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - App review blockers cleared, schema extended, all API routes secured with JWT auth (completed 2026-03-11)
- [ ] **Phase 2: Sync and Profit Engine** - Orders, products, and payouts synced; profit calculated correctly at write time
- [ ] **Phase 3: Profit Dashboard** - React SPA rendering real profit data for merchants within 10 minutes of install
- [ ] **Phase 4: Billing** - Shopify Billing API enforcing $29/month subscription before granting full access

## Phase Details

### Phase 1: Data Foundation
**Goal**: The app passes Shopify App Review requirements and all backend infrastructure is in place for profit data to be stored and accessed securely
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. Shopify submits a test GDPR webhook (customer data request, customer erasure, shop redact) and the app responds with a real database operation — not a 200 stub
  2. The app's OAuth scopes list contains only the scopes actually used by the application — no excess scopes that trigger App Review rejection
  3. Starting the server with a missing required environment variable prints a clear error message and exits — no silent failures
  4. Every `/api/*` request without a valid App Bridge JWT returns 401; a valid request extracts shop identity from the token, not the query string
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — Test infrastructure: install Jest + Supertest, write failing test scaffolds for all four requirements
- [ ] 01-02-PLAN.md — GDPR real handlers: replace three webhook stubs with HMAC-verified Prisma operations (FOUND-01)
- [ ] 01-03-PLAN.md — JWT middleware: create verifySessionToken, protected /api routes, mount in server.js (FOUND-04)
- [ ] 01-04-PLAN.md — Scope pruning + env validation: set toml scopes to empty, add SHOPIFY_SCOPES to startup check (FOUND-02, FOUND-03)

### Phase 2: Sync and Profit Engine
**Goal**: Merchants' orders, products, and payout data flow into the local database with profit, fees, and COGS calculated correctly at write time — the numbers are trustworthy before any UI exists
**Depends on**: Phase 1
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, COGS-01, COGS-02, COGS-03, COGS-04, FEES-01, FEES-02, FEES-03, FEES-04
**Success Criteria** (what must be TRUE):
  1. After OAuth install, the app syncs full historical order history — a store with 500 existing orders has all 500 orders in the local database
  2. When a new order is paid in Shopify, the order appears in the local database within minutes via webhook; the 15-minute polling job catches any orders the webhook missed
  3. A merchant can enter a manual cost for a product variant, and that cost is reflected in profit calculations for new orders — historical profit is not retroactively changed
  4. An order processed via Shopify Payments shows the correct transaction fee amount (from payout data); an order processed via a third-party gateway uses the merchant-configured rate
  5. When an order is refunded, the profit record is updated to reverse COGS and fee attributions — the dashboard never shows inflated historical profit for a refunded order
  6. Products with no COGS entered are never calculated as $0 cost — the system tracks them as "unknown" and the profit figure for those orders is flagged, not fabricated
**Plans**: 6 plans

Plans:
- [ ] 02-01-PLAN.md — Foundation: schema extension (5 new Prisma models), package installs, test scaffolds
- [ ] 02-02-PLAN.md — TDD: shopifyClient.js and profitEngine.js pure functions (COGS-04, FEES-01, FEES-02, FEES-03, FEES-04)
- [ ] 02-03-PLAN.md — Sync libs: syncOrders.js, scheduler.js, wire startScheduler into server.js (SYNC-01, SYNC-02, SYNC-03)
- [ ] 02-04-PLAN.md — Webhooks: 5 order handlers + webhook registration in OAuth callback (SYNC-02, FEES-04)
- [ ] 02-05-PLAN.md — COGS API: POST /api/cogs manual entry + POST /api/cogs/csv bulk import (COGS-01, COGS-02, COGS-03)
- [ ] 02-06-PLAN.md — Payout sync: syncPayouts.js + POST /api/sync/payouts trigger (SYNC-04)

### Phase 3: Profit Dashboard
**Goal**: Merchants see what they actually kept within 10 minutes of installing — a working React dashboard embedded in Shopify Admin showing profit at store, order, and product level
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. A merchant can view store-level profit overview (total revenue, COGS, fees, net profit) filtered by daily / weekly / monthly / custom date range
  2. A merchant can see a sortable list of individual orders showing revenue, COGS, fees, net profit, and margin % per order
  3. A merchant can see profit and margin % per product/SKU with best and worst performers ranked
  4. The dashboard shows a profit trend line chart over the selected date range
  5. The dashboard displays a COGS coverage indicator — products and orders with missing COGS are visibly flagged and never shown as $0 profit
**Plans**: 5 plans

Plans:
- [ ] 03-01-PLAN.md — Test scaffold: failing dashboard.test.js stubs for all 9 DASH-01–05 backend behaviors (Wave 1)
- [ ] 03-02-PLAN.md — Backend API routes: four GET /api/dashboard/* endpoints in routes/api.js (Wave 2)
- [ ] 03-03-PLAN.md — Frontend setup: Vite+React SPA scaffold, App Bridge + Polaris CDN, api.js, App.jsx shell (Wave 3)
- [ ] 03-04-PLAN.md — Dashboard components: Overview, OrdersTable, ProductsTable, TrendChart, CogsCoverage (Wave 4)
- [ ] 03-05-PLAN.md — Wire + verify: server.js /admin serves SPA, human checkpoint of working dashboard (Wave 5)

### Phase 4: Billing
**Goal**: The app charges merchants $29/month via Shopify Billing API before granting access to the profit dashboard — the app is ready for App Store submission
**Depends on**: Phase 3
**Requirements**: BILL-01
**Success Criteria** (what must be TRUE):
  1. A newly installed merchant who has not accepted a billing charge is redirected to the Shopify subscription approval page before seeing any dashboard data
  2. A merchant who has an active $29/month subscription sees the full dashboard without interruption
  3. When a subscription is cancelled or expires, the merchant loses access to the dashboard and is shown the subscription prompt again
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 4/4 | Complete   | 2026-03-11 |
| 2. Sync and Profit Engine | 5/6 | In Progress|  |
| 3. Profit Dashboard | 0/5 | Not started | - |
| 4. Billing | 0/TBD | Not started | - |
