---
phase: 01-data-foundation
verified: 2026-03-10T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 1: Data Foundation Verification Report

**Phase Goal:** The app passes Shopify App Review requirements and all backend infrastructure is in place for profit data to be stored and accessed securely
**Verified:** 2026-03-10
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                        | Status     | Evidence                                                                                                                                       |
|----|------------------------------------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Shopify GDPR webhooks respond with a real database operation — not a 200 stub                                                | VERIFIED | `routes/webhooks.js` lines 70–86: `shop/redact` calls `prisma.shopSession.deleteMany`; all three handlers call `verifyWebhookHmac` before acting |
| 2  | The app's OAuth scopes list contains only scopes actually used — no excess scopes                                            | VERIFIED | `shopify.app.profit-tracker.toml` line 25: `scopes = ""`; 150-scope default string is gone                                                     |
| 3  | Starting the server with a missing required environment variable prints a clear error and exits non-zero                     | VERIFIED | `server.js` line 4: `REQUIRED_ENV` array includes `SHOPIFY_SCOPES`; `process.exit(1)` on line 8                                                |
| 4  | Every `/api/*` request without a valid App Bridge JWT returns 401; shop identity extracted from token, not query string      | VERIFIED | `lib/verifySessionToken.js` sets `req.shopDomain = destDomain`; never reads `req.query.shop`; `server.js` line 54 mounts on `/api`             |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact                              | Expected                                                  | Status     | Details                                                                                                     |
|---------------------------------------|-----------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------|
| `routes/webhooks.js`                  | Three real GDPR handlers with HMAC verification and Prisma | VERIFIED  | 113 lines; `verifyWebhookHmac` called in all four handlers; `prisma.shopSession.deleteMany` in `shop/redact` |
| `lib/verifySessionToken.js`           | HS256 JWT middleware; exports `verifySessionToken`        | VERIFIED   | 48 lines; `algorithms: ['HS256']`; `req.shopDomain = destDomain`; dual export (default + named)             |
| `routes/api.js`                       | Protected `/api/health` route returning `req.shopDomain`  | VERIFIED   | 15 lines; `GET /health` returns `{ status: 'ok', shop: req.shopDomain }`                                   |
| `server.js`                           | Mounts `verifySessionToken` on `/api/*`; SHOPIFY_SCOPES in `REQUIRED_ENV` | VERIFIED | Line 4: `REQUIRED_ENV` includes `SHOPIFY_SCOPES`; line 54: `app.use('/api', verifySessionToken)`           |
| `shopify.app.profit-tracker.toml`     | `scopes = ""` in `[access_scopes]` section               | VERIFIED   | Line 25: `scopes = ""`; phase 2 scope list documented in comments                                           |
| `jest.config.js`                      | Test runner config with `testEnvironment: 'node'`        | VERIFIED   | `testEnvironment: 'node'`; `moduleNameMapper` maps prisma import to mock                                    |
| `tests/__mocks__/prisma.js`           | Mocked Prisma client; exports `prisma.shopSession.deleteMany` | VERIFIED | Exports `{ prisma: { shopSession: { deleteMany: jest.fn(), findFirst: jest.fn() } } }`                    |
| `tests/webhooks.test.js`             | 4 test cases for GDPR handlers                           | VERIFIED   | 4 tests; all pass                                                                                            |
| `tests/auth.test.js`                  | 4 test cases for JWT middleware                          | VERIFIED   | 4 tests; all pass                                                                                            |
| `tests/env.test.js`                   | 3 test cases for env validation                          | VERIFIED   | 3 tests; all pass; `SHOPIFY_SCOPES` removal tested                                                          |
| `tests/scopes.test.js`               | 1 test case for scope pruning                            | VERIFIED   | 1 test; passes; reads actual toml file and asserts zero scopes                                               |

---

### Key Link Verification

