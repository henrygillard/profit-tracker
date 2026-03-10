# Feature Landscape

**Domain:** Shopify profit analytics dashboard (embedded app, $10K–$200K/mo merchants)
**Researched:** 2026-03-10
**Knowledge cutoff:** August 2025
**Sources:** Training data — competitor product analysis (Triple Whale, BeProfit, Peel Insights, Lifetimely), Shopify API documentation, merchant community patterns (Shopify Community, Reddit r/shopify)

---

## Table Stakes

Features users expect in any profit analytics product. Missing = product feels broken or useless.

| Feature | Why Expected | Complexity | Confidence | Notes |
|---------|--------------|------------|------------|-------|
| Store-level P&L overview | The entire point of the product — revenue, COGS, fees, net profit in one view | Medium | HIGH | Every competitor leads with this screen |
| Date range filtering (daily/weekly/monthly/custom) | Merchants need to compare periods; no date filter = useless for decision-making | Low | HIGH | Standard in every analytics tool |
| Revenue from Shopify orders | Raw input data; without it nothing else works | Low | HIGH | Shopify Orders API, well-documented |
| Profit per order | Merchants blame individual orders for losses; need drill-down | Medium | HIGH | BeProfit and Triple Whale both surface this |
| Profit per product / SKU | Where the money actually is or isn't; SKU-level is the diagnostic unit | Medium | HIGH | Most-requested feature in r/shopify analytics threads |
| COGS entry (manual per SKU) | Without COGS, profit is meaningless; manual is the MVP path | Low | HIGH | BeProfit, Lifetimely both start here |
| Shopify transaction fee calculation | Shopify charges 0.5–2% on non-Shopify Payments orders; merchants don't know this | Medium | HIGH | Available in Shopify Transactions API (`gateway`, `payment_gateway_names`, `total_price_usd`) |
| Payment processor fee calculation | Stripe/PayPal/Shopify Payments take 1.5–2.9%+$0.30; major profit leak | Medium | HIGH | Gateway-specific rates; pulled from `transactions` object or configured manually |
| Best/worst products by margin | Top-10-style list — "kill bad SKUs" is the primary action users take | Low | HIGH | Sort derived metric; cheap to add once profit/SKU exists |
| Basic line/bar charts for profit over time | Visual trend is expected; a wall of numbers alone fails UX | Medium | HIGH | Standard for any dashboard product |
| Orders sync from Shopify API | Foundation for all calculations | Low | HIGH | REST `GET /orders.json` or GraphQL `orders` query |
| Products/variants sync (for SKU mapping) | Needed to attach COGS to line items | Low | HIGH | REST `GET /products.json` |

---

## How COGS Input Works (Competitor Analysis)

**Confidence: HIGH** for patterns; **MEDIUM** for exact implementation details.

### Manual Entry (All Competitors)
Every product (BeProfit, Triple Whale, Lifetimely) offers per-SKU manual COGS entry as the baseline. The UX is typically a spreadsheet-style table of variant titles with a COGS field. This is the MVP path — simple, fast, and the merchant knows their numbers.

### CSV Import (BeProfit, Triple Whale)
CSV import is the second step: a template download (columns: SKU or variant ID, cost), upload, and bulk-apply. This is table stakes for stores with 50+ variants where manual entry is impractical. Format is typically: `variant_id` OR `sku`, `cost`. Matching by SKU string is more portable than variant ID.

### Shopify `costPerItem` / `inventoryItem.unitCost` (GraphQL)
Shopify stores cost-per-unit in the inventory item object. Access via GraphQL:
```
query {
  inventoryItem(id: "gid://shopify/InventoryItem/...") {
    unitCost { amount, currencyCode }
  }
}
```
This field is populated if the merchant uses Shopify's cost tracking (set in admin under Products > Cost per item). **Confidence: HIGH** — this is official Shopify API. However, many merchants do NOT fill this field, so it cannot be the sole input method. Use as auto-populate source, not the only path.

