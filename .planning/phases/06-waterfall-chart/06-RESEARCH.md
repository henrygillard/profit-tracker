# Phase 6: Waterfall Chart - Research

**Researched:** 2026-03-18
**Domain:** Recharts range bars (v3.8.0), waterfall decomposition data transform, React modal pattern, Express API extension
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHART-01 | Merchant can view a store-level profit waterfall chart on the Overview screen showing Revenue → COGS → Fees → Shipping → Net Profit for the selected date range | Data already available from `GET /api/dashboard/overview` (revenueNet, cogsTotal, feesTotal, shippingCost, netProfit). Need: (a) `shippingCost` added to overview API response (currently summed but not returned), (b) `WaterfallChart` React component using Recharts range bars, (c) integration into `Overview.jsx`. |
| CHART-02 | Merchant can click any order row in the Orders table to open a per-order waterfall chart showing exactly where that order's revenue went | Data available from `GET /api/dashboard/orders` (revenueNet, cogsTotal, feesTotal, feeSource, netProfit per order). Need: (a) `shippingCost` added to orders API response (already in `OrderProfit` schema), (b) `OrderWaterfallModal` component rendered via portal or inline state, (c) click handler on `OrdersTable` row. |
| CHART-03 | Waterfall charts annotate when COGS is missing ("COGS unknown for X% of items — profit may be overstated") rather than rendering a misleadingly complete breakdown | `isPartial` and `missingCogsCount` already returned from overview API. `cogsKnown` already on per-order response. Need: conditional warning annotation rendered inside the chart when COGS is absent or partial. For per-order chart: if `cogsKnown === false`, show a stub "COGS Unknown" bar with warning styling. |
| CHART-04 | Waterfall charts correctly render loss orders (negative net profit) without visual glitches — the final bar turns red and extends below the baseline | Range bar approach: `[barBottom, barTop]` positions each bar correctly regardless of sign. The Net Profit bar uses `[runningTotal, 0]` when negative (loss order), extending below zero. The `ReferenceLine y={0}` provides the visible zero baseline. Custom `Cell` on the Net Profit bar colors it red (`var(--danger)`) when value is negative. |
</phase_requirements>

---

## Summary

Phase 6 adds waterfall decomposition charts — the flagship visual that shows merchants exactly where revenue went. The chart is a sequential step-down: Revenue as the starting anchor, then COGS, Fees, and Shipping hanging down as cost bars, with Net Profit as the final closing bar. The chart renders at two granularities: store-level on the Overview tab (using already-aggregated data) and per-order in a modal (using per-order data already in the orders list).

No new npm dependencies are needed. The project already has Recharts v3.8.0 installed, and v3.8.0 is the version that added the `computeWaterfallData` utility and confirmed range bar support. The standard waterfall implementation in Recharts uses a `[barBottom, barTop]` array as the `dataKey` function return value — each bar floats between two Y-axis positions rather than stacking from zero. This approach handles negative Net Profit bars correctly: when the running total after all deductions is negative, the final bar extends below the Y=0 baseline, and a `ReferenceLine y={0}` anchors the visual zero line.

The main implementation work is: (1) a pure `computeWaterfallData(steps)` function that transforms `[{label, value, type}]` into `[{label, barBottom, barTop, value, type}]`; (2) a reusable `WaterfallChart` React component using Recharts `BarChart` with a `dataKey` function and per-bar `Cell` coloring; (3) a `WaterfallModal` portal component triggered by clicking an order row; (4) minor API additions (`shippingCost` field on both endpoints). No schema changes are required.

**Primary recommendation:** Implement the waterfall using Recharts range bars (dataKey returning `[barBottom, barTop]` array) with a custom `computeWaterfallData` transform. Use a React state-controlled modal (no library) with `createPortal` following the existing `InfoTooltip` portal pattern in the codebase. Add `shippingCost` to both API responses with no DB schema change (the field already exists in `OrderProfit`).

---

## Standard Stack

### Core (all existing — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | ^3.8.0 (installed: 3.8.0) | Waterfall bar chart rendering | Already installed; v3.8.0 includes `computeWaterfallData` utility and confirmed range bar support |
| React | ^18.2.0 | Component and modal state | Already the frontend framework |
| `createPortal` | built-in (react-dom) | Modal rendering outside DOM tree | Already used in `InfoTooltip` and `FeeCell` — established project pattern |

