# Architecture Patterns: Profit Analytics on Shopify Embedded App

**Domain:** Shopify profit analytics dashboard (embedded app)
**Researched:** 2026-03-10
**Confidence:** MEDIUM-HIGH (Shopify API patterns based on training through Aug 2025; API version 2025-10 in use per existing toml config; external research tools unavailable, findings cross-checked against official Shopify documentation patterns from training)

---

## Recommended Architecture

The new architecture layers a data pipeline and React dashboard on top of the existing Express/PostgreSQL/Shopify OAuth foundation. It introduces three new subsystems without replacing anything:

1. **Data Ingestion Subsystem** — pulls orders from Shopify API, stores raw + computed records
2. **Analytics API Subsystem** — Express routes serving aggregated profit data to the React frontend
3. **React Frontend Subsystem** — Shopify App Bridge embedded React app replacing the current inline HTML

These three subsystems connect to the existing Auth, Session, Webhook, and Prisma layers that are already working.

```
[Shopify Admin]
    |
    | iframe (App Bridge)
    v
[React Frontend]  <-- GET /api/analytics/* --> [Analytics API Routes]
                                                       |
                                              [Prisma Data Access]
                                                       |
                                              [PostgreSQL: Order, Profit,
                                               Product, COGS tables]
                                                       ^
                                                       |
                                          [Background Sync Service]
                                                       |
                        +---------------------------+--+
                        |                           |
               [Shopify REST API]       [Shopify Webhook: orders/create,
               /admin/api/orders.json   orders/updated, orders/paid]
               /admin/api/products.json
               /admin/api/payouts.json (GraphQL)
```

---

## Component Boundaries

### Component 1: React Frontend (new)

**Responsibility:** Render profit dashboard in Shopify Admin iframe using App Bridge. Show store overview, per-order profit, per-product margins. Handle COGS input form.

**Communicates with:**
- Shopify Admin via App Bridge 3.x (for session token, navigation, UI chrome)
- Express API via REST (`/api/analytics/*`, `/api/cogs/*`) — authenticated via App Bridge session tokens

**Does not:**
- Directly call Shopify Admin API (all Shopify calls go through Express backend)
- Hold computed profit state (server is source of truth)

**Build dependency:** Requires Analytics API routes to exist before the frontend is useful. Requires App Bridge session token middleware on the Express side.

---

### Component 2: Analytics API Routes (new)

**Responsibility:** Serve aggregated profit data to the React frontend. Validate session tokens. No Shopify API calls — reads only from the local PostgreSQL database.

**Communicates with:**
- React Frontend (inbound requests)
- Prisma / PostgreSQL (database reads)
- Existing Auth layer (session validation via `ShopSession` model)

**Key routes:**
```
GET  /api/analytics/overview?shop=&from=&to=     # Store-level profit summary
GET  /api/analytics/orders?shop=&from=&to=&page= # Per-order profit list
GET  /api/analytics/products?shop=&from=&to=     # Per-product margin list
POST /api/cogs                                    # Create/update COGS entry
GET  /api/cogs?shop=                             # List COGS entries
POST /api/cogs/import                            # CSV bulk import
GET  /api/sync/status?shop=                      # Sync status (last sync, count)
POST /api/sync/trigger?shop=                     # Manual resync trigger
```

**Authentication:** Every request must be validated with an App Bridge session token (JWT). Middleware reads `Authorization: Bearer <session_token>` header, verifies the JWT signature using `SHOPIFY_API_SECRET`, extracts the shop domain, then checks `ShopSession` table for a valid access token.

**Build dependency:** Requires Prisma schema (Order, OrderProfit, Product, COGS models) to be migrated before any routes return data.

---

### Component 3: Background Sync Service (new)

**Responsibility:** Pull orders and products from Shopify API into PostgreSQL. Run profit computations. Keep data fresh without blocking HTTP responses.

**Communicates with:**
- Shopify Admin REST API (outbound: orders, products, payouts)
- Prisma / PostgreSQL (writes)
- ShopSession table (reads: to get access token per shop)

