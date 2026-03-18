# Phase 5: Payout Fee Accuracy - Research

**Researched:** 2026-03-18
**Domain:** Shopify Payments GraphQL API (ShopifyPaymentsBalanceTransaction), Prisma schema migration, per-order fee status tracking, refund fee reversal logic
**Confidence:** HIGH (API field names verified against official docs); MEDIUM (payout_status query filter syntax — confirmed in official query arg docs but live verification still recommended as first implementation step)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FEEX-01 | Merchant's Shopify Payments orders store the exact processing fee from `ShopifyPaymentsBalanceTransaction.fee` — not an estimated rate calculated from a rate table | Confirmed: `fee` is a `MoneyV2!` field on `ShopifyPaymentsBalanceTransaction`. The existing `syncPayouts.js` already fetches this and writes to `OrderProfit.feesTotal`. The gap is that orders not yet in any payout still show $0 estimated fees. The fix requires adding a `feeSource` column to distinguish verified vs estimated vs pending. |
| FEEX-02 | Each order displays a "Verified" indicator when its fee came from a confirmed payout transaction, or "Estimated" when the rate-table fallback was used — never silently mixing the two | Requires: new `feeSource` column on `OrderProfit` model (values: `verified`, `estimated`, `pending`); updated API to return it; updated `OrdersTable.jsx` to render the badge. The existing `pt-badge pt-badge-warning` CSS class pattern is already in use for COGS Unknown. |
| FEEX-03 | Orders not yet settled into a payout show a "Pending" fee state instead of displaying an estimated fee as if it were exact | Requires: `upsertOrder` for Shopify Payments orders must write `feeSource: 'pending'` instead of using the rate-table estimate. Currently `upsertOrder` passes `shopifyPaymentsFee = 0` for new orders, which calculates as $0 (not an estimate of the real fee). The fix: detect `paymentGateway.includes('shopify_payments')` at write time and set `feeSource = 'pending'` when no payout fee is available yet. |
| FEEX-04 | When an order is refunded, the fee reversal uses the exact settled fee amount rather than an estimated reversal percentage — existing refund logic is extended, not replaced | The `refunds/create` webhook handler already reads `existingFee = order.profit.feesTotal`. If `feeSource = 'verified'`, this is the exact settled fee — the refund recalculation is already correct. If `feeSource = 'pending'` or `estimated`, the handler must preserve that status. No new API calls needed; the status must be preserved through upsert. |
</phase_requirements>

---

## Summary

Phase 5 is a data integrity phase — it does not add new Shopify API integrations but instead fixes a silent accuracy problem in the existing fee pipeline. The v1.0 implementation has two gaps: (1) orders processed via Shopify Payments but not yet settled in a payout show `feesTotal = 0` (not even an estimate — just silently wrong), and (2) even after `syncPayouts` runs, there is no flag distinguishing "this fee came from a real payout" from "this fee is a rate-table estimate." Both gaps corrupt the accuracy signal merchants are paying for.

The fix is surgical. The Shopify Payments GraphQL API already provides the exact fee via `ShopifyPaymentsBalanceTransaction.fee` (a `MoneyV2!` field) — the existing `syncPayouts.js` already reads it. What is missing is a `feeSource` column on `OrderProfit` (values: `verified` | `estimated` | `pending`) that gets set at order write time and flipped to `verified` when `syncPayouts` confirms the fee from a settled payout. The frontend needs a corresponding badge in the Orders table Fees column.

The research confirms the Shopify `balanceTransactions` API supports filtering by `payout_status` and `transaction_type` via its `query` string argument — this means `syncPayouts` can be tightened to only process PAID payout transactions, reducing noise from in-flight transactions. The `CHARGE` type value is confirmed as the correct filter for credit card processing fees. The `REFUND` type has a `fee` field but it represents the fee retained by Shopify (not refunded to merchant), which means refund transactions do not reduce `feesTotal` — correct behavior per Shopify's policy.

**Primary recommendation:** Add `feeSource` String column to `OrderProfit` (default `'estimated'`), set `'pending'` for new Shopify Payments orders at upsert time, flip to `'verified'` in `syncPayouts` after confirming exact fee. Render a color-coded badge in the Fees column of `OrdersTable.jsx`. Total scope: 1 migration, 3 backend file changes, 1 frontend component change.

