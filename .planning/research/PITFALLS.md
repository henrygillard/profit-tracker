# Pitfalls Research

**Domain:** Shopify Embedded Profit Analytics App — v2.0 Feature Addition
**Researched:** 2026-03-18
**Confidence:** HIGH (Shopify Payments API, Recharts patterns, OAuth iframe restrictions), MEDIUM (Meta/Google attribution models, token lifecycle), LOW for nothing — all claims below are verified or explicitly flagged

---

## Critical Pitfalls

### Pitfall 1: Shopify Payments REFUND Transactions Must Not Write Back Fees

**What goes wrong:**
The existing `syncPayouts.js` correctly filters `type === 'CHARGE'` transactions only. The risk for the FEE-FIX-01 verification task is that a developer, while debugging fee accuracy, adds processing for REFUND-type balance transactions to "offset" fees on refunded orders. REFUND-type rows have a `fee.amount` of `"0.00"` — the original fee credit appears as a separate CREDIT-type entry, not as a negative amount on the REFUND row. Writing REFUND rows back sets `feesTotal = 0` for matched orders, silently corrupting profit data.

Additionally: balance transactions of type `SHOPIFY_COLLECTIVE_CREDIT`, `TAX_ADJUSTMENT_DEBIT`, and `TAX_ADJUSTMENT_CREDIT` return `null` for `associatedOrder`. These were confirmed as an API issue fixed in Shopify API version 2025-7. Apps using older API versions still see null here.

**Why it happens:**
The Shopify Help Center states "if you refund 50% of an order, you're credited with 50% of the transaction fee." Developers assume this credit appears on the REFUND balance transaction row. It does not. It appears as a separate CREDIT-type entry in a later payout cycle.

**How to avoid:**
Keep the `type === 'CHARGE'` guard unchanged. Treat FEE-FIX-01 as a diagnostic task first: add logging to inspect all transaction types, fee amounts, and `associatedOrder` nullability from a live Shopify Payments store before touching the write-back logic. The existing null guard on `associatedOrder` must remain. Verify the `transaction.fees` field path (the plural `fees` vs. singular `fee`) against the 2025-10 API schema — this was a flagged open question from v1.0.

**Warning signs:**
- `feesTotal` values drop to zero after a payout sync run
- Orders with partial refunds showing higher profit margin than before payout sync
- Developer adding `type === 'REFUND'` or removing the `type !== 'CHARGE'` guard

**Phase to address:**
FEE-FIX-01 (Payout fee verification). Run diagnostic logging on live data before writing any code changes.

---

### Pitfall 2: Meta/Google OAuth Popup Is Blocked Inside the Shopify Admin Iframe

**What goes wrong:**
The app runs embedded inside `admin.shopify.com` via iframe. When frontend code calls `window.open()` to launch a Meta or Google OAuth URL, browsers treat the call as a popup from a sandboxed iframe context and block it. Even when `window.open()` succeeds, the OAuth callback cannot reliably use `postMessage` back to the parent because `admin.shopify.com` is not the app's origin and controls the surrounding frame. The OAuth state hangs: the popup completes its server-side callback but the parent iframe has no mechanism to detect completion.

**Why it happens:**
Developers copy OAuth popup patterns from non-embedded web apps where `window.open()` + `postMessage` between same-origin windows works cleanly. Inside Shopify's admin iframe there are two additional restriction layers: browser popup blockers apply stricter heuristics to iframes, and the App Bridge shell may intercept navigation events.

**How to avoid:**
Use a server-side redirect flow: when the merchant clicks "Connect Meta Ads," use `window.top.location.href = oauthUrl` to escape the iframe entirely before starting the OAuth flow. The callback completes server-side, stores the token, and redirects back to the app URL (which Shopify then re-embeds). Do not attempt `window.open()` or postMessage-based popup close from within the iframe. Test explicitly in Safari — Safari's ITP applies stricter third-party restrictions that block behaviors Chrome allows.

