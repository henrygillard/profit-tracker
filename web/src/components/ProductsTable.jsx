import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function ProductsTable({ dateRange }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dateRange || !dateRange.from || !dateRange.to) return;

    setLoading(true);
    setError(null);

    apiFetch(
      `/api/dashboard/products?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`
    )
      .then((result) => {
        setProducts(result);
        setLoading(false);
      })
      .catch((err) => {
        setError('Could not load products. Reload to try again.');
        setLoading(false);
      });
  }, [dateRange && dateRange.from, dateRange && dateRange.to]);

  // Determine top 3 and bottom 3 with known COGS
  const knownCogsProducts = products.filter((p) => p.allCogsKnown);
  const topSet = new Set(knownCogsProducts.slice(0, 3).map((p) => p.variantId ?? p.sku));
  const bottomSet = new Set(
    knownCogsProducts.slice(-3).map((p) => p.variantId ?? p.sku)
  );

  return (
    <s-section heading="Products by Margin">
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && (
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">SKU / Variant</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">Orders</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">Revenue</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">Net Profit</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">Margin %</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {products.map((product) => {
              const id = product.variantId ?? product.sku;
              const isTop = topSet.has(id);
              const isBottom = bottomSet.has(id) && !isTop; // don't double-badge if fewer than 6 rows

              return (
                <s-table-row key={id || product.sku}>
                  <s-table-cell>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {product.sku || product.variantId || '—'}
                      {isTop && <s-badge tone="success">Top 3</s-badge>}
                      {isBottom && <s-badge tone="critical">Bottom 3</s-badge>}
                    </span>
                  </s-table-cell>
                  <s-table-cell>{product.orderCount}</s-table-cell>
                  <s-table-cell>{formatCurrency(product.revenue)}</s-table-cell>
                  <s-table-cell>
                    {product.allCogsKnown
                      ? (product.netProfitAttributed !== null
                          ? formatCurrency(product.netProfitAttributed)
                          : '—')
                      : (
                        <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          —<s-badge tone="warning">Partial COGS</s-badge>
                        </span>
                      )}
                  </s-table-cell>
                  <s-table-cell>
                    {product.allCogsKnown
                      ? (product.marginPct !== null
                          ? `${Number(product.marginPct).toFixed(1)}%`
                          : '—')
                      : '—'}
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
      )}
    </s-section>
  );
}
