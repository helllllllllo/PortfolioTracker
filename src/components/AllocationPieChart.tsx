import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "../format";
import type { AllocationSlice } from "../portfolio/allocation";
import type { Currency } from "../types";

const COLORS = ["#14b8a6", "#38bdf8", "#f59e0b", "#f43f5e", "#a3e635", "#818cf8", "#94a3b8"];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function AllocationPieChart({
  slices,
  currency
}: {
  slices: AllocationSlice[];
  currency: Currency;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section className="panel allocation-panel" aria-label="Portfolio allocation">
      <div className="panel-heading">
        <div>
          <h2>Allocation</h2>
          <p className="subtle">Capital map across holdings and cash</p>
        </div>
      </div>

      {slices.length === 0 ? (
        <p className="empty-inline">Import your latest SBI CSV to populate allocation.</p>
      ) : (
        <div className="allocation-layout">
          <div className="allocation-chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="60%"
                  outerRadius="84%"
                  paddingAngle={2}
                  stroke="#101820"
                  strokeWidth={2}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.id} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  labelFormatter={(label) => String(label)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="allocation-total">
              <span>Total</span>
              <strong>{formatCurrency(total, currency)}</strong>
            </div>
          </div>

          <div className="allocation-list">
            {slices.map((slice, index) => (
              <div className="allocation-row" key={slice.id}>
                <span
                  className="allocation-swatch"
                  style={{ background: COLORS[index % COLORS.length] }}
                />
                <div>
                  <strong>{slice.label}</strong>
                  <span>{slice.detail}</span>
                </div>
                <div className="allocation-values">
                  <strong>{pct(slice.weight)}</strong>
                  <span>{formatCurrency(slice.value, currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