---

## Standard Stack

No new npm dependencies required. All work uses existing stack.

### Core (all existing)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `prisma` | ^5.22.0 | Schema migration + ORM queries | Already in codebase; `prisma db push` for migration |
| `@prisma/client` | ^5.22.0 | Type-safe DB writes with new `feeSource` field | Generated from schema |
| Node.js built-in `fetch` | built-in | Shopify GraphQL calls already via `shopifyClient.js` | Established pattern |

### No New Dependencies
This phase intentionally avoids adding npm packages. All required functionality (Shopify API calls, DB writes, React badges) is covered by existing tooling.

**Installation:**
```bash
# No new installs — this phase extends existing code only
```

---

## Architecture Patterns

### Recommended Change Surface
```
prisma/
└── schema.prisma              # Add feeSource String to OrderProfit (FEEX-01, FEEX-03)
prisma/migrations/
└── YYYYMMDD_add_fee_source/   # Migration via prisma db push

lib/
├── syncPayouts.js             # MODIFY: tighten query filter, write feeSource: 'verified' (FEEX-01)
├── profitEngine.js            # MODIFY: return feeSource in calculateOrderProfit result (FEEX-01, FEEX-03)
└── syncOrders.js              # MODIFY: pass feeSource through upsertOrder writes (FEEX-03, FEEX-04)

routes/
├── api.js                     # MODIFY: include feeSource in /api/dashboard/orders response (FEEX-02)
└── webhooks.js                # MODIFY: preserve feeSource in refunds/create handler (FEEX-04)

web/src/components/
└── OrdersTable.jsx            # MODIFY: render Verified/Estimated/Pending badge in Fees column (FEEX-02)

tests/
└── fees.test.js               # EXTEND: add feeSource tests for FEEX-01, FEEX-02, FEEX-03, FEEX-04
```

### Pattern 1: feeSource State Machine
**What:** `OrderProfit.feeSource` is a three-value field that encodes the provenance of `feesTotal`.
**When to use:** Set at every `upsertOrder` call; updated by `syncPayouts`.

```
'pending'   → Shopify Payments order, fee not yet settled into any payout
              feesTotal is irrelevant (show "Pending" badge, not a dollar amount)

'verified'  → Shopify Payments order, exact fee confirmed from ShopifyPaymentsBalanceTransaction
              feesTotal is authoritative

'estimated' → Non-Shopify-Payments order (third-party gateway), OR Shopify Payments store
              that has never run syncPayouts
              feesTotal is a rate-table calculation
```

**Transition:**
- New Shopify Payments order arrives via webhook or incremental sync → write `feeSource: 'pending'`
- `syncPayouts` processes a CHARGE transaction for that order → overwrite `feeSource: 'verified'`
- Third-party gateway order → write `feeSource: 'estimated'` (never changes)

### Pattern 2: Prisma Schema Extension
**What:** Add `feeSource` to `OrderProfit` model with a default of `'estimated'` (safe fallback for all existing rows).

```prisma
// Source: existing pattern in prisma/schema.prisma
model OrderProfit {
  // ... existing fields ...
  feeSource     String   @default("estimated") @map("fee_source")
  // 'verified' | 'estimated' | 'pending'
}
```

**Why default `'estimated'`:** Existing rows (all pre-Phase 5 orders) have fees calculated from the rate table or from `syncPayouts` without status tracking. They are estimates or verified but undistinguishable — `'estimated'` is the safe, honest label. `syncPayouts` will flip them to `'verified'` on the next run.

### Pattern 3: syncPayouts GraphQL Query Tightening
**What:** Add `query` filter to `balanceTransactions` to fetch only PAID payout transactions of type CHARGE, reducing unnecessary fetches.
**When to use:** This is optional optimization but reduces API calls and prevents processing in-flight transactions.

```javascript
// Source: official Shopify GraphQL Admin API (shopifypaymentsaccount query docs)
// query filter args confirmed: payout_status, transaction_type
const BALANCE_TRANSACTIONS_QUERY = `
  query($after: String) {
    shopifyPaymentsAccount {
      balanceTransactions(
        first: 100,
        after: $after,
        query: "payout_status:paid transaction_type:charge"
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          fee { amount }
          associatedOrder { id }
        }
      }
    }
  }
