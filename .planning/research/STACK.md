# Stack Research

**Domain:** Shopify Profit Analytics — v2.0 new feature additions
**Researched:** 2026-03-18
**Confidence:** MEDIUM overall (Meta SDK confirmed current; Google Ads API Node.js community-maintained only; `google-auth-library` Node 16 compatibility requires verification at install time)

---

## Context: What Already Exists (Do Not Change)

- **Backend:** Node.js v16.20.2, Express, CommonJS (`require()` throughout)
- **Database:** PostgreSQL via Prisma `^5.22.0`
- **Frontend:** React 18.2 + Vite 4 + Recharts `^3.8.0` (already in `web/package.json`)
- **Auth:** `jsonwebtoken ^9.0.3` — Shopify JWT validation in place on all `/api/*` routes
- **Other backend:** `node-cron ^4.2.1`, `express-rate-limit ^7.5.0`, `multer ^2.1.1`, `csv-parser ^3.2.0`
- **Tests:** Jest 29 with manual `__mocks__/prisma.js`

Deployment is Railway via Docker. Any new package must run on Node 16.20.2.

The Recharts version already installed (`^3.8.0`) is sufficient for the waterfall chart. No frontend package changes are needed.

---

## Recommended Stack Additions

### New Backend Dependencies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `facebook-nodejs-business-sdk` | `^24.0.1` | Meta Marketing API: fetch ad account insights, campaign-level daily spend | Official Meta-published SDK. No `engines.node` field — no declared minimum Node version, safe on Node 16. CommonJS-compatible; fits existing `require()` codebase. Wraps Graph API v22 calls with typed objects. |
| `google-ads-api` | `^23.0.0` | Google Ads API: fetch campaign spend via GAQL queries | Best available Node.js option — community-maintained by Opteo but the most complete solution (323 stars, actively maintained, supports Google Ads API v19/v23). Google has no official Node.js client. Node 16 confirmed tested by maintainer. |
| `google-auth-library` | `^10.6.2` | Google OAuth2: exchange auth code for tokens, store and auto-refresh refresh tokens | Official Google library. `google-ads-api` uses it internally; surface it directly in the OAuth callback route to exchange codes and persist credentials. Auto-refreshes expired access tokens on every API call once `refresh_token` is stored. |

### No New Frontend Dependencies

| Feature | Approach | Rationale |
|---------|----------|-----------|
| Waterfall chart (CHART-01) | Existing `recharts ^3.8.0` `Bar` with `[low, high]` range data | Recharts has no native waterfall type but ships its own waterfall example using stacked `Bar` components with range values and a custom `shape` prop. Zero new packages. |
| Margin alert banners (ALERT-01) | Conditional JSX with existing Polaris CDN components | Alert/Banner patterns already available via Polaris CDN loaded in `index.html`. |

### No New Shopify API Changes

| Feature | Approach |
|---------|----------|
| Payout fee fix (FEE-FIX-01) | Existing Shopify GraphQL Admin API — update query in `lib/syncPayouts.js` to use `ShopifyPaymentsBalanceTransaction.fee` (MoneyV2) + `associatedOrder` fields, which provide confirmed 1:1 payout-to-order linkage in the `2025-10` schema |

---

## Installation

```bash
# From repo root — backend only
npm install facebook-nodejs-business-sdk@^24.0.1 google-ads-api@^23.0.0 google-auth-library@^10.6.2
```

No changes to `web/package.json`.

---

## Token Storage: New Prisma Model

Store OAuth credentials for Meta and Google in a new table. Encrypt tokens at rest using Node's built-in `crypto` module (AES-256-GCM) — no new package needed.

```prisma
model AdConnection {
  id             Int       @id @default(autoincrement())
  shop           String
  platform       String    // "meta" | "google"
  accountId      String    @map("account_id")      // Meta ad account ID or Google customer ID
  encryptedToken String    @map("encrypted_token") // AES-256-GCM ciphertext (base64)
  tokenIv        String    @map("token_iv")         // base64-encoded IV for decryption
  tokenTag       String    @map("token_tag")        // base64-encoded GCM auth tag
  tokenExpiry    DateTime? @map("token_expiry")     // null = non-expiring (Meta standard access)
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@unique([shop, platform])
  @@map("ad_connections")
}
```

