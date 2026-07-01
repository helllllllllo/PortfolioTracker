import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { NormalizedPerformancePoint } from "../types";

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
  primary: "TOPIX proxy",
  secondary: "Nikkei 225 Net TR"
};

function formatIndex(value: number | null | undefined): string {
  return value === null || value === undefined ? "N/A" : value.toFixed(1);
}

function formatDelta(value: number | null): string {
  if (value === null) return "N/A";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)} pts`;
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

function portfolioDayMoves(data: NormalizedPerformancePoint[]): number[] {
  const portfolioPoints = data
    .map((point) => point.portfolio)
    .filter((value): value is number => value !== null);

  return portfolioPoints.slice(1).map((value, index) => value - portfolioPoints[index]);
}

function buildInsights(
  data: NormalizedPerformancePoint[],
  labels: BenchmarkLabels
): PerformanceInsight[] {
  const latest = latestPoint(data);
  const latestPortfolio = latest?.portfolio ?? null;
  const primaryExcess =
    latestPortfolio === null || latest?.topix === null || latest?.topix === undefined
      ? null
      : latestPortfolio - latest.topix;
  const secondaryExcess =
    latestPortfolio === null || latest?.nikkei225 === null || latest?.nikkei225 === undefined
      ? null
      : latestPortfolio - latest.nikkei225;
  const moves = portfolioDayMoves(data);
  const bestDay = moves.length === 0 ? null : Math.max(...moves);
  const worstDay = moves.length === 0 ? null : Math.min(...moves);

  return [
    {
      label: "Latest",
      value: formatIndex(latestPortfolio),
      tone: toneFor(latestPortfolio === null ? null : latestPortfolio - 100)
    },
    {
      label: `Excess vs ${labels.primary}`,
      value: formatDelta(primaryExcess),
      tone: toneFor(primaryExcess)
    },
    ...(labels.secondary
      ? [
          {
            label: `Excess vs ${labels.secondary.replace(" 225", "")}`,
            value: formatDelta(secondaryExcess),
            tone: toneFor(secondaryExcess)
          }
        ]
      : []),
    {
      label: "Best day",
      value: formatDelta(bestDay),
      tone: toneFor(bestDay)
    },
    {
      label: "Worst day",
      value: formatDelta(worstDay),
      tone: toneFor(worstDay)
    }
  ];
}

export function PerformanceChart({
  data,
  benchmarkLabels = DEFAULT_BENCHMARK_LABELS
}: {
  data: NormalizedPerformancePoint[];
  benchmarkLabels?: BenchmarkLabels;
}) {
  const insights = buildInsights(data, benchmarkLabels);
  const benchmarkSubtitle = benchmarkLabels.secondary
    ? `${benchmarkLabels.primary} / ${benchmarkLabels.secondary}`
    : benchmarkLabels.primary;

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Performance</h2>
          <p className="subtle">Portfolio vs {benchmarkSubtitle}</p>
        </div>
        <span className="panel-kicker">Rebased to 100</span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 18, bottom: 2, left: 0 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.17)" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} stroke="#8ea2a8" />
          <YAxis
            domain={["dataMin - 2", "dataMax + 2"]}
            tickLine={false}
            axisLine={false}
            stroke="#8ea2a8"
          />
          <Tooltip contentStyle={{ background: "#101820", border: "1px solid #24424a", borderRadius: 8 }} />
          <Legend verticalAlign="top" height={34} />
          <Line
            type="monotone"
            dataKey="portfolio"
            name="Portfolio"
            stroke="#14b8a6"
            strokeWidth={3.4}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="topix"
            name={benchmarkLabels.primary}
            stroke="#38bdf8"
            strokeWidth={2.5}
            dot={false}
          />
          {benchmarkLabels.secondary ? (
            <Line
              type="monotone"
              dataKey="nikkei225"
              name={benchmarkLabels.secondary}
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={false}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
      <div className="performance-insights" aria-label="Performance analytics">
        {insights.map((insight) => (
          <div className={`performance-insight insight-${insight.tone}`} key={insight.label}>
            <span>{insight.label}</span>
            <strong>{insight.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
