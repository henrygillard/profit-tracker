import React, { useState } from 'react';
import Overview from './components/Overview.jsx';
import CogsCoverage from './components/CogsCoverage.jsx';
import TrendChart from './components/TrendChart.jsx';
import OrdersTable from './components/OrdersTable.jsx';
import ProductsTable from './components/ProductsTable.jsx';

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

  function handleDateChange(newRange) {
    setDateRange(newRange);
  }

  function renderView() {
    switch (view) {
      case 'orders':
        return <OrdersTable dateRange={dateRange} />;
      case 'products':
        return <ProductsTable dateRange={dateRange} />;
      case 'overview':
      default:
        return (
          <div>
            <Overview dateRange={dateRange} onDateChange={handleDateChange} />
            <TrendChart dateRange={dateRange} />
          </div>
        );
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
          <button
            onClick={() => handleNav('overview')}
            aria-current={view === 'overview' ? 'page' : undefined}
          >
            Overview
          </button>
          <button
            onClick={() => handleNav('orders')}
            aria-current={view === 'orders' ? 'page' : undefined}
          >
            Orders
          </button>
          <button
            onClick={() => handleNav('products')}
            aria-current={view === 'products' ? 'page' : undefined}
          >
            Products
          </button>
        </nav>
        <div>{renderView()}</div>
      </s-section>
    </s-page>
  );
}
