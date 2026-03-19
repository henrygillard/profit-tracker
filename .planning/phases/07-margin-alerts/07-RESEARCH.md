# Phase 7: Margin Alerts — Research

**Researched:** 2026-03-18
**Domain:** React UI components, Express API endpoints, Prisma schema migration, browser localStorage persistence
**Confidence:** HIGH — all findings verified against existing codebase; no external library decisions required

---

## Summary

Phase 7 adds proactive margin alerting to the existing profit tracker. The implementation is entirely self-contained within the current stack: a new column on `ShopConfig` stores the threshold, a new API endpoint computes at-risk SKUs by re-using the existing products query SQL, a new `MarginAlertBanner` component shows on the dashboard, and a numeric badge is added to the Products nav tab.

No new npm packages are required. The existing `pt-alert`, `pt-alert-danger`, `pt-badge`, and `pt-badge-danger` CSS classes cover all visual states. The settings screen is a minimal new view added to `App.jsx`'s router — or it can be a lightweight modal, matching the WaterfallModal pattern already established in Phase 6.

The only schema change is adding `marginAlertThreshold` (Decimal, default 20.0) to `ShopConfig`. The margin calculation itself is already implemented and returned by `/api/dashboard/products` (`marginPct` field). The API only needs to filter that result set and return at-risk SKUs.

**Primary recommendation:** Add one column to `ShopConfig`, add one GET + one PUT endpoint (`/api/settings`), add one POST-filter endpoint or extend products query, build `MarginAlertBanner` + settings screen, wire the nav badge into `App.jsx`. Three plans: Wave 0 TDD scaffolds → backend → frontend integration.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ALERT-01 | Dashboard displays a dismissible banner listing all SKUs below threshold, showing product name, current margin %, and configured threshold | Existing `pt-alert pt-alert-danger` classes + new `/api/alerts/margin` endpoint returning at-risk SKUs; dismissal via React `useState` |
| ALERT-02 | Merchant can configure a shop-wide margin alert threshold (default 20%) from a settings screen — stored in the database, persists across sessions | New `marginAlertThreshold` column on `ShopConfig`; GET+PUT `/api/settings` endpoints; no localStorage needed (server-persisted) |
| ALERT-03 | Products with negative margin always display as CRITICAL alert regardless of configured threshold — cannot be suppressed | Backend query uses `OR (marginPct < threshold OR marginPct < 0)` with a separate `isCritical` flag; UI renders critical SKUs with `pt-alert-danger` even if banner is dismissed |
| ALERT-04 | Products nav tab shows a badge with the count of at-risk SKUs | `atRiskCount` returned by `/api/alerts/margin`; passed up to `App.jsx` to render on the "Products" tab button |
</phase_requirements>

---

## Standard Stack

### Core (no new packages needed)

| Library | Version | Purpose | Already In Project |
|---------|---------|---------|-------------------|
| React | 18 (Vite) | Banner + settings UI components | Yes — `web/src/` |
| Express | 4.22 | New API endpoints | Yes — `routes/api.js` |
| Prisma | 5.22 | Schema migration + queries | Yes — `prisma/schema.prisma` |
| Jest + supertest | 29 / 7 | Route + unit tests | Yes — `tests/` |

No new dependencies. All UI patterns already exist in the codebase.

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `prisma migrate dev` | 5.22 | Apply `marginAlertThreshold` column migration | Wave 0 / Plan 1 |
| Babel (`@babel/preset-react`) | Already installed | JSX parsing in Jest (added in Phase 6) | Needed for any new `.jsx` test file |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-persisted threshold (DB) | `localStorage` only | ALERT-02 explicitly says "stored in the database, persists across sessions" — localStorage alone fails requirement |
| New `/api/alerts/margin` endpoint | Extend `/api/dashboard/products` | Separate endpoint is cleaner — products endpoint is already consumed by `ProductsTable` and carries its own sort/filter logic |
| Inline settings panel | Separate `settings` view in router | Modal is lighter; new view is more appropriate for future settings growth (Phase 8 will need OAuth connect/disconnect) |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure Changes

