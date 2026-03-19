import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Cell, ResponsiveContainer,
} from 'recharts';

/**
 * computeWaterfallData — pure transform for waterfall bar positioning.
 *
 * @param {Array<{label: string, value: number, type: 'start'|'subtract'|'total'}>} steps
 * @returns {Array<{label, value, barBottom, barTop, type}>}
 */
export function computeWaterfallData(steps) {
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
      // 'total' — closes back to zero, handles negative (loss order)
      barBottom = Math.min(running, 0);
      barTop = Math.max(running, 0);
    }
    return { ...step, barBottom, barTop };
  });
}

function getCellColor(entry) {
  if (entry.type === 'start')    return 'var(--c-revenue)';
  if (entry.type === 'subtract') {
    if (entry.label === 'COGS')      return 'var(--c-cogs)';
    if (entry.label === 'Fees')      return 'var(--c-fees)';
    if (entry.label === 'Shipping')  return 'var(--text-2)';
    if (entry.label === 'Ad Spend')  return 'var(--c-ads)';
  }
  if (entry.type === 'total') {
    return entry.value >= 0 ? 'var(--c-profit)' : 'var(--danger)';
  }
  return 'var(--text-2)';
}

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
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
        {entry.type === 'subtract' ? '\u2212' : ''}{formatCurrency(entry.value)}
      </div>
    </div>
  );
}

export default function WaterfallChart({
  revenueNet, cogsTotal, cogsKnown = true,
  feesTotal, shippingCost, netProfit,
  isPartial = false, missingCogsCount = 0, orderCount = 0,
  adSpend = null
}) {
  // Empty state guard — no chart when no revenue
  if (!revenueNet) {
    return <div className="pt-empty">No data for this period</div>;
  }

  const steps = [];
  steps.push({ label: 'Revenue',  value: revenueNet,    type: 'start'    });
  if (cogsKnown && cogsTotal !== null) {
    steps.push({ label: 'COGS',   value: cogsTotal,     type: 'subtract' });
  }
  steps.push({ label: 'Fees',     value: feesTotal,     type: 'subtract' });
  steps.push({ label: 'Shipping', value: shippingCost,  type: 'subtract' });
  if (adSpend && adSpend > 0) {
    steps.push({ label: 'Ad Spend', value: adSpend, type: 'subtract' });
  }
  if (cogsKnown && netProfit !== null) {
    steps.push({ label: 'Net Profit', value: netProfit, type: 'total'    });
  }

  const data = computeWaterfallData(steps);

  return (
    <div>
      {isPartial && (
        <div className="pt-alert pt-alert-warning" style={{ marginBottom: 12 }}>
          COGS unknown for {missingCogsCount} of {orderCount} orders
          &mdash; net profit may be understated.
        </div>
      )}
      {!cogsKnown && (
        <div className="pt-alert pt-alert-warning" style={{ marginBottom: 12 }}>
          COGS unknown &mdash; net profit cannot be calculated for this order.
        </div>
      )}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#7a8a9e' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(v) =>
                `$${Number(v).toLocaleString('en-US', {
                  notation: 'compact',
                  maximumFractionDigits: 0,
                })}`
              }
              tick={{ fontSize: 11, fill: '#7a8a9e' }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            <Tooltip content={<WaterfallTooltip />} />
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
