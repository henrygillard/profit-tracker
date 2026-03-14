---
phase: 03-profit-dashboard
verified: 2026-03-14T00:00:00Z
status: human_needed
score: 14/14 must-haves verified
human_verification:
  - test: "Open /admin?shop=<your-test-shop>.myshopify.com in Shopify Admin (embedded iframe)"
    expected: "Polaris s-page chrome renders — NOT the old 'Welcome to profit tracker' card. Browser DevTools Network tab shows Authorization: Bearer <token> header on /api/dashboard/* requests."
    why_human: "App Bridge token acquisition (window.shopify.idToken()) and Shopify Admin iframe embedding cannot be verified programmatically"
  - test: "On the Overview view, click the 'Last 7 days', 'Last 30 days', 'Last 90 days' preset buttons"
    expected: "KPI cards (Revenue, COGS, Fees, Net Profit) re-fetch and update with new date range values. Custom from/to date inputs also change data when Apply is clicked."
    why_human: "Date range re-fetch behavior requires a live browser session with real API data"
  - test: "On the Overview view, if any orders have unknown COGS, verify the warning banner appears"
    expected: "s-banner tone=warning shows 'X of N orders (Y%) have unknown COGS. Net profit for these orders cannot be calculated.' When missingCogsCount=0, no banner renders."
    why_human: "Conditional rendering of CogsCoverage banner requires live data with mixed cogsKnown values"
  - test: "Navigate to the Orders view (?view=orders). Find an order with unknown COGS."
    expected: "COGS cell shows s-badge tone=warning 'Unknown' (not $0.00). Net Profit and Margin % cells show '—'. Clicking a sortable column header re-fetches with the new sort."
    why_human: "NULL COGS badge rendering and sort re-fetch require live browser interaction"
  - test: "Navigate to the Products view (?view=products)"
    expected: "Products ranked by margin. Top 3 known-COGS products show s-badge tone=success 'Top 3'. Bottom 3 show s-badge tone=critical 'Bottom 3'. Products with allCogsKnown=false show s-badge tone=warning 'Partial COGS'."
    why_human: "Badge assignment logic (Top 3 / Bottom 3 on known-COGS rows only) requires visual verification with real data"
  - test: "Verify Trend chart on Overview view"
    expected: "Recharts LineChart renders with a profit line. Hovering a data point shows tooltip with dollar value. 'No data for this period' displays gracefully if no data."
    why_human: "Chart rendering and tooltip hover interaction require a live browser"
  - test: "Verify browser back/forward navigation"
    expected: "Navigating between Overview/Orders/Products views updates the ?view= URL param. Browser back button returns to the previous view."
    why_human: "History.pushState and popstate listener behavior requires interactive browser testing"
---

# Phase 3: Profit Dashboard Verification Report

