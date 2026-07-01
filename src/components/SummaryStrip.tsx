import { formatCurrency } from "../format";
import type { PeriodKey } from "../portfolio/fundAccounting";
import type { Currency } from "../types";

type Props = {
  nav: number;
  sinceInception: number | null;
  periodReturn: number | null;
  period: PeriodKey;
  onPeriodChange: (period: PeriodKey) => void;
  irr: number | null;
  cash: number;
  netContributions: number;
  missingQuotes: number;
  currency: Currency;
};

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "inception", label: "Since inception" },
  { key: "ytd", label: "YTD" },
  { key: "qtd", label: "QTD" },
  { key: "mtd", label: "MTD" }
];

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`;
}

function metricClass(value: number | null): string {
  if (value === null || value === 0) return "metric-neutral";
  return value > 0 ? "metric-positive" : "metric-negative";
}

export function SummaryStrip({
  nav,
  sinceInception,
  periodReturn,
  period,
  onPeriodChange,
  irr,
  cash,
  netContributions,
  missingQuotes,
  currency
}: Props) {
  const periodLabel = PERIODS.find((option) => option.key === period)?.label ?? "Period";

  return (
    <section className="summary-grid" aria-label="Portfolio summary">
      <div className="summary-card summary-card-primary metric-neutral">
        <span>Net asset value</span>
        <strong>{formatCurrency(nav, currency)}</strong>
      </div>
      <div className={`summary-card ${metricClass(sinceInception)}`}>
        <span>Time-weighted return (since inception)</span>
        <strong>{pct(sinceInception)}</strong>
      </div>
      <div className={`summary-card summary-card-control ${metricClass(periodReturn)}`}>
        <span>Return · {periodLabel}</span>
        <strong>{pct(periodReturn)}</strong>
        <div className="period-toggle" role="group" aria-label="Return period">
          {PERIODS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.key === period ? "period-button is-active" : "period-button"}
              aria-pressed={option.key === period}
              onClick={() => onPeriodChange(option.key)}
            >
              {option.key === "inception" ? "ITD" : option.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`summary-card ${metricClass(irr)}`}>
        <span>Money-weighted IRR (annualized)</span>
        <strong>{pct(irr)}</strong>
      </div>
      <div className="summary-card metric-neutral">
        <span>Cash balance</span>
        <strong>{formatCurrency(cash, currency)}</strong>
      </div>
      <div className="summary-card metric-neutral">
        <span>Net contributions</span>
        <strong>{formatCurrency(netContributions, currency)}</strong>
      </div>
      <div className={missingQuotes > 0 ? "summary-card metric-warning" : "summary-card metric-neutral"}>
        <span>Missing/stale quotes</span>
        <strong>{missingQuotes}</strong>
      </div>
    </section>
  );
}
