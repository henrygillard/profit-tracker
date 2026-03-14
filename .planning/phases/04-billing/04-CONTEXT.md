# Phase 4: Billing - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Charge merchants $29/month via the Shopify Billing API before granting access to the profit dashboard. The billing gate must enforce access before any dashboard data is visible. The app must be ready for App Store submission after this phase.

</domain>

<decisions>
## Implementation Decisions

### Trial period
- 7-day free trial via Shopify Billing API `trialDays: 7`
- Full dashboard access during the trial — no feature restrictions
- Silent trial — no in-app countdown banner or indicator
- After trial ends without subscription approval, merchant loses access and hits the billing gate

### Billing gate UX
- Unsubscribed merchants are redirected directly to Shopify's native billing approval page — no interstitial page in between
- After approving the subscription, merchant lands directly on the profit dashboard (return URL = `/admin`)
- If merchant declines (hits Cancel on Shopify's page), return them to the same billing gate — they see the redirect again on next visit

### Subscription status tracking
- Add `billingStatus` field to `ShopSession` model (values: `ACTIVE`, `INACTIVE`, or null for legacy/new shops before billing is checked)
- Billing check occurs on every `/admin` page load — if `billingStatus` is not `ACTIVE`, redirect to Shopify billing approval
- `/api` routes also gated — return 402 if `billingStatus` is not `ACTIVE` (belt-and-suspenders, prevents API calls bypassing the UI gate)

### Cancellation detection
- Subscribe to `app_subscriptions/update` Shopify webhook — fires on cancellation and expiration
- On webhook receipt: flip `billingStatus` to `INACTIVE` in DB (no data deletion)
- Merchant data is never deleted on cancellation — re-subscribing flips `billingStatus` back to `ACTIVE` and restores full history automatically

### Claude's Discretion
- Exact Shopify Billing API GraphQL mutation to create the subscription
- How to store the `subscriptionId` (for webhook correlation)
- Webhook HMAC verification approach (consistent with existing webhook pattern in `routes/webhooks.js`)
- Whether to create a `routes/billing.js` or add to existing routes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/prisma.js`: Prisma singleton — extend `ShopSession` model with `billingStatus` and `subscriptionId` fields
- `routes/webhooks.js`: Existing webhook handler pattern (HMAC verification + Prisma update) — `app_subscriptions/update` handler follows the same pattern as `app_uninstalled`
- `lib/verifySessionToken.js`: JWT middleware already gates `/api` — billing check can be added here to return 402 when `billingStatus !== ACTIVE`
- `lib/shopifyClient.js`: Existing Shopify API client — Billing API GraphQL mutation can use the same access token fetch pattern

### Established Patterns
- HMAC verification: `routes/webhooks.js` lines 6–12 — same pattern for billing webhook
- Session lookup: `ShopSession` by shop domain — billing status check follows same lookup
- OAuth callback: `routes/auth.js` — billing subscription creation triggered here after successful token exchange (existing install hook point)
- Env validation: `server.js` startup check — no new env vars needed (Billing API uses existing access token)

### Integration Points
- `server.js` `/admin` route: Add billing check before serving the SPA — if not ACTIVE, redirect to Shopify subscription approval URL
- `routes/auth.js` OAuth callback: After storing session, create recurring application charge via Billing API and redirect to confirmation URL instead of `/admin`
- `routes/webhooks.js`: Add `app_subscriptions/update` handler to update `billingStatus` on cancellation
- `lib/verifySessionToken.js`: Add billing gate — 402 response if shop's `billingStatus !== ACTIVE`
- `prisma/schema.prisma`: Add `billingStatus String?` and `subscriptionId String?` to `ShopSession`

</code_context>

<specifics>
## Specific Ideas

- The return URL for billing approval should route back to `/admin` so approved merchants land directly on the dashboard without extra steps
- Declined billing should loop — just re-trigger the subscription redirect on the next `/admin` visit, no special "you declined" page needed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-billing*
*Context gathered: 2026-03-14*