**Trigger mechanisms (in order of preference):**
1. **Webhook-triggered** (primary): `orders/paid`, `orders/updated`, `orders/cancelled` → immediate upsert of single order
2. **Polling fallback** (secondary): Scheduled job every 15 minutes per shop using `node-cron` — catches missed webhooks, handles bulk historical sync on install
3. **Manual trigger** (tertiary): `POST /api/sync/trigger` — for user-initiated resync

**Does not:**
- Block the HTTP request cycle (runs in-process but asynchronously, or extracted to a worker later)
- Compute profit in real-time during API requests (profit computed at sync time, stored)

**Build dependency:** Requires ShopSession (exists), Order/Product Prisma models, COGS model (needed to compute profit at sync time).

---

### Component 4: Prisma Data Models (new, extending existing schema)

**Responsibility:** Store all profit-relevant data: raw order data, COGS per variant, computed profit per order and per product.

**Communicates with:**
- Background Sync (writes raw + computed data)
- Analytics API Routes (reads aggregated data)

**Build dependency:** Must be built first — everything else depends on these models.

---

### Existing Components (unchanged boundaries)

| Component | Role | Relevant to New Work |
|-----------|------|----------------------|
| Auth routes (`routes/auth.js`) | OAuth flow | Session token validation reuses `ShopSession` |
| Webhook routes (`routes/webhooks.js`) | Lifecycle events | Add new order webhook handlers here |
| Prisma client (`lib/prisma.js`) | DB singleton | Shared by new components |
| ShopSession model | Per-shop access tokens | Background sync reads tokens from this |

---

## Shopify API Strategy: GraphQL vs REST

### Verdict: GraphQL for historical bulk sync, REST for incremental updates

**Confidence:** MEDIUM (based on Shopify API documentation patterns through Aug 2025)

**GraphQL Bulk Operations (for initial historical sync):**

Shopify's `bulkOperationRunQuery` mutation lets you export all historical orders asynchronously. Shopify processes the job server-side and provides a JSONL download URL. This is the correct approach for syncing a store's full order history on install (could be 10,000+ orders).

```graphql
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            lineItems {
              edges {
                node {
                  id
                  quantity
                  variant { id sku }
                  originalTotalSet { shopMoney { amount currencyCode } }
                }
              }
            }
            transactions {
              gateway
              kind
              status
              fees { flatFee { amount } rateFee percentageFee }
            }
          }
        }
      }
    }
    """
  ) {
    bulkOperation { id status }
    userErrors { field message }
  }
}
```

The result is polled via `currentBulkOperation { status url }` and downloaded as JSONL. This avoids REST pagination (250 orders/page with rate limits) for bulk historical loads.

**REST API for incremental sync (ongoing):**

For day-to-day incremental syncing (catching up on orders since last sync), REST is simpler:

```
GET /admin/api/2025-10/orders.json?status=any&updated_at_min={timestamp}&limit=250
```

REST returns 250 orders per page with `Link` header pagination. For stores doing $10K-$200K/month (roughly 50-2,000 orders/month), this means 1-8 pages — fast and simple. GraphQL cursors add complexity without benefit at this scale.

**Summary:**
- Install sync (full history): GraphQL Bulk Operations
- Ongoing incremental sync: REST API with `updated_at_min` filter
- Single-order webhook sync: REST `GET /admin/api/2025-10/orders/{id}.json`

---

## Key Shopify API Endpoints

**Confidence:** HIGH for REST; MEDIUM for specific GraphQL field names (verify against 2025-10 schema)

### Orders with Line Items
```
GET /admin/api/2025-10/orders.json
  ?status=any
  &updated_at_min=2024-01-01T00:00:00Z
  &limit=250
  &fields=id,name,created_at,financial_status,line_items,total_price,subtotal_price,
          total_shipping_price_set,total_tax,total_discounts,gateway,
          payment_gateway_names,processing_method
```

