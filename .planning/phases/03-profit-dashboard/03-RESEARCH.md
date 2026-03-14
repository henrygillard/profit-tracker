# Phase 3: Profit Dashboard - Research

**Researched:** 2026-03-13
**Domain:** Shopify embedded app frontend (App Bridge CDN, Polaris Web Components, React + Vite), backend API routes for profit data aggregation, chart rendering
**Confidence:** HIGH (App Bridge CDN pattern, Polaris web components, backend Prisma queries); MEDIUM (Recharts v3 integration, Vite build wiring into Express); LOW (shopify.idToken() reliability — known community issues flagged)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Merchant can view store-level profit overview (total revenue, COGS, fees, net profit) with date range filtering (daily / weekly / monthly / custom) | Backend: Prisma `aggregate` on `OrderProfit` + `Order.processedAt` filter; Frontend: `s-select` date range picker, summary stat cards using `s-section` + `s-text` |
| DASH-02 | Merchant can view profit per order — sortable list showing revenue, COGS, fees, net profit, and margin % per order | Backend: GET /api/dashboard/orders with sort/date params; Frontend: `s-table` with `format="numeric"` headers; client-side sort state in React |
| DASH-03 | Merchant can view profit per product/SKU — margin % per product with best and worst performers highlighted | Backend: JOIN across `LineItem`, `ProductCost`, `OrderProfit` grouped by variantId/sku; Frontend: ranked table with `s-badge` for top/bottom performers |
| DASH-04 | Dashboard shows profit trend line chart over selected date range | Backend: GET /api/dashboard/trend — daily netProfit aggregates bucketed by date; Frontend: Recharts `LineChart` + `ResponsiveContainer` (not a Polaris web component — requires separate React install) |
| DASH-05 | Dashboard shows COGS coverage indicator — flags products/orders with missing COGS (NULL COGS never displays as $0) | Backend: count orders where `cogsKnown = false`; Frontend: `s-banner` warning + `s-badge tone="warning"` on affected rows; never render NULL as 0 |
</phase_requirements>

---

## Summary

Phase 3 converts the static placeholder at `/admin` into a real React SPA embedded inside Shopify Admin. The backend needs five new GET API routes that aggregate data already in the database (no new Shopify API calls required). The frontend is a Vite-built React SPA served from the existing Express `public/` directory, using Shopify's CDN-loaded App Bridge (v4) and Polaris Web Components for layout and tables, plus Recharts for the profit trend line chart.

The most important architectural decision for this phase is the frontend delivery model. The project is a plain Node/Express server with no framework scaffolding. The correct approach is: build a React SPA with Vite, output it to `public/app/`, and update the `/admin` route in `server.js` to serve `public/app/index.html`. The App Bridge and Polaris scripts load from Shopify's CDN — no npm installs for those. Recharts and React itself are bundled by Vite.

The second critical concern is session token handling. The existing `/api/*` middleware (`verifySessionToken`) already validates HS256 JWTs. The React frontend must call `shopify.idToken()` (App Bridge CDN global) to get a fresh token and include it as `Authorization: Bearer <token>` on every API call. The `shopify.idToken()` method is documented as the canonical approach in App Bridge v4, but community reports note it can hang in certain embedded contexts — the frontend should implement a 5-second timeout with a user-visible error state.

