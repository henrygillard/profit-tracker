---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Competitive Parity
status: ready_to_plan
stopped_at: ~
last_updated: "2026-03-18T00:00:00.000Z"
last_activity: 2026-03-18 — v2.0 roadmap created (Phases 5-9)
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18 — started v2.0 milestone)

**Core value:** Merchants see what they actually kept — not just what came in — within 10 minutes of installing.
**Current focus:** Phase 5 — Payout Fee Accuracy

## Current Position

Phase: 5 of 9 (Payout Fee Accuracy)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-03-18 — v2.0 roadmap created (Phases 5-9)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v2.0)
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

- [Roadmap v2.0]: Phase 5 is a data quality gate — all downstream features (waterfall Fees bar, margin calculations, ad attribution) depend on correct per-order fee data
- [Roadmap v2.0]: CHART-05 (ad spend waterfall step) belongs in Phase 8 with Meta Ads — it is the payoff visualization, not a standalone chart feature
- [Roadmap v2.0]: Phase 9 has an external dependency (Google developer token approval) that cannot be controlled with code — apply during Phase 8 kickoff

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 5]: `payout_status:PAID` filter syntax on `balanceTransactions` is MEDIUM confidence — confirmed in community thread but not official docs. Run diagnostic logging on live Shopify Payments store as first implementation step before writing any write logic.
- [Phase 5]: `fee` vs `fees` field path on `ShopifyPaymentsBalanceTransaction` needs live verification against 2025-10 GraphQL schema before touching sync write logic.
- [Phase 8]: `ADS_ENCRYPTION_KEY` must be added to Railway config before any ad token write code exists — never store Meta or Google tokens plaintext.
- [Phase 8]: GDPR `shop/redact` webhook handler must be extended to delete `AdConnection` and `AdSpend` rows — Shopify tests this during App Review.
- [Phase 9]: Google Ads developer token requires external approval. Apply at Phase 8 kickoff. Phase 9 development can proceed against Test Account Access with no code change needed when production access is approved.

## Session Continuity

Last session: 2026-03-18
Stopped at: Roadmap created for v2.0 milestone
Resume file: None
