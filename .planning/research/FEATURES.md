# Feature Research

**Domain:** Shopify Profit Analytics App — v2.0 New Feature Landscape
**Researched:** 2026-03-18
**Confidence:** MEDIUM-HIGH (Shopify API fields verified against official docs; competitor patterns from App Store listings + official help docs; ad API details from official developer blogs and changelogs)

---

> **Note:** v1.0 table-stakes features (P&L overview, date filtering, per-order table, COGS entry, basic charts, billing gate) are already built and not re-researched here. This document covers the five new v2.0 feature areas only.

---

## Feature 1: Payout Fee Fix (FEE-FIX-01)

### What Merchants Expect

Merchants on Shopify Payments expect to see the *exact* processing fee deducted per order — not an estimated rate. The "aha moment" is the difference between "2.9% of $150 = $4.35" (estimated) and "$4.23" (the actual amount Shopify took). Even small per-order discrepancies compound into meaningful monthly errors for stores doing $50K+/month.

The v1.0 implementation syncs payout data but the 1:1 mapping of payout-to-order is unverified. This is a latent accuracy risk that undermines the core value proposition.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-order exact fee from balance transaction data | Merchants need accurate net profit — an estimated rate misleads them | MEDIUM | `ShopifyPaymentsBalanceTransaction.fee` field confirmed in official GraphQL docs. `associatedOrder` links to orders. `sourceOrderTransactionId` is the precise bridge. HIGH confidence this works. |
| Fee tied to actual settled transaction (not estimated rate) | Payout fee is the ground truth — what Shopify actually moved | MEDIUM | Query `shopifyPaymentsAccount > balanceTransactions`, join to order by `associatedOrder.id`. Updated in API 2025-04 to also cover adjustment orders. |
| Graceful "pending" state for unsettled orders | Orders placed recently may not have settled into a payout yet | LOW | Show "Pending" for fee field rather than showing estimated rate as if it were exact. Critical to not mix estimated and exact without indicating which is which. |
| Correct refund fee reversal using exact amounts | Refunded orders should reverse the exact fee, not an estimated reversal | MEDIUM | Balance transaction `type` field distinguishes charge from refund. v1.0 handles reversal logic — verify it uses exact amounts from balance transaction when available. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-order "fee verified" indicator | Small badge showing orders where exact payout fee was confirmed vs. estimated fallback | LOW | Builds trust. High UX value for minimal dev cost. "Verified" = balance transaction found. "Estimated" = using rate table. |
| Payout reconciliation view | Show which orders rolled into which payout, with totals that tie to bank deposit | HIGH | No competitor exposes this to end users. Genuinely differentiating for accountants and ops-heavy stores. Defer to v2.1+. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Show estimated fee when payout not yet settled | Seems better than a blank field | Estimated fee is not the exact fee — merchants making pricing decisions on wrong data is churn risk | Show "Pending (est. $X)" — explicit about what is estimated |
| Sync all historical balance transactions on every dashboard load | Seems complete | Rate limits + huge data volume for high-volume stores | Incremental: sync balance transactions only for orders without a verified fee already stored |

### API Reality (HIGH confidence)

- `ShopifyPaymentsBalanceTransaction` exposes: `fee` (the processing fee), `amount`, `net`, `associatedOrder` (links to Order), and `sourceOrderTransactionId` (precise bridge to the specific order transaction).
- Payout object (`ShopifyPaymentsPayout`) has only summary-level totals — not suitable for per-order attribution. Per-order fee lives on `balanceTransaction`, not payout.
- API 2025-04 changelog: added `fees` and `net` fields on `adjustmentsOrders` within balance transactions — covers edge cases where adjustments span multiple orders.
- Correct query path: filter `balanceTransactions` where `associatedOrder.id` matches the order, read `fee`.
- For non-Shopify-Payments gateways: exact fee is not available via API. Continue using configurable rate tables.

### Dependency on Existing Features

Builds directly on v1.0 payout sync. The fix is schema + logic: after syncing balance transactions, store the exact fee on the order record and mark it as "verified". Replace the estimated fee in profit calculations for any order where a verified fee exists.

---

## Feature 2: Waterfall Chart (CHART-01)

### What Merchants Expect

