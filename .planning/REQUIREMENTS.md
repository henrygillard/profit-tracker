# Requirements: Shopify Profit Analytics App

**Defined:** 2026-03-10
**Core Value:** Merchants see what they actually kept — not just what came in — within 10 minutes of installing.

## v1 Requirements

Requirements for MVP launch. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: App implements GDPR webhooks (customer data erasure, customer data request, shop redact) with real handlers — not stubs
- [x] **FOUND-02**: App OAuth scopes pruned to minimum required — removes excess scopes that cause app review rejection
- [x] **FOUND-03**: Server validates all required environment variables at startup and fails fast with clear errors if missing
- [x] **FOUND-04**: All `/api/*` routes validate Shopify App Bridge session tokens (JWT) — shop identity extracted from token, not query string

### Data Sync

- [ ] **SYNC-01**: On first install, app syncs full order history via Shopify GraphQL Bulk Operations
- [ ] **SYNC-02**: App receives and processes `orders/paid`, `orders/updated`, `orders/cancelled`, `orders/refunded` webhooks for real-time sync
- [ ] **SYNC-03**: App runs a 15-minute background polling job as reliability backstop for missed webhooks
- [ ] **SYNC-04**: App syncs Shopify Payments payout data to obtain exact transaction fee amounts per order

### COGS Management

- [ ] **COGS-01**: Merchant can manually enter cost (COGS) per product variant from the dashboard
- [ ] **COGS-02**: App auto-populates COGS from Shopify's `inventoryItem.unitCost` field where merchant has set it
- [ ] **COGS-03**: Merchant can bulk-import COGS via CSV upload (SKU, cost columns)
- [ ] **COGS-04**: COGS is stored as a time-series per variant — cost changes do not retroactively rewrite historical profit

### Fee Calculation

- [ ] **FEES-01**: App auto-detects merchant's Shopify plan and applies correct transaction fee rate (0% for Shopify Payments, 0.15%–2% for external gateways based on plan)
- [ ] **FEES-02**: App calculates payment processor fees using exact amounts from Shopify Payments payout data; merchant can configure rate for third-party gateways
- [ ] **FEES-03**: App tracks shipping cost per order (manual input; uses Shopify Shipping label cost where API provides it)
- [ ] **FEES-04**: When an order is refunded, app reverses the COGS attribution and adjusts fee calculations for accurate historical profit

### Profit Dashboard

- [ ] **DASH-01**: Merchant can view store-level profit overview (total revenue, total COGS, total fees, net profit) with date range filtering (daily / weekly / monthly / custom)
- [ ] **DASH-02**: Merchant can view profit per order — sortable list showing revenue, COGS, fees, net profit, and margin % per order
- [ ] **DASH-03**: Merchant can view profit per product/SKU — margin % per product with best and worst performers highlighted
- [ ] **DASH-04**: Dashboard shows profit trend line chart over selected date range
- [ ] **DASH-05**: Dashboard shows COGS coverage indicator — flags products/orders with missing COGS (NULL COGS never displays as $0)

### Billing

- [ ] **BILL-01**: App uses Shopify Billing API to charge merchants $29/month via a single recurring subscription plan before granting full access

## v2 Requirements

Deferred to post-validation release.

### Ad Integration

- **ADS-01**: Meta Ads account connection and spend attribution per order
- **ADS-02**: Google Ads account connection and spend attribution per order
- **ADS-03**: True profit per campaign after COGS and fees (not ROAS)

### Advanced Analytics

- **ADV-01**: Customer cohort LTV builder by first purchase date, product, or channel
- **ADV-02**: LTV curves over 30 / 60 / 90 / 180 / 365 days
- **ADV-03**: Margin trend per SKU over time with alerts for deteriorating margins
- **ADV-04**: Seasonal profitability patterns

### Pricing

- **BILL-02**: Two-tier pricing (Basic / Pro) — evaluate after single-plan validation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-channel (Amazon, eBay, etc.) | Shopify-only focus — single platform, single API, simpler integration |
| Mobile app | Web-first via Shopify embedded admin; mobile later if demand warrants |
| Real-time streaming data | Batch sync is sufficient; real-time adds infrastructure complexity without proportional value |
| Usage-based billing | Complex to implement and predict; fixed monthly price is simpler for MVP |
| Multi-currency reporting | Adds significant complexity; single-currency MVP first |
| AI-generated insights | Out of scope for profit clarity tool — avoid "insight theater" |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| SYNC-01 | Phase 2 | Pending |
| SYNC-02 | Phase 2 | Pending |
| SYNC-03 | Phase 2 | Pending |
| SYNC-04 | Phase 2 | Pending |
| COGS-01 | Phase 2 | Pending |
| COGS-02 | Phase 2 | Pending |
| COGS-03 | Phase 2 | Pending |
| COGS-04 | Phase 2 | Pending |
| FEES-01 | Phase 2 | Pending |
| FEES-02 | Phase 2 | Pending |
| FEES-03 | Phase 2 | Pending |
| FEES-04 | Phase 2 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DASH-05 | Phase 3 | Pending |
| BILL-01 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
