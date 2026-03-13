---
phase: 02-sync-and-profit-engine
plan: "04"
subsystem: sync, webhooks, auth
tags: [shopify, webhooks, hmac, deduplication, bulk-operations, oauth, express]

# Dependency graph
requires:
  - phase: 02-sync-and-profit-engine
    plan: "02"
    provides: calculateOrderProfit from lib/profitEngine.js
  - phase: 02-sync-and-profit-engine
    plan: "03"
    provides: upsertOrder, parseOrderFromShopify, processBulkResult from lib/syncOrders.js
provides:
  - routes/webhooks.js with 5 new handlers: orders/paid, orders/updated, orders/cancelled, refunds/create, bulk/finish
  - In-memory processedWebhooks Set deduplication with 30-min TTL cleanup
  - routes/auth.js with registerWebhooks() fire-and-forget after OAuth session upsert
  - tests/sync.test.js: 10 tests GREEN (orders/paid 200/401/dedup, refunds/create 200/401, plus 5 pre-existing)
affects: [02-05, 02-06, 03-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Webhook respond-first pattern: res.status(200).send('OK') BEFORE setImmediate async processing to stay within Shopify 5s timeout
    - In-memory deduplication Set with periodic clear() (30-min TTL) — correct for Shopify 15-min retry window at MVP scale
    - Fire-and-forget webhook registration in OAuth callback — errors logged, non-fatal, merchant not blocked
    - SHOPIFY_APP_URL env var used for absolute webhook URIs on registration

key-files:
  created: []
  modified:
    - routes/webhooks.js (4 new order handlers + bulk/finish = 5 new routes, 9 total)
    - routes/auth.js (added shopifyGraphQL, WEBHOOK_TOPICS, WEBHOOK_CREATE_MUTATION, registerWebhooks, fire-and-forget call)
    - tests/sync.test.js (replaced webhook scaffold stubs with real supertest assertions)

key-decisions:
  - "Webhook registration is fire-and-forget in OAuth callback — merchant must be redirected promptly; background errors are logged not fatal"
  - "In-memory processedWebhooks Set cleared every 30 min — covers Shopify 15-min retry window without DB round-trip overhead at MVP scale"
  - "bulk/finish handler does NOT use deduplication — bulk operations are non-idempotent (JSONL URL expires) and won't be duplicated by Shopify"
  - "refunds/create handler re-uses upsertOrder path (not calculateOrderProfit directly) to ensure DB update atomicity with the Order record"

patterns-established:
  - "Respond-first pattern: res.status(200).send('OK') then setImmediate() for all webhook handlers — Shopify marks webhook delivery failed after 5s"
  - "shopifyGraphQL required inside setImmediate callback to avoid circular dependency at module load time"

requirements-completed: [SYNC-02, FEES-04]

# Metrics
duration: 15min
completed: 2026-03-13
---

# Phase 2 Plan 04: Webhook Handlers and Registration Summary

**5 order webhook handlers (orders/paid/updated/cancelled, refunds/create, bulk/finish) + automatic registration after OAuth using webhookSubscriptionCreate mutation**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-13T16:00:00Z
- **Completed:** 2026-03-13T16:13:03Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added 5 new webhook handlers to routes/webhooks.js — orders/paid, orders/updated, orders/cancelled, refunds/create, and bulk/finish — all follow the respond-first (200 before async) pattern to stay within Shopify's 5-second delivery timeout
- Added in-memory processedWebhooks Set with 30-minute TTL cleanup for deduplication on Shopify webhook retries for orders/paid and refunds/create handlers; bulk/finish excluded (non-idempotent operation)
- Added bulk/finish handler that queries Shopify for the JSONL download URL then calls processBulkResult to complete the historical sync loop
- Added registerWebhooks() function to routes/auth.js that registers all 5 webhook topics using SHOPIFY_APP_URL env var; called fire-and-forget after OAuth shopSession upsert so merchant redirect is not blocked
- Replaced scaffold test stubs in sync.test.js with real supertest assertions — all 10 sync tests now GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Add orders/paid, orders/updated, orders/cancelled, and refunds/create handlers** - `158f4a4` (feat)
2. **Task 2: Add bulk/finish webhook handler** - `f3a9750` (feat)
3. **Task 3: Register webhooks after OAuth in routes/auth.js** - `1eee2fd` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `routes/webhooks.js` - 5 new handlers; processedWebhooks Set deduplication with 30-min TTL; 9 router.post routes total
- `routes/auth.js` - Added shopifyGraphQL, WEBHOOK_TOPICS (5 topics), WEBHOOK_CREATE_MUTATION, registerWebhooks() function; fire-and-forget call after shopSession upsert
- `tests/sync.test.js` - Replaced scaffold stubs with real supertest assertions (orders/paid 200/401/dedup, refunds/create 200/401); 10 tests GREEN

## Decisions Made

- Webhook registration is fire-and-forget: `registerWebhooks(shop, access_token).catch(err => console.error(...))` — merchant must be redirected promptly after OAuth; registration errors are logged but non-fatal
- In-memory Set with `setInterval(() => processedWebhooks.clear(), 30 * 60 * 1000)` chosen over DB-backed dedup — covers Shopify's 15-minute retry window without adding DB latency to every webhook handler at MVP scale
- bulk/finish skips deduplication — the JSONL URL expires and bulk operations are Shopify-guaranteed to fire once per operation, unlike regular webhooks
- refunds/create recalculates profit by calling `upsertOrder()` (not `calculateOrderProfit()` directly) to ensure the DB update is atomic across Order + OrderProfit tables

## Deviations from Plan

None - plan executed exactly as written. All handlers, deduplication pattern, bulk op status query, and webhook registration pattern implemented exactly per plan specification.

## Issues Encountered

One pre-existing RED scaffold test in tests/fees.test.js (`expect(false).toBe(true, 'implement shipping extraction...')`) was present before this plan started — confirmed by git stash verification. This is out of scope for 02-04; marked for tracking in fees plan.

## User Setup Required

`SHOPIFY_APP_URL` environment variable must be set in production for webhook registration URIs to be absolute. Without it, `registerWebhooks()` logs an error and skips registration (safe failure).

## Next Phase Readiness

- All 5 webhook handlers live in routes/webhooks.js — Shopify will route traffic correctly after OAuth completes
- Webhook registration fires automatically on each OAuth (idempotent via Shopify's subscription API)
- Historical sync loop is now complete end-to-end: bulk op trigger (Plan 03) → bulk/finish handler (Plan 04) → processBulkResult (Plan 03)
- Plans 05 and 06 can build on the complete sync foundation

---
*Phase: 02-sync-and-profit-engine*
*Completed: 2026-03-13*

## Self-Check: PASSED

- FOUND: routes/webhooks.js (9 router.post routes, bulk/finish handler present)
- FOUND: routes/auth.js (registerWebhooks function, webhookSubscriptionCreate present)
- FOUND: tests/sync.test.js (10 tests GREEN as verified by Jest run)
- FOUND commit 158f4a4: feat(02-04): add order webhook handlers with deduplication and real tests
- FOUND commit f3a9750: feat(02-04): add bulk/finish webhook handler for historical sync completion
- FOUND commit 1eee2fd: feat(02-04): register webhooks after OAuth in routes/auth.js
- Jest sync.test.js: 10 PASS, 0 FAIL
- Jest webhooks.test.js: 4 PASS, 0 FAIL
- Jest auth.test.js: 4 PASS, 0 FAIL