### Date-Based COGS (Lifetimely differentiator)
Lifetimely supports COGS that change over time (e.g., supplier price increase in Q3). This is a differentiator, not table stakes.

---

## How Profit Per Order Is Calculated

**Confidence: HIGH** — this is arithmetic, not an API assumption.

```
Net Profit =
  Order Revenue (subtotal_price)
  - COGS (sum of line_item.quantity × variant_cost for each line item)
  - Shopify transaction fee (if not on Shopify Payments: 0.5%/1.0%/2.0% by plan)
  - Payment processor fee (gateway-specific: Shopify Payments = 2.9%+$0.30 basic; rates vary by plan)
  - Shipping cost paid by store (total_shipping_price_set.shop_money.amount minus shipping charged to customer)
  - Refunds (if any: refund_line_items reduce COGS back, refund transactions reduce revenue)
  - Discounts are already subtracted in subtotal_price
```

**Fee calculation details (MEDIUM confidence — rates accurate as of training data, verify at build time):**

| Shopify Plan | Transaction Fee (non-Shopify Payments) | Shopify Payments CC rate (online) |
|---|---|---|
| Basic ($39/mo) | 2.0% | 2.9% + $0.30 |
| Shopify ($105/mo) | 1.0% | 2.6% + $0.30 |
| Advanced ($399/mo) | 0.5% | 2.4% + $0.30 |
| Plus | Negotiated | Negotiated |

Transaction fees are charged by Shopify on top of gateway fees when merchants use a third-party gateway. If merchant uses Shopify Payments, transaction fee is $0 but the Shopify Payments processing fee applies.

**Shopify API data for fees:**
- `order.payment_gateway` — identifies the gateway (e.g., "shopify_payments", "paypal", "stripe")
- `order.transactions[]` — each transaction has `amount`, `gateway`, `kind` ("sale", "refund", "capture")
- `order.total_price` vs `order.subtotal_price` — tax and shipping are separated
- Payouts API (`GET /shopify_payments/payouts.json`) — actual net payout per payout period; useful for reconciliation but not per-order granularity
- **Gap:** Shopify does NOT return the exact fee amount per transaction in the orders API. Fees must be calculated by the app using known rate tables. Payout transactions (`/shopify_payments/balance/transactions.json`) DO include `fee` field — but this is at payout level, not order level. **Confidence: MEDIUM** — verify this gap before building.

---

## Shopify API Data Available for Fee Calculation

**Confidence: HIGH** for API existence; **MEDIUM** for exact field behavior.

| API Endpoint | Data Available | Use For |
|---|---|---|
| `GET /orders.json` | `subtotal_price`, `total_price`, `total_tax`, `total_shipping_price_set`, `payment_gateway`, `transactions[]`, `refunds[]`, `line_items[]` | Revenue, shipping, COGS matching, refunds |
| `GET /orders/{id}/transactions.json` | `amount`, `gateway`, `kind`, `status` | Determine which gateway processed; basis for fee calc |
| `GET /shopify_payments/payouts.json` | `amount`, `currency`, `status`, `summary` (fees, charges, refunds) | Reconciliation, payout-level P&L |
| `GET /shopify_payments/balance/transactions.json` | `type`, `amount`, `fee`, `net`, `source_order_id` | Actual Shopify Payments fee per transaction — **HIGH VALUE** |
| `GET /products.json` + `GET /variants/{id}.json` | `sku`, `price`, `compare_at_price` | SKU mapping |
| GraphQL `inventoryItem.unitCost` | `amount`, `currencyCode` | Auto-populate COGS from Shopify cost field |

The `balance/transactions` endpoint is the key to accurate Shopify Payments fee data per order. For non-Shopify-Payments gateways, fees must be estimated from rate tables.

---

## Standard Chart Types for Profit Analytics

**Confidence: HIGH** — consistent across all competitors observed.

