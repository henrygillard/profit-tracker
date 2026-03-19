import React, { useState, useEffect } from 'react';
import Overview from './components/Overview.jsx';
import TrendChart from './components/TrendChart.jsx';
import OrdersTable from './components/OrdersTable.jsx';
import ProductsTable from './components/ProductsTable.jsx';
import HelpWizard from './components/HelpWizard.jsx';
import SettingsScreen from './components/SettingsScreen.jsx';
import AdsView from './components/AdsView.jsx';
import { apiFetch } from './api.js';

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

function getCurrentView() {
  return new URLSearchParams(window.location.search).get('view') || 'overview';
}

function navigate(view) {
  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  window.history.pushState({}, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders',   label: 'Orders'   },
  { id: 'products', label: 'Products' },
  { id: 'ads',      label: 'Ads'      },
  { id: 'settings', label: 'Settings' },
];

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="4" y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function App() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [view, setView] = useState(getCurrentView);
  const [showHelp, setShowHelp] = useState(false);
  const [shopDomain, setShopDomain] = useState(null);
  const [atRiskCount, setAtRiskCount] = useState(0);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('pt-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    return saved;
  });

  useEffect(() => {
    apiFetch('/api/health').then(data => setShopDomain(data.shop)).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pt-theme', theme);
  }, [theme]);

  useEffect(() => {
    function onPopState() { setView(getCurrentView()); }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function handleNav(newView) {
    navigate(newView);
    setView(newView);
  }

  function renderView() {
    switch (view) {
      case 'orders':   return <OrdersTable dateRange={dateRange} shopDomain={shopDomain} />;
      case 'products': return <ProductsTable dateRange={dateRange} shopDomain={shopDomain} />;
      case 'ads':      return <AdsView dateRange={dateRange} />;
      case 'settings': return <SettingsScreen />;
      default:
        return (
          <>
            <Overview dateRange={dateRange} onDateChange={setDateRange} onAtRiskCount={setAtRiskCount} />
            <TrendChart dateRange={dateRange} />
          </>
        );
    }
  }

  return (
    <s-page>
      <div className="pt-app">
        <nav className="pt-nav">
          <div className="pt-nav-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`pt-tab${view === tab.id ? ' active' : ''}`}
                onClick={() => handleNav(tab.id)}
              >
                {tab.id === 'products' && atRiskCount > 0
                  ? <><span>{tab.label}</span><span className="pt-tab-badge">{atRiskCount}</span></>
                  : tab.label
                }
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="pt-theme-btn"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              className="pt-help-btn"
              onClick={() => setShowHelp(true)}
              aria-label="Help & guide"
            >
              ?
            </button>
          </div>
        </nav>
        <main className="pt-content">
          {renderView()}
        </main>
      </div>
      {showHelp && <HelpWizard onClose={() => setShowHelp(false)} />}
    </s-page>
  );
}