**Warning signs:**
- "Popup blocked" errors in browser console during OAuth initiation
- OAuth window opens but app state does not update after callback completion
- Connect flow tested only in standalone browser tab, not inside Shopify admin iframe
- Safari not tested before shipping

**Phase to address:**
ADS-01 (Meta Ads OAuth). Establish this redirect pattern first. Reuse the same pattern for ADS-02 (Google Ads OAuth) — do not re-discover this issue independently.

---

### Pitfall 3: Ad Platform OAuth Tokens Stored Plaintext Following the ShopSession Pattern

**What goes wrong:**
The existing `ShopSession` model stores the Shopify `accessToken` as a plaintext `String`. Reusing this pattern for Meta long-lived user access tokens and Google OAuth refresh tokens is a meaningful security step down. These tokens represent persistent, scoped access to a merchant's ad account billing and campaign data. A database compromise exposes all connected merchants' ad accounts permanently.

**Why it happens:**
The existing Shopify token storage sets a precedent. Shopify's own access tokens are also plaintext, which normalizes the pattern. Time pressure during initial OAuth implementation leads developers to defer encryption as a "later hardening task" that never ships.

**How to avoid:**
Create separate models (`MetaAdConnection`, `GoogleAdConnection`) — do not extend `ShopSession`. Store tokens as `encryptedAccessToken` and `encryptedRefreshToken` columns with a symmetric AES-256-GCM encryption wrapper keyed by an `ENCRYPTION_KEY` environment variable. The encryption/decryption wrapper should be a single shared utility (`lib/encrypt.js`) so it is not reimplemented inconsistently. Add `ENCRYPTION_KEY` to Railway config before any token can be written.

**Warning signs:**
- New ad connection schema adds `accessToken String` columns mirroring ShopSession
- No `ENCRYPTION_KEY` environment variable in Railway config or `.env.example`
- Token column names do not carry an `encrypted_` prefix making the intent opaque

**Phase to address:**
ADS-01 (Meta Ads OAuth). Establish the encryption pattern before shipping the first ad token. Do not revisit for Google Ads — reuse the same utility.

---

### Pitfall 4: Meta Ads Attribution Window Mismatch Creates Apparent Double-Counting

**What goes wrong:**
Meta's Insights API default attribution window is 7-day click / 1-day view. A query for "spend attributed to conversions today" from Meta includes conversions from ad impressions up to 7 days prior. If the app joins Meta-reported conversions to Shopify order IDs expecting a 1:1 match, a single Shopify order can be credited to multiple campaigns simultaneously. Summing Meta-reported spend-per-conversion will overcount total ad spend versus what was actually billed to the ad account.

Meta changed the default attribution in June 2025: the Insights API now enforces unified attribution settings automatically, aligning more closely with Ads Manager. Querying without specifying `action_attribution_windows` may return different numbers than before June 2025.

**Why it happens:**
Developers pull campaign spend from Meta and also pull Meta's reported conversions, then try to reconcile the two against Shopify orders. Meta's "reported conversions" are not Shopify orders — they are Meta-attributed conversion events within the attribution window. The numbers do not reconcile 1:1 with Shopify order data.

**How to avoid:**
Use campaign-level total billed spend from Meta (the `spend` field in Insights), NOT Meta's reported conversion counts or ROAS. Store spend as `campaignSpend` aggregated to campaign + date. For per-order attribution, apportion daily campaign spend across orders placed that day using revenue-weighted distribution: `order_ad_cost = total_daily_campaign_spend * (order_revenue / total_daily_shopify_revenue)`. Never import Meta's `actions` or `purchase` conversion events as a proxy for Shopify orders. Document the attribution model in code comments and surface it in the UI ("Estimated ad cost using daily revenue-weighted apportionment").

**Warning signs:**
- Queries joining Meta `actions` (conversion events) directly to Shopify `order.id`
- Total attributed ad spend in the app exceeds the amount billed on the Meta ad account
- No `action_attribution_windows` parameter set on Insights API calls — relies on account default

