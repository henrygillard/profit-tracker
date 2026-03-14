# Phase 2: Sync and Profit Engine - Research

**Researched:** 2026-03-10
**Domain:** Shopify GraphQL Admin API (Bulk Operations, Orders, Payments), background scheduling, COGS time-series modeling, profit calculation at write time
**Confidence:** HIGH (stack, API patterns); MEDIUM (payout-to-order mapping specifics — needs live verification)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | On first install, app syncs full order history via Shopify GraphQL Bulk Operations | `bulkOperationRunQuery` mutation → JSONL download → parse line-by-line with `__parentId` links |
| SYNC-02 | App receives and processes `orders/paid`, `orders/updated`, `orders/cancelled`, `orders/refunded` webhooks for real-time sync | `webhookSubscriptionCreate` GraphQL mutation after OAuth; HMAC pattern already in codebase |
| SYNC-03 | App runs a 15-minute background polling job as reliability backstop for missed webhooks | `node-cron` schedule `*/15 * * * *`; query orders updated since last sync cursor |
| SYNC-04 | App syncs Shopify Payments payout data to obtain exact transaction fee amounts per order | `shopifyPaymentsAccount { balanceTransactions }` via GraphQL; `associatedOrder { id }` links fee to order; scope: `read_shopify_payments_payouts` |
| COGS-01 | Merchant can manually enter cost (COGS) per product variant from the dashboard | POST `/api/cogs` endpoint behind existing JWT middleware; upsert into `ProductCost` model |
| COGS-02 | App auto-populates COGS from Shopify's `inventoryItem.unitCost` field | During order sync: `lineItems { variant { inventoryItem { unitCost { amount } } } }` — requires `read_inventory` scope |
| COGS-03 | Merchant can bulk-import COGS via CSV upload (SKU, cost columns) | `multer` (in-memory) + `csv-parser` stream; parse → upsert `ProductCost` rows |
| COGS-04 | COGS stored as time-series per variant — cost changes do not retroactively rewrite historical profit | `ProductCost` model with `effectiveFrom` timestamp; profit engine uses cost with highest `effectiveFrom <= order.processedAt` |
| FEES-01 | App auto-detects merchant's Shopify plan and applies correct transaction fee rate | `shop { plan { publicDisplayName } }` GraphQL query; map displayName to rate table |
| FEES-02 | Calculates processor fees from Shopify Payments payout data; merchant can configure rate for third-party gateways | `balanceTransactions.fee.amount` for Shopify Payments orders; configurable rate stored per shop for others |
| FEES-03 | Tracks shipping cost per order (manual input; uses Shopify Shipping label cost where API provides it) | `shippingLines { originalPriceSet }` in order query captures carrier-reported cost |
| FEES-04 | When an order is refunded, app reverses COGS attribution and adjusts fee calculations | Handle `refunds/create` webhook; recalculate `OrderProfit` with `currentTotalPriceSet` and `totalRefundedSet` |
</phase_requirements>

---

## Summary

Phase 2 builds the entire data pipeline: Shopify data flows in, profit is computed at write time, and the result is persisted before any UI exists. The phase divides cleanly into four sub-domains that must execute in order: (1) schema extension — new Prisma models for orders, products, COGS, fees, and profit records; (2) historical sync — Bulk Operations pull of all existing orders on first install; (3) real-time sync — webhooks for ongoing orders plus a 15-minute polling backstop; (4) profit engine — COGS lookup, fee calculation, and `OrderProfit` record written atomically on each order upsert.

The technical complexity is concentrated in two places. First, the Shopify Payments fee sync: `balanceTransactions` queries via the `shopifyPaymentsAccount` GraphQL object link each charge to an order via `associatedOrder { id }`, but this mapping has a many-to-one relationship at the payout level (confirmed via documentation) and needs live verification against a real Shopify Payments store before building the fee-attribution logic. Second, COGS time-series: the `ProductCost` model must store `effectiveFrom` timestamps so the profit engine can pick the cost that was in effect at order time, not today's cost.

The existing codebase is well-prepared: raw body middleware is correct, HMAC verification helper is proven, JWT middleware is in place, and PostgreSQL via Prisma is the data layer. This phase extends all of them — it does not replace them.

