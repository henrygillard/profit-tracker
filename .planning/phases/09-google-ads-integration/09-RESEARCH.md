# Phase 9: Google Ads Integration - Research

**Researched:** 2026-03-19
**Domain:** Google Ads API REST, google-auth-library OAuth2, GAQL
**Confidence:** HIGH (core stack), MEDIUM (Node 16 boundary edge cases)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- REST approach from day 1 — do NOT use `google-ads-api` npm package (gRPC native binary may not compile on Railway Docker + Node 16)
- Use `google-auth-library` for OAuth2 and token refresh: try v10 first (`npm install google-auth-library@10 --dry-run`), fallback to `^9.15.1` if Node 16 fails — make this the first task in the plan
- GAQL requests go to Google's REST endpoint (`https://googleads.googleapis.com/v18/...`) with `google-auth-library` for auth
- 90-day lookback window (same as Meta sync)
- Token expiry: log error + delete AdConnection row (mark disconnected) — same pattern as Meta error code 190. No retry, no silent failure.
- New file: `routes/google-ads-auth.js` mounted at `/google-ads` in server.js (not extending `ads-auth.js`)
- Google OAuth params: `access_type=offline&prompt=consent` required to get a refresh token
- Developer token env var: `GOOGLE_ADS_DEVELOPER_TOKEN` (required header on every GAQL request — not part of merchant OAuth)
- Account selection: after OAuth, list accessible customer IDs and auto-select the first non-manager account. Store as `accountId` in AdConnection. Merchant can reconnect to change.
- CSRF state: reuse existing `OAuthState` Prisma table (same pattern as Meta)
- GDPR: extend `shop/redact` webhook handler to delete `AdConnection` and `AdSpend` rows where `platform='google'` — already done in Phase 8 (both webhooks delete by `shop` without platform filter). Verify no change needed.
- 6th KPI card: "Google Ads Spend" — only visible when `googleAdSpend !== null`
- Overview endpoint returns separate fields: `{ metaAdSpend, googleAdSpend, totalAdSpend }`
- `totalAdSpend` = sum of connected platform spend values; netProfit deducts `totalAdSpend`
- Waterfall chart: single combined "Ad Spend" step = `totalAdSpend`. WaterfallChart.jsx requires no structural changes.
- Blended ROAS (ADS-07): update to use `totalAdSpend` as denominator
- Extend `DELETE /api/ads/disconnect` with `?platform=meta|google` — default no param returns 400
- `syncAdSpend.js`: add Google branch alongside existing Meta branch (replace `if (platform !== 'meta') throw`)
- Iframe escape HTML in google-ads-auth.js: reuse exact pattern from ads-auth.js (form.submit + target=_top)

### Claude's Discretion
- GAQL query structure for campaign spend (fields, date range params, micros conversion)
- Exact auto-select logic for customer ID (which API call, how to filter manager accounts)
- Error handling details within the sync function beyond the token-expiry pattern
- iframe escape HTML in google-ads-auth.js (reuse exact pattern from ads-auth.js)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADS-04 | Merchant can connect their Google Ads account via OAuth and disconnect it — the flow uses a refresh token and the existing embedded iframe top-level redirect pattern (requires Google Ads developer token at minimum Test Account Access) | google-auth-library OAuth2 flow documented; iframe escape pattern already in ads-auth.js |
| ADS-05 | Total Google Ads spend for the selected date range is pulled via GAQL, displayed as a separate "Google Ads Spend" line in the P&L KPI cards (distinct from Meta spend), and deducted from net profit — cost values are correctly converted from micros to dollars | GAQL campaign query documented; metrics.cost_micros / 1,000,000 conversion pattern confirmed |
| ADS-06 | Merchant can view a per-campaign Google Ads spend breakdown table alongside the Meta campaign table in the Ads view | Campaign GAQL query, AdSpend upsert pattern, and frontend table extension all documented |
</phase_requirements>

---

## Summary

This phase adds Google Ads as a second ad platform on top of the Phase 8 infrastructure (AdConnection/AdSpend schema, lib/encrypt.js, lib/syncAdSpend.js, scheduler). The Phase 8 code was deliberately designed with Phase 9 in mind — the `platform` column in both tables already supports `'google'`, the GDPR webhooks already delete all AdConnection/AdSpend rows by shop without platform filtering, and `syncAdSpend.js` ends with `throw new Error('unsupported platform')` precisely where the Google branch will be added.

