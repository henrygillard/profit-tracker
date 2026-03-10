# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Shopify Admin API:**
- OAuth authorization endpoint - Used for app installation
  - SDK/Client: Native HTTP `fetch()` in `routes/auth.js`
  - Auth: Environment variables `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`
  - Endpoints called:
    - `https://{shop}/admin/oauth/authorize` - User consent flow (line 60 in `routes/auth.js`)
    - `https://{shop}/admin/oauth/access_token` - Token exchange (line 104 in `routes/auth.js`)
- Webhook subscriptions - Configured in `shopify.app.profit-tracker.toml`
  - `app/uninstalled` - Triggers cleanup when app is uninstalled
  - Privacy compliance webhooks: `customers/redact`, `customers/data_request`, `shop/redact`

## Data Storage

**Databases:**
- PostgreSQL (primary)
  - Connection: Via `DATABASE_URL` environment variable
  - Client: Prisma ORM (`@prisma/client ^5.22.0`)
  - Schema location: `prisma/schema.prisma`
  - Models:
    - `ShopSession` - Stores OAuth access tokens and shop metadata
    - `OAuthState` - Temporary OAuth state tokens for CSRF protection
  - Migrations: Managed by Prisma, deployed via `npm run db:push`

**File Storage:**
- Local filesystem only - `public/` directory for static assets (HTML, CSS, JS)

**Caching:**
- None detected - Stateless session validation via database queries

## Authentication & Identity

**Auth Provider:**
- Shopify OAuth 2.0
  - Implementation: Custom OAuth flow in `routes/auth.js`
  - Flow:
    1. Initiate: `GET /auth?shop={shop}` creates random state, redirects to Shopify authorization endpoint
    2. Callback: `GET /auth/callback?code={code}&shop={shop}&state={state}&hmac={hmac}` validates state and HMAC, exchanges code for access token
    3. Storage: Access token stored in `ShopSession` model for future API calls
  - HMAC verification: Required security check in callback (lines 87-101 in `routes/auth.js`)
  - Scopes: Configured in environment (`SHOPIFY_SCOPES`) and `shopify.app.profit-tracker.toml`
  - Token type: Offline access tokens (long-lived, `isOnline: false` in ShopSession model)

## Webhooks & Callbacks

**Incoming Webhooks:**
- `POST /webhooks/app_uninstalled` - Shopify notifies when app is uninstalled
  - Verification: HMAC validation via `X-Shopify-Hmac-SHA256` header
  - Handler: `routes/webhooks.js` line 17
  - Action: Deletes shop session from database to clean up after uninstall
  - Raw body handling: Critical - raw body parser must run before JSON parser (server.js line 29)

- `POST /webhooks/customers/redact` - GDPR data deletion webhook (stub)
  - Verification: Required by Shopify but implementation is stub
  - Handler: `routes/webhooks.js` line 38

- `POST /webhooks/customers/data_request` - GDPR data request webhook (stub)
  - Verification: Required by Shopify but implementation is stub
  - Handler: `routes/webhooks.js` line 39

- `POST /webhooks/shop/redact` - Shop deletion webhook (stub)
  - Verification: Required by Shopify but implementation is stub
  - Handler: `routes/webhooks.js` line 40

**Webhook Configuration:**
- API version: 2025-10 (configured in `shopify.app.profit-tracker.toml`)
- Webhook subscriptions defined in `shopify.app.profit-tracker.toml` lines 8-18

**Outgoing Webhooks:**
- None detected - App does not make callbacks to external systems

## Security Considerations

**OAuth Verification:**
- HMAC validation on OAuth callback (lines 94-101 in `routes/auth.js`)
- State parameter validation for CSRF protection (lines 81-85 in `routes/auth.js`)
- State cleanup: Old states auto-deleted after 10 minutes (lines 54-56 in `routes/auth.js`)

**Webhook Verification:**
- HMAC signature validation required for all webhooks (lines 6-12 in `routes/webhooks.js`)
- Raw body handling: Webhooks require raw body before JSON parsing (server.js line 29)

**Content Security Policy:**
- Frame-ancestors CSP header set per shop to prevent clickjacking (server.js lines 14-26)
- Required for Shopify embedded apps

## Secrets & Configuration

**Required Environment Variables:**
- `SHOPIFY_API_KEY` - OAuth client ID from Shopify Partners
- `SHOPIFY_API_SECRET` - OAuth client secret (used for HMAC verification and token exchange)
- `DATABASE_URL` - PostgreSQL connection string with credentials
- `SHOPIFY_APP_URL` - Public URL of deployed app (used in OAuth redirect_uri)
- `PORT` - Server port (optional, defaults to 3000)
- `SHOPIFY_SCOPES` - OAuth scopes (optional)

**Secrets Storage:**
- `.env` file at project root (gitignored, never committed)
- Reference template: `.env.example` (no secrets, just variable names)
- Production: Environment variables set via hosting platform (Railway.app)

## Deployment Configuration

**Docker:**
- Image: `node:20-slim`
- Dockerfile at: `/Users/henry/code/profit-tracker/Dockerfile`
- Build steps: Install dependencies, generate Prisma client, run migrations
- Entry point: `node server.js` on port 3000
- OpenSSL required for PostgreSQL connections (installed in Dockerfile line 2)

**Shopify App Configuration:**
- Config file: `shopify.app.profit-tracker.toml`
- Client ID: `b4a0a98bc37928c4fde24564213c848a`
- Embedded app: Yes (embedded in Shopify admin)
- Redirect URLs: Configured for OAuth callback
- Access scopes: Extensive (60+ scopes for product, order, customer, and analytics access)

## API Endpoint Mapping

**Authentication Flow:**
- `GET /` - Install prompt (root landing page)
- `GET /auth?shop={shop}` - Initiate OAuth flow
- `GET /auth/callback?code=...&state=...&hmac=...` - OAuth callback handler
- `GET /admin?shop={shop}` - Main embedded admin UI (requires valid session)
- `GET /privacy` - Privacy policy (static file)
- `GET /terms` - Terms of service (static file)

**Webhook Endpoints:**
- `POST /webhooks/app_uninstalled` - App uninstall cleanup
- `POST /webhooks/customers/redact` - GDPR compliance (stub)
- `POST /webhooks/customers/data_request` - GDPR compliance (stub)
- `POST /webhooks/shop/redact` - GDPR compliance (stub)

---

*Integration audit: 2026-03-10*
