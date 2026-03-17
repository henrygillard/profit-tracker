import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function gidToNumericId(gid) {
  if (!gid) return null;
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

export default function ProductsTable({ dateRange, shopDomain }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    apiFetch(
      `/api/dashboard/products?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`
    )
      .then((result) => { setProducts(result); setLoading(false); })
      .catch(() => { setError('Could not load products. Reload to try again.'); setLoading(false); });
  }, [dateRange?.from, dateRange?.to]);

  const knownCogsProducts = products.filter(p => p.allCogsKnown);
  const topSet    = new Set(knownCogsProducts.slice(0, 3).map(p => p.variantId ?? p.sku));
  const bottomSet = new Set(knownCogsProducts.slice(-3).map(p => p.variantId ?? p.sku));

  return (
    <div className="pt-card">
      <div className="pt-card-header">
        <span className="pt-card-title">Products by Margin</span>
        {products.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
            {products.length} variants
          </span>
        )}
      </div>

      {loading && <div className="pt-loading">Loading products…</div>}
      {error && <div style={{ padding: '16px 20px' }}><div className="pt-error-msg">{error}</div></div>}

      {!loading && !error && (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th className="pt-col-num">Orders</th>
                <th className="pt-col-num">Revenue</th>
                <th className="pt-col-num">Net Profit</th>
                <th className="pt-col-num">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => {
                const id = product.variantId ?? product.sku;
                const isTop    = topSet.has(id);
                const isBottom = bottomSet.has(id) && !isTop;
                const margin   = product.allCogsKnown && product.marginPct !== null
                  ? Number(product.marginPct).toFixed(1)
                  : null;
                const profitColor = product.allCogsKnown && product.netProfitAttributed !== null
                  ? (product.netProfitAttributed >= 0 ? 'var(--c-profit)' : 'var(--danger)')
                  : undefined;

                const numericProductId = gidToNumericId(product.productId);
                const adminUrl = shopDomain && numericProductId
                  ? `https://${shopDomain}/admin/products/${numericProductId}`
                  : null;

                return (
                  <tr key={id || product.sku}>
                    <td>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontWeight: 500 }}>
                            {adminUrl
                              ? <a href={adminUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.textDecoration='underline'} onMouseLeave={e => e.currentTarget.style.textDecoration='none'}>{product.productName || product.sku || product.variantId || '—'}</a>
                              : (product.productName || product.sku || product.variantId || '—')}
                          </span>
                          {isTop    && <span className="pt-badge pt-badge-success">Top 3</span>}
                          {isBottom && <span className="pt-badge pt-badge-danger">Bottom 3</span>}
                          {!product.allCogsKnown && (
                            <span className="pt-badge pt-badge-warning">Partial COGS</span>
                          )}
                        </span>
                        {product.productName && (
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{product.sku || product.variantId}</span>
                        )}
                      </span>
                    </td>
                    <td className="pt-col-num" style={{ color: 'var(--text-2)' }}>{product.orderCount}</td>
                    <td className="pt-col-num">{formatCurrency(product.revenue)}</td>
                    <td className="pt-col-num" style={{ color: profitColor, fontWeight: profitColor ? 600 : undefined }}>
                      {product.allCogsKnown && product.netProfitAttributed !== null
                        ? formatCurrency(product.netProfitAttributed)
                        : '—'}
                    </td>
                    <td className="pt-col-num" style={{ color: 'var(--text-2)' }}>
                      {margin !== null ? `${margin}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="pt-empty">No products found for this period</div>
          )}
        </div>
      )}
    </div>
  );
}