The two decision points with real risk are the `google-auth-library` version ceiling (v10 requires Node 18+; this project runs Node 16.20.2, so `^9.15.1` is the reliable target) and the `google-ads-api` npm package exclusion (gRPC native binaries are unreliable on Railway Docker + Node 16 — pure REST via `fetch` is the mandated approach). The REST API design is straightforward: a POST to `https://googleads.googleapis.com/v18/customers/{customerId}/googleAds:search` with a GAQL query body, paginated via `nextPageToken`.

The front-end scope is minimal — a second connection card in AdsView.jsx, a 6th KPI card in Overview.jsx (conditionally rendered), and overview API changes to return `metaAdSpend`/`googleAdSpend`/`totalAdSpend`. The existing `pt-kpi-grid` auto-fit layout absorbs the 6th card with no CSS change. WaterfallChart.jsx receives no structural changes (it already accepts an `adSpend` prop that maps to `totalAdSpend`).

**Primary recommendation:** Write `routes/google-ads-auth.js` verbatim from `ads-auth.js` structure, substituting Google OAuth endpoints and env vars; then add the Google branch to `syncAdSpend.js` using a plain `fetch` + `getAccessToken()` pattern from `google-auth-library@^9.15.1`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `google-auth-library` | `^9.15.1` (fallback from v10) | OAuth2 authorization code flow; refresh token management; access token generation | Official Google library; `OAuth2Client.getAccessToken()` auto-refreshes — no custom token cache needed |
| Node.js built-in `fetch` | Node 16.20.2 built-in | GAQL REST calls to `googleads.googleapis.com` | No extra dependency; already used for Meta Insights calls in syncAdSpend.js |
| `lib/encrypt.js` (existing) | — | AES-256-GCM encrypt/decrypt for Google refresh token storage | Same `encrypt(token)` / `decrypt(encToken)` API used by Phase 8 Meta flow |

### Node 16 / google-auth-library Version Boundary

**CRITICAL — Node 16.20.2 is the runtime:**

- `google-auth-library@10.x` requires **Node >= 18** (breaking change introduced in v10.0.0, released June 2025). The repository is now read-only (archived November 2025).
- `google-auth-library@9.15.1` is the last v9 release (January 2025); it supports Node 14+, confirmed by the v10 changelog explicitly calling out "Support Node 18, 20, 22" as a v10 breaking change.
- **Plan task sequence:** Run `npm install google-auth-library@10 --dry-run` first. If it fails on Node 16, install `^9.15.1`. The API surface (`OAuth2Client`, `setCredentials`, `getAccessToken`) is identical across v9 and v10.

| Check | Command | Expected |
|-------|---------|----------|
| Node version | `node --version` | `v16.20.2` |
| v10 compatibility check | `npm install google-auth-library@10 --dry-run` | Likely fails with engine mismatch |
| v9 install | `npm install google-auth-library@^9.15.1` | Should succeed on Node 16 |

**Confidence:** HIGH (v10 Node 18 requirement confirmed from official changelog; v9 Node 14+ support confirmed by version cadence)

### No gRPC Package

The `google-ads-api` npm package (Opteo) uses gRPC + native binaries (protobuf, grpc). Do NOT use it. Pure REST via `fetch` handles all required GAQL operations.

---

## Architecture Patterns

### Recommended File Structure for This Phase

```
routes/
  google-ads-auth.js    # New: Google OAuth auth, callback, (no connect POST needed — callback does upsert)
  ads.js                # Extend: DELETE /disconnect to accept ?platform=meta|google
  api.js                # Extend: /dashboard/overview returns metaAdSpend, googleAdSpend, totalAdSpend
lib/
  syncAdSpend.js        # Extend: add Google branch replacing throw for unsupported platform
  scheduler.js          # No change needed — already iterates all AdConnection rows by shop+platform
routes/
  webhooks.js           # No change needed — shop/redact already deletes all AdConnection+AdSpend by shop
web/src/components/
  AdsView.jsx           # Extend: add Google connection card, pass ?platform= to disconnect
  Overview.jsx          # Extend: add 6th KPI card for googleAdSpend, update WaterfallChart adSpend prop
```