`;
```

**CAUTION:** The `payout_status:paid` filter syntax is confirmed in official API query arg docs as a supported searchable field, but the exact lowercase/uppercase format (`paid` vs `PAID`) needs live verification on a real Shopify Payments store. Add diagnostic logging on first run. If the filter returns 0 results unexpectedly, fall back to no filter and apply client-side check via `associatedPayout.status`.

### Pattern 4: Frontend Badge Rendering
**What:** The Fees column in `OrdersTable.jsx` renders a status badge when `feeSource` is `'pending'` or `'estimated'`, and a dollar amount when `'verified'`.
**When to use:** Replace the current bare `formatCurrency(order.feesTotal)` cell.

```jsx
// Extends the existing badge pattern already used for COGS Unknown
// Source: existing web/src/components/OrdersTable.jsx line 128
// <span className="pt-badge pt-badge-warning">Unknown</span>

// Phase 5 pattern:
function FeeCell({ feesTotal, feeSource }) {
  if (feeSource === 'pending') {
    return <span className="pt-badge pt-badge-info">Pending</span>;
  }
  if (feeSource === 'estimated') {
    return (
      <span title="Rate-table estimate — not from settled payout">
        {formatCurrency(feesTotal)}
        <span className="pt-badge pt-badge-warning" style={{ marginLeft: 4 }}>Est.</span>
      </span>
    );
  }
  // verified
  return <span title="Exact fee from settled payout">{formatCurrency(feesTotal)}</span>;
}
```

**Note:** The project does not use Polaris npm package — it uses CDN Polaris + custom CSS classes. New badge styles (`pt-badge-info`) may need adding to `styles.css` if not already present. Check existing `pt-badge` variants in `styles.css` first.

### Anti-Patterns to Avoid

- **Deleting feesTotal on pending orders:** Do not set `feesTotal = null` for pending orders. The existing `feesTotal` field is `Decimal` (not nullable in schema). Set `feesTotal = 0` and `feeSource = 'pending'` — the UI uses `feeSource` to decide what to render.
- **Re-running calculateOrderProfit for all historical orders:** Do not recalculate all existing order profits on migration. The `feeSource` column defaults to `'estimated'` for existing rows. `syncPayouts` will flip verified ones on next run.
- **Adding a 4th status:** Resist adding `'unknown'` or other statuses. The three-value state machine (`pending`, `estimated`, `verified`) maps cleanly to the three UI states the requirements define.
- **Filtering for payout_status before confirming it works:** The query filter should be added with a diagnostic fallback, not as a hard dependency. The core logic (filter by `type === 'CHARGE'` in JS) must remain as a safety net even when the API-side filter is active.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migration | Custom SQL ALTER TABLE script | `prisma db push` | Already the pattern in this project (see migration dir); handles Railway Postgres automatically |
| Fee status enum | TypeScript enum or JS constants file | Plain string literals in DB + UI | Project uses JavaScript (no TypeScript); string literals are simpler and already the pattern (`cogsKnown` boolean, `financialStatus` string) |
| API-side payout status validation | Custom payout fetching logic | API `query` filter + client-side `type` check | Shopify confirms `payout_status` is queryable; client-side `type !== 'CHARGE'` skip is already in `syncPayouts.js` line 58 |

---

## Common Pitfalls

### Pitfall 1: The fee field path — `fee.amount` not `fees[n].amount`
**What goes wrong:** Attempting to access `fees` (plural) as an array returns undefined; the processing fee is stored as a single `MoneyV2!` object.
**Why it happens:** A 2025-04 changelog entry mentions a `fees` field under `adjustmentsOrders` for adjustment-order financial reconciliation — this is NOT the main processing fee. The `fee` (singular, top-level) field is the credit card processing fee for a CHARGE transaction.
**How to avoid:** Use `txn.fee?.amount` (singular). The existing `syncPayouts.js` already does this correctly.
**Warning signs:** Fees showing as `undefined` or `NaN` in logs.

