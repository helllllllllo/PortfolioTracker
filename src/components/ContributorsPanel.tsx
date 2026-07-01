import { formatCurrency } from "../format";
import type { Attribution } from "../portfolio/attribution";
import type { Currency } from "../types";

function Row({ item, currency }: { item: Attribution; currency: Currency }) {
  const tone = item.totalPnl > 0 ? "stat-positive" : item.totalPnl < 0 ? "stat-negative" : "";
  const prefix = item.totalPnl > 0 ? "+" : "";
  return (
    <div className="contributor-row">
      <div>
        <strong>{item.name}</strong>
        <span>{item.code}</span>
      </div>
      <span className={`contributor-pnl ${tone}`}>
        {prefix}
        {formatCurrency(item.totalPnl, currency)}
      </span>
    </div>
  );
}

export function ContributorsPanel({
  attribution,
  currency
}: {
  attribution: Attribution[];
  currency: Currency;
}) {
  const contributors = attribution.filter((item) => item.totalPnl > 0).slice(0, 5);
  const detractors = attribution
    .filter((item) => item.totalPnl < 0)
    .slice(-5)
    .reverse();

  return (
    <section className="panel contributors-panel">
      <div className="panel-heading">
        <div>
          <h2>Contributors &amp; detractors</h2>
          <p className="subtle">Total P&amp;L by position (realized + unrealized)</p>
        </div>
      </div>

      {attribution.length === 0 ? (
        <p className="empty-inline">Import trades and refresh quotes to see attribution.</p>
      ) : (
        <div className="contributors-grid">
          <div>
            <h3 className="contributor-head stat-positive">Top contributors</h3>
            {contributors.length === 0 ? (
              <p className="empty-inline">None positive yet.</p>
            ) : (
              contributors.map((item) => <Row key={item.code} item={item} currency={currency} />)
            )}
          </div>
          <div>
            <h3 className="contributor-head stat-negative">Top detractors</h3>
            {detractors.length === 0 ? (
              <p className="empty-inline">None negative.</p>
            ) : (
              detractors.map((item) => <Row key={item.code} item={item} currency={currency} />)
            )}
          </div>
        </div>
      )}
    </section>
  );
}