| From                              | To                              | Via                                          | Status   | Details                                                                                     |
|-----------------------------------|---------------------------------|----------------------------------------------|----------|---------------------------------------------------------------------------------------------|
| `routes/webhooks.js`              | `prisma.shopSession`            | `deleteMany` in `shop/redact` handler        | VERIFIED | Lines 78: `await prisma.shopSession.deleteMany({ where: { shop: myshopify_domain } })`      |
| `routes/webhooks.js`              | `verifyWebhookHmac`             | Called at top of every GDPR handler          | VERIFIED | Lines 23, 48, 72, 95: every handler checks HMAC before parsing payload                     |
| `server.js`                       | `lib/verifySessionToken.js`     | `require` + `app.use('/api', verifySessionToken)` | VERIFIED | Line 53: destructured require; line 54: `app.use('/api', verifySessionToken)`              |
| `lib/verifySessionToken.js`       | `jsonwebtoken`                  | `jwt.verify` with `algorithms: ['HS256']`    | VERIFIED | Line 17–19: `jwt.verify(token, secret, { algorithms: ['HS256'] })`                        |
| `lib/verifySessionToken.js`       | `req.shopDomain`                | Set from `payload.dest` hostname             | VERIFIED | Line 38: `req.shopDomain = destDomain`; comment explicitly notes `req.query.shop` is not trusted |
| `tests/webhooks.test.js`          | `routes/webhooks.js`            | Supertest app import                         | VERIFIED | Line 15: `require('../routes/webhooks')`; test mounts router at `/webhooks`                |
| `tests/__mocks__/prisma.js`       | `lib/prisma.js`                 | Jest `moduleNameMapper` in jest.config.js    | VERIFIED | `jest.config.js` lines 7–8: both `../lib/prisma` and `./lib/prisma` paths mapped to mock   |
| `server.js REQUIRED_ENV`          | `process.exit(1)`               | `missing.length` check                       | VERIFIED | Line 4: `SHOPIFY_SCOPES` in array; lines 5–8: filter + exit logic present                  |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                            | Status    | Evidence                                                                                              |
|-------------|-------------|------------------------------------------------------------------------|-----------|-------------------------------------------------------------------------------------------------------|
| FOUND-01    | 01-02       | GDPR webhooks with real handlers (not stubs)                           | SATISFIED | All three GDPR handlers call `verifyWebhookHmac`; `shop/redact` performs `deleteMany`; 4/4 tests pass |
| FOUND-02    | 01-04       | OAuth scopes pruned to minimum required                                | SATISFIED | `scopes = ""` in toml; `scopes.test.js` passes; no excess scopes in the file                         |
| FOUND-03    | 01-04       | Server fails fast with clear errors on missing env vars                | SATISFIED | `REQUIRED_ENV` includes all 5 vars including `SHOPIFY_SCOPES`; `env.test.js` 3/3 passes               |
| FOUND-04    | 01-03       | `/api/*` routes validate session tokens; shop from token not query string | SATISFIED | `verifySessionToken` middleware mounted on `/api`; `req.shopDomain` from `payload.dest`; 4/4 tests pass |

No orphaned requirements: all four Phase 1 requirement IDs (FOUND-01 through FOUND-04) are claimed by plans and verified in the codebase.

---

### Anti-Patterns Found

No blockers or warnings detected.

| File                          | Line | Pattern | Severity | Impact |
|-------------------------------|------|---------|----------|--------|
| No issues found               | —    | —       | —        | —      |

Scanned: `routes/webhooks.js`, `lib/verifySessionToken.js`, `routes/api.js`, `server.js` — no TODO/FIXME/placeholder/stub/return null patterns found.

---

### Human Verification Required

None required. All four success criteria are mechanically testable and the test suite confirms them:

- GDPR webhook real database operation: confirmed by `prisma.shopSession.deleteMany` call + passing mock assertion in `webhooks.test.js`
- OAuth scopes: confirmed by regex parse of toml file in `scopes.test.js`
- Env validation: confirmed by `spawnSync` in `env.test.js` (actual subprocess isolation; uses `os.tmpdir()` as cwd to prevent `.env` leakage)
- JWT middleware: confirmed by `auth.test.js` exercising no-header, expired, wrong-audience, and valid-token cases

One item worth a human spot-check when deploying:

### 1. Live Shopify GDPR webhook delivery

**Test:** In the Shopify Partner Dashboard, use "Send test notification" for each GDPR webhook type against the deployed app URL.
**Expected:** Each returns 200 within 5 seconds; `shop/redact` does not error when the shop has no session rows.
**Why human:** Requires a deployed instance with real Shopify infrastructure — cannot verify against `localhost` in CI.

---

### Gaps Summary

No gaps. All four observable truths are fully verified, all artifacts exist and are substantive (not stubs), all key links are wired, and all 12 tests pass with zero failures.

The test harness (env isolation via `os.tmpdir()`, prisma mock via `moduleNameMapper`, HMAC helper in webhook tests) is production-quality and will catch regressions.

---

_Verified: 2026-03-10_
_Verifier: Claude (gsd-verifier)_