The waterfall chart is the visual "aha moment" — showing how $150 of revenue became $47 of net profit. Each deduction step (COGS, Shopify fees, shipping, ad spend) is a descending bar. This is the dominant analytical visualization for profit decomposition across all major competitors.

Triple Whale uses contribution margin decomposition as a primary metric. BeProfit's "cost breakdown" view shows the same concept. TrueProfit shows real-time net profit dashboards with component breakdown. The waterfall chart is the visual form of what the existing KPI cards communicate numerically.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Store-level waterfall: Revenue → COGS → Fees → Net Profit | Merchants need to see where money went at store level for the selected date range | LOW | Recharts has a documented waterfall example. Data already exists from KPI card calculations. Transform only — no new API calls. |
| Per-order waterfall (drill from order table into breakdown) | Per-order profit table already exists; natural next step is visualizing a single order's decomposition | MEDIUM | Triggered from existing per-order table. Modal or expanded row. Order-level data already in DB. |
| Color coding: green for revenue/profit, red/orange for deductions | Financial visualization convention merchants recognize | LOW | Simple color map. Negative net profit = red final bar. |
| Handles negative profit (loss orders) | Some orders will be net negative — chart must not break | LOW | Recharts waterfall handles negative bars. Test with seeded loss orders. |
| Correct rendering when COGS is missing | Many orders will have $0 COGS (not entered) — chart should not show misleading "100% profit" | LOW | If COGS coverage < 100%, annotate the chart: "COGS missing for X% of items in this period — profit may be overstated." |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Ad spend deduction step in waterfall | When Meta/Google Ads integration ships, show ad spend as a waterfall step — makes the chart the unifying "north star" visualization | LOW (incremental once ADS-01/02 done) | This is the payoff for the whole v2.0 milestone. All cost categories visible in one chart. |
| SKU-level waterfall | Breakdown for a single product/variant — useful for pricing decisions | MEDIUM | Build after per-order and store-level are validated. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Animated waterfall on load | Looks impressive in demos | Adds JS weight; can feel gimmicky in a business analytics tool | Static chart renders faster; more professional |
| Waterfall with 10+ cost categories | Seems thorough | Too many steps = unreadable at small screen sizes | Cap at 6 categories max: Revenue, COGS, Shopify Fees, Shipping, Ad Spend, Net Profit |
| Horizontal waterfall | Some designs use this | Vertical (descending) is the financial standard merchants recognize from accounting tools | Use vertical |

### Implementation Reality (HIGH confidence)

- Recharts has a documented waterfall example at `recharts.github.io/en-US/examples/Waterfall/`. Uses `Bar` with `[low, high]` range data + custom shape function + a `computeWaterfallData` transform helper (~30 lines).
- Already using Recharts for the v1.0 trend line chart — zero new charting library dependency.
- Store-level waterfall data already exists in the existing P&L calculation. This is primarily a new chart component consuming existing data.
- Per-order waterfall data exists in the per-order profit table query. Needs the order-level breakdown object surfaced to the UI.

### Dependency on Existing Features

- Store-level waterfall: depends on existing KPI card calculations (v1.0 ✓) — data already present.
- Per-order waterfall: depends on existing per-order profit table + profit breakdown stored per order (v1.0 ✓).
- Ad spend step: depends on Meta Ads (ADS-01) or Google Ads (ADS-02) — best delivered after those ship.
- **Accuracy note**: Payout fee fix (FEE-FIX-01) should ship before or with waterfall. Showing a beautiful chart with estimated fees as "Shopify Fees" misleads merchants. Fix fees first.

---

## Feature 3: Margin Alerts (ALERT-01)

### What Merchants Expect

Merchants want the app to surface problems proactively — not wait for them to discover a loss-making SKU. The dominant UX pattern across Shopify analytics apps is an in-dashboard alert banner that appears automatically when a product/SKU drops below a configurable threshold. Email alerts exist as a differentiator but are not universally expected.

