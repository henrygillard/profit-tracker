# Roadmap: Shopify Profit Analytics App

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-14)
- 🚧 **v2.0 Competitive Parity** — Phases 5-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-14</summary>

- [x] Phase 1: Data Foundation (4/4 plans) — completed 2026-03-11
- [x] Phase 2: Sync and Profit Engine (7/7 plans) — completed 2026-03-14
- [x] Phase 3: Profit Dashboard (5/5 plans) — completed 2026-03-14
- [x] Phase 4: Billing (3/3 plans) — completed 2026-03-14

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v2.0 Competitive Parity (In Progress)

**Milestone Goal:** Close the three retention risks identified post-v1.0 — verify and fix fee accuracy, add high-value UX differentiators (waterfall chart + margin alerts), and ship Meta + Google Ads integration to compete with Triple Whale and BeProfit.

- [x] **Phase 5: Payout Fee Accuracy** - Verify and fix per-order Shopify Payments fees; establish verified/estimated/pending status per order (completed 2026-03-18)
- [x] **Phase 6: Waterfall Chart** - Store-level and per-order profit waterfall visualization built on verified fee data (completed 2026-03-18)
- [x] **Phase 7: Margin Alerts** - Configurable low-margin threshold alerts with dashboard banner and nav badge (completed 2026-03-19)
- [x] **Phase 8: Meta Ads + Ads Infrastructure** - Shared ads schema, token encryption, Meta OAuth, campaign spend sync, and Blended ROAS (completed 2026-03-19)
- [x] **Phase 9: Google Ads Integration** - Google OAuth and campaign spend sync built on Phase 8 infrastructure (completed 2026-03-19)

## Phase Details

### Phase 5: Payout Fee Accuracy
**Goal**: Merchants can trust that every order's fee data is exact when settled — not estimated — and can see at a glance which orders are verified, estimated, or still pending settlement
**Depends on**: Phase 4 (v1.0 billing gate already in place; this modifies existing syncPayouts.js)
**Requirements**: FEEX-01, FEEX-02, FEEX-03, FEEX-04
**Success Criteria** (what must be TRUE):
  1. An order processed through Shopify Payments shows the exact fee amount from `ShopifyPaymentsBalanceTransaction.fee`, not a rate-table estimate
  2. Each order in the Orders table displays a "Verified", "Estimated", or "Pending" fee status badge — never blank or silently mixed
  3. Orders not yet rolled into a payout show "Pending" instead of a number that looks exact but is estimated
  4. When an order is refunded, the fee reversal uses the exact settled fee amount rather than applying an estimated reversal percentage
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — Schema migration (feeSource column) + failing test scaffolds
- [ ] 05-02-PLAN.md — Backend feeSource logic (profitEngine, syncOrders, syncPayouts, refund handler)
- [ ] 05-03-PLAN.md — API serialization + FeeCell badge component + UI checkpoint

### Phase 6: Waterfall Chart
**Goal**: Merchants can see exactly where their revenue went — at both the store level and per individual order — through a waterfall decomposition chart built on verified fee data
**Depends on**: Phase 5 (Fees bar must show verified data, not estimates)
**Requirements**: CHART-01, CHART-02, CHART-03, CHART-04
**Success Criteria** (what must be TRUE):
  1. The Overview screen shows a store-level waterfall chart for the selected date range with bars for Revenue, COGS, Fees, Shipping, and Net Profit
  2. Clicking any order row opens a per-order waterfall chart showing that order's full cost decomposition
  3. When COGS data is missing for some items, the chart displays a warning annotation rather than rendering a misleadingly complete breakdown
  4. Loss orders (negative net profit) render correctly — the Net Profit bar is red and extends below the zero baseline without visual glitches
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — TDD Wave 0: failing test scaffolds (chart.test.js + dashboard.test.js shippingCost assertions)
- [ ] 06-02-PLAN.md — API shippingCost extension + WaterfallChart component + modal CSS
- [ ] 06-03-PLAN.md — Integration: wire WaterfallChart into Overview + WaterfallModal into OrdersTable + human checkpoint

### Phase 7: Margin Alerts
**Goal**: Merchants are proactively notified when any SKU's margin falls below their configured threshold — without needing to go looking for the problem
**Depends on**: Phase 5 (accurate fee data feeds margin calculations used in alert evaluation)
**Requirements**: ALERT-01, ALERT-02, ALERT-03, ALERT-04
**Success Criteria** (what must be TRUE):
  1. A dismissible banner appears on the dashboard listing every SKU below the merchant's configured threshold, showing product name, current margin %, and the threshold
  2. Merchant can set a shop-wide margin alert threshold (default 20%) from a settings screen; the setting persists across browser sessions
  3. SKUs with negative margin (losing money on every sale) always appear as CRITICAL alerts regardless of the configured threshold — this cannot be suppressed
  4. The Products nav tab shows a badge with the count of at-risk SKUs so the problem is visible before navigating to the Products view
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md — TDD Wave 0: failing test stubs (alerts.test.js) + schema migration (marginAlertThreshold)
- [ ] 07-02-PLAN.md — Backend: GET/PUT /api/settings + GET /api/alerts/margin (turn tests GREEN)
- [ ] 07-03-PLAN.md — Frontend: MarginAlertBanner + SettingsScreen + nav badge + human checkpoint