```
routes/
└── api.js            # Add GET /api/settings, PUT /api/settings, GET /api/alerts/margin

web/src/
├── components/
│   ├── MarginAlertBanner.jsx   # NEW — dismissible banner (ALERT-01, ALERT-03)
│   └── SettingsScreen.jsx      # NEW — threshold input UI (ALERT-02)
├── App.jsx           # MODIFY — add 'settings' tab or modal; pass atRiskCount to nav badge
└── styles.css        # MODIFY — add .pt-nav-badge, .pt-alert-critical styles if needed

prisma/
├── schema.prisma     # MODIFY — add marginAlertThreshold to ShopConfig
└── migrations/
    └── 20260318_add_margin_alert_threshold/  # NEW migration
```

### Pattern 1: Settings Persistence via ShopConfig

**What:** Store `marginAlertThreshold` in the existing `ShopConfig` model. GET /api/settings returns the current value; PUT /api/settings updates it.

**When to use:** Any per-shop configuration that must survive browser sessions.

**Example:**
```javascript
// GET /api/settings — returns threshold (and future settings)
router.get('/settings', async (req, res) => {
  const config = await prisma.shopConfig.findFirst({
    where: { shop: req.shopDomain },
    select: { marginAlertThreshold: true },
  });
  return res.json({
    marginAlertThreshold: config?.marginAlertThreshold !== null
      ? Number(config.marginAlertThreshold)
      : 20.0,  // default
  });
});

// PUT /api/settings — updates threshold
router.put('/settings', async (req, res) => {
  const { marginAlertThreshold } = req.body;
  const parsed = parseFloat(marginAlertThreshold);
  if (isNaN(parsed) || parsed < 0 || parsed > 100) {
    return res.status(400).json({ error: 'marginAlertThreshold must be 0–100' });
  }
  await prisma.shopConfig.upsert({
    where: { shop: req.shopDomain },
    update: { marginAlertThreshold: parsed },
    create: { shop: req.shopDomain, marginAlertThreshold: parsed },
  });
  return res.json({ marginAlertThreshold: parsed });
});
```

### Pattern 2: At-Risk SKUs Endpoint

**What:** GET /api/alerts/margin returns the list of SKUs below threshold (or with negative margin), plus the total count for the nav badge.

**When to use:** Called on dashboard load (Overview) and used to drive both the banner and the Products tab badge.

**Key insight:** Reuse the existing `$queryRaw` products SQL from `/api/dashboard/products`, then filter client-side in the route handler. This avoids duplicating the complex JOIN.

**Example:**
```javascript
// Source: extends existing /api/dashboard/products SQL pattern
router.get('/alerts/margin', async (req, res) => {
  const { from, to } = req.query;
  const config = await prisma.shopConfig.findFirst({
    where: { shop: req.shopDomain },
    select: { marginAlertThreshold: true },
  });
  const threshold = config?.marginAlertThreshold !== null
    ? Number(config.marginAlertThreshold)
    : 20.0;

  // Re-use the same raw query as /api/dashboard/products
  const results = await prisma.$queryRaw`
    SELECT
      li.variant_id,
      li.sku,
      MAX(li.product_name) AS product_name,
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
  `;

  const atRisk = results
    .filter(r => r.all_cogs_known)           // Only report when COGS is known
    .map(r => {
      const revenue = Number(r.revenue ?? 0);
      const netProfit = r.net_profit_attr !== null ? Number(r.net_profit_attr) : null;
      const marginPct = revenue && netProfit !== null
        ? (netProfit / revenue) * 100
        : null;
      const isCritical = marginPct !== null && marginPct < 0;
      const isAtRisk = marginPct !== null && (marginPct < threshold || isCritical);
      return {
        variantId: r.variant_id ?? null,
        sku: r.sku ?? null,
        productName: r.product_name ?? null,
        marginPct,
        threshold,
        isCritical,
        isAtRisk,
      };
    })
    .filter(r => r.isAtRisk);

  return res.json({
    threshold,
    atRiskCount: atRisk.length,
    atRiskSkus: atRisk,
  });
});
```

