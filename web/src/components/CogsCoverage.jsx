import React from 'react';

export default function CogsCoverage({ missingCogsCount, orderCount }) {
  if (!missingCogsCount || missingCogsCount === 0) return null;

  const pct = orderCount > 0
    ? ((missingCogsCount / orderCount) * 100).toFixed(0)
    : 0;

  return (
    <div className="pt-alert pt-alert-warning">
      <span className="pt-alert-icon">⚠</span>
      <span>
        <strong>{missingCogsCount}</strong> of <strong>{orderCount}</strong> orders ({pct}%) have
        unknown COGS. Net profit for these orders cannot be calculated.
      </span>
    </div>
  );
}