**Primary recommendation:** Build a Vite+React SPA in a `web/` subdirectory, bundle to `public/app/`, serve from Express. Use Polaris Web Components (`s-*` tags, CDN) for all chrome/layout/tables. Use Recharts (npm, bundled) for the trend line chart only. Write five focused Express API endpoints that query the existing Prisma models — no schema changes needed.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.x | Component model for dashboard SPA | Stable, Vite template ships it; Recharts v3 peer dep is React 16.8+ |
| Vite | ^6.x | Build tooling — bundles React SPA to `public/app/` | Fast HMR in dev, small production bundles; official Shopify node templates use it |
| Recharts | ^3.8.0 | Profit trend line chart (DASH-04) | Only chart requirement is a line chart; Recharts is the standard lightweight React chart library; v3 is current as of 2025-03 |
| App Bridge CDN | CDN — no npm | `shopify.idToken()`, embedded app wiring | Official Shopify CDN script; replaces deprecated `@shopify/app-bridge` npm package |
| Polaris Web Components CDN | CDN — no npm | All layout (`s-page`, `s-section`), tables (`s-table`), badges, banners | Officially released Oct 2025; `@shopify/polaris` npm package (React version) archived Jan 2026 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-dom` | ^18.3.x | React rendering | Required alongside React |
| `@vitejs/plugin-react` | ^4.x | Vite React plugin (Babel/SWC transform) | Standard Vite React setup |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js / Victory / Nivo | Recharts v3 is the lightest, most React-idiomatic; Chart.js is canvas-based (harder to style for Polaris); Victory is heavier; Nivo adds D3 complexity |
| Vite | Webpack / esbuild standalone | Vite is the current standard; Webpack is legacy; esbuild lacks React plugin ecosystem |
| Polaris Web Components CDN | `@shopify/polaris` React npm | React npm version archived Jan 2026 — do not use. Web components are the only maintained path |

**Installation (in `web/` SPA subdirectory):**
```bash
npm create vite@latest web -- --template react
cd web && npm install recharts
```

**No npm install needed for App Bridge or Polaris** — they load from Shopify CDN at runtime.

---

## Architecture Patterns

### Recommended Project Structure

```
web/                          # NEW: Vite React SPA source
├── index.html                # App Bridge + Polaris CDN scripts here
├── vite.config.js            # base: '/app/', outDir: '../public/app'
├── package.json              # react, react-dom, recharts, @vitejs/plugin-react
└── src/
    ├── main.jsx              # React root mount
    ├── App.jsx               # Router + date range state
    ├── api.js                # Authenticated fetch wrapper (uses shopify.idToken())
    └── components/
        ├── Overview.jsx      # DASH-01: store-level KPI cards
        ├── OrdersTable.jsx   # DASH-02: sortable orders list
        ├── ProductsTable.jsx # DASH-03: product margin ranking
        ├── TrendChart.jsx    # DASH-04: Recharts LineChart
        └── CogsCoverage.jsx  # DASH-05: coverage banner + row badges

routes/
└── api.js                    # EXTEND: add 4 new GET /api/dashboard/* routes

server.js                     # MODIFY: /admin route serves public/app/index.html

public/
└── app/                      # Vite build output (gitignored or committed)
    ├── index.html
    └── assets/
```

### Pattern 1: App Bridge CDN HTML Setup
**What:** The `/admin` route in `server.js` currently returns an inline HTML string. Replace it to serve `public/app/index.html`, which must include the two CDN scripts. The `shopify-api-key` meta tag tells App Bridge which app it's running in.
**When to use:** The single `index.html` entry point for the entire SPA.

```html
<!-- web/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="shopify-api-key" content="%VITE_SHOPIFY_API_KEY%" />
  <!-- App Bridge MUST be the first script; sets window.shopify global -->
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <!-- Polaris web components — loads s-* custom elements -->
  <script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
  <title>Profit Tracker</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

**`%VITE_SHOPIFY_API_KEY%`** is replaced at build time by Vite from `VITE_SHOPIFY_API_KEY` in the `web/.env` file (= same value as `SHOPIFY_API_KEY` on the backend).

### Pattern 2: Authenticated API Fetch Wrapper
**What:** Every frontend API call needs the session token in the Authorization header. The `shopify.idToken()` method (App Bridge CDN global) returns a fresh JWT. This is the same token the existing `verifySessionToken` middleware validates.
**When to use:** Every call to `/api/dashboard/*`.

```javascript
// web/src/api.js
// Source: https://shopify.dev/docs/api/app-bridge-library/apis/id-token
const TOKEN_TIMEOUT_MS = 5000;

async function getIdToken() {
  return Promise.race([
    window.shopify.idToken(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('idToken timeout')), TOKEN_TIMEOUT_MS)
    ),
  ]);
}

export async function apiFetch(path, options = {}) {
  let token;
  try {
    token = await getIdToken();
  } catch (err) {
    throw new Error('Could not get session token: ' + err.message);
  }
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
```

**Known issue (LOW confidence):** Multiple community reports indicate `shopify.idToken()` hangs without resolving in certain embedded contexts. The 5-second timeout + error state in the UI is mandatory, not optional. If the token consistently fails, the fallback is to read the `?id_token=` param Shopify injects into the iframe URL (App Bridge sets it on load).

### Pattern 3: Vite Config for Express Integration
**What:** Vite builds the SPA with base path `/app/` so Express can serve it from `public/app/`. The `/admin` route in `server.js` sends `public/app/index.html` directly.
**When to use:** Production build and Express serving.

