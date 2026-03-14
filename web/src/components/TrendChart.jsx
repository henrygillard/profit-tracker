import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '../api.js';

export default function TrendChart({ dateRange }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dateRange || !dateRange.from || !dateRange.to) return;

    setLoading(true);
    setError(null);

    apiFetch(
      `/api/dashboard/trend?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`
    )
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Could not load trend data. Reload to try again.');
        setLoading(false);
      });
  }, [dateRange && dateRange.from, dateRange && dateRange.to]);

  return (
    <s-section heading="Profit Trend">
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && data.length === 0 && (
        <p>No data for this period</p>
      )}
      {!loading && !error && data.length > 0 && (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e1e3e5" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString()}`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Net Profit']} />
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
      )}
    </s-section>
  );
}
