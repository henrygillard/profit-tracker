# Phase 8: Meta Ads + Ads Infrastructure — Research

**Researched:** 2026-03-19
**Domain:** Meta Marketing API (OAuth, Ads Insights), token encryption (AES-256-GCM), Prisma schema extension, Express route patterns, React frontend integration
**Confidence:** HIGH for API mechanics and architecture; MEDIUM for Meta app review timing (external process)

---

## Summary

Phase 8 introduces the first external OAuth integration into this project. It has five concerns that must each be solved correctly: (1) Meta OAuth from within the Shopify embedded iframe without popups and without breaking Safari; (2) secure at-rest storage of Meta user tokens using AES-256-GCM encryption; (3) Ads Insights API calls to pull total spend and per-campaign breakdown; (4) a scheduled background sync that reuses the existing `node-cron` pattern; and (5) frontend wiring of the Ads view, the Ad Spend KPI card, and the CHART-05 waterfall step.

The iframe challenge is the trickiest non-obvious part. Meta's OAuth dialog uses `X-Frame-Options: DENY` and cannot load inside the Shopify admin iframe. The same `form.submit / target="_top"` escape-hatch pattern already implemented in `routes/auth.js` for Shopify OAuth applies here: the `/ads/auth` route detects the embedded context and renders a tiny HTML page that submits a form to the top-level window, breaking out of the iframe before initiating the Meta OAuth redirect. The Meta callback lands at top-level (outside the iframe), exchanges the code, encrypts and stores the token, then redirects the merchant back to the app. This is the only popup-free, Safari-safe path.

Token encryption must be in place (`ADS_ENCRYPTION_KEY` environment variable) before any write code exists. The encryption module (`lib/encrypt.js`) is a standalone utility using Node's built-in `crypto` module — no new npm packages required. The Prisma schema gains two new models: `AdConnection` (one row per shop+platform storing the encrypted token and account IDs) and `AdSpend` (daily-granularity cache rows per shop+platform+campaign). The sync function (`lib/syncAdSpend.js`) is designed as the Phase 8 Meta implementation that Phase 9 will extend for Google Ads without schema changes.