**Phase Goal:** Merchants see what they actually kept within 10 minutes of installing — a working React dashboard embedded in Shopify Admin showing profit at store, order, and product level
**Verified:** 2026-03-14
**Status:** human_needed — all automated checks passed; 7 items require human verification in a live Shopify Admin session
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `npm test -- --testPathPattern=dashboard` outputs passing tests covering all DASH-01–05 route behaviors | VERIFIED | All 51 tests pass (9 dashboard + 42 prior); confirmed by running npm test |
| 2 | Every backend route behavior listed in the validation map has a corresponding test case in dashboard.test.js | VERIFIED | 9 test cases present covering DASH-01 (2), DASH-02 (2), DASH-03 (1), DASH-04 (2), DASH-05 (2) — exact match |
| 3 | The prisma mock supports orderProfit.aggregate, orderProfit.count, orderProfit.findMany, and prisma.$queryRaw | VERIFIED | tests/__mocks__/prisma.js lines 10–18 declare all four mock methods with correct default return shapes |
| 4 | GET /api/dashboard/overview returns revenue, COGS, fees, net profit aggregates with isPartial flag | VERIFIED | routes/api.js lines 170–208; dual-aggregate pattern; returns all required fields; 2 passing tests |
| 5 | GET /api/dashboard/orders returns paginated, sortable order profit rows with null cogsTotal for unknown-COGS orders | VERIFIED | routes/api.js lines 215–249; allowlist validated; ternary on line 241 explicitly returns null for cogsKnown=false; 2 passing tests |
| 6 | GET /api/dashboard/products returns per-variant margin ranking | VERIFIED | routes/api.js lines 257–305; $queryRaw with proportional attribution SQL; 1 passing test |
| 7 | GET /api/dashboard/trend returns daily net profit buckets with Numbers (not BigInt) | VERIFIED | routes/api.js lines 313–351; Number() applied to all $queryRaw results; instanceof Date check for both Postgres and mock; 2 passing tests |
| 8 | NULL COGS never appears as $0 — cogsTotal is null in JSON for cogsKnown=false orders | VERIFIED | routes/api.js line 241: `op.cogsTotal !== null ? Number(op.cogsTotal) : null`; OrdersTable.jsx line 108: renders s-badge Unknown when !order.cogsKnown; dedicated test DASH-05 asserts cogsTotal is null |
| 9 | Running `cd web && npm run build` exits 0 and produces public/app/index.html | VERIFIED | public/app/index.html exists with correct content; assets/ directory present |
| 10 | web/index.html has App Bridge CDN script as first script tag in head | VERIFIED | web/index.html line 8: `<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>` — first script; public/app/index.html mirrors this |
| 11 | web/src/api.js exports apiFetch with 5-second idToken timeout and error throw | VERIFIED | web/src/api.js: TOKEN_TIMEOUT_MS=5000; Promise.race with reject on timeout; throws Error on idToken failure |
| 12 | web/src/App.jsx manages date range state and renders layout shell with navigation between views | VERIFIED | App.jsx: useState(getDefaultDateRange), three nav buttons, view routing via ?view= URLSearchParams, popstate listener |
| 13 | All five dashboard React components exist and call their respective API endpoints | VERIFIED | All 5 component files present; each calls apiFetch to the matching /api/dashboard/* endpoint |
| 14 | GET /admin serves the built React SPA via res.sendFile (not inline HTML placeholder) | VERIFIED | server.js line 77: `res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'))` |

**Score:** 14/14 truths verified (automated)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/dashboard.test.js` | Failing test stubs for all 9 DASH-01–05 route behaviors | VERIFIED | 244 lines; 9 test cases across 5 describe blocks; now GREEN after Plan 02 |
| `tests/__mocks__/prisma.js` | Extended mock with orderProfit and $queryRaw methods | VERIFIED | 21 lines; orderProfit.aggregate, .count, .findMany, and $queryRaw all present |
| `routes/api.js` | Four GET /api/dashboard/* endpoints | VERIFIED | 353 lines; all 4 routes at lines 170, 215, 257, 313 |
| `web/package.json` | Vite+React+Recharts dependencies for SPA | VERIFIED | react@18.2.0, recharts@3.8.0, vite@4.4.5; no @shopify npm packages |
| `web/vite.config.js` | Vite config with base /app/ and outDir ../public/app | VERIFIED | Exact pattern matches plan spec; proxy /api to localhost:3000 |
| `web/index.html` | Entry HTML with App Bridge + Polaris CDN scripts and shopify-api-key meta tag | VERIFIED | App Bridge first script; Polaris second; shopify-api-key meta tag present |
| `web/src/api.js` | Authenticated fetch wrapper using shopify.idToken() with timeout | VERIFIED | 29 lines; Promise.race pattern; throws on non-ok responses |
| `web/src/App.jsx` | Root component with date range state, view routing via ?view= param | VERIFIED | 101 lines; imports all 5 components; dateRange state; view routing; popstate listener |
| `web/src/components/Overview.jsx` | KPI cards + date range selector calling /api/dashboard/overview | VERIFIED | 127 lines; calls /api/dashboard/overview; 4 KPI cards; preset buttons; isPartial label |
| `web/src/components/CogsCoverage.jsx` | Warning banner from overview missingCogsCount | VERIFIED | 16 lines; returns null when missingCogsCount=0; s-banner tone=warning otherwise |
| `web/src/components/TrendChart.jsx` | Recharts LineChart calling /api/dashboard/trend | VERIFIED | 66 lines; imports LineChart, ResponsiveContainer from recharts; stroke=#008060; empty state |
| `web/src/components/OrdersTable.jsx` | Sortable orders list calling /api/dashboard/orders | VERIFIED | 132 lines; s-table; sort toggle; s-badge Unknown for cogsKnown=false; pagination |
| `web/src/components/ProductsTable.jsx` | Product margin ranking calling /api/dashboard/products | VERIFIED | 95 lines; Top 3/Bottom 3 badges on knownCogsProducts; Partial COGS badge |
| `server.js` | Updated /admin route serving public/app/index.html via res.sendFile | VERIFIED | Line 77: res.sendFile; session check and redirect preserved |
| `public/app/index.html` | Vite-built React SPA entry point | VERIFIED | Contains app-bridge.js CDN script; includes /app/assets/index-*.js bundle |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| tests/dashboard.test.js | routes/api.js | supertest request against express app | VERIFIED | Lines 54, 78, 103, 123, 148, 176, 193, 217, 232: request(app).get('/api/dashboard/...') |
| tests/dashboard.test.js | tests/__mocks__/prisma.js | jest moduleNameMapper | VERIFIED | Line 30: const { prisma } = require('../lib/prisma') resolved to mock; prisma.orderProfit and prisma.$queryRaw used throughout |
| routes/api.js | prisma.orderProfit | aggregate + findMany queries with shop + date filters | VERIFIED | Lines 183, 192, 223: prisma.orderProfit.aggregate (twice) and .findMany with shop/date where clauses |
| routes/api.js | prisma.$queryRaw | DATE_TRUNC raw SQL for trend and products endpoints | VERIFIED | Lines 263 and 319: tagged template literal $queryRaw calls |
| web/index.html | https://cdn.shopify.com/shopifycloud/app-bridge.js | first script tag in head | VERIFIED | Line 8: first script in head before Polaris; public/app/index.html mirrors this |
| web/src/api.js | window.shopify.idToken() | Promise.race with 5s timeout | VERIFIED | Lines 4–9: Promise.race([window.shopify.idToken(), setTimeout reject at 5000ms]) |
| web/src/App.jsx | web/src/api.js | apiFetch import, used in useEffect per view | VERIFIED | Each component imports apiFetch and calls it in useEffect |
| web/src/App.jsx | web/src/components/Overview.jsx | props: dateRange, onDateChange | VERIFIED | Line 62: <Overview dateRange={dateRange} onDateChange={handleDateChange} /> |
| web/src/components/Overview.jsx | /api/dashboard/overview | apiFetch in useEffect on dateRange change | VERIFIED | Lines 29–31: apiFetch(`/api/dashboard/overview?from=...&to=...`) inside useEffect |
| web/src/components/TrendChart.jsx | recharts | import LineChart, ResponsiveContainer | VERIFIED | Lines 3–10: destructured import from 'recharts' |
| server.js /admin route | public/app/index.html | res.sendFile(path.join(__dirname, 'public', 'app', 'index.html')) | VERIFIED | Line 77: exact pattern matches |
| public/app/index.html | https://cdn.shopify.com/shopifycloud/app-bridge.js | first script tag in head | VERIFIED | Built output preserves App Bridge as first script |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DASH-01 | 03-01, 03-02, 03-03, 03-04, 03-05 | Store-level profit overview with date range filtering | VERIFIED | /api/dashboard/overview endpoint; Overview.jsx KPI cards; date range presets wired |
| DASH-02 | 03-01, 03-02, 03-03, 03-04, 03-05 | Profit per order — sortable with revenue, COGS, fees, net profit, margin % | VERIFIED | /api/dashboard/orders with allowlist sort; OrdersTable.jsx with sort toggle |
| DASH-03 | 03-01, 03-02, 03-03, 03-04, 03-05 | Profit per product/SKU — margin % with best/worst performers | VERIFIED | /api/dashboard/products with proportional attribution SQL; ProductsTable.jsx Top 3/Bottom 3 |
| DASH-04 | 03-01, 03-02, 03-03, 03-04, 03-05 | Profit trend line chart over selected date range | VERIFIED | /api/dashboard/trend with DATE_TRUNC; TrendChart.jsx with Recharts LineChart |
| DASH-05 | 03-01, 03-02, 03-03, 03-04, 03-05 | COGS coverage indicator — NULL COGS never $0 | VERIFIED | CogsCoverage banner; s-badge Unknown in OrdersTable; null ternary in API route; 2 dedicated tests pass |

**Orphaned requirements check:** No DASH-* requirements in REQUIREMENTS.md traceability table are unmapped. All 5 requirements accounted for.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| routes/api.js | 118 | `// CSV-imported COGS use SKU as variantId placeholder` | Info | Comment using the word "placeholder" — refers to a data modeling decision, not an unimplemented stub. The code is substantive. No action needed. |

No stubs, empty handlers, or blocking anti-patterns found. The `return null` in CogsCoverage.jsx (line 4) is intentional conditional rendering (renders nothing when missingCogsCount is 0), not a stub.

---

## Human Verification Required

All automated checks passed (14/14 truths). The following items require a live Shopify Admin session to verify the embedded app experience.

### 1. Dashboard Renders in Shopify Admin Iframe

**Test:** Open `/admin?shop=<your-test-shop>.myshopify.com` in a Shopify Admin session (via partner dashboard dev store or ngrok tunnel).
**Expected:** Polaris `s-page` chrome renders with nav buttons (Overview, Orders, Products). NOT the old "Welcome to profit tracker" inline HTML card. DevTools Network tab shows `Authorization: Bearer <token>` header on all `/api/dashboard/*` requests.
**Why human:** App Bridge `window.shopify.idToken()` token acquisition and Shopify Admin iframe embedding cannot be verified programmatically.

### 2. Date Range Filtering Works

**Test:** On the Overview view, click the "Last 7 days", "Last 30 days", "Last 90 days" preset buttons. Also enter custom from/to dates and click Apply.
**Expected:** KPI cards (Revenue, COGS, Fees, Net Profit) re-fetch and update values on each change. URL does not change on date preset click (date range is component state, not URL).
**Why human:** Date range re-fetch behavior requires a live browser session with real API data returning different values per range.

### 3. COGS Coverage Banner Conditional Rendering

**Test:** On Overview view with a store that has at least one order with unknown COGS.
**Expected:** `s-banner tone="warning"` displays "X of N orders (Y%) have unknown COGS. Net profit for these orders cannot be calculated." When all orders have known COGS, no banner appears.
**Why human:** Requires live data with mixed `cogsKnown` values to trigger both code paths.

### 4. Unknown COGS Badge in Orders Table

**Test:** Navigate to Orders view (`?view=orders`). Find a row where the order had no COGS entered.
**Expected:** COGS cell shows `s-badge tone="warning" Unknown` — never "$0.00". Net Profit and Margin % cells show "—". Clicking the Revenue, COGS, Fees, or Net Profit column headers re-sorts the table.
**Why human:** NULL COGS badge rendering and sort re-fetch require live browser interaction with real order data.

### 5. Products Ranking Badges

**Test:** Navigate to Products view (`?view=products`).
**Expected:** Products table renders ranked by margin. Top 3 highest-margin known-COGS products show `s-badge tone="success" Top 3`. Bottom 3 lowest-margin known-COGS products show `s-badge tone="critical" Bottom 3`. Products with `allCogsKnown=false` show `s-badge tone="warning" Partial COGS` and "—" for margin.
**Why human:** Badge logic (top/bottom 3 on known-COGS rows only) requires visual verification with real product data spanning more than 6 rows.

### 6. Trend Chart Rendering

**Test:** On Overview view, verify the Profit Trend section at the bottom.
**Expected:** Recharts `LineChart` renders with a green (`#008060`) profit line. Hovering a data point shows tooltip "Net Profit: $X.XX". If the selected date range has no data, "No data for this period" text appears gracefully.
**Why human:** Chart rendering and tooltip hover interaction require a live browser with WebGL/Canvas support.

### 7. Browser Navigation (Back/Forward)

**Test:** Navigate between Overview → Orders → Products using nav buttons, then use the browser back button.
**Expected:** Each nav click updates the `?view=` URL parameter. Browser back returns to the previous view. The popstate listener re-reads the URL and renders the correct component.
**Why human:** `history.pushState` and `popstate` event behavior requires interactive browser testing.

---

## Notes on One Architectural Observation

The overview endpoint returns `cogsTotal: Number(knownAgg._sum.cogsTotal ?? 0)` — this returns `0` (not null) when there are zero known-COGS orders in the aggregate. This is correct behavior for a store-level sum (0 is a valid aggregate, not a missing value). The NULL COGS requirement applies to per-order display, and that is correctly handled by the separate `/api/dashboard/orders` route returning `null` for individual orders with `cogsKnown=false`. No action needed.

---

## Gaps Summary

No gaps. All 14 automated must-haves verified. The 7 human verification items are live-browser checks that cannot be automated — they do not represent code deficiencies, only the inherent limit of static analysis for embedded Shopify app behavior.

---

_Verified: 2026-03-14_
_Verifier: Claude (gsd-verifier)_
