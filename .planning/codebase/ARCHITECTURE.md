# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Shopify Embedded App (OAuth + Webhooks)

**Key Characteristics:**
- Server-side Express.js application handling Shopify OAuth and webhooks
- Embedded admin interface running within Shopify admin panel
- PostgreSQL database via Prisma ORM for session and state persistence
- Multi-shop capable with per-shop session isolation
- Webhook-based event handling for app lifecycle events

## Layers

**HTTP Server Layer:**
- Purpose: Handle incoming HTTP requests and responses, security headers, routing
- Location: `server.js`
- Contains: Express app setup, CSP headers, middleware configuration, route registration
- Depends on: Express.js, routes, Prisma client
- Used by: Shopify admin (embedded requests), Shopify webhooks, external clients

**Authentication Layer:**
- Purpose: Manage Shopify OAuth flow and session lifecycle
- Location: `routes/auth.js`
- Contains: OAuth authorization, callback handling, token exchange, state validation
- Depends on: Prisma client, crypto module, Shopify API endpoints
- Used by: HTTP server layer, admin UI redirects

**Event Handling Layer:**
- Purpose: Process Shopify webhook events for app lifecycle management
- Location: `routes/webhooks.js`
- Contains: Webhook signature verification, app uninstall cleanup, privacy compliance endpoints
- Depends on: Prisma client, crypto module
- Used by: Shopify webhook delivery system

**Data Access Layer:**
- Purpose: Database connection and Prisma client initialization
- Location: `lib/prisma.js`
- Contains: Prisma singleton pattern with global cache for development
- Depends on: Prisma Client, environment variables
- Used by: Auth layer, webhook layer

**Data Model Layer:**
- Purpose: Define database schema and relationships
- Location: `prisma/schema.prisma`
- Contains: ShopSession model, OAuthState model, database provider configuration
- Depends on: PostgreSQL
- Used by: Data access layer via Prisma migrations and queries

**Static/UI Layer:**
- Purpose: Serve static HTML, CSS, legal pages, and embedded admin UI
- Location: `public/`, `server.js` (inline HTML responses)
- Contains: Privacy page, terms page, HTML templates for OAuth flow, admin UI welcome page
- Depends on: Express static middleware
- Used by: Shopify admin, browsers

## Data Flow

**OAuth Installation Flow:**

1. Shopify admin user initiates app installation
2. Shopify redirects to `GET /auth?shop=example.myshopify.com`
3. OAuth handler generates random state, stores in database (`OAuthState` model)
4. Handler redirects browser to Shopify OAuth authorize endpoint
5. User grants permissions
6. Shopify redirects to `GET /auth/callback?shop=...&code=...&state=...&hmac=...`
7. Callback handler verifies state, validates HMAC with API secret
8. Handler exchanges code for access token via Shopify API
9. Handler stores session in database (`ShopSession` model)
10. Handler redirects to `/admin?shop=...` or Shopify admin panel

**Embedded Admin Access Flow:**

1. User clicks app in Shopify admin panel
2. Shopify opens `/admin?shop=example.myshopify.com` in iframe
3. Server checks for valid session in database
4. Server returns welcome UI HTML or redirects to login if session missing
5. Browser renders response in Shopify admin iframe context

**App Uninstall Webhook Flow:**

1. User uninstalls app from Shopify admin
2. Shopify POSTs to `/webhooks/app_uninstalled` with signed payload
3. Server verifies HMAC signature using API secret
4. Server deletes all sessions for that shop from database
5. Server responds with 200 OK

**State Management:**

- Session state: Stored in PostgreSQL via `ShopSession` model
- OAuth state: Stored temporarily in PostgreSQL via `OAuthState` model
- Request state: No in-memory session storage; all state is database-backed
- OAuth state expiration: Manual cleanup of states older than 10 minutes during auth flow

## Key Abstractions

**Shop Session:**
- Purpose: Represents authenticated connection to a Shopify shop
- Examples: `routes/auth.js` (lines 121-131), `server.js` (lines 41-48)
- Pattern: Database model with unique shop domain, access token, scopes, timestamps

**OAuth State:**
- Purpose: Prevents CSRF attacks during OAuth flow by correlating requests
- Examples: `routes/auth.js` (lines 50-51, 81-85)
- Pattern: Temporary database record with random token, auto-cleanup via time-based deletion

**Webhook Verification:**
- Purpose: Ensure webhook payloads genuinely come from Shopify
- Examples: `routes/webhooks.js` (lines 6-12)
- Pattern: HMAC-SHA256 verification using API secret and raw request body

## Entry Points

**Express Server:**
- Location: `server.js`
- Triggers: `npm start` or `npm run dev` command
- Responsibilities: Initialize app, register middleware, set up routes, listen on port

**GET /auth:**
- Location: `routes/auth.js` (lines 18-67)
- Triggers: Initial OAuth authorization request from Shopify
- Responsibilities: Validate shop, generate state, redirect to Shopify OAuth endpoint

**GET /auth/callback:**
- Location: `routes/auth.js` (lines 72-145)
- Triggers: Shopify OAuth callback after user authorization
- Responsibilities: Validate state and HMAC, exchange code for token, store session

**POST /webhooks/app_uninstalled:**
- Location: `routes/webhooks.js` (lines 17-35)
- Triggers: Shopify webhook event when app is uninstalled
- Responsibilities: Verify webhook signature, delete all shop sessions

**GET /admin:**
- Location: `server.js` (lines 41-88)
- Triggers: Shopify admin opening embedded app UI
- Responsibilities: Validate session exists, return welcome HTML or redirect to auth

**GET / (root):**
- Location: `server.js` (lines 91-100)
- Triggers: Direct browser access to root URL
- Responsibilities: Redirect to /admin if shop parameter present, otherwise show install prompt

## Error Handling

**Strategy:** Synchronous validation with error responses, async try-catch blocks with logging

**Patterns:**

- OAuth state missing: 400 Bad Request with "Missing shop parameter" message
- OAuth state mismatch: 400 Bad Request with "Invalid OAuth state" message
- HMAC verification failure: 400 Bad Request with "HMAC verification failed" message
- Token exchange failure: 500 Internal Server Error with "Failed to get access token" message
- Missing session on /admin access: Redirect to `/auth?shop=...` for re-authentication
- All errors logged to console with context (OAuth begin error, OAuth callback error, Webhook error)
- Webhook signature verification failures: 401 Unauthorized

## Cross-Cutting Concerns

**Logging:** Console logging for key events (OAuth completion, session cleanup, errors)

**Validation:**
- Shop parameter normalization (handle both `shop` and `shop.myshopify.com` formats)
- OAuth state token validation against database
- HMAC signature verification using crypto.createHmac('sha256')
- Required parameter validation (shop, code, state)

**Authentication:**
- Shopify API Key and Secret from environment variables
- HMAC-based webhook verification
- OAuth state tokens for CSRF protection
- Access tokens stored per shop in database

**Security:**
- Content-Security-Policy headers set dynamically per shop domain
- Raw body parsing for webhooks before JSON middleware (CRITICAL for HMAC verification)
- HMAC verification on all webhook payloads
- OAuth state cleanup prevents replay attacks
- HTTP-only session storage (database, not cookies)

**Multi-shop Support:**
- Shop domain used as unique identifier
- Each shop has isolated session record
- Webhook processing filters by shop domain from payload
- Session queries use shop as WHERE clause

---

*Architecture analysis: 2026-03-10*
