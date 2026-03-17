import React from "react";
import ReactDOM from "react-dom";

const STEPS = [
  {
    title: "Welcome to Profit Tracker",
    content: () => (
      <>
        <p>Profit Tracker gives you a real-time view of how much money your store is actually making — after every cost is accounted for.</p>
        <p>This guide walks you through how each number is calculated and how to make sure your data is accurate.</p>
        <div style={styles.stepGrid}>
          <div style={styles.stepCard}>
            <span style={styles.stepCardIcon}>📊</span>
            <strong>Overview</strong>
            <span>Your top-level KPIs for any date range</span>
          </div>
          <div style={styles.stepCard}>
            <span style={styles.stepCardIcon}>🧾</span>
            <strong>Orders</strong>
            <span>Line-by-line breakdown of every order's profit</span>
          </div>
          <div style={styles.stepCard}>
            <span style={styles.stepCardIcon}>📦</span>
            <strong>Products</strong>
            <span>Profitability ranked by product and variant</span>
          </div>
        </div>
      </>
    ),
  },
  {
    title: "Revenue",
    content: () => (
      <>
        <div style={styles.formula}>Revenue = Order subtotal (after discounts, before taxes)</div>
        <p>Revenue is the money collected from customers, net of any discounts applied at checkout. It does <strong>not</strong> include taxes, since taxes are collected on behalf of the government and passed through.</p>
        <div style={styles.callout}>
          <strong>Why it may differ from Shopify's "Total Sales"</strong>
          <p style={{ margin: "0.4rem 0 0" }}>Shopify's Total Sales figure includes taxes and shipping. Profit Tracker uses only the product revenue so costs can be compared fairly.</p>
        </div>
      </>
    ),
  },
  {
    title: "Cost of Goods Sold (COGS)",
    content: () => (
      <>
        <div style={styles.formula}>COGS = Sum of (unit cost × quantity) for all line items sold</div>
        <p>COGS represents what you paid to source or manufacture each item. It's the single biggest lever on your profitability — and the one you control directly.</p>
        <div style={styles.callout}>
          <strong>How to set your costs</strong>
          <ol style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem", lineHeight: 1.8 }}>
            <li>Go to <strong>Products → [product] → Variants</strong> in Shopify Admin.</li>
            <li>Set the <strong>Cost per item</strong> field for each variant.</li>
            <li>Alternatively, use the <strong>Products</strong> tab in Profit Tracker to bulk-review missing costs.</li>
          </ol>
        </div>
        <p style={{ marginTop: "0.75rem" }}>Orders where <em>any</em> line item has no cost set are marked <strong>Partial</strong> and excluded from COGS and Net Profit totals. This prevents understating your costs.</p>
      </>
    ),
  },
  {
    title: "Fees",
    content: () => (
      <>
        <div style={styles.formula}>Fees = Payment processing fees + transaction fees</div>
        <p>Fees are pulled directly from Shopify's transaction records for each order. They typically include:</p>
        <ul style={{ paddingLeft: "1.2rem", lineHeight: 1.8 }}>
          <li><strong>Shopify Payments processing fee</strong> — charged per transaction (e.g. 2.9% + 30¢)</li>
          <li><strong>Third-party transaction fee</strong> — if you use an external payment gateway, Shopify also charges a flat fee (0.5–2% depending on your plan)</li>
        </ul>
        <div style={styles.callout}>
          <strong>Shipping costs</strong>
          <p style={{ margin: "0.4rem 0 0" }}>Shipping costs charged to your store (label costs) are also factored in when available via Shopify Shipping data.</p>
        </div>
      </>
    ),
  },
  {
    title: "Net Profit",
    content: () => (
      <>
        <div style={styles.formula}>Net Profit = Revenue − COGS − Fees − Shipping</div>
        <p>Net Profit is the bottom line — what's left after every tracked cost is subtracted from revenue.</p>
        <div style={styles.callout}>
          <strong>What's not included</strong>
          <p style={{ margin: "0.4rem 0 0" }}>Overhead costs like staff, software subscriptions, ads, or warehouse rent are not tracked here. Net Profit is <em>contribution margin</em>, not accounting profit.</p>
        </div>
        <p style={{ marginTop: "0.75rem" }}>If an order is <strong>Partial</strong> (missing COGS for one or more items), it's excluded from the Net Profit total to avoid artificially inflating profit numbers.</p>
      </>
    ),
  },
  {
    title: "Getting Accurate Stats",
    content: () => (
      <>
        <p>Follow these steps to ensure your numbers reflect reality:</p>
        <div style={styles.checkList}>
          {[
            { label: "Set Cost per item on every variant", detail: "Shopify Admin → Products → [product] → each variant → Cost per item" },
            { label: "Use the Products tab to find gaps", detail: 'Sort by "Missing COGS" to see which variants need costs filled in' },
            { label: "Check the Partial orders banner", detail: "The yellow banner on Overview shows how many orders are excluded — aim for zero" },
            { label: "Pick the right date range", detail: "Use Last 30 days for recent trends; custom ranges for seasonal comparisons" },
            { label: "Reconcile refunds", detail: "Refunded orders are subtracted automatically from revenue and profit" },
          ].map(({ label, detail }, i) => (
            <div key={i} style={styles.checkItem}>
              <span style={styles.checkIcon}>✓</span>
              <div>
                <strong>{label}</strong>
                <div style={{ fontSize: 12, color: "#6d7175", marginTop: 2 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  },
];

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#0e1520",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    width: "100%",
    maxWidth: 540,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
    overflow: "hidden",
  },
  header: {
    padding: "1.25rem 1.5rem 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "1rem",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  stepLabel: {
    fontSize: 10.5,
    fontWeight: 600,
    color: "#7a8a9e",
    textTransform: "uppercase",
    letterSpacing: "0.09em",
    fontFamily: "'Outfit', sans-serif",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: "#e4ebf5",
    margin: 0,
    fontFamily: "'Outfit', sans-serif",
  },
  closeBtn: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "50%",
    width: 30,
    height: 30,
    fontSize: 14,
    cursor: "pointer",
    color: "#7a8a9e",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontFamily: "'Outfit', sans-serif",
  },
  progressBar: {
    height: 2,
    background: "rgba(255,255,255,0.07)",
    margin: "1rem 1.5rem 0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: (pct) => ({
    height: "100%",
    background: "#00e5a0",
    borderRadius: 2,
    transition: "width 0.25s ease",
    width: `${pct}%`,
  }),
  body: {
    padding: "1.25rem 1.5rem",
    overflowY: "auto",
    flex: 1,
    fontSize: 13.5,
    lineHeight: 1.7,
    color: "#a0b0c4",
    fontFamily: "'Outfit', sans-serif",
  },
  footer: {
    padding: "1rem 1.5rem",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
  },
  dotRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  dot: (active) => ({
    width: active ? 20 : 6,
    height: 6,
    borderRadius: 3,
    background: active ? "#00e5a0" : "rgba(255,255,255,0.12)",
    transition: "width 0.2s ease, background 0.2s ease",
    border: "none",
    cursor: "pointer",
  }),
  btnRow: {
    display: "flex",
    gap: "0.5rem",
  },
  btnSecondary: {
    padding: "0.45rem 1rem",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 7,
    background: "transparent",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    color: "#a0b0c4",
    fontFamily: "'Outfit', sans-serif",
  },
  btnPrimary: {
    padding: "0.45rem 1rem",
    border: "1px solid rgba(0,229,160,0.3)",
    borderRadius: 7,
    background: "rgba(0,229,160,0.12)",
    color: "#00e5a0",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Outfit', sans-serif",
  },
  formula: {
    background: "#141d2b",
    border: "1px solid rgba(255,255,255,0.08)",
    borderLeft: "3px solid #00e5a0",
    borderRadius: "0 7px 7px 0",
    padding: "0.6rem 0.9rem",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12.5,
    color: "#e4ebf5",
    marginBottom: "1rem",
  },
  callout: {
    background: "rgba(0,229,160,0.06)",
    border: "1px solid rgba(0,229,160,0.15)",
    borderRadius: 7,
    padding: "0.7rem 1rem",
    fontSize: 13,
    marginTop: "0.75rem",
    color: "#a0b0c4",
  },
  stepGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.75rem",
    marginTop: "1rem",
  },
  stepCard: {
    background: "#141d2b",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 9,
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "#a0b0c4",
    textAlign: "center",
  },
  stepCardIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  checkList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  checkItem: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "flex-start",
  },
  checkIcon: {
    background: "rgba(0,229,160,0.15)",
    color: "#00e5a0",
    border: "1px solid rgba(0,229,160,0.25)",
    borderRadius: "50%",
    width: 20,
    height: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  },
};

export default function HelpWizard({ onClose }) {
  const [step, setStep] = React.useState(0);
  const isLast = step === STEPS.length - 1;
  const StepContent = STEPS[step].content;

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return ReactDOM.createPortal(
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="wizard-title">
        <div style={styles.header}>
          <div style={styles.titleBlock}>
            <span style={styles.stepLabel}>Step {step + 1} of {STEPS.length}</span>
            <h2 id="wizard-title" style={styles.title}>{STEPS[step].title}</h2>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={styles.progressBar}>
          <div style={styles.progressFill(((step + 1) / STEPS.length) * 100)} />
        </div>

        <div style={styles.body}>
          <StepContent />
        </div>

        <div style={styles.footer}>
          <div style={styles.dotRow}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                style={{ ...styles.dot(i === step), border: "none", padding: 0, cursor: "pointer" }}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          <div style={styles.btnRow}>
            {step > 0 && (
              <button style={styles.btnSecondary} onClick={() => setStep(s => s - 1)}>Back</button>
            )}
            {isLast ? (
              <button style={styles.btnPrimary} onClick={onClose}>Done</button>
            ) : (
              <button style={styles.btnPrimary} onClick={() => setStep(s => s + 1)}>Next</button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