Competitor evidence: GoProfit "Smart Alerts" (monitors drops and spikes); Margin Insight "Margin Issue Tracker" (filterable at-risk products table); Shopimize "Negative Margin Alert" (explicit call-out for below-zero products).

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| In-dashboard alert banner for SKUs below threshold | Every modern analytics app has this pattern. Missing = product feels passive | LOW | Banner on dashboard or Products tab. Shows offending SKUs, current margin %, threshold. |
| Configurable margin threshold per shop (global default) | "Below 10%" varies by merchant type — must be settable. Default 20% is a reasonable starting point | LOW | Single settings field per shop. Persist in DB. Default to 20% gross margin per industry benchmarks. |
| Negative-margin alerts (always on, threshold = 0) | A product losing money on every sale is always critical — no threshold config should hide this | LOW | Special case: negative margin = CRITICAL alert, shown regardless of threshold setting. |
| Alert count badge on Products nav item | Passive awareness — merchant sees "3 SKUs at risk" without needing to look | LOW | Polaris `Badge` component. Count of SKUs below threshold. Updates on dashboard load. |
| Dismissible alerts with re-trigger logic | Merchants may know about a problem and not want to see it every load | MEDIUM | "Dismiss for 7 days" option. Resurfaces if margin drops further or after 7 days. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-SKU threshold override | Some SKUs are intentional loss leaders — let merchants exclude them from alerts | MEDIUM | Per-variant override flag. Reduces false positives. Most apps don't offer this. |
| Email digest alert (daily/weekly) | Proactive — merchant gets notified even when not in the app | HIGH | Requires email sending infrastructure (Sendgrid/Postmark) not currently in stack. High value but meaningful scope increase. Defer to v2.1+. |
| Margin trend alert (dropping, not yet crossed threshold) | Catches deteriorating margins before they become critical | HIGH | Requires historical per-SKU margin tracking over time. Complex. Definitely v2.1+. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-order alerts | Seems thorough | Order margins fluctuate naturally with discounts and product mix. Not actionable at order level. | SKU-level only — that's where corrective action happens |
| Auto-remediation suggestions ("raise price to $X") | Seems smart | App doesn't know competition, intent, or cost structure. Wrong recommendation = liability risk. | Surface the problem clearly. Merchant decides the fix. |
| Real-time per-order alerts (push notification) | Feels premium | Processing overhead; most margin problems are structural (SKU pricing), not per-order emergencies | Recalculate alert state on dashboard load. Nightly batch refresh is sufficient. |
| Slack/webhook push alerts | Power feature for ops teams | Scope creep; not in current stack; low demand at $29/month price point | Email digest is the right stepping stone first |

### UX Pattern (MEDIUM confidence — from competitor listing analysis)

The dominant pattern is a persistent in-dashboard banner + a filterable at-risk products view. NOT a modal popup (intrusive on every load) and NOT email-only (too easy to ignore). The alert should feel like a "health check" surfaced at the top of the Products tab.

### Dependency on Existing Features

- Requires per-product/SKU margin data from existing calculations (v1.0 ✓).
- Requires COGS data — alert system should note "COGS missing for X SKUs — margin data unreliable" using the existing COGS coverage indicator (v1.0 ✓).
- New DB field: `alertMarginThreshold FLOAT DEFAULT 0.20` per shop settings record.
- Margin Alerts are independent of fee fix, waterfall, and ads. Can ship in any order or in parallel.

---

## Feature 4: Meta Ads Integration (ADS-01)

### What Merchants Expect

