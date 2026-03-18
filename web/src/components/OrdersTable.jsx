import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: 'processedAt',      label: 'Date',      numeric: false },
  { key: 'shopifyOrderName', label: 'Order',     numeric: false, sortable: false },
  { key: 'revenueNet',       label: 'Revenue',   numeric: true  },
  { key: 'cogsTotal',        label: 'COGS',      numeric: true  },
  { key: 'feesTotal',        label: 'Fees',      numeric: true  },
  { key: 'netProfit',        label: 'Net Profit',numeric: true  },
  { key: 'marginPct',        label: 'Margin %',  numeric: true, sortable: false },
];

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function gidToNumericId(gid) {
  if (!gid) return null;
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

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
  // verified — exact from settled payout, tooltip for transparency
  return <span title="Exact fee from settled payout">{formatCurrency(feesTotal)}</span>;
}

export default function OrdersTable({ dateRange, shopDomain }) {
  const [allOrders, setAllOrders] = useState([]);
  const [sortKey, setSortKey] = useState('processedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    apiFetch(
      `/api/dashboard/orders?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}&sort=${sortKey}&dir=${sortDir}&page=${page}`
    )
      .then((result) => {
        if (page === 0) setAllOrders(result);
        else setAllOrders(prev => [...prev, ...result]);
        setHasMore(result.length === PAGE_SIZE);
        setLoading(false);
      })
      .catch(() => { setError('Could not load orders. Reload to try again.'); setLoading(false); });
  }, [dateRange?.from, dateRange?.to, sortKey, sortDir, page]);

  useEffect(() => {
    setPage(0);
    setAllOrders([]);
  }, [dateRange?.from, dateRange?.to, sortKey, sortDir]);

  function handleSort(key) {
    if (key === sortKey) setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div className="pt-card">
      <div className="pt-card-header">
        <span className="pt-card-title">Orders</span>
        {allOrders.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
            {allOrders.length}{hasMore ? '+' : ''} rows
          </span>
        )}
      </div>

      {loading && page === 0 && <div className="pt-loading">Loading orders…</div>}
      {error && <div style={{ padding: '16px 20px' }}><div className="pt-error-msg">{error}</div></div>}

      {!error && (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                {COLUMNS.map(col => {
                  const sortable = col.sortable !== false;
                  const isActive = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className={[
                        col.numeric ? 'pt-col-num' : '',
                        sortable ? 'pt-sortable' : '',
                        isActive ? 'pt-sort-active' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={sortable ? () => handleSort(col.key) : undefined}
                    >
                      {col.label}
                      {isActive ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {allOrders.map(order => {
                const margin = order.marginPct !== null ? Number(order.marginPct).toFixed(1) : null;
                const profitColor = order.netProfit !== null
                  ? (order.netProfit >= 0 ? 'var(--c-profit)' : 'var(--danger)')
                  : undefined;

                const numericId = gidToNumericId(order.orderId);
                const adminUrl = shopDomain && numericId
                  ? `https://${shopDomain}/admin/orders/${numericId}`
                  : null;

                return (
                  <tr key={order.orderId}>
                    <td style={{ color: 'var(--text-2)', fontSize: 12 }}>
                      {order.processedAt
                        ? new Date(order.processedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {adminUrl
                        ? <a href={adminUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.textDecoration='underline'} onMouseLeave={e => e.currentTarget.style.textDecoration='none'}>{order.shopifyOrderName}</a>
                        : order.shopifyOrderName}
                    </td>
                    <td className="pt-col-num">{formatCurrency(order.revenueNet)}</td>
                    <td className="pt-col-num">
                      {order.cogsKnown
                        ? formatCurrency(order.cogsTotal)
                        : <span className="pt-badge pt-badge-warning">Unknown</span>}
                    </td>
                    <td className="pt-col-num"><FeeCell feesTotal={order.feesTotal} feeSource={order.feeSource} /></td>
                    <td className="pt-col-num" style={{ color: profitColor, fontWeight: 600 }}>
                      {order.netProfit !== null ? formatCurrency(order.netProfit) : '—'}
                    </td>
                    <td className="pt-col-num" style={{ color: 'var(--text-2)' }}>
                      {margin !== null ? `${margin}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && (
        <div className="pt-load-more">
          <button className="pt-load-more-btn" onClick={() => setPage(p => p + 1)}>Load more</button>
        </div>
      )}
      {loading && page > 0 && (
        <div className="pt-load-more" style={{ color: 'var(--text-2)', fontSize: 13 }}>Loading more…</div>
      )}
    </div>
  );
}
