import { formatCurrency } from "../format";
import type { Currency } from "../types";

export type ManualAdjustmentRow = {
  id: string;
  label: string;
  treatment: string;
  amount: number;
};

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function numberClass(value: number | null): string {
  if (value === null || value === 0) return "number-neutral";
  return value > 0 ? "number-positive" : "number-negative";
}

export function PerformanceMethodPanel({
  currency,
  unitNavReturn,
  beginningValue,
  netContributions,
  investmentChange,
  endingValue,
  benchmarkLabel,
  adjustments
}: {
  currency: Currency;
  unitNavReturn: number | null;
  beginningValue: number;
  netContributions: number;
  investmentChange: number;
  endingValue: number;
  benchmarkLabel: string;
  adjustments: ManualAdjustmentRow[];
}) {
  return (
    <section className="panel performance-method-panel" aria-label="Performance method">
      <div className="panel-heading">
        <div>
          <h2>Performance Method</h2>
          <p className="subtle">Unit NAV return line against {benchmarkLabel}.</p>
        </div>
      </div>

      <div className="method-metrics" aria-label="Method summary">
        <div className="method-metric method-metric-primary">
          <span>Unit NAV</span>
          <strong className={numberClass(unitNavReturn)}>{formatPercent(unitNavReturn)}</strong>
        </div>
        <div className="method-metric">
          <span>Ending Value</span>
          <strong>{formatCurrency(endingValue, currency)}</strong>
        </div>
        <div className="method-metric">
          <span>Net Contributions</span>
          <strong>{formatCurrency(netContributions, currency)}</strong>
        </div>
        <div className="method-metric">
          <span>Investment Change</span>
          <strong className={numberClass(investmentChange)}>
            {formatCurrency(investmentChange, currency)}
          </strong>
        </div>
      </div>

      <div className="reconciliation-card">
        <h3>Value vs Net Contributions</h3>
        <div className="reconciliation-flow">
          <div>
            <span>Beginning Value</span>
            <strong>{formatCurrency(beginningValue, currency)}</strong>
          </div>
          <div>
            <span>Net Contributions</span>
            <strong>{formatCurrency(netContributions, currency)}</strong>
          </div>
          <div>
            <span>Investment Change</span>
            <strong className={numberClass(investmentChange)}>
              {formatCurrency(investmentChange, currency)}
            </strong>
          </div>
          <div>
            <span>Ending Value</span>
            <strong>{formatCurrency(endingValue, currency)}</strong>
          </div>
        </div>
      </div>

      <div className="manual-adjustments">
        <h3>Manual Adjustments</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Adjustment</th>
                <th>Treatment</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{row.treatment}</td>
                  <td>{formatCurrency(row.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