**Primary recommendation:** Four plans — (1) schema + encryption + Wave 0 TDD stubs; (2) OAuth routes + token storage + GDPR extension; (3) Insights sync + scheduler extension + API endpoints; (4) frontend Ads view + KPI card + waterfall step.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADS-01 | Merchant can connect Meta Ads account via OAuth (`ads_read` scope) and disconnect from settings — works in Shopify Admin iframe and Safari without popups | Top-level redirect via `form.submit target="_top"` (same pattern as `routes/auth.js` line 81–99); OAuth state stored in `OAuthState` table with 10-minute TTL; callback exchanges code for long-lived token (Marketing API standard access tokens don't expire); token encrypted before DB write |
| ADS-02 | Total Meta ad spend for date range shown as "Ad Spend" KPI card and deducted from net profit | `/api/ads/spend?from=&to=` aggregates `AdSpend` rows for shop; Overview KPI grid gains a 5th card; dashboard overview endpoint extended with `adSpend` field when `AdConnection` exists |
| ADS-03 | Per-campaign spend breakdown table showing campaign name and spend | `AdSpend` table stores `campaignId`, `campaignName`, `spend` per day; `/api/ads/campaigns?from=&to=` aggregates by campaign; `AdsView` component renders campaign table |
| ADS-07 | Ads view displays Blended ROAS (total Shopify revenue / total ad spend) for selected date range — labeled "Blended ROAS" | ROAS computed frontend-side: `revenueNet / adSpend`; labeled explicitly in UI to distinguish from Meta-reported ROAS; shown only when both revenue and spend > 0 |
| CHART-05 | Waterfall chart gains "Ad Spend" step between Shipping and Net Profit when Meta Ads connected | `WaterfallChart.jsx` already accepts step array via `computeWaterfallData`; Overview passes `adSpend` prop; chart conditionally inserts step; color: `var(--c-ads)` (new CSS var, e.g. purple/violet) |
</phase_requirements>

---

## Standard Stack

### Core (no new packages needed)

| Library | Version | Purpose | Already In Project |
|---------|---------|---------|-------------------|
| Node.js `crypto` | built-in | AES-256-GCM token encryption (`lib/encrypt.js`) | Yes — already used in `lib/utils.js`, `routes/auth.js` |
| Express | 4.22 | New `/ads/*` routes | Yes |
| Prisma | 5.22 | `AdConnection` + `AdSpend` models | Yes |
| `node-cron` | 4.2.1 | Ads spend sync scheduler (extend existing `lib/scheduler.js`) | Yes |
| Jest + supertest | 29 / 7 | Route tests following `makeApp()` pattern | Yes |
| React | 18 (Vite) | `AdsView` component + KPI card + waterfall step | Yes |

No new npm packages are required for Phase 8. All Meta API calls are plain `fetch()` to `https://graph.facebook.com/`.

### Supporting

| Tool | Purpose | Note |
|------|---------|------|
| Meta Graph API v21.0 | Ad account, campaigns, insights endpoints | Use `fetch()` directly; no SDK needed |
| `prisma db execute` | Apply schema migration on Railway | Same pattern as Phase 7 — Railway lacks shadow DB for `migrate dev` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in `crypto` AES-256-GCM | `node:crypto` `aes-256-cbc` | GCM provides authenticated encryption (integrity + confidentiality); CBC does not — GCM is strictly better for token storage |
| Built-in `crypto` | `npm install @node-rs/bcrypt` or similar | No need — Node's built-in crypto is production-grade for AES-GCM; avoid adding dependencies |
| Separate `routes/ads-auth.js` + `routes/ads.js` | Adding to `routes/api.js` | Phase 9 adds Google Ads routes to the same files; separate files prevent `api.js` from becoming unmanageable |
| Daily granularity `AdSpend` cache | Real-time API calls per dashboard load | Caching is necessary: Meta Insights API has rate limits; date-range aggregations over the cache are instant SQL |
| `form.submit target="_top"` escape | App Bridge `Redirect.Action.APP` | App Bridge requires `@shopify/app-bridge` in the frontend bundle; this project uses plain JS `window.shopify.idToken()` without App Bridge package — the form-submit pattern is already proven in `routes/auth.js` |

**Installation:**
```bash
# No new packages. Confirm no additional install needed:
npm ls node-cron  # should show 4.2.1
```

---

## Architecture Patterns

### New File Structure

```
lib/
├── encrypt.js           # NEW: AES-256-GCM encrypt/decrypt for OAuth tokens
├── syncAdSpend.js       # NEW: Meta Ads Insights sync (Phase 9 extends for Google)
├── scheduler.js         # EXTEND: add syncAdSpendAll job (hourly or every 6 hours)
routes/
├── ads-auth.js          # NEW: GET /ads/auth, GET /ads/callback, DELETE /ads/disconnect
├── ads.js               # NEW: GET /api/ads/spend, GET /api/ads/campaigns
├── api.js               # EXTEND: GET /api/dashboard/overview gains adSpend field
web/src/components/
├── AdsView.jsx          # NEW: connection status, ROAS, campaign table
├── Overview.jsx         # EXTEND: adSpend KPI card, pass adSpend to WaterfallChart
├── WaterfallChart.jsx   # EXTEND: accept adSpend prop, insert step conditionally
```

### Pattern 1: Meta OAuth with Iframe Escape

The existing `routes/auth.js` already solves the identical problem for Shopify OAuth. The pattern is:

1. Frontend button calls `/ads/auth?shop=<domain>` (top-level navigation via `target="_top"` or App Bridge redirect)
2. `/ads/auth` detects embedded context (`req.query.embedded === '1'` or `req.query.host` present) and renders the escape page
3. Escape page uses `form.submit` with `target="_top"` to re-issue the request at the top level
4. Top-level `/ads/auth` stores CSRF state in `OAuthState` table and redirects to Meta
5. Meta callback hits `/ads/callback` (always top-level, outside iframe)
6. Callback exchanges code, fetches long-lived token, encrypts, stores in `AdConnection`
7. Redirects merchant back to app (`/admin?shop=...`)

```javascript
// Source: routes/auth.js lines 78-99 — same pattern for /ads/auth
if (req.query.embedded === '1' || req.query.host) {
  const redirectUrl = `${process.env.SHOPIFY_APP_URL}/ads/auth?shop=${encodeURIComponent(shop)}`;
  return res.send(`<!DOCTYPE html><html><head><script>
    var url = '${redirectUrl}';
    var form = document.createElement('form');
    form.method = 'GET';
    form.action = url.split('?')[0];
    form.target = '_top';
    // ... add hidden inputs from query string
    document.body.appendChild(form);
    form.submit();
  </script></head><body>Redirecting...</body></html>`);
}
```

### Pattern 2: AES-256-GCM Token Encryption (`lib/encrypt.js`)

```javascript
// Source: Node.js crypto docs + rjz/15baffeab434b8125ca4d783f4116d81
const crypto = require('crypto');

const KEY = Buffer.from(process.env.ADS_ENCRYPTION_KEY, 'base64'); // 32 bytes

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);                         // 96-bit IV per NIST SP 800-38D
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  let enc = cipher.update(plaintext, 'utf8', 'base64');
  enc += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext as single string: "iv:tag:ciphertext"
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${enc}`;
}

