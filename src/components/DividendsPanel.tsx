import { formatCurrency } from "../format";
import type { Currency, DividendSummary } from "../types";

const SOURCE_LABEL: Record<string, string> = {
  csv: "imported CSV",
  "j-quants": "J-Quants estimate (net 15.315%)",
  none: "refresh to load"
};

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`;
}

export function DividendsPanel({
  summary,
  currency,
  source,
  forwardAnnualIncome,
  forwardYield
}: {
  summary: DividendSummary;
  currency: Currency;
  source: "csv" | "j-quants" | "none";
  forwardAnnualIncome: number;
  forwardYield: number | null;
}) {
  return (
    <section className="panel dividends-panel">
      <div className="panel-heading">
        <div>
          <h2>Dividends &amp; yield</h2>
          <p className="subtle">Realized income (added to total return) · source: {SOURCE_LABEL[source]}</p>
        </div>
      </div>

      <strong className="dividend-total">{formatCurrency(summary.yearToDate, currency)}</strong>
      <p className="dividend-state">Realized to date</p>

      <div className="dividend-grid">
        <div>
          <span>Forward 12M income</span>
          <strong>{formatCurrency(forwardAnnualIncome, currency)}</strong>
        </div>
        <div>
          <span>Portfolio yield</span>
          <strong>{pct(forwardYield)}</strong>
        </div>
        {Object.entries(summary.byQuarter).length === 0 ? (
          <p className="empty-inline">No dividends recorded yet.</p>
        ) : (
          Object.entries(summary.byQuarter)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([quarter, amount]) => (
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
