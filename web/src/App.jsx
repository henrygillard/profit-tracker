import React, { useState } from 'react';
import Overview from './components/Overview.jsx';
import TrendChart from './components/TrendChart.jsx';
import OrdersTable from './components/OrdersTable.jsx';
import ProductsTable from './components/ProductsTable.jsx';
import HelpWizard from './components/HelpWizard.jsx';

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
];

export default function App() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [view, setView] = useState(getCurrentView);
  const [showHelp, setShowHelp] = useState(false);

  React.useEffect(() => {
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
      case 'orders':   return <OrdersTable dateRange={dateRange} />;
      case 'products': return <ProductsTable dateRange={dateRange} />;
      default:
        return (
          <>
            <Overview dateRange={dateRange} onDateChange={setDateRange} />
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
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className="pt-help-btn"
            onClick={() => setShowHelp(true)}
            aria-label="Help & guide"
          >
            ?
          </button>
        </nav>
        <main className="pt-content">
          {renderView()}
        </main>
      </div>
      {showHelp && <HelpWizard onClose={() => setShowHelp(false)} />}
    </s-page>
  );
}