function decrypt(stored) {
  const [ivB64, tagB64, enc] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);                              // MUST set before final()
  let dec = decipher.update(enc, 'base64', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}
```

Key generation for Railway config:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Pattern 3: Meta Ads Insights API Calls

All calls are plain `fetch()` to `https://graph.facebook.com/v21.0/`. No SDK.

```javascript
// Source: developers.facebook.com/docs/marketing-api/insights/

// Step 1: Get ad account IDs for the user
// GET /me/adaccounts?fields=name,account_id&access_token=TOKEN
// Returns: { data: [{ id: "act_1234", name: "My Ad Account" }] }

// Step 2: Get total spend for a date range (account level)
// GET /act_{ACCOUNT_ID}/insights?fields=spend&time_range={"since":"2025-01-01","until":"2025-01-31"}&access_token=TOKEN
// Returns: { data: [{ spend: "2352.45", date_start: "...", date_stop: "..." }] }

// Step 3: Get per-campaign spend breakdown
// GET /act_{ACCOUNT_ID}/insights?fields=campaign_id,campaign_name,spend
//   &level=campaign
//   &time_range={"since":"...","until":"..."}
//   &access_token=TOKEN
// Returns: { data: [{ campaign_id: "...", campaign_name: "...", spend: "..." }], paging: {...} }
```

**Critical detail:** `spend` is returned as a **string**, not a number. Always `parseFloat(row.spend)` before storing.

**Pagination:** The response includes a `paging.next` URL. Loop until no `paging.next` to capture all campaigns.

### Pattern 4: AdSpend Schema Design

```prisma
// New models in prisma/schema.prisma

model AdConnection {
  id            Int      @id @default(autoincrement())
  shop          String
  platform      String   // 'meta' | 'google'
  encryptedToken String  @map("encrypted_token")  // AES-256-GCM encrypted
  accountId     String   @map("account_id")        // act_XXXXX for Meta
  accountName   String?  @map("account_name")
  connectedAt   DateTime @default(now()) @map("connected_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@unique([shop, platform])
  @@index([shop])
  @@map("ad_connections")
}

model AdSpend {
  id           Int      @id @default(autoincrement())
  shop         String
  platform     String   // 'meta' | 'google'
  date         DateTime @db.Date
  campaignId   String   @map("campaign_id")
  campaignName String   @map("campaign_name")
  spend        Decimal  @db.Decimal(12, 2)
  syncedAt     DateTime @default(now()) @map("synced_at")

  @@unique([shop, platform, date, campaignId])
  @@index([shop, platform, date])
  @@map("ad_spend")
}
```

