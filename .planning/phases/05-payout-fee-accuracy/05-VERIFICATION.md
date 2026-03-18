---
phase: 05-payout-fee-accuracy
verified: 2026-03-18T22:00:00Z
status: human_needed
score: 8/8 automated must-haves verified
re_verification: false
human_verification:
  - test: "Verify fee status badges render in the Orders table UI"
    expected: "Every order row shows exactly one of: a 'Pending' badge (blue) for shopify_payments orders with no settled fee, a fee amount with an 'Est.' badge (yellow) for estimated fees, or a plain fee amount (no badge) for verified fees. No row shows a blank or undefined fee state."
    why_human: "FeeCell is a React component that renders conditionally based on feeSource. Portal-based tooltips (FeeCellTooltip using createPortal) require a live browser DOM and cannot be validated by Jest. The Plan 03 human checkpoint confirmed badges visible but the VERIFICATION.md must formally record this gate."
  - test: "Confirm 'Est.' tooltip text appears on hover"
    expected: "Hovering an 'Est.' fee cell shows the tooltip 'Rate-table estimate — not from settled payout'. Hovering a verified fee cell shows 'Exact fee from settled payout'."
    why_human: "Portal tooltip hover behavior (onMouseEnter/onMouseLeave state + createPortal) cannot be verified without a live browser. The fix from the title= attribute to FeeCellTooltip (commit 889b0de) was confirmed by the human during the Plan 03 checkpoint but should be re-confirmed post-verification."
---

# Phase 5: Payout Fee Accuracy — Verification Report

**Phase Goal:** Merchants can trust the fee figures shown — every OrderProfit row carries a feeSource field that honestly reflects how its fee was derived, and the Orders table surfaces that status so merchants can see at a glance which fees are exact vs estimated.

**Verified:** 2026-03-18T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | The order_profits table has a fee_source column with default 'estimated' | VERIFIED | `prisma/schema.prisma` line 103: `feeSource String @default("estimated") @map("fee_source")  // 'verified' \| 'estimated' \| 'pending'` |
| 2 | calculateOrderProfit returns feeSource in its result object | VERIFIED | `lib/profitEngine.js` line 130-139: `determineFeeSourceFromOrder` called, `feeSource` included in return; exported at line 143 |
| 3 | New Shopify Payments orders written with shopifyPaymentsFee=0 get feeSource: 'pending' | VERIFIED | `determineFeeSourceFromOrder` returns 'pending' when gateway includes 'shopify_payments' and fee is 0; `upsertOrder` writes `feeSourceToWrite` in both create and update data (lines 230, 239) |
| 4 | Third-party gateway orders get feeSource: 'estimated' | VERIFIED | `determineFeeSourceFromOrder` returns 'estimated' for non-shopify_payments gateways; `upsertOrder` writes `feeSourceToWrite` |
| 5 | syncPayouts writes feeSource: 'verified' alongside feesTotal | VERIFIED | `lib/syncPayouts.js` line 81: `data: { feesTotal: totalFee, feeSource: 'verified' }` |
| 6 | The refunds/create handler reads and preserves existing feeSource — a verified order stays verified after a refund | VERIFIED | `routes/webhooks.js` lines 257-258: `const existingFeeSource = order.profit?.feeSource \|\| null;` passed as 6th arg to `upsertOrder`; `upsertOrder` uses `existingFeeSource \|\| profitResult.feeSource` at line 176 |
| 7 | The /api/dashboard/orders response includes feeSource on every order object | VERIFIED | `routes/api.js` line 248: `feeSource: op.feeSource \|\| 'estimated',` with 'estimated' fallback for pre-Phase-5 rows |
| 8 | The Orders table Fees column renders three distinct fee states (Pending / Est. / verified) | VERIFIED (code) / NEEDS HUMAN (visual) | `OrdersTable.jsx` lines 62-94: FeeCell component with all three branches; line 201: `<FeeCell feesTotal={order.feesTotal} feeSource={order.feeSource} />` wired in table row; pt-badge-info CSS at `styles.css` line 557 |

