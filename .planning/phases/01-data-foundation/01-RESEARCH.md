# Phase 1: Data Foundation - Research

**Researched:** 2026-03-10
**Domain:** Shopify App compliance, JWT authentication, OAuth scope management, environment validation
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | App implements GDPR webhooks (customer data erasure, customer data request, shop redact) with real handlers — not stubs | HMAC verification pattern already in codebase; three stub handlers need real Prisma delete/log operations |
| FOUND-02 | App OAuth scopes pruned to minimum required — removes excess scopes that cause app review rejection | Current toml has ~150 scopes; minimum for Phase 1 is 5-6 scopes; `read_all_orders` needs Partner Dashboard approval |
| FOUND-03 | Server validates all required environment variables at startup and fails fast with clear errors if missing | Partial implementation exists in server.js; needs audit of what variables are actually used vs validated |
| FOUND-04 | All `/api/*` routes validate Shopify App Bridge session tokens (JWT) — shop identity extracted from token, not query string | No JWT middleware exists; need `jsonwebtoken` package + Express middleware; `dest` claim is the shop identity |
</phase_requirements>

---

## Summary

Phase 1 is a compliance and security hardening phase, not a feature phase. The existing scaffold has placeholder GDPR handlers (three stubs that log warnings and return 200 without touching the database), an absurdly over-scoped toml file with ~150 OAuth scopes, and no JWT validation on API routes. All four requirements address defects that would cause immediate App Store rejection.

The technical work is well-defined and straightforward. The GDPR handlers need real Prisma operations: `customers/redact` deletes customer-linked records by shop+customer ID, `shop/redact` deletes all records for a shop (this is what the existing `app_uninstalled` handler already does — the pattern is proven), and `customers/data_request` logs the request (no customer data is stored yet in Phase 1). The scope list is a default-everything artifact from scaffolding and needs to be reduced to exactly the scopes Phase 1 actually uses. JWT middleware uses the `jsonwebtoken` npm package with the app secret as the HMAC-SHA256 signing key, and the `dest` claim in the decoded payload contains the shop domain.

**Primary recommendation:** Execute four discrete, low-risk changes in dependency order: (1) add `jsonwebtoken` and create JWT middleware, (2) wire JWT middleware to `/api/*` routes, (3) implement real GDPR handlers using the existing HMAC verification pattern, (4) replace the toml scope list with only the scopes Phase 1 actually needs. Environment validation is already mostly done — it needs an audit pass, not a rewrite.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jsonwebtoken` | ^9.0.2 | Verify Shopify App Bridge session tokens (HS256 JWT) | Official Shopify docs reference; widely used; handles signature + claims validation |
| `prisma` (existing) | ^5.22.0 | GDPR data deletion via existing Prisma client | Already in codebase; `ShopSession` model exists; extend for GDPR operations |
| Node.js `crypto` (built-in) | built-in | Webhook HMAC verification | Already used in `routes/webhooks.js`; no additional install needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `supertest` | ^7.x | HTTP integration tests for GDPR webhooks and JWT middleware | Wave 0 test setup; verifies 401 on missing token, 200 on valid HMAC |
| `jest` | ^29.x | Test runner | No test infrastructure exists; this phase creates it |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jsonwebtoken` | `jose` (WebCrypto-based) | `jose` is better for edge runtimes; `jsonwebtoken` is simpler for Node.js/Express and well-documented for Shopify use |
| `jsonwebtoken` | `shopify-jwt-auth-verify` | Tiny dependency-free package but less maintained; `jsonwebtoken` is the de facto standard |
| Jest + Supertest | Mocha + Chai | Jest is more batteries-included; either works; Jest has better async support for Prisma mocking |

**Installation:**
```bash
npm install jsonwebtoken
npm install --save-dev jest supertest
```

---

## Architecture Patterns

### Recommended Project Structure
```
routes/
├── auth.js          # existing — OAuth flow
├── webhooks.js      # existing — extend GDPR handlers here
└── api.js           # NEW — all /api/* routes, protected by JWT middleware
lib/
├── prisma.js        # existing
├── utils.js         # existing
└── verifySessionToken.js   # NEW — JWT middleware for /api/* routes
```