### Pattern 1: Google OAuth Authorization Code Flow

**What:** Merchant clicks "Connect Google Ads" → top-level redirect to Google consent screen → callback exchanges code for tokens → refresh token stored encrypted → access token obtained on-demand via `getAccessToken()`

**When to use:** Every new merchant connection and on every GAQL sync call

**Exact flow for `routes/google-ads-auth.js`:**

```
GET /google-ads/auth
  if embedded=1 or host param → iframe escape (form.submit target=_top, same as ads-auth.js lines 27-51)
  else → create OAuthState, redirect to Google consent URL

Google consent URL params (all required):
  client_id     = GOOGLE_ADS_CLIENT_ID
  redirect_uri  = SHOPIFY_APP_URL + '/google-ads/callback'
  scope         = https://www.googleapis.com/auth/adwords
  response_type = code
  state         = <CSRF token>
  access_type   = offline    ← required for refresh token
  prompt        = consent    ← required to force refresh token every time

GET /google-ads/callback
  1. Verify OAuthState CSRF
  2. Exchange code for tokens (OAuth2Client.getToken(code))
     → Response contains { access_token, refresh_token, expiry_date }
  3. Call listAccessibleCustomers REST endpoint
     → GET https://googleads.googleapis.com/v18/customers:listAccessibleCustomers
     → Headers: Authorization: Bearer <access_token>, developer-token: GOOGLE_ADS_DEVELOPER_TOKEN
     → Response: { resourceNames: ["customers/1234567890", ...] }
  4. For each customerId, call GAQL query on customer resource to get customer.manager boolean
     → Filter to first customer where manager = false (leaf account)
     → Fallback: use resourceNames[0] if all are managers (edge case)
  5. encrypt(refresh_token) → store in AdConnection(shop, platform='google', encryptedToken, accountId)
  6. Delete OAuthState, redirect to /admin?shop=x
```

**Source:** Google Ads API REST auth docs (HIGH), ads-auth.js pattern analysis (HIGH)

### Pattern 2: GAQL Campaign Spend Query

**What:** POST to GoogleAds REST search endpoint with a GAQL query; paginate with `nextPageToken`; convert micros to dollars

**GAQL query for campaign spend:**

```sql
SELECT campaign.id, campaign.name, metrics.cost_micros
FROM campaign
WHERE segments.date >= '2024-01-01' AND segments.date <= '2024-12-31'
  AND metrics.cost_micros > 0
ORDER BY metrics.cost_micros DESC
```

**REST call:**

```javascript
// Source: Google Ads API REST docs (HIGH confidence)
// POST https://googleads.googleapis.com/v18/customers/{customerId}/googleAds:search
// Headers:
//   Authorization: Bearer <accessToken>
//   developer-token: <GOOGLE_ADS_DEVELOPER_TOKEN>
//   Content-Type: application/json

const body = {
  query: `SELECT campaign.id, campaign.name, metrics.cost_micros
          FROM campaign
          WHERE segments.date >= '${since}' AND segments.date <= '${until}'
            AND metrics.cost_micros > 0`
};
// Response shape:
// { results: [{ campaign: { id: '123', name: 'Summer Sale' }, metrics: { costMicros: '1500000' } }],
//   nextPageToken: 'token...' }
// Note: costMicros is returned as a STRING in JSON (int64 serialization)
// Conversion: spend = parseInt(costMicros) / 1_000_000
```

**Pagination:** Repeat POST with `{ query, pageToken: response.nextPageToken }` until `nextPageToken` is absent.

**Micros conversion:** `metrics.cost_micros` is serialized as a JSON string (int64 → string to preserve precision). Use `parseInt(row.metrics.costMicros || '0') / 1_000_000`.

**Field name casing in REST response:** JSON response uses camelCase — `costMicros` not `cost_micros`, `campaign.id` → `campaign.id`, `campaign.name` → `campaign.name`.

**Confidence:** HIGH (GAQL field names from official docs; REST response format from docs; micros convention documented in Google Ads API reference)

### Pattern 3: Access Token via google-auth-library

**What:** `OAuth2Client.getAccessToken()` handles refresh automatically — no manual token cache needed