`@@unique([shop, platform, date, campaignId])` makes sync idempotent — `upsert` on this key replaces stale rows.

### Pattern 5: Scheduler Extension

Extend `lib/scheduler.js` to register a second job for ad spend sync. Keep it separate from the 15-minute order sync to allow independent scheduling.

```javascript
// lib/scheduler.js — add after existing 15-minute job
cron.schedule('0 */6 * * *', async () => {     // Every 6 hours
  const connections = await prisma.adConnection.findMany({
    select: { shop: true, platform: true },
  });
  for (const { shop, platform } of connections) {
    try {
      await syncAdSpendFn(shop, platform);
    } catch (err) {
      console.error(`Scheduler: adSpend sync failed for ${shop}/${platform}:`, err.message);
    }
  }
}, { noOverlap: true });
```

### Pattern 6: GDPR Extension (Required for App Review)

The `shop/redact` webhook handler in `routes/webhooks.js` must delete `AdConnection` and `AdSpend` rows. Shopify tests this during App Review.

```javascript
// routes/webhooks.js — extend shop/redact handler
if (myshopify_domain) {
  await prisma.$transaction([
    prisma.shopSession.deleteMany({ where: { shop: myshopify_domain } }),
    prisma.adConnection.deleteMany({ where: { shop: myshopify_domain } }),   // NEW
    prisma.adSpend.deleteMany({ where: { shop: myshopify_domain } }),        // NEW
  ]);
}
```

### Pattern 7: KPI Grid Extension (ADS-02)

The Overview KPI grid (`KPI_META` array in `Overview.jsx`) gains a 5th card conditionally when `adSpend` is non-null.

```jsx
// Overview.jsx — add after Shipping KPI if adSpend exists in data
{data.adSpend !== null && (
  <div className="pt-kpi-card" style={{ "--kpi-color": "var(--c-ads)", "--kpi-bg": "var(--c-ads-bg)" }}>
    <div className="pt-kpi-label">Ad Spend</div>
    <div className="pt-kpi-value" style={{ color: 'var(--c-ads)' }}>
      {formatCurrency(data.adSpend)}
    </div>
    <div className="pt-kpi-sub">Meta Ads</div>
  </div>
)}
```

### Pattern 8: Waterfall Step Extension (CHART-05)

`WaterfallChart.jsx` already supports arbitrary step arrays via `computeWaterfallData`. The only change is adding one conditional step and one new color in `getCellColor`.

```javascript
// WaterfallChart.jsx — add after Shipping step (existing pattern)
if (adSpend && adSpend > 0) {
  steps.push({ label: 'Ad Spend', value: adSpend, type: 'subtract' });
}

// getCellColor — add Ad Spend case
if (entry.label === 'Ad Spend') return 'var(--c-ads)';
```

### Anti-Patterns to Avoid

- **Store tokens in plaintext:** `ADS_ENCRYPTION_KEY` must be set before any token write code is deployed. Never store the raw access token string in the DB.
- **Trust Meta-reported ad spend as revenue attribution:** Requirements explicitly exclude per-order attribution. Show spend only. Do not calculate "attributed revenue" from Meta data.
- **Pop-up window for OAuth:** Meta OAuth in Safari blocks popups. Use the top-level redirect pattern only.
- **`ads_management` scope:** The requirement is read-only. Request only `ads_read`. Requesting broader scopes triggers a stricter Meta App Review path.
- **Real-time Insights API on every dashboard load:** Rate-limited. Always serve from `AdSpend` cache rows. Only `syncAdSpend` hits the API.
- **Storing the ad account ID from the initial OAuth response only:** After OAuth, call `/me/adaccounts` to discover the merchant's ad account IDs. The user's access token itself doesn't embed the account ID.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-GCM encryption | Custom XOR, ROT13, base64 "encoding" | `crypto.createCipheriv('aes-256-gcm', ...)` | Authenticated encryption — detects tampering; GCM is the NIST-recommended mode |
| CSRF state for OAuth | In-memory Set | `OAuthState` Prisma model (already in schema) | Survives server restarts; same model used by Shopify OAuth in `routes/auth.js` |
| Token refresh logic | Custom expiry tracker + refresh cron | Exchange short-lived token for long-lived immediately on callback; Marketing API standard access tokens don't expire on time | Long-lived tokens last ~60 days; apps with standard Marketing API access get tokens that don't expire. Re-auth on 190 error code is sufficient |
| Pagination of Insights | Manual cursor tracking | Use `paging.next` URL from response; loop while `paging.next` exists | Meta uses cursor-based pagination; don't assume a single response contains all campaigns |
| Custom rate limiter for Meta API | Token bucket implementation | 6-hour sync cadence + node-cron `noOverlap: true` | Meta's rate limits are per-token; a 6-hour background sync with `noOverlap` will not approach limits for typical Shopify merchant ad accounts |

