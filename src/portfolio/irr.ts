import type { CashFlow, ExternalDividend } from "../types";

export type DatedFlow = { date: string; amount: number };
const DAY_MS = 86400000;

function yearsBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / (365 * DAY_MS);
}

export function xirr(flows: DatedFlow[]): number | null {
  const nonzero = flows.filter((flow) => flow.amount !== 0);
  if (nonzero.length < 2) return null;
  if (!nonzero.some((flow) => flow.amount > 0) || !nonzero.some((flow) => flow.amount < 0)) {
    return null;
  }

  const t0 = [...nonzero].sort((a, b) => a.date.localeCompare(b.date))[0].date;
  const npv = (rate: number) =>
    nonzero.reduce((sum, flow) => sum + flow.amount / Math.pow(1 + rate, yearsBetween(t0, flow.date)), 0);

  let lo = -0.9999;
  let hi = 10; // 1000% annual ceiling
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return null; // no bracketed root

  for (let i = 0; i < 300; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-10) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function moneyWeightedReturn(
  cashFlows: CashFlow[],
  dividends: ExternalDividend[],
  endingNav: number,
  asOf: string
): number | null {
  const flows: DatedFlow[] = [];
  for (const cashFlow of cashFlows) {
    if (cashFlow.kind === "contribution") flows.push({ date: cashFlow.date, amount: -cashFlow.amount });
    else if (cashFlow.kind === "withdrawal") flows.push({ date: cashFlow.date, amount: cashFlow.amount });
    // income (lending) stays in the fund and is captured by endingNav
  }
  for (const dividend of dividends) flows.push({ date: dividend.date, amount: dividend.amount });
  flows.push({ date: asOf, amount: endingNav });
  return xirr(flows);
}