### Pattern 3: Dismissible Banner Component

**What:** `MarginAlertBanner` reads from the `/api/alerts/margin` endpoint; uses React `useState` for local dismiss state. CRITICAL items (negative margin) are always shown — they render separately even if the non-critical banner is dismissed.

**When to use:** Rendered at the top of Overview, below the date bar, above CogsCoverage.

**Example:**
```jsx
// Source: follows CogsCoverage.jsx pattern + existing pt-alert CSS
export default function MarginAlertBanner({ dateRange }) {
  const [dismissed, setDismissed] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    apiFetch(`/api/alerts/margin?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`)
      .then(setData)
      .catch(() => {});
  }, [dateRange?.from, dateRange?.to]);

  if (!data || data.atRiskCount === 0) return null;

  const criticalSkus = data.atRiskSkus.filter(s => s.isCritical);
  const warningSkus  = data.atRiskSkus.filter(s => !s.isCritical);

  return (
    <div>
      {criticalSkus.length > 0 && (
        // ALERT-03: CRITICAL — always shown, cannot be dismissed
        <div className="pt-alert pt-alert-danger" style={{ marginBottom: 8 }}>
          <span className="pt-alert-icon">!</span>
          <span>
            <strong>CRITICAL:</strong> {criticalSkus.length} SKU{criticalSkus.length > 1 ? 's are' : ' is'} losing money on every sale:
            {' '}{criticalSkus.map(s => `${s.productName || s.sku} (${s.marginPct.toFixed(1)}%)`).join(', ')}
          </span>
        </div>
      )}
      {warningSkus.length > 0 && !dismissed && (
        // ALERT-01: Dismissible warning banner
        <div className="pt-alert pt-alert-warning" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <span>
            <strong>{warningSkus.length} SKU{warningSkus.length > 1 ? 's' : ''}</strong> below {data.threshold}% margin threshold:
            {' '}{warningSkus.map(s => `${s.productName || s.sku} (${s.marginPct.toFixed(1)}%)`).join(', ')}
          </span>
          <button onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  );
}
```

### Pattern 4: Nav Badge

**What:** `atRiskCount` is lifted from the `MarginAlertBanner` fetch up to `App.jsx` (via callback prop) and rendered as a numeric pill on the Products tab.

**When to use:** Badge must be visible before the merchant navigates to Products (ALERT-04).

**Approach:** Pass an `onAtRiskCount` callback to `MarginAlertBanner` (or have App.jsx call `/api/alerts/margin` directly). When `atRiskCount > 0`, render a small pill next to the "Products" tab label.

**CSS needed:**
```css
/* New — no existing class covers this */
.pt-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 100px;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  margin-left: 5px;
  line-height: 1;
}
```

### Pattern 5: Settings Screen

