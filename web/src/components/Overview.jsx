import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../api.js";
import CogsCoverage from "./CogsCoverage.jsx";
import MarginAlertBanner from "./MarginAlertBanner.jsx";
import WaterfallChart from "./WaterfallChart.jsx";

function InfoTooltip({ lines }) {
  const [pos, setPos] = useState(null);
  const iconRef = useRef(null);

  function handleMouseEnter() {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const tooltipWidth = 260;
      const margin = 8;
      const estimatedTooltipHeight = lines.length * 50;
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      left = Math.max(
        margin,
        Math.min(left, window.innerWidth - tooltipWidth - margin),
      );
      const spaceAbove = rect.top - margin;
      const flipBelow = spaceAbove < estimatedTooltipHeight + 60;
      if (flipBelow) {
        setPos({ top: rect.bottom + margin, left, below: true });
      } else {
        setPos({ top: rect.top - margin, left, below: false });
      }
    }
  }

  return (
    <span
      style={{ display: "inline-block", verticalAlign: "middle" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      <span ref={iconRef} className="pt-info-icon" aria-label="More info">
        i
      </span>
      {pos && createPortal(
        <div
          className="pt-info-popup"
          style={{
            top: pos.top,
            left: pos.left,
            transform: pos.below ? "none" : "translateY(-100%)",
            zIndex: 9999,
          }}
        >
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>,
        document.body
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

const PRESETS = [7, 30, 90];

const KPI_META = [
  {
    key: "revenue",
    label: "Revenue",
    color: "var(--c-revenue)",
    bg: "var(--c-revenue-bg)",
    getValue: (d) => d.revenueNet,
    getSub: (d) => `${d.orderCount} orders`,
  },
  {
    key: "cogs",
    label: "COGS",
    color: "var(--c-cogs)",
    bg: "var(--c-cogs-bg)",
    getValue: (d) => d.cogsTotal,
    getSub: (d) =>
      d.isPartial
        ? `Partial · ${d.missingCogsCount} orders excluded`
        : "All orders included",
    tooltip: COGS_TOOLTIP,
  },
  {
    key: "fees",
    label: "Fees",
    color: "var(--c-fees)",
    bg: "var(--c-fees-bg)",
    getValue: (d) => d.feesTotal,
    getSub: () => "Processing & transactions",
  },
  {
    key: "profit",
    label: "Net Profit",
    color: null, // dynamic based on value
    bg: "var(--c-profit-bg)",
    getValue: (d) => d.netProfit,
    getSub: (d) =>
      d.isPartial ? `Partial · ${d.missingCogsCount} orders excluded` : null,
    isDynamic: true,
  },
];

export default function Overview({ dateRange, onDateChange, onAtRiskCount }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePreset, setActivePreset] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    apiFetch(
      `/api/dashboard/overview?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`,
    )
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load data. Reload to try again.");
        setLoading(false);
      });
  }, [dateRange?.from, dateRange?.to]);

  function handlePreset(days) {
    setActivePreset(days);
    onDateChange(computePreset(days));
  }

  function handleCustomApply() {
    if (!customFrom || !customTo) return;
    setActivePreset(null);
    onDateChange({
      from: new Date(customFrom).toISOString(),
      to: new Date(customTo).toISOString(),
    });
  }

  return (
    <div>
      {/* Date bar */}
      <div className="pt-date-bar">
        {PRESETS.map((days) => (
          <button
            key={days}
            className={`pt-preset${activePreset === days ? " active" : ""}`}
            onClick={() => handlePreset(days)}
          >
            {days}d
          </button>
        ))}
        <div className="pt-date-inputs">
          <span className="pt-date-label">From</span>
          <input
            type="date"
            className="pt-date-input"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span className="pt-date-label">To</span>
          <input
            type="date"
            className="pt-date-input"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
          <button className="pt-apply-btn" onClick={handleCustomApply}>
            Apply
          </button>
        </div>
      </div>

      {/* COGS warning */}
      {data && (
        <CogsCoverage
          missingCogsCount={data.missingCogsCount}
          orderCount={data.orderCount}
        />
      )}

      {/* Margin alert banner */}
      <MarginAlertBanner dateRange={dateRange} onAtRiskCount={onAtRiskCount ?? (() => {})} />

      {/* KPI cards — skeleton while loading */}
      {loading && (
        <div className="pt-kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="pt-kpi-card pt-kpi-skeleton"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div
                className="sk-bar"
                style={{ height: 10, width: 56, marginBottom: 14 }}
              />
              <div
                className="sk-bar"
                style={{ height: 26, width: 120, marginBottom: 10 }}
              />
              <div className="sk-bar" style={{ height: 10, width: 80 }} />
            </div>
          ))}
        </div>
      )}

      {error && <div className="pt-error-msg">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="pt-kpi-grid">
            {KPI_META.map((meta) => {
              const value = meta.getValue(data);
              const sub = meta.getSub(data);
              const color = meta.isDynamic
                ? value >= 0
                  ? "var(--c-profit)"
                  : "var(--danger)"
                : meta.color;
              const bg = meta.isDynamic
                ? value >= 0
                  ? "var(--c-profit-bg)"
                  : "var(--danger-bg)"
                : meta.bg;

              return (
                <div
                  key={meta.key}
                  className="pt-kpi-card"
                  style={{ "--kpi-color": color, "--kpi-bg": bg }}
                >
                  <div className="pt-kpi-label">
                    {meta.label}
                    {meta.tooltip && <InfoTooltip lines={meta.tooltip} />}
                  </div>
                  <div className="pt-kpi-value" style={{ color }}>
                    {formatCurrency(value)}
                  </div>
                  {sub && <div className="pt-kpi-sub">{sub}</div>}
                </div>
              );
            })}
            {data.adSpend !== null && data.adSpend !== undefined && (
              <div
                className="pt-kpi-card"
                style={{ "--kpi-color": "var(--c-ads)", "--kpi-bg": "var(--c-ads-bg)" }}
              >
                <div className="pt-kpi-label">Ad Spend</div>
                <div className="pt-kpi-value" style={{ color: "var(--c-ads)" }}>
                  {formatCurrency(data.adSpend)}
                </div>
                <div className="pt-kpi-sub">Meta Ads</div>
              </div>
            )}
          </div>
          <WaterfallChart
            revenueNet={data.revenueNet}
            cogsTotal={data.cogsTotal}
            cogsKnown={data.cogsKnownCount > 0}
            feesTotal={data.feesTotal}
            shippingCost={data.shippingCost}
            netProfit={data.netProfit}
            isPartial={data.isPartial}
            missingCogsCount={data.missingCogsCount}
            orderCount={data.orderCount}
            adSpend={data.adSpend}
          />
        </>
      )}
    </div>
  );
}