**Phase to address:**
ADS-03 (Attribution model). Write the attribution design document before any code. Total attributed spend must be auditable against Meta billing.

---

### Pitfall 5: Google Ads Developer Token Approval Delay Blocks the Phase

**What goes wrong:**
The Google Ads API requires a developer token from a Google Ads Manager account. New applications start at Test Account Access (cannot reach production ad data) and require manual review by Google to reach Basic or Standard Access. As of February 2026, Google publicly acknowledged increased review delays due to application volume growth. A developer token application submitted at the start of the Google Ads implementation phase could take days to weeks to reach Basic Access, blocking the ability to test against any real merchant ad account.

**Why it happens:**
Developers treat the developer token as an implementation step to handle during the phase, not a blocking prerequisite. The Meta Ads API has no equivalent gating step (Advanced Access for production requires app review but development-mode access works immediately), leading developers to assume Google works the same way.

**How to avoid:**
Apply for the Google Ads API developer token before the Google Ads phase begins — the right time is during or immediately after the Meta Ads phase. Use Test Account Access for initial development: all data model work, OAuth flow, and spend-fetch logic can be built and tested against test accounts. The switch to production data requires no code change once Basic Access is approved. List "developer token at minimum Test Account Access confirmed" as a hard prerequisite in the ADS-02 phase definition.

**Warning signs:**
- Developer token application not submitted when ADS-02 phase kicks off
- No test Google Ads Manager account created
- Phase plan does not list developer token status as a prerequisite check

**Phase to address:**
Must be initiated during ADS-01 (Meta Ads phase) or earlier. ADS-02 phase should not begin without confirming the application is at least submitted.

---

### Pitfall 6: Meta Long-Lived Token Expiry Silently Breaks Spend Sync

**What goes wrong:**
Meta long-lived user access tokens expire after approximately 60 days. If the app does not implement token lifecycle tracking, merchants who connected their Meta account at launch will silently stop receiving spend data at day 60. The sync job will receive a 190 error (OAuthException — token expired or revoked). If this error is swallowed or logged without surfacing a reconnect prompt, merchants see stale or missing ad spend data with no explanation. They do not know their data stopped updating.

**Why it happens:**
The initial OAuth connect flow focuses on "make it work." Token lifecycle — expiry detection, proactive refresh, re-auth prompts — is deferred as polish. Token expiry at day 60 affects all early adopters simultaneously if no rotation was implemented.

**How to avoid:**
At token storage time, record `tokenExpiresAt = NOW() + 55 days` (5-day conservative buffer). The daily spend sync job checks `tokenExpiresAt` before making any API call and surfaces a "reconnect required" UI state when the token is within 7 days of expiry. Facebook's token debug endpoint can extend a non-expired long-lived token by re-exchanging it; implement proactive rotation in the daily sync job. For Google Ads, refresh tokens do not have a fixed expiry but can be revoked — detect 401/invalid_grant errors distinctly and surface a reconnect prompt.

**Warning signs:**
- No `tokenExpiresAt` column in the MetaAdConnection schema
- Sync job does not distinguish 190 (token expired) from other Meta API errors
- No UI state for "ad account disconnected — reconnect required"
- No reconnect flow tested after token invalidation

**Phase to address:**
ADS-01 (Meta Ads OAuth). Build token expiry tracking into the initial schema definition — not as a follow-up task. The reconnect prompt UI must ship with the initial connect flow.

---

### Pitfall 7: Recharts Waterfall Chart — Floating Bar Stacking Breaks with Negative Segments

**What goes wrong:**
Recharts has no native waterfall chart type. The standard workaround uses a BarChart with `stackId` and a transparent "spacer" bar to float each visible bar at the correct cumulative position. This approach breaks when a segment is negative (e.g., a net loss after all deductions): the stacking math places the visible bar at the wrong Y position because Recharts stacks from zero, not from the running total. The result is bars that appear to start from zero instead of floating above or below the previous bar's endpoint.

