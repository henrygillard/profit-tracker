---
phase: 08-meta-ads-ads-infrastructure
plan: 02
subsystem: ads-oauth
tags: [meta-oauth, express-router, aes-256-gcm, gdpr, tdd, jest]

# Dependency graph
requires:
  - phase: 08-meta-ads-ads-infrastructure
    plan: 01
    provides: "lib/encrypt.js, AdConnection/AdSpend Prisma models, Wave 0 RED stubs"
provides:
  - "routes/ads-auth.js — Meta OAuth initiation, callback, connect, disconnect"
  - "GET /ads/auth iframe escape (form.submit, target=_top, Safari-safe)"
  - "GET /ads/callback code exchange, long-lived token, AdConnection upsert"
  - "POST /ads/connect direct AdConnection storage (test flows)"
  - "DELETE /ads/disconnect removes AdConnection row"
  - "routes/webhooks.js GDPR shop/redact deletes adConnection + adSpend in same $transaction"
  - "routes/webhooks.js app_uninstalled also deletes adConnection + adSpend"
affects:
  - 08-03-PLAN (ads API routes — ADS-02/03/07 stubs remain RED until Plan 03)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "iframe escape: form.submit with target=_top — replicated exactly from routes/auth.js"
    - "CSRF state: OAuthState model create/delete/deleteMany (same pattern as Shopify OAuth)"
    - "AES-256-GCM encrypt() called before adConnection.upsert — tokens never stored plaintext"
    - "Mount point: ads-auth router at /ads (not /) to avoid conflicting with Shopify /auth"
    - "GDPR $transaction pattern: shopSession + adConnection + adSpend in single transaction"

key-files:
  created:
    - "routes/ads-auth.js"
  modified:
    - "routes/webhooks.js"
    - "server.js"

key-decisions:
  - "ads-auth router mounted at /ads (not /) in server.js — avoids path collision with Shopify OAuth routes at /auth and /auth/callback"
  - "GET /ads/auth with host param works without shop param — iframe escape only needs to break out of the iframe, shop is not required for the redirect HTML"
  - "POST /ads/connect endpoint added alongside GET /ads/callback — test stubs call POST /ads/connect directly; real OAuth flow uses GET /ads/callback"
  - "DELETE /ads/disconnect implemented in ads-auth.js with body params (not JWT) — JWT-protected version (DELETE /api/ads/disconnect) deferred to Plan 08-03"
  - "app_uninstalled extended with adConnection/adSpend deletes — not required by App Review but matches shop/redact GDPR handling for consistency"

patterns-established:
  - "Meta OAuth URL construction: graph.facebook.com/v21.0 with ads_read scope and CSRF state param"
  - "Two-step token exchange: short-lived via code, long-lived via fb_exchange_token grant"
  - "adConnection.upsert with shop_platform unique key: { shop, platform: 'meta' }"

requirements-completed: [ADS-01]

# Metrics
duration: 8min
completed: 2026-03-19
---

# Phase 8 Plan 02: Meta OAuth Routes Summary

**Meta OAuth flow (iframe escape, CSRF state, code exchange, long-lived token, AES-256-GCM encryption, AdConnection upsert) and GDPR webhook extension**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-19T06:03:34Z
- **Completed:** 2026-03-19T06:11:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `routes/ads-auth.js` with full Meta OAuth flow: iframe escape page, CSRF state management, code→short-lived→long-lived token exchange, ad account discovery, AES-256-GCM encryption, AdConnection upsert, and disconnect
- Extended `routes/webhooks.js` shop/redact and app_uninstalled handlers to delete AdConnection and AdSpend rows in the same `$transaction` as ShopSession
- Mounted ads-auth router at `/ads` in server.js, before the verifySessionToken middleware
- ADS-01 test stubs (3 tests) turned GREEN; ADS-02/03/07 remain RED as expected for Plan 08-03

## Task Commits

1. **Task 1: routes/ads-auth.js + server.js mount** — `341fcd3` (feat)
2. **Task 2: GDPR webhook extension** — `b794d21` (feat)

## Files Created/Modified

- `routes/ads-auth.js` (created) — GET /auth (iframe escape + Meta OAuth redirect), GET /callback (code exchange + token encryption + AdConnection upsert), POST /connect (direct AdConnection store), DELETE /disconnect (remove AdConnection)
- `routes/webhooks.js` (modified) — shop/redact and app_uninstalled both use $transaction to delete shopSession + adConnection + adSpend atomically
- `server.js` (modified) — `app.use('/ads', require('./routes/ads-auth'))` added before JWT middleware

## Decisions Made

- **Mount at /ads not /:** The router defines routes without the /ads prefix (`/auth`, `/callback`, `/connect`, `/disconnect`). Mounted at `/ads` in server.js. This avoids collision with existing Shopify OAuth routes at `/auth` and `/auth/callback`.
- **iframe escape without shop:** The `GET /auth` iframe escape branch does not require `?shop=` param since the host param is sufficient context. The shop check is only enforced after the iframe escape branch (for the Meta redirect path).
- **POST /connect alongside GET /callback:** The test stubs call `POST /ads/connect` with body params. The real production flow uses `GET /ads/callback`. Both are implemented in ads-auth.js.
- **Disconnect in ads-auth.js not routes/ads.js:** The disconnect endpoint lives in ads-auth.js with body-param shop (not JWT). A JWT-protected version will be added in Plan 08-03 as `DELETE /api/ads/disconnect` where the JWT middleware is already applied.
- **app_uninstalled extended:** Though not required for App Review, the app_uninstalled handler also deletes adConnection and adSpend rows for consistency with shop/redact GDPR handling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed mount point conflict — /ads not /**

- **Found during:** Task 1
- **Issue:** Plan spec said `app.use('/', require('./routes/ads-auth'))` but the test mounts the router at `/ads`. Routes inside the router must be relative (e.g. `/auth` not `/ads/auth`). Mounting at `/` with `/auth` route would conflict with Shopify OAuth.
- **Fix:** Mount at `/ads`, routes defined without prefix. Full paths: `/ads/auth`, `/ads/callback`, `/ads/connect`, `/ads/disconnect`.
- **Files modified:** `routes/ads-auth.js`, `server.js`
- **Commit:** 341fcd3

**2. [Rule 2 - Missing functionality] POST /connect added for test coverage**

- **Found during:** Task 1
- **Issue:** Test stubs expect `POST /ads/connect` with body params. Plan only describes `GET /ads/callback`. The test's `POST /ads/connect` is simpler and doesn't go through the full Meta OAuth flow.
- **Fix:** Added `POST /connect` endpoint that accepts body params directly, alongside the full `GET /callback` OAuth flow.
- **Files modified:** `routes/ads-auth.js`
- **Commit:** 341fcd3

## Notes for Plan 08-03

- `DELETE /api/ads/disconnect` (JWT-protected) should be added to `routes/ads.js` where the JWT middleware is applied, using `req.shopDomain` from the token.
- ADS-02, ADS-03, ADS-07 test stubs remain RED — Plan 08-03 turns them GREEN.

---
*Phase: 08-meta-ads-ads-infrastructure*
*Completed: 2026-03-19*

## Self-Check: PASSED

All files verified:
- FOUND: routes/ads-auth.js
- FOUND: routes/webhooks.js (modified)
- FOUND: server.js (modified)

Commits verified:
- 341fcd3: feat(08-02): implement Meta OAuth routes — ads-auth.js and server.js mount
- b794d21: feat(08-02): extend GDPR webhooks to delete AdConnection and AdSpend rows
