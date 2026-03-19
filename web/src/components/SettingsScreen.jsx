import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

export default function SettingsScreen() {
  const [threshold, setThreshold] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then((data) => {
        setThreshold(data.marginAlertThreshold);
      })
      .catch(() => {
        // If load fails, default to 20
        setThreshold(20);
      });
  }, []);

  function handleChange(e) {
    setThreshold(Number(e.target.value));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ marginAlertThreshold: threshold }),
      });
      setSaved(true);
      setError(null);
    } catch {
      setError('Save failed');
    }
  }

  return (
    <div className="pt-card">
      <div className="pt-card-header">
        <span className="pt-card-title">Settings</span>
      </div>
      <div className="pt-card-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: 500 }}>
              Margin Alert Threshold (%)
            </span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={threshold ?? 20}
              onChange={handleChange}
              style={{
                background: 'var(--elevated)',
                border: '1px solid var(--border-md)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text)',
                fontFamily: 'var(--mono)',
                fontSize: '14px',
                padding: '7px 11px',
                outline: 'none',
                width: '120px',
              }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleSave}
              style={{
                padding: '7px 20px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--accent-border)',
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Save
            </button>
            {saved && (
              <span style={{ fontSize: '13px', color: 'var(--c-profit)', fontWeight: 500 }}>
                Saved
              </span>
            )}
            {error && (
              <span style={{ fontSize: '13px', color: 'var(--danger)', fontWeight: 500 }}>
                {error}
              </span>
            )}
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 }}>
            SKUs with margin below this threshold will appear in the alert banner on the Overview dashboard.
            Negative-margin SKUs always appear as CRITICAL regardless of this setting.
          </p>
        </div>
      </div>
    </div>
  );
}
