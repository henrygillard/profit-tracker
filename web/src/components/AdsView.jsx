import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

export default function AdsView({ dateRange }) {
  const [spendData, setSpendData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [metaConnected, setMetaConnected] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
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
        // Infer connection state from data — no dedicated status endpoint needed
        setMetaConnected(
          (spend.meta != null && spend.meta > 0) ||
          cams.some((c) => c.platform === 'meta')
        );
        setGoogleConnected(
          (spend.google != null && spend.google > 0) ||
          cams.some((c) => c.platform === 'google')
        );
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load ad data.');
        setLoading(false);
      });
  }, [dateRange?.from, dateRange?.to]);

  function handleConnectMeta() {
    const shop = new URLSearchParams(window.location.search).get('shop') || '';
    window.top.location.href = `/ads/auth?shop=${encodeURIComponent(shop)}&embedded=1`;
  }

  function handleConnectGoogle() {
    const shop = new URLSearchParams(window.location.search).get('shop') || '';
    window.top.location.href = `/google-ads/auth?shop=${encodeURIComponent(shop)}&embedded=1`;
  }

  async function handleDisconnect(platform) {
    try {
      await apiFetch(`/api/ads/disconnect?platform=${platform}`, { method: 'DELETE' });
      if (platform === 'meta') { setMetaConnected(false); }
      if (platform === 'google') { setGoogleConnected(false); }
      // Reload spend/campaigns after disconnect
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

  const anyConnected = metaConnected || googleConnected;

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
          {/* Meta Ads section */}
          <div className="pt-ads-platform-section">
            <h3 className="pt-ads-platform-title">Meta Ads</h3>
            {!metaConnected ? (
              <div className="pt-ads-connect-card">
                <p>Connect your Meta Ads account to see spend data in your profit dashboard.</p>
                <button className="pt-btn pt-btn-primary" onClick={handleConnectMeta}>
                  Connect Meta Ads
                </button>
              </div>
            ) : (
              <div className="pt-ads-status">
                <span className="pt-ads-connected-label">Meta Ads connected</span>
                <button className="pt-btn pt-btn-danger-outline" onClick={() => handleDisconnect('meta')}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* Google Ads section */}
          <div className="pt-ads-platform-section">
            <h3 className="pt-ads-platform-title">Google Ads</h3>
            {!googleConnected ? (
              <div className="pt-ads-connect-card">
                <p>Connect your Google Ads account to include Google spend in your profit dashboard.</p>
                <button className="pt-btn pt-btn-primary" onClick={handleConnectGoogle}>
                  Connect Google Ads
                </button>
              </div>
            ) : (
              <div className="pt-ads-status">
                <span className="pt-ads-connected-label">Google Ads connected</span>
                <button className="pt-btn pt-btn-danger-outline" onClick={() => handleDisconnect('google')}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* Blended ROAS card — shown when any platform connected */}
          {anyConnected && roas !== null && (
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
          {anyConnected && (
            campaigns.length > 0 ? (
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th style={{ textAlign: 'right' }}>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={`${c.platform}-${c.campaignId}`}>
                      <td>
                        {c.campaignName}{' '}
                        <span className="pt-ads-platform-badge">{c.platform}</span>
                      </td>
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
            )
          )}
        </>
      )}

      {error && <div className="pt-error-msg">{error}</div>}
    </div>
  );
}
