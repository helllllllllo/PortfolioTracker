import type { BenchmarkPoint } from "../types";

// A broad index / index-ETF cannot move more than this in a single day; larger jumps
// are Yahoo bad ticks (e.g. a spurious ~1/10th close), so we drop them.
const MAX_DAILY_MOVE = 0.35;

function dropBadTicks(rows: Array<{ date: string; value: number }>): Array<{ date: string; value: number }> {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const kept: Array<{ date: string; value: number }> = [];
  let previous: number | null = null;
  for (const row of sorted) {
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    if (previous !== null && Math.abs(row.value / previous - 1) > MAX_DAILY_MOVE) continue;
    kept.push(row);
    previous = row.value;
  }
  return kept;
}

export function normalizeBenchmark(
  rows: Array<{ date: string; value: number }>,
  source: string
): BenchmarkPoint[] {
  const cleaned = dropBadTicks(rows);
  const first = cleaned[0]?.value ?? 0;

  return cleaned.map((row) => ({
    date: row.date,
    value: row.value,
    normalized: first === 0 ? 100 : Number(((row.value / first) * 100).toFixed(12)),
    source
  }));
}