### Pitfall 2: feesTotal = 0 on new Shopify Payments orders (the current bug)
**What goes wrong:** When `upsertOrder` is called for a new Shopify Payments order, `shopifyPaymentsFee = 0` is passed. `calculateOrderProfit` sees `shopifyPaymentsFee = 0` and writes `feesTotal = 0`. This looks like a verified $0 fee — it is not.
**Why it happens:** `syncPayouts` is a separate async job that runs after order ingestion. The order is written before the payout data exists.
**How to avoid:** At `upsertOrder` write time, detect `paymentGateway.includes('shopify_payments')` AND `shopifyPaymentsFee === 0` (no real fee provided yet) → set `feeSource = 'pending'`. When `syncPayouts` later finds the fee, it overwrites both `feesTotal` AND `feeSource`.

### Pitfall 3: The payout_status filter syntax is MEDIUM confidence
**What goes wrong:** Using `query: "payout_status:PAID"` (uppercase) may return no results if Shopify expects lowercase. Alternatively, the filter may not work as a query parameter at all on some API versions.
**Why it happens:** The `payout_status` field is confirmed in official docs as a queryable field, but the exact accepted values (case sensitivity) were not verified on a live store during this research.
**How to avoid:** First plan in Phase 5 MUST be a diagnostic plan that logs raw balance transaction responses without any query filter, confirms the field structure, then adds the filter progressively. Never add the filter and the write logic in the same plan.
**Warning signs:** Empty `feesByOrder` map after running `syncPayouts` on a store that definitely has Shopify Payments orders.

### Pitfall 4: Refund handler loses feeSource
**What goes wrong:** The `refunds/create` webhook handler calls `upsertOrder` with the recalculated order. If `upsertOrder` always writes `feeSource = 'pending'` for Shopify Payments orders (because `shopifyPaymentsFee` equals `existingFee`), it will downgrade a `'verified'` order back to `'pending'` on every refund.
**Why it happens:** The refund handler passes `existingFee = order.profit.feesTotal` to `upsertOrder` — this IS the real fee. But `upsertOrder` can't distinguish "I received a fee of $3.50 because it was previously verified" from "I received a fee of $3.50 because it was just settled."
**How to avoid:** The refund handler must also read `order.profit.feeSource` and pass it through to `upsertOrder` explicitly — do not re-derive `feeSource` from the fee amount alone. Add `existingFeeSource` as a parameter to `upsertOrder` (defaults to `null`, meaning derive it from gateway/amount).

### Pitfall 5: Prisma migration on Railway with existing rows
**What goes wrong:** Adding `feeSource String @default("estimated")` via `prisma db push` on a table with thousands of rows — this is safe (Postgres `ALTER TABLE ADD COLUMN DEFAULT` is non-blocking for this type), but the migration must be applied before deploying code that reads `feeSource`.
**Why it happens:** Deploying code that references `op.feeSource` before the column exists causes a Prisma runtime error on every API call.
**How to avoid:** The migration plan must be the FIRST wave in Phase 5. Apply migration, deploy, then modify sync and UI logic.

---

## Code Examples

### Reading feeSource in the orders API response
```javascript
// Source: extends existing pattern in routes/api.js GET /api/dashboard/orders
return res.json(orders.map(op => ({
  orderId: op.orderId,
  shopifyOrderName: op.order ? op.order.shopifyOrderName : null,
  processedAt: op.order ? op.order.processedAt : null,
  revenueNet: Number(op.revenueNet),
  cogsTotal: op.cogsTotal !== null ? Number(op.cogsTotal) : null,
  feesTotal: Number(op.feesTotal),
  feeSource: op.feeSource,      // NEW: 'verified' | 'estimated' | 'pending'
  netProfit: op.netProfit !== null ? Number(op.netProfit) : null,
  marginPct: op.revenueNet && op.netProfit !== null
    ? (Number(op.netProfit) / Number(op.revenueNet)) * 100
    : null,
  cogsKnown: op.cogsKnown,
})));
```

### syncPayouts writing feeSource
```javascript
// Source: extends existing pattern in lib/syncPayouts.js
for (const [orderId, totalFee] of feesByOrder) {
  try {
    await prisma.orderProfit.update({
      where: { orderId },
      data: {
        feesTotal: totalFee,
        feeSource: 'verified',  // NEW: mark as confirmed from settled payout
      },
    });
    updated++;
  } catch (err) {
    if (err.code === 'P2025') {
      skipped++;
    } else {
      console.error(`syncPayouts: failed to update feesTotal for ${orderId}:`, err.message);
    }
  }
}
```