Line items include: `variant_id`, `sku`, `quantity`, `price`, `total_discount`

### Transaction Fees
Shopify transaction fees are NOT returned directly on the `Order` resource in REST. Options:

1. **`/admin/api/2025-10/orders/{id}/transactions.json`** — returns payment gateway and amount, but NOT the fee percentage. Gateway name is present, allowing fee calculation from known rates.
2. **Shopify Payments: Payouts API (GraphQL)** — `shopifyPaymentsPayout` and `payoutTransactions` include actual fee amounts per transaction. This is the authoritative source for Shopify Payments merchants.
3. **Fee calculation fallback** — For non-Shopify-Payments merchants, calculate from known gateway rates (Shopify Basic: 2%, Shopify: 1%, Advanced: 0.5%; third-party gateways vary).

**Recommended approach for MVP:**
- Detect `payment_gateway_names` on the order
- If `shopify_payments`: use the Payouts GraphQL API for exact fees
- If third-party gateway: apply configurable fee rate (user-entered or known defaults)

### Products / Variants for Cost Tracking
```
GET /admin/api/2025-10/products.json?fields=id,title,variants
GET /admin/api/2025-10/variants/{id}.json
```

Shopify's `cost` field on variants (`inventory_item.cost`) is available via:
```
GET /admin/api/2025-10/inventory_items/{id}.json
```
Returns `cost` (merchant's purchase cost). This is the closest Shopify has to COGS for variants — use it as a starting point, allow merchant override.

**Required scopes** (already configured per INTEGRATIONS.md with 60+ scopes):
- `read_orders`, `read_products`, `read_inventory` — for order/product/cost data
- `read_shopify_payments_payouts` — for exact fee data (confirm scope name in toml)

---

## Database Schema Design

### Strategy: Computed-and-Stored (not compute-on-the-fly)

**Confidence:** HIGH (standard pattern for analytics systems)

**Rationale:** Profit calculation requires joining orders + line items + COGS + fee data. Computing this on every dashboard request is expensive and slow. Store the computed profit per order at sync time. Recompute only when COGS change (triggered recompute job) or order updates arrive.

This also means the dashboard API routes are simple read queries — no heavy computation at request time.

### Prisma Schema Extensions

```prisma
// Extend existing schema.prisma

model Order {
  id               String   @id              // Shopify order GID or numeric ID
  shopDomain       String                    // Isolates per-shop
  shopifyOrderId   String                    // Shopify internal ID
  orderName        String                    // "#1001" display name
  createdAt        DateTime
  updatedAt        DateTime
  financialStatus  String                    // "paid", "refunded", "partially_refunded"
  gateway          String                    // "shopify_payments", "paypal", etc.

  // Financials (stored in shop currency)
  totalRevenue     Decimal  @db.Decimal(10,2)
  subtotal         Decimal  @db.Decimal(10,2)
  totalShipping    Decimal  @db.Decimal(10,2)
  totalTax         Decimal  @db.Decimal(10,2)
  totalDiscounts   Decimal  @db.Decimal(10,2)

  // Computed profit (updated at sync time)
  transactionFees  Decimal  @db.Decimal(10,2)  // From Shopify Payments API or calculated
  totalCOGS        Decimal  @db.Decimal(10,2)  // Sum of (line item qty * variant COGS)
  grossProfit      Decimal  @db.Decimal(10,2)  // revenue - COGS - fees - shipping
  profitMargin     Decimal  @db.Decimal(5,4)   // grossProfit / totalRevenue (0.0-1.0)

  lineItems        LineItem[]
  syncedAt         DateTime                    // When this record was last synced

  @@unique([shopDomain, shopifyOrderId])
  @@index([shopDomain, createdAt])            // Primary query pattern
  @@index([shopDomain, financialStatus])
}

model LineItem {
  id              String   @id @default(cuid())
  orderId         String
  order           Order    @relation(fields: [orderId], references: [id])
  shopifyLineId   String
  variantId       String?
  sku             String?
  title           String
  quantity        Int
  unitPrice       Decimal  @db.Decimal(10,2)
  totalPrice      Decimal  @db.Decimal(10,2)
  unitCOGS        Decimal  @db.Decimal(10,2)  // Snapshot of COGS at sync time
  totalCOGS       Decimal  @db.Decimal(10,2)  // quantity * unitCOGS

  @@index([orderId])
  @@index([variantId])
}

model Product {
  id             String   @id              // Shopify product GID
  shopDomain     String
  title          String
  syncedAt       DateTime
  variants       ProductVariant[]

  @@unique([shopDomain, id])
  @@index([shopDomain])
}

model ProductVariant {
  id              String   @id              // Shopify variant GID
  productId       String
  product         Product  @relation(fields: [productId], references: [id])
  shopDomain      String
  sku             String?
  title           String                    // "Red / Large"
  shopifyCost     Decimal? @db.Decimal(10,2) // From inventory_items.cost (Shopify's stored cost)

  cogs            COGS?

  @@index([shopDomain])
  @@index([sku])
}

model COGS {
  id              String   @id @default(cuid())
  variantId       String   @unique
  variant         ProductVariant @relation(fields: [variantId], references: [id])
  shopDomain      String
  cost            Decimal  @db.Decimal(10,2)  // Merchant-entered COGS (overrides shopifyCost)
  source          String                       // "manual", "csv_import", "shopify_cost"
  updatedAt       DateTime @updatedAt

  @@index([shopDomain])
}

model SyncState {
  id              String   @id @default(cuid())
  shopDomain      String   @unique
  lastOrderSync   DateTime?
  lastProductSync DateTime?
  syncStatus      String    // "idle", "running", "failed"
  errorMessage    String?
  totalOrders     Int       @default(0)
  updatedAt       DateTime  @updatedAt
}
```

### Key design decisions:

**Snapshot COGS on line items at sync time:** `LineItem.unitCOGS` stores the COGS value at the time the order was synced. This prevents retroactive COGS changes from silently altering historical profit numbers. When a merchant changes COGS, a recompute job runs and updates affected orders explicitly.

**Store profit on Order, not compute in query:** `Order.grossProfit` and `Order.profitMargin` are pre-computed. Dashboard queries are simple `WHERE shopDomain = ? AND createdAt BETWEEN ? AND ?` with aggregates over stored values — no JOINs to COGS at query time.

**`SyncState` per shop:** Tracks last sync cursor so incremental polling knows the `updated_at_min` parameter to use. Also surfaces sync status to the dashboard UI.

---

## Background Sync Strategy

### Confidence: HIGH (standard Shopify app patterns)

### Primary: Webhook-Driven Order Sync

Register these webhooks in `shopify.app.profit-tracker.toml`:

```
orders/paid       → POST /webhooks/orders/paid
orders/updated    → POST /webhooks/orders/updated
orders/cancelled  → POST /webhooks/orders/cancelled
orders/refunded   → POST /webhooks/orders/refunded
```

Each webhook handler:
1. Verifies HMAC signature (existing pattern from `routes/webhooks.js`)
2. Extracts order ID from payload
3. Fetches full order from REST API (webhook payloads can be incomplete)
4. Computes profit (fetch variant COGS from DB or Shopify inventory API)
5. Upserts `Order` and `LineItem` records
6. Updates `SyncState.lastOrderSync`

**Why fetch full order instead of using webhook payload:** Webhook payloads for `orders/updated` are partial — they only include changed fields. Fetching the full order ensures consistent data. This is the standard Shopify pattern.

### Secondary: Polling for Incremental Sync

A `node-cron` job runs every 15 minutes per active shop:

```
GET /admin/api/2025-10/orders.json?updated_at_min={SyncState.lastOrderSync}&status=any&limit=250
```

Catches:
- Orders that came in while webhooks were down
- Webhook delivery failures (Shopify retries 3x over 48h, but gaps can happen)
- Historical orders during bulk install sync

**Cadence:** 15 minutes is appropriate for profit analytics — merchants don't need second-level freshness. This also keeps Shopify API usage well within rate limits (40 REST calls/second for most plans).

### Historical Sync on Install

On OAuth completion (after `ShopSession` is created), trigger a one-time historical sync job:

1. Fetch all products and variants (for COGS seeding from `inventory_items.cost`)
2. Use GraphQL Bulk Operations for order history (preferred) OR paginate REST orders with no `updated_at_min` filter (simpler, adequate for stores < 5,000 orders)
3. For MVP: Use REST pagination (simpler to build). Upgrade to Bulk Operations in Phase 2 if large stores become target customers.
4. Show sync progress in dashboard via `SyncState` polling (`GET /api/sync/status`)

**Rate limit handling:** Use a simple exponential backoff. Shopify returns `429 Too Many Requests` with `Retry-After` header. Parse the header, sleep the specified time, retry. For REST: bucket of 40 calls/s (standard) or 2 calls/s (if on Basic plan). Implement token bucket at the sync service level.

---

## Express Route Structure for Analytics API

### Pattern: Shop-scoped REST with session token auth middleware

All new routes go in `routes/api.js` (new file), registered in `server.js` as:

```javascript
app.use('/api', apiSessionMiddleware, apiRouter);
```

`apiSessionMiddleware` validates the App Bridge session token JWT on every request, extracts the shop domain, and attaches it to `req.shop`. This is the Shopify-recommended pattern for embedded app API calls.

**App Bridge Session Token Flow:**
1. React frontend calls `getSessionToken()` from `@shopify/app-bridge-react`
2. Token is a short-lived JWT (1 min TTL) signed with `SHOPIFY_API_SECRET`
3. Frontend passes token as `Authorization: Bearer <token>` header
4. Express middleware verifies JWT signature, extracts `dest` claim (shop domain)
5. Middleware confirms `ShopSession` exists for that shop (active installation)

All analytics queries then use `req.shop` as the scoping key — no shop parameter trusted from query string for authenticated routes.

### Analytics Query Patterns

The most important query (store overview):

```sql
SELECT
  COUNT(*) as order_count,
  SUM(total_revenue) as total_revenue,
  SUM(total_cogs) as total_cogs,
  SUM(transaction_fees) as total_fees,
  SUM(gross_profit) as gross_profit,
  AVG(profit_margin) as avg_margin
FROM orders
WHERE shop_domain = $1
  AND created_at BETWEEN $2 AND $3
  AND financial_status NOT IN ('refunded', 'voided')
```

Because profit is pre-computed and stored on `Order`, this is a single-table aggregate — fast even at 10,000+ orders per shop.

---

## Data Flow

### Install-Time Data Flow

```
OAuth completion
  → trigger background job: historical order + product sync
  → fetch all products + inventory_items.cost → upsert ProductVariant + COGS(source=shopify_cost)
  → paginate REST orders (oldest first) → compute profit per order → upsert Order + LineItem
  → update SyncState (lastOrderSync = now, totalOrders = N)
  → React dashboard polls /api/sync/status every 5s until syncStatus = "idle"
  → dashboard renders with data
```

### Ongoing Order Data Flow

```
Shopify merchant places/updates order
  → Shopify delivers webhook to POST /webhooks/orders/paid
  → HMAC verified
  → fetch full order from REST
  → look up COGS for each variant in local DB
  → compute profit (revenue - COGS - fees - shipping)
  → upsert Order + LineItem records
  → React dashboard next refresh shows updated data
```

### COGS Update Data Flow

```
Merchant enters COGS for variant via dashboard
  → POST /api/cogs { variantId, cost }
  → upsert COGS record
  → trigger recompute job: find all orders containing this variant in date range
  → recompute Order.totalCOGS and Order.grossProfit for affected orders
  → React dashboard reflects updated margins
```

### Dashboard Request Data Flow

```
React app loads in Shopify Admin iframe
  → App Bridge initializes, merchant authenticated by Shopify
  → getSessionToken() returns JWT
  → GET /api/analytics/overview?from=&to= with Bearer token
  → apiSessionMiddleware validates JWT, extracts shop domain
  → query Order table for pre-computed aggregates
  → return JSON to React
  → render dashboard
```

---

## Patterns to Follow

### Pattern 1: Pre-compute profit at write time, read at query time

**What:** When syncing an order, compute `grossProfit`, `profitMargin`, `transactionFees`, and `totalCOGS` immediately and store on the `Order` record.

**When:** Any time order data changes: initial sync, webhook update, COGS change.

**Why:** Dashboard API becomes a simple aggregate query. Avoids complex real-time joins across orders, line items, COGS, and fee tables. Scales to large order volumes without expensive query planning.

### Pattern 2: Webhook primary, polling backup

**What:** Rely on `orders/paid` and `orders/updated` webhooks for real-time order ingestion. Run a 15-minute polling job as a reliability backstop.

**When:** All production deployments.

**Why:** Webhooks have ~99% delivery rate but not 100%. Polling catches the 1% with minimal API calls. Avoids needing a queuing system for MVP.

### Pattern 3: Shop-scoped everything

**What:** Every database model includes `shopDomain`. Every query includes `WHERE shop_domain = ?`. Session token middleware enforces the shop boundary on every API request.

**When:** Every query, every model.

**Why:** Multi-tenancy is load-bearing. A bug that leaks one merchant's data to another is a fatal trust and legal failure. Defense in depth: scoping in DB schema + scoping in queries + session token validation.

### Pattern 4: Sync state as first-class citizen

**What:** The `SyncState` model tracks sync status, last sync time, and error state per shop. The dashboard exposes this to merchants.

**When:** Every sync operation updates `SyncState`.

**Why:** Merchants need to know if their data is current. "Data as of 10 minutes ago" is fine. "No idea if data is current" is a trust problem. Makes debugging easier in production.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Real-time profit computation on API request

**What:** Joining `Order → LineItem → COGS` on every dashboard GET request and computing profit in the query.

**Why bad:** Becomes progressively slower as order volume grows. At 10,000 orders, a single date-range query joins 100,000+ line items against the COGS table. Dashboard becomes unusably slow for high-volume merchants.

**Instead:** Pre-compute profit at sync time. Store `grossProfit` on `Order`. Dashboard queries are single-table aggregates.

### Anti-Pattern 2: Storing only raw Shopify data and computing everything in Express

**What:** Saving raw API JSON blobs to a `raw_orders` table and processing all analytics in Node.js at request time.

**Why bad:** You lose SQL's aggregation power. Moving large datasets through Node to compute SUM/AVG is slower than PostgreSQL doing it natively. Also makes date-range filtering expensive.

**Instead:** Parse Shopify API responses at sync time, extract the fields you need, store in normalized relational tables, let PostgreSQL do aggregations.

### Anti-Pattern 3: Polling Shopify API on every dashboard page load

**What:** Frontend calls backend, which calls Shopify Admin API, which returns orders, which are then processed and returned to frontend — all in-request.

**Why bad:** Shopify API rate limits (40 req/s) become a user-facing problem. Dashboard page loads are slow (Shopify API latency + processing time). Every merchant's page load consumes API quota.

**Instead:** Sync in the background, serve from local PostgreSQL.

### Anti-Pattern 4: Trusting `shop` from query string on authenticated API routes

**What:** `GET /api/analytics/overview?shop=merchant.myshopify.com` — using the shop parameter from the URL to scope queries.

**Why bad:** Any user who discovers the URL can query any shop's data by changing the `shop` parameter.

**Instead:** Extract shop from the App Bridge session token (JWT `dest` claim), which is cryptographically bound to the authenticated merchant.

### Anti-Pattern 5: Computing transaction fees from first principles per request

**What:** Calling Shopify Payments API at dashboard load time to get exact fee amounts.

**Why bad:** High latency, rate limit consumption, fragile if Payouts API has delays.

**Instead:** Fetch and store transaction fees during order sync. If fees aren't yet settled (order just placed), use a calculated estimate and mark as estimated. Update when payout data is available.

---

## Suggested Build Order

This order respects dependencies — each phase has what it needs from prior phases.

### Phase 1: Data Foundation (build first — everything depends on this)

1. Extend Prisma schema: `Order`, `LineItem`, `Product`, `ProductVariant`, `COGS`, `SyncState`
2. Run migrations, verify in Prisma Studio
3. Add required OAuth scopes to `shopify.app.profit-tracker.toml`: `read_orders`, `read_products`, `read_inventory`, `read_shopify_payments_payouts`

**Why first:** Analytics API routes need models to exist. Sync service needs models to write to. React frontend needs API routes to exist. All paths converge on the database schema.

### Phase 2: Backend Sync Service (build second)

1. `lib/shopify-api.js` — wrapper around Shopify REST API calls with rate limiting and retry
2. `lib/profit-calculator.js` — pure function: given order + COGS map → profit fields
3. `lib/sync.js` — orchestrates product sync and order sync, updates SyncState
4. Trigger historical sync on OAuth callback completion
5. `node-cron` polling job (15-minute interval)

**Why second:** Once sync is running, there's real data in the database to test API routes against.

### Phase 3: Analytics API Routes (build third)

1. `lib/session-middleware.js` — App Bridge JWT validation
2. `routes/api.js` — all analytics and COGS endpoints
3. Register in `server.js`
4. Add order webhook handlers to `routes/webhooks.js` (`orders/paid`, `orders/updated`, etc.)

**Why third:** React frontend needs these routes to be functional. Building API routes before React means you can test with curl/Postman against real data.

### Phase 4: React Frontend (build fourth)

1. Set up React build pipeline (Vite recommended — fast, simple, works well with Express serving the built assets)
2. Install `@shopify/app-bridge-react`, `@shopify/polaris`
3. Build dashboard views: overview, orders table, products table
4. Build COGS entry form
5. Express serves React build at `/admin` route

**Why fourth:** All the plumbing exists. React becomes a straightforward presentation layer over working APIs.

---

## Scalability Considerations

| Concern | At 100 merchants | At 1K merchants | At 10K merchants |
|---------|-----------------|-----------------|-----------------|
| Webhook processing | In-process async, fine | In-process async, fine | Consider queue (BullMQ + Redis) |
| Polling job | `node-cron` in-process, fine | Monitor memory; may need separate worker | Definitely extract to worker process |
| Database queries | Single-table aggregates, fast | Add `createdAt` composite indexes | Partition `orders` table by `shopDomain` |
| API rate limits | No issue | Monitor per-shop quota usage | Implement per-shop rate limit tracking |
| Historical sync on install | REST pagination, fine | REST pagination, fine | GraphQL Bulk Operations required |

For the MVP targeting $10K-$200K/month merchants, in-process background sync with `node-cron` is appropriate. The architecture doesn't paint you into a corner — extracting to a worker process (or adding BullMQ) is additive, not a rewrite.

---

## Sources

- Shopify Admin API documentation (REST and GraphQL, version 2025-10): patterns based on training through Aug 2025. Confidence MEDIUM for specific field names — verify `transaction.fees` GraphQL field availability in 2025-10 schema before building.
- Existing codebase analysis: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/CONCERNS.md` — HIGH confidence (direct code inspection)
- Shopify Payments Payouts GraphQL API: MEDIUM confidence — field names may differ from training data. Official reference: `https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsAccount`
- App Bridge session token JWT pattern: HIGH confidence — stable Shopify pattern since App Bridge 3.0
- PostgreSQL aggregation for analytics: HIGH confidence — standard SQL patterns

---

*Architecture research: 2026-03-10*