```javascript
// web/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/app/',         // all asset URLs prefixed with /app/
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  define: {
    // Expose VITE_SHOPIFY_API_KEY from web/.env to index.html meta tag
  },
});
```

**Express change (server.js):**
```javascript
// Replace the inline /admin HTML handler:
app.get('/admin', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');
  const session = await prisma.shopSession.findFirst({ where: { shop } });
  if (!session) return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  // Serve the built SPA — App Bridge reads shop from URL context automatically
  res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});
```

### Pattern 4: Backend API Endpoints for Dashboard
**What:** Five focused GET routes added to `routes/api.js`. All data is already in the database from Phase 2. No new Shopify API calls. Date range passed as `?from=ISO&to=ISO` query params.
**When to use:** Called by the React frontend on every view change or date filter change.

```javascript
// Source: Prisma aggregate + groupBy docs — https://www.prisma.io/docs/orm/reference/prisma-client-reference#aggregate
// GET /api/dashboard/overview?from=2024-01-01&to=2024-12-31
router.get('/dashboard/overview', async (req, res) => {
  const { from, to } = req.query;
  const where = {
    shop: req.shopDomain,
    order: { processedAt: { gte: new Date(from), lte: new Date(to) } },
  };
  const agg = await prisma.orderProfit.aggregate({
    where,
    _sum: { revenueNet: true, cogsTotal: true, feesTotal: true, netProfit: true },
    _count: { _all: true },
  });
  const missingCogs = await prisma.orderProfit.count({
    where: { ...where, cogsKnown: false },
  });
  res.json({ ...agg._sum, orderCount: agg._count._all, missingCogsCount: missingCogs });
});

// GET /api/dashboard/orders?from=&to=&sort=netProfit&dir=asc
// Returns array of order profit rows joined with order name + processedAt

// GET /api/dashboard/products?from=&to=
// Groups by variantId/sku, sums COGS and revenue, computes margin %

// GET /api/dashboard/trend?from=&to=
// Buckets netProfit by date (DATE_TRUNC day in Postgres via $queryRaw or groupBy processedAt date)
```

### Pattern 5: Prisma Date-Bucketed Trend Query (DASH-04)
**What:** Aggregate net profit by day for the trend chart. Prisma's `groupBy` does not support date truncation natively — use `$queryRaw` with `DATE_TRUNC`.
**When to use:** `/api/dashboard/trend` endpoint only.

```javascript
// Source: https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries
const trend = await prisma.$queryRaw`
  SELECT
    DATE_TRUNC('day', o.processed_at) AS date,
    SUM(op.net_profit) AS net_profit,
    SUM(op.revenue_net) AS revenue
  FROM order_profits op
  JOIN orders o ON o.id = op.order_id
  WHERE op.shop = ${req.shopDomain}
    AND o.processed_at >= ${new Date(from)}
    AND o.processed_at <= ${new Date(to)}
  GROUP BY DATE_TRUNC('day', o.processed_at)
  ORDER BY date ASC
`;
// Returns: [{ date: Date, net_profit: Decimal, revenue: Decimal }, ...]
// Prisma returns BigInt for aggregated numbers — convert: Number(row.net_profit)
```

**BigInt gotcha:** Prisma `$queryRaw` returns `BigInt` for `SUM()` results. Must serialize before `res.json()`:
```javascript
// In the route handler, before res.json:
const serialized = trend.map(row => ({
  date: row.date.toISOString().slice(0, 10),
  netProfit: Number(row.net_profit),
  revenue: Number(row.revenue),
}));
```

### Pattern 6: Polaris Web Components for Data Tables (DASH-02, DASH-03)
**What:** `s-table` composes with `s-table-header-row`, `s-table-header`, `s-table-body`, `s-table-row`, `s-table-cell`. These are custom HTML elements loaded from the Polaris CDN script.
**When to use:** All tabular data in the dashboard.