This app's waterfall represents: Revenue → minus COGS → minus Fees → minus Shipping → Net Profit. If Net Profit is negative (loss order), the terminal bar will render incorrectly without explicit handling.

Additionally: if `cogsTotal` is `null` (unknown COGS), the standard running-total calculation produces `NaN` for all subsequent bars, rendering the entire chart blank without an obvious error.

**Why it happens:**
Recharts waterfall examples in documentation and community tutorials use only positive-value examples. Developers implement the spacer-bar pattern, test with positive-margin orders, and ship without testing a loss order or an order with null COGS.

**How to avoid:**
Pre-compute waterfall segments server-side and return an explicit `[low, high]` tuple for each bar segment, not a running total. Use `Bar` with array data format: `[startValue, endValue]` instead of relying on stack accumulation. Color each bar based on sign: green for positive (revenue, profit), red for deductions (COGS, fees, shipping). For null COGS: render a placeholder bar with a distinct "COGS unknown" pattern and suppress the net profit bar entirely (consistent with the existing `cogsKnown` semantics already in the data model). Test explicitly with: a loss order, a zero-margin order, a partial refund order, and a null-COGS order.

**Warning signs:**
- Waterfall data computed in the frontend by accumulating running totals
- No test case for an order where `netProfit < 0`
- No test case for an order where `cogsTotal === null`
- Chart library updated without re-testing negative segment rendering

**Phase to address:**
CHART-01 (Waterfall chart). Compute the `[low, high]` tuple server-side in the API endpoint. Frontend only renders — no data transformation in the component.

---

### Pitfall 8: Margin Alerts That Fire Immediately Cause Alert Fatigue

**What goes wrong:**
A margin alert system that fires on day one of data ingestion floods merchants with alerts for every product below the threshold, most of which are there because COGS is not fully configured yet or because the sample size is too small (1-2 orders) to be statistically meaningful. Merchants dismiss all alerts, disable the feature, and never re-enable it. The alert value is permanently destroyed.

**Why it happens:**
Alert thresholds are simpler to implement without minimum order count guards or COGS coverage requirements. Developers test with a well-configured store where alerts make sense and never see the noise that a newly onboarded merchant experiences.

**How to avoid:**
Alert eligibility requires: (1) a minimum of 7 days of order history for the product, (2) a minimum of 3 orders in the period, and (3) `cogsKnown = true` for those orders (alerts on unknown-COGS products are meaningless noise). Alerts must auto-resolve when margin recovers above threshold — do not let the resolved alert list accumulate. Surface alerts with the actionable context: the margin percentage, the threshold, and the delta (e.g., "12% margin — 3 points below your 15% threshold"). Avoid email/push notifications for v2.0; in-app alerts only until the pattern proves useful.

**Warning signs:**
- Alert query has no minimum `orderCount` filter
- Alert query runs against orders with `cogsKnown = false`
- No `resolvedAt` column — alerts never automatically dismiss
- Alert fires on any product with margin below threshold regardless of data quality