```javascript
// Source: google-auth-library official docs (HIGH confidence)
const { OAuth2Client } = require('google-auth-library');

async function getGoogleAccessToken(refreshToken) {
  const client = new OAuth2Client(
    process.env.GOOGLE_ADS_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET
    // no redirect_uri needed here — only needed during code exchange
  );
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken(); // auto-refreshes if expired
  return token;
}
```

**During OAuth callback (code → tokens):**

```javascript
const client = new OAuth2Client(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  process.env.SHOPIFY_APP_URL + '/google-ads/callback'
);
const { tokens } = await client.getToken(code);
// tokens.refresh_token — store this encrypted
// tokens.access_token — can be used immediately for listAccessibleCustomers
```

### Pattern 4: Token Expiry / UNAUTHENTICATED Error Handling

The Google Ads REST API returns HTTP 401 with an error body containing `UNAUTHENTICATED` or `status: 401` when the refresh token has been revoked or expired. This is the Google equivalent of Meta's error code 190.

**Sync function error handling pattern (mirrors Meta pattern):**

```javascript
// In syncAdSpend.js Google branch:
// Token failure from getAccessToken() or from GAQL response:
if (errorIsAuthFailure) {
  console.error(`syncAdSpend: Google token expired for ${shop} — disconnecting`);
  await prisma.adConnection.deleteMany({ where: { shop, platform: 'google' } });
  return; // no throw — scheduler continues for other shops
}
```

`google-auth-library`'s `getAccessToken()` throws with `invalid_grant` when the refresh token is revoked. Catch this, delete the AdConnection row, return without throwing.

### Pattern 5: Account Selection (listAccessibleCustomers)

```javascript
// GET https://googleads.googleapis.com/v18/customers:listAccessibleCustomers
// Headers: Authorization, developer-token
// Response: { resourceNames: ["customers/1234567890"] }

const customerIds = resourceNames.map(r => r.replace('customers/', ''));

// For each customerId, check if it's a manager account via GAQL:
// SELECT customer.id, customer.manager FROM customer LIMIT 1
// (run against each customerId as the target customer)
// Filter: pick first where customer.manager === false
// Fallback: if all are managers, use customerIds[0] (edge case for MCC-only accounts)
```

