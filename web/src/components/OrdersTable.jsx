import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: 'processedAt', label: 'Date' },
  { key: 'shopifyOrderName', label: 'Order', sortable: false },
  { key: 'revenueNet', label: 'Revenue', numeric: true },
  { key: 'cogsTotal', label: 'COGS', numeric: true },
  { key: 'feesTotal', label: 'Fees', numeric: true },
  { key: 'netProfit', label: 'Net Profit', numeric: true },
  { key: 'marginPct', label: 'Margin %', numeric: true, sortable: false },
];

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function OrdersTable({ dateRange }) {
  const [orders, setOrders] = useState([]);
  const [sortKey, setSortKey] = useState('processedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!dateRange || !dateRange.from || !dateRange.to) return;

    setLoading(true);
    setError(null);

    apiFetch(
      `/api/dashboard/orders?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}&sort=${sortKey}&dir=${sortDir}&page=${page}`
    )
      .then((result) => {
        if (page === 0) {
          setAllOrders(result);
        } else {
          setAllOrders((prev) => [...prev, ...result]);
        }
        setHasMore(result.length === PAGE_SIZE);
        setLoading(false);
      })
      .catch((err) => {
        setError('Could not load orders. Reload to try again.');
        setLoading(false);
      });
  }, [dateRange && dateRange.from, dateRange && dateRange.to, sortKey, sortDir, page]);

  // Reset page when dateRange or sort changes (but not when page itself changes)
  useEffect(() => {
    setPage(0);
    setAllOrders([]);
  }, [dateRange && dateRange.from, dateRange && dateRange.to, sortKey, sortDir]);

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function loadMore() {
    setPage((prev) => prev + 1);
  }

  return (
    <s-section heading="Orders">
      {loading && page === 0 && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!error && (
        <s-table>
          <s-table-header-row>
            {COLUMNS.map((col) => {
              const isSortable = col.sortable !== false;
              const isActive = sortKey === col.key;
              return (
                <s-table-header
                  key={col.key}
                  listSlot={col.key === 'shopifyOrderName' ? 'primary' : 'labeled'}
                  format={col.numeric ? 'numeric' : undefined}
                  onClick={isSortable ? () => handleSort(col.key) : undefined}
                  style={isSortable ? { cursor: 'pointer', userSelect: 'none' } : undefined}
                >
                  {col.label}
                  {isActive ? (sortDir === 'desc' ? ' \u2193' : ' \u2191') : ''}
                </s-table-header>
              );
            })}
          </s-table-header-row>
          <s-table-body>
            {allOrders.map((order) => (
              <s-table-row key={order.orderId}>
                <s-table-cell>
                  {order.processedAt
                    ? new Date(order.processedAt).toLocaleDateString('en-US')
                    : '—'}
                </s-table-cell>
                <s-table-cell>{order.shopifyOrderName}</s-table-cell>
                <s-table-cell>{formatCurrency(order.revenueNet)}</s-table-cell>
                <s-table-cell>
                  {order.cogsKnown
                    ? formatCurrency(order.cogsTotal)
                    : <s-badge tone="warning">Unknown</s-badge>}
                </s-table-cell>
                <s-table-cell>{formatCurrency(order.feesTotal)}</s-table-cell>
                <s-table-cell>
                  {order.netProfit !== null ? formatCurrency(order.netProfit) : '—'}
                </s-table-cell>
                <s-table-cell>
                  {order.marginPct !== null ? `${Number(order.marginPct).toFixed(1)}%` : '—'}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      )}
      {!loading && hasMore && (
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button onClick={loadMore}>Load more</button>
        </div>
      )}
      {loading && page > 0 && <p>Loading more...</p>}
    </s-section>
  );
}