Merchants running Meta Ads (Facebook + Instagram) want ad spend deducted from profit. The minimum expectation: "show me total Meta spend for this period subtracted from my P&L." Stretch goal: per-order attribution showing which orders came from which campaign. Triple Whale, BeProfit, and TrueProfit all offer this — it is competitive table stakes for the $29/month price point.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Meta ad account OAuth connection | Every competitor supports this. Missing = not competitive at this price point | MEDIUM | Standard OAuth 2.0. Scopes: `ads_read` only (sufficient for spend reporting). No `ads_management` needed. |
| Total Meta spend for date range pulled into P&L | Minimum viable: deduct total spend from store profit for the period | MEDIUM | Ads Insights API: `GET /{ad_account_id}/insights?level=account&fields=spend&date_preset=last_30d`. Straightforward. |
| Ad spend line in store-level P&L KPI cards | Extend existing KPI display: add "Meta Ad Spend" row | LOW | After data is pulled, this is a UI extension of existing KPI cards. |
| Ad spend step in waterfall chart | Connects to CHART-01 — the waterfall is the unifying visualization | LOW | Add "Ad Spend" step to waterfall. Low incremental cost after waterfall chart exists. |
| Disconnect Meta account | Merchant must be able to remove the connection | LOW | Delete stored access token from DB. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Campaign-level spend breakdown | See which campaign consumed what budget in the period | LOW (incremental after account-level) | Same Insights API endpoint, `level=campaign`. Add campaign breakdown table to UI. |
| Per-order attribution via Shopify UTM data | Link specific orders to Meta campaigns via `customerJourneySummary.firstVisit.utmParameters` — source = "facebook", campaign = utm_campaign | HIGH | UTM fields confirmed on Shopify `CustomerVisit` GraphQL object. Accuracy degrades with iOS privacy (40% of traffic may show as "Direct"). Be explicit about limitations. |
| ROAS calculation (revenue / ad spend) | Familiar metric. Merchants think in ROAS. | LOW (after campaign data exists) | Derived metric. `ROAS = revenue_in_period / spend_in_period`. High perceived value. |
| True profit per campaign (revenue - COGS - fees - campaign spend) | North-star DTC metric | HIGH | Requires per-order UTM attribution working first. Best as v2.1 feature. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Meta Pixel / CAPI implementation | "Complete Meta integration" | Wrong scope — CAPI is conversion tracking for Meta optimization, not profit analytics. Requires frontend pixel + server-side CAPI. Separate infrastructure from spend reporting. | Pull spend from Marketing API (read-only). Don't touch the merchant's CAPI setup. |
| Claim accurate per-order attribution | Seems like the goal | Impossible. iOS privacy, 30-day attribution window, Meta over-attribution (Meta claims 20-30% more revenue than Shopify attributes). Claiming accuracy = churn risk when numbers don't match. | Label attribution as "best-effort based on UTM data. Actual Meta-attributed revenue may differ." |
| Manage ads from the app | Power feature | Out of scope. Requires `ads_management` scope (harder to get approved). Creates liability. | Read-only spend data only. |

### API Reality (MEDIUM confidence — from official Meta developer docs and changelog)

- Meta Marketing API is at v22+ (2026). Developer app creation at developers.facebook.com, enable Marketing API product.
- OAuth scopes for read-only reporting: `ads_read`. Optional: `business_management` for multi-ad-account scenarios.
- Ads Insights endpoint: `GET /{ad_account_id}/insights` with `fields=spend,campaign_name,impressions,clicks` and date range (`since`, `until` in YYYY-MM-DD, or `date_preset`).
- Attribution window changes effective January 12, 2026: Meta deprecated two view-through attribution windows. This affects Meta's own attribution metrics — does NOT affect pulling total spend, which is unambiguous.
- Rate limits: rolling hourly window. For daily pulls per merchant, not a practical constraint.
- Per-order attribution via UTM: Shopify `CustomerJourneySummary.firstVisit.utmParameters` has `source`, `medium`, `campaign` confirmed in official GraphQL docs. Populated when customer clicked a tagged link. 30-day attribution window on Shopify side. Not populated for direct/organic traffic.

### Dependency on Existing Features

- Store-level P&L KPI cards (v1.0 ✓) — add "Ad Spend" row.
- Waterfall chart (CHART-01) — add "Ad Spend" step. Best delivered together.
- Per-order UTM attribution: requires schema extension to store UTM data per order during sync. May need to re-sync orders or add UTM enrichment on order webhook.

---

## Feature 5: Google Ads Integration (ADS-02)

### What Merchants Expect