---

## Common Pitfalls

### Pitfall 1: OAuth Inside the Shopify Iframe

**What goes wrong:** Clicking "Connect Meta Ads" inside the Shopify admin opens `/ads/auth`, which tries to redirect to `https://www.facebook.com/dialog/oauth`. Facebook's OAuth page has `X-Frame-Options: DENY`. The browser blocks it. The merchant sees a blank iframe or an error.

**Why it happens:** Shopify embeds the app in an `<iframe>`. Any cross-origin redirect target that sets `X-Frame-Options: DENY` cannot load inside the iframe.

**How to avoid:** The `/ads/auth` route must detect the embedded context (`req.query.host` present or `req.query.embedded === '1'`) and render the `form.submit / target="_top"` escape page before issuing the Meta redirect. This is identical to the existing Shopify OAuth escape in `routes/auth.js` lines 78–99.

**Warning signs:** OAuth flow works in standalone browser window but fails when accessed from Shopify Admin.

### Pitfall 2: Safari Popup Blockers

**What goes wrong:** Using `window.open()` to launch the Meta OAuth dialog. Safari and iOS Safari block window.open calls that are not in direct response to a user gesture, and block them entirely for cross-origin windows in many configurations.

**How to avoid:** Never use `window.open()`. The top-level redirect pattern navigates the entire top-level window to Meta OAuth and returns — no popup needed, no Safari issue.

### Pitfall 3: `spend` Field Is a String

**What goes wrong:** Treating `row.spend` from the Insights API as a JavaScript `Number`. It is returned as a string (`"2352.45"`). Arithmetic on it without `parseFloat()` produces NaN or string concatenation.

**How to avoid:** Always `parseFloat(row.spend)` before storing or computing. The `AdSpend.spend` Prisma field is `Decimal` — Prisma's Decimal handles this if you pass a string, but the aggregation in the API route must use `Number()` on the result.

### Pitfall 4: Missing `ADS_ENCRYPTION_KEY` in Railway Config

**What goes wrong:** Deploying the token write code before `ADS_ENCRYPTION_KEY` is set in Railway environment config causes `lib/encrypt.js` to throw on startup or silently encrypt with an undefined key.

**How to avoid:** Add `ADS_ENCRYPTION_KEY` to Railway config as the very first step (Wave 0 / Plan 1). Server startup should validate its presence the same way `REQUIRED_ENV` is validated in `server.js`. Generate the key with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

### Pitfall 5: GDPR `shop/redact` Webhook Fails App Review

**What goes wrong:** Shopify tests the `shop/redact` webhook during App Review. If it doesn't delete `AdConnection` and `AdSpend` rows, the app fails GDPR compliance and is rejected.

**How to avoid:** Extend `routes/webhooks.js` `shop/redact` handler to delete both new tables in the same transaction as `ShopSession` deletion (Pattern 6 above).

### Pitfall 6: Meta Advanced Access App Review Timing

