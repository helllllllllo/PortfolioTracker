import { formatCurrency } from "../format";
import type { Currency, DividendSummary } from "../types";

export function DividendsPanel({
  summary,
  currency,
  manualDividendInput,
  onManualDividendInputChange,
  expectedDividendInput,
  expectedAnnualDividend,
  onExpectedDividendInputChange
}: {
  summary: DividendSummary;
  currency: Currency;
  manualDividendInput: string;
  onManualDividendInputChange: (value: string) => void;
  expectedDividendInput: string;
  expectedAnnualDividend: number;
  onExpectedDividendInputChange: (value: string) => void;
}) {
  return (
    <section className="panel dividends-panel">
      <div className="panel-heading">
        <div>
          <h2>Dividends</h2>
          <p className={`dividend-state dividend-state-${summary.state}`}>
            State: <strong>{summary.state}</strong>
          </p>
        </div>
      </div>
      <p className="subtle">{summary.message}</p>
      <div className="manual-dividend-fields">
        <label className="manual-dividend-field">
          <span>Manual YTD dividend</span>
          <input
            aria-label="Manual YTD dividend"
            inputMode="numeric"
            spellCheck={false}
            value={manualDividendInput}
            onChange={(event) => onManualDividendInputChange(event.currentTarget.value)}
          />
        </label>
        <label className="manual-dividend-field">
          <span>Expected yearly dividend</span>
          <input
            aria-label="Expected yearly dividend"
            inputMode="numeric"
            spellCheck={false}
            value={expectedDividendInput}
            onChange={(event) => onExpectedDividendInputChange(event.currentTarget.value)}
          />
        </label>
      </div>
      <strong className="dividend-total">{formatCurrency(summary.yearToDate, currency)}</strong>
      <div className="dividend-grid">
        <div>
          <span>Expected yearly</span>
          <strong>{formatCurrency(expectedAnnualDividend, currency)}</strong>
        </div>
        {Object.entries(summary.byQuarter).length === 0 ? (
          <p className="empty-inline">No quarterly dividend rows imported yet.</p>
        ) : (
          Object.entries(summary.byQuarter).map(([quarter, amount]) => (
            <div key={quarter}>
              <span>{quarter}</span>
              <strong>{formatCurrency(amount, currency)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
