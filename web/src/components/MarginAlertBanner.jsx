import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

export default function MarginAlertBanner({ dateRange, onAtRiskCount }) {
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    // Reset dismissed state when date range changes — new range = fresh context
    setDismissed(false);

    const params = new URLSearchParams({
      from: dateRange.from,
      to: dateRange.to,
    });

    apiFetch(`/api/alerts/margin?${params.toString()}`)
      .then((result) => {
        setData(result);
        if (onAtRiskCount) onAtRiskCount(result.atRiskCount);
      })
      .catch(() => {
        // Silently ignore fetch errors — alerts are non-critical UI
      });
  }, [dateRange?.from, dateRange?.to]);

  if (!data || data.atRiskCount === 0) return null;

  const criticalSkus = data.atRiskSkus.filter((s) => s.isCritical);
  const warningSkus = data.atRiskSkus.filter((s) => !s.isCritical);

  function formatSku(sku) {
    return `${sku.productName} (${Number(sku.marginPct).toFixed(1)}%)`;
  }

  return (
    <>
      {criticalSkus.length > 0 && (
        <div className="pt-alert pt-alert-danger">
          <span className="pt-alert-icon">!</span>
          <span>
            <strong>CRITICAL: {criticalSkus.length} SKU(s) losing money on every sale</strong>
            {' — '}
            {criticalSkus.map(formatSku).join(', ')}
          </span>
        </div>
      )}

      {warningSkus.length > 0 && !dismissed && (
        <div className="pt-alert pt-alert-warning" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span className="pt-alert-icon">⚠</span>
            <span>
              <strong>{warningSkus.length} SKU(s) below {data.threshold}% margin threshold</strong>
              {' — '}
              {warningSkus.map(formatSku).join(', ')}
            </span>
          </span>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: '1',
              padding: '0 0 0 12px',
              flexShrink: 0,
              opacity: 0.7,
            }}
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
