import React, { useState, useEffect } from "react";
import { apiFetch } from "../api.js";
import CogsCoverage from "./CogsCoverage.jsx";

function InfoTooltip({ lines }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block", marginLeft: "0.4rem", verticalAlign: "middle" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        aria-label="More info"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#8c9196",
          color: "#fff",
          fontSize: 10,
          fontWeight: "bold",
          cursor: "default",
          userSelect: "none",
        }}
      >
        i
      </span>
      {visible && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a1a1a",
            color: "#fff",
            padding: "0.6rem 0.8rem",
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.6,
            width: 260,
            zIndex: 100,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
          }}
        >
          {lines.map((line, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "0.4rem 0 0" }}>{line}</p>
          ))}
        </div>
      )}
    </span>
  );
}

const COGS_TOOLTIP = [
  "Cost of Goods Sold — what you paid to source or produce each item.",
  "Set per variant manually or import in bulk via CSV.",
  "Formula: Net Profit = Revenue − COGS − Fees − Shipping",
  "Orders with missing COGS are excluded from totals to avoid understating costs.",
];

function formatCurrency(value) {
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function computePreset(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function Overview({ dateRange, onDateChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (!dateRange || !dateRange.from || !dateRange.to) return;

    setLoading(true);
    setError(null);

    apiFetch(
      `/api/dashboard/overview?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`,
    )
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError("Could not load data. Reload to try again.");
        setLoading(false);
      });
  }, [dateRange && dateRange.from, dateRange && dateRange.to]);

  function handlePreset(days) {
    onDateChange(computePreset(days));
  }

  function handleCustomApply() {
    if (!customFrom || !customTo) return;
    onDateChange({
      from: new Date(customFrom).toISOString(),
      to: new Date(customTo).toISOString(),
    });
  }

  return (
    <div>
      {/* Date range selector */}
      <s-section>
        <s-stack direction="horizontal" gap="300">
          <button onClick={() => handlePreset(7)}>Last 7 days</button>
          <button onClick={() => handlePreset(30)}>Last 30 days</button>
          <button onClick={() => handlePreset(90)}>Last 90 days</button>
          <span
            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            <label>
              From:{" "}
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              To:{" "}
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
            <button onClick={handleCustomApply}>Apply</button>
          </span>
        </s-stack>
      </s-section>

      {/* COGS coverage banner */}
      {data && (
        <CogsCoverage
          missingCogsCount={data.missingCogsCount}
          orderCount={data.orderCount}
        />
      )}

      {/* KPI cards */}
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && data && (
        <s-stack direction="horizontal" gap="400" wrap>
          <s-section heading="Revenue">
            <div><s-text variant="heading-md">{formatCurrency(data.revenueNet)}</s-text></div>
            <div><s-text variant="body-sm">{data.orderCount} orders</s-text></div>
          </s-section>

          <s-section heading="COGS">
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <s-text variant="heading-md">{formatCurrency(data.cogsTotal)}</s-text>
              <InfoTooltip lines={COGS_TOOLTIP} />
            </div>
            {data.isPartial && (
              <div><s-text variant="body-sm">Partial ({data.missingCogsCount} orders excluded)</s-text></div>
            )}
          </s-section>

          <s-section heading="Fees">
            <div><s-text variant="heading-md">{formatCurrency(data.feesTotal)}</s-text></div>
          </s-section>

          <s-section heading="Net Profit">
            <div><s-text variant="heading-md">{formatCurrency(data.netProfit)}</s-text></div>
            {data.isPartial && (
              <div><s-text variant="body-sm">Partial ({data.missingCogsCount} orders excluded)</s-text></div>
            )}
          </s-section>
        </s-stack>
      )}
    </div>
  );
}