| Chart Type | What It Shows | Where Used |
|---|---|---|
| Line chart (time series) | Revenue vs profit over time | Main dashboard overview |
| Bar chart (grouped) | Revenue vs COGS vs fees vs profit per period | Period comparison |
| Horizontal bar chart | Top/bottom products by margin % | Product performance table |
| Stacked bar / waterfall | Revenue decomposition (COGS + fees + shipping + profit) | Per-order or period breakdown |
| Summary KPI cards | Total revenue, total profit, avg margin %, order count | Top of every view |
| Scatter plot | Margin % vs order volume per product | Advanced — differentiator, not MVP |

MVP minimum: line chart for profit over time + KPI cards + sortable table for products. Waterfall/decomposition chart is a high-value differentiator.

---

## Differentiators

Features that set the product apart. Not expected by all users, but valued when present.

| Feature | Value Proposition | Complexity | Confidence | Notes |
|---------|-------------------|------------|------------|-------|
| "10-minute setup" onboarding flow | Direct attack on competitor complexity complaints; guided COGS entry wizard | Medium | HIGH | Addressable with good UX; no technical barrier |
| Shopify `costPerItem` auto-import | Pre-populates COGS for merchants already using Shopify cost tracking — zero-effort for them | Low | HIGH | One GraphQL query; high merchant delight |
| Profit waterfall chart per order | Visual breakdown of where revenue went (COGS, fees, shipping, kept) — more intuitive than tables | Medium | MEDIUM | Seen in Lifetimely; strong UX differentiator |
| Margin health alerts | "These 3 products are below 10% margin" — pushes insight rather than requiring merchant to find it | Medium | MEDIUM | Rule-based alerting; no ML needed for v1 |
| CSV COGS import with SKU matching | Bulk COGS entry for large catalogs; must handle SKU string matching, not just variant ID | Medium | HIGH | BeProfit does this; expected for stores with 50+ SKUs |
| Fee breakdown transparency | Show exactly how much Shopify/Stripe/PayPal took — merchants hate not knowing this | Low | HIGH | High emotional value; low build cost once fee calc is done |
| Payout reconciliation view | Match Shopify payouts to expected profit — "why did I only get $X?" answered | High | MEDIUM | Uses Payouts API; complex but highly valued |
| Date-based COGS versioning | COGS changes over time (supplier increases); historical accuracy requires this | High | MEDIUM | Lifetimely differentiator; Phase 2+ |
| Ad spend integration (Meta/Google) | True profit after marketing spend — most-wanted Phase 2 feature | High | HIGH | Out of scope Phase 1 per PROJECT.md |

---

## Anti-Features

Features to deliberately NOT build — they add complexity without proportional value for target market.

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| Multi-channel support (Amazon, eBay, Etsy) | Each channel has different fee structures, APIs, and data models; doubles scope for <20% of users | Stay Shopify-only; position as "built for Shopify" |
| Customer cohort / LTV analysis | Different product (retention analytics vs profit analytics); confuses the value prop | Defer to Phase 3 per PROJECT.md roadmap |
| Real-time / live order feed | Profit analytics is inherently batch (fees settle on payouts); "live" creates false precision | Batch sync every few hours is sufficient and accurate |
| Mobile app | Merchants do setup and review on desktop; mobile adds platform tax with no analytics value | Embedded admin is mobile-responsive enough |
| Predictive / AI profit forecasting | Requires long history, adds ML complexity, and merchant trust is hard to build | Surface trends via simple charts; leave forecasting to Phase N |
| Inventory management | Separate product category with different buyers; don't conflate with profit analytics | COGS input is the overlap; stop there |
| Multi-currency complexity beyond display | Currency conversion for profit is a rabbit hole; introduces exchange rate risk math | Store in shop currency; display in shop currency |
| "Integrations marketplace" architecture | Premature generalization; adds infra complexity before PMF | Hardcode Shopify; abstract only when second platform is real |
| Accounting software sync (QuickBooks, Xero) | Phase 2+ feature with high integration maintenance cost | Manual CSV export is sufficient for MVP |