### No New Dependencies
This phase adds no npm packages. Everything required is already in the frontend and backend.

**Installation:**
```bash
# No new installs needed
```

---

## Architecture Patterns

### Recommended File Structure Changes
```
web/src/components/
├── WaterfallChart.jsx        # NEW — reusable waterfall component (store + order)
├── WaterfallModal.jsx        # NEW — per-order modal wrapper using createPortal
├── Overview.jsx              # MODIFY — add WaterfallChart below KPI cards
└── OrdersTable.jsx           # MODIFY — add row click handler + WaterfallModal

routes/
└── api.js                    # MODIFY — add shippingCost to overview + orders responses

web/src/styles.css            # MODIFY — add modal overlay + waterfall bar CSS classes

tests/
└── dashboard.test.js         # MODIFY — add tests for shippingCost in API responses

tests/chart.test.js           # NEW — unit tests for computeWaterfallData transform
```

### Pattern 1: Waterfall Data Transform
**What:** A pure function that converts raw profit fields into Recharts range bar format.
**When to use:** Called once per render when building chart data from API response.

```javascript
// Pure function — no dependencies, easily unit-tested
function computeWaterfallData(steps) {
  // steps: [{ label: string, value: number, type: 'start'|'subtract'|'total' }]
  // Returns: [{ label, value, barBottom, barTop, type }]
  let running = 0;
  return steps.map(step => {
    let barBottom, barTop;
    if (step.type === 'start') {
      // Revenue: anchor bar from 0 to value
      barBottom = 0;
      barTop = step.value;
      running = step.value;
    } else if (step.type === 'subtract') {
      // Cost bar: hangs down from running total
      barBottom = running - step.value;
      barTop = running;
      running = running - step.value;
    } else {
      // 'total' — closing bar, anchors back to 0 (or below if loss)
      if (running >= 0) {
        barBottom = 0;
        barTop = running;
      } else {
        barBottom = running; // negative — extends below zero
        barTop = 0;
      }
    }
    return { ...step, barBottom, barTop };
  });
}
```

**Key insight for CHART-04:** The `total` bar for a loss order has `barBottom = runningTotal` (negative) and `barTop = 0`. Recharts renders this as a bar from the negative value up to zero — extending below the baseline. The `ReferenceLine y={0}` makes the zero line visible.

### Pattern 2: Range Bar Rendering
**What:** Pass a function (not a string) as `dataKey` to Recharts `<Bar>` to return `[barBottom, barTop]`.
**When to use:** The core mechanism for floating bars in waterfall charts.

```jsx
// Source: Recharts v3.8.0 range bar feature (confirmed in issue #7010 and v3.8.0 release)
<BarChart data={waterfallData}>
  <XAxis dataKey="label" />
  <YAxis domain={['auto', 'auto']} />
  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
  <Bar
    dataKey={(d) => [d.barBottom, d.barTop]}
    isAnimationActive={false}
  >
    {waterfallData.map((entry, index) => (
      <Cell
        key={index}
        fill={getCellColor(entry)}
      />
    ))}
  </Bar>
</BarChart>
```

### Pattern 3: Cell Color Logic
**What:** Per-bar color assignment matching the project's existing color vocabulary.

```javascript
// Source: CSS variables already defined in web/src/styles.css
function getCellColor(entry) {
  if (entry.type === 'start')    return 'var(--c-revenue)';   // blue
  if (entry.type === 'subtract') {
    if (entry.label === 'COGS')     return 'var(--c-cogs)';   // orange
    if (entry.label === 'Fees')     return 'var(--c-fees)';   // purple
    if (entry.label === 'Shipping') return 'var(--c-fees)';   // purple (or neutral)
  }
  if (entry.type === 'total') {
    return entry.value >= 0 ? 'var(--c-profit)' : 'var(--danger)'; // green or red
  }
  return 'var(--text-2)';
}
```