Same fundamental expectation as Meta: total Google Ads spend visible in the profit dashboard. Google is typically the second ad platform added after Meta in Shopify analytics apps. The majority of DTC merchants on Shopify run both.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Google Ads account OAuth connection | Triple Whale, BeProfit, TrueProfit all support it. Expected at competitive price point. | HIGH | **Critical gating requirement**: Google Ads API requires a developer token (separate from OAuth token), approved by Google. Standard OAuth is insufficient. Developer token requires a Google Ads Manager Account and an application/approval process (days to weeks). This is the #1 implementation risk for this feature. |
| Total Google Ads spend for date range | Same as Meta: deduct from P&L | MEDIUM | GAQL query: `SELECT metrics.cost_micros FROM customer WHERE segments.date DURING LAST_30_DAYS`. Cost in **micros** (divide by 1,000,000 to get dollars). |
| Separate Google spend line in P&L | Merchants want Meta and Google shown separately | LOW | "Google Ads: $X" separate from "Meta Ads: $Y". |
| Disconnect Google account | Remove connection | LOW | Delete stored refresh token. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Campaign-level spend breakdown | Which Google campaign spent what | LOW (after account-level works) | GAQL query with `campaign.name` segment. |
| Google Shopping campaign isolation | Shopping campaigns are how most Shopify product stores run Google Ads — filter by campaign type | MEDIUM | GAQL `WHERE campaign.advertising_channel_type = 'SHOPPING'`. Valuable for product-heavy stores. |
| Per-order attribution via gclid / UTM | `utm_source=google` in Shopify `CustomerJourneySummary` — same approach as Meta | HIGH | Accuracy similar to Meta (degrades with direct traffic). gclid auto-tagging must be enabled on merchant's Google Ads account. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Google Ads conversion upload (import conversions) | "Full integration" | Requires `ads_management` scope + Google's Enhanced Conversions compliance. This is optimization tooling, not profit analytics. Wrong direction. | Read-only spend via GAQL only |
| Report Google-attributed revenue as ground truth | Attribution completeness | Google attribution models over-attribute similar to Meta. Conversion lag up to 3 hours for imported conversions. Google's number will never match Shopify's. | Show spend-based metrics (spend, ROAS = Shopify revenue / Google spend). Don't use Google's attributed revenue figure. |

### API Reality (MEDIUM confidence — from official Google Ads developer blog and npm package)

- Current API version: v20 (released June 2025). v19 sunset February 11, 2026. Use v20+ only.
- Node.js library: `google-ads-api` on npm, v23.0.0 (last published ~1 month ago as of research date).
- Authentication: OAuth 2.0 refresh token per merchant + developer token in request headers. Developer token is **global per app** (one developer token for all merchants using the app).
- **Developer token approval**: Standard tokens only get test account access. Production access requires Google approval. Apply early — this is a multi-week external dependency.
- GAQL is SQL-like and well-documented. A spend query is simple. Cost in micros requires dividing by 1,000,000.
- Rate limits: reasonable for daily per-merchant pulls.

### Dependency on Existing Features

- Shares the "Ad Platforms" connection UI with Meta Ads (ADS-01). Implement Meta first to establish the pattern — Google reuses the same settings section.
- Google Ads integration is strictly harder than Meta due to developer token approval. Meta first is the correct sequencing. Start developer token application during v2.0 development so it's ready for v2.1.

---

## Feature Dependencies

```
[Payout Fee Fix (FEE-FIX-01)]
    └──requires──> [Existing payout sync v1.0]
    └──feeds accuracy into──> [Waterfall Chart] (fee step is trustworthy)

[Waterfall Chart (CHART-01)]
    └──requires──> [Existing per-order profit data v1.0]
    └──requires──> [Existing store-level P&L calculations v1.0]
    └──enhanced by──> [Payout Fee Fix] (accurate fee step)
    └──enhanced by──> [Meta Ads (ADS-01)] (ad spend step)
    └──enhanced by──> [Google Ads (ADS-02)] (ad spend step)

[Margin Alerts (ALERT-01)]
    └──requires──> [Existing per-SKU margin data v1.0]
    └──requires──> [Existing COGS data v1.0]
    └──INDEPENDENT of──> [Fee Fix, Waterfall, Ads]

[Meta Ads (ADS-01)]
    └──requires──> [Meta developer app + Marketing API access]
    └──enhances──> [Waterfall Chart] (add ad spend step)
    └──enhances──> [Store P&L KPI cards] (add spend line)

[Google Ads (ADS-02)]
    └──requires──> [Google developer token approval — external, weeks-long]
    └──follows──> [Meta Ads (ADS-01)] (share connection UI patterns)
    └──enhances──> [Waterfall Chart] (add Google spend step)

[True Profit per Campaign (ADS-03)]
    └──requires──> [Meta Ads (ADS-01)] OR [Google Ads (ADS-02)]
    └──requires──> [Per-order UTM attribution from CustomerJourneySummary]
    └──requires──> [Existing per-order profit data v1.0]
```

### Dependency Notes

