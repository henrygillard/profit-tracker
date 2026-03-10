# Domain Pitfalls: Shopify Profit Analytics App

**Domain:** Shopify embedded analytics app (profit margins, COGS, fees)
**Researched:** 2026-03-10
**Confidence:** HIGH for API rate limits and fee mechanics (well-documented); MEDIUM for review rejection patterns (community-sourced); HIGH for App Bridge/CSP (stable, documented behavior)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or app rejection.

---

### Pitfall 1: Treating REST Order Pagination as Reliable for Historical Syncs

**What goes wrong:** The REST `/admin/api/orders.json` endpoint returns max 250 orders per page and uses cursor-based `page_info` tokens. Developers write a simple loop assuming pages are stable — but `page_info` tokens expire after a short window (~30 seconds of inactivity). A slow sync loop (or one that retries failed pages) hits expired cursors, restarts from page 1, and produces duplicate data or an infinite loop.

**Why it happens:** The REST docs show `page_info` as the next-page mechanism without prominently warning about token expiry. Developers test with small stores (< 250 orders) and never hit pagination at all.

**Consequences:** Duplicate orders in the local database, inflated revenue figures, silent data corruption that's very hard to detect after the fact.

**Prevention:**
- Use the **GraphQL Bulk Operations API** (`bulkOperationRunQuery`) for initial historical syncs of large order sets. It runs asynchronously server-side and returns a JSONL file download — no pagination, no token expiry, no rate limits during the export.
- For incremental syncs (catching up new orders), use `orders.json?updated_at_min={timestamp}&limit=250` with `created_at` ordering and persist the high-water mark timestamp after each successful page, not after each loop.
- Store a `sync_cursor` per shop in the database so syncs are resumable after crashes.

**Warning signs:** Orders table row count jumps unexpectedly between syncs. Revenue totals don't match Shopify's own analytics for the same period.

**Phase:** Initial data sync (Phase 1 MVP — order/product sync feature).

---

### Pitfall 2: REST API 429 Rate Limits Killing Background Syncs

**What goes wrong:** Shopify's REST API enforces a leaky-bucket rate limit: 40 requests/second bucket, refill rate of 2 requests/second (standard) or 4/second (Shopify Plus). A background sync job that fires requests in a tight loop exhausts the bucket within seconds, receives `429 Too Many Requests`, retries immediately (exponential backoff not implemented), and either locks the shop out of API access for the sync duration or triggers Shopify to flag the app for abuse.

**Why it happens:** Node.js `Promise.all()` on a large array of order IDs fires all requests simultaneously. No throttling is applied. Works fine in dev with 10 test orders; breaks instantly with 5,000 real orders.

**Consequences:** Sync never completes for large stores. Merchant sees stale/empty dashboard. If abuse is flagged, Shopify can restrict the app's API access for that shop permanently.

**Prevention:**
- Always respect the `X-Shopify-Shop-Api-Call-Limit` response header (format: `used/bucket_size`, e.g. `38/40`). Implement a simple token-bucket consumer that backs off when `used / bucket_size > 0.8`.
- For bulk operations use the GraphQL Bulk API instead of looping REST calls — it has separate, much higher limits.
- For incremental syncs, process pages sequentially (not in parallel) with a 500ms delay between pages as a safe default.
- Implement exponential backoff with jitter on 429 responses: start at 2s, cap at 60s.
- Use a per-shop queue (e.g., Bull/BullMQ backed by Redis, or a simpler in-process queue for MVP) to serialize sync jobs and prevent simultaneous syncs for the same shop.

**Warning signs:** Logs show frequent 429 responses. Sync jobs time out for stores with > 1,000 orders.

**Phase:** Phase 1 MVP (order sync). Also affects Phase 2 when adding product/payout syncs.

---

### Pitfall 3: Calculating Shopify Transaction Fees Without Accounting for Plan Differences

**What goes wrong:** The developer hard-codes a single transaction fee rate (e.g., 2% or 0%) instead of dynamically detecting the merchant's Shopify plan. Shopify's transaction fees (separate from Shopify Payments processing fees) vary by plan:

