import { useRef } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "../format";
import type { AllocationSlice } from "../portfolio/allocation";
import type { Currency } from "../types";
import { DownloadPngButton } from "./DownloadPngButton";

const COLORS = [
  "#0f766e",
  "#2563eb",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#65a30d",
  "#db2777",
  "#94a3b8"
];

const TOP_SLICES = 8;

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function groupSlices(slices: AllocationSlice[]): AllocationSlice[] {
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  if (sorted.length <= TOP_SLICES + 1) return sorted;

  const shown = sorted.slice(0, TOP_SLICES);
  const rest = sorted.slice(TOP_SLICES);
  const otherValue = rest.reduce((sum, slice) => sum + slice.value, 0);
  const otherWeight = rest.reduce((sum, slice) => sum + slice.weight, 0);
  return [
    ...shown,
    { id: "other", label: `Other (${rest.length})`, detail: "smaller positions", value: otherValue, weight: otherWeight }
  ];
}

export function AllocationPieChart({
  slices,
  currency,
  asOf
}: {
  slices: AllocationSlice[];
  currency: Currency;
  asOf?: string;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const display = groupSlices(slices);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const asOfLabel = asOf ? `as of ${asOf}` : "Capital map across holdings and cash";

  return (
    <section className="panel report-card allocation-panel" aria-label="Portfolio allocation" ref={cardRef}>
      <div className="report-heading">
        <div>
          <p className="report-eyebrow">Hiroshi Capital</p>
          <h2>Allocation</h2>
          <p className="report-sub">{asOfLabel}</p>
        </div>
        {slices.length > 0 ? (
          <DownloadPngButton targetRef={cardRef} filename={`hiroshi-capital-allocation-${asOf ?? "latest"}.png`} />
        ) : null}
      </div>

      {display.length === 0 ? (
        <p className="empty-inline">Import your SBI trade and cash-flow CSVs to populate allocation.</p>
      ) : (
        <div className="allocation-layout">
          <div className="allocation-chart">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={display}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={1.5}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {display.map((slice, index) => (
                    <Cell key={slice.id} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e2e8e4",
                    borderRadius: 10,
                    color: "#1a2b2e"
                  }}
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  labelFormatter={(label) => String(label)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="allocation-total">
              <span>AUM</span>
              <strong>{formatCurrency(total, currency)}</strong>
            </div>
          </div>

          <div className="allocation-list">
            {display.map((slice, index) => (
              <div className="allocation-row" key={slice.id}>
                <span className="allocation-swatch" style={{ background: COLORS[index % COLORS.length] }} />
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