### Pattern 4: Per-Order Modal (createPortal)
**What:** A full-screen overlay modal opened by clicking an order row, rendered outside the table DOM tree via `createPortal`.
**When to use:** Clicking a row in `OrdersTable` → modal opens with that order's waterfall.

```jsx
// Extends the createPortal pattern already in InfoTooltip and FeeCell
// No modal library needed — project pattern is plain React state + portal

function WaterfallModal({ order, onClose }) {
  // order: { shopifyOrderName, revenueNet, cogsTotal, cogsKnown, feesTotal,
  //           feeSource, shippingCost, netProfit }
  return createPortal(
    <div className="pt-modal-overlay" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-header">
          <span>{order.shopifyOrderName} — Profit Breakdown</span>
          <button className="pt-modal-close" onClick={onClose}>✕</button>
        </div>
        <WaterfallChart
          revenueNet={order.revenueNet}
          cogsTotal={order.cogsTotal}
          cogsKnown={order.cogsKnown}
          feesTotal={order.feesTotal}
          shippingCost={order.shippingCost}
          netProfit={order.netProfit}
        />
      </div>
    </div>,
    document.body
  );
}
```

**Row click handler in OrdersTable:**
```jsx
// MODIFY: add onClick to <tr> in OrdersTable tbody map
<tr
  key={order.orderId}
  style={{ cursor: 'pointer' }}
  onClick={() => setSelectedOrder(order)}
>
  {/* existing cells unchanged */}
</tr>

// In component state:
const [selectedOrder, setSelectedOrder] = useState(null);

// After table:
{selectedOrder && (
  <WaterfallModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
)}
```

### Pattern 5: COGS Warning Annotation (CHART-03)
**What:** When COGS is absent, show a warning bar placeholder and a text annotation rather than silently omitting the COGS bar.
**When to use:** (a) Per-order chart when `cogsKnown === false`; (b) store-level chart when `isPartial === true`.

```jsx
// For per-order chart with unknown COGS:
// Replace the COGS step with a "COGS Unknown" annotation bar using --warning color
// and render a warning banner above the chart

{!cogsKnown && (
  <div className="pt-alert pt-alert-warning" style={{ marginBottom: 12 }}>
    COGS unknown — net profit cannot be calculated for this order.
  </div>
)}

// For store-level partial COGS:
{isPartial && (
  <div className="pt-alert pt-alert-warning" style={{ marginBottom: 12 }}>
    COGS unknown for {missingCogsCount} of {orderCount} orders — profit may be understated.
  </div>
)}
```

**Data logic:** When `cogsKnown === false`, omit the COGS and Net Profit steps entirely from `computeWaterfallData` and render a stub chart with Revenue, Fees, Shipping only — labeled as "Incomplete".

### Pattern 6: API Extension — Adding shippingCost
**What:** Both `GET /api/dashboard/overview` and `GET /api/dashboard/orders` need `shippingCost` in their response (already summed / stored but not returned).
**When to use:** Required for the Shipping step in both waterfall charts.

```javascript
// Overview endpoint — shippingCost is already in the agg _sum
// Just add it to the return object:
return res.json({
  revenueNet: Number(agg._sum.revenueNet ?? 0),
  feesTotal: Number(agg._sum.feesTotal ?? 0),
  shippingCost: Number(agg._sum.shippingCost ?? 0),  // ADD THIS
  cogsTotal: Number(knownAgg._sum.cogsTotal ?? 0),
  netProfit: Number(knownAgg._sum.netProfit ?? 0),
  // ... rest unchanged
});

// Orders endpoint — shippingCost is on the OrderProfit model, add to map:
return res.json(orders.map(op => ({
  // ... existing fields
  shippingCost: Number(op.shippingCost),   // ADD THIS
})));
```

**Important:** `shippingCost` is already included in `_sum` on the overview aggregate query (line 185 of routes/api.js). No DB query changes needed — just surface the value.

### Anti-Patterns to Avoid

