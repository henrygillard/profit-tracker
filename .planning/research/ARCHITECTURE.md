# Architecture Research

**Domain:** Shopify Profit Analytics — v2.0 Feature Integration
**Researched:** 2026-03-18
**Confidence:** HIGH (existing codebase read directly; OAuth CSP constraints verified against Shopify community + official docs; Meta/Google token lifecycle verified against official developer docs)

---

## Scope

This document is focused on how the five v2.0 features integrate with the existing v1.0 architecture. It does not re-document v1.0 components except where they are modified.

**Features addressed:**
1. Payout fee fix (FEE-FIX-01)
2. Waterfall chart (CHART-01)
3. Margin alerts (ALERT-01)
4. Meta Ads integration (ADS-01)
5. Google Ads integration (ADS-02 / ADS-03)

---

## System Overview (v2.0)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     React SPA (web/src/)                             │
│                                                                      │
│  Overview  Orders  Products  [NEW] Ads  [NEW] AlertBanner           │
│      │       │        │           │           │                      │
│      └───────┴────────┴───────────┴───────────┘                     │
│                        apiFetch (JWT Bearer)                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS
┌────────────────────────────────▼────────────────────────────────────┐
│                     Express server (server.js)                       │
│                                                                      │
│  /api/* → verifySessionToken → routes/api.js                        │
│  [NEW] /auth/meta → routes/ads-auth.js (top-level redirect)         │
│  [NEW] /auth/meta/callback → routes/ads-auth.js                     │
│  [NEW] /auth/google → routes/ads-auth.js (top-level redirect)       │
│  [NEW] /auth/google/callback → routes/ads-auth.js                   │
│  /api/ads/* → routes/api.js (JWT-protected, new handlers)           │
│                                                                      │
│  scheduler.js → [EXTENDED] syncPayouts, syncAdSpend (new)           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ Prisma
┌────────────────────────────────▼────────────────────────────────────┐
│                       PostgreSQL (Prisma ORM)                        │
│                                                                      │
│  Existing: ShopSession, Order, LineItem, OrderProfit, ProductCost,  │
│            ShopConfig, OAuthState                                    │
│                                                                      │
│  [NEW] AdConnection  — Meta/Google OAuth tokens per shop            │
│  [NEW] AdSpend       — daily campaign spend, synced from Ads APIs   │
│  ShopConfig [EXTENDED] — margin threshold alert config              │
│  OAuthState [EXTENDED] — platform discriminator for ads OAuth       │
└─────────────────────────────────────────────────────────────────────┘
                         │                    │
          ┌──────────────┘                    └────────────────┐
          ▼                                                     ▼
  Shopify Payments GraphQL                          Meta / Google Ads APIs
  (balance transactions —                          (Insights / Reporting —
   fee verification fix)                            daily spend per campaign)
```

---

## Feature 1: Payout Fee Fix

### Problem

`syncPayouts.js` currently fetches all balance transactions across all pages and writes the `fee` to `OrderProfit.feesTotal`. Two known open questions from v1.0:
- The `transaction.fees` field path needs live verification against a real Shopify Payments store
- The payout-to-order 1:1 mapping has not been confirmed in production

The GraphQL field in the current query is `fee { amount }` on `ShopifyPaymentsBalanceTransaction`. Per official Shopify docs (verified), this field is `fee` of type `MoneyV2` — the field name is correct. The current code filters `type === 'CHARGE'` and sums multiple CHARGE transactions per order — this is correct behavior for split payments.

The key fix: currently the sync processes all balance transactions regardless of whether the associated payout has been finalized. Filtering to `payout_status:PAID` ensures only settled fees are written. The `payments_transfer_id` filter for fetching transactions by payout ID is confirmed available via community verification (not yet in official docs).

### What Changes

**Modified: `lib/syncPayouts.js`**

- Add `query: "payout_status:PAID"` filter to `balanceTransactions` to only process finalized payouts
- Add diagnostic logging that records the raw fee values seen per order on first run, enabling live verification
- No schema changes needed — `OrderProfit.feesTotal` already stores this value

**Modified: `routes/api.js`**

- `POST /api/sync/payouts` already exists — no route change needed
- Add `GET /api/sync/payouts/status` returning last sync timestamp and fee coverage percentage (orders with non-zero feesTotal vs. total Shopify Payments orders) — useful for manual verification

### Data Flow

```
POST /api/sync/payouts
    ↓
syncPayouts(prisma, shop, accessToken)
    ↓
shopifyPaymentsAccount.balanceTransactions
  query: "payout_status:PAID"         ← add this filter
  filter client-side: type === 'CHARGE'  ← already in place
    ↓
fee { amount } per associatedOrder.id
    ↓
OrderProfit.feesTotal = sum of fees per order  ← already in place, no change
```

### Confidence Notes

HIGH confidence on `fee` field name — confirmed in Shopify official docs.
MEDIUM confidence on `payout_status:PAID` filter syntax — confirmed in Shopify developer community thread (https://community.shopify.dev/t/balance-transactions-by-payout-id/20934), not yet in official docs.

---

## Feature 2: Waterfall Chart

### Problem

The per-order profit breakdown data already exists in `OrderProfit` (revenueNet, cogsTotal, feesTotal, shippingCost, netProfit). The waterfall chart just needs a new API endpoint that structures this data for rendering, and a new React component.

### What Changes

**New API endpoint in `routes/api.js`: `GET /api/dashboard/orders/:orderId/waterfall`**

No schema change needed. The endpoint joins `Order` (for name and date) with `OrderProfit` (for all cost components) and returns a `bars` array shaped for Recharts.

Response shape:
```json
{
  "orderId": "gid://shopify/Order/12345",
  "orderName": "#1001",
  "processedAt": "2026-03-15T10:00:00Z",
  "bars": [
    { "label": "Revenue",  "value": 120.00, "cumulative": 120.00, "type": "positive" },
    { "label": "COGS",     "value": -45.00, "cumulative": 75.00,  "type": "negative" },
    { "label": "Fees",     "value": -3.60,  "cumulative": 71.40,  "type": "negative" },
    { "label": "Shipping", "value": -8.00,  "cumulative": 63.40,  "type": "negative" },
    { "label": "Profit",   "value": 63.40,  "cumulative": 63.40,  "type": "total"    }
  ],
  "marginPct": 52.8,
  "cogsKnown": true
}
```

The `cumulative` field carries the running total for the invisible offset bar in the waterfall stacking trick. This is computed server-side so the React component doesn't need to know the calculation logic.

Security note: must verify `op.shop === req.shopDomain` before returning data — orderId alone is not a sufficient authorization check.

**New React component: `web/src/components/WaterfallChart.jsx`**

- Receives `orderId` prop, fetches the endpoint above
- Renders via Recharts `ComposedChart` with two stacked bars per step: invisible offset bar + colored bar
- Recharts is already in the project (used by `TrendChart.jsx`) — no new dependency

**Modified: `web/src/components/OrdersTable.jsx`**

- Add row click handler that sets `selectedOrderId` state
- Render `<WaterfallChart orderId={selectedOrderId} />` below the selected row or in a panel

### Data Flow

```
User clicks order row → selectedOrderId = orderId
    ↓
WaterfallChart mounts → apiFetch('/api/dashboard/orders/{id}/waterfall')
    ↓
GET /api/dashboard/orders/:orderId/waterfall
  prisma.orderProfit.findUnique({ where: { orderId }, include: { order: true } })
  verify op.shop === req.shopDomain
  build bars array with cumulative offsets
    ↓
Recharts ComposedChart renders waterfall
```

### No Schema Changes Needed

All required data is in existing `OrderProfit` and `Order` tables.

---

## Feature 3: Margin Alerts

### Problem

Margin alerts need three things:
1. Per-shop threshold config stored persistently
2. Alert evaluation logic (identify products below threshold)
3. UI surface (when/where alerts are shown)

### Schema Change: Extend `ShopConfig`

Adding two columns to the existing `ShopConfig` model is simpler than a new table — `ShopConfig` is already the per-shop settings record and uses the same shop-scoped upsert pattern.

```prisma
// Add to ShopConfig model:
marginThresholdPct Decimal? @map("margin_threshold_pct") @db.Decimal(6, 2)  // null = alerts disabled
alertsEnabled      Boolean  @default(false) @map("alerts_enabled")
```

### New API Endpoints in `routes/api.js`

`GET /api/alerts` — evaluate and return current alerts:

```json
{
  "alerts": [
    {
      "type": "low_margin_product",
      "variantId": "gid://shopify/ProductVariant/123",
      "productName": "Widget Blue",
      "sku": "WB-001",
      "marginPct": 4.2,
      "thresholdPct": 15.0,
      "orderCount": 12
    }
  ],
  "thresholdPct": 15.0,
  "alertsEnabled": true,
  "evaluatedAt": "2026-03-18T10:00:00Z"
}
```

Evaluation logic: re-run a variant of the existing `/api/dashboard/products` query (already a `$queryRaw`), filter for `marginPct < thresholdPct` over the last 30 days. The query is fast because `order_profits` and `line_items` are already indexed on `shop`.

`PUT /api/alerts/config` — update threshold settings:
```json
{ "thresholdPct": 15.0, "alertsEnabled": true }
```

### UI Integration

**Modified: `web/src/App.jsx`**

- Fetch `/api/alerts` on mount (alongside the existing health check)
- If `alerts.length > 0 && alertsEnabled`, pass alerts to a new `AlertBanner` component

**New: `web/src/components/AlertBanner.jsx`**

- Dismissable banner at top of page
- Shows: "X products below {threshold}% margin — view Products tab"
- Dismiss stores to `localStorage` keyed by alert count + threshold — resets when new alerts appear

**Modified: `web/src/components/ProductsTable.jsx`**

- Add threshold config control (input + save) calling `PUT /api/alerts/config`
- Visually highlight low-margin rows (conditional CSS class on rows below threshold)

### Data Flow

```
App mounts → apiFetch('/api/alerts')
    ↓
GET /api/alerts
    ↓
ShopConfig.marginThresholdPct check → evaluate $queryRaw products query
    ↓
Filter: marginPct < thresholdPct (last 30 days)
    ↓
Return alerts array + config metadata
    ↓
AlertBanner renders if alerts present + alertsEnabled
```

### Performance Note

Alert evaluation re-runs the products aggregation query on every page load. Acceptable at current scale (most target stores have fewer than 10K orders/month). The query has a 30-day fixed window, uses existing indexes, and is the same query already used by the Products tab. No caching layer needed for v2.0.

---

## Features 4 & 5: Meta Ads + Google Ads Integration

These two features share infrastructure. They are documented together.

### Core Architectural Challenge: OAuth in Embedded Context

**Constraint (HIGH confidence — verified against Shopify developer community 2026 + official docs):**

The Shopify Admin embeds the app in an iframe. Third-party OAuth providers (Meta, Google) set `X-Frame-Options: DENY` on their authorization pages — OAuth cannot complete inside the iframe. Popup windows (`window.open`) are also unreliable: the Shopify Admin shell intercepts navigation and "reclaims" popup windows, preventing reliable auto-closure. This behavior is documented and acknowledged by Shopify engineers (source: community.shopify.dev/t/shopify-oauth-popup-cannot-auto-close/28862).

**Recommended solution: top-level full-page redirect via `window.top.location.href`**

This is the same pattern already used in the existing codebase. `routes/auth.js` already uses `form.target = '_top'` to break out of the iframe for Shopify OAuth. The billing confirmation URL redirect in `server.js` uses the same approach. Ads OAuth follows the identical pattern.

Flow:
1. User clicks "Connect Meta Ads" button in the embedded UI
2. Frontend calls `GET /api/ads/meta/connect` which returns `{ redirectUrl: '/auth/meta?shop=...' }`
3. Frontend sets `window.top.location.href = redirectUrl` — escapes the Shopify iframe
4. `/auth/meta` (server-side) generates CSRF state, redirects to Meta OAuth URL
5. Meta redirects to `/auth/meta/callback?code=...&state=...`
6. Callback exchanges code for long-lived token, stores in `AdConnection`, redirects to `/admin?shop=...&view=ads`
7. React SPA resumes in ads view showing "Connected" status

Google follows the identical pattern with `/auth/google` and `/auth/google/callback`.

### Schema Change: `AdConnection` Model (new)

```prisma
model AdConnection {
  id             Int       @id @default(autoincrement())
  shop           String
  platform       String    // 'meta' | 'google'
  accessToken    String    @map("access_token")
  refreshToken   String?   @map("refresh_token")        // Google only
  tokenExpiresAt DateTime? @map("token_expires_at")     // null = non-expiring (Meta Standard access)
  adAccountId    String?   @map("ad_account_id")        // Meta: act_XXXXX, Google: customer ID
  accountName    String?   @map("account_name")         // display name for UI
  isActive       Boolean   @default(true) @map("is_active")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@unique([shop, platform])   // one connection per platform per shop
  @@index([shop])
  @@map("ad_connections")
}
```

### Schema Change: `AdSpend` Model (new)

```prisma
model AdSpend {
  id           Int      @id @default(autoincrement())
  shop         String
  platform     String   // 'meta' | 'google'
  campaignId   String   @map("campaign_id")
  campaignName String?  @map("campaign_name")
  date         DateTime @db.Date   // day granularity
  spend        Decimal  @db.Decimal(12, 2)
  impressions  Int?
  clicks       Int?
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@unique([shop, platform, campaignId, date])  // idempotency key for upsert
  @@index([shop, platform, date])
  @@map("ad_spends")
}
```

### Schema Change: Extend `OAuthState`

Reuse the existing `OAuthState` model for ads OAuth CSRF state. Add a `platform` discriminator rather than creating a parallel table.

```prisma
// Add to OAuthState model:
platform String?  // null = Shopify install, 'meta' | 'google' = ads OAuth
```

### New File: `routes/ads-auth.js`

Handles OAuth initiation and callbacks for both platforms. Registered in `server.js` as a top-level router (not under `/api` — no JWT needed since these routes are accessed from the full-page window, not the embedded app).

```javascript
// routes/ads-auth.js key routes:
GET  /auth/meta           → CSRF state → redirect to Meta OAuth URL
GET  /auth/meta/callback  → verify state, exchange code, store AdConnection, redirect /admin
GET  /api/ads/meta/connect  → returns { redirectUrl } for frontend to use with window.top
GET  /auth/google         → CSRF state → redirect to Google OAuth URL (access_type=offline)
GET  /auth/google/callback → verify state, exchange code+refresh tokens, store AdConnection, redirect /admin
GET  /api/ads/google/connect → returns { redirectUrl }
DELETE /api/ads/:platform/disconnect → JWT-protected, marks AdConnection.isActive=false
```

The `/api/ads/*/connect` endpoints are JWT-protected (under `/api`) since they are called from within the embedded app. The `/auth/meta` and `/auth/google` callback routes are NOT under `/api` and have no JWT requirement — they arrive from external redirects.

### Token Lifecycle

**Meta tokens:**

Meta short-lived tokens (from OAuth code exchange) last ~1 hour. Exchange for a long-lived token immediately after the code exchange:

```
POST https://graph.facebook.com/v21.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &fb_exchange_token={short_lived_token}
```

Apps with Standard Access to the Marketing API receive non-expiring long-lived tokens (confirmed via official Meta docs). Store with `tokenExpiresAt = null`. No refresh needed unless token is revoked. If a sync call returns `OAuthException` with code 190, mark `AdConnection.isActive = false` and surface re-connect prompt in UI.

**Google tokens:**

Exchange OAuth code with `access_type=offline` and `prompt=consent` to ensure a refresh token is returned. Access tokens expire in 1 hour. Before each `syncAdSpend` call:

```javascript
if (connection.tokenExpiresAt < Date.now() + 5 * 60 * 1000) {
  // refresh: POST https://oauth2.googleapis.com/token with refresh_token
  // update AdConnection.accessToken and tokenExpiresAt
}
```

The refresh token does not expire (as long as the Google app is in production status, not test mode — test mode tokens expire in 7 days). Store refresh token in `AdConnection.refreshToken`.

### New File: `lib/syncAdSpend.js`

```
syncAdSpend(prisma, shop)
    ↓