### Pattern 1: Shopify Session Token JWT Middleware

**What:** An Express middleware that reads the `Authorization: Bearer <token>` header, verifies the HS256 signature using `SHOPIFY_API_SECRET`, validates standard JWT claims (`exp`, `nbf`, `aud`), validates Shopify-specific claims (`iss`/`dest` domain match, `aud` matches client ID), and sets `req.shopDomain` from `payload.dest`.

**When to use:** Mount on all `/api/*` routes. Not on `/auth`, `/webhooks`, `/health`, or `/admin`.

**Example:**
```javascript
// Source: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
const jwt = require('jsonwebtoken');

function verifySessionToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing session token' });
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    // HS256 signed with app secret; audience must match client ID
    payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
      algorithms: ['HS256'],
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  // Shopify-specific claim: aud must match our client ID
  if (payload.aud !== process.env.SHOPIFY_API_KEY) {
    return res.status(401).json({ error: 'Token audience mismatch' });
  }

  // Shopify-specific claim: iss and dest top-level domains must match
  const issDomain = new URL(payload.iss).hostname;
  const destDomain = new URL(payload.dest).hostname;
  if (issDomain !== destDomain) {
    return res.status(401).json({ error: 'Token domain mismatch' });
  }

  // Shop identity lives in dest — never trust query string
  req.shopDomain = destDomain;
  next();
}

module.exports = { verifySessionToken };
```

### Pattern 2: GDPR Webhook Real Handler

**What:** The three GDPR endpoints already exist as stubs in `routes/webhooks.js`. They already have the raw body available (middleware order is set correctly in `server.js`). The pattern is to (a) verify HMAC (same as `app_uninstalled` does), (b) parse payload, (c) perform the correct Prisma operation, (d) respond 200.

**When to use:** Replace the three stub handlers. The `verifyWebhookHmac` helper is already defined in the same file.

**Example — shop/redact (highest priority; blocks listing):**
```javascript
// Source: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
router.post('/shop/redact', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const { myshopify_domain } = JSON.parse(req.body.toString());
    if (myshopify_domain) {
      await prisma.shopSession.deleteMany({ where: { shop: myshopify_domain } });
      console.log(`shop/redact: deleted all data for ${myshopify_domain}`);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('shop/redact error:', err);
    res.status(500).send('Error');
  }
});
```

**Example — customers/redact:**
```javascript
// No customer data stored in Phase 1 — log the request as the compliant response
router.post('/customers/redact', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const payload = JSON.parse(req.body.toString());
    // Phase 1: No customer PII stored. Log receipt for audit trail.
    // Phase 2+: Delete order-linked customer records here.
    console.log('customers/redact received', {
      shop: payload.shop_domain,
      customerId: payload.customer?.id,
    });
    res.status(200).send('OK');
  } catch (err) {
    console.error('customers/redact error:', err);
    res.status(500).send('Error');
  }
});
```

### Pattern 3: Minimum Scope List

