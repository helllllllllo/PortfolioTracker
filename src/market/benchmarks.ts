import type { BenchmarkPoint } from "../types";

export function normalizeBenchmark(
  rows: Array<{ date: string; value: number }>,
  source: string
): BenchmarkPoint[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]?.value ?? 0;

  return sorted.map((row) => ({
    date: row.date,
    value: row.value,
    normalized: first === 0 ? 100 : Number(((row.value / first) * 100).toFixed(12)),
    source
  }));
}