Encryption key: `ADS_ENCRYPTION_KEY` env var (32 bytes, hex-encoded). Use `crypto.createCipheriv('aes-256-gcm', key, iv)`. No new package.

---

## Integration Patterns by Feature

**Meta Ads OAuth + Sync (ADS-01):**

1. Backend initiates redirect to `https://www.facebook.com/v22.0/dialog/oauth` with scopes `ads_read,ads_management`
2. Callback receives code, calls Graph API to exchange for short-lived token, then calls `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token` for a long-lived token (non-expiring for Standard Marketing API access)
3. Store encrypted long-lived token in `AdConnection` table
4. Sync job uses `facebook-nodejs-business-sdk`: `AdAccount.getInsights()` with date range and `fields: ['campaign_name', 'spend', 'date_start']`
5. Ad spend attribution to orders: join by `utm_campaign` / `utm_source` present in Shopify order `landingPageUrl` or `referringSite` field — best-effort UTM matching, not pixel-level

**Google Ads OAuth + Sync (ADS-02):**

1. Backend initiates redirect to Google OAuth2 endpoint with scope `https://www.googleapis.com/auth/adwords` and `access_type=offline` (required to receive refresh token)
2. `google-auth-library` `OAuth2Client.getToken(code)` exchanges code for `{ access_token, refresh_token, expiry_date }`
3. Store encrypted `refresh_token` in `AdConnection`; `google-auth-library` auto-acquires and refreshes access tokens on each call
4. Requires a **Google Ads developer token** (apply in Google Ads account — approval can take days; flag as dependency in requirements)
5. `google-ads-api` `customer.report()` with GAQL: `SELECT campaign.name, metrics.cost_micros, segments.date FROM campaign WHERE segments.date BETWEEN ... AND ...`
6. Attribution: same UTM-matching approach as Meta

**Waterfall Chart (CHART-01):**

Transform `OrderProfit` record into sequential `[base, top]` ranges:
- Revenue bar: `[0, revenueNet]` — green
- COGS bar: `[revenueNet - cogsTotal, revenueNet]` — red/orange (descending)
- Fees bar: `[revenueNet - cogsTotal - feesTotal, revenueNet - cogsTotal]` — red
- Shipping bar: next step down — red
- Net profit bar: `[0, netProfit]` — blue/green depending on sign

Use Recharts `BarChart` with each segment as a separate `Bar` component with `dataKey` returning `[low, high]` array. Custom `shape` prop colors bars. No new package — pure data transformation logic.

**Margin Alerts (ALERT-01):**

No new packages. Logic:
- New `alertThreshold` column on `ShopConfig` (Decimal, nullable — null means disabled)
- Backend route returns products/SKUs where `netProfit / revenueNet < threshold`
- Frontend renders a Polaris `Banner` component (already available via CDN) when threshold-crossing products exist
- Threshold configurable per shop via a settings input

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `facebook-nodejs-business-sdk` | Raw `fetch` to Graph API endpoints | Only if SDK shows Node 16 runtime incompatibility — SDK is a thin wrapper over `node-fetch`, so falling back is straightforward |
| `google-ads-api` (Opteo) | Raw REST to `googleads.googleapis.com` with `google-auth-library` | If `google-ads-api` has gRPC native binary issues in Railway's Docker environment. The library supports a REST transport mode as fallback. |
| `google-auth-library` directly | `googleapis` meta-package | `googleapis` bundles 200+ Google APIs — 10x heavier. Use only `google-auth-library` (which `google-ads-api` depends on) for OAuth2 token handling. |
| Node built-in `crypto` for token encryption | `jose`, `node-jose`, `crypto-js` | If you need JWE/JWT token format specifically. AES-256-GCM via Node built-in is sufficient for at-rest database encryption of refresh tokens. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `passport` + `passport-facebook` | Designed for user-session OAuth, not merchant-to-platform credential storage. Adds session middleware that fights the existing Shopify JWT auth model. | Hand-rolled OAuth redirect + callback using `facebook-nodejs-business-sdk` Graph API calls |
| `passport-google-oauth20` | Same session-centric design problem | `google-auth-library` `OAuth2Client` directly |
| `axios` (new backend install) | Not currently in backend `package.json`. Adding it for Meta/Google calls is redundant — `facebook-nodejs-business-sdk` handles its own HTTP internally. | SDK handles HTTP; `google-auth-library` handles Google auth |
| Any second chart library (Victory, Nivo, Chart.js) | Waterfall chart is achievable with existing Recharts 3.8. Adding a second chart library adds bundle weight and CSS collision risk in Shopify's embedded iframe. | Recharts `Bar` with range `[low, high]` data + custom `shape` prop |
| `ioredis` / Redis for token caching | Overkill. Ad token refresh is infrequent (per-sync-job). PostgreSQL already present. | `AdConnection` PostgreSQL table with encrypted token columns |
| `node-fetch` explicit install | Node 18+ ships `fetch` natively, but Node 16 does not. However, `facebook-nodejs-business-sdk` bundles its own HTTP layer. Google calls go through `google-auth-library` which uses Node's `https`. No new HTTP client needed. | Existing SDK HTTP handling |