prisma.adConnection.findMany({ where: { shop, isActive: true } })
    ↓
For each connection:

  if platform === 'meta':
    GET https://graph.facebook.com/v21.0/act_{adAccountId}/insights
      ?fields=campaign_id,campaign_name,spend,impressions,clicks
      &time_range={"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}
      &level=campaign
      &access_token={accessToken}
    → AdSpend.upsert per campaign row

  if platform === 'google':
    check tokenExpiresAt → refresh if needed
    Google Ads API GAQL (REST):
      SELECT campaign.id, campaign.name,
             metrics.cost_micros, metrics.impressions, metrics.clicks
      FROM campaign
      WHERE segments.date DURING YESTERDAY
    → divide cost_micros by 1,000,000 to get dollars
    → AdSpend.upsert per campaign row
```

Both platforms are handled in one file using a platform dispatch. The `AdSpend` schema's `@@unique([shop, platform, campaignId, date])` constraint makes upserts idempotent — safe to re-run.

### Modified: `lib/scheduler.js`

Extend the existing cron job to call `syncAdSpend` after `syncIncrementalOrders`. Must wrap in try/catch so a single shop's ads sync failure doesn't abort other shops.

Ad spend is day-granularity, so skip if today's records already exist for this shop+platform (check before fetching from the external API to avoid unnecessary API calls).

### Ad Spend Attribution to Orders

**This is the hardest architectural decision in v2.0.**

True per-order attribution requires capturing click IDs (fbclid, gclid) at checkout and storing them in order metafields. This requires front-end store modifications (pixel or web pixel app extension) which go beyond an embedded admin-only app and is out of scope for v2.0.

Shopify's `CustomerJourneySummary` GraphQL object does expose attribution source data (verified via official docs — `customerJourneySummary.firstVisit` and `moments` contain UTM parameters and source). However, this data is only available for online store orders, only within a 30-day window, and not reliably populated for all orders. Fetching and storing this during order sync is possible but adds sync complexity for uncertain coverage.

**Recommended v2.0 attribution model: campaign-level daily spend allocation (blended ROAS)**

Attribute ad spend to the day's orders in aggregate. This is how competitors present data before pixel installation is complete.

```
Daily blended ROAS for a shop:
  For each day in range:
    total_ad_spend = SUM(AdSpend WHERE date = day AND shop = shop)
    total_revenue  = SUM(OrderProfit.revenueNet WHERE order.processedAt::date = day)
    daily_roas     = total_revenue / total_ad_spend
    true_roas      = SUM(netProfit) / total_ad_spend
```

This is labeled explicitly in the UI as "Blended ROAS" to be honest about the attribution method. Per-campaign view shows spend per campaign vs. total store revenue — useful for budget allocation decisions even without per-order attribution.

### New API Endpoints in `routes/api.js`

`GET /api/dashboard/ads-overview?from=&to=`

```json
{
  "from": "2026-02-18",
  "to": "2026-03-18",
  "connections": [
    { "platform": "meta", "accountName": "My Store", "isActive": true },
    { "platform": "google", "accountName": null, "isActive": false }
  ],
  "totalAdSpend": 1240.50,
  "totalRevenue": 18400.00,
  "blendedRoas": 14.83,
  "totalNetProfit": 6200.00,
  "trueRoas": 5.00,
  "byCampaign": [
    {
      "platform": "meta",
      "campaignId": "123456",
      "campaignName": "Spring Sale",
      "spend": 640.00,
      "clicks": 1820,
      "impressions": 42000
    }
  ],
  "byDay": [
    { "date": "2026-03-17", "adSpend": 42.00, "revenue": 620.00, "netProfit": 210.00 }
  ]
}
```

The `byDay` array joins `AdSpend` aggregate (GROUP BY date) with the existing trend query data. It's a SQL JOIN between two tables, both indexed on `(shop, date)`.

### New React Component: `web/src/components/AdsOverview.jsx`

- Connection status cards per platform with "Connect" / "Reconnect" / "Disconnect" buttons
- Blended ROAS and True ROAS summary cards (labeled clearly as blended)
- Daily spend vs. revenue line chart (extend `TrendChart.jsx` pattern with Recharts)
- Campaign spend table sorted by spend DESC

### Modified: `web/src/App.jsx`

- Add `ads` to the TABS array
- Fetch connection status on mount: `GET /api/dashboard/ads-overview?from=...&to=...`
- Show Ads tab regardless of connection status (the tab content handles the "not connected" empty state)

### New Required Environment Variables

```
META_APP_ID=
META_APP_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
```

Add to Railway deployment config. Add to the `REQUIRED_ENV` check in `server.js` only if ads features are considered required — otherwise treat as optional and degrade gracefully (show "connect" prompt but don't crash if env vars are missing).

---

## Component Map: New vs Modified

| Component | Status | Location | What Changes |
|-----------|--------|----------|--------------|
| `lib/syncPayouts.js` | MODIFIED | server | Add `payout_status:PAID` filter, diagnostic logging |
| `routes/api.js` | MODIFIED | server | Waterfall endpoint, alerts endpoints, ads-overview endpoint, connect/disconnect endpoints |
| `routes/ads-auth.js` | NEW | server | Meta + Google OAuth initiation and callbacks |
| `lib/syncAdSpend.js` | NEW | server | Daily ad spend fetch from Meta/Google APIs with token refresh |
| `lib/scheduler.js` | MODIFIED | server | Add `syncAdSpend` call per shop per tick |
| `prisma/schema.prisma` | MODIFIED | db | Add `AdConnection`, `AdSpend`; extend `ShopConfig` (alerts); extend `OAuthState` (platform) |
| `server.js` | MODIFIED | server | Register `routes/ads-auth.js`; add new env vars to validation |
| `web/src/App.jsx` | MODIFIED | frontend | Add Ads tab, AlertBanner data fetch, ads connection check |
| `web/src/components/WaterfallChart.jsx` | NEW | frontend | Per-order cost waterfall via Recharts |
| `web/src/components/OrdersTable.jsx` | MODIFIED | frontend | Row click sets selectedOrderId, renders WaterfallChart |
| `web/src/components/AlertBanner.jsx` | NEW | frontend | Dismissable low-margin alert banner |
| `web/src/components/ProductsTable.jsx` | MODIFIED | frontend | Threshold config UI, low-margin row highlighting |
| `web/src/components/AdsOverview.jsx` | NEW | frontend | Connection status, ROAS cards, campaign table, day chart |

---

## Schema Changes Summary

All changes can go in one Prisma migration file.

```prisma
// 1. Extend ShopConfig (margin alerts)
model ShopConfig {
  // ... existing fields unchanged ...
  marginThresholdPct Decimal? @map("margin_threshold_pct") @db.Decimal(6, 2)
  alertsEnabled      Boolean  @default(false) @map("alerts_enabled")
}

// 2. Extend OAuthState (ads OAuth CSRF)
model OAuthState {
  // ... existing fields unchanged ...
  platform String?  // null = Shopify, 'meta' | 'google' = ads OAuth
}

// 3. NEW: AdConnection — per-shop OAuth tokens for ad platforms
model AdConnection {
  id             Int       @id @default(autoincrement())
  shop           String
  platform       String    // 'meta' | 'google'
  accessToken    String    @map("access_token")
  refreshToken   String?   @map("refresh_token")
  tokenExpiresAt DateTime? @map("token_expires_at")
  adAccountId    String?   @map("ad_account_id")
  accountName    String?   @map("account_name")
  isActive       Boolean   @default(true) @map("is_active")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@unique([shop, platform])
  @@index([shop])
  @@map("ad_connections")
}

// 4. NEW: AdSpend — daily campaign spend synced from Meta/Google
model AdSpend {
  id           Int      @id @default(autoincrement())
  shop         String
  platform     String
  campaignId   String   @map("campaign_id")
  campaignName String?  @map("campaign_name")
  date         DateTime @db.Date
  spend        Decimal  @db.Decimal(12, 2)
  impressions  Int?
  clicks       Int?
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@unique([shop, platform, campaignId, date])
  @@index([shop, platform, date])
  @@map("ad_spends")
}
```

---

## Data Flows

### Ads OAuth Flow (top-level redirect)

```
User clicks "Connect Meta Ads" in embedded app
    ↓
apiFetch('/api/ads/meta/connect') → { redirectUrl: '/auth/meta?shop=...' }
    ↓
window.top.location.href = redirectUrl    ← escapes Shopify iframe
    ↓
GET /auth/meta?shop=...
  generate state → OAuthState({ state, shop, platform: 'meta' })
  redirect → https://www.facebook.com/v21.0/dialog/oauth
               ?client_id={META_APP_ID}
               &redirect_uri={APP_URL}/auth/meta/callback
               &scope=ads_read,ads_management
               &state={state}
    ↓
User approves on Meta (top-level browser window)
    ↓
GET /auth/meta/callback?code=...&state=...
  verify state (OAuthState lookup, delete after use)
  POST to Meta token endpoint → short-lived access token
  POST to Meta token exchange endpoint → long-lived token (non-expiring for Standard access)
  GET /me/adaccounts → fetch available ad accounts
  AdConnection.upsert({ shop, platform: 'meta', accessToken, adAccountId, accountName })
  redirect → /admin?shop=...&view=ads
    ↓
/admin serves React SPA → view=ads → AdsOverview shows "Connected"
```

### Ad Spend Sync Flow

```
scheduler.js cron tick (every 15 min)
    ↓
syncAdSpend(prisma, shop) — wrapped in try/catch per shop
    ↓
Check: AdSpend exists for today + shop? → skip (idempotency gate)
    ↓
AdConnection.findMany({ shop, isActive: true })
    ↓
For platform='meta':
  GET graph.facebook.com/v21.0/act_{adAccountId}/insights
    fields: campaign_id, campaign_name, spend, impressions, clicks
    time_range: yesterday
    level: campaign
  → AdSpend.upsert per row

For platform='google':
  if tokenExpiresAt < now+5min: refresh access token
  Google Ads API GAQL query for yesterday's campaign metrics
  → convert cost_micros / 1,000,000
  → AdSpend.upsert per row
```

### Waterfall Chart Data Flow

```
User clicks order row in OrdersTable
    ↓
selectedOrderId state set → WaterfallChart mounts
    ↓
apiFetch('/api/dashboard/orders/{orderId}/waterfall')
    ↓
GET /api/dashboard/orders/:orderId/waterfall
  prisma.orderProfit.findUnique({ where: { orderId }, include: { order: true } })
  SECURITY: verify op.shop === req.shopDomain
  build bars array with cumulative offsets
    ↓
WaterfallChart renders via Recharts ComposedChart
```

### Margin Alert Evaluation Flow

```
App mounts → apiFetch('/api/alerts')
    ↓
GET /api/alerts
  ShopConfig.findFirst({ shop }) → get thresholdPct
  if !alertsEnabled: return { alerts: [], alertsEnabled: false }
  $queryRaw: variant-level margin query (last 30 days)
  filter: marginPct < thresholdPct
    ↓
Return alerts array
    ↓
App passes to AlertBanner → renders if alerts.length > 0
```

---

## Architectural Patterns

### Pattern 1: Top-Level Redirect for Third-Party OAuth

**What:** Escape the Shopify iframe by setting `window.top.location.href` to a server-side route that performs the redirect. On callback, redirect back to `/admin?shop=...&view=ads`.

**When to use:** Any time the app needs to authorize against an external service (Meta, Google, or future platforms) from within the embedded context.

**Trade-offs:** User briefly leaves Shopify Admin — unavoidable given iframe restrictions. The return redirect lands back in the embedded context correctly. This is the same pattern already used for Shopify OAuth and billing confirmation.

**Example:**
```javascript
// Frontend: escape the iframe
const { redirectUrl } = await apiFetch('/api/ads/meta/connect');
window.top.location.href = redirectUrl;

// Backend: routes/ads-auth.js
router.get('/auth/meta', async (req, res) => {
  const { shop } = req.query;
  const state = crypto.randomBytes(16).toString('hex');
  await prisma.oAuthState.create({ data: { state, shop, platform: 'meta' } });
  res.redirect(`https://www.facebook.com/v21.0/dialog/oauth?client_id=...`);
});
```

### Pattern 2: Platform Dispatch in Shared Sync Module

**What:** `syncAdSpend.js` handles both Meta and Google via a `platform` switch on the `AdConnection` record. A shared `AdConnection` model with a `platform` discriminator avoids duplicating token storage and refresh logic.

**When to use:** When N platforms share the same data shape (campaign spend by day) but different API clients.

**Trade-offs:** Platform-specific code paths in one file. Preferable to two separate files (`syncMetaAdSpend.js`, `syncGoogleAdSpend.js`) that would both need the same scheduler wiring and AdSpend upsert logic.

### Pattern 3: Idempotent Upsert as Sync Safety Net

**What:** Use Prisma `upsert` with the `@@unique` constraint as the idempotency key. Safe to re-run sync without producing duplicate records.

**When to use:** `AdSpend` sync. Already used by `syncPayouts` (via direct update with P2025 error handling) and `syncOrders` (via Order upsert).

### Pattern 4: Degrade Gracefully on Missing Ad Connections

**What:** The Ads tab renders a "connect your account" empty state if no `AdConnection` exists for the shop. The scheduler's `syncAdSpend` is a no-op if `findMany` returns an empty array. No errors surfaced to unconnected shops.

**When to use:** Any feature dependent on optional per-shop external credentials.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing Ad Tokens into ShopSession

**What people do:** Add `metaAccessToken`, `googleAccessToken` columns to `ShopSession`.

**Why it's wrong:** `ShopSession` is the Shopify install credential. Mixing ad platform credentials into it couples unrelated concerns, makes uninstall cleanup harder, and creates an ever-wider table as more platforms are added.

**Do this instead:** Separate `AdConnection` table with `platform` discriminator. One row per shop per platform. Clean separation.

### Anti-Pattern 2: Client-Side Token Exchange

**What people do:** Make the Meta/Google code-to-token exchange from the React app (browser).

**Why it's wrong:** The app secret would be visible in browser network inspector. Both Meta and Google explicitly require server-side exchanges. A merchant or attacker could extract the secret.

**Do this instead:** All OAuth code exchanges happen server-side in `routes/ads-auth.js`. Frontend only initiates the redirect and reads the final connection status.

### Anti-Pattern 3: Labeling Blended ROAS as Per-Order Attribution

**What people do:** Distribute daily ad spend evenly across orders of that day and display as "ad cost per order" without qualification.

**Why it's wrong:** This fabricates individual attribution where none exists. Merchants may make incorrect product-level decisions based on artificially precise numbers.

**Do this instead:** Be explicit: "Blended ROAS — campaign-level attribution." True ROAS (revenue / (COGS + fees + ad spend)) is still a genuinely useful metric. Reserve per-order attribution for a future pixel-based implementation.

### Anti-Pattern 4: Popup Windows for Third-Party OAuth

**What people do:** `window.open(metaAuthUrl)` inside the embedded app to avoid a full-page redirect.

**Why it's wrong:** Shopify Admin shell intercepts popup navigation. Popups cannot reliably auto-close. This is a documented failure pattern with acknowledgment from Shopify engineering (2026).

**Do this instead:** `window.top.location.href = redirectUrl` to escape the iframe, complete OAuth at the top level, redirect back to `/admin?shop=...`.

### Anti-Pattern 5: Blocking Scheduler on Ads Sync Failures

**What people do:** `await syncAdSpend(shop)` in the cron loop without per-shop error catching.

**Why it's wrong:** A revoked Meta token or Google API quota error for one shop aborts ad spend sync for all remaining shops in that scheduler tick.

**Do this instead:** Wrap each shop's `syncAdSpend` in try/catch, same pattern as the existing `syncIncrementalOrders` loop already uses in `scheduler.js`.

---

## Recommended Build Order

Dependencies drive this sequence. Each phase delivers independently testable value.

### Phase 1: Payout Fee Fix

**Dependencies:** None. Modifies existing code only.
**Rationale:** Verify data quality before building the waterfall chart or ads attribution on top of potentially incorrect fee data. If feesTotal is wrong, everything downstream is wrong.

- Modify `lib/syncPayouts.js` (filter + diagnostic logging)
- Add `GET /api/sync/payouts/status` to `routes/api.js`
- Test on a real Shopify Payments store; confirm fee values match payout details page

### Phase 2: Waterfall Chart

**Dependencies:** Phase 1 (trustworthy fee data makes the chart meaningful).
**Rationale:** No schema changes, pure read-only feature on existing data. High visual impact, low implementation risk.

- Add `GET /api/dashboard/orders/:orderId/waterfall` to `routes/api.js`
- New `web/src/components/WaterfallChart.jsx`
- Modify `web/src/components/OrdersTable.jsx` (row click handler)

### Phase 3: Margin Alerts

**Dependencies:** Phase 1 (accurate fees affect margin percentages).
**Rationale:** Schema change required (migrate before UI). Alerts use the same product query already shipping in v1.0 — low logic risk.

- Prisma migration: extend `ShopConfig` (marginThresholdPct, alertsEnabled)
- Add `GET /api/alerts` and `PUT /api/alerts/config` to `routes/api.js`
- New `web/src/components/AlertBanner.jsx`
- Modify `web/src/components/ProductsTable.jsx` and `web/src/App.jsx`

### Phase 4: Ads Infrastructure + Meta Integration

**Dependencies:** Phase 3 complete (migration already in flight — batch all schema changes together).
**Rationale:** Largest phase. Establishes the shared AdConnection + AdSpend + OAuth infrastructure. Meta first because Marketing API Standard Access tokens are non-expiring (simpler than Google's refresh token flow).

- Prisma migration: `AdConnection`, `AdSpend`, extend `OAuthState` — all in one migration with Phase 3 changes if sequencing allows, or a second migration if Phase 3 ships independently
- New `routes/ads-auth.js` (Meta OAuth only)
- New `lib/syncAdSpend.js` (Meta platform handler)
- New `web/src/components/AdsOverview.jsx`
- Modify `lib/scheduler.js`, `server.js`, `web/src/App.jsx`

### Phase 5: Google Ads Integration

**Dependencies:** Phase 4 (shared AdConnection + AdSpend infrastructure + AdsOverview component).
**Rationale:** Google adds only the Google-specific OAuth routes and sync handler. No schema changes. The infrastructure is already in place.

- Add `/auth/google` and `/auth/google/callback` to `routes/ads-auth.js`
- Add Google platform handler to `lib/syncAdSpend.js` (with token refresh logic)
- Extend `web/src/components/AdsOverview.jsx` with Google connection UI

---

## Integration Points: Existing vs New

| Boundary | Existing Behavior | v2.0 Change |
|----------|------------------|-------------|
| `verifySessionToken` middleware | Guards all `/api/*` | Ads OAuth routes (`/auth/meta`, `/auth/google`) must be OUTSIDE `/api` — top-level window, no session token. `/api/ads/*/connect` endpoints remain inside `/api` (JWT-protected). |
| `scheduler.js` cron | `syncIncrementalOrders` only | Add `syncAdSpend` call; must not block order sync if ads sync fails |
| `OAuthState` model | Shopify install CSRF | Add `platform` column; existing `null` platform = Shopify install |
| `syncPayouts.js` | Called from API route + scheduler | Extend in-place; no interface change to callers |
| `profitEngine.js` | Pure calculation function | Not modified in v2.0 |
| CSP headers (`server.js`) | `frame-ancestors` per shop | OAuth callback routes arrive at top-level (not iframe) — no frame-ancestors issue on callbacks |
| `ShopConfig` model | Plan + third-party fee rate | Extend with alert threshold columns |

---

## Scaling Considerations

| Scale | Architecture Adjustment |
|-------|------------------------|
| 0–100 shops | Current in-process scheduler handles everything |
| 100–1K shops | 15-min cron may approach timeout. Parallelize shop syncs with `Promise.allSettled` instead of sequential loop. |
| 1K+ shops | Extract sync to worker process. Not needed for v2.0. |

**Google Ads API quota note:** Basic access developer tokens are limited to 15,000 operations/day. Each shop sync = 1 operation. At ~500 shops this becomes a constraint. Apply for Standard access (unlimited) once the app demonstrates traction. Surface this limitation proactively in the Ads connection UI ("syncs daily").

---

## Sources

- Shopify GraphQL Admin API — ShopifyPaymentsBalanceTransaction: https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction
- Shopify GraphQL Admin API — ShopifyPaymentsAccount: https://shopify.dev/docs/api/admin-graphql/latest/objects/shopifypaymentsaccount
- Shopify GraphQL Admin API — CustomerJourneySummary: https://shopify.dev/docs/api/admin-graphql/latest/objects/customerjourneysummary
- Shopify developer community — Balance Transactions filter by payout: https://community.shopify.dev/t/balance-transactions-by-payout-id/20934
- Shopify developer community — OAuth popup reclaim: https://community.shopify.dev/t/shopify-oauth-popup-cannot-auto-close-after-successful-install-when-initiated-from-admin-shopify-com-admin-shell-reclaiming-window/28862
- Meta Marketing API — Authorization: https://developers.facebook.com/docs/marketing-api/get-started/authorization
- Meta — Access tokens (long-lived): https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
- Meta Marketing API — Insights: https://developers.facebook.com/docs/marketing-api/insights/
- Google Ads API — OAuth2 overview: https://developers.google.com/google-ads/api/docs/oauth/overview
- Google OAuth2 — Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server

---
*Architecture research for: Shopify Profit Analytics v2.0*
*Researched: 2026-03-18*