**Primary recommendation:** Use native `fetch` for all Shopify GraphQL calls (already the pattern in `routes/auth.js`), `node-cron` for the polling backstop, `multer` + `csv-parser` for COGS CSV import, and a strict write-time profit engine that treats missing COGS as `NULL` (never `$0`).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node-cron` | ^3.0.3 | 15-minute polling cron job | Lightweight, pure JS, no native dependencies; production-ready; integrates cleanly with Express startup |
| `multer` | ^1.4.5-lts.1 | CSV file upload handling (in-memory) | Defacto Express file upload middleware; `memoryStorage()` keeps files in buffer without disk writes |
| `csv-parser` | ^3.0.0 | Parse CSV buffer → row objects | Streaming transform; fast (~90k rows/sec); handles header row automatically |
| `prisma` (existing) | ^5.22.0 | ORM for all new models | Already in codebase; schema migration via `prisma db push` |
| Node.js `fetch` (built-in) | built-in (Node 18+) | Shopify GraphQL Admin API calls | Already used in `routes/auth.js` for token exchange; no extra dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-cron` | ^3.0.3 | Background job scheduling | SYNC-03 polling backstop only — do not use for initial bulk sync |
| `multer` | ^1.4.5-lts.1 | File upload parsing | COGS-03 CSV import endpoint only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node-cron` | `node-schedule`, `agenda`, Bull queues | `node-cron` is sufficient for a single 15-minute in-process job; Bull/Agenda add Redis dependency; overkill for MVP |
| `csv-parser` | `csv-parse`, PapaParse | All work; `csv-parser` is simplest streaming API for the SKU+cost use case |
| native `fetch` | `@shopify/admin-api-client` | The Shopify client adds abstraction but also dependency weight; fetch pattern is already established in this codebase |

**Installation:**
```bash
npm install node-cron multer csv-parser
```

---

## Architecture Patterns

### Recommended Project Structure
```
prisma/
└── schema.prisma          # extend with 5 new models (see below)
lib/
├── prisma.js              # existing
├── shopifyClient.js       # NEW: makeShopifyGraphQL(shop, token, query, variables)
├── syncOrders.js          # NEW: bulk operations + incremental order sync
├── syncPayouts.js         # NEW: balance transaction sync for fee data
├── profitEngine.js        # NEW: calculateOrderProfit(order, cogsMap, feesMap)
└── scheduler.js           # NEW: node-cron job initialization
routes/
├── webhooks.js            # extend: add orders/paid, refunds/create handlers
├── api.js                 # extend: COGS CRUD, CSV upload, shop config endpoints
└── auth.js                # extend: trigger historical sync + webhook registration after OAuth
tests/
├── sync.test.js           # NEW: bulk op trigger, JSONL parsing, order upsert
├── profit.test.js         # NEW: profit engine unit tests (pure functions, no I/O)
├── cogs.test.js           # NEW: COGS time-series lookup, CSV import
└── fees.test.js           # NEW: fee calculation by plan, payout fee attribution
```

### Pattern 1: Shopify GraphQL Call (native fetch)
**What:** Reusable helper that POSTs to the GraphQL Admin API endpoint for a given shop using its stored access token.
**When to use:** Every Shopify Admin API call in this phase — order queries, bulk ops, payments queries, shop plan query, webhook registration.

```javascript
// lib/shopifyClient.js
// Source: https://shopify.dev/docs/api/admin-graphql/latest
const API_VERSION = '2025-10';

async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

module.exports = { shopifyGraphQL };
```

### Pattern 2: Bulk Operation Lifecycle (SYNC-01)
**What:** Start a `bulkOperationRunQuery`, subscribe to `BULK_OPERATIONS_FINISH` webhook, download and stream-parse the JSONL result, upsert all orders.
**When to use:** First-install historical sync only. Incremental sync uses direct `orders` query.

```javascript
// Source: https://shopify.dev/docs/api/usage/bulk-operations/queries
// Step 1: Start bulk op
const BULK_ORDERS_QUERY = `
  mutation {
    bulkOperationRunQuery(query: """
      {
        orders {
          edges {
            node {
              id
              name
              processedAt
              displayFinancialStatus
              totalPriceSet { shopMoney { amount currencyCode } }
              subtotalPriceSet { shopMoney { amount } }
              totalRefundedSet { shopMoney { amount } }
              currentTotalPriceSet { shopMoney { amount } }
              shippingLines { originalPriceSet { shopMoney { amount } } }
              paymentGatewayNames
              lineItems {
                edges {
                  node {
                    id
                    quantity
                    originalUnitPriceSet { shopMoney { amount } }
                    variant {
                      id
                      sku
                      inventoryItem {
                        unitCost { amount currencyCode }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    """) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

// Step 2: When BULK_OPERATIONS_FINISH webhook fires:
//   - Fetch data.url from `bulkOperation(id:)` query
//   - Stream-download JSONL, parse line by line
//   - Lines with __parentId are children (lineItems) — buffer by parentId
//   - Lines without __parentId are Order root objects

// Step 3: For each order root object + its children, call upsertOrder()
```

**JSONL parsing pattern:**
```javascript
// Source: https://shopify.dev/docs/api/usage/bulk-operations/queries
const https = require('https');
const readline = require('readline');

async function streamJsonl(url, onLine) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const rl = readline.createInterface({ input: res });
      rl.on('line', (line) => {
        if (line.trim()) onLine(JSON.parse(line));
      });
      rl.on('close', resolve);
      rl.on('error', reject);
    });
  });
}
```

### Pattern 3: Incremental Order Sync (SYNC-03 polling)
**What:** Query orders updated since `lastSyncedAt` cursor stored per shop. Runs every 15 minutes via node-cron, and also handles missed webhook orders.
**When to use:** Polling backstop and direct webhook-missed recovery.

