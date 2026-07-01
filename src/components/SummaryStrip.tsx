import { formatCurrency } from "../format";
import type { Currency } from "../types";

type Props = {
  nav: number;
  dailyChange: number | null;
  totalReturn: number | null;
  quarterlyReturn: number | null;
  cash: number;
  cashInput: string;
  onCashInputChange: (value: string) => void;
  currency: Currency;
  trackingStartDate: string;
  onTrackingStartDateChange: (value: string) => void;
  missingQuotes: number;
};

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`;
}

function metricClass(value: number | null): string {
  if (value === null || value === 0) return "metric-neutral";
  return value > 0 ? "metric-positive" : "metric-negative";
}

export function SummaryStrip({
  nav,
  dailyChange,
  totalReturn,
  quarterlyReturn,
  cash,
  cashInput,
  onCashInputChange,
  currency,
  trackingStartDate,
  onTrackingStartDateChange,
  missingQuotes
}: Props) {
  return (
    <section className="summary-grid" aria-label="Portfolio summary">
      <div className="summary-card summary-card-primary metric-neutral">
        <span>Current NAV</span>
        <strong>{formatCurrency(nav, currency)}</strong>
      </div>
      <div className={`summary-card ${metricClass(dailyChange)}`}>
        <span>Daily change</span>
        <strong>{dailyChange === null ? "N/A" : formatCurrency(dailyChange, currency)}</strong>
      </div>
      <div className={`summary-card ${metricClass(totalReturn)}`}>
        <span>Total return</span>
        <strong>{pct(totalReturn)}</strong>
      </div>
      <div className={`summary-card ${metricClass(quarterlyReturn)}`}>
        <span>Quarterly return</span>
        <strong>{pct(quarterlyReturn)}</strong>
      </div>
      <div className="summary-card summary-card-cash">
        <span>Manual cash</span>
        <label className="manual-cash-field">
          <span>{currency}</span>
          <input
            aria-label="Manual cash balance"
            inputMode="numeric"
            spellCheck={false}
            value={cashInput}
            onChange={(event) => onCashInputChange(event.currentTarget.value)}
          />
        </label>
        <strong>{formatCurrency(cash, currency)}</strong>
      </div>
      <div className="summary-card summary-card-control metric-neutral">
        <span>Track from</span>
        <label className="date-field">
          <input
            aria-label="Track from"
            type="date"
            value={trackingStartDate}
            onChange={(event) => onTrackingStartDateChange(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className={missingQuotes > 0 ? "summary-card metric-warning" : "summary-card metric-neutral"}>
        <span>Missing/stale quotes</span>
        <strong>{missingQuotes}</strong>
      </div>
    </section>
  );
}