```jsx
// React JSX — s-* tags work as JSX elements once the Polaris CDN script has loaded
// Source: https://shopify.dev/docs/api/app-home/polaris-web-components/layout-and-structure/table
function OrdersTable({ orders, sortKey, sortDir, onSort }) {
  return (
    <s-section padding="none">
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Order</s-table-header>
          <s-table-header listSlot="labeled" format="numeric">Revenue</s-table-header>
          <s-table-header listSlot="labeled" format="numeric">COGS</s-table-header>
          <s-table-header listSlot="labeled" format="numeric">Fees</s-table-header>
          <s-table-header listSlot="labeled" format="numeric">Net Profit</s-table-header>
          <s-table-header listSlot="labeled" format="numeric">Margin %</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {orders.map(o => (
            <s-table-row key={o.orderId}>
              <s-table-cell>{o.shopifyOrderName}</s-table-cell>
              <s-table-cell>${Number(o.revenueNet).toFixed(2)}</s-table-cell>
              <s-table-cell>
                {o.cogsKnown ? `$${Number(o.cogsTotal).toFixed(2)}` : <s-badge tone="warning">Unknown</s-badge>}
              </s-table-cell>
              <s-table-cell>${Number(o.feesTotal).toFixed(2)}</s-table-cell>
              <s-table-cell>{o.netProfit !== null ? `$${Number(o.netProfit).toFixed(2)}` : '—'}</s-table-cell>
              <s-table-cell>{o.marginPct !== null ? `${o.marginPct.toFixed(1)}%` : '—'}</s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
}
```

**s-table sort:** The `s-table` documentation does not describe a built-in click-to-sort event. Implement sort as client-side state in React: store `(sortKey, sortDir)` in `useState`, sort the data array before rendering, add click handlers to header cells using native `onClick`.

### Pattern 7: Recharts Trend Line Chart (DASH-04)
**What:** Wrap `LineChart` in `ResponsiveContainer` so it fills its container. Data comes from the `/api/dashboard/trend` endpoint.
**When to use:** The profit trend chart panel only.