```javascript
// Source: https://shopify.dev/docs/api/admin-graphql/latest/queries/orders
const INCREMENTAL_ORDERS_QUERY = `
  query($query: String!, $after: String) {
    orders(first: 50, query: $query, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        processedAt
        updatedAt
        displayFinancialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount } }
        totalRefundedSet { shopMoney { amount } }
        shippingLines { originalPriceSet { shopMoney { amount } } }
        paymentGatewayNames
        lineItems(first: 50) {
          nodes {
            id
            quantity
            originalUnitPriceSet { shopMoney { amount } }
            variant {
              id
              sku
              inventoryItem { unitCost { amount } }
            }
          }
        }
      }
    }
  }
`;
// variables: { query: `updated_at:>=${lastSyncedAt.toISOString()}` }
// Paginate until pageInfo.hasNextPage = false
```

### Pattern 4: node-cron Polling Job (SYNC-03)
**What:** In-process cron that fires every 15 minutes, iterates all installed shops, runs incremental order sync for each.
**When to use:** Initialized once at server startup, after all routes are mounted.

```javascript
// lib/scheduler.js
// Source: https://nodecron.com/
const cron = require('node-cron');

function startScheduler(prisma, syncFn) {
  // Runs at minute 0, 15, 30, 45 of every hour
  cron.schedule('*/15 * * * *', async () => {
    const shops = await prisma.shopSession.findMany({ select: { shop: true, accessToken: true } });
    for (const { shop, accessToken } of shops) {
      try {
        await syncFn(shop, accessToken);
      } catch (err) {
        console.error(`Polling sync failed for ${shop}:`, err.message);
      }
    }
  }, { noOverlap: true }); // prevent overlap if sync takes > 15 min
}

module.exports = { startScheduler };
```

### Pattern 5: COGS Time-Series Lookup (COGS-04)
**What:** `ProductCost` records store `(shop, variantId, costAmount, effectiveFrom)`. When computing profit for an order, look up the cost effective at `order.processedAt`.
**When to use:** Profit engine — never use the current cost for historical orders.

```javascript
// lib/profitEngine.js — COGS lookup
async function getCOGSAtTime(prisma, shop, variantId, processedAt) {
  const cost = await prisma.productCost.findFirst({
    where: {
      shop,
      variantId,
      effectiveFrom: { lte: processedAt },
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  return cost ? parseFloat(cost.costAmount) : null; // null = unknown, never 0
}
```

**NULL COGS rule:** If `getCOGSAtTime` returns `null`, the `OrderProfit` record stores `cogsTotal = null` and `cogsKnown = false`. Dashboard requirement DASH-05 flags these. Never substitute `0`.

### Pattern 6: Shopify Payments Fee Attribution (SYNC-04, FEES-02)
**What:** Query `shopifyPaymentsAccount { balanceTransactions }` with filter on transaction type `CHARGE`, paginate through all results, match each to an order via `associatedOrder { id }`, store the `fee.amount` on the `OrderFee` record.

```javascript
// Source: https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction
const BALANCE_TRANSACTIONS_QUERY = `
  query($after: String) {
    shopifyPaymentsAccount {
      balanceTransactions(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          amount { amount currencyCode }
          fee { amount }
          net { amount }
          transactionDate
          associatedOrder { id }
          sourceOrderTransactionId
        }
      }
    }
  }
`;
// Scope required: read_shopify_payments_payouts
// Filter: type = CHARGE to get per-order processing fees
// associatedOrder.id is the Shopify GID for the order — strip prefix: gid://shopify/Order/12345
```

**Important caveat (MEDIUM confidence):** The `associatedOrder` field links a balance transaction to an order but the relationship is many-to-one at the payout level. A single order may have multiple balance transactions (charge + refund adjustments). The `type` field distinguishes them. This needs live verification — the `sourceOrderTransactionId` field may also be needed to disambiguate.

### Pattern 7: Shopify Plan Detection (FEES-01)
**What:** Query `shop { plan { publicDisplayName } }` after OAuth, store in `ShopConfig`. Map plan name to transaction fee rate.
**When to use:** After OAuth install, and on a weekly refresh (plans change rarely).

```javascript
// Source: https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopPlan
const SHOP_PLAN_QUERY = `
  query {
    shop {
      plan {
        publicDisplayName
        shopifyPlus
        partnerDevelopment
      }
    }
  }
`;

// Fee rate mapping (as of 2026 — verify against Shopify pricing page before shipping)
// Source: https://www.shopify.com/pricing
const THIRD_PARTY_FEE_RATES = {
  'Basic':    0.02,  // 2%
  'Grow':     0.01,  // 1%  (formerly "Shopify" plan)
  'Advanced': 0.006, // 0.6%
  'Plus':     0.002, // 0.2% (Shopify Plus)
  // Shopify Payments: 0% transaction fee (only credit card processing rate)
};
// If publicDisplayName doesn't match, default to 0.02 (Basic rate — conservative)
```

**Note:** Plan display names have changed over time (`Grow` replaced `Shopify` plan). The mapping above uses current names from the `ShopPlan.publicDisplayName` enum values (verified via official docs). Low confidence on Plus rate — confirm at shopify.com/pricing before implementation.

### Pattern 8: Webhook Registration After OAuth (SYNC-02)
**What:** After OAuth callback completes and the access token is stored, call `webhookSubscriptionCreate` for each required topic.
**When to use:** In `routes/auth.js` after the session upsert, as a fire-and-forget (errors logged, not fatal to auth flow).