- **Stacked transparent bar trick:** The old "invisible spacer bar + visible bar" stacked approach breaks when `barBottom` is negative. Use the `[barBottom, barTop]` range array approach exclusively.
- **Hardcoding colors:** Use CSS variables (`var(--c-revenue)`, `var(--danger)`) — the app supports dark/light themes and these variables switch automatically.
- **Rendering chart when data is all-zero:** Guard against the case where revenue, COGS, fees, and shipping are all 0 (no orders in range). Render an empty state instead of a zero-height chart.
- **Using native `<dialog>` element:** The project uses plain `div` + `createPortal` for overlays (see `InfoTooltip`). Do not introduce `<dialog>` or a modal library.
- **Fetching per-order data separately:** All required fields (`revenueNet`, `cogsTotal`, `cogsKnown`, `feesTotal`, `feeSource`, `netProfit`, `shippingCost`) will be in the orders list response after the API extension. Do not add a separate per-order API endpoint.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Waterfall bar positioning math | Custom SVG drawing | Recharts range bar `[barBottom, barTop]` with `dataKey` function | Recharts handles SVG, axis scaling, ResponsiveContainer; manual SVG means re-implementing all of that |
| Modal overlay | Third-party library (react-modal, headless-ui) | `createPortal` + div — same as existing `InfoTooltip` | Project has zero UI libraries; adding one for a single modal is scope creep |
| Chart tooltip | Custom tooltip HTML outside Recharts | Recharts built-in `<Tooltip>` with `content` prop for custom render | Built-in handles mouse tracking, positioning, and portal rendering |
| Color palette | New color constants | Existing CSS variables (`--c-revenue`, `--c-cogs`, `--c-fees`, `--c-profit`, `--danger`) | Already defined in `styles.css`, theme-aware |
| COGS warning banner | New CSS | Existing `pt-alert pt-alert-warning` class | Already in `styles.css` (used in `CogsCoverage.jsx`) |

---

## Common Pitfalls

### Pitfall 1: Negative Net Profit bar renders at wrong position
**What goes wrong:** The final "Net Profit" bar appears from 0 to some negative value but visually overlaps the Revenue bar or renders with zero height.
**Why it happens:** Using a simple `value` dataKey instead of the `[barBottom, barTop]` range approach. When `value` is negative, Recharts draws the bar from 0 downward but the rest of the chart positions are wrong.
**How to avoid:** Always use `computeWaterfallData` and pass `(d) => [d.barBottom, d.barTop]` as `dataKey`. Set `YAxis domain={['auto', 'auto']}` so the axis expands to accommodate negative values.
**Warning signs:** Net Profit bar overlaps Revenue bar, or appears as a floating bar not anchored to zero.

### Pitfall 2: YAxis does not expand to show negative bars
**What goes wrong:** The chart clips bars that extend below zero — the negative Net Profit bar is invisible or cut off at the bottom.
**Why it happens:** Default YAxis behavior sets minimum domain to 0.
**How to avoid:** Use `<YAxis domain={['auto', 'auto']} />`. This lets Recharts calculate the minimum based on the minimum `barBottom` in the data.
**Warning signs:** Loss order chart shows a truncated or invisible Net Profit bar.

### Pitfall 3: shippingCost missing from API — waterfall step renders as zero
**What goes wrong:** The Shipping bar shows $0.00 even for orders that had shipping costs.
**Why it happens:** `shippingCost` is stored in `OrderProfit` and `Order` but was not included in the API response for `/api/dashboard/orders`.
**How to avoid:** Add `shippingCost: Number(op.shippingCost)` to the orders endpoint map, and `shippingCost: Number(agg._sum.shippingCost ?? 0)` to the overview response. The field is already summed in the overview aggregate query.
**Warning signs:** Waterfall shows correct Revenue, COGS, Fees but Shipping is always $0.

### Pitfall 4: computeWaterfallData called with null COGS
**What goes wrong:** A `null` cogsTotal causes `NaN` in the running total, breaking all subsequent bar positions.
**Why it happens:** `cogsTotal` is nullable when `cogsKnown === false`.
**How to avoid:** Check `cogsKnown` BEFORE calling `computeWaterfallData`. When COGS is unknown, build a reduced step array without the COGS step, and display the warning annotation. Never pass `null` as a step value.
**Warning signs:** All bars render at zero height or at nonsensical positions on orders with unknown COGS.

