# Project Research Summary

**Project:** Shopify Profit Analytics App — v2.0 Milestone
**Domain:** Shopify Embedded Analytics / Ad Platform Integration
**Researched:** 2026-03-18
**Confidence:** MEDIUM-HIGH overall

## Executive Summary

The v2.0 milestone adds five targeted features to a shipping v1.0 app: payout fee accuracy fix, a waterfall profit decomposition chart, margin alerts, Meta Ads integration, and Google Ads integration. Research confirms all five are achievable with minimal new dependencies — three new backend packages, no frontend package changes, and two new Prisma models handle the bulk of the data layer. The existing architecture (Node.js 16 / Express / Prisma 5 / React 18 + Recharts 3.8) supports every feature without structural changes. This is a feature-addition milestone, not a rewrite.

The recommended build order is driven by data quality dependencies. The payout fee fix must come first because every downstream feature — the waterfall chart's Fees bar, margin alert accuracy, and eventual ad attribution — relies on correct per-order fee data. Meta Ads should precede Google Ads because Meta OAuth is standard while Google requires a developer token with an external approval process that can take weeks. Margin alerts are architecturally independent and can be interleaved. The waterfall chart and Meta Ads integration are best positioned together because the chart's "ad spend step" is the visual payoff for the entire milestone.

Two architectural risks stand above all others. The Shopify Admin iframe prevents standard OAuth popup patterns — the solution is a top-level redirect (`window.top.location.href`) that is already proven in the v1.0 auth and billing confirmation flows. The Google Ads developer token has an external approval dependency that cannot be controlled with code; it must be applied for during the Meta Ads phase or it will block Phase 5 entirely. All remaining risks are code-level with clear, well-documented prevention strategies.

---

## Key Findings

### Recommended Stack

The v1.0 stack (Node 16.20.2, Express, Prisma 5, React 18 + Recharts 3.8) supports all v2.0 features without version upgrades. Three new backend packages are needed. One pre-coding compatibility check is mandatory: run `npm install google-auth-library@10 --dry-run` on Node 16.20.2 before writing any Google Ads code; if it fails, fall back to `^9.15.1`. No frontend dependency changes are needed — the waterfall chart uses existing Recharts `Bar` with `[low, high]` range tuples. Token encryption uses Node's built-in `crypto` module with AES-256-GCM — no new package.

**New backend dependencies:**
- `facebook-nodejs-business-sdk@^24.0.1`: Meta Marketing API — official Meta SDK, CommonJS-compatible, no declared Node minimum, wraps Graph API v22
- `google-ads-api@^23.0.0`: Google Ads GAQL queries — community-maintained by Opteo, Node 16 confirmed by maintainer, supports Google Ads API v19+; use REST transport fallback if gRPC native binary fails on Railway Docker
- `google-auth-library@^10.6.2`: Google OAuth2 token exchange and auto-refresh — official Google library; verify Node 16 compatibility before Phase 5

**No new frontend dependencies.** Recharts waterfall via existing range `Bar` pattern. Polaris Banner/Badge for alerts available via existing CDN load.

### Expected Features

Research covers v2.0 scope only — v1.0 features are already shipped. The five new features form a coherent unit: accurate fees feed the waterfall chart, the chart makes the P&L visible, alerts close the proactive loop, and ads integration brings the full cost picture into the same view.

**Must have (v2.0 launch):**
- Payout fee fix — exact Shopify Payments fees per order from `ShopifyPaymentsBalanceTransaction.fee`; "verified" vs. "estimated" indicator per order builds merchant trust
- Store-level waterfall chart — Revenue → COGS → Fees → Shipping → Net Profit using existing KPI data; zero new API calls
- Per-order waterfall chart — drill from existing OrdersTable row into per-order cost decomposition; all data already in DB
- Margin alerts (in-dashboard only) — configurable threshold per shop, banner + nav badge, always-on negative-margin alert; eligibility gate required (7 days + 3 orders + known COGS)
- Meta Ads account connection + total spend — account-level spend deducted from P&L; reaches competitive parity
- Meta campaign-level spend breakdown — incremental step after account-level; low cost, meaningful added value