```javascript
// Source: https://shopify.dev/docs/apps/build/webhooks/subscribe/subscribe-using-api
const WEBHOOK_TOPICS = [
  { topic: 'ORDERS_PAID',      uri: '/webhooks/orders/paid' },
  { topic: 'ORDERS_UPDATED',   uri: '/webhooks/orders/updated' },
  { topic: 'ORDERS_CANCELLED', uri: '/webhooks/orders/cancelled' },
  { topic: 'REFUNDS_CREATE',   uri: '/webhooks/refunds/create' },
  { topic: 'BULK_OPERATIONS_FINISH', uri: '/webhooks/bulk/finish' },
];

const WEBHOOK_CREATE_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $uri: URL!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { format: JSON, uri: $uri }
    ) {
      userErrors { field message }
      webhookSubscription { id }
    }
  }
`;
// Call for each topic; use absolute URI: process.env.SHOPIFY_APP_URL + path
// Idempotent: re-registering an existing topic returns the existing subscription
```

### Anti-Patterns to Avoid
- **Treating missing COGS as $0:** Any `null` COGS must propagate to `cogsKnown = false` on the profit record. The dashboard flags it. Never coerce to 0.
- **Writing profit during webhook with I/O blocking response:** The webhook handler must respond 200 within Shopify's timeout (~5 seconds). Trigger profit recalculation asynchronously or use `setImmediate`; do not await heavy DB operations before sending the response.
- **Relying solely on webhooks:** Webhooks miss ~1-2% of events under normal conditions and more during outages. The polling backstop (SYNC-03) is not optional.
- **Parsing JSONL bulk results into memory:** Order history can be millions of lines. Use the readline streaming pattern — never `JSON.parse(await response.text())`.
- **Using `read_shopify_payments` scope:** The correct scope for `balanceTransactions` is `read_shopify_payments_payouts`. Other payment scope names (`read_shopify_payments`, `read_shopify_payments_accounts`) may appear in docs but `read_shopify_payments_payouts` is the canonical name in the access scopes reference.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background job scheduling | Custom `setInterval` with drift | `node-cron` | Cron handles missed executions on restart, `noOverlap` option prevents pile-ups, cron syntax is auditable |
| CSV parsing | String split on commas | `csv-parser` | Quoted fields, escaped commas, BOM handling, encoding edge cases |
| File upload handling | Raw multipart body parsing | `multer` with `memoryStorage()` | Content-Disposition parsing, boundary handling, size limits, security |
| JSONL streaming from Shopify bulk URL | Buffer entire file | `readline` + `https.get` stream | Bulk results can be hundreds of MB for large stores |
| Shopify plan → fee rate lookup | Parse plan name ad hoc inline | Explicit constant map in `profitEngine.js` | Plan names change; centralized map is the single place to update |

**Key insight:** The profit calculation itself is straightforward arithmetic once the inputs exist. All the complexity is in getting trustworthy inputs (COGS at the right time, correct fee amount, NULL-safe revenue). Hand-roll the arithmetic; use libraries for I/O.

---

## Common Pitfalls

### Pitfall 1: `read_all_orders` Not Pre-Approved
**What goes wrong:** Phase 2 adds `read_all_orders` to the toml scopes, but Shopify requires explicit Partner Dashboard approval for this scope. Without it, orders older than 60 days return empty results — the bulk operation succeeds but returns nothing for older orders.
**Why it happens:** `read_all_orders` is a protected scope. The `read_orders` scope only covers the last 60 days.
**How to avoid:** Verify Partner Dashboard approval is in place before Phase 2 starts. The toml already has the comment: "read_all_orders requires pre-approval." Check Partner Dashboard → Apps → [App] → API access → Protected customer data.
**Warning signs:** Bulk operation completes but `objectCount` is much lower than expected for a store with years of history.

### Pitfall 2: Wrong Scope for Shopify Payments Data
**What goes wrong:** App requests `read_shopify_payments` or `read_shopify_payments_accounts` scope, both of which appear in community discussions. At runtime, `shopifyPaymentsAccount { balanceTransactions }` returns "Access denied."
**Why it happens:** Multiple scope names exist in the ecosystem but only `read_shopify_payments_payouts` is listed in the official access scopes documentation for `ShopifyPaymentsBalanceTransaction`.
**How to avoid:** Use exactly `read_shopify_payments_payouts` in the toml scopes list. No other variant.
**Warning signs:** `Access denied for shopifyPaymentsAccount field` error in GraphQL response.

### Pitfall 3: COGS Retroactive Rewrite (COGS-04 Violation)
**What goes wrong:** When a merchant updates COGS for a product, a naive `upsert` with no `effectiveFrom` rewrites the cost for all historical orders. A product that previously cost $5 and now costs $8 makes every past order look less profitable.
**Why it happens:** Single-row COGS model without time-series.
**How to avoid:** `ProductCost` model must have `(shop, variantId, effectiveFrom)` composite unique key. Updating cost always inserts a new row with `effectiveFrom: new Date()`. Profit engine queries `effectiveFrom <= order.processedAt ORDER BY effectiveFrom DESC LIMIT 1`.
**Warning signs:** Past `OrderProfit.cogsTotal` values change when COGS is edited.

### Pitfall 4: Webhook Response Timeout
**What goes wrong:** Webhook handler awaits heavy Prisma operations (bulk lineItem inserts, profit recalculation) before sending 200. Shopify marks the delivery as failed after ~5 seconds, retries, causing duplicate processing.
**Why it happens:** Shopify's webhook delivery timeout is strict.
**How to avoid:** Acknowledge immediately (res.status(200).send('OK')), then process asynchronously. Use a queue or `setImmediate` for the actual database writes. Flag idempotency with Shopify's `X-Shopify-Webhook-Id` header to prevent duplicate processing on retry.
**Warning signs:** Shopify dashboard shows webhook delivery failures; duplicate order records.

### Pitfall 5: NULL vs $0 COGS in Profit Records
**What goes wrong:** Profit engine returns `0` for missing COGS (e.g., `cost ?? 0`), making an order appear more profitable than it is. Dashboard shows fabricated net profit figures.
**Why it happens:** Developer convenience — null-coalescing to 0 is an easy one-liner.
**How to avoid:** `OrderProfit.cogsTotal` must be nullable in the schema. Profit engine explicitly sets `cogsKnown: false` when any lineItem has no cost. API and dashboard display "unknown" not a number.
**Warning signs:** Orders with no COGS entered show positive profit instead of "COGS unknown."

### Pitfall 6: payout-to-order Fee Mapping Ambiguity
**What goes wrong:** A single order may have multiple balance transactions (original charge + partial refund adjustment). If only the first `CHARGE` transaction is fetched, refund fee reversals are missed, overstating fees.
**Why it happens:** Balance transactions are not strictly one-per-order.
**How to avoid:** Sync ALL balance transaction types per order (CHARGE, REFUND, ADJUSTMENT). Sum `fee.amount` across all transactions for an order, with REFUND types treated as negative. Verify this behavior against a live Shopify Payments store before shipping (flagged in STATE.md as unconfirmed).
**Warning signs:** Fee totals for refunded orders don't match what merchant sees in Shopify Payments dashboard.

### Pitfall 7: OAuth Scopes Out of Sync Between toml and SHOPIFY_SCOPES env var
**What goes wrong:** `routes/auth.js` builds the OAuth URL from `process.env.SHOPIFY_SCOPES`, but the toml is the canonical scope declaration. If they diverge, re-installations prompt the merchant for unexpected scope changes.
**Why it happens:** Two sources of truth for scopes (noted in Phase 1 research).
**How to avoid:** Keep `SHOPIFY_SCOPES` env var identical to toml `scopes` value. Update both together.

---

## Prisma Schema Extension

The following new models must be added to `prisma/schema.prisma`. These are the foundation every other piece of Phase 2 builds on.

```prisma
// Order — core order record from Shopify
model Order {
  id               String   @id               // Shopify GID: gid://shopify/Order/12345
  shop             String
  shopifyOrderName String   @map("shopify_order_name") // e.g. "#1001"
  processedAt      DateTime @map("processed_at")
  financialStatus  String   @map("financial_status")
  totalPrice       Decimal  @map("total_price")      @db.Decimal(12,2)
  currentTotalPrice Decimal @map("current_total_price") @db.Decimal(12,2)
  totalRefunded    Decimal  @default(0) @map("total_refunded") @db.Decimal(12,2)
  shippingCost     Decimal  @default(0) @map("shipping_cost")  @db.Decimal(12,2)
  paymentGateway   String   @map("payment_gateway")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  lineItems        LineItem[]
  profit           OrderProfit?

  @@index([shop, processedAt])
  @@map("orders")
}

