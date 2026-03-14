---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 03-profit-dashboard 03-05-PLAN.md
last_updated: "2026-03-14T03:41:47.975Z"
last_activity: 2026-03-10 — Roadmap created, phases derived from requirements
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 16
  completed_plans: 16
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Merchants see what they actually kept — not just what came in — within 10 minutes of installing.
**Current focus:** Phase 1 - Data Foundation

## Current Position

Phase: 1 of 4 (Data Foundation)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-10 — Roadmap created, phases derived from requirements

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-data-foundation P01 | 7 | 2 tasks | 7 files |
| Phase 01-data-foundation P02 | 5min | 1 tasks | 1 files |
| Phase 01-data-foundation P04 | 138 | 1 tasks | 2 files |
| Phase 01-data-foundation P03 | 5 | 2 tasks | 4 files |
| Phase 02-sync-and-profit-engine P01 | 202 | 2 tasks | 8 files |
| Phase 02-sync-and-profit-engine P03 | 7 | 2 tasks | 6 files |
| Phase 02-sync-and-profit-engine P02 | 10 | 2 tasks | 6 files |
| Phase 02-sync-and-profit-engine P05 | 5 | 2 tasks | 2 files |
| Phase 02-sync-and-profit-engine P06 | 5 | 2 tasks | 3 files |
| Phase 02-sync-and-profit-engine P04 | 15 | 3 tasks | 3 files |
| Phase 02-sync-and-profit-engine P07 | 3 | 3 tasks | 2 files |
| Phase 03-profit-dashboard P01 | 8 | 2 tasks | 2 files |
| Phase 03-profit-dashboard P02 | 4 | 2 tasks | 1 files |
| Phase 03-profit-dashboard P03 | 3 | 2 tasks | 7 files |
| Phase 03-profit-dashboard P04 | 3 | 2 tasks | 6 files |
| Phase 03-profit-dashboard P05 | 5 | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Coarse granularity yielded 4 phases — Foundation → Sync/Profit Engine → Dashboard → Billing
- [Roadmap]: COGS and FEES requirements merged into Phase 2 (not separate phase) because profit is computed at write time; separating them would break the architecture
- [Roadmap]: GDPR handlers (FOUND-01) and scope cleanup (FOUND-02) are Phase 1 — they block App Store submission and must be resolved before any other work ships
- [Phase 01-data-foundation]: Pinned jest@29 (not 30) for Node 16.20.2 compatibility — jest@30 requires os.availableParallelism from Node 18
- [Phase 01-data-foundation]: env.test.js uses os.tmpdir() as spawnSync cwd to prevent dotenv from loading project .env and restoring deleted env vars
- [Phase 01-data-foundation]: auth.test.js uses try/catch + moduleLoaded flag for clean loading before lib/verifySessionToken.js is created
- [Phase 01-data-foundation]: customers/redact and customers/data_request are log-only in Phase 1 (no PII stored) — Phase 2+ annotated for real deletion/export
- [Phase 01-data-foundation]: shop/redact uses identical deleteMany pattern as app_uninstalled handler for consistent full shop data removal
- [Phase 01-data-foundation]: Phase 1 scopes set to empty string — App Review requires justification for every scope, no Admin API calls in Phase 1
- [Phase 01-data-foundation]: Phase 2 scopes documented as inline comments in toml; read_all_orders requires pre-approval before Phase 2 starts
- [Phase 01-data-foundation]: Export verifySessionToken as dual module.exports/named export for test + destructured usage compatibility
- [Phase 01-data-foundation]: req.shopDomain set from payload.dest hostname — never from req.query.shop (Shopify App Review requirement)
- [Phase 02-sync-and-profit-engine]: node-cron/multer/csv-parser installed as production dependencies — required at runtime for scheduling, file upload, and CSV parsing
- [Phase 02-sync-and-profit-engine]: shopifyClient mock registered via moduleNameMapper with both ../ and ./ path variants — consistent with existing prisma mock pattern
- [Phase 02-sync-and-profit-engine]: COGS time-series via insert-only ProductCost rows (NEVER update) — cogsTotal NULL signals unknown COGS, propagates to netProfit=NULL
- [Phase 02-sync-and-profit-engine]: profitEngine mock uses jest.mock() with virtual:true inline in sync.test.js — profit.test.js/fees.test.js/cogs.test.js import real lib/profitEngine once Plan 02-02 creates it
- [Phase 02-sync-and-profit-engine]: Added './shopifyClient' (sibling-require pattern) to jest.config.js moduleNameMapper for lib/ modules requiring siblings
- [Phase 02-sync-and-profit-engine]: Removed profitEngine from jest.config.js moduleNameMapper — sync.test.js uses jest.mock() inline; global mapping blocked profit.test.js from reaching real module
- [Phase 02-sync-and-profit-engine]: revenueNet = currentTotalPrice - totalRefunded (explicit subtraction); proportional COGS denominator is itemsTotal (lineItems sum), not currentTotalPrice
- [Phase 02-sync-and-profit-engine]: CSV imports store variantId=sku as placeholder — SKU-only entries valid per COGS-03, variantId can be null
- [Phase 02-sync-and-profit-engine]: Sub-millisecond effectiveFrom offset (now + imported count) prevents unique constraint collision on same-second CSV batch
- [Phase 02-sync-and-profit-engine]: syncPayouts filters CHARGE type only — REFUND transactions excluded; totalRefunded already handles revenue adjustment
- [Phase 02-sync-and-profit-engine]: Sum multiple CHARGE transactions per order before updating — partial capture creates multiple CHARGE nodes for same associatedOrder.id
- [Phase 02-sync-and-profit-engine]: syncPayouts is idempotent — repeated calls overwrite feesTotal with same computed value, safe to call after OAuth
- [Phase 02-sync-and-profit-engine]: Webhook registration is fire-and-forget in OAuth callback — merchant redirect must not be blocked; errors logged non-fatal
- [Phase 02-sync-and-profit-engine]: In-memory processedWebhooks Set with 30-min TTL — covers Shopify 15-min retry window without DB overhead at MVP scale
- [Phase 02-sync-and-profit-engine]: bulk/finish skips deduplication — JSONL URL expires, bulk ops fire once, dedup would break retry on legitimate failure
- [Phase 03-profit-dashboard]: Dashboard tests use mocked JWT middleware (always-authenticated pattern) — Nyquist compliance via 9 TDD RED stubs all failing with 404 before routes exist
- [Phase 03-profit-dashboard]: prisma.$queryRaw goes at top level of mock object (not nested), matching real PrismaClient API surface
- [Phase 03-profit-dashboard]: Dual-aggregate pattern for overview: separate aggregates for all-orders (revenue/fees) and cogsKnown=true orders (COGS/netProfit) prevents NULL poisoning
- [Phase 03-profit-dashboard]: Dual key casing in $queryRaw mapping (snake_case ?? camelCase) supports real Postgres column names and Jest mock camelCase keys without test changes
- [Phase 03-profit-dashboard]: Used create-vite@4 (not v9) for Node 16.20.2 compatibility — v9 requires Node 20+
- [Phase 03-profit-dashboard]: Removed StrictMode from main.jsx — App Bridge embedded context incompatible with double-invoke behavior
- [Phase 03-profit-dashboard]: App Bridge CDN first script in head (hard requirement for window.shopify global), Polaris CDN second, no @shopify npm packages
- [Phase 03-profit-dashboard]: OrdersTable resets page and allOrders to [] on dateRange or sort change to prevent stale pages from contaminating new results
- [Phase 03-profit-dashboard]: useEffect deps use primitive dateRange.from/dateRange.to fields (not object reference) to avoid spurious re-fetches
- [Phase 03-profit-dashboard]: res.sendFile replaces inline HTML placeholder in /admin route — session check and redirect preserved, no wildcard catch-all to avoid intercepting API routes

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: GraphQL Bulk Operations `transaction.fees` field path needs live verification against 2025-10 schema before building fee sync logic
- [Phase 2]: Shopify Payments payout-to-order 1:1 mapping is unconfirmed — test against real Shopify Payments store before building
- [Phase 3]: `@shopify/app-bridge-react` package name may have changed since training cutoff — run `npm show` before starting
- [Phase 3]: Verify Polaris current version (v13 or v14) and `shopify.idToken()` method name before building

## Session Continuity

Last session: 2026-03-14T03:41:47.969Z
Stopped at: Completed 03-profit-dashboard 03-05-PLAN.md
Resume file: None