**Should have (v2.1 — gated on external dependencies):**
- Google Ads integration — gated on developer token approval; start application during Phase 4
- Ad spend step in waterfall chart — the payoff visualization connecting ads to the P&L; deliver after ads integration ships
- Per-order Meta attribution via UTM — best-effort via `CustomerJourneySummary.firstVisit.utmParameters`; iOS privacy degrades coverage; label as estimated

**Defer (v3+):**
- Email margin alerts — requires new email sending infrastructure (Sendgrid/Postmark) not in current stack
- Payout reconciliation view — high complexity, accountant-niche at current price point
- SKU-level waterfall — validate per-order and store-level first
- True profit per campaign — requires UTM attribution working reliably first

### Architecture Approach

All five features integrate into the existing Express / Prisma / React architecture through targeted additions. The most architecturally significant decision is the third-party OAuth approach inside the Shopify Admin iframe: `window.top.location.href` top-level redirect is the only reliable pattern, and it is already the established approach in the v1.0 codebase for Shopify OAuth and billing confirmation.

**New and modified components:**
1. `lib/syncPayouts.js` (MODIFIED) — add `payout_status:PAID` filter; add diagnostic logging for live fee verification before writing any logic changes
2. `routes/ads-auth.js` (NEW) — Meta + Google OAuth initiation and callbacks; registered outside `/api/` (no JWT — these are top-level window routes, not embedded app routes)
3. `lib/syncAdSpend.js` (NEW) — daily campaign spend fetch for Meta and Google via platform dispatch on `AdConnection.platform`; idempotent upsert to `AdSpend` table
4. `lib/scheduler.js` (MODIFIED) — add `syncAdSpend` per-shop per cron tick, wrapped in per-shop try/catch so one shop failure does not abort others
5. `web/src/components/WaterfallChart.jsx` (NEW) — Recharts `ComposedChart` with server-computed `[low, high]` bar tuples from `GET /api/dashboard/orders/:orderId/waterfall`
6. `web/src/components/AlertBanner.jsx` (NEW) — dismissable banner; dismiss state in localStorage keyed by alert count + threshold; auto-resolves when margin recovers
7. `web/src/components/AdsOverview.jsx` (NEW) — connection status cards, Blended ROAS + True ROAS (clearly labeled), campaign spend table, daily spend/revenue trend via Recharts
8. `prisma/schema.prisma` (MODIFIED) — add `AdConnection` and `AdSpend` models; extend `ShopConfig` with alert threshold columns; extend `OAuthState` with `platform` discriminator

**Key architectural patterns:**
- Top-level OAuth redirect: `window.top.location.href = redirectUrl` to escape Shopify iframe; callback redirects back to `/admin?shop=...&view=ads`
- Platform dispatch: `syncAdSpend.js` handles Meta and Google via `platform` field on `AdConnection`; shared `AdSpend` schema avoids duplicating upsert logic
- Idempotent upsert: `AdSpend @@unique([shop, platform, campaignId, date])` — safe to re-run sync jobs without producing duplicates
- Graceful degradation: Ads tab shows "connect your account" empty state if no `AdConnection` exists; scheduler is a no-op for unconnected shops

### Critical Pitfalls

1. **Payout REFUND transactions must not overwrite fees** — only process `type === 'CHARGE'` rows from balance transactions. REFUND rows return `fee.amount = "0.00"` and would silently zero out stored fees for matched orders. Treat FEE-FIX-01 as a diagnostic-first task: add logging to inspect raw transaction types and fee amounts from a live Shopify Payments store before writing any changes.

2. **Meta/Google OAuth popup is blocked inside the Shopify Admin iframe** — `window.open()` fails due to iframe sandbox restrictions; the Shopify Admin shell intercepts popup navigation. Use `window.top.location.href` for all third-party OAuth. Test the complete connect flow inside the actual Shopify Admin iframe (not a standalone browser tab) and explicitly in Safari (stricter ITP than Chrome).