**Simpler alternative (Claude's discretion):** If only 1 customer ID is returned, use it directly without the manager check. Only do the manager filter when multiple IDs are returned. This avoids an extra API call in the common single-account case.

### Anti-Patterns to Avoid

- **Using `google-ads-api` npm package:** gRPC binary — excluded by locked decision. Do NOT use.
- **Storing the access token instead of refresh token:** Access tokens expire in 1 hour. Always store the refresh token.
- **Assuming `metrics.cost_micros` is a number in JSON:** The REST API serializes int64 as strings. Always use `parseInt()` before dividing by 1_000_000.
- **Missing `prompt=consent` on OAuth URL:** Without it, Google may not return a refresh token on reconnect (returning only access token). Always include both `access_type=offline` AND `prompt=consent`.
- **Missing developer-token header on GAQL calls:** Every request needs `developer-token: GOOGLE_ADS_DEVELOPER_TOKEN`. It is NOT part of OAuth — it is a per-request header identifying your app. Forgetting it returns a 403 with `DEVELOPER_TOKEN_NOT_APPROVED`.
- **Sending campaigns query to a manager account:** Manager accounts cannot have campaign metrics. Always target a leaf customer ID. The `listAccessibleCustomers` → `customer.manager` filter prevents this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth2 token exchange | Manual HTTP token exchange to accounts.google.com | `google-auth-library` `OAuth2Client.getToken(code)` | Handles token response parsing, error codes, credential object |
| Access token refresh | Store expiry, check on every call, manual refresh | `OAuth2Client.getAccessToken()` | Handles expiry check and refresh internally; single method call |
| Token encryption | Custom cipher | `lib/encrypt.js` (existing AES-256-GCM) | Already proven in Phase 8; same `encrypt(token)` API |
| GAQL pagination | Custom cursor logic | `nextPageToken` loop (same pattern as Meta `paging.next`) | REST paginates with `nextPageToken` in response body |

**Key insight:** The project deliberately excluded `google-ads-api` (gRPC) to keep the dependency tree native-binary-free on Railway Docker. The same `fetch` + `google-auth-library` pattern used for Meta Insights applies here — just different URL and headers.

---

## Common Pitfalls

### Pitfall 1: Node 16 Engine Rejection for google-auth-library v10
**What goes wrong:** `npm install google-auth-library@10` fails with `EBADENGINE: required: { node: '>=18' }` on Node 16.20.2
**Why it happens:** google-auth-library v10.0.0 (June 2025) dropped Node 16 support as a breaking change
**How to avoid:** Always run `--dry-run` first; have `^9.15.1` ready as the fallback target
**Warning signs:** Engine mismatch error from npm during install

### Pitfall 2: Missing `prompt=consent` Loses Refresh Token
**What goes wrong:** Second connect attempt by same merchant returns no `refresh_token` from Google
**Why it happens:** Google only issues a new refresh token on explicit consent. Without `prompt=consent`, the consent screen is skipped on re-auth and `tokens.refresh_token` is `undefined`
**How to avoid:** Always include `access_type=offline&prompt=consent` in the OAuth redirect URL
**Warning signs:** `tokens.refresh_token` is `undefined` or `null` in the callback handler

### Pitfall 3: int64 costMicros Arrives as String
**What goes wrong:** `row.metrics.costMicros / 1000000` returns `NaN` because the value is a string
**Why it happens:** JSON cannot represent int64 without precision loss; Google serializes int64 fields as strings
**How to avoid:** `parseInt(row.metrics.costMicros || '0') / 1_000_000`
**Warning signs:** Spend values are `0` or `NaN` in stored AdSpend rows

### Pitfall 4: GAQL Query Targeting Manager Account
**What goes wrong:** `GAQL_ERROR: MANAGER_OPERATION_NOT_PERMITTED` — campaign metrics unavailable on manager accounts
**Why it happens:** Manager accounts (MCCs) are containers; they have no campaign spend data
**How to avoid:** Filter `customer.manager = false` when selecting which customer ID to store; target only leaf accounts for GAQL campaign queries
**Warning signs:** Google API returns error about manager account restrictions

### Pitfall 5: Developer Token Header Missing from GAQL Calls
**What goes wrong:** HTTP 403 with `DEVELOPER_TOKEN_NOT_APPROVED` even when OAuth is correct
**Why it happens:** The `developer-token` header is a separate credential from the OAuth access token — it must accompany every single request
**How to avoid:** Every `fetch()` to `googleads.googleapis.com` must include `'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN`
**Warning signs:** 403 errors despite valid OAuth credentials

### Pitfall 6: overview endpoint — adSpend field rename breaks AdsView ROAS
**What goes wrong:** AdsView.jsx reads `spendData.total` for Blended ROAS denominator. If the `/api/ads/spend` response changes, ROAS breaks.
**Why it happens:** The CONTEXT.md decision is to update overview (not `/api/ads/spend`) to return `metaAdSpend`/`googleAdSpend`/`totalAdSpend`. The `/api/ads/spend` endpoint is for AdsView campaign data only.
**How to avoid:** Keep `/api/ads/spend` response shape unchanged (it returns `total` = Meta-only for AdsView). The Blended ROAS in AdsView needs to be updated to use `metaAdSpend + googleAdSpend` — or fetch from both platforms. Clarify this during planning.
**Warning signs:** ROAS shows only Meta spend in denominator after Google connect

---

## Code Examples

### OAuth URL Construction (google-ads-auth.js)

```javascript
// Source: Google Ads API OAuth docs + ads-auth.js pattern (HIGH confidence)
const { OAuth2Client } = require('google-auth-library');

// In GET /google-ads/auth handler:
const state = crypto.randomBytes(16).toString('hex');
await prisma.oAuthState.create({ data: { state, shop } });

const client = new OAuth2Client(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  (process.env.SHOPIFY_APP_URL || '') + '/google-ads/callback'
);

const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/adwords'],
  state,
});
res.redirect(authUrl);
```

### Token Exchange in Callback

```javascript
// Source: google-auth-library official docs (HIGH confidence)
const { tokens } = await client.getToken(code); // code from ?code= query param
// tokens.refresh_token — encrypt and store in AdConnection
// tokens.access_token — use immediately for listAccessibleCustomers
const encryptedToken = encrypt(tokens.refresh_token);
```

### listAccessibleCustomers + Manager Account Filter

```javascript
// Source: Google Ads API docs (HIGH confidence)
// Step 1: List all accessible customer IDs
const listRes = await fetch(
  `https://googleads.googleapis.com/v18/customers:listAccessibleCustomers`,
  {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    },
  }
);
const { resourceNames } = await listRes.json();
// resourceNames = ["customers/1234567890", "customers/9876543210"]
const customerIds = (resourceNames || []).map(r => r.replace('customers/', ''));