**What goes wrong:** Assuming that creating a Meta Developer App immediately grants production access for users other than the app owner. In development mode, the app only works for ad accounts the app owner controls. To work for third-party merchants (i.e., all Shopify merchants using this app), the app needs **Advanced Access** to `ads_read`, which requires Meta App Review.

**How to avoid:** Start the Meta App Review process immediately at Phase 8 kickoff. App Review requires: (1) Business Verification of the developer account, (2) a privacy policy URL, (3) a screen recording demonstrating the OAuth flow, (4) explanation of why `ads_read` is needed. During development and testing, use a test merchant account that is an admin of the developer's own ad account.

**Warning signs:** OAuth works for the developer's own Meta account but returns "Permission denied" errors for other merchants' ad accounts.

### Pitfall 7: `OAuthState` Reuse

**What goes wrong:** Using a separate in-memory state store for Meta OAuth CSRF instead of the existing `OAuthState` Prisma model. In-memory state is lost on server restart (Railway deploys restart the process).

**How to avoid:** Reuse the existing `OAuthState` model. Its `@@id(state)` and 10-minute cleanup TTL already handle the Meta OAuth case. The `shop` field on `OAuthState` ties the state to the initiating Shopify shop.

### Pitfall 8: Ad Account Discovery

**What goes wrong:** Assuming the OAuth access token contains the ad account ID. It does not. After obtaining the token, a separate call to `/me/adaccounts?fields=name,account_id` is required to discover which ad account(s) the user has access to. Multi-account merchants need a selection UI or deterministic selection (first account).

**How to avoid:** After token exchange, call `/me/adaccounts` and store the returned `account_id` in `AdConnection.accountId`. For Phase 8 simplicity: if a merchant has multiple ad accounts, store all of them or document that the first account is used.

---

## Code Examples

### Verified: Meta OAuth Authorization URL

```javascript
// Source: developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
const authUrl = [
  'https://www.facebook.com/v21.0/dialog/oauth',
  `?client_id=${process.env.META_APP_ID}`,
  `&redirect_uri=${encodeURIComponent(process.env.SHOPIFY_APP_URL + '/ads/callback')}`,
  `&scope=ads_read`,
  `&state=${state}`,
  `&response_type=code`,
].join('');
res.redirect(authUrl);
```

### Verified: Token Exchange (Code for Access Token)

```javascript
// Source: developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
const tokenUrl = [
  'https://graph.facebook.com/v21.0/oauth/access_token',
  `?client_id=${process.env.META_APP_ID}`,
  `&client_secret=${process.env.META_APP_SECRET}`,
  `&redirect_uri=${encodeURIComponent(process.env.SHOPIFY_APP_URL + '/ads/callback')}`,
  `&code=${code}`,
].join('');
const tokenRes = await fetch(tokenUrl);
const { access_token } = await tokenRes.json();
```

### Verified: Exchange Short-Lived for Long-Lived Token

```javascript
// Source: developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
const longLivedUrl = [
  'https://graph.facebook.com/v21.0/oauth/access_token',
  `?grant_type=fb_exchange_token`,
  `&client_id=${process.env.META_APP_ID}`,
  `&client_secret=${process.env.META_APP_SECRET}`,
  `&fb_exchange_token=${access_token}`,
].join('');
const longRes = await fetch(longLivedUrl);
const { access_token: longToken } = await longRes.json();
// For apps with standard Marketing API access, longToken does not expire on time.
```

### Verified: Get Ad Accounts

