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

Progress: [░░░░░░░░░░] 0%

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Coarse granularity yielded 4 phases — Foundation → Sync/Profit Engine → Dashboard → Billing
- [Roadmap]: COGS and FEES requirements merged into Phase 2 (not separate phase) because profit is computed at write time; separating them would break the architecture
- [Roadmap]: GDPR handlers (FOUND-01) and scope cleanup (FOUND-02) are Phase 1 — they block App Store submission and must be resolved before any other work ships

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: GraphQL Bulk Operations `transaction.fees` field path needs live verification against 2025-10 schema before building fee sync logic
- [Phase 2]: Shopify Payments payout-to-order 1:1 mapping is unconfirmed — test against real Shopify Payments store before building
- [Phase 3]: `@shopify/app-bridge-react` package name may have changed since training cutoff — run `npm show` before starting
- [Phase 3]: Verify Polaris current version (v13 or v14) and `shopify.idToken()` method name before building

## Session Continuity

Last session: 2026-03-10
Stopped at: Roadmap created — ready to plan Phase 1
Resume file: None