### Phase 8: Meta Ads + Ads Infrastructure
**Goal**: Merchants can connect their Meta Ads account, see their total ad spend deducted from net profit, view a per-campaign spend breakdown, and see Blended ROAS — with all shared ads infrastructure (schema, encryption, OAuth, sync scheduler) in place for Google Ads to layer on in Phase 9
**Depends on**: Phase 6 (waterfall chart exists and will gain the Ad Spend step as payoff visualization; Phase 7 can run in parallel)
**Requirements**: ADS-01, ADS-02, ADS-03, ADS-07, CHART-05
**Success Criteria** (what must be TRUE):
  1. Merchant can connect a Meta Ads account via OAuth from within the Shopify Admin iframe and disconnect it from settings — the flow does not require a popup and works in Safari
  2. Total Meta ad spend for the selected date range appears as an "Ad Spend" line in the P&L KPI cards and is deducted from net profit
  3. Merchant can view a per-campaign spend breakdown table showing campaign name and spend for the selected period
  4. The waterfall chart gains an "Ad Spend" step between Shipping and Net Profit once Meta Ads is connected, showing the full Revenue → COGS → Fees → Shipping → Ad Spend → Net Profit breakdown
  5. The Ads view displays Blended ROAS (total Shopify revenue / total ad spend) clearly labeled to distinguish it from platform-reported ROAS
**Plans**: 4 plans

Plans:
- [ ] 08-01-PLAN.md — Schema migration (AdConnection + AdSpend) + lib/encrypt.js + Wave 0 test stubs
- [ ] 08-02-PLAN.md — Meta OAuth routes (ads-auth.js) + GDPR webhook extension
- [ ] 08-03-PLAN.md — Meta Insights sync (syncAdSpend.js) + scheduler + ads API endpoints + overview adSpend field
- [ ] 08-04-PLAN.md — Frontend: AdsView + Ad Spend KPI card + CHART-05 waterfall step + human checkpoint

**Prerequisites:**
- Apply for Google Ads developer token at Phase 8 kickoff (external approval needed before Phase 9 can begin)
- Add `ADS_ENCRYPTION_KEY` to Railway environment config before any token write code exists

### Phase 9: Google Ads Integration
**Goal**: Merchants can connect their Google Ads account alongside Meta, see Google spend as a separate P&L line, and view Google campaigns in the same Ads view — reusing all Phase 8 infrastructure
**Depends on**: Phase 8 (AdConnection/AdSpend schema, lib/encrypt.js, routes/ads-auth.js, lib/syncAdSpend.js all in place); Google Ads developer token at minimum Test Account Access
**Requirements**: ADS-04, ADS-05, ADS-06
**Success Criteria** (what must be TRUE):
  1. Merchant can connect a Google Ads account via OAuth (refresh token flow) from within the Shopify Admin iframe and disconnect it from settings
  2. Total Google Ads spend appears as a separate "Google Ads Spend" line in the P&L KPI cards (distinct from Meta spend line) with cost values correctly converted from micros to dollars
  3. Google campaign spend rows appear alongside Meta campaign rows in the Ads campaign breakdown table
**Plans**: 4 plans

Plans:
- [ ] 09-01-PLAN.md — Install google-auth-library + Wave 0 failing test stubs (google-ads.test.js + extend syncAdSpend/ads/dashboard tests)
- [ ] 09-02-PLAN.md — Google OAuth routes (google-ads-auth.js) + server.js mount
- [ ] 09-03-PLAN.md — Google GAQL sync (syncAdSpend.js Google branch) + disconnect ?platform param + overview metaAdSpend/googleAdSpend/totalAdSpend
- [ ] 09-04-PLAN.md — Frontend: AdsView Google card + Overview Google Ads Spend KPI card + human checkpoint

**Prerequisites:**
- Google Ads developer token confirmed at minimum Test Account Access (applied during Phase 8)
- google-auth-library v9.15.1 confirmed on Node 16 (Plan 01 Task 1 handles this)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 4/4 | Complete | 2026-03-11 |
| 2. Sync and Profit Engine | v1.0 | 7/7 | Complete | 2026-03-14 |
| 3. Profit Dashboard | v1.0 | 5/5 | Complete | 2026-03-14 |
| 4. Billing | v1.0 | 3/3 | Complete | 2026-03-14 |
| 5. Payout Fee Accuracy | v2.0 | 3/3 | Complete | 2026-03-18 |
| 6. Waterfall Chart | 3/3 | Complete   | 2026-03-18 | - |
| 7. Margin Alerts | 3/3 | Complete   | 2026-03-19 | - |
| 8. Meta Ads + Ads Infrastructure | 4/4 | Complete   | 2026-03-19 | - |
| 9. Google Ads Integration | 4/4 | Complete   | 2026-03-19 | - |