**Phase to address:**
ALERT-01 (Margin alerts). Define the eligibility criteria before writing the alert query. Include auto-resolve logic in the initial implementation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store ad tokens plaintext following ShopSession pattern | Faster initial OAuth implementation | Any DB compromise exposes all merchants' ad accounts permanently | Never |
| Use Meta reported conversions instead of Meta billed spend | Simpler data join to Shopify orders | Double-counts spend, destroys profit accuracy, merchants lose trust | Never |
| Skip token expiry tracking on first OAuth ship | Ship connect flow faster | All early adopters' data silently stops updating at day 60 | Never |
| Poll Meta/Google spend API on every dashboard load | No caching layer required | Rate limit exhaustion at very first merchant with significant campaign count | Never |
| Compute waterfall segments in React component | Simpler API contract | Chart breaks on loss orders and null-COGS; frontend calculates financial data | Never |
| Alert on all products below threshold with no minimum order count | Alerts fire immediately | Alert fatigue; merchants disable alerts permanently within the first week | Never |
| Apply Google developer token application late | No pre-planning required | Blocks entire ADS-02 phase if application is under review | Never — apply during ADS-01 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Shopify Payments balanceTransactions | Processing REFUND or ADJUSTMENT types to offset fees | Only process CHARGE type; fee credits appear as separate CREDIT entries |
| Shopify Payments balanceTransactions | Not guarding `associatedOrder === null` | Skip rows with null associatedOrder — several transaction types return null by design |
| Shopify Payments balanceTransactions | Querying `fees` (plural) vs `fee` (singular) field | The GraphQL schema uses `fee { amount }` (singular) — verify against 2025-10 schema before FEE-FIX-01 |
| Meta Ads Insights API | Using `actions.purchase` conversion count as Shopify order proxy | Pull campaign `spend` only; never use Meta's conversion counts as order ground truth |
| Meta Ads Insights API | Not setting `action_attribution_windows` parameter | Since June 2025, Meta enforces unified attribution by default — specify the window explicitly to get consistent data |
| Meta Ads Insights API | Assuming API timezone is UTC | Meta data is in the ad account's configured timezone — normalize to UTC before joining Shopify `processedAt` |
| Meta OAuth in Shopify iframe | `window.open()` for OAuth popup | Use `window.top.location.href = oauthUrl` to escape iframe; complete flow as server-side redirect |
| Google Ads API | Missing `login-customer-id` header | Required when merchant's ad account is under a Manager (MCC) account; omitting it returns permission errors |
| Google Ads API | Using account-local timezone for date range queries | Google Ads reports in the account's timezone — align date ranges to match, then normalize to UTC for storage |
| Google Ads API | Expecting immediate production access | Test Account Access only — apply for Basic Access early; no code change required when approved |
| Meta token storage | Storing short-lived user token directly after OAuth callback | Exchange for long-lived token immediately on callback; store with `tokenExpiresAt` |
| CSP headers | Frontend calling `graph.facebook.com` or `googleads.googleapis.com` directly | All ad platform API calls go through backend routes; add `connect-src` only for the app's own backend origin |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching Meta Insights on every dashboard load | 429 rate limit errors; slow dashboard; throttle blocks lasting 60-300s | Sync spend to DB on a scheduled daily job; serve dashboard from DB cache | First merchant with >50 campaigns, first load |
| Syncing Meta Insights per order instead of per campaign-day | API call count scales with order volume | Aggregate by campaign + date in one API call; apportion mathematically to orders | Any store with >10 orders/day |
| Re-fetching all payout balance transactions from page 1 on every sync | Entire transaction history re-processed on each sync run | Store payout sync cursor (`lastSyncedAt`) in ShopConfig; use incremental fetches | Stores with 12+ months of transaction history (~5,000+ rows) |
| Running margin alert query on every page load | Dashboard latency grows with SKU count | Pre-compute alert state during order sync; serve from an alerts table | After ~200 SKUs with COGS configured |
| Computing waterfall chart data (running totals) in the React component | CPU spike on re-render; incorrect values on null COGS | Compute `[low, high]` tuples server-side; frontend renders only | Any order that has null cogsTotal |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing Meta/Google OAuth tokens plaintext in PostgreSQL | Full ad account access for all connected merchants if DB is compromised | AES-256-GCM encryption with `ENCRYPTION_KEY` env var; `encrypted_` prefix on column names |
| Frontend accepting `adAccountId` from the merchant without server-side ownership verification | Merchant can query another merchant's ad spend data | Server verifies the requesting shop owns the `adAccountId` before any ad platform API call |
| Forwarding Meta/Google API errors verbatim to the frontend | Error messages may expose internal account IDs, token fragments, or quota details | Log full errors server-side; return sanitized generic messages to frontend |
| Missing CSRF/state validation on third-party OAuth callbacks | State parameter forgery allows account linking hijack | Use the existing `OAuthState` model pattern (already in schema) for ALL third-party OAuth callbacks — Meta and Google — not just Shopify |
| Not scoping Meta/Google disconnect to the authenticated shop | CSRF attack could disconnect another merchant's ad account | Verify `req.shopDomain` (from JWT) matches the connection record's `shop` before any delete/disconnect operation |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No reconnect prompt when ad token is expired | Merchants see $0 ad spend and assume campaigns stopped; make wrong budget decisions | Show "Ad data disconnected — reconnect required" banner with a reconnect action; do not silently show zero |
| Showing alerts immediately on first week of data | Flood of alerts before baseline is established; merchants disable feature and never re-enable | Require 7-day history + 3 orders minimum before any alert fires |
| Fixed global margin threshold for all merchants | 5% threshold is meaningless for a 40% margin brand; 30% threshold is unreachable for commodity resellers | Default per-shop threshold (15% is a reasonable default) with easy per-product override |
| Showing Meta's reported ROAS alongside the app's profit margin in the same view | Merchants compare Meta's optimistic attribution to the app's conservative calculation and conclude the app is wrong | Never show Meta-reported ROAS in the same row as the app's profit figure; keep them in separate clearly-labeled sections with attribution model explanation |
| Waterfall chart with unlabeled segment bars | Merchants cannot tell which bar represents COGS vs. fees vs. shipping | Every waterfall segment requires a label, a value, and a color that maps to a legend; negative segments should be visually distinct (red) |
| Margin alerts that never auto-dismiss | Alert list grows indefinitely; becomes visual noise; merchants stop checking | Alerts auto-resolve when margin recovers above threshold; display "resolved" state briefly, then remove |

