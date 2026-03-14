---
phase: 04-billing
plan: 03
subsystem: billing
tags: [shopify-billing, jwt, prisma, webhook, oauth]

# Dependency graph
requires:
  - phase: 04-02
    provides: routes/billing.js with createBillingSubscription, checkBillingStatus, billingWebhookRouter

provides:
  - OAuth callback redirects to Shopify subscription approval page (not /admin)
  - /admin billing gate with Pattern 5 live verification fallback
  - API 402 guard in verifySessionToken for inactive/missing subscriptions
  - APP_SUBSCRIPTIONS_UPDATE registered programmatically via WEBHOOK_TOPICS
  - All 8 billing tests GREEN (59 total)

affects:
  - server.js
  - routes/auth.js
  - lib/verifySessionToken.js

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 5 live verification: checkBillingStatus before createBillingSubscription to handle race conditions after merchant approval"
    - "Billing guard as async Express middleware — async is backward-compatible with Express"
    - "jest.config.js sibling path mapping ./prisma for lib/ modules requiring sibling modules"

key-files:
  created: []
  modified:
    - routes/auth.js
    - server.js
    - lib/verifySessionToken.js
    - tests/__mocks__/prisma.js
    - tests/billing.test.js
    - tests/auth.test.js
    - jest.config.js

key-decisions:
  - "OAuth callback redirects to confirmationUrl on success; falls through to /admin on billing error — never blocks merchant on billing failure"
  - "/admin billing gate uses Pattern 5 (live checkBillingStatus before createBillingSubscription) to handle race conditions where webhook fires after merchant approval"
  - "verifySessionToken made async — Express handles async middleware transparently; billing check added after shopDomain is set"
  - "jest.config.js adds './prisma' sibling path mapping so lib/verifySessionToken.js gets mocked prisma in tests"
  - "auth.test.js updated to mock prisma.shopSession.findFirst with ACTIVE session in beforeEach — required for billing-aware verifySessionToken"
  - "billing.test.js Test 5 required explicit checkBillingStatus.mockResolvedValue(true) — mock module returns false by default; shopifyGraphQL mock alone is not sufficient since checkBillingStatus is fully mocked"

patterns-established:
  - "Pattern 5 live verification: always checkBillingStatus before redirecting to billing approval on /admin load"
  - "Billing failures are non-fatal: fall through to serve app rather than blocking merchant indefinitely"
  - "Sibling prisma require (./prisma) needs explicit jest.config.js mapping alongside parent-relative (../lib/prisma)"

requirements-completed: [BILL-01]

# Metrics
duration: 15min
completed: 2026-03-14
---

# Phase 4 Plan 03: Billing Gate Integration Summary

**Full billing gate wired into OAuth callback, /admin route, and API middleware — new installs redirect to Shopify billing approval; inactive subscriptions get 402 on API and redirect on /admin; all 59 tests GREEN.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-14T17:00:00Z
- **Completed:** 2026-03-14T17:15:00Z
- **Tasks:** 1 of 2 (Task 2 is human checkpoint)
- **Files modified:** 7

## Accomplishments

- OAuth callback now calls `createBillingSubscription` and redirects merchant to Shopify's `confirmationUrl` instead of `/admin`; billing errors fall through non-fatally
- `/admin` route has billing gate with Pattern 5 live verification fallback: checks `checkBillingStatus` first to handle race conditions where merchant approved but webhook hasn't fired yet
- `verifySessionToken` upgraded to async with prisma billing check — returns 402 when `billingStatus !== 'ACTIVE'`; shop not found returns 401
- `APP_SUBSCRIPTIONS_UPDATE` added to `WEBHOOK_TOPICS` in `routes/auth.js` for programmatic registration
- All 8 billing tests GREEN (total suite: 59 passing)

## Task Commits

1. **Task 1: Wire billing into auth.js, server.js, verifySessionToken.js, and update prisma mock** - `72808a1` (feat)

## Files Created/Modified

- `/Users/henry/code/profit-tracker/routes/auth.js` - Added `createBillingSubscription` import, `APP_SUBSCRIPTIONS_UPDATE` topic, billing redirect in OAuth callback
- `/Users/henry/code/profit-tracker/server.js` - Added `createBillingSubscription`/`checkBillingStatus` import, billing gate with Pattern 5 to `/admin` route
- `/Users/henry/code/profit-tracker/lib/verifySessionToken.js` - Made async, added prisma billing guard returning 402 for inactive subscriptions
- `/Users/henry/code/profit-tracker/tests/__mocks__/prisma.js` - Added `shopSession.update` mock
- `/Users/henry/code/profit-tracker/tests/billing.test.js` - Added `checkBillingStatus` import, Pattern 5 logic to test app `/admin`, explicit `mockResolvedValue(true)` for Test 5
- `/Users/henry/code/profit-tracker/tests/auth.test.js` - Added prisma import and `beforeEach` with ACTIVE session mock for billing-aware verifySessionToken
- `/Users/henry/code/profit-tracker/jest.config.js` - Added `./prisma` sibling path mapping for lib/ module requires