// Step 2: For each ID, check customer.manager via GAQL
// (only needed when more than one ID returned)
let selectedId = customerIds[0]; // default
for (const customerId of customerIds) {
  const searchRes = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'SELECT customer.id, customer.manager FROM customer LIMIT 1' }),
    }
  );
  const data = await searchRes.json();
  const isManager = data.results?.[0]?.customer?.manager;
  if (!isManager) { selectedId = customerId; break; }
}
```

### GAQL Campaign Spend Sync (syncAdSpend.js Google branch)

```javascript
// Source: GAQL docs + REST search endpoint docs (HIGH confidence)
async function fetchGoogleCampaignSpend(customerId, refreshToken, since, until, shop) {
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(
    process.env.GOOGLE_ADS_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: refreshToken });

  let accessToken;
  try {
    const { token } = await client.getAccessToken();
    accessToken = token;
  } catch (err) {
    // invalid_grant = refresh token revoked
    if (err.message?.includes('invalid_grant') || err.response?.status === 401) {
      console.error(`syncAdSpend: Google refresh token revoked for ${shop} — deleting connection`);
      await prisma.adConnection.deleteMany({ where: { shop, platform: 'google' } });
      return [];
    }
    throw err;
  }

  const results = [];
  let pageToken = null;
  const query = `SELECT campaign.id, campaign.name, metrics.cost_micros
    FROM campaign
    WHERE segments.date >= '${since}' AND segments.date <= '${until}'
      AND metrics.cost_micros > 0`;

  do {
    const body = pageToken ? { query, pageToken } : { query };
    const res = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();

    if (res.status === 401) {
      console.error(`syncAdSpend: Google API 401 for ${shop} — deleting connection`);
      await prisma.adConnection.deleteMany({ where: { shop, platform: 'google' } });
      return [];
    }
    if (!res.ok) throw new Error(`Google Ads API error: ${JSON.stringify(data)}`);

    for (const row of data.results || []) {
      results.push({
        campaignId: row.campaign.id,
        campaignName: row.campaign.name,
        // int64 → string in JSON; parse before dividing
        spend: parseInt(row.metrics.costMicros || '0') / 1_000_000,
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return results;
}
```

### Overview Endpoint Extension (routes/api.js)

The current overview query at line ~204 does:
```javascript
// CURRENT (Phase 8 — Meta only):
const adConn = await prisma.adConnection.findFirst({ where: { shop, platform: 'meta' } });
let adSpend = null;
if (adConn) {
  const adRows = await prisma.adSpend.groupBy({ ... });
  adSpend = adRows.reduce(...);
}
```

**Phase 9 extension — separate fields per platform:**
```javascript
// PHASE 9 extension:
const [metaConn, googleConn] = await Promise.all([
  prisma.adConnection.findFirst({ where: { shop, platform: 'meta' } }),
  prisma.adConnection.findFirst({ where: { shop, platform: 'google' } }),
]);

const getSpend = async (platform, conn) => {
  if (!conn) return null;
  const rows = await prisma.adSpend.groupBy({
    by: ['platform'],
    where: { shop, platform, date: { gte: fromDate, lte: toDate } },
    _sum: { spend: true },
  });
  return rows.reduce((s, r) => s + Number(r._sum.spend || 0), 0);
};

const [metaAdSpend, googleAdSpend] = await Promise.all([
  getSpend('meta', metaConn),
  getSpend('google', googleConn),
]);

const totalAdSpend = [metaAdSpend, googleAdSpend]
  .filter(v => v !== null)
  .reduce((s, v) => s + v, 0) || (metaAdSpend === null && googleAdSpend === null ? null : 0);

const netProfitFinal = totalAdSpend !== null ? baseNetProfit - totalAdSpend : baseNetProfit;

// Return:
return res.json({ ..., metaAdSpend, googleAdSpend, totalAdSpend, netProfit: netProfitFinal, adSpend: totalAdSpend });
//                                                                      ^^ keep adSpend for WaterfallChart compat
```

**Note on `adSpend` backward compat:** WaterfallChart.jsx receives `adSpend={data.adSpend}`. Keep returning `adSpend` as `totalAdSpend` so no WaterfallChart change is needed.

### DELETE /api/ads/disconnect Extension

```javascript
// CURRENT (routes/ads.js line 105):
router.delete('/disconnect', async (req, res) => {
  await prisma.adConnection.deleteMany({
    where: { shop: req.shopDomain, platform: 'meta' }, // hardcoded
  });
  return res.json({ ok: true });
});

// PHASE 9 extension:
router.delete('/disconnect', async (req, res) => {
  const { platform } = req.query;
  if (!platform || !['meta', 'google'].includes(platform)) {
    return res.status(400).json({ error: 'platform query param required: meta or google' });
  }
  await prisma.adConnection.deleteMany({
    where: { shop: req.shopDomain, platform },
  });
  return res.json({ ok: true });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `google-ads-api` npm (gRPC) | REST via native `fetch` + `google-auth-library` | Phase 9 decision (locked) | No native binary compilation on Railway Docker |
| google-auth-library v10 (Node 18+) | google-auth-library ^9.15.1 | Node 16 constraint | v10 archived; v9.15.1 still functional, same API |
| Manager account auto-discovery | listAccessibleCustomers + customer.manager filter | Google Ads API best practice | Prevents GAQL errors on MCC accounts |

**Deprecated/outdated:**
- `google-ads-api` npm package: excluded — gRPC binary compilation unreliable on Railway Docker + Node 16
- Storing access tokens: expires in 1 hour — always store refresh tokens only

---

## Open Questions

1. **totalAdSpend null-vs-zero semantics in overview response**
   - What we know: current `adSpend` is `null` when no Meta connection, `number` (incl. 0) when connected
   - What's unclear: when Meta is connected (adSpend=30) and Google is not (googleAdSpend=null), `totalAdSpend` = 30 or do we keep `metaAdSpend` for net profit deduction?
   - Recommendation: `totalAdSpend = sum of non-null platform spend values`. If at least one platform is connected, `totalAdSpend` is a number. If none connected, `totalAdSpend = null`. Net profit deducts `totalAdSpend` when non-null. Keep `adSpend: totalAdSpend` in response for WaterfallChart backward compat.

2. **AdsView Blended ROAS denominator after Google addition**
   - What we know: AdsView.jsx reads `spendData.total` from `/api/ads/spend` for ROAS. That endpoint currently returns Meta spend only.
   - What's unclear: Should `/api/ads/spend` now return combined Meta+Google total? Or should AdsView sum `metaAdSpend + googleAdSpend` from overview?
   - Recommendation: Update `/api/ads/spend` to return `total = meta + google` combined (the response field already called `total` implies platform-agnostic). Drop the `platform: 'meta'` from the response since it's now blended. This is a one-line change in routes/ads.js that doesn't break the frontend if `total` remains the key.

3. **Test Account Access vs Production Token**
   - What we know: Phase 8 context said to apply for developer token during Phase 8 kickoff
   - What's unclear: Whether Test Account Access is already confirmed for this project
   - Recommendation: Treat as a prerequisite gate. Plan Wave 0 tests should mock all Google API calls with `global.fetch = jest.fn()` (same pattern as syncAdSpend.test.js) so no real API calls are needed for tests. The `GOOGLE_ADS_DEVELOPER_TOKEN` env var should be validated at startup if `google-ads-auth.js` is loaded.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `jest.config.js` (root) — `testMatch: ['**/tests/**/*.test.js']` |
| Quick run command | `npm test -- --testPathPattern=google` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADS-04 | GET /google-ads/auth returns iframe escape HTML | unit | `npm test -- --testPathPattern=google-ads` | ❌ Wave 0 |
| ADS-04 | GET /google-ads/callback stores encrypted refresh token in AdConnection | unit | `npm test -- --testPathPattern=google-ads` | ❌ Wave 0 |
| ADS-04 | DELETE /api/ads/disconnect?platform=google deletes AdConnection row | unit | `npm test -- --testPathPattern=ads` | ✅ (ads.test.js exists — extend) |
| ADS-05 | syncAdSpend('google') fetches GAQL, upserts AdSpend with micros/1e6 | unit | `npm test -- --testPathPattern=syncAdSpend` | ✅ (syncAdSpend.test.js exists — extend) |
| ADS-05 | /api/dashboard/overview returns googleAdSpend, metaAdSpend, totalAdSpend | unit | `npm test -- --testPathPattern=dashboard` | ✅ (dashboard.test.js exists — extend) |
| ADS-05 | Google UNAUTHENTICATED error deletes AdConnection and returns without throw | unit | `npm test -- --testPathPattern=syncAdSpend` | ✅ (extend syncAdSpend.test.js) |
| ADS-06 | /api/ads/campaigns returns Google campaign rows alongside Meta | unit | `npm test -- --testPathPattern=ads` | ✅ (ads.test.js exists — campaigns query already tests groupBy) |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=google-ads\|syncAdSpend\|ads`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/google-ads.test.js` — covers ADS-04 (OAuth flow: GET /auth iframe escape, GET /callback upsert, DELETE /api/ads/disconnect?platform=google)
- [ ] Extend `tests/syncAdSpend.test.js` — add Google branch tests: happy path micros conversion, `invalid_grant` no-throw + deleteMany, `platform='google'` no longer throws unsupported
- [ ] Extend `tests/ads.test.js` — add DELETE /disconnect?platform=google test
- [ ] Extend `tests/dashboard.test.js` — add overview tests for `metaAdSpend`, `googleAdSpend`, `totalAdSpend` fields

**Existing infrastructure sufficient for:**
- `tests/__mocks__/prisma.js` — already has `adConnection.*` and `adSpend.*` mocks
- `global.fetch = jest.fn()` pattern — established in syncAdSpend.test.js
- `makeApp()` test app factory pattern — established in ads.test.js
- `process.env.ADS_ENCRYPTION_KEY` mock setup — established in ads.test.js and syncAdSpend.test.js

New env var needed in tests: `process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-dev-token'`

---

## Sources

### Primary (HIGH confidence)
- Google Ads API REST docs (developers.google.com/google-ads/api/rest) — REST endpoint format, search method, pagination
- Google Ads REST auth docs (developers.google.com/google-ads/api/docs/rest/auth) — required headers, refresh token flow
- GAQL query structure docs (developers.google.com/google-ads/api/docs/query/structure) — `metrics.cost_micros`, `segments.date`, WHERE clause syntax
- GAQL Query Cookbook (developers.google.com/google-ads/api/docs/query/cookbook) — campaign spend query pattern
- Account hierarchy docs (developers.google.com/google-ads/api/docs/account-management/get-account-hierarchy) — `customer_client.manager` boolean, GAQL for manager detection
- listAccessibleCustomers docs (developers.google.com/google-ads/api/docs/account-management/listing-accounts) — endpoint format and response shape
- google-auth-library CHANGELOG (github.com/googleapis/google-auth-library-nodejs) — v10.0.0 Node 18+ requirement confirmed
- Existing codebase: `routes/ads-auth.js`, `lib/syncAdSpend.js`, `routes/ads.js`, `routes/api.js` — patterns confirmed by code inspection

### Secondary (MEDIUM confidence)
- WebSearch results on google-auth-library Node 16 compatibility — cross-verified with CHANGELOG
- WebSearch results on GAQL `metrics.cost_micros` int64 string serialization — cross-verified with community discussions and GAQL field reference

### Tertiary (LOW confidence)
- Exact `invalid_grant` error message string from `google-auth-library` — needs runtime verification in test. Confirmed pattern exists but exact `err.message` value requires testing.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — google-auth-library v9/v10 Node boundary confirmed from official changelog; REST endpoint format from official docs
- Architecture: HIGH — patterns directly derived from existing Phase 8 code (ads-auth.js, syncAdSpend.js) and Google Ads API docs
- GAQL query: HIGH — field names `campaign.id`, `campaign.name`, `metrics.cost_micros`, date WHERE clause confirmed from official GAQL docs and Query Cookbook
- Micros conversion: HIGH — int64-as-string serialization is a documented Google API pattern; `parseInt / 1_000_000` is the established convention
- Pitfalls: HIGH — all pitfalls derived from official docs or confirmed code analysis
- `invalid_grant` error handling: MEDIUM — pattern is correct but exact error string should be verified at runtime

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (stable APIs; Google Ads API v18 sunset schedule is the main risk)