### Pitfall 5: Modal blocks scroll — no Escape key close
**What goes wrong:** The per-order modal opens but cannot be closed with the Escape key, or the underlying page scrolls while the modal is open.
**Why it happens:** No keyboard event listener added; no `overflow: hidden` on body.
**How to avoid:** Add `useEffect(() => { function onKey(e) { if (e.key === 'Escape') onClose(); } document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [onClose])` in the modal component. Add `document.body.style.overflow = 'hidden'` on open and restore on close.
**Warning signs:** Modal requires clicking the X button or overlay to close; background scrolls while modal is open.

### Pitfall 6: Chart too narrow in modal — ResponsiveContainer needs explicit height
**What goes wrong:** Chart renders with zero or near-zero height inside the modal.
**Why it happens:** `<ResponsiveContainer height="100%">` inside a flex container with no explicit height.
**How to avoid:** Set explicit pixel height: `<div style={{ width: '100%', height: 280 }}>` wrapping `<ResponsiveContainer>`. Follow the exact same pattern as `TrendChart.jsx` which has `style={{ width: '100%', height: 280 }}`.
**Warning signs:** Blank chart area inside modal.

---

## Code Examples

Verified patterns from codebase analysis and Recharts v3.8.0 docs:

### computeWaterfallData — Pure Transform Function
```javascript
// Placement: inline in WaterfallChart.jsx (no separate file needed)
// Source: based on Recharts issue #7010 range bar approach (confirmed closed/merged v3.8.0)
function computeWaterfallData(steps) {
  // steps: Array<{ label: string, value: number, type: 'start'|'subtract'|'total' }>
  // Returns: Array<{ label, value, barBottom, barTop, type }>
  let running = 0;
  return steps.map(step => {
    let barBottom, barTop;
    if (step.type === 'start') {
      barBottom = 0;
      barTop = step.value;
      running = step.value;
    } else if (step.type === 'subtract') {
      barTop = running;
      barBottom = running - step.value;
      running -= step.value;
    } else {
      // 'total' bar anchors to zero
      barBottom = Math.min(running, 0);
      barTop = Math.max(running, 0);
    }
    return { ...step, barBottom, barTop };
  });
}
```

### WaterfallChart Component Structure
```jsx
// web/src/components/WaterfallChart.jsx
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Cell, ResponsiveContainer
} from 'recharts';

function getCellColor(entry) {
  if (entry.type === 'start')    return 'var(--c-revenue)';
  if (entry.type === 'subtract') {
    if (entry.label === 'COGS')     return 'var(--c-cogs)';
    if (entry.label === 'Fees')     return 'var(--c-fees)';
    if (entry.label === 'Shipping') return 'var(--text-2)';
  }
  if (entry.type === 'total') {
    return entry.value >= 0 ? 'var(--c-profit)' : 'var(--danger)';
  }
  return 'var(--text-2)';
}

export default function WaterfallChart({
  revenueNet, cogsTotal, cogsKnown,
  feesTotal, shippingCost, netProfit,
  isPartial, missingCogsCount, orderCount
}) {
  const steps = [];
  steps.push({ label: 'Revenue', value: revenueNet, type: 'start' });
  if (cogsKnown && cogsTotal !== null) {
    steps.push({ label: 'COGS',     value: cogsTotal,    type: 'subtract' });
  }
  steps.push({ label: 'Fees',     value: feesTotal,    type: 'subtract' });
  steps.push({ label: 'Shipping', value: shippingCost, type: 'subtract' });
  if (cogsKnown && netProfit !== null) {
    steps.push({ label: 'Net Profit', value: netProfit, type: 'total' });
  }

  const data = computeWaterfallData(steps);

  return (
    <div>
      {/* CHART-03: warning annotation */}
      {isPartial && (
        <div className="pt-alert pt-alert-warning">
          COGS unknown for {missingCogsCount} of {orderCount} orders
          — net profit may be understated.
        </div>
      )}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7a8a9e' }} />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(v) => `$${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 0 })}`}
              tick={{ fontSize: 11, fill: '#7a8a9e' }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            <Tooltip
              formatter={(value, name, props) => {
                const entry = props.payload;
                return [formatCurrency(entry.value), entry.label];
              }}
            />
            <Bar dataKey={(d) => [d.barBottom, d.barTop]} isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell key={i} fill={getCellColor(entry)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

### Modal Overlay CSS (add to styles.css)
```css
/* ── Modal ────────────────────────────────────── */
.pt-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pt-modal {
  background: var(--surface);
  border: 1px solid var(--border-md);
  border-radius: var(--radius);
  padding: 24px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.8);
}