// LineItem — individual product line within an order
model LineItem {
  id              String  @id              // Shopify GID
  orderId         String  @map("order_id")
  variantId       String? @map("variant_id") // nullable: custom line items have no variant
  sku             String?
  quantity        Int
  unitPrice       Decimal @map("unit_price") @db.Decimal(12,2)

  order           Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([variantId])
  @@map("line_items")
}

// ProductCost — COGS time-series per variant
// Never update rows — insert new row when cost changes
model ProductCost {
  id            Int      @id @default(autoincrement())
  shop          String
  variantId     String   @map("variant_id")
  sku           String?
  costAmount    Decimal  @map("cost_amount") @db.Decimal(12,2)
  source        String   @default("manual") // "manual" | "shopify" | "csv"
  effectiveFrom DateTime @map("effective_from") @default(now())
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([shop, variantId, effectiveFrom])
  @@map("product_costs")
}

// OrderProfit — computed profit record written at order upsert time
// cogsTotal is NULL when any lineItem has unknown COGS (never $0)
model OrderProfit {
  id           Int      @id @default(autoincrement())
  orderId      String   @unique @map("order_id")
  shop         String
  revenue      Decimal  @db.Decimal(12,2)
  cogsTotal    Decimal? @map("cogs_total")  @db.Decimal(12,2)   // NULL = unknown
  cogsKnown    Boolean  @default(false) @map("cogs_known")
  feesTotal    Decimal  @default(0) @map("fees_total") @db.Decimal(12,2)
  shippingCost Decimal  @default(0) @map("shipping_cost") @db.Decimal(12,2)
  netProfit    Decimal? @map("net_profit")  @db.Decimal(12,2)   // NULL when COGS unknown
  calculatedAt DateTime @default(now()) @map("calculated_at")

  order        Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([shop, calculatedAt])
  @@map("order_profits")
}

