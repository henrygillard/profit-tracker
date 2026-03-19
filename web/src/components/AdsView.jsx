import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

export default function AdsView({ dateRange }) {
  const [spendData, setSpendData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/api/ads/spend?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`),
      apiFetch(`/api/ads/campaigns?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`),
    ])
      .then(([spend, cams]) => {
        setSpendData(spend);
        setCampaigns(cams);
        // If total > 0 or campaigns exist, consider connected
        setConnected(spend.total > 0 || cams.length > 0);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load ad data.');
        setLoading(false);
      });
  }, [dateRange?.from, dateRange?.to]);

  function handleConnect() {
    // Must navigate top-level window (not iframe) to /ads/auth
    const shop = new URLSearchParams(window.location.search).get('shop') || '';
    const url = `/ads/auth?shop=${encodeURIComponent(shop)}&embedded=1`;
    window.top.location.href = url;
  }

  async function handleDisconnect() {
    try {
      await apiFetch('/api/ads/disconnect', { method: 'DELETE' });
      setConnected(false);
      setSpendData(null);
      setCampaigns([]);
    } catch {
      setError('Failed to disconnect.');
    }
  }

  // revenueNet comes from the /api/ads/spend response (added in Plan 03)
  const revenueNet = spendData?.revenueNet ?? 0;
  const roas =
    spendData?.total > 0 && revenueNet > 0
      ? (revenueNet / spendData.total).toFixed(2)
      : null;

  return (
    <div className="pt-ads-view">
      <h2 className="pt-section-title">Ads</h2>

      {loading && (
        <div className="pt-kpi-grid">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="pt-kpi-card pt-kpi-skeleton"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="sk-bar" style={{ height: 10, width: 56, marginBottom: 14 }} />
              <div className="sk-bar" style={{ height: 26, width: 120, marginBottom: 10 }} />
              <div className="sk-bar" style={{ height: 10, width: 80 }} />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Connection status */}
          {!connected ? (
            <div className="pt-ads-connect-card">
              <p>Connect your Meta Ads account to see spend data in your profit dashboard.</p>
              <button className="pt-btn pt-btn-primary" onClick={handleConnect}>
                Connect Meta Ads
              </button>
            </div>
          ) : (
            <>
              <div className="pt-ads-status">
                <span className="pt-ads-connected-label">Meta Ads connected</span>
                <button className="pt-btn pt-btn-danger-outline" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>

              {/* Blended ROAS card */}
              {roas !== null && (
                <div
                  className="pt-kpi-card"
                  style={{ '--kpi-color': 'var(--c-ads)', '--kpi-bg': 'var(--c-ads-bg)', marginBottom: 24 }}
                >
                  <div className="pt-kpi-label">Blended ROAS</div>
                  <div className="pt-kpi-value" style={{ color: 'var(--c-ads)' }}>{roas}x</div>
                  <div className="pt-kpi-sub">Total revenue / total ad spend &middot; all platforms</div>
                </div>
              )}

              {/* Campaign breakdown table */}
              {campaigns.length > 0 ? (
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th style={{ textAlign: 'right' }}>Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.campaignId}>
                        <td>{c.campaignName}</td>
                        <td style={{ textAlign: 'right' }}>
                          {Number(c.spend).toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="pt-empty-state">
                  No campaign data for this date range. Sync runs every 6 hours.
                </p>
              )}
            </>
          )}
        </>
      )}

      {error && <div className="pt-error-msg">{error}</div>}
    </div>
  );
}
