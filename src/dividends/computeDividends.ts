import type { ExternalDividend, Trade } from "../types";
import { buildPortfolioState } from "../portfolio/positions";

// One dividend disclosure from J-Quants /fins/dividend (cleaned server-side): a numeric
// per-share rate with real record/ex/pay dates.
export type DividendRecord = {
  code: string;
  divRate: number;
  recDate: string;
  exDate: string;
  payDate: string;
  discDate: string;
};

// JPX net total-return indices withhold 15.315% on dividends; using the same rate keeps
// the fund's added-back income consistent with the TOPIX/Nikkei net-TR benchmarks (and it
// matched Hiroshi Capital's actual received amount to within 0.4%).
export const DIVIDEND_WITHHOLDING = 0.15315;

type Options = {
  trackingStart: string;
  asOf: string;
  withholding?: number;
};

// Keep one row per (code, record date): the latest disclosure (handles revised forecasts
// and duplicate disclosures that would otherwise double-count).
function dedupeLatest(records: DividendRecord[]): DividendRecord[] {
  const byKey = new Map<string, DividendRecord>();
  for (const record of records) {
    const key = `${record.code}:${record.recDate}`;
    const existing = byKey.get(key);
    if (!existing || record.discDate > existing.discDate) byKey.set(key, record);
  }
  return [...byKey.values()];
}

function sharesHeldOn(trades: Trade[], code: string, date: string): number {
  // As-traded (raw) shares — the per-share DivRate is announced on the as-traded share,
  // so split adjustment must NOT be applied here.
  return buildPortfolioState(trades, date, []).holdings.find((h) => h.code === code)?.quantity ?? 0;
}

export function computeDividends(
  recordsByCode: Record<string, DividendRecord[]>,
  trades: Trade[],
  nav: number,
  options: Options
): { realized: ExternalDividend[]; forwardAnnualIncome: number; forwardYield: number | null } {
  const withholding = options.withholding ?? DIVIDEND_WITHHOLDING;
  const net = (gross: number) => gross * (1 - withholding);
  const all = dedupeLatest(Object.values(recordsByCode).flat());
  const oneYearAgo = new Date(`${options.asOf}T00:00:00Z`);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const trailingFrom = oneYearAgo.toISOString().slice(0, 10);

  const realized: ExternalDividend[] = [];
  let forwardAnnualIncome = 0;

  for (const record of all) {
    if (!Number.isFinite(record.divRate) || record.divRate <= 0) continue;

    // Realized: dividends actually paid within the tracking period, valued at the shares
    // held on the record date.
    if (record.payDate >= options.trackingStart && record.payDate <= options.asOf) {
      const shares = sharesHeldOn(trades, record.code, record.recDate);
      if (shares > 0) {
        realized.push({
          date: record.payDate,
          amount: net(record.divRate * shares),
          code: record.code,
          note: "J-Quants estimate"
        });
      }
    }

    // Forward: trailing-12-month per-share dividends valued at CURRENT holdings.
    if (record.payDate >= trailingFrom && record.payDate <= options.asOf) {
      const currentShares = sharesHeldOn(trades, record.code, options.asOf);
      forwardAnnualIncome += net(record.divRate * currentShares);
    }
  }

  realized.sort((a, b) => a.date.localeCompare(b.date));
  return {
    realized,
    forwardAnnualIncome,
    forwardYield: nav > 0 ? forwardAnnualIncome / nav : null
  };
}