// ShopConfig — per-shop configuration (plan, fee rates, sync cursors)
model ShopConfig {
  shop                  String   @id
  shopifyPlan           String?  @map("shopify_plan")
  thirdPartyFeeRate     Decimal? @map("third_party_fee_rate") @db.Decimal(6,4)
  lastOrderSyncedAt     DateTime? @map("last_order_synced_at")
  bulkOpInProgress      Boolean  @default(false) @map("bulk_op_in_progress")
  bulkOpId              String?  @map("bulk_op_id")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@map("shop_configs")
}
```

---

## Code Examples

### Profit Engine — Core Calculation
```javascript
// lib/profitEngine.js
// Pure function: no I/O, easy to unit test
// Source: Requirements FEES-01 through FEES-04, COGS-04

function calculateProfit({ order, cogsPerLine, processorFee, shopifyTransactionFee }) {
  // revenue = current total after any refunds
  const revenue = parseFloat(order.currentTotalPrice);
  const shipping = parseFloat(order.shippingCost);

  // COGS: sum per line, or null if any line is unknown
  let cogsTotal = null;
  let cogsKnown = true;
  let cogsSum = 0;

  for (const { lineItemId, quantity, cogs } of cogsPerLine) {
    if (cogs === null) {
      cogsKnown = false;
      break;
    }
    cogsSum += cogs * quantity;
  }
  if (cogsKnown) cogsTotal = cogsSum;

  // Fees: processor fee (from payout data or configured rate) + Shopify transaction fee
  const feesTotal = (processorFee ?? 0) + (shopifyTransactionFee ?? 0);

  // Net profit: null when COGS unknown
  const netProfit = cogsKnown ? revenue - cogsTotal - feesTotal - shipping : null;

  return { revenue, cogsTotal, cogsKnown, feesTotal, shippingCost: shipping, netProfit };
}