**Score:** 8/8 automated checks pass. 1 human gate required for visual/interactive behavior.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | OrderProfit model with feeSource field | VERIFIED | Line 103: `feeSource String @default("estimated") @map("fee_source")` — correct field name, default, and column mapping |
| `lib/profitEngine.js` | calculateOrderProfit returns feeSource; determineFeeSourceFromOrder exported | VERIFIED | Lines 31-36 (helper), 130 (usage in calculateOrderProfit), 143 (export). Never returns 'verified' — invariant enforced by design. |
| `lib/syncOrders.js` | upsertOrder writes feeSource; accepts existingFeeSource 6th arg | VERIFIED | Line 150: 6th param `existingFeeSource = null`; line 176: `feeSourceToWrite = existingFeeSource \|\| profitResult.feeSource`; lines 230, 239: feeSource in create/update data |
| `lib/syncPayouts.js` | syncPayouts writes feeSource: 'verified' | VERIFIED | Line 81: `data: { feesTotal: totalFee, feeSource: 'verified' }` — the sole code path that writes 'verified' |
| `routes/webhooks.js` | refunds/create reads and passes feeSource from order.profit.feeSource | VERIFIED | Lines 257-258: existingFeeSource read from `order.profit?.feeSource` and passed as 6th arg to upsertOrder |
| `routes/api.js` | feeSource in /api/dashboard/orders response | VERIFIED | Line 248: `feeSource: op.feeSource \|\| 'estimated'` |
| `web/src/styles.css` | pt-badge-info CSS class | VERIFIED | Lines 557-561: `.pt-badge-info` with blue color scheme (`#63b3ed`), placed after `.pt-badge-danger` |
| `web/src/components/OrdersTable.jsx` | FeeCell component; FeeCellTooltip portal component; FeeCell wired in table row | VERIFIED | Lines 27-59 (FeeCellTooltip), 62-94 (FeeCell), 201 (wired in JSX) |
| `tests/fees.test.js` | FEEX-01 and FEEX-03 tests green | VERIFIED | Describe blocks at lines 107, 126, 161 — all assertions pass (68 tests total green) |
| `tests/dashboard.test.js` | FEEX-02 test green | VERIFIED | Lines 131-150: FEEX-02 test asserts `res.body[0]).toHaveProperty('feeSource')` — green |
| `tests/webhooks.test.js` | FEEX-04 spy tests green | VERIFIED | Describe blocks at lines 49 and 123 — spy-based tests assert `callArgs[5] === 'verified'` — green |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `prisma/schema.prisma` | `order_profits` table | `feeSource` field declaration | WIRED | Column exists in schema with correct default; applied via `prisma db push` (commit 993bfc3) |
| `lib/profitEngine.js (calculateOrderProfit)` | `lib/syncOrders.js (upsertOrder)` | `profitResult.feeSource` | WIRED | `upsertOrder` calls `calculateOrderProfit`, reads `profitResult.feeSource`, assigns to `feeSourceToWrite` |
| `lib/syncOrders.js (upsertOrder)` | `prisma.orderProfit upsert create/update` | `feeSource: feeSourceToWrite` | WIRED | Lines 230 (create) and 239 (update) both include `feeSource: feeSourceToWrite` |
| `lib/syncPayouts.js` | `prisma.orderProfit.update data` | `feeSource: 'verified'` | WIRED | Line 81: `data: { feesTotal: totalFee, feeSource: 'verified' }` |
| `routes/webhooks.js (refunds/create)` | `upsertOrder call` | `existingFeeSource` from `order.profit.feeSource` | WIRED | Line 257 reads `order.profit?.feeSource`, line 258 passes it as 6th arg |
| `routes/api.js` | `prisma.orderProfit (feeSource field)` | `op.feeSource in orders.map` | WIRED | Line 248: `feeSource: op.feeSource \|\| 'estimated'` |
| `web/src/components/OrdersTable.jsx (FeeCell)` | `order.feeSource from API` | `feeSource prop` | WIRED | Line 201: `<FeeCell feesTotal={order.feesTotal} feeSource={order.feeSource} />` — field name matches API response key |

---

## Requirements Coverage