**What:** A minimal `SettingsScreen` view (added as a `settings` case in `App.jsx`'s `renderView()`) with a labeled numeric input for the threshold and a Save button.

**When to use:** Accessed via a "Settings" tab in the nav (or via a gear icon button — decide in planning).

**Key insight:** The `settings` view will also host Phase 8's Meta Ads connect/disconnect UI. Make it a proper route (`?view=settings`) now, not a modal, to avoid rework in Phase 8.

**Example:**
```jsx
export default function SettingsScreen() {
  const [threshold, setThreshold] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/api/settings').then(d => setThreshold(d.marginAlertThreshold));
  }, []);

  function handleSave() {
    apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ marginAlertThreshold: threshold }),
    }).then(() => setSaved(true));
  }

  return (
    <div className="pt-card">
      <div className="pt-card-header"><span className="pt-card-title">Settings</span></div>
      <div className="pt-card-body">
        <label>Margin Alert Threshold (%)</label>
        <input type="number" min="0" max="100" step="0.5"
          value={threshold ?? 20}
          onChange={e => { setThreshold(parseFloat(e.target.value)); setSaved(false); }}
        />
        <button onClick={handleSave}>Save</button>
        {saved && <span>Saved</span>}
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Storing threshold in localStorage only:** ALERT-02 requires database persistence. Use localStorage only as an optional UX optimism layer on top of the DB.
- **Filtering products in the frontend:** The at-risk SKU list must come from the backend — the frontend `ProductsTable` component doesn't hold all SKU data across all date ranges.
- **Making CRITICAL items dismissible:** ALERT-03 says negative-margin SKUs "cannot be suppressed." Keep CRITICAL and WARNING as separate UI elements with separate dismiss semantics.
- **Calling `/api/dashboard/products` from the banner:** That endpoint returns all variants sorted by net profit. The alert endpoint needs threshold context (from ShopConfig) — add a dedicated endpoint.
- **NULL coercion for `marginPct`:** SKUs without COGS have `marginPct: null` (already established pattern). Do NOT alert on these — `BOOL_AND(op.cogs_known)` filter is required.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS badge on nav tab | Custom badge from scratch | Extend existing `.pt-badge` pattern with a new `.pt-tab-badge` variant | Badge CSS pattern already established in codebase |
| Alert banner styles | New alert design | Existing `.pt-alert .pt-alert-danger/.pt-alert-warning` classes | Already used by `CogsCoverage` and `WaterfallChart` |
| Per-SKU margin SQL | New SQL from scratch | Re-use `$queryRaw` from `/api/dashboard/products` | Complex 4-table JOIN already working and tested |
| Session persistence | Write/read to `localStorage` | `ShopConfig.marginAlertThreshold` in DB via GET/PUT `/api/settings` | Requirement explicitly says "stored in database" |
| Separate migration tool | Manual SQL | `prisma migrate dev` | Already in the project's workflow |

**Key insight:** 80% of the implementation reuses existing patterns. The only truly new pieces are the SQL filter layer and the two new UI components.

---

## Common Pitfalls

### Pitfall 1: Missing `ShopConfig` upsert (creates vs no row)

**What goes wrong:** A shop that has never had its `ShopConfig` row created (e.g. installed before Phase 5) will cause `findFirst` to return `null`. Attempting `update` instead of `upsert` will throw P2025.

**Why it happens:** `ShopConfig` rows are created during sync, not always during install. Some shops may have the session but no config row.

**How to avoid:** Always use `prisma.shopConfig.upsert` in the PUT endpoint. For GET, return the default (20.0) when `findFirst` returns null.

**Warning signs:** 404/500 errors on `/api/settings` GET for freshly-installed shops.

---

### Pitfall 2: Alerting on SKUs with unknown COGS

**What goes wrong:** A SKU with `allCogsKnown = false` has `marginPct = null`. If the filter isn't guarded, nulls might be treated as 0% and appear as false-positive alerts.

**Why it happens:** `marginPct` is computed as `null` when COGS is unknown (established in Phase 2/3 and repeated throughout the codebase). The products API already handles this correctly; the alert API must mirror it.

**How to avoid:** Filter `WHERE BOOL_AND(op.cogs_known) = true` in SQL (or `.filter(r => r.all_cogs_known)` in JS after query) before computing `marginPct`.

**Warning signs:** SKUs with "Partial COGS" badge in ProductsTable appearing in the alert banner.

---

### Pitfall 3: Dismiss state resets on date range change

**What goes wrong:** When the merchant changes the date range, the banner re-fetches data. If `dismissed` state is held in the same `useEffect` dependency tree, a new fetch might show the banner again even though the merchant dismissed it seconds earlier.

**Why it happens:** `useState(false)` resets on component unmount or re-renders triggered by prop changes.

**How to avoid:** Two options — (a) reset `dismissed` when the at-risk SKU list changes (i.e., store dismissed along with the `atRiskCount` at dismiss time, re-show if count changes), or (b) simpler: reset `dismissed` on every date range change intentionally (the new range might surface different SKUs). The simpler approach is correct UX — a new date range means fresh context. Use `useEffect` to reset `dismissed` when `dateRange` changes.

---

### Pitfall 4: Nav badge causes layout shift

**What goes wrong:** The Products tab label grows wider when the badge appears, causing the tab strip to shift the other tabs.

**Why it happens:** Adding a badge changes the rendered width of the tab button.

**How to avoid:** Render the badge placeholder (`min-width: 0`) when count is 0 and let it grow only when populated, OR use `position: absolute` offset badge (superscript style). Given the compact nav, a superscript absolute badge avoids width changes.

---

### Pitfall 5: The `$queryRaw` BigInt issue

**What goes wrong:** Prisma's `$queryRaw` returns `COUNT(*)` columns as BigInt in Node.js. `Number(bigInt)` is safe for counts under 2^53 — but failing to coerce them causes JSON serialization failures (`BigInt is not serializable`).

**Why it happens:** Already documented in the existing `api.js` (see `/api/dashboard/trend` `Number()` coercions). The alert endpoint must do the same.

**How to avoid:** Coerce all numeric columns with `Number(r.revenue ?? 0)` before returning JSON. Pattern is already established throughout `routes/api.js`.

---

## Code Examples

### Prisma Schema Addition

```prisma
// In ShopConfig model — add marginAlertThreshold column
model ShopConfig {
  // ... existing fields ...
  marginAlertThreshold  Decimal  @default(20) @map("margin_alert_threshold") @db.Decimal(6, 2)
  // ... rest of model ...
}
```

Default of `20` (i.e., 20.00%) matches ALERT-02 requirement.

### Mock Extension for Tests

The Prisma mock (`tests/__mocks__/prisma.js`) needs `shopConfig` to expose the new field. It already has `shopConfig.findFirst` and `shopConfig.upsert` — no structural change needed. Individual tests mock return values inline.

### Test File Pattern (following chart.test.js and dashboard.test.js)

```javascript
// tests/alerts.test.js — new file for Phase 7
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';

const request = require('supertest');
const express = require('express');
const { prisma } = require('../lib/prisma');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', (req, res, next) => {
    req.shopDomain = 'test-shop.myshopify.com';
    next();
  });
  app.use('/api', require('../routes/api'));
  return app;
}

