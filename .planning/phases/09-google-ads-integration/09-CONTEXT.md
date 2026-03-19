# Phase 9: Google Ads Integration - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Merchants can connect their Google Ads account alongside Meta, see Google spend as a separate P&L KPI line, and view Google campaigns alongside Meta campaigns in the Ads view. All Phase 8 infrastructure (AdConnection/AdSpend schema, lib/encrypt.js, scheduler) is reused — this phase adds the Google OAuth flow, GAQL sync, and frontend extensions only.

</domain>

<decisions>
## Implementation Decisions

### Google Ads API Client
- REST approach from day 1 — do NOT use `google-ads-api` npm package (gRPC native binary may not compile on Railway Docker + Node 16)
- Use `google-auth-library` for OAuth2 and token refresh: try v10 first (`npm install google-auth-library@10 --dry-run`), fallback to `^9.15.1` if Node 16 fails — make this the first task in the plan
- GAQL requests go to Google's REST endpoint (`https://googleads.googleapis.com/v18/...`) with `google-auth-library` for auth
- 90-day lookback window (same as Meta sync) — consistent `syncAdSpend.js` logic
- Token expiry: log error + delete AdConnection row (mark disconnected) — same pattern as Meta error code 190. Merchant must reconnect. No retry, no silent failure.

### OAuth Route Architecture
- New file: `routes/google-ads-auth.js` mounted at `/google-ads` in server.js (not extending `ads-auth.js` — Google OAuth is meaningfully different from Meta)
- Google OAuth params: `access_type=offline&prompt=consent` required to get a refresh token
- Developer token env var: `GOOGLE_ADS_DEVELOPER_TOKEN` (required header on every GAQL request — not part of merchant OAuth)
- Account selection: after OAuth, list accessible customer IDs via Google Ads API and auto-select the first non-manager account. Store as `accountId` in AdConnection. Merchant can reconnect to change.
- CSRF state: reuse existing `OAuthState` Prisma table (same pattern as Meta)
- GDPR: extend `shop/redact` webhook handler to delete `AdConnection` and `AdSpend` rows where `platform='google'` (App Review compliance — same extension as Phase 8 did for Meta)

### KPI Card Layout
- 6th KPI card: "Google Ads Spend" — separate from existing "Ad Spend" (Meta) card, only visible when Google is connected (`googleAdSpend: null` = card hidden)
- Overview endpoint (`/api/overview`) returns separate fields: `{ metaAdSpend, googleAdSpend, totalAdSpend }` — net profit deducts `totalAdSpend`
  - `metaAdSpend: null` = no Meta connection; `number (incl. 0)` = connected (existing behavior)
  - `googleAdSpend: null` = no Google connection; `number (incl. 0)` = connected (new field)
  - `totalAdSpend` = sum of connected platform spend values
- Waterfall chart: single combined "Ad Spend" step = `totalAdSpend` (Meta + Google). No separate steps per platform. Platform breakdown is in the campaign table. WaterfallChart.jsx requires no structural changes.
- Blended ROAS (ADS-07): update to use `totalAdSpend` as denominator — true blended ROAS across all connected platforms

### Disconnect Endpoint Design
- Extend `DELETE /api/ads/disconnect` with query param: `?platform=meta|google` — minimal change to existing Meta code and frontend
- Default behavior (no platform param): return 400 requiring explicit platform
- Connect/disconnect controls: in AdsView alongside Meta connection card — not in Settings. Both platforms managed in one place.
- `syncAdSpend.js`: add Google branch alongside existing Meta branch (as Phase 8 comments anticipated)

### Claude's Discretion
- GAQL query structure for campaign spend (fields, date range params, micros conversion)
- Exact auto-select logic for customer ID (which API call, how to filter manager accounts)
- Error handling details within the sync function beyond the token-expiry pattern
- iframe escape HTML in google-ads-auth.js (reuse exact pattern from ads-auth.js)

</decisions>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — standard approach throughout
- The `platform` field on `AdConnection` and `AdSpend` already stores `'google'` — schema requires no migration

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/encrypt.js` (AES-256-GCM): stores Google refresh token encrypted — same `encrypt(token)` / `decrypt(encToken)` call pattern
- `lib/syncAdSpend.js`: add Google branch after `if (platform !== 'meta') throw` — replace that guard with a switch/if-else covering both platforms
- `routes/ads-auth.js`: copy iframe escape HTML pattern (lines ~15-40) verbatim into `google-ads-auth.js` — same form.submit + target=_top approach
- `routes/ads.js` `DELETE /disconnect`: add `?platform=` query param check; replace hardcoded `platform: 'meta'` with `req.query.platform`
- `prisma/schema.prisma` `OAuthState`: reuse for Google CSRF state (same table, same cleanup pattern)
- `lib/scheduler.js`: add Google sync alongside Meta sync call (same every-6-hour cadence)

### Established Patterns
- Token expiry (Meta error 190): log + early return in `syncAdSpend` — Google uses same pattern (401/UNAUTHENTICATED)
- Iframe escape: form.submit with target=_top (google-ads-auth.js copies ads-auth.js approach)
- adSpend null/number distinction: null = not connected, 0+ = connected (extend to googleAdSpend field in overview)
- `pt-kpi-grid` auto-fit layout already accommodates variable card count — 6th card adds naturally

### Integration Points
- `server.js`: mount `google-ads-auth.js` at `/google-ads` (before verifySessionToken, same as `/ads`)
- `routes/api.js` `/overview`: extend adSpend query from `platform: 'meta'` to query both platforms separately; return `metaAdSpend`, `googleAdSpend`, `totalAdSpend`
- `routes/ads.js`: extend `DELETE /disconnect` to accept `?platform=` param
- `routes/webhooks.js` `shop/redact`: add `deleteMany({ where: { shop, platform: 'google' } })` for AdConnection + AdSpend
- `web/src/AdsView.jsx`: add Google connection card alongside Meta card; pass `platform` param to disconnect call
- `web/src/App.jsx` or `Overview.jsx`: consume `googleAdSpend` from overview response; pass to new KPI card

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-google-ads-integration*
*Context gathered: 2026-03-19*