```javascript
// Source: developers.facebook.com/docs/marketing-api/reference/ad-account/
const meUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id&access_token=${token}`;
const meRes = await fetch(meUrl);
const { data: accounts } = await meRes.json();
// accounts = [{ id: "act_1234", name: "My Store Ads", account_id: "1234" }]
```

### Verified: Per-Campaign Spend with Date Range

```javascript
// Source: developers.facebook.com/docs/marketing-api/insights/
async function fetchCampaignSpend(accountId, token, since, until) {
  const results = [];
  let url = [
    `https://graph.facebook.com/v21.0/act_${accountId}/insights`,
    `?fields=campaign_id,campaign_name,spend`,
    `&level=campaign`,
    `&time_range=${JSON.stringify({ since, until })}`,
    `&access_token=${token}`,
  ].join('');

  while (url) {
    const res = await fetch(url);
    const body = await res.json();
    if (body.error) throw new Error(`Meta API error: ${body.error.message}`);
    results.push(...(body.data || []));
    url = body.paging?.next || null;  // cursor pagination
  }
  return results;
  // Each item: { campaign_id: "...", campaign_name: "...", spend: "123.45" }
}
```

### Verified: Total Account-Level Spend

```javascript
// Source: developers.facebook.com/docs/marketing-api/insights/
const insightsUrl = [
  `https://graph.facebook.com/v21.0/act_${accountId}/insights`,
  `?fields=spend`,
  `&time_range=${JSON.stringify({ since, until })}`,
  `&access_token=${token}`,
].join('');
const res = await fetch(insightsUrl);
const { data } = await res.json();
const totalSpend = data.reduce((sum, row) => sum + parseFloat(row.spend || '0'), 0);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `window.open()` popup for OAuth | Top-level redirect (form + `target="_top"`) | ITP / Safari 14+ | Popup approach fails in Safari embedded context |
| Short-lived tokens (1-2 hr) | Long-lived tokens (60 days) + standard Marketing API tokens (non-expiring) | Meta Marketing API maturation | Server-side apps should always exchange for long-lived immediately |
| `ads_read` + `ads_management` always requested | `ads_read` alone for read-only | Meta App Review policy tightened | Requesting only required scopes reduces App Review complexity |
| Meta Pixel / CAPI for conversion data | Spend-only via Insights API | Privacy regulations / iOS ATT | App requirements explicitly exclude attribution — spend only |
| 7d_view / 28d_view attribution windows | Deprecated as of January 2026 | Meta API change Jan 12 2026 | Not applicable to spend-only queries; no action needed |

**Deprecated/outdated:**
- `window.open()` OAuth flows: blocked by Safari popup restrictions — do not use
- `ads_management` scope for read-only use cases: overly broad, triggers extra App Review scrutiny — use `ads_read` only

---

## Open Questions

1. **Meta Ad Account Multi-Account Handling**
   - What we know: `/me/adaccounts` may return multiple ad accounts for a merchant
   - What's unclear: Should the app store all accounts and aggregate spend, or prompt the merchant to select one?
   - Recommendation: For Phase 8 simplicity, store all returned accounts and aggregate spend across all of them. Surface account name(s) in the connection status UI. Phase 9 can refine with a selector if needed.

2. **Meta App Review Timeline**
   - What we know: Advanced Access to `ads_read` for third-party users requires Meta App Review + Business Verification
   - What's unclear: Current processing time (historically 5-30 business days; can vary significantly)
   - Recommendation: Start App Review during Plan 1 kickoff (same day as schema work). During review, the app functions for the developer's own test ad accounts. Document this limitation clearly. Phase 8 is shippable for internal testing without Advanced Access.

3. **Token Re-auth on 190 Error**
   - What we know: Error code 190 from Meta Graph API means the token is invalid/expired
   - What's unclear: How to surface this to the merchant without interrupting their session
   - Recommendation: When `syncAdSpend` receives a 190 error, set `AdConnection.encryptedToken = null` (or add a `status` column) and surface a "Reconnect Meta Ads" prompt in the Ads view. Phase 8 Plan 3 should include this error handling.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7 |