// Tests for GET /api/settings, PUT /api/settings, GET /api/alerts/margin
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Margin display only in ProductsTable | Proactive threshold alerting | Phase 7 | Merchants see problems without navigating away |
| All per-shop config in ShopConfig | Add `marginAlertThreshold` column | Phase 7 | Single source of truth for all shop settings |

**Not deprecated:** Everything from Phases 5–6 remains unchanged. The waterfall chart, fee source logic, and order sync are untouched.

---

## Open Questions

1. **Settings nav entry: new tab or gear icon?**
   - What we know: Current nav has Overview, Orders, Products. Phase 8 will need a settings screen for Meta Ads connect/disconnect.
   - What's unclear: Whether a 4th "Settings" tab or a gear icon (like the existing help "?" button) fits better in the nav.
   - Recommendation: Add a 4th "Settings" tab now. It matches the router pattern already in `App.jsx`, avoids needing to retrofit the nav in Phase 8, and is self-documenting. The existing "?" help button precedent shows small icon buttons work for utility actions, but Settings with growing content deserves a tab.

2. **Date range scope for alert evaluation**
   - What we know: The requirements say "SKU's margin has fallen below threshold." The products endpoint is always date-range-filtered.
   - What's unclear: Should alerts always use the currently selected date range, or a fixed recent window (e.g., always last 30 days)?
   - Recommendation: Use the currently selected date range (passed as `from`/`to` query params to `/api/alerts/margin`). This is consistent with how Overview and ProductsTable work. The merchant controls the context via the date bar.