| Plan | Transaction Fee (non-Shopify Payments) |
|------|----------------------------------------|
| Basic | 2% |
| Shopify | 1% |
| Advanced | 0.5% |
| Plus | 0.15% |
| Shopify Payments enabled | 0% (waived entirely) |

A merchant on Basic who uses PayPal (external gateway) pays 2% to Shopify on top of PayPal's own fees. Hardcoding 0% makes profit look $200–$400/month higher than reality for a $10K/month store on Basic.

**Why it happens:** Developers test in development stores (which often default to Basic or mock Plus behavior) and miss that the plan affects fees. The fee rate isn't on the order object — it must be inferred from the shop's plan.

**Consequences:** Systematically wrong profit calculations. Merchants discover discrepancy, lose trust, churn.

**Prevention:**
- Call `GET /admin/api/shop.json` on install (and re-check periodically) and store `plan_name` in the `ShopSession` record.
- Map `plan_name` to the correct transaction fee rate in a config table, not in business logic.
- When gateway is `shopify_payments`, apply 0% transaction fee regardless of plan.
- Expose the detected plan and fee rate in the UI so merchants can verify the assumption.
- Listen for the `shop/update` webhook to detect plan upgrades/downgrades and recalculate affected historical orders.

**Warning signs:** Profit calculations off by exactly 0.5–2% of revenue. QA only done on development stores.

**Phase:** Phase 1 MVP (fee calculation feature). Must be correct before any orders are displayed.

---

### Pitfall 4: Missing Shopify Payments Processing Fee Tiers (Not Just Transaction Fees)

**What goes wrong:** Even when using Shopify Payments (no transaction fee), the card processing rate itself varies by plan:

| Plan | Online Credit Card Rate |
|------|------------------------|
| Basic | 2.9% + 30¢ |
| Shopify | 2.6% + 30¢ |
| Advanced | 2.4% + 30¢ |
| Plus | Negotiated (often ~2.15%) |

And international cards, AMEX, and manual payments have different rates still. Developers apply a flat 2.9% + 30¢ to all Shopify Payments orders, which is wrong for most merchants above Basic.