---

## "Looks Done But Isn't" Checklist

- [ ] **Payout fee fix:** Diagnostic log has been run against a live Shopify Payments store and raw transaction types, fee amounts, and `associatedOrder` nullability have been inspected — not just code logic reviewed
- [ ] **Payout fee fix:** `transaction.fee { amount }` field path verified against 2025-10 API schema (distinct from the 2025-04 `fees` and `net` fields added in the changelog) on a real query response
- [ ] **Meta OAuth:** Connect flow tested inside actual Shopify Admin iframe (not standalone browser tab)
- [ ] **Meta OAuth:** Tested in Safari — Safari's ITP may block behaviors that work in Chrome
- [ ] **Meta OAuth:** `tokenExpiresAt` column present in MetaAdConnection schema AND checked before every sync job run
- [ ] **Meta OAuth:** Reconnect prompt renders correctly when token is expired (tested by manually expiring/revoking a test token)
- [ ] **Google OAuth:** Developer token applied for before ADS-02 phase starts; Test Account Access confirmed
- [ ] **Google OAuth:** `login-customer-id` header included in requests to client accounts under a manager account
- [ ] **Ad spend attribution:** Attribution model decision documented in code comments; attribution window configured explicitly, not relying on Meta/Google account default
- [ ] **Ad spend attribution:** Timezone of Meta/Google spend data normalized to UTC before any join with Shopify `processedAt`
- [ ] **Ad spend attribution:** Total attributed spend auditable against Meta/Google billing totals for the same period (within rounding)
- [ ] **Margin alerts:** Alert eligibility query filters out: orders with `cogsKnown = false`, products with fewer than 3 orders, products with fewer than 7 days of history
- [ ] **Margin alerts:** Auto-resolve works — an alert that was firing dismisses when margin recovers above threshold
- [ ] **Waterfall chart:** Tested with a loss order (negative net profit) — bars render correctly
- [ ] **Waterfall chart:** Tested with an order where `cogsTotal === null` — chart shows a placeholder segment, not NaN bars
- [ ] **Waterfall chart:** Tested with a partial refund order — revenue segment reflects `revenueNet` (post-refund), not gross
- [ ] **All new ad API routes:** `req.shopDomain` (from JWT) verified as owner of the `adAccountId` before any ad platform data is returned

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Fee data corrupted by REFUND transaction writeback | MEDIUM | Re-run `syncPayouts` with CHARGE-only filter — all `feesTotal` values overwrite idempotently; no manual data correction needed |
| Ad tokens stored plaintext discovered post-ship | HIGH | Add encryption migration: read all existing tokens, encrypt, re-write; rotate `ENCRYPTION_KEY`; ask merchants to reconnect as a precaution (can use token validity check to determine urgency) |
| Meta tokens expired for all early adopters simultaneously | MEDIUM | Deploy reconnect banner; tokens can be refreshed without full re-auth if not past hard expiry; triage by `tokenExpiresAt` and prompt batches |
| Google developer token stuck at Test Account Access | LOW-MEDIUM | All development work on test accounts continues; production data simply not yet accessible; no code change required when approved |
| Attribution model causes visible spend overcount; merchants complain | HIGH | Document and disclose the attribution model with a prominent label ("estimated — daily revenue-weighted apportionment"); offer campaign-level total spend view as a simpler alternative |
| Alert fatigue — merchants have disabled alerts | MEDIUM | Add eligibility guards and frequency caps; re-enable with a "your alerts have been tuned — here's what changed" in-app message |
| Waterfall chart renders incorrectly for loss orders | LOW | Server-side `[low, high]` tuple fix deployed; no data migration needed; chart renders from server-computed values |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| REFUND transaction fee writeback | FEE-FIX-01 | Diagnostic log reviewed on live store; only CHARGE type rows produce non-zero fees |
| `associatedOrder` null not guarded | FEE-FIX-01 | Unit test: mock data with null-associatedOrder rows skipped without error |
| `fee` vs `fees` field path ambiguity | FEE-FIX-01 | Live API query response inspected; field name confirmed against 2025-10 schema |
| OAuth popup blocked in iframe | ADS-01 (Meta OAuth) | Connect flow tested inside actual Shopify Admin iframe; tested in Safari |
| Ad tokens stored plaintext | ADS-01 (Meta OAuth) | Schema review: `encryptedAccessToken` column present; `ENCRYPTION_KEY` in Railway config |
| Meta attribution window double-counting | ADS-03 (Attribution model) | Attribution model documented before code; total attributed spend audited against billed amount |
| Google developer token approval delay | Pre-ADS-02 (apply during ADS-01) | Developer token status confirmed as prerequisite before ADS-02 kickoff |
| Meta token expiry silent failure | ADS-01 (Meta OAuth) | `tokenExpiresAt` in schema; sync test with expired token mock returns reconnect state |
| Google timezone mismatch in spend data | ADS-02 (Google Ads OAuth) | Date range queries use account timezone; stored values normalized to UTC |
| Alert fatigue from immediate firing | ALERT-01 (Margin alerts) | Eligibility criteria (7 days, 3 orders, cogsKnown) verified in alert query |
| Alerts never auto-dismiss | ALERT-01 (Margin alerts) | Resolved alert disappears after margin recovery — tested manually |
| Waterfall NaN on null COGS | CHART-01 (Waterfall chart) | Test fixture with `cogsTotal: null` renders placeholder bar, not NaN |
| Waterfall incorrect for loss orders | CHART-01 (Waterfall chart) | Test fixture with negative net profit renders bars at correct Y positions |
| CSP blocks ad platform calls from frontend | ADS-01 + ADS-02 | Grep for `graph.facebook.com` or `googleads.googleapis.com` in frontend code confirms zero direct calls |