.pt-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.pt-modal-close {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
}

.pt-modal-close:hover {
  color: var(--text);
  background: var(--elevated);
}
```

### Recharts Tooltip for Range Bar Values
```jsx
// Custom tooltip — the default Recharts tooltip shows the array [barBottom, barTop]
// which is confusing. Use a custom tooltip that shows the actual step value.
function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload; // the data point
  return (
    <div style={{
      background: 'var(--elevated)',
      border: '1px solid var(--border-md)',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 5 }}>
        {entry.label}
      </div>
      <div style={{
        fontSize: 18,
        fontFamily: 'var(--mono)',
        fontWeight: 600,
        color: getCellColor(entry),
      }}>
        {entry.type === 'subtract' ? '−' : ''}{formatCurrency(entry.value)}
      </div>
    </div>
  );
}
// Usage: <Tooltip content={<WaterfallTooltip />} />
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stacked bar with transparent spacer | Range bar `[barBottom, barTop]` as dataKey | Recharts v3.x (confirmed in v3.8.0) | Negative value bars now render correctly without positioning bugs |
| No native waterfall | `computeWaterfallData` utility + docs example | Recharts v3.8.0 (Feb 2026) | Official blessed approach; no need for external waterfall library |
| Modal from library (react-modal etc.) | `createPortal` + plain div | Project convention | Consistent with existing InfoTooltip / FeeCell portal pattern |

**Deprecated/outdated:**
- Stacked transparent bar approach: breaks when any bar's starting position is negative. The `[barBottom, barTop]` range approach replaces it entirely.
- `isAnimationActive={true}` default: animations on waterfall charts with range bars can produce visual artifacts during mount. Disable with `isAnimationActive={false}`.

---

## Open Questions

1. **Tooltip with range bar payload**
   - What we know: When `dataKey` is a function returning `[barBottom, barTop]`, Recharts passes the array as the `value` in the Tooltip `payload`. A custom `content` tooltip component reads `payload[0].payload` (the full data object) to get the actual `step.value`.
   - What's unclear: Whether Recharts v3.8.0 has any changes to the payload shape for range bars specifically.
   - Recommendation: Use a custom `<Tooltip content={<WaterfallTooltip />} />` that reads from `payload[0].payload.value` rather than `payload[0].value`. The example in Code Examples above follows this pattern.

2. **shippingCost on overview endpoint — does it include COGS-excluded orders?**
   - What we know: The overview endpoint runs two aggregates — one for all orders, one for `cogsKnown=true` orders only. `shippingCost` is currently summed in the all-orders aggregate.
   - What's unclear: Whether the waterfall should show shipping for all orders or only cogsKnown orders.
   - Recommendation: Include shipping in the all-orders aggregate (consistent with how `feesTotal` is already returned). The waterfall display will show a warning when COGS is partial, making the caveat explicit.