- **Payout Fee Fix before Waterfall**: If waterfall shows a "Shopify Fees" bar using estimated rates, it will be wrong for Shopify Payments stores. Fix fees first, then the chart is trustworthy.
- **Meta before Google**: Meta OAuth is standard — no external gating. Google requires developer token approval from Google. Ship Meta first; apply for Google token in parallel.
- **Margin Alerts are independent**: No dependency on fee fix, waterfall, or ads. Can be sequenced first if desired.
- **Waterfall + Ads integration payoff**: The waterfall chart becomes genuinely powerful only after ads spend is integrated. The two features should be positioned as a pair in the release.

---

## MVP Definition for v2.0

### Launch With (v2.0)

Minimum to close the three retention risks identified in the milestone brief (accuracy, UX differentiation, competitive parity):

- [ ] **Payout Fee Fix** — Core accuracy risk. Verify and fix before any other v2.0 feature ships. Broken fees undermine the entire value proposition.
- [ ] **Per-order Waterfall Chart** — The "aha moment" UX. Drill from existing order table into visual cost decomposition. Low complexity given existing Recharts usage.
- [ ] **Store-level Waterfall Chart** — Aggregate view for selected date range. Reuses existing KPI calculations. Very low incremental complexity.
- [ ] **Margin Alerts (in-dashboard only)** — Configurable threshold, badge on Products nav, banner showing at-risk SKUs. No email alerts in v2.0.
- [ ] **Meta Ads account connection + total spend** — Account-level spend deducted from P&L. Campaign breakdown as second step. Reaches competitive parity.
- [ ] **Meta campaign-level spend breakdown** — Small incremental step after account-level. Adds meaningful value (which campaign burned the budget).

### Add After v2.0 Ships (v2.1)

- [ ] **Google Ads integration** — Gated on developer token approval. Start the application process during v2.0 development.
- [ ] **Ad spend step in waterfall chart** — Connects ads integration to the waterfall visualization. The unifying "north star" chart.
- [ ] **Per-order Meta attribution via UTM** — Complex and imperfect but directionally useful. `CustomerJourneySummary.firstVisit.utmParameters`.
- [ ] **True profit per campaign** — Requires UTM attribution working first.
- [ ] **Email margin alerts** — Requires adding email sending infrastructure (Sendgrid/Postmark). Good retention feature but not v2.0.

### Defer to v3+ (Future Consideration)

- [ ] **Payout reconciliation view** — Accountant-focused. High complexity, niche demand at current price point.
- [ ] **SKU-level waterfall** — Build after per-order and store-level are validated.
- [ ] **Per-SKU threshold overrides for alerts** — Reduces false positives but adds UI complexity. Validate demand first.
- [ ] **Margin trend alerts** (alerting before threshold is crossed) — Requires historical per-SKU tracking infrastructure.
- [ ] **Slack/webhook alerts** — Power feature, scope creep for v2.x.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Payout fee fix | HIGH (accuracy = trust) | MEDIUM | P1 |
| Store-level waterfall chart | HIGH (unifying visualization) | LOW | P1 |
| Per-order waterfall chart | HIGH (drill-down insight) | MEDIUM | P1 |
| Margin alerts (in-dashboard) | HIGH (proactive insight) | LOW | P1 |
| Meta Ads account connection + total spend | HIGH (competitive parity) | MEDIUM | P1 |
| Meta campaign-level breakdown | MEDIUM | LOW (incremental) | P1 |
| Google Ads integration | HIGH (competitive parity) | HIGH (gated on developer token) | P2 |
| Ad spend step in waterfall | HIGH (completes the chart) | LOW (incremental once ads exist) | P2 |
| Per-order Meta attribution (UTM) | MEDIUM (imperfect) | HIGH | P2 |
| True profit per campaign | HIGH | HIGH | P2 |
| Email margin alerts | MEDIUM | HIGH (new infra) | P3 |
| Payout reconciliation view | LOW (niche) | HIGH | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Target v2.1 — start Google token approval now
- P3: Defer until validated demand

---

## Competitor Feature Analysis