All four requirement IDs declared across Plans 01-03 accounted for.

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| FEEX-01 | 05-01, 05-02 | Shopify Payments orders store exact processing fee from payout transaction | SATISFIED | `calculateOrderProfit` returns feeSource; `syncPayouts` writes feeSource: 'verified' with exact fee from `ShopifyPaymentsBalanceTransaction.fee`; test at `fees.test.js` line 126 asserts the exact update call with `feeSource: 'verified'` |
| FEEX-02 | 05-01, 05-03 | Each order displays Verified/Estimated indicator — never silently mixing | SATISFIED (automated) / NEEDS HUMAN (visual) | `routes/api.js` line 248 includes `feeSource`; `OrdersTable.jsx` FeeCell renders three distinct states; dashboard test at line 131 asserts field presence; visual confirmation from Plan 03 checkpoint |
| FEEX-03 | 05-01, 05-02 | Unsettled orders show "Pending" instead of estimated fee | SATISFIED | `determineFeeSourceFromOrder` returns 'pending' for shopify_payments + fee=0; test at `fees.test.js` line 198 asserts `create: expect.objectContaining({ feeSource: 'pending' })` — green |
| FEEX-04 | 05-01, 05-02 | Refund uses exact settled fee; existing refund logic extended not replaced | SATISFIED | `refunds/create` reads `order.profit?.feeSource`, passes as 6th arg; `upsertOrder` preserves it via `existingFeeSource \|\| profitResult.feeSource`; spy tests at `webhooks.test.js` line 144 assert `callArgs[5] === 'verified'` — green |

**Orphaned requirements check:** REQUIREMENTS.md maps FEEX-01 through FEEX-04 exclusively to Phase 5. All four are claimed and satisfied. No orphaned requirements.

---

## Anti-Patterns Found

No blockers or warnings found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODOs, FIXMEs, or stubs detected in any phase-modified file | — | — |

Scan covered: `lib/profitEngine.js`, `lib/syncOrders.js`, `lib/syncPayouts.js`, `routes/webhooks.js`, `routes/api.js`, `web/src/components/OrdersTable.jsx`.

---

## Human Verification Required

### 1. Fee Status Badges Render in Orders Table

**Test:** Start the dev server and navigate to the Orders tab. Ensure you have orders of at least one status (most will be 'estimated' for a new install, 'verified' if syncPayouts has run).

**Expected:** Every row in the Fees column shows exactly one of three states:
- A dollar amount with a small "Est." badge (yellow/warning color) for rate-table estimated fees
- A plain dollar amount (no badge) for fees verified from a settled payout
- A "Pending" badge (blue/info color) for Shopify Payments orders not yet settled

No row should show a blank, "undefined", or raw number without a status indicator (except verified, which intentionally shows no badge).

**Why human:** FeeCell is a React component that branches on `feeSource` at render time. The three visual states require a live browser. Jest tests validate the API field and component code structure but cannot assert pixel-level rendering.

### 2. Tooltip Text Appears on Hover

**Test:** Hover over a fee cell showing an "Est." badge. Then hover over a verified fee cell (if available).

**Expected:**
- "Est." cell tooltip: "Rate-table estimate — not from settled payout"
- Verified cell tooltip: "Exact fee from settled payout"

**Why human:** `FeeCellTooltip` uses `createPortal` + `useState(hovered)` + `getBoundingClientRect()`. The portal renders into `document.body` and positions itself relative to the anchor element. This requires a real browser layout engine. The fix from `title=` attribute to `FeeCellTooltip` (commit 889b0de) was confirmed during the Plan 03 checkpoint but this VERIFICATION records it as a formal gate.

---

## Gaps Summary

No gaps. All automated must-haves verified. The phase is complete pending the human visual confirmation gate documented above.

The feeSource state machine is fully wired end-to-end:
- Database: `fee_source VARCHAR DEFAULT 'estimated'` in `order_profits` (commit 993bfc3)
- Write path — orders: `upsertOrder` derives feeSource via `determineFeeSourceFromOrder` and writes it (commit 27d3860)
- Write path — payouts: `syncPayouts` writes `feeSource: 'verified'` as the exclusive setter (commit 90aefe3)
- Write path — refunds: webhook reads `order.profit?.feeSource` and preserves it through `upsertOrder`'s 6th arg (commit 90aefe3)
- API: `routes/api.js` includes `feeSource` in `/api/dashboard/orders` response (commit 34472e4)
- UI: `FeeCell` + `FeeCellTooltip` components render three states with portal-based tooltips (commits 322aef3, 889b0de)
- Tests: 68 tests green; FEEX-04 spy tests assert `callArgs[5] === 'verified'` — would catch silent feeSource drops

---

_Verified: 2026-03-18T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
