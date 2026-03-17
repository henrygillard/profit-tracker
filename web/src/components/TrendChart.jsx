import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '../api.js';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const isNeg = value < 0;
  return (
    <div style={{
      background: 'var(--elevated)',
      border: '1px solid var(--border-md)',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font)', letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div style={{
        fontSize: 18,
        fontFamily: 'var(--mono)',
        fontWeight: 600,
        color: isNeg ? 'var(--danger)' : 'var(--c-profit)',
        letterSpacing: '-0.02em',
      }}>
        ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

export default function TrendChart({ dateRange }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    apiFetch(
      `/api/dashboard/trend?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`
    )
      .then((result) => { setData(result); setLoading(false); })
      .catch((err) => { setError(err.message || 'Could not load trend data.'); setLoading(false); });
  }, [dateRange?.from, dateRange?.to]);

  return (
    <div className="pt-card">
      <div className="pt-card-header">
        <span className="pt-card-title">Profit Trend</span>
      </div>
      <div className="pt-card-body" style={{ paddingTop: 16 }}>
        {loading && <div className="pt-loading">Loading chart…</div>}
        {error && <div className="pt-error-msg">{error}</div>}
        {!loading && !error && data.length === 0 && (
          <div className="pt-empty">No data for this period</div>
        )}
        {!loading && !error && data.length > 0 && (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00e5a0" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#00e5a0" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#7a8a9e', fontFamily: "'Outfit', sans-serif" }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  tickFormatter={(v) => `$${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 0 })}`}
                  tick={{ fontSize: 11, fill: '#7a8a9e', fontFamily: "'Outfit', sans-serif" }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="netProfit"
                  stroke="#00e5a0"
                  strokeWidth={2}
                  fill="url(#profitGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#00e5a0', stroke: 'var(--bg)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