### upsertOrder determining feeSource at write time
```javascript
// Source: extends existing pattern in lib/syncOrders.js upsertOrder
// Determine fee source at write time
function determineFeeSource(paymentGateway, shopifyPaymentsFee, passedFeeSource) {
  if (passedFeeSource) return passedFeeSource;  // explicit override (refund handler)
  if (paymentGateway && paymentGateway.includes('shopify_payments')) {
    return shopifyPaymentsFee > 0 ? 'verified' : 'pending';
  }
  return 'estimated';  // third-party gateway
}
```

### Prisma schema addition
```prisma
// Source: extends existing prisma/schema.prisma OrderProfit model
model OrderProfit {
  id            Int      @id @default(autoincrement())
  orderId       String   @unique @map("order_id")
  shop          String
  revenueNet    Decimal  @map("revenue_net")  @db.Decimal(12, 2)
  cogsTotal     Decimal? @map("cogs_total")   @db.Decimal(12, 2)
  feesTotal     Decimal  @map("fees_total")   @db.Decimal(12, 2)
  shippingCost  Decimal  @map("shipping_cost") @db.Decimal(12, 2)
  netProfit     Decimal? @map("net_profit")   @db.Decimal(12, 2)
  cogsKnown     Boolean  @default(false) @map("cogs_known")
  feeSource     String   @default("estimated") @map("fee_source")  // NEW: 'verified'|'estimated'|'pending'
  calculatedAt  DateTime @default(now()) @map("calculated_at")

  order         Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([shop])
  @@map("order_profits")
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All fee status implicit (no field) | `feeSource` column with explicit provenance | Phase 5 | Merchants can trust fee numbers; no silent mixing |
| `syncPayouts` updates all transactions | `syncPayouts` filters to PAID payout, CHARGE type | Phase 5 | Fewer false writes; only settled fees marked verified |
| Refund recalculates with `existingFee = 0` if no prior payout | Refund preserves `feeSource` from prior record | Phase 5 | Refund fee accuracy tracks original settlement status |

**Current implementation gaps (to be fixed):**
- `OrderProfit.feesTotal` on new Shopify Payments orders = `$0` — looks like verified $0, is actually pre-settlement void
- No column distinguishes rate-table estimates from payout-confirmed fees
- `syncPayouts` does not filter by `payout_status:paid` — processes all transactions including in-flight ones

---

## Open Questions

1. **payout_status filter case sensitivity**
   - What we know: `payout_status` is a documented queryable field on `balanceTransactions`; the search index confirmed it. The REST API uses `"paid"` (lowercase) for payout status values.
   - What's unclear: Whether the GraphQL query string expects `payout_status:paid` (lowercase) or `payout_status:PAID` (uppercase).
   - Recommendation: In the first plan (diagnostic), log raw `associatedPayout.status` values from unfiltered results to confirm the expected string, then apply the filter.

2. **REFUND-type transactions and feesTotal**
   - What we know: Shopify's policy is that original credit card fees are NOT refunded when an order is refunded. The `REFUND` type balance transaction represents the merchant's money returned to the customer — it does NOT reverse the processing fee.
   - What's unclear: Does a REFUND-type balance transaction have a non-zero `fee` field? If so, what does it represent?
   - Recommendation: During diagnostic plan, log `fee.amount` for REFUND-type transactions. If non-zero, document what it means — do not add to `feesTotal` without understanding it.

3. **syncPayouts scope — all transactions or only recent payouts?**
   - What we know: The current `syncPayouts` paginates through ALL balance transactions (all time). For a large store with years of history, this could be thousands of pages.
   - What's unclear: Whether adding `payout_status:paid` filter reduces the total significantly, or whether a date-bounded query (e.g., last 90 days) is needed for performance.
   - Recommendation: The diagnostic plan should log total page count. If > 20 pages, add a `processed_at` date filter as a secondary bound in the query.

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in config.json).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `/Users/henry/code/profit-tracker/jest.config.js` |
| Quick run command | `npx jest tests/fees.test.js --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEEX-01 | `syncPayouts` writes `feeSource: 'verified'` alongside `feesTotal` when updating from payout | unit | `npx jest tests/fees.test.js -t "feeSource verified" --no-coverage` | ❌ Wave 0 |
| FEEX-01 | `calculateOrderProfit` returns `feeSource` in result object | unit | `npx jest tests/fees.test.js -t "feeSource" --no-coverage` | ❌ Wave 0 |
| FEEX-02 | API response includes `feeSource` field in orders endpoint | unit | `npx jest tests/dashboard.test.js -t "feeSource" --no-coverage` | ❌ Wave 0 |
| FEEX-03 | New Shopify Payments order upserted without prior payout data → `feeSource: 'pending'` | unit | `npx jest tests/fees.test.js -t "pending" --no-coverage` | ❌ Wave 0 |
| FEEX-03 | Third-party gateway order → `feeSource: 'estimated'` | unit | `npx jest tests/fees.test.js -t "estimated" --no-coverage` | ❌ Wave 0 |
| FEEX-04 | Refund handler preserves `feeSource: 'verified'` when recalculating a previously-verified order | unit | `npx jest tests/webhooks.test.js -t "refund.*feeSource" --no-coverage` | ❌ Wave 0 |
| FEEX-04 | Refund handler does not downgrade `feeSource` from `verified` to `pending` | unit | `npx jest tests/webhooks.test.js -t "feeSource" --no-coverage` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest tests/fees.test.js --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green (59+ tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/fees.test.js` — extend with `feeSource` test cases for FEEX-01, FEEX-02, FEEX-03, FEEX-04
- [ ] `tests/dashboard.test.js` — add test that `feeSource` is included in `/api/dashboard/orders` response
- [ ] `tests/webhooks.test.js` — extend `refunds/create` test to assert `feeSource` is preserved from `order.profit.feeSource`
- [ ] `tests/__mocks__/prisma.js` — add `orderProfit.update` mock that captures `feeSource` arg

*(Schema migration tested implicitly by `prisma db push` in migration plan; no separate test needed)*

---

## Sources

### Primary (HIGH confidence)
- `https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction` — confirmed `fee` is `MoneyV2!` (singular), `associatedOrder` returns `ShopifyPaymentsAssociatedOrder` (nullable), `type` is `ShopifyPaymentsTransactionType!`
- `https://shopify.dev/docs/api/admin-graphql/2024-10/enums/ShopifyPaymentsTransactionType` — confirmed `CHARGE` enum value exists; `REFUND` also exists; no `CREDIT` alias for charge
- `https://shopify.dev/docs/api/admin-graphql/latest/queries/shopifypaymentsaccount` — confirmed `balanceTransactions` accepts `query` string argument; documented searchable fields include `payout_status` and `transaction_type`
- `community.shopify.dev/t/balance-transactions-by-payout-id/20934` — community confirmed `payments_transfer_id` and `payout_status` work as query filters; `payout_status` accepted

### Secondary (MEDIUM confidence)
- `community.shopify.dev/t/shopify-payments-balancetransaction-vs-payouts/28897` — many-to-one relationship between balance transactions and payouts confirmed; `payments_transfer_id` as filter verified by community member
- `shopify.dev/changelog/new-fees-and-net-fields-for-balance-transactions` — confirmed plural `fees` field belongs to `adjustmentsOrders` sub-object (not the main processing fee); the top-level `fee` field is the processing fee

### Tertiary (LOW confidence)
- Web search results on `payout_status:PAID` query value casing — multiple sources suggest lowercase `paid`; not verified on live store

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing tools fully capable
- API field names: HIGH — verified `fee`, `associatedOrder`, `type: CHARGE` against official docs
- feeSource state machine design: HIGH — derived directly from requirements and codebase analysis
- payout_status filter syntax: MEDIUM — field name confirmed; exact value casing (paid vs PAID) needs live verification
- Refund handler feeSource preservation: HIGH — code logic is deterministic from analysis of existing handler

**Research date:** 2026-03-18
**Valid until:** 2026-06-18 (stable Shopify API — field changes are versioned and announced via changelog)