---

## Version Compatibility

| Package | Node Requirement | Notes |
|---------|-----------------|-------|
| `facebook-nodejs-business-sdk@24.0.1` | No `engines` field declared | Expected safe on Node 16. Verify with `npm install --dry-run` before coding. |
| `google-ads-api@23.0.0` | No `engines` field; Node 16 tested by maintainer | Uses gRPC + protobuf under the hood. Test native binary compilation on Railway Docker. If gRPC build fails, use the library's REST mode option. |
| `google-auth-library@10.6.2` | Likely Node 18+ per CHANGELOG | **VERIFY FIRST.** Run `npm install google-auth-library@10` on Node 16.20.2 and check for `engines` error. If it fails, pin to `^9.15.1` (last confirmed Node 16 series). |
| `recharts@3.8.0` | React 18 | Already installed. Waterfall via range `Bar` confirmed working. No upgrade needed. |
| `prisma@5.22.0` + schema extension | Node 16 | Adding `AdConnection` model only — no version change. |

**Critical pre-coding step:** On Node 16.20.2, run:
```bash
npm install google-auth-library@10 --dry-run
```
If `engines` incompatibility error appears, use `npm install google-auth-library@9` instead and update `google-ads-api` accordingly (it may pull its own compatible version of `google-auth-library` as a sub-dependency anyway).

---

## Sources

- [facebook-nodejs-business-sdk GitHub](https://github.com/facebook/facebook-nodejs-business-sdk) — official Meta repo, v24.0.1 confirmed latest as of research date (CHANGELOG shows v24.0.1 most recent)
- [facebook-nodejs-business-sdk npm](https://www.npmjs.com/package/facebook-nodejs-business-sdk) — package details, CommonJS confirmed
- [Meta Marketing API Authentication docs](https://developers.facebook.com/docs/marketing-api/get-started/authentication/) — OAuth flow, `ads_read`/`ads_management` scopes, server-side token exchange
- [Meta Access Token guide](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/) — long-lived vs short-lived token behavior (MEDIUM confidence: non-expiring behavior for standard access verified in docs)
- [google-ads-api npm (Opteo)](https://www.npmjs.com/package/google-ads-api) — v23.0.0, Google Ads API v19/v23 support
- [Opteo google-ads-api README](https://github.com/Opteo/google-ads-api/blob/master/README.md) — OAuth credentials structure: `client_id`, `client_secret`, `developer_token`, `refresh_token`
- [Google Ads API Client Libraries docs](https://developers.google.com/google-ads/api/docs/client-libs) — confirms no official Node.js library; `google-ads-api` listed as community option
- [google-auth-library npm](https://www.npmjs.com/package/google-auth-library) — v10.6.2, official Google OAuth library, auto-refresh confirmed
- [ShopifyPaymentsBalanceTransaction GraphQL reference](https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction) — `fee` (MoneyV2), `associatedOrder`, `sourceOrderTransactionId` fields confirmed for payout-to-order mapping
- [Recharts waterfall example](https://recharts.github.io/en-US/examples/Waterfall/) — range Bar approach confirmed
- [Recharts issue #7010](https://github.com/recharts/recharts/issues/7010) — no native waterfall type; community pattern is range Bar with custom shape

---

*Stack research for: Shopify Profit Analytics v2.0 new features*
*Researched: 2026-03-18*
