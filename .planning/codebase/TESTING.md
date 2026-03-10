# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Runner:**
- Not detected — no test framework configured
- No test dependency in `package.json` (only `@prisma/client`, `dotenv`, `express`, `prisma`)
- No test config files found (`jest.config.js`, `vitest.config.js`, etc.)

**Assertion Library:**
- Not applicable — testing framework not in use

**Run Commands:**
- No test scripts defined in `package.json`
- Available scripts: `npm start`, `npm run dev`, `npm run db:push`, `npm run db:studio`

## Test File Organization

**Location:**
- No test files found in codebase
- Search for `*.test.js`, `*.spec.js`, `*.test.ts`, `*.spec.ts` returned no results

**Naming:**
- Not applicable — no tests present

**Structure:**
- Not applicable — no tests present

## Manual Testing Patterns

**Development Approach:**
- Server runs continuously with `npm start` or `npm run dev`
- Database management via `npm run db:push` (Prisma migrations)
- Shopify admin UI available at `GET /admin?shop=<shop>`
- OAuth flow testing via `GET /auth?shop=<shop>`

**Route Handler Testing (manual):**
All business logic resides in route handlers in:
- `routes/auth.js` — OAuth flow (lines 18-145)
- `routes/webhooks.js` — Webhook processing (lines 17-35)
- `server.js` — App initialization (lines 41-100)

## Error Handling Testability

**Current Patterns (in code, not in tests):**

**OAuth State Validation (`routes/auth.js`, lines 80-84):**
```javascript
const storedState = await prisma.oAuthState.findUnique({ where: { state } });
if (!storedState || storedState.shop !== shop) {
  return res.status(400).send('Invalid OAuth state');
}
```

**HMAC Verification (`routes/auth.js`, lines 99-101):**
```javascript
if (generatedHmac !== hmac) {
  return res.status(400).send('HMAC verification failed');
}
```

**Webhook HMAC Verification (`routes/webhooks.js`, lines 18-21):**
```javascript
function verifyWebhookHmac(rawBody, hmacHeader) {
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');
  return digest === hmacHeader;
}
```

**Session Existence Check (`server.js`, lines 45-48):**
```javascript
const session = await prisma.shopSession.findFirst({ where: { shop } });
if (!session) {
  return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
}
```

## Mock Patterns

**Framework:** Not applicable — no testing framework

**Workarounds in code:**
- Prisma Client singleton pattern in `lib/prisma.js` (lines 3-8) allows global reuse in Node environment
- Environment variable mocking would require `.env` file updates in development

**Example Prisma Singleton Pattern (`lib/prisma.js`):**
```javascript
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma };
```

## Fixtures and Test Data

**Test Data:**
- Not organized — no fixtures or factories exist
- Manual test data would require direct database manipulation or Shopify test accounts

**Location:**
- Not applicable — no test infrastructure

## Coverage

**Requirements:** Not applicable — no testing framework configured

**View Coverage:**
- Not possible — no coverage tooling present

## Test Types

**Unit Tests:**
- Not implemented
- Good candidates for unit testing:
  - `verifyWebhookHmac()` function in `routes/webhooks.js` (4-line pure function, crypto-based)
  - Shop domain normalization logic in `routes/auth.js` (line 22): `shop.includes('.') ? shop : `${shop}.myshopify.com``
  - HMAC generation and comparison in `routes/auth.js` (lines 94-101)

**Integration Tests:**
- Not implemented
- Good candidates:
  - OAuth flow: `/auth` → `/auth/callback` → redirect to `/admin`
  - Webhook processing: POST `/webhooks/app_uninstalled` with HMAC verification
  - Session persistence: CREATE → READ → DELETE via Prisma

**E2E Tests:**
- Not implemented
- Would require Shopify test store or mock API

## Logging as a Testing Tool

**Current logging in code:**

**Successful operations (`console.log`):**
- `console.log(`profit tracker server running on port ${PORT}`)` — server startup
- `console.log(`OAuth completed for ${shop}`)` — OAuth success
- `console.log(`Cleaned up sessions for uninstalled shop: ${shop}`)` — webhook processing

**Errors (`console.error`):**
- `console.error('OAuth begin error:', error)` — OAuth initiation failure
- `console.error('OAuth callback error:', error)` — OAuth callback failure
- `console.error('Webhook error:', error)` — Webhook processing failure

These logs provide minimal observability. No structured logging or request correlation IDs present.

## Missing Test Infrastructure

**Gaps identified:**
1. No test runner (Jest, Vitest, Mocha)
2. No assertion library
3. No test coverage tooling
4. No fixtures or factory patterns
5. No mock database setup
6. No test data seeding
7. Crypto operations in `verifyWebhookHmac()` are untested
8. Database queries are untested (Prisma operations)
9. OAuth state flow not validated
10. HMAC verification not tested

**Critical areas without automated tests:**
- `routes/auth.js` — All OAuth logic (106 lines of unprotected logic)
- `routes/webhooks.js` — Webhook HMAC verification and session cleanup (35 lines)
- `lib/prisma.js` — Singleton pattern and NODE_ENV handling (10 lines)

---

*Testing analysis: 2026-03-10*