---

## Feature Dependencies

```
Shopify Orders Sync
  → Revenue figures (subtotal, shipping, tax breakdown)
  → Line items (product/variant IDs for COGS matching)
  → Transactions (gateway identification for fee calc)
  → Refunds (adjustments to revenue and COGS)

Products/Variants Sync
  → SKU list for COGS entry UI
  → Variant ID → SKU mapping for CSV import

COGS Per Variant (manual or CSV or auto-import)
  → Profit per order (line item × quantity × cost)
  → Profit per product
  → Margin %

Fee Rate Configuration (Shopify plan + gateway)
  → Transaction fee per order
  → Combined with Shopify Payments balance transactions for accuracy

[All of the above] → Store-level P&L
[All of the above] → Date-range filtered views
[All of the above] → Best/worst product rankings
```

---

## MVP Recommendation

**Build these first (Phase 1):**

1. Orders + Products sync from Shopify API (foundation for everything)
2. Manual COGS entry per SKU with persist to DB
3. Fee calculation engine (configurable Shopify plan rates + gateway detection)
4. Store-level P&L overview with KPI cards (revenue, profit, margin %, orders)
5. Date range filter (daily/weekly/monthly/custom)
6. Profit per order table (sortable, searchable)
7. Profit per product/SKU table with best/worst ranking
8. Line chart: profit over time

**Defer (Phase 2+):**

- CSV COGS import — useful but not blocking MVP value; manual entry suffices for validation
- Payout reconciliation — high complexity, niche use case for early users
- Margin alerts — valuable but requires proven baseline metrics first
- Auto-import from Shopify `costPerItem` — quick win, but only after manual entry is working
- Ad spend integration — explicitly Phase 2 per PROJECT.md
- Waterfall chart — nice differentiator but chart library renders it only after data model is solid

**The 10-minute-to-value constraint drives Phase 1 scope:** A merchant must be able to install, enter their top 5 COGS, and see real profit numbers before they leave. Everything else is secondary to that moment.

---

## Gaps and Uncertainties

| Area | Gap | Confidence Risk | How to Resolve |
|---|---|---|---|
| Shopify Payments per-transaction fee field | `balance/transactions` has a `fee` field; unclear if it maps 1:1 to a single order | MEDIUM | Test against a real Shopify Payments store during development |
| Third-party gateway exact rates | Rates for Stripe, PayPal, Afterpay etc. change; hardcoding is fragile | MEDIUM | Allow merchant to configure their own gateway rate; don't rely on a hardcoded table alone |
| Shopify `costPerItem` field population rate | Unknown what % of target merchants actually fill this in Shopify admin | LOW | Survey or instrument; assume low, treat as bonus not primary path |
| Rate limit impact on historical sync | Large stores with 10K+ orders may hit REST API rate limits on initial sync | MEDIUM | Use cursor-based pagination and GraphQL bulk operations for initial backfill |
| Refund COGS handling | When an order is refunded, COGS should reverse — Shopify refund objects have line items but cost must come from app's stored COGS | MEDIUM | Model refunds explicitly in DB schema; don't just subtract revenue |

---

## Sources

- Training data: Triple Whale product (trytriplewhale.com), BeProfit (beprofit.co), Lifetimely (lifetimely.io), Peel Insights — observed feature sets as of training cutoff August 2025. **Confidence: MEDIUM** (product features change frequently; verify current state)
- Shopify Admin REST API documentation — Orders, Transactions, Products, Shopify Payments endpoints. **Confidence: HIGH** (stable API surface; verify field-level details during implementation)
- Shopify GraphQL Admin API — `inventoryItem.unitCost` field. **Confidence: HIGH** (official API)
- Shopify fee structure — plan pricing and gateway rates. **Confidence: MEDIUM** (rates accurate as of training data; verify before shipping fee calculator)
- r/shopify merchant community patterns — feature expectations and pain points. **Confidence: MEDIUM** (consistent signal across many threads)
