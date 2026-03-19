# Requirements: Shopify Profit Analytics App

**Defined:** 2026-03-18
**Core Value:** Merchants see what they actually kept — not just what came in — within 10 minutes of installing.

## v2.0 Requirements

Requirements for the Competitive Parity milestone. Each maps to roadmap phases.

### Fee Accuracy

- [x] **FEEX-01**: Merchant's Shopify Payments orders store the exact processing fee from `ShopifyPaymentsBalanceTransaction.fee` — not an estimated rate calculated from a rate table
- [x] **FEEX-02**: Each order displays a "Verified" indicator when its fee came from a confirmed payout transaction, or "Estimated" when the rate-table fallback was used — never silently mixing the two
- [x] **FEEX-03**: Orders not yet settled into a payout show a "Pending" fee state instead of displaying an estimated fee as if it were exact
- [x] **FEEX-04**: When an order is refunded, the fee reversal uses the exact settled fee amount rather than an estimated reversal — existing refund logic is extended, not replaced

### Waterfall Chart

- [x] **CHART-01**: Merchant can view a store-level profit waterfall chart on the Overview screen showing Revenue → COGS → Fees → Shipping → Net Profit for the selected date range
- [x] **CHART-02**: Merchant can click any order row in the Orders table to open a per-order waterfall chart showing exactly where that order's revenue went
- [x] **CHART-03**: Waterfall charts annotate when COGS is missing ("COGS unknown for X% of items — profit may be overstated") rather than rendering a misleadingly complete breakdown
- [x] **CHART-04**: Waterfall charts correctly render loss orders (negative net profit) without visual glitches — the final bar turns red and extends below the baseline
- [ ] **CHART-05**: Once ad spend data is available, the waterfall chart gains an "Ad Spend" step between Shipping and Net Profit — showing the full Revenue → COGS → Fees → Shipping → Ad Spend → Net Profit breakdown

### Margin Alerts

- [x] **ALERT-01**: Dashboard displays a dismissible banner listing all SKUs whose margin % has fallen below the merchant's configured threshold, showing product name, current margin %, and the threshold
- [x] **ALERT-02**: Merchant can configure a shop-wide margin alert threshold (default 20%) from a settings screen — stored in the database, persists across sessions
- [x] **ALERT-03**: Products with negative margin (losing money on every sale) always display as a CRITICAL alert regardless of the configured threshold — this cannot be suppressed by threshold config
- [x] **ALERT-04**: The Products nav tab shows a badge with the count of at-risk SKUs so merchants see the problem without navigating to the Products view

### Meta Ads Integration

- [ ] **ADS-01**: Merchant can connect their Meta Ads account via OAuth (Marketing API, `ads_read` scope) and disconnect it from the app's settings — the OAuth flow works correctly from within the Shopify Admin embedded iframe
- [ ] **ADS-02**: Total Meta ad spend for the selected date range is pulled from the Ads Insights API, displayed as an "Ad Spend" line in the store-level P&L KPI cards, and deducted from net profit
- [ ] **ADS-03**: Merchant can view a per-campaign spend breakdown table showing campaign name and spend for the selected period — providing visibility into which campaigns consumed the budget

### Google Ads Integration

- [ ] **ADS-04**: Merchant can connect their Google Ads account via OAuth and disconnect it — the flow uses a refresh token and the existing embedded iframe top-level redirect pattern (requires Google Ads developer token at minimum Test Account Access)
- [ ] **ADS-05**: Total Google Ads spend for the selected date range is pulled via GAQL, displayed as a separate "Google Ads Spend" line in the P&L KPI cards (distinct from Meta spend), and deducted from net profit — cost values are correctly converted from micros to dollars
- [ ] **ADS-06**: Merchant can view a per-campaign Google Ads spend breakdown table alongside the Meta campaign table in the Ads view

### Ads Dashboard