3. **At-risk count data flow: lift to App or duplicate fetch?**
   - What we know: The nav badge (ALERT-04) must show the count before the merchant navigates to Products. `MarginAlertBanner` fetches this data. `App.jsx` renders the nav.
   - What's unclear: Whether to lift state from banner to App or have App do a separate fetch.
   - Recommendation: Pass an `onAtRiskCount(n)` callback prop from `App.jsx` to `MarginAlertBanner`. The banner already fetches the data; it calls the callback with `data.atRiskCount` after fetch. This avoids a second API call. The planner should model this explicitly in the task for Plan 07-03.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 + supertest 7 |
| Config file | `/Users/henry/code/profit-tracker/jest.config.js` |
| Quick run command | `jest tests/alerts.test.js --no-coverage` |
| Full suite command | `jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALERT-01 | GET /api/alerts/margin returns atRiskSkus below threshold | unit (route) | `jest tests/alerts.test.js -t "ALERT-01"` | Wave 0 |
| ALERT-02 | GET /api/settings returns threshold (default 20); PUT persists it | unit (route) | `jest tests/alerts.test.js -t "ALERT-02"` | Wave 0 |
| ALERT-03 | negative margin SKUs appear in atRiskSkus with isCritical=true | unit (route) | `jest tests/alerts.test.js -t "ALERT-03"` | Wave 0 |
| ALERT-04 | atRiskCount field present in GET /api/alerts/margin response | unit (route) | `jest tests/alerts.test.js -t "ALERT-04"` | Wave 0 |

All route tests follow `dashboard.test.js` pattern: `supertest` + mock JWT middleware + `prisma` mock.

UI behaviors (dismissal, badge render, settings save) are verified by human checkpoint at the end of Plan 07-03 (consistent with how CHART-01..04 were verified in Phase 6).

### Sampling Rate

- **Per task commit:** `jest tests/alerts.test.js --no-coverage`
- **Per wave merge:** `jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/alerts.test.js` — covers ALERT-01 through ALERT-04 (new file, Wave 0 task)
- [ ] Prisma migration file `prisma/migrations/20260318_add_margin_alert_threshold/migration.sql` — needed for schema change
- [ ] No new framework install needed (Jest + supertest already present)

---

## Sources

### Primary (HIGH confidence)

- Existing codebase — `routes/api.js` (all endpoint patterns, `$queryRaw`, BigInt handling)
- Existing codebase — `prisma/schema.prisma` (ShopConfig model, migration pattern)
- Existing codebase — `web/src/styles.css` (`.pt-alert`, `.pt-badge`, `.pt-tab` classes)
- Existing codebase — `web/src/components/CogsCoverage.jsx` (alert banner component pattern)
- Existing codebase — `web/src/App.jsx` (nav tab rendering, router pattern, `renderView()`)
- Existing codebase — `tests/__mocks__/prisma.js` (mock structure for `shopConfig`)
- Existing codebase — `tests/dashboard.test.js` (test file pattern for new route tests)
- `.planning/REQUIREMENTS.md` — ALERT-01 through ALERT-04 verbatim requirements

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — established patterns from Phases 5–6 (upsert behavior, BigInt coercion, portal pattern)

### Tertiary (LOW confidence)

- None. All findings are verified against the live codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all from existing dependencies
- Architecture: HIGH — all patterns directly from existing code in the same project
- Pitfalls: HIGH — derived from documented decisions in STATE.md and direct code inspection
- SQL correctness: MEDIUM — `$queryRaw` pattern is established and working; new filter clause is straightforward but should be integration-tested against real DB

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable stack; no external API dependencies in this phase)