## Decisions Made

- **Billing failures are non-fatal in OAuth callback:** If `createBillingSubscription` errors or returns no URL, fall through to redirect to `/admin` — never block merchant permanently
- **Pattern 5 in /admin:** `checkBillingStatus` is called before `createBillingSubscription` to handle the race condition where a merchant approves billing but the webhook hasn't fired yet. If live check is ACTIVE, update DB and serve the app.
- **verifySessionToken made async:** Express handles async middleware transparently — no callers needed updating.
- **`./prisma` jest mapping added:** `lib/verifySessionToken.js` requires `./prisma` (sibling path), which wasn't mapped in jest.config.js. Added `'^./prisma$'` mapping to prevent real Prisma calls in tests.
- **auth.test.js mock setup added:** The billing guard in verifySessionToken requires a DB session with `billingStatus: 'ACTIVE'` for requests to pass through. Added `beforeEach` mock setup in auth.test.js.
- **billing.test.js Test 5 explicit mock:** `checkBillingStatus` is a `jest.fn()` in the billing mock module — `clearMocks: true` doesn't reset implementations to default, so it retained `false`. Test 5 needed explicit `checkBillingStatus.mockResolvedValue(true)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] billing.test.js Test 5 missing checkBillingStatus mock**
- **Found during:** Task 1 (GREEN phase verification)
- **Issue:** Test 5 mocked `shopifyGraphQL` directly but `checkBillingStatus` is a jest.fn() mock (not the real implementation), so it always returned `false` regardless of `shopifyGraphQL` mock. Test remained RED.
- **Fix:** Added `checkBillingStatus` to the test's imports and added `checkBillingStatus.mockResolvedValue(true)` in Test 5 setup. Also added Pattern 5 logic to the test app's `/admin` handler.
- **Files modified:** tests/billing.test.js
- **Verification:** All 8 billing tests GREEN
- **Committed in:** 72808a1 (Task 1 commit)

**2. [Rule 2 - Missing Critical] auth.test.js needed prisma mock for billing-aware verifySessionToken**
- **Found during:** Task 1 (full suite run)
- **Issue:** After adding prisma billing guard to verifySessionToken, auth.test.js's "valid JWT returns 200" test got 401 "Shop not found" because prisma.shopSession.findFirst returned null (default mock).
- **Fix:** Added `const { prisma } = require('../lib/prisma')` import and `beforeEach` that mocks `findFirst` to return an ACTIVE session.
- **Files modified:** tests/auth.test.js
- **Verification:** auth.test.js: 4 passing
- **Committed in:** 72808a1 (Task 1 commit)

**3. [Rule 3 - Blocking] jest.config.js missing './prisma' sibling path mapping**
- **Found during:** Task 1 (full suite run)
- **Issue:** `lib/verifySessionToken.js` requires `./prisma` (sibling), but jest.config.js only mapped `../lib/prisma` and `./lib/prisma`. The sibling require reached the real Prisma client and failed with "column billing_status does not exist".
- **Fix:** Added `'^./prisma$': '<rootDir>/tests/__mocks__/prisma.js'` to moduleNameMapper.
- **Files modified:** jest.config.js
- **Verification:** No real Prisma calls in tests; all 59 tests GREEN
- **Committed in:** 72808a1 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** All three fixes were necessary for the test suite to reach GREEN. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None — no new external service configuration required.

## Next Phase Readiness

Task 2 (human-verify checkpoint) is outstanding — requires manual verification in a Shopify Partner dev store:
1. Fresh install redirects to `{shop}.myshopify.com/admin/charges/confirm_recurring`
2. Accepting the charge lands on the profit dashboard at /admin
3. Cancelling subscription and refreshing /admin re-triggers billing approval
4. `/api/dashboard/overview` returns 402 before approving (test with a valid JWT)

BILL-01 is code-complete. The billing gate is enforced at all three access points. Human end-to-end verification is the only remaining step before App Store submission readiness.

---
*Phase: 04-billing*
*Completed: 2026-03-14*