- [ ] **ADS-07**: The Ads view displays Blended ROAS (total Shopify revenue / total ad spend across all connected platforms) for the selected date range — clearly labeled as "Blended ROAS" to distinguish it from platform-reported ROAS

## Future Requirements

Deferred to v2.1+ after v2.0 validation.

### Attribution

- **ATTR-01**: Per-order Meta Ads attribution via `CustomerJourneySummary.firstVisit.utmParameters` — best-effort, labeled as estimated, accuracy limited by iOS privacy
- **ATTR-02**: True profit per campaign after COGS, fees, and attributed ad spend — requires ATTR-01 working reliably
- **ATTR-03**: Per-order Google Ads attribution via `utm_source=google` in customer journey — same approach as Meta, same accuracy limitations

### Alerts (Advanced)

- **ALERT-05**: Email digest alert (daily or weekly) notifying merchant of low-margin SKUs — requires adding email sending infrastructure (Sendgrid/Postmark)
- **ALERT-06**: Per-SKU threshold override allowing merchants to exclude intentional loss-leader products from alerts
- **ALERT-07**: Margin trend alert — fires when margin is deteriorating toward the threshold, not just when it crosses it — requires historical per-SKU tracking

### Analytics

- **CHART-06**: SKU-level waterfall chart — cost breakdown for a single product/variant
- **DASH-06**: Payout reconciliation view — which orders rolled into which payout, with totals that tie to the bank deposit

## Out of Scope

| Feature | Reason |
|---------|--------|
| Meta Pixel / Conversion API (CAPI) integration | Wrong scope — CAPI is optimization tooling for Meta's algorithm, not profit analytics. Creates liability and out-of-scope infrastructure. Pull spend only (read-only Marketing API). |
| Per-order UTM attribution in v2.0 | iOS privacy degrades attribution coverage; claiming accuracy is a churn risk when numbers don't match Shopify's. Deliver in v2.1 with explicit "best-effort" labeling. |
| Google Ads conversion upload | Requires `ads_management` scope and Enhanced Conversions compliance — optimization tooling, not profit analytics |
| Claiming ad-attributed revenue as ground truth | Meta and Google over-attribute 20–30% vs Shopify. Using their attributed revenue figure causes merchant distrust when numbers don't match. Show spend-based metrics only (spend, ROAS). |
| Email margin alerts (v2.0) | Requires Sendgrid/Postmark infrastructure not in current stack. Deferred to v2.1. |
| Slack/webhook alerts | Scope creep; low demand at $29/month; email digest is the right stepping stone first |
| Payout reconciliation view | Accountant-focused niche; high complexity for current user base and price point |
| Multi-channel (Amazon, eBay) | Shopify-only — single platform, single API |
| Multi-currency reporting | Single-currency MVP first |
| AI-generated insights | Out of scope for profit clarity tool |

## Traceability

Which phases cover which requirements. Confirmed during roadmap creation 2026-03-18.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FEEX-01 | Phase 5 | Complete |
| FEEX-02 | Phase 5 | Complete |
| FEEX-03 | Phase 5 | Complete |
| FEEX-04 | Phase 5 | Complete |
| CHART-01 | Phase 6 | Complete |
| CHART-02 | Phase 6 | Complete |
| CHART-03 | Phase 6 | Complete |
| CHART-04 | Phase 6 | Complete |
| CHART-05 | Phase 8 | Pending |
| ALERT-01 | Phase 7 | Complete |
| ALERT-02 | Phase 7 | Complete |
| ALERT-03 | Phase 7 | Complete |
| ALERT-04 | Phase 7 | Complete |
| ADS-01 | Phase 8 | Pending |
| ADS-02 | Phase 8 | Pending |
| ADS-03 | Phase 8 | Pending |
| ADS-04 | Phase 9 | Pending |
| ADS-05 | Phase 9 | Pending |
| ADS-06 | Phase 9 | Pending |
| ADS-07 | Phase 8 | Pending |

**Coverage:**
- v2.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 — traceability confirmed during roadmap creation*