module.exports = { calculateProfit };
```

### Scopes Update (toml)
```toml
[access_scopes]
# Phase 2 scopes — all required for sync + profit engine
# read_all_orders: requires Partner Dashboard pre-approval (see STATE.md blocker)
scopes = "read_orders,read_all_orders,read_products,read_inventory,read_shopify_payments_payouts"
```

### COGS CSV Import Endpoint
```javascript
// routes/api.js — add to existing protected router
// Source: https://www.npmjs.com/package/multer, https://www.npmjs.com/package/csv-parser
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/cogs/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const rows = [];
  const stream = Readable.from(req.file.buffer);
  stream.pipe(csvParser())
    .on('data', (row) => {
      const sku = row['sku'] || row['SKU'];
      const cost = parseFloat(row['cost'] || row['Cost'] || row['COST']);
      if (sku && !isNaN(cost) && cost >= 0) rows.push({ sku, cost });
    })
    .on('end', async () => {
      // Upsert: find variantId by SKU, insert new ProductCost row
      // (implementation detail for PLAN)
      res.json({ imported: rows.length });
    })
    .on('error', (err) => res.status(400).json({ error: 'CSV parse error' }));
});
```

### Refund Webhook Handler Skeleton (FEES-04)
```javascript
// routes/webhooks.js — add refunds/create handler
// Use refunds/create (not orders/updated) — more reliable for refunds
// Source: https://community.shopify.dev/t/refunds-create-webhook/13009
router.post('/refunds/create', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  // ACK immediately — Shopify timeout is ~5 seconds
  res.status(200).send('OK');

  // Async: recalculate OrderProfit for the affected order
  setImmediate(async () => {
    try {
      const payload = JSON.parse(req.body.toString());
      const orderId = `gid://shopify/Order/${payload.order_id}`;
      // Re-fetch order from DB, recalculate profit with updated currentTotalPrice
      // ...
    } catch (err) {
      console.error('refunds/create processing error:', err);
    }
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| REST Admin API for orders | GraphQL Admin API (mandatory for new public apps) | April 1, 2025 | All order/product/payments queries MUST use GraphQL |
| `currentBulkOperation` polling query (no ID) | `bulkOperation(id:)` query (API 2026-01+) | 2026-01 | Use `currentBulkOperation` for 2025-10 API version; `bulkOperation(id:)` for future versions |
| Single bulk op per shop | Up to 5 concurrent bulk ops per shop (API 2026-01+) | 2026-01 | At 2025-10 (this app's version), limit is still 1 concurrent bulk op |
| Shopify plan name "Shopify" | Plan renamed to "Grow" | ~2024 | `publicDisplayName` now returns "Grow" not "Shopify"; fee rate maps must use "Grow" |

**Deprecated/outdated:**
- REST Admin API for new public apps: Do not use. All API calls in Phase 2 must be GraphQL.
- `read_shopify_payments` scope (older name): Use `read_shopify_payments_payouts` for balance transactions.
- `currentBulkOperation` (deprecated in 2026-01): Acceptable at API version 2025-10; migrate when upgrading API version.

---

## Open Questions

1. **`read_all_orders` Partner Dashboard approval status**
   - What we know: The toml comment from Phase 1 documents this requirement. Approval was noted as needed before Phase 2 starts.
   - What's unclear: Whether approval has been submitted/granted.
   - Recommendation: Check Partner Dashboard before writing SYNC-01 code. Without approval, bulk op returns only 60-day orders.

2. **Payout-to-order fee mapping (MEDIUM confidence)**
   - What we know: `balanceTransactions.associatedOrder.id` links a transaction to an order. Multiple transaction types (CHARGE, REFUND) can exist per order.
   - What's unclear: Does a merchant with partial refunds always get a REFUND-type balance transaction, or does the original CHARGE transaction update? Does `fee.amount` on a REFUND transaction have a sign?
   - Recommendation: Flagged in STATE.md as requiring live Shopify Payments store verification. Build the fee sync with defensive logic (sum all types, log the per-type breakdown). Verify correctness before marking SYNC-04 done.

3. **Webhook idempotency under retries**
   - What we know: Shopify retries failed webhooks up to 19 times over 48 hours. Duplicate processing without idempotency causes duplicate `OrderProfit` records or inflated fee totals.
   - What's unclear: Shopify includes a `X-Shopify-Webhook-Id` header — is this consistent across retries for the same event?
   - Recommendation: Store processed webhook IDs in a small `ProcessedWebhooks` table (or use order ID as upsert key to make the operation idempotent). The `Order` upsert pattern already handles this for order records.

4. **Stores not using Shopify Payments**
   - What we know: `shopifyPaymentsAccount` returns `null` for stores using only third-party gateways. The fee calculation falls back to `thirdPartyFeeRate * order.currentTotalPrice`.
   - What's unclear: Should the fee sync even be attempted, or skip gracefully?
   - Recommendation: Check `shopifyPaymentsAccount { activated }` after OAuth. If `false` or `null`, skip balance transaction sync entirely and use configured rate for all orders.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x + Supertest 7.x (existing from Phase 1) |
| Config file | `jest.config.js` — already exists |
| Quick run command | `npx jest --testPathPattern=tests/(sync\|profit\|cogs\|fees)` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | `bulkOperationRunQuery` mutation is called on first install | unit | `npx jest tests/sync.test.js -t "bulk operation"` | Wave 0 |
| SYNC-01 | JSONL stream parser correctly assembles orders with lineItems from `__parentId` | unit | `npx jest tests/sync.test.js -t "JSONL parser"` | Wave 0 |
| SYNC-01 | Order upsert creates `OrderProfit` record atomically | integration | `npx jest tests/sync.test.js -t "upsert creates profit"` | Wave 0 |
| SYNC-02 | `POST /webhooks/orders/paid` with valid HMAC upserts order and returns 200 | integration | `npx jest tests/sync.test.js -t "orders/paid webhook"` | Wave 0 |
| SYNC-02 | `POST /webhooks/orders/paid` with invalid HMAC returns 401 | integration | `npx jest tests/sync.test.js -t "orders/paid 401"` | Wave 0 |
| SYNC-02 | `POST /webhooks/refunds/create` with valid HMAC recalculates OrderProfit | integration | `npx jest tests/sync.test.js -t "refunds/create"` | Wave 0 |
| SYNC-03 | Scheduler calls incremental sync for each installed shop | unit | `npx jest tests/sync.test.js -t "scheduler"` | Wave 0 |
| SYNC-04 | Balance transaction fee is stored on OrderProfit when present | unit | `npx jest tests/fees.test.js -t "payout fee attribution"` | Wave 0 |
| COGS-01 | `POST /api/cogs` inserts new ProductCost row with current timestamp | integration | `npx jest tests/cogs.test.js -t "manual COGS entry"` | Wave 0 |
| COGS-02 | `inventoryItem.unitCost` from order sync populates ProductCost if none exists | unit | `npx jest tests/cogs.test.js -t "auto-populate from Shopify"` | Wave 0 |
| COGS-03 | CSV with 3 valid rows imports 3 ProductCost records | integration | `npx jest tests/cogs.test.js -t "CSV import"` | Wave 0 |
| COGS-03 | CSV with invalid row (missing sku) skips row without error | unit | `npx jest tests/cogs.test.js -t "CSV invalid row"` | Wave 0 |
| COGS-04 | Profit engine uses cost at order time, not current cost | unit | `npx jest tests/cogs.test.js -t "time-series lookup"` | Wave 0 |
| FEES-01 | Plan "Basic" maps to 2% fee rate | unit | `npx jest tests/fees.test.js -t "plan fee rates"` | Wave 0 |
| FEES-01 | Plan "Grow" maps to 1% fee rate | unit | `npx jest tests/fees.test.js -t "plan fee rates"` | Wave 0 |
| FEES-02 | Order with Shopify Payments uses payout fee amount, not calculated rate | unit | `npx jest tests/fees.test.js -t "Shopify Payments fee"` | Wave 0 |
| FEES-03 | `shippingLines.originalPriceSet` is stored as `shippingCost` on Order | unit | `npx jest tests/sync.test.js -t "shipping cost"` | Wave 0 |
| FEES-04 | Refunded order recalculates profit using `currentTotalPrice` | unit | `npx jest tests/profit.test.js -t "refund profit reversal"` | Wave 0 |
| FEES-04 | Refunded order COGS attribution reversal: `OrderProfit.cogsTotal` reflects partial quantity | unit | `npx jest tests/profit.test.js -t "partial refund COGS"` | Wave 0 |
| (all) | Missing COGS sets `cogsKnown = false`, `cogsTotal = null`, `netProfit = null` | unit | `npx jest tests/profit.test.js -t "unknown COGS"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=tests/profit` (profit engine is pure — fastest feedback)
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sync.test.js` — JSONL parser, order upsert, webhook handlers, scheduler
- [ ] `tests/profit.test.js` — profit engine pure function tests, refund reversal, null COGS
- [ ] `tests/cogs.test.js` — manual entry, auto-populate, CSV import, time-series lookup
- [ ] `tests/fees.test.js` — plan detection map, payout fee attribution, third-party fallback
- [ ] `tests/__mocks__/shopifyClient.js` — mock for Shopify GraphQL calls (avoid real API in tests)
- [ ] Schema migration: `npx prisma db push` after adding 5 new models
- [ ] Install: `npm install node-cron multer csv-parser`

*(Existing Jest + Supertest infrastructure from Phase 1 covers runner, config, and Prisma mock pattern)*

---

## Sources

### Primary (HIGH confidence)
- [https://shopify.dev/docs/api/usage/bulk-operations/queries](https://shopify.dev/docs/api/usage/bulk-operations/queries) — `bulkOperationRunQuery` mutation, JSONL format with `__parentId`, `BULK_OPERATIONS_FINISH` webhook topic, concurrency limits
- [https://shopify.dev/docs/api/admin-graphql/latest/objects/Order](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order) — `currentTotalPriceSet`, `totalRefundedSet`, `shippingLines`, `lineItems`, `paymentGatewayNames`
- [https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction](https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsBalanceTransaction) — `fee`, `net`, `amount`, `associatedOrder.id`, `sourceOrderTransactionId`
- [https://shopify.dev/docs/api/admin-graphql/latest/objects/shopifypaymentsaccount](https://shopify.dev/docs/api/admin-graphql/latest/objects/shopifypaymentsaccount) — Required scope: `read_shopify_payments_payouts`; `balanceTransactions` field; `payouts` field
- [https://shopify.dev/docs/api/usage/access-scopes](https://shopify.dev/docs/api/usage/access-scopes) — Confirmed scope names: `read_orders`, `read_all_orders`, `read_products`, `read_inventory`, `read_shopify_payments_payouts`
- [https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopPlan](https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopPlan) — `publicDisplayName` enum values including "Basic", "Grow", "Advanced", "Plus"
- [https://shopify.dev/changelog/apps-now-need-shopify-approval-to-read-orders-older-than-60-days](https://shopify.dev/changelog/apps-now-need-shopify-approval-to-read-orders-older-than-60-days) — `read_all_orders` approval requirement

### Secondary (MEDIUM confidence)
- [https://shopify.dev/docs/apps/build/webhooks/subscribe/subscribe-using-api](https://shopify.dev/docs/apps/build/webhooks/subscribe/subscribe-using-api) — `webhookSubscriptionCreate` mutation syntax, topic enum names
- [https://nodecron.com/](https://nodecron.com/) — `node-cron` `cron.schedule()` API, `noOverlap` option
- [https://community.shopify.dev/t/refunds-create-webhook/13009](https://community.shopify.dev/t/refunds-create-webhook/13009) — `refunds/create` is more reliable than `orders/updated` for refund events
- [https://shopify.dev/changelog/new-fees-and-net-fields-for-balance-transactions](https://shopify.dev/changelog/new-fees-and-net-fields-for-balance-transactions) — `fee` and `net` fields on `ShopifyPaymentsBalanceTransaction`

### Tertiary (LOW confidence — needs live verification)
- Payout-to-order many-to-one relationship behavior under partial refunds — confirmed structure from docs but sign conventions and transaction type behavior needs live store testing
- Exact Shopify Plus third-party transaction fee rate (0.2% cited in some sources, 0.15% in others) — verify at shopify.com/pricing before shipping FEES-01

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `node-cron`, `multer`, `csv-parser` are well-established; native fetch is already used in this codebase
- Architecture patterns: HIGH — Bulk Operations lifecycle, JSONL streaming, COGS time-series all verified from official Shopify docs
- Prisma schema: HIGH — models derived directly from requirements and API field shapes
- Fee scope name: HIGH — `read_shopify_payments_payouts` confirmed from access scopes reference page
- Payout fee attribution detail: MEDIUM — structure confirmed, per-transaction sign conventions need live verification
- Shopify Plus fee rate: LOW — conflicting sources; needs official pricing page verification

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (Shopify API version 2025-10 stable; scope names stable; plan names may change)