| Feature | Triple Whale | BeProfit | TrueProfit | Our v2.0 Approach |
|---------|--------------|----------|------------|-------------------|
| Profit decomposition / waterfall | Contribution margin per order with full cost breakdown (COGS, shipping, gateway fees, ad spend) | "Cost breakdown" view — how each category reduces profit | Real-time net profit dashboard, per-order cost breakdown | Recharts waterfall chart: per-order + store-level. Simpler than Triple Whale's full suite but captures the core insight at lower complexity. |
| Margin alerts | Not a primary feature — focus is on ad attribution | Flags low-margin products in reports | Product-level profitability analysis | In-dashboard banner + nav badge. Configurable threshold. More explicit and actionable than TrueProfit's approach. |
| Meta Ads | Primary differentiator — first-party pixel + CAPI + Insights API | Yes, multi-platform | Yes, multi-platform (Meta, Google, TikTok, Amazon) | Spend pull via Marketing API (read-only). Per-order attribution via UTM best-effort. Honest about attribution limitations — no pixel/CAPI scope creep. |
| Google Ads | Yes | Yes | Yes | Start approval in parallel with v2.0. Ship after Meta. |
| Payout fee accuracy | Tracks transaction fees as a cost component | Tracks transaction fees | Tracks transaction fees | Exact fees from `ShopifyPaymentsBalanceTransaction` — more precise than competitors who estimate from rate tables. Potential differentiation on accuracy narrative. |

---

## Sources

- [ShopifyPaymentsBalanceTransaction - GraphQL Admin](https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction) — HIGH confidence
- [ShopifyPaymentsPayout - GraphQL Admin](https://shopify.dev/docs/api/admin-graphql/latest/objects/shopifypaymentspayout) — HIGH confidence
- [New fees and net fields for balance transactions - Shopify changelog, 2025-04](https://shopify.dev/changelog/new-fees-and-net-fields-for-balance-transactions) — HIGH confidence
- [Additions to GraphQL API for Shopify Payments payouts and balance transactions](https://shopify.dev/changelog/additions-to-the-graphql-api-for-shopify-payments-payouts-and-balance-transactions) — HIGH confidence
- [CustomerJourneySummary - GraphQL Admin](https://shopify.dev/docs/api/admin-graphql/latest/objects/customerjourneysummary) — HIGH confidence
- [CustomerVisit - GraphQL Admin](https://shopify.dev/docs/api/admin-graphql/latest/objects/CustomerVisit) — HIGH confidence
- [Recharts Waterfall Example](https://recharts.github.io/en-US/examples/Waterfall/) — HIGH confidence
- [Meta Ads API setup guide - AdManage.ai](https://admanage.ai/blog/meta-ads-api) — MEDIUM confidence (third-party but detailed, consistent with official docs)
- [Meta Ads API June 2025 attribution changes - Windsor.ai](https://windsor.ai/documentation/facebook-ads-meta-api-updates-june-10-2025/) — MEDIUM confidence
- [Google Ads API v20 announcement - Google Developer Blog, June 2025](https://ads-developers.googleblog.com/2025/06/announcing-v20-of-google-ads-api.html) — HIGH confidence
- [google-ads-api npm package v23.0.0](https://www.npmjs.com/package/google-ads-api) — HIGH confidence
- [Triple Whale Summary Dashboard metrics library](https://kb.triplewhale.com/en/articles/6127778-summary-dashboard-metrics-library) — HIGH confidence (official docs)
- [Triple Whale Net Profit formula](https://triplewhale.readme.io/docs/net-profit) — HIGH confidence
- [GoProfit Smart Alerts - Shopify App Store](https://apps.shopify.com/go-profit) — MEDIUM confidence
- [Margin Insight - Shopify App Store](https://apps.shopify.com/margininsight) — MEDIUM confidence
- [Shopimize Negative Margin Alert - Shopify App Store](https://apps.shopify.com/shopimize) — MEDIUM confidence
- [Attribution mismatch analysis Meta vs Shopify, 2026](https://attribuly.com/blogs/shopify-attribution-mismatches-meta-vs-tiktok-2026/) — MEDIUM confidence
- [Capturing UTM Parameters in Shopify orders (2025)](https://trackfunnels.com/capture-utm-parameters-shopify-order-webhook/) — MEDIUM confidence

---
*Feature research for: Shopify Profit Analytics App v2.0*
*Covers: Payout Fee Fix, Waterfall Chart, Margin Alerts, Meta Ads Integration, Google Ads Integration*
*Researched: 2026-03-18*
