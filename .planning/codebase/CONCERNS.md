# Codebase Concerns

**Analysis Date:** 2026-03-10

## Security Considerations

**Missing Critical Environment Variable Validation:**
- Issue: Required secrets (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`) are used without validation at startup. If any are missing or undefined, the app will fail silently at runtime when those routes are accessed.
- Files: `server.js` (line 8), `routes/auth.js` (lines 26, 58-60, 95, 108-109, 137), `routes/webhooks.js` (line 8)
- Impact: App will not fail fast on misconfiguration. OAuth flows and webhook verification will silently fail or expose security issues.
- Fix approach: Add startup validation in `server.js` that throws before listening if critical env vars are missing. Example: validate `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `DATABASE_URL` exist before `app.listen()`.

**Prisma Client Instance Not Reused in Development:**
- Issue: `lib/prisma.js` only attaches the Prisma instance to global in non-production environments (line 6-7). This works but is backwards — you want to avoid connection pool exhaustion during dev hot-reloads. Production should NOT create multiple instances.
- Files: `lib/prisma.js` (lines 6-8)
- Impact: Risk of Prisma warnings during development. In production with process reloads, each reload could create a new client.
- Fix approach: Reverse the logic. Always use global instance for single-instance pattern. In production, ensure graceful shutdown of Prisma on process termination.

**HMAC Verification Timing Attack Risk:**
- Issue: String comparison in `routes/webhooks.js` (line 11) and `routes/auth.js` (line 99) uses `===` which is vulnerable to timing attacks on sensitive cryptographic values.
- Files: `routes/webhooks.js` (line 11), `routes/auth.js` (line 99)
- Impact: Attackers could theoretically brute-force valid HMACs by timing response differences, though impact is mitigated by other security layers.
- Fix approach: Use `crypto.timingSafeEqual()` for HMAC and state token comparisons.

**CSP Header Injection Risk:**
- Issue: `server.js` (lines 15-20) constructs CSP header directly from query parameter `req.query.shop` without validation. While the regex check `shop.includes('.')` provides some protection, a malicious shop name could still potentially bypass or inject into the CSP header.
- Files: `server.js` (lines 14-26)
- Impact: Potential for CSP header injection if shop validation is incomplete. Could allow XSS attacks in embedded context.
- Fix approach: Validate shop parameter against strict regex `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i` before using in header.

**Webhook Privacy Compliance Stubs Are Dangerous:**
- Issue: `routes/webhooks.js` (lines 37-40) implements GDPR/CCPA compliance webhooks (`customers/redact`, `customers/data_request`, `shop/redact`) as empty stubs that return 200 OK without actually processing anything.
- Files: `routes/webhooks.js` (lines 37-40)
- Impact: App claims compliance with webhook registration to Shopify but does not actually delete customer data when requested. This is a serious compliance violation. Shopify may revoke app listing if audited.
- Fix approach: Implement actual data deletion logic or remove webhook registration from Shopify Partners dashboard until implementation is ready. Do not fake compliance.

**Access Token Stored Without Encryption:**
- Issue: Shopify access tokens are stored in plaintext in the database via `prisma.shopSession.upsert()` at `routes/auth.js` (line 121-131).
- Files: `routes/auth.js` (lines 121-131), `prisma/schema.prisma` (line 13)
- Impact: Database compromise exposes all merchant API tokens. Attackers can access all connected Shopify stores.
- Fix approach: Encrypt access tokens at rest using field-level encryption (consider `@prisma/extension-encrypted-fields` or external encryption before storage). Store only hashed tokens if possible, or implement secure token rotation.

**No Logout / Session Revocation Mechanism:**
- Issue: There is no endpoint to revoke sessions or log out users. Sessions persist indefinitely in the database unless explicitly deleted.
- Files: `routes/auth.js`, `prisma/schema.prisma`
- Impact: Compromised sessions cannot be invalidated. If a merchant's device is stolen or session leaked, attacker maintains access until token naturally expires (if ever).
- Fix approach: Add `DELETE /auth/logout` endpoint and `PUT /auth/session/revoke` endpoint to allow explicit session termination.

## Tech Debt

**Monolithic Server File Structure:**
- Issue: `server.js` contains CSP middleware, static file serving, and two application routes alongside HTML generation (lines 50-87). As the app grows, this file will become unmanageable.
- Files: `server.js`
- Impact: Difficult to test, hard to modify middleware without breaking routes. Future middleware additions will clutter the file further.
- Fix approach: Extract middleware into `lib/middleware.js`, extract route handlers into separate files, use `app.use()` in cleaner order. Reserve `server.js` for bootstrap only.

**No Error Handling Middleware:**
- Issue: Express has no global error handler. Unhandled errors in async route handlers (`routes/auth.js` lines 49-66, 72-144) will cause the server to hang or respond with 500 without structured error output.
- Files: `server.js`, `routes/auth.js`, `routes/webhooks.js`
- Impact: Difficult to debug errors in production. Stack traces are only in console logs, not sent to monitoring. Users see generic "failed" messages.
- Fix approach: Add global error handler middleware: `app.use((err, req, res, next) => { ... })` before `app.listen()`. Log structured errors with context (shop, action, timestamp).

**No Input Validation Library:**
- Issue: Manual validation of `shop`, `code`, `state`, `hmac` parameters in `routes/auth.js` (lines 74-78, 82-84). As the app adds more endpoints, this manual approach will lead to inconsistencies.
- Files: `routes/auth.js` (lines 18-20, 74-78, 82-84), `server.js` (line 42)
- Impact: Inconsistent error messages, missed validation cases, difficult to add validation rules later.
- Fix approach: Integrate schema validation library (e.g., `zod`, `joi`, or `express-validator`). Define reusable schemas for shop, OAuth params, webhook payloads.

**Database Cleanup Is Brittle:**
- Issue: OAuth state cleanup at `routes/auth.js` (lines 53-56) happens inline in the auth initiation request. If cleanup fails, states leak indefinitely. No monitoring for orphaned states.
- Files: `routes/auth.js` (lines 53-56)
- Impact: Database accumulates stale OAuth states over time if there are transient DB failures. Could slow queries.
- Fix approach: Move cleanup to a background job (node-cron or similar). Log cleanup success/failure. Add database maintenance endpoint or scheduled task to purge states older than 1 hour.

**No Logging Infrastructure:**
- Issue: All logging is `console.log()` and `console.error()`. No timestamps, log levels, or structure beyond plain text (e.g., `console.log(\`OAuth completed for ${shop}\`)`).
- Files: `routes/auth.js` (lines 64, 133, 142), `routes/webhooks.js` (line 28)
- Impact: Difficult to debug issues in production. No way to filter logs by severity or component. Cloud logs become noise.
- Fix approach: Integrate structured logging (e.g., `pino`, `winston`). Log with levels (debug, info, warn, error) and consistent field names (shop, action, duration, error.message, error.stack).

**No Request/Response Logging:**
- Issue: No middleware to log incoming requests or outgoing responses. Critical for debugging OAuth issues.
- Files: `server.js`
- Impact: When OAuth flow fails, no record of what parameters were sent or what response was given.
- Fix approach: Add request logging middleware (e.g., `morgan`) before routes to log method, path, status, duration.

**Inline HTML in Route Handlers:**
- Issue: HTML is generated as template literals in `server.js` (lines 50-87) and `routes/auth.js` (lines 27-46). Not maintainable as UI grows.
- Files: `server.js` (lines 50-87), `routes/auth.js` (lines 27-46)
- Impact: Hard to update UI, no syntax highlighting, difficult to test HTML structure, security risks from improper escaping.
- Fix approach: Move HTML to template files (use `ejs`, `pug`, or plain HTML served from `/public`). Use proper template engine if dynamic content needed.

**No TypeScript:**
- Issue: Entire codebase is vanilla JavaScript. No type safety for function parameters, return values, or database models.
- Files: All `.js` files
- Impact: Hard to catch bugs at development time. IDE autocomplete is weak. Refactoring is risky.
- Fix approach: Migrate to TypeScript incrementally. Start with `server.js` and `routes/` directory. Add `tsconfig.json` and build step.

**Dependency Vulnerabilities Not Addressed:**
- Issue: No automated dependency scanning. `package.json` uses caret versioning (`^5.22.0`, `^4.22.1`) which allows minor version bumps that could introduce breaking changes.
- Files: `package.json`
- Impact: Dependencies can silently receive patches/minor updates that introduce bugs or security issues.
- Fix approach: Add `npm audit` to CI/CD. Use exact versions (`5.22.0` not `^5.22.0`) or lock to patch only (`~5.22.0`). Regularly run `npm audit fix`.

## Performance Bottlenecks

**No Database Indexing Strategy:**
- Issue: `prisma/schema.prisma` has no indexes beyond primary keys. Lookups by `shop` in `ShopSession` are sequential.
- Files: `prisma/schema.prisma`
- Impact: As merchant count grows, auth lookups become slow. Webhook processing for `shop/redact` will scan entire sessions table.
- Fix approach: Add `@@index([shop])` to `ShopSession` model. Consider composite indexes if future queries join multiple tables.

**Synchronous OAuth Flow:**
- Issue: The entire OAuth callback in `routes/auth.js` (lines 72-144) is synchronous, including the fetch to Shopify token endpoint (line 104). If Shopify is slow, request hangs.
- Files: `routes/auth.js` (lines 72-144)
- Impact: Poor user experience if Shopify API is slow or unreachable. Could block other requests on single-threaded Node.
- Fix approach: Add timeout to fetch (use `AbortController`). Consider async queue for token exchanges if scaling to many concurrent installs.

**No Connection Pooling Configuration:**
- Issue: Prisma client uses default connection pool settings. As concurrent requests grow, connection exhaustion is possible.
- Files: `lib/prisma.js`, `prisma/schema.prisma`
- Impact: App will hang or error under load if connection pool is exhausted.
- Fix approach: Configure Prisma connection pool in `datasource db` block: `connection_limit = 10`, or adjust based on expected concurrent load. Monitor connection usage.

**No Response Caching:**
- Issue: No HTTP caching headers or in-memory caching. Every admin page view queries the database.
- Files: `server.js` (lines 41-48)
- Impact: Unnecessary database load for repeated requests to same `/admin?shop=X` page.
- Fix approach: Add HTTP cache headers (`Cache-Control: private, max-age=300`) or cache session lookup results for short TTL.

## Fragile Areas

**OAuth State Management Is Race-Prone:**
- Issue: The OAuth state is created at `routes/auth.js` (line 51), then checked and deleted at callback (lines 81-85). If callback is called twice (browser refresh, accidental re-submit), second call fails with no meaningful message.
- Files: `routes/auth.js` (lines 49-67, 72-145)
- Impact: Legitimate user retries (due to slow network) result in "Invalid OAuth state" errors.
- Safe modification: Wrap state deletion in a try-catch. If state not found, check if session already exists and allow user through. Alternatively, use state for idempotency — allow replays within 2-minute window.
- Test coverage: No tests for OAuth flow. Manual retries untested. Add integration test for successful flow and retry scenarios.

**Shop Parameter Validation Is Weak:**
- Issue: `shop` parameter appears in 9+ places and is validated inconsistently. Some places check `shop.includes('.')` (server.js line 16), others trust it directly (auth.js line 22).
- Files: `server.js` (line 16), `routes/auth.js` (line 22), `routes/webhooks.js` (line 25)
- Impact: If validation is missed in one place, could allow SQL injection or path traversal if shop is later used in file operations.
- Safe modification: Create a single `validateShop(shop)` function in `lib/utils.js`. Use it everywhere. Make the regex strict: `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i`.
- Test coverage: No unit tests for shop validation. Add `lib/utils.test.js` with test cases for valid/invalid shops.

**Webhook HMAC Verification Is Fragile:**
- Issue: Raw body is required for HMAC verification (server.js line 29), but there's no check that the body is actually raw. If middleware order changes, signature fails silently.
- Files: `server.js` (line 29), `routes/webhooks.js` (lines 6-11)
- Impact: If someone later adds middleware that modifies the body before webhooks, HMAC verification silently fails and webhooks are ignored.
- Safe modification: Add a comment explaining the exact reason for the middleware order. Consider wrapping webhook routes in a middleware that enforces raw body.
- Test coverage: No tests for webhook HMAC verification. Add integration test with real Shopify webhook signature.

**No Graceful Shutdown:**
- Issue: When the server is killed (e.g., during deployment), Prisma connection is not closed. In-flight requests may hang.
- Files: `server.js` (lines 102-104)
- Impact: Deployments may timeout waiting for graceful shutdown. Stale connections accumulate.
- Safe modification: Add signal handlers before `app.listen()`: catch `SIGTERM` and `SIGINT`, close Prisma, then close HTTP server.
- Test coverage: No tests for shutdown behavior.

## Missing Critical Features

**No Session Validation Middleware:**
- Issue: The `/admin` endpoint (server.js line 41) checks if session exists but doesn't validate the token or handle expired tokens.
- Impact: Merchants see the dashboard even if their access token has been revoked from Shopify. No mechanism to refresh or re-authenticate.
- Blocks: Cannot safely display real data (e.g., products, orders) until session validation is in place.

**No Request Rate Limiting:**
- Issue: No protection against brute-force attacks or abuse. OAuth endpoint, webhook endpoint, and admin UI have no rate limiting.
- Impact: Attacker could brute-force OAuth state tokens or send unlimited webhook requests.
- Fix approach: Add `express-rate-limit` middleware. Limit `/auth` to 10 requests per IP per minute. Limit webhooks by shop + action type.

**No API Documentation:**
- Issue: No OpenAPI/Swagger spec, no endpoint comments beyond minimal JSDoc.
- Impact: Difficult for future developers to understand what endpoints exist or what they expect.
- Fix approach: Add JSDoc to all route handlers describing parameters, responses, and error cases.

**No Monitoring/Alerting:**
- Issue: No integration with error tracking (Sentry), performance monitoring (NewRelic), or health checks.
- Impact: Unaware of crashes or performance degradation in production until user reports it.
- Fix approach: Add Sentry integration for error tracking. Add `/health` endpoint for monitoring.

## Test Coverage Gaps

**No Tests at All:**
- Issue: Zero test files. Entire codebase is untested.
- Files: No `*.test.js` or `*.spec.js` files exist
- Risk: High — critical OAuth and webhook logic is unverified. Refactoring is dangerous.
- Priority: **High**

**OAuth Flow Untested:**
- Issue: Complex multi-step OAuth flow in `routes/auth.js` (lines 49-144) has no tests.
- Files: `routes/auth.js`
- Risk: Cannot verify state generation, HMAC verification, token exchange, or error handling.
- Priority: **High**

**Webhook Signature Verification Untested:**
- Issue: HMAC verification logic in `routes/webhooks.js` (lines 6-11) is untested.
- Files: `routes/webhooks.js`
- Risk: Vulnerable to signature bypass bugs.
- Priority: **High**

**CSP Header Generation Untested:**
- Issue: Shop parameter validation for CSP header in `server.js` (lines 14-26) is untested.
- Files: `server.js`
- Risk: Could allow header injection if regex is weak.
- Priority: **Medium**

**Database Models Not Validated:**
- Issue: No tests verifying Prisma schema matches expected constraints or indexing.
- Files: `prisma/schema.prisma`
- Risk: Schema changes could silently break migrations.
- Priority: **Medium**

---

*Concerns audit: 2026-03-10*
