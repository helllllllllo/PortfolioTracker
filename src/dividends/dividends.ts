import { parseISO } from "date-fns";
import type { Currency, DividendSummary, DividendState } from "../types";

export type DividendRow = {
  date: string;
  amount: number;
  state: Exclude<DividendState, "unavailable">;
  currency?: Currency;
};

function quarterKey(date: string): string {
  const parsed = parseISO(date);
  return `${parsed.getFullYear()} Q${Math.floor(parsed.getMonth() / 3) + 1}`;
}

function yearOf(date: string): number {
  return parseISO(date).getFullYear();
}

export function summarizeDividends(rows: DividendRow[]): DividendSummary {
  if (rows.length === 0) {
    return {
      state: "unavailable",
      yearToDate: 0,
      byQuarter: {},
      message: "No dividend data imported or found from free sources."
    };
  }

  const byQuarter: Record<string, number> = {};
  let yearToDate = 0;
  let hasEstimated = false;
  const latestImportedYear = Math.max(...rows.map((row) => yearOf(row.date)));

  for (const row of rows) {
    const key = quarterKey(row.date);
    byQuarter[key] = (byQuarter[key] ?? 0) + row.amount;
    if (yearOf(row.date) === latestImportedYear) {
      yearToDate += row.amount;
    }
    hasEstimated = hasEstimated || row.state === "estimated";
  }

  return {
    state: hasEstimated ? "estimated" : "confirmed",
    yearToDate,
    byQuarter,
    message: hasEstimated ? "Estimated dividend data loaded." : "Confirmed dividend data loaded."
  };
}