```jsx
// Source: https://recharts.org/en-US/api/LineChart
// web/src/components/TrendChart.jsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export function TrendChart({ data }) {
  // data: [{ date: '2024-01-01', netProfit: 1250.50 }, ...]
  return (
    <s-section heading="Profit Trend">
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e3e5" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `$${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
            <Tooltip formatter={v => [`$${Number(v).toFixed(2)}`, 'Net Profit']} />
            <Line
              type="monotone"
              dataKey="netProfit"
              stroke="#008060"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </s-section>
  );
}
```

### Pattern 8: COGS Coverage Indicator (DASH-05)
**What:** Show a warning banner when any orders have unknown COGS. Never render NULL as $0.
**When to use:** Every dashboard view, evaluated from the overview API response.

```jsx
// Source: https://shopify.dev/docs/api/app-home/polaris-web-components/feedback-and-status/banner
function CogsCoverageBanner({ missingCogsCount, totalOrders }) {
  if (missingCogsCount === 0) return null;
  const pct = ((missingCogsCount / totalOrders) * 100).toFixed(0);
  return (
    <s-banner tone="warning">
      {missingCogsCount} of {totalOrders} orders ({pct}%) have unknown COGS.
      Net profit for these orders cannot be calculated.
      <s-link href="/admin?view=cogs">Enter product costs</s-link> to fix this.
    </s-banner>
  );
}
```

### Anti-Patterns to Avoid
- **Rendering NULL COGS as $0:** Any `OrderProfit` row where `cogsKnown = false` must display "Unknown" or "—", never a number. This is the core data integrity guarantee from Phase 2.
- **Calling `shopify.idToken()` without a timeout:** The promise can hang indefinitely in some embedded contexts. Always race against a timeout.
- **Using `@shopify/polaris` npm package:** The React npm version was archived in January 2026. The CDN web components are the only maintained path.
- **Loading App Bridge after other scripts:** The `app-bridge.js` script must be the first `<script>` in `<head>`. Loading it after other scripts can prevent the `window.shopify` global from initializing.
- **Serving the SPA index.html for `/api/*` routes:** The Express fallback for SPA routing must exclude `/api`, `/webhooks`, `/auth`, and `/health`. These must return their normal responses.
- **Client-side date math for "daily/weekly/monthly" presets:** Implement named range presets on the frontend (calculate ISO from/to from the preset label) but always send explicit ISO timestamps to the backend. Never rely on database `NOW()` for date boundaries — clock drift and timezone differences cause off-by-one errors.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line chart rendering | Custom SVG drawing | Recharts `LineChart` | Axis scaling, tooltip positioning, animation, responsive resize — all handled; D3 scale bugs are non-trivial |
| Session token injection | Manual JWT decode in browser | `shopify.idToken()` via App Bridge CDN | Token refresh, expiry, embedded context detection all handled by Shopify |
| Profit aggregation SQL | In-JS loop over all orders | Prisma `aggregate` + `$queryRaw` DATE_TRUNC | Database does set operations in one query; JS loop would fetch thousands of rows per request |
| Table sorting | Custom sort algorithm | JS `Array.prototype.sort` on the data array from API | Sort is one line — the issue is state management (which column, which direction); use React `useState` for that, not a library |
| UI layout / chrome | Custom CSS | Polaris web components (`s-page`, `s-section`, `s-stack`) | Polaris is the Shopify Admin design language — custom CSS will look wrong and may fail App Review |

**Key insight:** The backend aggregation endpoints are the hardest part of this phase — not because the queries are complex, but because `NULL` COGS must propagate correctly through every aggregation. Explicitly test that `SUM(net_profit)` where some rows have `NULL` returns `NULL` for the sum (Postgres behavior), not the sum of non-NULL rows.

---

## Common Pitfalls

### Pitfall 1: App Bridge CDN Script Order
**What goes wrong:** The `<script src="app-bridge.js">` is placed after other scripts or after `<div id="root">`. The `window.shopify` global is not set when React mounts, causing `shopify.idToken()` to throw `TypeError: window.shopify is undefined`.
**Why it happens:** Developers follow the React convention of putting scripts at the bottom of body.
**How to avoid:** The App Bridge script must be the first `<script>` tag in `<head>`, before `<link>` stylesheets, before Polaris, before the Vite module script.
**Warning signs:** `window.shopify` is `undefined` in the browser console; first API call returns 401.

### Pitfall 2: `shopify.idToken()` Hangs Without Resolving
**What goes wrong:** `await shopify.idToken()` never settles — the dashboard shows a permanent loading spinner with no error.
**Why it happens:** Multiple confirmed community reports describe this behavior in specific embedded contexts, particularly during certain App Bridge initialization sequences or when the app loads outside the admin iframe (e.g. during development without ngrok).
**How to avoid:** Always race `shopify.idToken()` against a 5-second timeout. Display a visible error state ("Could not authenticate — try reloading") if the timeout fires. Log the occurrence.
**Warning signs:** Spinner that never resolves; no network requests visible in DevTools.

### Pitfall 3: Prisma `$queryRaw` Returns BigInt, Not Number
**What goes wrong:** `JSON.stringify()` on a raw query result containing `BigInt` values throws `TypeError: Do not know how to serialize a BigInt`. Express `res.json()` uses `JSON.stringify` internally.
**Why it happens:** Postgres `SUM()` on `DECIMAL` columns returns `BigInt` in Prisma's raw query results.
**How to avoid:** Map the raw query results before responding: `Number(row.net_profit)`. Alternatively, cast in SQL: `SUM(op.net_profit)::float`.
**Warning signs:** `500 Internal Server Error` from the trend endpoint with the BigInt serialization message in server logs.

### Pitfall 4: NULL Aggregation Semantics in Postgres
**What goes wrong:** The overview endpoint shows `netProfit: null` for the entire store even though most orders have known COGS — one order with unknown COGS poisons the entire `SUM`.
**Why it happens:** In Postgres (and SQL generally), `SUM()` of a column where any row is `NULL` does NOT return `NULL` — it returns the sum of non-NULL rows. However, `SUM(CASE WHEN cogsKnown THEN netProfit ELSE NULL END)` would. The real risk is in the application layer: if you `reduce` a JS array including `null` values with `+`, you get `NaN`.
**How to avoid:** In the overview route, return separate sums: `sum of netProfit where cogsKnown = true` (the partial profit figure) and `missingCogsCount`. The UI displays both — partial profit clearly labeled "partial (X orders excluded)".
**Warning signs:** Overview shows a net profit number that doesn't match the sum of the visible order rows.

### Pitfall 5: SPA Routing Breaks `/admin` Reload
**What goes wrong:** Merchant navigates to the Orders view (`/admin?view=orders`), then reloads. Express sees `/admin?view=orders`, matches the `/admin` route, and serves the SPA correctly — but if any client-side route doesn't match, the app shows a blank page.
**Why it happens:** The SPA handles all view state via query params (`?view=overview`, `?view=orders`) — this avoids SPA path routing issues entirely and is simpler for an embedded app.
**How to avoid:** Use query params (`?view=`) for dashboard sections rather than path-based routing (`/admin/orders`). All views are served from the single `/admin` route.
**Warning signs:** Blank page on direct navigation to a dashboard sub-view URL.

### Pitfall 6: Polaris Web Components Not Rendering in React
**What goes wrong:** `s-page`, `s-table`, etc. render as empty custom elements with no visible output. DevTools shows the correct DOM elements but they appear unstyled or invisible.
**Why it happens:** The Polaris CDN script hasn't finished loading when the React component mounts, so the custom element definitions aren't registered yet.
**How to avoid:** The Polaris `<script>` tag in `index.html` loads synchronously before the Vite `<script type="module">`. React renders after the page is parsed, so Polaris definitions are available. Do not dynamically load the Polaris script via JS.
**Warning signs:** `s-table` elements appear in the DOM but render no visible table; no console errors.

---

## Code Examples

### Overview Aggregation Endpoint

```javascript
// routes/api.js — GET /api/dashboard/overview
// Source: https://www.prisma.io/docs/orm/reference/prisma-client-reference#aggregate
router.get('/dashboard/overview', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to query params required' });

  const dateFilter = { gte: new Date(from), lte: new Date(to) };
  const baseWhere = {
    shop: req.shopDomain,
    order: { processedAt: dateFilter },
  };

  const [agg, missingCogs] = await Promise.all([
    prisma.orderProfit.aggregate({
      where: baseWhere,
      _sum: { revenueNet: true, feesTotal: true, shippingCost: true },
      _count: { _all: true },
    }),
    prisma.orderProfit.count({ where: { ...baseWhere, cogsKnown: false } }),
  ]);

  // Separately sum known-COGS orders for partial profit display
  const knownAgg = await prisma.orderProfit.aggregate({
    where: { ...baseWhere, cogsKnown: true },
    _sum: { cogsTotal: true, netProfit: true },
    _count: { _all: true },
  });

  res.json({
    revenueNet: Number(agg._sum.revenueNet ?? 0),
    feesTotal: Number(agg._sum.feesTotal ?? 0),
    cogsTotal: Number(knownAgg._sum.cogsTotal ?? 0),   // partial — known orders only
    netProfit: Number(knownAgg._sum.netProfit ?? 0),    // partial — known orders only
    orderCount: agg._count._all,
    cogsKnownCount: knownAgg._count._all,
    missingCogsCount: missingCogs,
    isPartial: missingCogs > 0,
  });
});
```

### Products Margin Aggregation

```javascript
// GET /api/dashboard/products?from=&to=
// Joins LineItem → ProductCost → OrderProfit to compute per-variant profit
// Source: Prisma groupBy — https://www.prisma.io/docs/orm/prisma-client/queries/aggregations-grouping-summarizing
router.get('/dashboard/products', async (req, res) => {
  const { from, to } = req.query;

  // Raw query: join line_items with order_profits to get per-variant sums
  const results = await prisma.$queryRaw`
    SELECT
      li.variant_id,
      li.sku,
      COUNT(DISTINCT li.order_id) AS order_count,
      SUM(li.unit_price * li.quantity) AS revenue,
      SUM(op.net_profit * (li.unit_price * li.quantity) / NULLIF(op.revenue_net, 0)) AS net_profit_attr,
      BOOL_AND(op.cogs_known) AS all_cogs_known
    FROM line_items li
    JOIN orders o ON o.id = li.order_id
    JOIN order_profits op ON op.order_id = li.order_id
    WHERE o.shop = ${req.shopDomain}
      AND o.processed_at >= ${new Date(from)}
      AND o.processed_at <= ${new Date(to)}
    GROUP BY li.variant_id, li.sku
    ORDER BY net_profit_attr DESC NULLS LAST
  `;

  res.json(results.map(r => ({
    variantId: r.variant_id,
    sku: r.sku,
    orderCount: Number(r.order_count),
    revenue: Number(r.revenue ?? 0),
    netProfitAttributed: r.net_profit_attr !== null ? Number(r.net_profit_attr) : null,
    marginPct: r.revenue && r.net_profit_attr
      ? (Number(r.net_profit_attr) / Number(r.revenue)) * 100
      : null,
    allCogsKnown: r.all_cogs_known,
  })));
});
```

### Orders List Endpoint

```javascript
// GET /api/dashboard/orders?from=&to=&sort=netProfit&dir=desc&page=0
router.get('/dashboard/orders', async (req, res) => {
  const { from, to, sort = 'processedAt', dir = 'desc', page = 0 } = req.query;
  const PAGE_SIZE = 50;

  const ALLOWED_SORT = ['revenueNet', 'cogsTotal', 'feesTotal', 'netProfit', 'processedAt'];
  const sortKey = ALLOWED_SORT.includes(sort) ? sort : 'processedAt';
  const sortDir = dir === 'asc' ? 'asc' : 'desc';

  const orders = await prisma.orderProfit.findMany({
    where: {
      shop: req.shopDomain,
      order: { processedAt: { gte: new Date(from), lte: new Date(to) } },
    },
    include: { order: { select: { shopifyOrderName: true, processedAt: true } } },
    orderBy: sortKey === 'processedAt'
      ? { order: { processedAt: sortDir } }
      : { [sortKey]: sortDir },
    take: PAGE_SIZE,
    skip: Number(page) * PAGE_SIZE,
  });

  res.json(orders.map(op => ({
    orderId: op.orderId,
    shopifyOrderName: op.order.shopifyOrderName,
    processedAt: op.order.processedAt,
    revenueNet: Number(op.revenueNet),
    cogsTotal: op.cogsTotal !== null ? Number(op.cogsTotal) : null,
    feesTotal: Number(op.feesTotal),
    netProfit: op.netProfit !== null ? Number(op.netProfit) : null,
    marginPct: op.revenueNet && op.netProfit
      ? (Number(op.netProfit) / Number(op.revenueNet)) * 100
      : null,
    cogsKnown: op.cogsKnown,
  })));
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@shopify/polaris` npm React package | Polaris Web Components via CDN (`s-*` tags) | Oct 2025 (stable), archived Jan 2026 | Do not install the npm package — it receives no updates |
| `@shopify/app-bridge` npm package | App Bridge CDN script (`app-bridge.js`) | 2024 (v4 CDN release) | npm package in maintenance mode; CDN is canonical |
| `getSessionToken()` from `@shopify/app-bridge` npm | `window.shopify.idToken()` from CDN global | 2024 (App Bridge v4) | Different method name; same JWT result |
| Create React App | Vite | 2023+ | CRA officially deprecated; Vite is the standard |
| `res.json()` with Prisma `$queryRaw` BigInt | Map to `Number()` before serialize | Always | Prisma BigInt from raw queries is not JSON-serializable |

**Deprecated/outdated:**
- `@shopify/polaris` React npm: archived January 2026 — do not use for new code
- `@shopify/app-bridge` npm: maintenance mode only — do not install for new projects

---

## Open Questions

1. **`shopify.idToken()` reliability in this app's embedded context**
   - What we know: Method exists and is documented; multiple community reports of it hanging
   - What's unclear: Whether it's reliable in the specific context of this app's Express + iframe setup
   - Recommendation: Implement the 5-second timeout wrapper from day one; add a visible "Reload" button in the error state; test in a real Shopify store (not Partners dashboard preview) before launch

2. **React TypeScript vs plain JavaScript for the SPA**
   - What we know: The existing backend is all plain JavaScript; Recharts v3 ships TypeScript definitions
   - What's unclear: Whether the team wants TypeScript in the frontend
   - Recommendation: Use plain JavaScript (`.jsx`) to match the existing codebase convention; TypeScript can be added later

3. **Vite dev server proxy vs direct API calls during development**
   - What we know: In production, the React SPA is served from Express at the same origin; API calls to `/api/` work without CORS. In development, Vite runs on a different port from Express.
   - What's unclear: Whether the developer needs hot reload (Vite dev server) or is fine with `npm run build` + Express restart for each change.
   - Recommendation: Configure Vite `server.proxy` in `vite.config.js` to forward `/api/` to `http://localhost:3000` during development. This is standard Vite SPA + backend dev practice.

4. **Product margin attribution method (DASH-03)**
   - What we know: `OrderProfit.netProfit` is a store-level number; per-product attribution requires apportioning it by line item revenue share
   - What's unclear: Whether revenue-share attribution is correct or if the planner should use raw line item unit price × quantity minus per-line COGS (simpler but different from the stored `OrderProfit`)
   - Recommendation: Use the proportional attribution approach in the raw SQL (shown in the products endpoint above) — it's consistent with the Phase 2 profit engine's `itemsTotal` denominator decision

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (existing) |
| Config file | `jest.config.js` (root) |
| Quick run command | `npm test -- --testPathPattern=api` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | GET /api/dashboard/overview returns correct aggregates with date filter | integration | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-01 | Overview returns `isPartial: true` when any order has `cogsKnown: false` | unit | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-02 | GET /api/dashboard/orders returns orders sorted by netProfit desc | integration | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-02 | Orders endpoint rejects invalid sort keys (allowlist enforcement) | unit | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-03 | GET /api/dashboard/products returns variantId + marginPct ranked by profit | integration | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-04 | GET /api/dashboard/trend returns daily buckets in ISO date order | integration | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-04 | Trend endpoint serializes BigInt to Number before responding | unit | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-05 | Overview `missingCogsCount` matches count of `cogsKnown: false` orders | unit | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |
| DASH-05 | Orders list returns `cogsTotal: null` (not 0) for unknown-COGS orders | unit | `npm test -- --testPathPattern=dashboard` | ❌ Wave 0 |

**Note on frontend testing:** The React SPA (Vite build) is not covered by the existing Jest/Node test suite. Frontend component testing (e.g., Vitest + React Testing Library) is a v2 concern. Phase 3 backend route tests are the validation gate.

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=dashboard`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/dashboard.test.js` — covers all DASH-01 through DASH-05 route behaviors (mock Prisma using existing `tests/__mocks__/prisma.js` pattern)
- [ ] No framework install needed — Jest 29 + Supertest already present

---

## Sources

### Primary (HIGH confidence)
- `https://shopify.dev/docs/api/app-home/polaris-web-components` — full component list with `s-*` tag names
- `https://shopify.dev/docs/api/app-home/polaris-web-components/layout-and-structure/table` — `s-table` component structure and `format="numeric"` attribute
- `https://shopify.dev/docs/api/app-bridge-library/apis/id-token` — `shopify.idToken()` method, return type, usage
- `https://shopify.dev/docs/api/app-bridge-library` — CDN script URL, `shopify-api-key` meta tag, `window.shopify` global
- `https://shopify.dev/docs/api/app-home/using-polaris-components` — CDN script setup, `s-page` layout
- `https://github.com/recharts/recharts/releases` — v3.8.0 confirmed current as of 2025-03-06
- `https://github.com/recharts/recharts/wiki/3.0-migration-guide` — v3 breaking changes; LineChart core API unchanged
- `https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries` — `$queryRaw` BigInt behavior
- Existing codebase — `prisma/schema.prisma`, `lib/verifySessionToken.js`, `routes/api.js`, `server.js` — confirmed stack constraints

### Secondary (MEDIUM confidence)
- `https://vite.dev/guide/` — Vite 6 setup, `base` config, `outDir` build option
- `https://recharts.org/en-US/api/LineChart` — LineChart + ResponsiveContainer API (stable across v2/v3)
- `https://www.shopify.com/partners/blog/polaris-goes-stable-the-future-of-shopify-app-development-is-here` — Oct 2025 Polaris Web Components stable release announcement
- `https://github.com/Shopify/polaris-react` — archived Jan 2026, confirms React npm package is no longer maintained

### Tertiary (LOW confidence)
- Community forum reports of `shopify.idToken()` hanging — pattern is real, root cause unconfirmed; implementation must defensively handle it
- Revenue-share product margin attribution approach — derived from Phase 2's `itemsTotal` denominator decision in STATE.md; not from an external authoritative source

---

## Metadata

**Confidence breakdown:**
- Standard stack (React/Vite/Recharts/CDN scripts): HIGH — verified via official Shopify docs and npm release history
- App Bridge CDN session token (`shopify.idToken()`): MEDIUM — documented in official API reference, but community reliability issues flagged
- Polaris web components (`s-*` tags): HIGH — Oct 2025 stable release, full component reference available
- Backend API patterns (Prisma aggregate, `$queryRaw`): HIGH — verified against Prisma docs and existing codebase patterns
- Product margin attribution SQL: MEDIUM — consistent with Phase 2 decisions but not externally validated

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (90 days — Shopify CDN script content changes without version pinning; verify `shopify.idToken()` community status before implementation)