3. **Ad tokens must be encrypted at rest** — the existing `ShopSession` stores Shopify tokens plaintext. Reusing that pattern for Meta long-lived user tokens and Google refresh tokens is a security regression. Store all ad tokens with AES-256-GCM via a `lib/encrypt.js` utility. Add `ADS_ENCRYPTION_KEY` to Railway config before any token write code exists. Never revisit this decision — recovery after a plaintext compromise is expensive.

4. **Meta long-lived token expiry silently breaks spend sync** — Meta long-lived tokens expire after approximately 60 days. Store `tokenExpiresAt = NOW() + 55 days` at connection time; check before every sync job; surface a "reconnect required" banner (not `$0` spend) when expired. Do not swallow the 190 `OAuthException` error.

5. **Google developer token approval blocks Phase 5** — Google Ads API requires a developer token that starts at Test Account Access and needs manual Google review for production access. Apply during Phase 4. List "developer token at minimum Test Account Access confirmed" as a hard prerequisite before Phase 5 kickoff.

6. **Recharts waterfall breaks on negative net profit and null COGS** — the standard spacer-bar stacking approach fails when a segment is negative. Compute `[low, high]` tuples server-side in the API endpoint; the React component only renders. Test explicitly with: a loss order (negative net profit), a null-COGS order, and a partial refund order.

7. **Margin alert fatigue destroys the feature** — alerts that fire immediately before COGS is configured or on 1-2 order products cause merchants to disable the feature permanently. Require 7 days of history + 3 minimum orders + `cogsKnown = true` for any alert to fire. Alerts must auto-resolve when margin recovers above threshold.

---

## Implications for Roadmap

Based on combined research, five phases driven by data quality dependencies and architectural coupling.

### Phase 1: Payout Fee Accuracy Fix
**Rationale:** Data quality gate for everything downstream. The waterfall chart's Fees bar, margin alert thresholds, and ad attribution all build on fee data. Fixing fees first means no chart or alert built on wrong numbers. This is also the lowest-risk phase — no schema changes, no new packages, targeted modification of one existing file. Run diagnostics first, write code second.
**Delivers:** Exact per-order Shopify Payments fees stored in `OrderProfit.feesTotal`; verified vs. estimated status per order; payout sync status API endpoint for manual QA
**Addresses:** FEE-FIX-01; competitive differentiation on accuracy narrative vs. competitors using estimated rates
**Avoids:** Pitfall 1 (REFUND transaction fee writeback silently zeroing fees); `fee` vs `fees` field path ambiguity (verify against 2025-10 schema before touching write logic)
**Research flag:** No deeper research needed — Shopify GraphQL schema confirmed HIGH confidence. Run diagnostic logging on live Shopify Payments store as first implementation step, not last.

### Phase 2: Waterfall Chart
**Rationale:** No schema changes required — all data already exists in `OrderProfit`. High visual impact, low implementation risk. Delivering the chart before ads integration gives it independent value and establishes it as the visual foundation that the ad spend step will drop into later. Must follow Phase 1 so the Fees bar shows verified data, not estimates.
**Delivers:** Per-order waterfall chart (click-to-expand from OrdersTable); store-level waterfall on Overview; correct rendering for loss orders, null-COGS orders, and partial refunds
**Uses:** Existing Recharts 3.8 (already installed); new `GET /api/dashboard/orders/:orderId/waterfall` endpoint returning server-computed `[low, high]` tuples
**Implements:** `WaterfallChart.jsx`; `OrdersTable.jsx` row click handler
**Avoids:** Pitfall 6 (Recharts negative segment rendering via server-side tuple computation; frontend renders only); frontend-computed running totals (wrong for null COGS)
**Research flag:** No deeper research needed — Recharts range Bar pattern is confirmed with a working example. Server-side tuple endpoint is a pure read on existing data.