| Config file | `jest.config.js` (root), `babel.config.js` for JSX |
| Quick run command | `npm test -- --testPathPattern=ads` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADS-01 | `POST /ads/connect` stores encrypted token in `AdConnection` | unit | `npm test -- --testPathPattern=ads` | Wave 0 |
| ADS-01 | `DELETE /ads/disconnect` removes `AdConnection` row | unit | `npm test -- --testPathPattern=ads` | Wave 0 |
| ADS-01 | `GET /ads/auth` with `?host=` param returns escape HTML with `form.submit` | unit | `npm test -- --testPathPattern=ads` | Wave 0 |
| ADS-02 | `GET /api/ads/spend?from=&to=` aggregates `AdSpend` rows correctly | unit | `npm test -- --testPathPattern=ads` | Wave 0 |
| ADS-03 | `GET /api/ads/campaigns?from=&to=` returns per-campaign spend rows | unit | `npm test -- --testPathPattern=ads` | Wave 0 |
| ADS-07 | ROAS = revenueNet / adSpend when both > 0; null when adSpend = 0 | unit | `npm test -- --testPathPattern=ads` | Wave 0 |
| CHART-05 | `computeWaterfallData` with adSpend step: 6-step sequence correct | unit | `npm test -- --testPathPattern=chart` | Wave 0 |
| ADS-01 | `lib/encrypt.js` round-trip: decrypt(encrypt(token)) === token | unit | `npm test -- --testPathPattern=encrypt` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern=ads`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/ads.test.js` — covers ADS-01, ADS-02, ADS-03, ADS-07 (route-level tests using `makeApp()` pattern from `dashboard.test.js`)
- [ ] `tests/encrypt.test.js` — covers `lib/encrypt.js` round-trip, invalid key behavior
- [ ] `tests/__mocks__/prisma.js` — extend with `adConnection` and `adSpend` mock objects (following existing mock pattern)
- [ ] Chart test extension in `tests/chart.test.js` — add CHART-05 test for 6-step sequence with Ad Spend step

---

## Environment Variables Required (New)

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `ADS_ENCRYPTION_KEY` | 32-byte base64-encoded key for AES-256-GCM | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `META_APP_ID` | Meta Developer App ID | Meta Developer Dashboard |
| `META_APP_SECRET` | Meta Developer App Secret | Meta Developer Dashboard |

Add to Railway environment config **before deploying any token write code.**

---

## Sources

### Primary (HIGH confidence)

- [Meta Marketing API — Authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/) — OAuth scopes, `ads_read`, access levels
- [Meta Facebook Login — Manual Flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) — authorization URL, code exchange, state parameter
- [Meta Facebook Login — Access Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/) — token types, lifespans, long-lived exchange
- [Meta Ads Insights API](https://developers.facebook.com/docs/marketing-api/insights/) — `level=campaign`, `time_range`, `fields=spend`, `paging.next`
- [Meta Ad Account Campaigns](https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/) — campaigns endpoint, spend via insights
- [Node.js crypto — AES-256-GCM pattern](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) — encrypt/decrypt implementation
- Existing codebase: `routes/auth.js` lines 78–99 — form.submit iframe escape pattern
- Existing codebase: `lib/scheduler.js` — node-cron `noOverlap: true` pattern
- Existing codebase: `prisma/schema.prisma` — `OAuthState` model for CSRF state storage

### Secondary (MEDIUM confidence)

- Meta long-lived tokens for Marketing API standard access don't expire on time — verified across multiple official sources
- Meta App Review requirement for third-party `ads_read` access — confirmed by official permissions reference and community reports

### Tertiary (LOW confidence)

- Meta App Review processing time (5–30 business days) — based on community reports; official docs don't guarantee SLA
- Multi-account handling UX recommendation — based on API behavior + project judgment

---

## Metadata

**Confidence breakdown:**
- Standard stack (no new packages): HIGH — all libs already in project; Meta API uses plain `fetch()`
- OAuth iframe escape pattern: HIGH — identical to existing `routes/auth.js`; well-documented
- AES-256-GCM encryption: HIGH — Node.js built-in; NIST-recommended algorithm
- Meta Insights API structure: HIGH — verified against official docs
- Token lifetime / long-lived behavior: MEDIUM — official docs confirm; behavior subject to Meta policy changes
- App Review timeline: LOW — external process; no official SLA

**Research date:** 2026-03-19
**Valid until:** 2026-05-19 (stable APIs; Meta API version policy changes ~1x/year)
