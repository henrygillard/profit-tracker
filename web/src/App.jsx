import React, { useState } from 'react';

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
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

export default function App() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [view, setView] = useState(getCurrentView);
  const [error, setError] = useState(null);

  // Listen for browser navigation (back/forward)
  React.useEffect(() => {
    function onPopState() {
      setView(getCurrentView());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function handleNav(newView) {
    navigate(newView);
    setView(newView);
  }

  function renderView() {
    switch (view) {
      case 'orders':
        return <p>Orders view coming in next plan.</p>;
      case 'products':
        return <p>Products view coming in next plan.</p>;
      case 'trend':
        return <p>Trend view coming in next plan.</p>;
      case 'overview':
      default:
        return <p>Overview coming in next plan.</p>;
    }
  }

  return (
    <s-page>
      {error && (
        <s-banner tone="critical">
          <p>{error}</p>
        </s-banner>
      )}
      <s-section>
        <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button onClick={() => handleNav('overview')} aria-current={view === 'overview' ? 'page' : undefined}>
            Overview
          </button>
          <button onClick={() => handleNav('orders')} aria-current={view === 'orders' ? 'page' : undefined}>
            Orders
          </button>
          <button onClick={() => handleNav('products')} aria-current={view === 'products' ? 'page' : undefined}>
            Products
          </button>
          <button onClick={() => handleNav('trend')} aria-current={view === 'trend' ? 'page' : undefined}>
            Trend
          </button>
        </nav>
        <div>
          {renderView()}
        </div>
      </s-section>
    </s-page>
  );
}