---

## Carried-Forward Pitfalls from v1.0 (Still Relevant)

These pitfalls were identified and largely addressed in v1.0. They remain relevant if features touch their surface area.

| Pitfall | v1.0 Status | v2.0 Risk |
|---------|-------------|-----------|
| REST pagination cursor expiry on historical sync | Mitigated — using GraphQL Bulk Operations | Low — no new historical syncs planned |
| REST 429 rate limits on large stores | Mitigated — incremental sync with header-based throttling | Medium — ad spend sync adds new API call volume |
| Third-party fee rate hardcoded (plan not detected) | Fixed — plan stored in ShopConfig | Low — fee engine already handles this |
| REFUND fee model not adjusted | Partially mitigated — proportional COGS adjustment exists | Medium — FEE-FIX-01 may surface edge cases |
| NULL COGS silently treated as zero | Fixed — null propagation throughout data model | Low — waterfall chart must respect this (CHART-01) |
| COGS time-series not snapshot | Fixed — insert-only ProductCost table | Low — no change to COGS model planned |
| App Bridge JWT not validated on backend | Fixed — `verifySessionToken` middleware on all `/api/*` routes | Low — new routes must use the same middleware |
| CSP `frame-ancestors` breaking with new scripts | Mitigated — CSP set correctly | Medium — Meta/Google OAuth redirect changes the frame navigation pattern |
| GDPR webhook stubs | Fixed — real DB operations implemented in v1.0 | Low — ad connection data must be included in `shop/redact` handler |

