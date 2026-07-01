import type { QuarterlyReturn } from "../types";
import type { BenchmarkLabels } from "./PerformanceChart";

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`;
}

function valueClass(value: number | null): string {
  if (value === null || value === 0) return "number-neutral";
  return value > 0 ? "number-positive" : "number-negative";
}

const DEFAULT_BENCHMARK_LABELS: BenchmarkLabels = {
  primary: "TOPIX proxy",
  secondary: "Nikkei 225 Net TR"
};

export function QuarterlyReturnsTable({
  rows,
  benchmarkLabels = DEFAULT_BENCHMARK_LABELS
}: {
  rows: QuarterlyReturn[];
  benchmarkLabels?: BenchmarkLabels;
}) {
  const emptyColSpan = benchmarkLabels.secondary ? 6 : 4;

  return (
    <section className="panel returns-panel">
      <div className="panel-heading">
        <div>
          <h2>Quarterly Returns</h2>
          <p className="subtle">
            Portfolio return compared with {benchmarkLabels.primary}
            {benchmarkLabels.secondary ? ` and ${benchmarkLabels.secondary}` : ""}
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Portfolio</th>
              <th>{benchmarkLabels.primary}</th>
              {benchmarkLabels.secondary ? <th>{benchmarkLabels.secondary}</th> : null}
              <th>Vs {benchmarkLabels.primary}</th>
              {benchmarkLabels.secondary ? <th>Vs {benchmarkLabels.secondary.replace(" 225", "")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={emptyColSpan} className="empty-table-cell">
                  Benchmark data appears after portfolio data is available.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.quarter}>
                  <td>{row.quarter}</td>
                  <td className={valueClass(row.portfolioReturn)}>{pct(row.portfolioReturn)}</td>
                  <td>{pct(row.topixReturn)}</td>
                  {benchmarkLabels.secondary ? <td>{pct(row.nikkei225Return)}</td> : null}
                  <td className={valueClass(row.vsTopix)}>{pct(row.vsTopix)}</td>
                  {benchmarkLabels.secondary ? (
                    <td className={valueClass(row.vsNikkei225)}>{pct(row.vsNikkei225)}</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
