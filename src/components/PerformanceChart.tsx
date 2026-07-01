import { useRef } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { NormalizedPerformancePoint } from "../types";
import { DownloadPngButton } from "./DownloadPngButton";

type PerformanceInsight = {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
};

export type BenchmarkLabels = {
  primary: string;
  secondary?: string;
};

const DEFAULT_BENCHMARK_LABELS: BenchmarkLabels = {
  primary: "TOPIX (TR)",
  secondary: "Nikkei 225 (TR)"
};

const COLORS = {
  portfolio: "#0f766e",
  topix: "#2563eb",
  nikkei: "#d97706"
};

function formatDelta(value: number | null, unit = "pts"): string {
  if (value === null) return "N/A";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)} ${unit}`;
}

function formatPct(value: number | null): string {
  if (value === null) return "N/A";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${(value * 100).toFixed(2)}%`;
}

function toneFor(value: number | null): PerformanceInsight["tone"] {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function latestPoint(data: NormalizedPerformancePoint[]): NormalizedPerformancePoint | null {
  return (
    [...data]
      .reverse()
      .find((point) => point.portfolio !== null || point.topix !== null || point.nikkei225 !== null) ??
    null
  );
}

function buildInsights(
  data: NormalizedPerformancePoint[],
  labels: BenchmarkLabels
): PerformanceInsight[] {
  const latest = latestPoint(data);
  const latestPortfolio = latest?.portfolio ?? null;
  const sinceInception = latestPortfolio === null ? null : latestPortfolio / 100 - 1;
  const primaryExcess =
    latestPortfolio === null || latest?.topix === null || latest?.topix === undefined
      ? null
      : latestPortfolio - latest.topix;
  const secondaryExcess =
    latestPortfolio === null || latest?.nikkei225 === null || latest?.nikkei225 === undefined
      ? null
      : latestPortfolio - latest.nikkei225;

  return [
    {
      label: "Return (since start)",
      value: formatPct(sinceInception),
      tone: toneFor(sinceInception)
    },
    {
      label: `Excess vs ${labels.primary.replace(" (TR)", "")}`,
      value: formatDelta(primaryExcess),
      tone: toneFor(primaryExcess)
    },
    ...(labels.secondary
      ? [
          {
            label: `Excess vs ${labels.secondary.replace(" 225", "").replace(" (TR)", "")}`,
            value: formatDelta(secondaryExcess),
            tone: toneFor(secondaryExcess)
          }
        ]
      : [])
  ];
}

export function PerformanceChart({
  data,
  benchmarkLabels = DEFAULT_BENCHMARK_LABELS,
  asOf,
  fundName = "Hiroshi Capital"
}: {
  data: NormalizedPerformancePoint[];
  benchmarkLabels?: BenchmarkLabels;
  asOf?: string;
  fundName?: string;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const insights = buildInsights(data, benchmarkLabels);
  const asOfLabel = asOf ? `as of ${asOf}` : "";

  return (
    <section className="panel report-card chart-panel" ref={cardRef}>
      <div className="report-heading">
        <div>
          <p className="report-eyebrow">{fundName}</p>
          <h2>Performance</h2>
          <p className="report-sub">
            Total return vs {benchmarkLabels.primary}
            {benchmarkLabels.secondary ? ` & ${benchmarkLabels.secondary}` : ""} · rebased to 100
            {asOfLabel ? ` · ${asOfLabel}` : ""}
          </p>
        </div>
        <DownloadPngButton
          targetRef={cardRef}
          filename={`hiroshi-capital-performance-${asOf ?? "latest"}.png`}
        />
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 18, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.portfolio} stopOpacity={0.16} />
              <stop offset="100%" stopColor={COLORS.portfolio} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e8ede9" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} stroke="#7c8b86" fontSize={11} minTickGap={40} />
          <YAxis
            domain={["dataMin - 2", "dataMax + 2"]}
            tickLine={false}
            axisLine={false}
            stroke="#7c8b86"
            fontSize={11}
            width={38}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e2e8e4",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(15, 32, 30, 0.12)",
              color: "#1a2b2e"
            }}
            formatter={(value) => (typeof value === "number" ? value.toFixed(1) : String(value))}
          />
          <Legend verticalAlign="top" height={30} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="portfolio"
            name={fundName}
            stroke={COLORS.portfolio}
            strokeWidth={2.6}
            fill="url(#portfolioFill)"
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="topix"
            name={benchmarkLabels.primary}
            stroke={COLORS.topix}
            strokeWidth={2}
            dot={false}
          />
          {benchmarkLabels.secondary ? (
            <Line
              type="monotone"
              dataKey="nikkei225"
              name={benchmarkLabels.secondary}
              stroke={COLORS.nikkei}
              strokeWidth={2}
              dot={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="report-stats" aria-label="Performance analytics">
        {insights.map((insight) => (
          <div className={`report-stat stat-${insight.tone}`} key={insight.label}>
            <span>{insight.label}</span>
            <strong>{insight.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