**What:** Replace the 150-scope default in `shopify.app.profit-tracker.toml` with only what Phase 1 actually uses. Phase 1 routes use no Shopify Admin API calls yet (that's Phase 2). The authenticated scopes needed now are only for OAuth to succeed and webhooks to fire.

**Minimum scope list for Phase 1:**
```toml
[access_scopes]
# Phase 1: Foundation — no Admin API calls yet
# Phase 2 will add: read_orders, read_all_orders, read_products, read_inventory,
#                   read_shopify_payments_payouts
scopes = ""
```

**Important note:** `read_all_orders` requires explicit Partner Dashboard approval before it can be added. Request this approval before starting Phase 2. Email: read-all-orders-request@shopify.com.

### Anti-Patterns to Avoid

- **Extracting shop from query string in API routes:** `req.query.shop` is attacker-controlled. Always use `req.shopDomain` set by the JWT middleware from `payload.dest`.
- **Returning 200 stubs for GDPR webhooks:** Shopify's automated checker sends test webhooks during App Review. Stubs pass the check momentarily but Shopify can revoke listings for non-compliance. Real operations are required.
- **Re-using the `app_uninstalled` webhook HMAC approach for session tokens:** Webhooks use HMAC-SHA256 over the raw body. Session tokens use HS256 JWT signed with the same secret but are a completely different validation flow.
- **Trusting `jsonwebtoken` defaults:** Must explicitly pass `algorithms: ['HS256']` to prevent algorithm confusion attacks. Never omit this.
- **Missing raw body for GDPR webhook HMAC:** The `server.js` already mounts `express.raw()` for `/webhooks` before `express.json()`. Do not change this order — the three GDPR stubs benefit from this already.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signature verification | Custom HMAC-SHA256 JWT parser | `jsonwebtoken` with `algorithms: ['HS256']` | Token expiry, nbf, and claim validation edge cases; timing-safe comparison; algorithm confusion prevention |
| Session token lifetime management | Caching/refresh logic | Let App Bridge handle it; verify each request fresh | Shopify session tokens are 1-minute TTL; App Bridge re-fetches before each API call automatically |

**Key insight:** The existing `timingSafeEqual` utility in `lib/utils.js` is already the right pattern for HMAC comparison. For JWTs, `jsonwebtoken.verify()` handles all of this internally.

---

## Common Pitfalls

### Pitfall 1: GDPR Webhook Missing HMAC Verification
**What goes wrong:** Stubs respond 200 without verifying the `x-shopify-hmac-sha256` header. Any external party can trigger them.
**Why it happens:** Stubs were scaffolded for compliance URL registration only.
**How to avoid:** Use the existing `verifyWebhookHmac()` helper already in `routes/webhooks.js` — it's already correct (base64, timing-safe).
**Warning signs:** Handler body doesn't call `verifyWebhookHmac` before parsing payload.

### Pitfall 2: JWT `aud` Claim Uses Wrong Value
**What goes wrong:** `payload.aud` contains the app's client ID (from `shopify.app.profit-tracker.toml` → `client_id`), not the shop domain. Comparing it to a shop domain will always fail.
**Why it happens:** Confusion between `aud` (client ID) and `dest` (shop domain).
**How to avoid:** Check `payload.aud === process.env.SHOPIFY_API_KEY`. Extract shop from `payload.dest`.
**Warning signs:** All authenticated requests return 401 after correct-looking middleware is mounted.

### Pitfall 3: `read_all_orders` Not Pre-Approved Before Phase 2
**What goes wrong:** Phase 2 adds `read_all_orders` to the toml, but the scope requires prior Partner Dashboard approval. App Review rejects the submission or the OAuth exchange fails.
**Why it happens:** `read_all_orders` is a protected scope — not just "request it and it works."
**How to avoid:** Submit the approval request during Phase 1. Approval takes days to weeks. Email: read-all-orders-request@shopify.com.
**Warning signs:** OAuth succeeds but historical orders (>60 days) return empty results.

### Pitfall 4: `Authorization` Header Not Sent by App Bridge
**What goes wrong:** Frontend calls `/api/*` without `Authorization: Bearer <token>` header. All requests return 401.
**Why it happens:** App Bridge automatic fetch authorization (via CDN) handles this for `fetch()` calls made through App Bridge's `authenticatedFetch` — but raw `fetch()` calls do not include it.
**How to avoid:** Phase 1 has no frontend API calls yet. When Phase 3 adds the React frontend, use `authenticatedFetch` from `@shopify/app-bridge-utils`.
**Warning signs:** JWT middleware receives requests with no `Authorization` header from the embedded app.

### Pitfall 5: Scope List Mismatch Between toml and `SHOPIFY_SCOPES` env var
**What goes wrong:** The `routes/auth.js` OAuth initiation uses `process.env.SHOPIFY_SCOPES` (line 63) to build the authorization URL, but the toml file defines the canonical scope list. If they diverge, merchants may be asked to re-approve during re-installation or App Review may flag the discrepancy.
**Why it happens:** Two sources of truth for scopes.
**How to avoid:** Set `SHOPIFY_SCOPES` env var to exactly match the toml `scopes` value. Document this in the env var validation list.
**Warning signs:** OAuth completes but `session.scope` stored in DB doesn't match what toml declares.

---

## Code Examples

### JWT Middleware — Full Implementation
```javascript
// lib/verifySessionToken.js
// Source: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
const jwt = require('jsonwebtoken');

function verifySessionToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing session token' });
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
      algorithms: ['HS256'],
      // jsonwebtoken checks exp and nbf automatically when these are present
    });
  } catch (err) {
    // TokenExpiredError, JsonWebTokenError, NotBeforeError all caught here
    return res.status(401).json({ error: 'Invalid session token' });
  }

  // Shopify-specific: aud must equal our app's client ID
  if (payload.aud !== process.env.SHOPIFY_API_KEY) {
    return res.status(401).json({ error: 'Token audience mismatch' });
  }

  // Shopify-specific: iss and dest must share the same hostname
  try {
    const issDomain = new URL(payload.iss).hostname;
    const destDomain = new URL(payload.dest).hostname;
    if (issDomain !== destDomain) {
      return res.status(401).json({ error: 'Token domain mismatch' });
    }
    req.shopDomain = destDomain; // e.g. "mystore.myshopify.com"
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token claims' });
  }

  next();
}

module.exports = { verifySessionToken };
```

### Mounting JWT Middleware on /api/* Routes
```javascript
// In server.js (add after existing routes)
const { verifySessionToken } = require('./lib/verifySessionToken');
app.use('/api', verifySessionToken);
app.use('/api', require('./routes/api'));
```

### Environment Variable Validation Pattern (existing — extend)
```javascript
// server.js lines 3-8 — current implementation
const REQUIRED_ENV = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_APP_URL', 'DATABASE_URL'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
// FOUND-03 audit: add SHOPIFY_SCOPES to REQUIRED_ENV
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shopify auth cookies + sessions | App Bridge session tokens (JWT) | 2020 (App Bridge 2.x) | All embedded API auth must use JWTs; cookies don't work in iframes |
| `@shopify/shopify-api` library | Manual JWT verification + `jsonwebtoken` | N/A (this codebase didn't use the Shopify lib) | Fine for this app; just need `jsonwebtoken` directly |
| REST Admin API | GraphQL Admin API (mandatory for new public apps as of April 1, 2025) | April 2025 | Phase 2 must use GraphQL, not REST, for order/product sync |

**Deprecated/outdated:**
- REST Admin API for new public apps: As of April 1, 2025, all new public Shopify apps must use the GraphQL Admin API. Phase 2 SYNC requirements should use GraphQL Bulk Operations (already noted in requirements). Phase 1 makes no Admin API calls so this doesn't apply here.

---

## Open Questions

1. **What scopes does Phase 1 actually need?**
   - What we know: Phase 1 makes no Admin API calls. Webhooks are inbound (Shopify calls us). OAuth grants the token but no API calls happen until Phase 2.
   - What's unclear: Whether an empty `scopes = ""` in the toml will cause App Review issues or if a minimal set like `read_orders` is expected as proof of purpose.
   - Recommendation: Set `scopes = ""` for Phase 1. Document that Phase 2 will add `read_orders`, `read_products`, `read_inventory`, `read_shopify_payments_payouts`, and `read_all_orders` (the last requiring pre-approval).

2. **`customers/redact` with no customer data stored**
   - What we know: Phase 1 doesn't store any customer PII. The `ShopSession` model stores only `shop`, `accessToken`, and `scope` — no customer IDs, emails, or order data.
   - What's unclear: Whether Shopify's automated checker verifies the handler actually deletes rows, or just checks for a 200 response.
   - Recommendation: Log receipt with shop + customer ID from payload; respond 200. Add a comment noting Phase 2+ must perform actual deletion when order/customer data is stored.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x + Supertest 7.x |
| Config file | `jest.config.js` — Wave 0 creates this |
| Quick run command | `npx jest --testPathPattern=routes/` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | `POST /webhooks/customers/redact` with valid HMAC returns 200 and logs (no crash) | integration | `npx jest tests/webhooks.test.js -t "customers/redact"` | Wave 0 |
| FOUND-01 | `POST /webhooks/customers/redact` with invalid HMAC returns 401 | integration | `npx jest tests/webhooks.test.js -t "customers/redact 401"` | Wave 0 |
| FOUND-01 | `POST /webhooks/shop/redact` with valid HMAC deletes ShopSession row | integration | `npx jest tests/webhooks.test.js -t "shop/redact deletes"` | Wave 0 |
| FOUND-01 | `POST /webhooks/customers/data_request` with valid HMAC returns 200 | integration | `npx jest tests/webhooks.test.js -t "data_request"` | Wave 0 |
| FOUND-02 | `shopify.app.profit-tracker.toml` scopes field contains only expected values | unit | `npx jest tests/scopes.test.js` | Wave 0 |
| FOUND-03 | Server exits with error message when `SHOPIFY_API_KEY` is absent | unit | `npx jest tests/env.test.js -t "missing SHOPIFY_API_KEY"` | Wave 0 |
| FOUND-03 | Server exits with error message when `DATABASE_URL` is absent | unit | `npx jest tests/env.test.js -t "missing DATABASE_URL"` | Wave 0 |
| FOUND-04 | `GET /api/anything` without `Authorization` header returns 401 | integration | `npx jest tests/auth.test.js -t "missing token"` | Wave 0 |
| FOUND-04 | `GET /api/anything` with valid JWT returns 200, `req.shopDomain` set correctly | integration | `npx jest tests/auth.test.js -t "valid token"` | Wave 0 |
| FOUND-04 | `GET /api/anything` with expired JWT returns 401 | integration | `npx jest tests/auth.test.js -t "expired token"` | Wave 0 |
| FOUND-04 | `GET /api/anything` with wrong `aud` returns 401 | integration | `npx jest tests/auth.test.js -t "wrong audience"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=tests/` (full suite is fast — all unit/integration, no external calls)
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/webhooks.test.js` — covers FOUND-01 (GDPR handler behavior with mocked Prisma)
- [ ] `tests/auth.test.js` — covers FOUND-04 (JWT middleware: valid, expired, missing, wrong aud)
- [ ] `tests/env.test.js` — covers FOUND-03 (startup validation behavior via child_process)
- [ ] `tests/scopes.test.js` — covers FOUND-02 (toml scope list assertion)
- [ ] `jest.config.js` — test runner configuration
- [ ] `tests/__mocks__/prisma.js` — mock Prisma client for integration tests
- [ ] Framework install: `npm install --save-dev jest supertest`

---

## Sources

### Primary (HIGH confidence)
- [https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens) — JWT payload structure, claims, `dest` field for shop identity
- [https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens/set-up-session-tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens/set-up-session-tokens) — HS256 algorithm, signing key = app secret, validation algorithm steps
- [https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) — GDPR webhook payloads, 30-day completion requirement, 200-series response
- [https://shopify.dev/docs/api/usage/access-scopes](https://shopify.dev/docs/api/usage/access-scopes) — `read_all_orders` requires Partner Dashboard approval; minimum scope principle
- [https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) — App Review scope justification requirements
- [https://shopify.dev/changelog/apps-now-need-shopify-approval-to-read-orders-older-than-60-days](https://shopify.dev/changelog/apps-now-need-shopify-approval-to-read-orders-older-than-60-days) — `read_all_orders` approval process

### Secondary (MEDIUM confidence)
- [https://www.npmjs.com/package/jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) — `algorithms` parameter required; `verify()` checks `exp` and `nbf` automatically

### Tertiary (LOW confidence)
- Community forum confirmation that Shopify's automated checker sends real GDPR test webhooks during App Review (not verifiable via official docs alone)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `jsonwebtoken` is directly referenced by Shopify docs; Prisma is existing; Node crypto is built-in
- Architecture: HIGH — existing `verifyWebhookHmac` pattern in codebase is exactly correct; JWT middleware pattern matches official docs algorithm
- Pitfalls: HIGH — `aud` vs `dest` confusion and `read_all_orders` approval are verified against official docs; HMAC raw body order is documented in existing code comments

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (stable Shopify compliance requirements; JWT validation algorithm is stable)