**Why it happens:** The processing fee is NOT on the order or transaction object from the API. It must be calculated from plan data + payment method + card type (which isn't always available).

**Consequences:** Profit overstated for Shopify/Advanced/Plus merchants using Shopify Payments.

**Prevention:**
- Check `order.payment_gateway` to determine if Shopify Payments was used.
- Use the shop's plan to select the base Shopify Payments rate from a config table.
- For external gateways (PayPal, Stripe, etc.), apply the external gateway's known rate OR — better — allow merchants to input their actual gateway rate in settings. You cannot know PayPal's rate from the Shopify API.
- For MVP: display a clear "estimated processing fee" label and provide a gateway rate override setting per merchant.
- Access `order.transactions[]` for actual payment amounts and gateway details, but note that Shopify does NOT expose the actual fee charged in the transactions object (only the amount paid).

**Warning signs:** Profit calculation assumes all merchants pay 2.9% + 30¢. No plan-dependent processing fee table exists in code.

**Phase:** Phase 1 MVP. Consider a "gateway rates settings page" as a quick MVP escape hatch.

---

### Pitfall 5: Refund Handling — Double-Counting or Ignoring Refund Fee Recouping

**What goes wrong:** When a refund is issued, the gross revenue decreases by the refund amount, but the handling of fees is wrong in almost every amateur implementation:

1. **Shopify Payments refund behavior:** Shopify refunds the merchant the processing fee on the refunded amount (the payment processor returns it). So a $100 order at 2.9% + 30¢ = $3.20 in fees. A full refund means $3.20 is returned to the merchant by the processor — but only the transaction fee, not the Shopify plan transaction fee (that is NOT recouped).
2. **Partial refunds:** A $50 partial refund on a $100 order does not mean 50% of fees are returned. The fixed 30¢ component is typically not returned on partial refunds.
3. **Refund-only orders:** Some stores issue manual refunds on already-fulfilled orders. These appear as negative line items and must reduce revenue without being counted as a separate negative "order."

**Why it happens:** Developers subtract `refund.transactions[].amount` from revenue but forget to adjust the fee model accordingly. They never test with partial refunds or stores with high return rates.

**Consequences:** Profit is wrong for any store with > 1% refund rate. A store doing $50K/month with 5% refund rate has $2,500/month of incorrectly modeled fees.

**Prevention:**
- Model refunds as separate adjustments to both revenue AND fees. Create a `refund_adjustments` column or separate table.
- For Shopify Payments: when a full refund occurs, mark the processing fee as returned (set `processing_fee_net = 0` for that order).
- For partial refunds: proportionally reduce the percentage component of the fee, but not the fixed component.
- Shopify transaction fees (the plan-based %) are NOT returned on refunds — they are a permanent cost.
- Use `order.refunds[]` array and `refund.transactions[]` to reconstruct the actual cash flow per order.
- Write a test suite with refund scenarios before shipping: full refund, partial refund, multi-item partial refund, refund with restocking fee.

**Warning signs:** No special handling for `order.financial_status === 'refunded'` or `'partially_refunded'`. Fee calculation doesn't reference `order.refunds`.

**Phase:** Phase 1 MVP. Refunds must be modeled correctly from day 1 — retrofitting is difficult once merchants have historical data.

---

### Pitfall 6: COGS at Order Placement vs. COGS at Time of Sale (Historical Changes)

**What goes wrong:** A merchant sells 100 units of a product in January at $5 COGS, then updates the COGS to $7 in February. The app re-calculates January profit using the new $7 COGS, making January look less profitable than it was. Worse: if COGS is deleted entirely (product archived), all historical orders for that product show $0 COGS, inflating historical profit.

**Why it happens:** COGS is stored as a current value on the product/variant record. When the app calculates historical order profit, it joins to the current COGS record instead of the COGS at the time of the sale.

**Consequences:** Historical profit reports are retroactively rewritten every time COGS changes. Trust in the dashboard evaporates when a merchant notices January looks different than it did last month.

**Prevention:**
- Store COGS as a **time-series** (variant_id, effective_from, effective_until, cost_per_unit) rather than a single scalar.
- When an order is synced (or when COGS is updated), snapshot the current COGS onto the order line item record in the local database. Do not calculate COGS on-the-fly at query time by joining to the current COGS value.
- When COGS is updated, recalculate only future orders going forward (or present the merchant with a "recalculate historical" option with an explicit confirmation dialog).
- For missing COGS: treat as `NULL` (unknown), not as `$0`. Show a separate "COGS unset" indicator in the UI rather than counting it as zero-cost profit.

**Warning signs:** COGS stored as a single value on a product/variant table with no `effective_date`. Historical profit reports change when COGS is edited.

**Phase:** Phase 1 MVP. Data model must be correct before any COGS entry feature is built.

---

### Pitfall 7: Variant-Level COGS Collapsed to Product-Level

**What goes wrong:** A T-shirt comes in Small ($3 COGS) and XL ($4 COGS, different supplier). The developer stores one COGS per product (not per variant), averages it to $3.50, and applies that to every sale. A store selling 80% XL has incorrect COGS for every order.

**Why it happens:** The product page in Shopify admin shows variants but most UI prototypes show one COGS field per product. Developer under-estimates variant cardinality in real stores (one product can have 100+ variants).

**Consequences:** COGS is wrong for any store with multi-variant products where variants have meaningfully different costs (which is most real apparel, electronics, and bundle stores).

**Prevention:**
- Data model must be at `variant_id` level, not `product_id` level. `ProductCogs(id, shop_id, variant_id, cost, effective_from)`.
- UI should show the product name as a grouping label, with per-variant COGS fields below it.
- CSV import must support a `variant_id` or `sku` column for variant-level mapping.
- For variants without individual COGS, allow a product-level default that applies to all variants unless overridden.
- When fetching order line items from Shopify, always use `line_item.variant_id` (not `product_id`) for COGS lookup.

**Warning signs:** COGS database table has a `product_id` column but no `variant_id` column. CSV import template doesn't include a SKU or variant ID column.

**Phase:** Phase 1 MVP (data model must be right before any COGS entry is built).

---

### Pitfall 8: Missing COGS Silently Treated as Zero

**What goes wrong:** An order contains 3 line items. COGS is set for 2 of them. The third has no COGS. The app calculates profit as: `revenue - known_cogs - fees`, treating the missing COGS as $0. The profit figure is shown without any warning. The merchant thinks they're making 40% margin when the actual margin might be 15%.

**Why it happens:** A `NULL` in the COGS join query is coerced to `0` (via `COALESCE(..., 0)` or implicit JavaScript falsy behavior). Developer tests only with COGS fully filled in.

**Consequences:** Merchant makes inventory and pricing decisions on wrong data. The app is worse than useful — it's actively misleading.

**Prevention:**
- Track COGS coverage per order: what % of line item revenue has COGS assigned.
- In profit display: show "Profit (X% of revenue has COGS set)" when coverage is < 100% for the selected date range.
- Use a separate `cogs_coverage_pct` column on the orders table, updated on sync and on COGS changes.
- Never coerce NULL COGS to 0 in financial calculations. Use a three-state model: `known_profit`, `estimated_profit` (partial COGS), `unknown_profit`.
- Dashboard summary should show a banner: "42 orders missing COGS — profit may be understated by up to $X."

**Warning signs:** SQL query uses `COALESCE(cogs.cost, 0)` in profit calculation. UI shows profit without any "COGS coverage" indicator.

**Phase:** Phase 1 MVP (affects all profit display).

---

### Pitfall 9: App Bridge Session Token Not Validated on Every API Request

**What goes wrong:** The existing scaffold uses offline OAuth tokens for API calls to Shopify. When adding a React frontend via App Bridge, the frontend makes requests to the Express backend (e.g., `GET /api/orders`). Developers often check only for the presence of a `shop` query parameter instead of validating the App Bridge session token on each request. This allows any HTTP client with a valid `shop` parameter to access merchant data without going through Shopify's iframe authentication.

**Why it happens:** The offline token OAuth flow (already implemented) is for server-to-server Shopify API calls. App Bridge generates a separate short-lived session token (JWT) for authenticating the embedded app frontend to the app's own backend. These are two different authentication mechanisms and are easy to conflate.

**Consequences:** Unauthenticated API access to merchant data. App review rejection for security issues.

**Prevention:**
- Use `@shopify/shopify-api` library's `shopify.session.decodeSessionToken(token)` to validate App Bridge JWTs on every protected API endpoint.
- The React frontend should call `shopify.idToken()` (App Bridge 4.x) to get the session token and include it as a `Authorization: Bearer {token}` header on every fetch call to the Express backend.
- Middleware pattern: create a `requireAppBridgeAuth` Express middleware that validates the JWT before any API route handler runs.
- Do NOT rely on the `shop` query parameter alone for authorization.

**Warning signs:** Express API routes for order/COGS data check `req.query.shop` but do not validate any JWT. No `Authorization` header handling in middleware.

**Phase:** Phase 1 MVP (must be in place before any `/api/*` endpoints are created).

---

### Pitfall 10: CSP `frame-ancestors` Breaking After Adding App Bridge 4.x

**What goes wrong:** The existing scaffold sets `Content-Security-Policy: frame-ancestors 'none' https://{shop} https://admin.shopify.com` on the admin route. This works for the current inline HTML page. When React + App Bridge 4.x is introduced and uses `@shopify/app-bridge-react`, it may load resources from CDNs or Shopify's own script hosts. A strict CSP that doesn't include `cdn.shopify.com` and `*.shopifycloud.com` in `script-src` and `img-src` will break App Bridge initialization silently (no console error in embedded iframe context, just a blank screen).

**Why it happens:** The developer adds App Bridge, tests locally with `shopify app dev` (which relaxes CSP for development), and ships to production without verifying CSP headers against the production embedded context.

**Consequences:** Blank white screen in Shopify admin for all merchants. The dashboard is completely unusable.

**Prevention:**
- CSP for embedded Shopify apps needs at minimum:
  ```
  Content-Security-Policy:
    frame-ancestors https://{shop} https://admin.shopify.com;
    script-src 'self' https://cdn.shopify.com;
    style-src 'self' 'unsafe-inline' https://cdn.shopify.com;
    img-src 'self' data: https://cdn.shopify.com;
    connect-src 'self' https://{shop};
  ```
- Build a CSP test: after setting up the embedded React page, open it in a real Shopify store (not dev tunnel), open browser devtools network tab, and check for CSP violation errors.
- The existing `shop` parameter injection into the CSP header (noted in CONCERNS.md) must be hardened to strict regex before adding more CSP directives — a CSP injection here affects the entire app security posture.

**Warning signs:** CSP header only has `frame-ancestors`. No `script-src` directive. Tested only via `shopify app dev` tunnel.

**Phase:** Phase 1 MVP (when React frontend is introduced).

---

### Pitfall 11: Shopify Billing API — Subscription Created But Merchant Redirected Away Before Acceptance

**What goes wrong:** The billing flow requires two steps: (1) create a `RecurringApplicationCharge` (REST) or `appSubscriptionCreate` (GraphQL), get a `confirmation_url`, and (2) redirect the merchant to that URL to accept. Developers create the charge but skip checking whether the merchant actually accepted it before provisioning access. If the merchant closes the tab or clicks "Decline," the app still works because the developer only checks "did a charge object exist" not "is the charge status `active`."

**Why it happens:** The confirmation_url redirect and post-acceptance callback are treated as guaranteed. Developers test only the happy path.

**Consequences:** Merchants use the app for free indefinitely. Shopify will not auto-enforce billing — that's entirely the app's responsibility.

**Prevention:**
- Always verify charge status via `GET /admin/api/recurring_application_charges/{id}.json` (status must be `active`) before granting full access.
- After the merchant is redirected back (via the `return_url` you set), query Shopify to confirm the charge status. Do not trust the `charge_id` in the return URL query param as proof of acceptance.
- Store the `charge_id` and `status` in the `ShopSession` table. Recheck status on each admin page load during the billing grace period.
- Implement a "billing gate" middleware: if shop is not on an active subscription after a trial period, redirect to a billing prompt page.

**Warning signs:** No `status` field on ShopSession. Charge status not verified on the return URL callback. Billing check only happens at install, never on subsequent page loads.

**Phase:** Billing feature phase (Phase 2 or whenever monetization is implemented).

---

### Pitfall 12: Shopify Billing API — Test Mode Charges Behave Differently Than Real Charges

**What goes wrong:** Development stores and test-mode charges return `status: 'active'` immediately without going through the confirmation flow. Real production charges require the merchant to confirm in the Shopify admin. Developers build and test the billing flow with `test: true` or in a development store, where everything "just works." In production, the confirmation redirect is a real page, takes merchant action, and the return URL timing is unpredictable.

**Why it happens:** Development-only testing is convenient. The test mode difference in UX is not obvious from the API response alone.

**Consequences:** Billing flow broken in production (redirect works, but the app doesn't handle the "declined" or "pending" state). Merchants either can't activate or get past the billing gate despite not completing payment.

**Prevention:**
- Test billing with a real (non-development) Shopify store using a test credit card before shipping.
- Handle all charge status values explicitly: `pending`, `active`, `declined`, `expired`, `frozen`, `cancelled`.
- Use the `app/subscriptions/update` webhook to receive real-time status changes rather than polling.
- Set `test: process.env.NODE_ENV !== 'production'` so test mode is not accidentally left on in production.

**Warning signs:** Billing tested only on development stores. No handling for `declined` or `pending` charge status. `test: true` hardcoded.

**Phase:** Billing feature phase.

---

### Pitfall 13: App Review Rejection — Accessing Scopes Beyond What the App Uses

**What goes wrong:** The existing `.toml` config requests 60+ scopes (noted in INTEGRATIONS.md). Shopify's app review process specifically rejects apps that request scopes not actively used. Reviewers check network traffic and database writes during review. Requesting `write_customers` or `read_analytics` for an app that only reads orders will trigger rejection.

**Why it happens:** Developers copy a maximal scope set from documentation/templates "just in case." It feels safer to have more access. Shopify's review became stricter about scope minimization after 2023.

**Consequences:** App review rejected. Rejection reason given but time to re-review adds 1-3 weeks delay. If scopes are trimmed, existing installations need to re-authorize (friction for merchants).

**Prevention:**
- Audit actual API endpoints used and request only those scopes. For Phase 1 MVP:
  - `read_orders` — order data
  - `read_products` — product/variant data for COGS mapping
  - `read_inventory` — optional, for inventory cost data if using Shopify's built-in cost field
  - `read_shipping` — if shipping cost sync is added
  - `read_finance` — for payouts/transactions (Shopify Balance)
  - No `write_*` scopes unless the app modifies Shopify data
- Document scope justification in the app submission notes (reviewers look at this).
- Never request `read_customers` or `read_customer_payment_methods` unless the app directly surfaces customer data.

**Warning signs:** `shopify.app.profit-tracker.toml` requests 60+ scopes. Scope list has `write_customers`, `read_analytics`, or other broad scopes unused by the profit dashboard feature set.

**Phase:** Pre-submission (before any app review submission). Scope list must be finalized before submission, not after rejection.

---

### Pitfall 14: GDPR Webhook Stubs Will Fail App Review

**What goes wrong:** The existing codebase (flagged in CONCERNS.md) has `customers/redact`, `customers/data_request`, and `shop/redact` as empty stubs that return 200 OK without doing anything. Shopify's app review process **tests these webhooks by sending real requests** and verifying that data deletion actually occurs. Stubs that return 200 but don't process the request will fail review.

**Why it happens:** These webhooks are required to register but are seen as boilerplate. Developers defer implementation. Shopify added automated testing of GDPR compliance in their review process.

**Consequences:** Guaranteed app review rejection. Also a legal/compliance issue if the app is ever audited.

**Prevention:**
- `customers/redact`: Delete or anonymize all stored data tied to a customer_id for the given shop. For Phase 1 MVP this means any COGS entries or custom notes associated with a customer if stored, plus any cached customer PII.
- `customers/data_request`: Return a structured log of all data held for the customer. Minimum viable: email a JSON export to the shop owner.
- `shop/redact`: Delete ALL data for the shop (called 48 hours after app uninstall). Must actually purge the `ShopSession`, all orders, all COGS entries, etc.
- Implement these before any app review submission. The `app/uninstalled` webhook handler already deletes `ShopSession` — extend it.

**Warning signs:** Webhook handlers return `res.sendStatus(200)` with no database operations. No `DELETE FROM ...` queries in webhook handlers.

**Phase:** Must be completed before any app review submission (Phase 1 or earlier).

---

## Moderate Pitfalls

---

### Pitfall 15: Shopify Payouts API — Payout Timing vs. Order Timing Mismatch

**What goes wrong:** A developer fetches Shopify payouts from the Balance API and tries to match them to individual orders for "exact fee reconciliation." Shopify payouts are batched (typically daily), net of fees across many orders, and do not map 1:1 to order IDs in the payout object. Trying to reconcile payouts to orders directly produces mismatches, negative fees, and confusing edge cases (orders paid out across two different payout periods).

**Why it happens:** The word "payout" feels like it should tie to "order" but it's an aggregate cash transfer, not a per-order reconciliation.

**Prevention:**
- Use payout data for "total cash received this period" verification and cashflow reporting only.
- Use order-level fee calculation (plan-based rates applied at order time) for per-order profit, not payout data.
- Treat payouts as a separate cash reconciliation feature, not as the source of truth for fees.

**Warning signs:** Code attempts to `JOIN` payout records to order records by amount or date.

**Phase:** Phase 1 MVP (payout sync feature).

---

### Pitfall 16: Order Financial Status vs. Fulfillment Status Confusion

**What goes wrong:** Developers filter on `fulfillment_status = 'fulfilled'` when calculating profit, missing orders that are paid but not fulfilled (pre-orders, digital goods, subscriptions). Or they include `financial_status = 'pending'` orders (unpaid) in profit totals, inflating revenue.

**Prevention:**
- Only include orders with `financial_status` in `['paid', 'partially_paid', 'partially_refunded', 'refunded']` for profit calculations.
- Fulfillment status should not gate profit inclusion — a paid-but-unfulfilled order still generated revenue and fees.
- Separately track "realized revenue" (paid) vs. "pending revenue" (authorized but not captured).

**Warning signs:** Profit query filters on `fulfillment_status`. Pending/authorized orders appear in profit totals.

**Phase:** Phase 1 MVP.

---

### Pitfall 17: React Build Artifacts Served From Express Without Proper Cache Headers

**What goes wrong:** When a React frontend is added to the Express app, the built assets (`bundle.js`, `main.css`) are served from a `/public` or `/dist` directory by Express. Without proper cache headers, Shopify's embedded iframe context re-fetches the entire bundle on every navigation, causing slow load times. With overly aggressive caching, merchants see stale UI after a deploy because their browser cached the old bundle hash.

**Prevention:**
- Use content-hash filenames for built assets (Vite and Webpack do this by default): `main.a3f8c2.js`.
- Serve `index.html` with `Cache-Control: no-store` (always fresh).
- Serve hashed asset files with `Cache-Control: public, max-age=31536000, immutable` (cache forever — the hash changes on deploy).
- In Express: `app.use('/assets', express.static('dist/assets', { maxAge: '1y', immutable: true }))`.

**Warning signs:** React build output filenames are not hashed. Express serves all static files with identical (or no) cache headers.

**Phase:** When React frontend is introduced (Phase 1 MVP).

---

### Pitfall 18: Shopify Admin Session Token Expiry Causing Silent 401s in SPA

**What goes wrong:** App Bridge session tokens (JWTs) expire after 60 seconds. A React component fetches data on mount, then the merchant leaves the tab open for 5 minutes. When the merchant interacts again, the next API call uses a stale token. The Express backend returns 401. The React component shows a blank/error state with no recovery mechanism. The merchant thinks the app crashed.

**Prevention:**
- Always call `shopify.idToken()` immediately before each API request — App Bridge will return a cached token or refresh it automatically.
- Do not cache the session token in React component state or local storage.
- Handle 401 responses from the Express backend by re-fetching a fresh token and retrying once before showing an error.

**Warning signs:** Session token fetched once on component mount and stored in `useState`. No retry logic on 401 responses.

**Phase:** When React frontend + API calls are introduced.

---

## Minor Pitfalls

---

### Pitfall 19: Shopify's `inventory_item.cost` Field Is Not COGS

**What goes wrong:** Shopify has a `cost` field on `inventory_items` (accessible via `GET /admin/api/inventory_items/{id}.json`). Developers assume this is what merchants use for COGS and skip building a COGS entry UI entirely. In practice, most merchants have never set this field, it represents landed cost (not fully-loaded COGS), and it's not variant-level accurate for most stores.

**Prevention:**
- Use `inventory_item.cost` as an optional default to pre-populate COGS fields in the UI, not as the sole source.
- Always let merchants override/correct the value.
- Document clearly: "We pre-filled this from your Shopify inventory cost. Adjust if this doesn't reflect your actual cost."

**Phase:** Phase 1 MVP (COGS entry UI).

---

### Pitfall 20: Shopify CLI `shopify app dev` Tunnel Creates a New URL on Every Start

**What goes wrong:** `shopify app dev` uses a random tunnel URL (Cloudflare or ngrok) by default. Every time the developer restarts, the tunnel URL changes. The `SHOPIFY_APP_URL` env var becomes stale, OAuth redirect URLs in the Partners dashboard become invalid, and the app stops working locally until manually updated.

**Prevention:**
- Use `--tunnel-url` with a fixed ngrok or Cloudflare tunnel (requires a paid ngrok account for reserved subdomains).
- Or: update `.env` and Partners dashboard redirect URLs automatically via `shopify app config push` after each URL change.
- Consider using a staging environment on Railway for integration testing rather than local tunnels.

**Phase:** Development workflow (applies throughout all phases).

---

### Pitfall 21: Forgetting That Shopify Draft Orders Are Included in the Orders Endpoint

**What goes wrong:** `GET /admin/api/orders.json` by default only returns open orders, but `status=any` (which is needed for historical profit) also returns draft orders. Draft orders are not real revenue. Including them in profit calculations inflates revenue significantly for stores that use drafts heavily.

**Prevention:**
- Filter out `source_name === 'draft_orders'` or check `order.draft_order_id !== null` when syncing.
- Alternatively, filter at the API level: only sync orders with `financial_status` in the paid states.

**Phase:** Phase 1 MVP (order sync).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Order sync (initial historical) | REST pagination cursor expiry; duplicate records | Use GraphQL Bulk Operations for initial sync; REST incremental for delta |
| Order sync (rate limits) | 429 errors on large stores | Sequential paging with header-based throttling; per-shop queues |
| Fee calculation | Plan-dependent rates hardcoded wrong | Fetch shop plan on install; store in ShopSession; config table for rate lookup |
| Refund handling | Fee model not adjusted for refunds | Separate refund adjustment model; test with partial refund scenarios |
| COGS data model | Product-level instead of variant-level | Schema must be `variant_id`-keyed from day 1 |
| COGS display | NULL COGS silently treated as $0 | Three-state model; coverage percentage banner |
| COGS history | Current COGS rewriting historical reports | Snapshot COGS at order sync time; time-series COGS table |
| React frontend intro | CSP missing `script-src`; blank screen | Update CSP directives; test in real embedded context |
| React API auth | App Bridge JWT not validated on backend | `requireAppBridgeAuth` middleware on all `/api/*` routes |
| Billing feature | Charge status not verified post-redirect | Query Shopify to confirm `active` status; billing gate middleware |
| App review submission | 60+ scopes in TOML; GDPR stubs | Trim to minimum required scopes; implement GDPR handlers before submission |
| Payout sync | Payout-to-order reconciliation attempt | Use payouts for cashflow only; use order-level rates for per-order profit |

---

## Sources

**Confidence levels applied:**

- Shopify REST/GraphQL rate limits, pagination mechanics, order/transaction object structure: HIGH — based on stable, well-documented Shopify API behavior (current as of API version 2025-10 used by this project)
- Fee structures by Shopify plan (transaction fees + processing rates): HIGH — publicly documented on Shopify's pricing page; these rates change very infrequently
- Refund fee behavior (processing fee recouped vs. not): MEDIUM — documented in Shopify Help Center; processor-specific behavior may vary
- App Bridge 4.x session token flow and CSP requirements: HIGH — App Bridge 4.x has been stable and its documentation is authoritative
- Billing API charge status flow: HIGH — well-documented and a common source of developer errors in Shopify community forums
- App review rejection patterns (GDPR stubs, scope over-requesting): HIGH — Shopify's review guidelines explicitly call these out; GDPR webhook testing confirmed in review documentation
- COGS historical snapshot requirement: MEDIUM — derived from general analytics/accounting best practices; not a Shopify-specific documented requirement but a clear correctness requirement
- `inventory_item.cost` limitations: HIGH — field exists and is documented; the "merchants don't use it" observation is MEDIUM (community knowledge)

**Note:** WebSearch and WebFetch were unavailable in this research session. All findings are drawn from training knowledge through August 2025 covering Shopify API documentation, developer community patterns, and common implementation pitfalls. Claims about Shopify fee rates and API behavior are based on documented, stable platform characteristics. Recommend verifying current fee tiers against Shopify's live pricing page before shipping fee calculation logic.