### Phase 3: Margin Alerts
**Rationale:** Independent of ads integration — can ship in any sequence after Phase 1. Requires a schema migration (extend `ShopConfig`) which can be batched with Phase 4 migration to reduce total migration count, or run standalone for faster delivery. High retention value at low implementation cost. Implement eligibility guards from day one — they are not optional polish.
**Delivers:** Configurable margin threshold per shop; `GET /api/alerts` + `PUT /api/alerts/config` endpoints; `AlertBanner.jsx` dismissable banner; nav badge count on Products tab; low-margin row highlighting in ProductsTable; threshold settings UI
**Addresses:** ALERT-01; proactive profit monitoring that surfaces problems without requiring the merchant to go looking
**Avoids:** Pitfall 7 (alert fatigue — eligibility gate: 7 days history + 3 orders minimum + cogsKnown = true); alerts that never auto-resolve (resolved alert clears when margin recovers)
**Research flag:** No deeper research needed — alert evaluation reuses the existing products `$queryRaw` pattern. Polaris Banner and Badge patterns are established.

### Phase 4: Ads Infrastructure + Meta Ads Integration
**Rationale:** Largest phase. Establishes the shared `AdConnection` + `AdSpend` schema, the `lib/encrypt.js` token utility, the `routes/ads-auth.js` OAuth flow, and the `lib/syncAdSpend.js` dispatch — all of which Google Ads reuses verbatim. Meta first because Standard Marketing API access tokens are non-expiring (simpler lifecycle than Google's refresh token flow). Apply for Google Ads developer token at Phase 4 kickoff — this is a mandatory parallel action.
**Delivers:** Meta Ads OAuth connect/disconnect flow using top-level redirect pattern; daily campaign spend sync; `AdsOverview.jsx` tab (connection status, Blended ROAS + True ROAS clearly labeled, campaign spend table, daily spend/revenue trend); ad spend line in P&L KPI cards
**Uses:** `facebook-nodejs-business-sdk@^24.0.1`; new `routes/ads-auth.js` and `lib/syncAdSpend.js`; `AdConnection` + `AdSpend` Prisma models; AES-256-GCM token encryption via Node built-in `crypto`
**Avoids:** Pitfall 2 (OAuth popup blocked in iframe — use `window.top.location.href`); Pitfall 3 (plaintext tokens — encrypt at rest from day one); Pitfall 4 (Meta token expiry — `tokenExpiresAt` in schema, reconnect banner on expiry); anti-pattern of client-side token exchange (all OAuth code exchanges server-side only in `routes/ads-auth.js`)
**Research flag:** Implementation should explicitly reference the existing `routes/auth.js` top-level redirect pattern before writing `routes/ads-auth.js` — the v1.0 code is the reference implementation. **Mandatory parallel action:** submit Google Ads developer token application at Phase 4 kickoff.

### Phase 5: Google Ads Integration
**Rationale:** Reuses all Phase 4 infrastructure — same `AdConnection`/`AdSpend` schema, same `syncAdSpend.js` dispatch extended with a Google handler, same `AdsOverview.jsx` extended with a Google connection card. No new schema migration. Developer token must be at minimum Test Account Access before Phase 5 begins; all development can proceed against test accounts with no code change needed when production access is approved.
**Delivers:** Google Ads OAuth connect/disconnect with refresh token flow; daily Google campaign spend sync with token auto-refresh before each call; Google spend line separate from Meta in P&L; campaign table extended with Google campaigns; correct micros-to-dollars conversion (`cost_micros / 1,000,000`)
**Uses:** `google-ads-api@^23.0.0`; `google-auth-library@^10.6.2`; GAQL campaign spend query; existing `AdsOverview.jsx` + `lib/syncAdSpend.js`
**Avoids:** Pitfall 5 (developer token delay — applied in Phase 4); Google account timezone normalization to UTC before storing in `AdSpend`; `login-customer-id` header for MCC/Manager accounts (required when merchant's account is under a Google Ads Manager account — omitting causes permission errors)
**Research flag:** Verify `google-auth-library@10` Node 16.20.2 compatibility before writing any code (`npm install google-auth-library@10 --dry-run`). Verify `google-ads-api@23` gRPC native binary compiles on Railway Docker. Both verifications take minutes and have documented fallbacks — run them at Phase 5 kickoff, not during development.

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** Waterfall Fees bar must show verified data. Shipping the chart before the fee fix means the most visible financial visualization displays estimated fees as exact — a merchant trust risk that undermines the accuracy narrative.
- **Phase 2 before Phase 4:** Establish the waterfall as an independent, functional visualization before adding the ad spend step. The chart has value without ads; ads have their best showcase once the chart exists.
- **Phase 3 flexible:** Margin alerts are independent of fees, waterfall, and ads. They can precede Phase 4 (as suggested for faster delivery) or be batched with Phase 4 to consolidate the database migration.
- **Phase 4 before Phase 5:** Meta OAuth establishes all shared infrastructure. Google adds one new platform handler to existing files. Never build Phase 5 in isolation from Phase 4.
- **Google developer token application during Phase 4:** The external approval timeline is the only item that cannot be controlled with code. Submitting at Phase 4 kickoff maximizes lead time for Phase 5. Development against test accounts proceeds regardless.

### Research Flags

Phases with standard, well-documented patterns (skip `/gsd:research-phase`):
- **Phase 1 (Payout Fee Fix):** Shopify GraphQL schema confirmed HIGH confidence. Pattern is a targeted filter change in one existing file. Diagnostic logging step is the implementation, not research.
- **Phase 2 (Waterfall Chart):** Recharts range Bar pattern is confirmed with a working official example. Server-side tuple endpoint is a pure read from existing `OrderProfit` data.
- **Phase 3 (Margin Alerts):** Polaris Banner/Badge patterns are established. Alert evaluation reuses the existing products aggregation query with an added threshold filter.

Phases requiring careful review at implementation start (not deep research, but verification steps):
- **Phase 4 (Meta Ads OAuth):** Read the existing `routes/auth.js` top-level redirect implementation before writing `routes/ads-auth.js`. The iframe OAuth constraint is fully understood but the implementation must mirror the proven pattern exactly.
- **Phase 5 (Google Ads):** Two pre-coding verifications required: `google-auth-library@10` Node 16 compatibility and `google-ads-api@23` gRPC binary compilation on Railway Docker. Both have documented fallbacks. Run at Phase 5 kickoff.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Meta SDK and Recharts waterfall confirmed HIGH. `google-auth-library@10` Node 16 compatibility is MEDIUM — requires live `--dry-run` verification. `google-ads-api` gRPC on Railway Docker is MEDIUM — REST fallback documented. |
| Features | MEDIUM-HIGH | Shopify GraphQL fields (`ShopifyPaymentsBalanceTransaction.fee`, `CustomerJourneySummary`) confirmed against official docs (HIGH). Competitor feature patterns from App Store listings (MEDIUM). Meta API attribution window changes confirmed against official changelog (MEDIUM-HIGH). |
| Architecture | HIGH | Existing codebase read directly. OAuth iframe constraint verified against Shopify developer community + official docs. Token lifecycle (Meta long-lived, Google refresh token) verified against official developer docs. Component map and data flows are fully specified. |
| Pitfalls | HIGH | All eight critical pitfalls verified against official sources, community threads, or direct code inspection. Recovery strategies specified. "Looks Done But Isn't" checklist provided in PITFALLS.md. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **`google-auth-library@10` Node 16 compatibility:** Run `npm install google-auth-library@10 --dry-run` on the actual Node 16.20.2 runtime before Phase 5 begins. Fallback: `^9.15.1`. Five-minute check, not a research gap.
- **`payout_status:PAID` filter syntax on `balanceTransactions`:** MEDIUM confidence — confirmed in Shopify community thread but not in official docs. The Phase 1 diagnostic logging approach resolves this empirically before any write logic is added.
- **Meta long-lived token non-expiring claim:** MEDIUM confidence from official Meta docs. Store `tokenExpiresAt = NOW() + 55 days` as a conservative defense regardless — if tokens are genuinely non-expiring for Standard Access, the expiry check path never fires but causes no harm.
- **Google Ads developer token approval timeline:** Uncontrollable external dependency. Mitigation is applying early (during Phase 4) and developing Phase 5 entirely against Test Account Access. No code change needed when production access is approved.
- **GDPR `shop/redact` handler must cover ad data:** The existing GDPR webhook handler must be extended in Phase 4 to delete `AdConnection` and `AdSpend` rows for the shop on `shop/redact`. Add to Phase 4 acceptance criteria — Shopify tests this during App Review.

---

## Sources

### Primary (HIGH confidence)
- [ShopifyPaymentsBalanceTransaction — Shopify GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction) — `fee` field, `associatedOrder`, transaction type filtering
- [New fees and net fields for balance transactions — Shopify Changelog 2025-04](https://shopify.dev/changelog/new-fees-and-net-fields-for-balance-transactions) — adjustment order edge case coverage
- [CustomerJourneySummary — Shopify GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest/objects/customerjourneysummary) — UTM attribution fields
- [Recharts Waterfall Example](https://recharts.github.io/en-US/examples/Waterfall/) — range Bar pattern confirmed working
- [facebook-nodejs-business-sdk GitHub](https://github.com/facebook/facebook-nodejs-business-sdk) — v24.0.1, CommonJS, no declared Node minimum
- [google-ads-api npm (Opteo)](https://www.npmjs.com/package/google-ads-api) — v23.0.0, Node 16 confirmed by maintainer
- [Google Ads API v20 announcement — Google Developer Blog, June 2025](https://ads-developers.googleblog.com/2025/06/announcing-v20-of-google-ads-api.html) — current API version, v19 sunset date
- [Google Ads API developer token update — Google Ads Developer Blog, Feb 2026](https://ads-developers.googleblog.com/2026/02/an-update-on-google-ads-api-developer.html) — approval delay acknowledgment
- [OAuth popup reclaim in Shopify Admin shell — Shopify Dev Community](https://community.shopify.dev/t/shopify-oauth-popup-cannot-auto-close-after-successful-install-when-initiated-from-admin-shopify-com-admin-shell-reclaiming-window/28862) — iframe OAuth constraint confirmed by Shopify engineering

### Secondary (MEDIUM confidence)
- [Meta Ads Attribution Window changes June 2025 — Windsor.ai](https://windsor.ai/documentation/facebook-ads-meta-api-updates-june-10-2025/) — unified attribution enforcement
- [Meta Ads Attribution Window Removed January 2026 — Dataslayer](https://www.dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026) — view-through window deprecation timeline
- [Balance Transactions filter by payout — Shopify Dev Community](https://community.shopify.dev/t/balance-transactions-by-payout-id/20934) — `payout_status:PAID` filter syntax (not in official docs)
- [Triple Whale Net Profit formula](https://triplewhale.readme.io/docs/net-profit) — competitor feature reference
- [GoProfit Smart Alerts — Shopify App Store](https://apps.shopify.com/go-profit) — competitor alert UX pattern
- [Margin Insight — Shopify App Store](https://apps.shopify.com/margininsight) — competitor alert UX pattern
- [Shopimize — Shopify App Store](https://apps.shopify.com/shopimize) — competitor negative margin alert pattern
- [Attribution mismatch Meta vs Shopify 2026](https://attribuly.com/blogs/shopify-attribution-mismatches-meta-vs-tiktok-2026/) — 20–30% Meta over-attribution estimate
- [Recharts negative values bar chart issue #1427](https://github.com/recharts/recharts/issues/1427) — negative segment rendering failure mode documented

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