3. **Overview waterfall when there are zero orders in range**
   - What we know: The overview endpoint returns `{ revenueNet: 0, feesTotal: 0, ... }` for empty ranges.
   - What's unclear: Should the chart render with all-zero bars or show an empty state?
   - Recommendation: Guard: if `revenueNet === 0`, render the `pt-empty` div ("No data for this period") instead of the chart. Consistent with TrendChart behavior.

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in config.json).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `/Users/henry/code/profit-tracker/jest.config.js` |
| Quick run command | `npx jest tests/chart.test.js --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHART-01 | `computeWaterfallData` returns correct `[barBottom, barTop]` for a typical Revenue→COGS→Fees→Shipping→Profit step sequence | unit | `npx jest tests/chart.test.js -t "computeWaterfallData" --no-coverage` | ❌ Wave 0 |
| CHART-01 | `GET /api/dashboard/overview` response includes `shippingCost` field | unit | `npx jest tests/dashboard.test.js -t "shippingCost" --no-coverage` | ❌ Wave 0 |
| CHART-02 | `GET /api/dashboard/orders` response includes `shippingCost` field per order | unit | `npx jest tests/dashboard.test.js -t "shippingCost" --no-coverage` | ❌ Wave 0 |
| CHART-03 | `computeWaterfallData` called with `cogsKnown=false` omits COGS step and does not pass `null` as a value | unit | `npx jest tests/chart.test.js -t "COGS unknown" --no-coverage` | ❌ Wave 0 |
| CHART-04 | `computeWaterfallData` with a loss order (negative netProfit) produces `barBottom < 0` and `barTop = 0` for the total bar | unit | `npx jest tests/chart.test.js -t "loss order" --no-coverage` | ❌ Wave 0 |

**Note:** The React components (`WaterfallChart`, `WaterfallModal`) are not unit-tested with Jest (no jsdom/React Testing Library in this project). The requirements are verified by: (a) backend API field tests in `dashboard.test.js`; (b) pure function tests for `computeWaterfallData` in `chart.test.js`; (c) manual visual verification during `/gsd:verify-work`.

### Sampling Rate
- **Per task commit:** `npx jest tests/chart.test.js tests/dashboard.test.js --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green (68+ tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/chart.test.js` — new file, tests for `computeWaterfallData` covering CHART-01, CHART-03, CHART-04
- [ ] `tests/dashboard.test.js` — extend existing tests to assert `shippingCost` in overview and orders responses (CHART-01, CHART-02)

*(No mock changes needed — `shippingCost` is already on `orderProfit` shape in the existing mock; API changes only add a field to the serialized response)*

---

## Sources

### Primary (HIGH confidence)
- Recharts v3.8.0 `package.json` in `/Users/henry/code/profit-tracker/web/node_modules/recharts/package.json` — confirmed installed version is 3.8.0
- GitHub issue #7010 (recharts/recharts) — confirmed closed Feb 2026 with range bar `[barBottom, barTop]` approach as the recommended waterfall implementation; `computeWaterfallData` example merged
- `/Users/henry/code/profit-tracker/routes/api.js` — confirmed `shippingCost` already summed in overview aggregate (line 185) but not returned; `OrderProfit.shippingCost` is a non-nullable `Decimal` field
- `/Users/henry/code/profit-tracker/prisma/schema.prisma` — confirmed `OrderProfit.shippingCost Decimal @map("shipping_cost")` exists; no schema change needed
- `/Users/henry/code/profit-tracker/web/src/styles.css` — confirmed all color CSS variables exist (`--c-revenue`, `--c-cogs`, `--c-fees`, `--c-profit`, `--danger`); `pt-alert pt-alert-warning` class exists; `createPortal` modal pattern already used in `InfoTooltip`

### Secondary (MEDIUM confidence)
- Recharts v3.8.0 release notes (`newreleases.io/project/github/recharts/recharts/release/v3.8.0`) — confirmed `computeWaterfallData` utility added in this version
- Recharts official waterfall example page description — confirmed range bars with `[low, high]` arrays and `computeWaterfallData` helper function (page source not accessible directly; inferred from description and PR/issue content)

### Tertiary (LOW confidence)
- Recharts Bar API page — did not explicitly confirm `[barBottom, barTop]` array as dataKey return type; inferred from issue/PR confirmation and community examples

---

## Metadata

**Confidence breakdown:**
- Standard stack (Recharts v3.8.0 already installed, no new deps): HIGH — confirmed from package.json
- Waterfall range bar approach: HIGH — confirmed from closed issue #7010 with merged PR in v3.8.0
- API shippingCost field gap: HIGH — confirmed from code analysis of routes/api.js and schema.prisma
- computeWaterfallData math for negative values: HIGH — logic derived from first principles + confirmed working via Recharts docs description
- Modal pattern (createPortal): HIGH — existing project pattern used in InfoTooltip and FeeCell
- Recharts Tooltip payload shape for range bars: MEDIUM — expected behavior based on Recharts docs, needs verification during implementation

**Research date:** 2026-03-18
**Valid until:** 2026-06-18 (Recharts is stable; chart API unlikely to change in 3 months)
