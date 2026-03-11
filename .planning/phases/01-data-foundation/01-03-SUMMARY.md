---
phase: 01-data-foundation
plan: 03
subsystem: auth
tags: [jwt, jsonwebtoken, express, shopify, middleware, session-token]

# Dependency graph
requires:
  - phase: 01-data-foundation/01-01
    provides: jest test infrastructure and auth.test.js with pre-written failing tests for JWT middleware
provides:
  - Express middleware (lib/verifySessionToken.js) that validates Shopify App Bridge HS256 session tokens
  - Protected /api/* router (routes/api.js) with GET /api/health endpoint
  - server.js wired to apply JWT middleware on all /api/* routes
affects: [02-sync-profit-engine, 03-dashboard]

# Tech tracking
tech-stack:
  added: [jsonwebtoken@9.x]
  patterns:
    - JWT HS256 verification with explicit algorithm to prevent algorithm confusion attacks
    - req.shopDomain set from payload.dest hostname (never from req.query.shop)
    - Dual export pattern (module.exports = fn; module.exports.fn = fn) for test + destructured usage compatibility

key-files:
  created:
    - lib/verifySessionToken.js
    - routes/api.js
  modified:
    - server.js
    - package.json

key-decisions:
  - "Export verifySessionToken as both module.exports (function) and named export to satisfy test require() and server.js destructure pattern simultaneously"
  - "Use jsonwebtoken (CommonJS) rather than jose — project is Node.js/Express on Railway, not Edge runtime, CommonJS is appropriate"
  - "aud claim validation against SHOPIFY_API_KEY prevents token reuse across apps sharing same secret"

patterns-established:
  - "Pattern 1: All /api/* routes require valid Shopify App Bridge JWT — never trust req.query.shop"
  - "Pattern 2: req.shopDomain is the canonical shop identifier set by middleware from payload.dest"
  - "Pattern 3: JWT middleware mounted in server.js before the api router — separation of concerns"

requirements-completed: [FOUND-04]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 1 Plan 03: JWT Session Token Middleware Summary

**Shopify App Bridge HS256 JWT middleware with audience and domain validation, wired to all /api/* Express routes via req.shopDomain from payload.dest**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T03:28:50Z
- **Completed:** 2026-03-11T03:33:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created lib/verifySessionToken.js Express middleware that validates Shopify App Bridge session tokens (HS256 JWT signed with SHOPIFY_API_SECRET)
- Validates aud claim against SHOPIFY_API_KEY and checks iss/dest domain consistency per Shopify App Review requirements
- Created routes/api.js with authenticated GET /api/health endpoint returning shop domain from token
- Updated server.js to mount JWT middleware on /api/* before the api router — auth/webhooks/health routes unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Create JWT middleware (lib/verifySessionToken.js)** - `f1db772` (feat)
2. **Task 2: Create /api route and mount JWT middleware in server.js** - `3bdbaf2` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks — tests pre-existed from plan 01-01, implementation written to make them pass_

## Files Created/Modified
- `lib/verifySessionToken.js` - Express middleware: verifies Shopify App Bridge HS256 JWT, sets req.shopDomain
- `routes/api.js` - Protected API router with GET /api/health
- `server.js` - Added verifySessionToken and api router mounting on /api/*
- `package.json` - Added jsonwebtoken dependency

## Decisions Made
- Exported verifySessionToken as both module.exports (function) and named export (.verifySessionToken) — pre-written auth.test.js uses require() result directly as middleware without destructuring, while server.js pattern uses destructuring
- Used CommonJS jsonwebtoken (not jose) — project runs Node.js on Railway, not Edge runtime; existing codebase is all CommonJS require()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed module export to support both direct and destructured usage**
- **Found during:** Task 1 (Create JWT middleware) — GREEN phase test run
- **Issue:** Plan specified `module.exports = { verifySessionToken }` (named export object), but pre-written auth.test.js (from plan 01-01) does `verifySessionToken = require('../lib/verifySessionToken')` then `app.use('/api', verifySessionToken)` — passing the object to Express, which requires a function. Express throws "Router.use() requires a middleware function but got an Object".
- **Fix:** Changed to `module.exports = verifySessionToken; module.exports.verifySessionToken = verifySessionToken;` — works as both direct function (test) and destructured named export (server.js)
- **Files modified:** lib/verifySessionToken.js
- **Verification:** All 4 auth tests pass; `node -e "const m = require('./lib/verifySessionToken'); console.log(typeof m)"` prints "function"
- **Committed in:** f1db772 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix was necessary for test compatibility. No scope creep. The dual-export pattern is the correct solution when a module needs to serve both usage styles.

## Issues Encountered
- Pre-written test from plan 01-01 used `require()` result directly as middleware (no destructuring). Plan specified named export. Fixed by dual-export pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All /api/* routes now protected by JWT middleware — Phase 2 sync/profit endpoints can be added to routes/api.js and will automatically require valid session tokens
- req.shopDomain available on all authenticated requests — Phase 2 can use this as the shop identifier for database queries
- No blockers for Phase 2

---
*Phase: 01-data-foundation*
*Completed: 2026-03-11*