---

## Sources

- [ShopifyPaymentsBalanceTransaction — GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction)
- [New fees and net fields for balance transactions — Shopify Developer Changelog (2025-04)](https://shopify.dev/changelog/new-fees-and-net-fields-for-balance-transactions)
- [associatedOrder null for SHOPIFY_COLLECTIVE_CREDIT — Shopify Dev Community](https://community.shopify.dev/t/graphql-balancetransactions-associatedorder-is-null-for-shopify-collective-credit-type-despite-ui-showing-order-link/13734) — fix shipped API 2025-7
- [Set up embedded app authorization — Shopify.dev](https://shopify.dev/docs/apps/build/authentication-authorization/set-embedded-app-authorization?extension=javascript)
- [Set up iframe protection — Shopify.dev](https://shopify.dev/docs/apps/build/security/set-up-iframe-protection)
- [Marketing API Rate Limiting — Meta for Developers](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/)
- [Access Token Guide — Meta for Developers](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/)
- [Meta Ads Attribution Window changes June 2025 — Windsor.ai](https://windsor.ai/documentation/facebook-ads-meta-api-updates-june-10-2025/)
- [Meta Ads Attribution Window Removed January 2026 — Dataslayer](https://www.dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026)
- [Currency Mismatch Warning in Meta Conversion API — Elevar](https://docs.getelevar.com/docs/currency-mismatch-warning-in-facebook-conversion-api-capi)
- [Rate Limits — Google Ads API](https://developers.google.com/google-ads/api/docs/productionize/rate-limits)
- [Developer Token — Google Ads API](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)
- [Google Ads API developer token access applications update — Google Ads Developer Blog, Feb 2026](https://ads-developers.googleblog.com/2026/02/an-update-on-google-ads-api-developer.html)
- [OAuth 2.0 for Google Ads API — Google for Developers](https://developers.google.com/google-ads/api/docs/oauth/overview)
- [Upcoming security changes to Google OAuth in embedded webviews — Google Developers Blog](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/)
- [Recharts waterfall chart issue #2267](https://github.com/recharts/recharts/issues/2267)
- [Recharts native waterfall support feature request #7010](https://github.com/recharts/recharts/issues/7010)
- [Recharts negative values bar chart issue #1427](https://github.com/recharts/recharts/issues/1427)
- [Recharts waterfall tutorial — 2359media/Medium](https://medium.com/2359media/tutorial-how-to-create-a-waterfall-chart-in-recharts-15a0e980d4b)

---
*Pitfalls research for: Shopify Embedded Profit Analytics App — v2.0 payout fee fix, waterfall chart, margin alerts, Meta Ads OAuth, Google Ads OAuth, ad spend attribution*
*Researched: 2026-03-18*
