import React, { useState, useEffect } from "react";
import { apiFetch } from "../api.js";
import CogsCoverage from "./CogsCoverage.jsx";

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
            <s-text variant="heading-md">
              {formatCurrency(data.revenueNet)}{" "}
            </s-text>
            <s-text variant="body-sm">{data.orderCount} orders</s-text>
          </s-section>

          <s-section heading="COGS">
            <s-text variant="heading-md">
              {formatCurrency(data.cogsTotal)}
            </s-text>
            {data.isPartial && (
              <s-text variant="body-sm">
                Partial ({data.missingCogsCount} orders excluded)
              </s-text>
            )}
          </s-section>

          <s-section heading="Fees">
            <s-text variant="heading-md">
              {formatCurrency(data.feesTotal)}
            </s-text>
          </s-section>

          <s-section heading="Net Profit">
            <s-text variant="heading-md">
              {formatCurrency(data.netProfit)}
            </s-text>
            {data.isPartial && (
              <s-text variant="body-sm">
                Partial ({data.missingCogsCount} orders excluded)
              </s-text>
            )}
          </s-section>
        </s-stack>
      )}
    </div>
  );
}
