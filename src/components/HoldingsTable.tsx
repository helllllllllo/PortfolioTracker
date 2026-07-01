import { formatCurrency } from "../format";
import type { Currency, PricedHolding } from "../types";

function quoteLabel(holding: PricedHolding): string {
  if (holding.quote.status === "missing") return "missing (average cost fallback)";
  return holding.quote.status;
}

function quoteClass(holding: PricedHolding): string {
  return `quote-chip quote-${holding.quote.status.replace(/[^a-z-]/gi, "-").toLowerCase()}`;
}

function pnlClass(value: number): string {
  if (value === 0) return "number-neutral";
  return value > 0 ? "number-positive" : "number-negative";
}

export function HoldingsTable({
  holdings,
  currency
}: {
  holdings: PricedHolding[];
  currency: Currency;
}) {
  return (
    <section className="panel holdings-panel">
      <div className="panel-heading">
        <div>
          <h2>Holdings</h2>
          <p className="subtle">Live marks, cash-aware allocation, and quote quality</p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Market</th>
              <th>Quantity</th>
              <th>Average cost</th>
              <th>Latest price</th>
              <th>Market value</th>
              <th>Unrealized P&amp;L</th>
              <th>Allocation</th>
              <th>Quote</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-table-cell">
                  Import your latest SBI CSV to populate the table.
                </td>
              </tr>
            ) : (
              holdings.map((holding) => (
                <tr key={holding.id}>
                  <td>{holding.code}</td>
                  <td>{holding.name}</td>
                  <td>{holding.market}</td>
                  <td>{holding.quantity.toLocaleString("ja-JP")}</td>
                  <td>{formatCurrency(holding.averageCost, currency)}</td>
                  <td>
                    {holding.latestPrice === null ? "N/A" : formatCurrency(holding.latestPrice, currency)}
                  </td>
                  <td>{formatCurrency(holding.marketValue, currency)}</td>
                  <td className={pnlClass(holding.unrealizedPnl)}>
                    {formatCurrency(holding.unrealizedPnl, currency)}
                  </td>
                  <td>{(holding.allocation * 100).toFixed(1)}%</td>
                  <td>
                    <span className={quoteClass(holding)}>{quoteLabel(holding)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
