import { format, parseISO } from "date-fns";
import type {
  BenchmarkPoint,
  PortfolioSnapshot,
  QuarterlyReturn
} from "../types";

export function buildCurrentSnapshot(input: {
  date: string;
  cash: number;
  holdingsValue: number;
  inferredInitialCash: number;
}): PortfolioSnapshot {
  const units = input.inferredInitialCash / 100;
  const nav = input.cash + input.holdingsValue;

  return {
    date: input.date,
    cash: input.cash,
    holdingsValue: input.holdingsValue,
    nav,
    navTotalReturn: nav,
    units,
    unitNav: units === 0 ? 100 : nav / units
  };
}

export function applyCashFlowToSnapshot(
  snapshot: PortfolioSnapshot,
  cash: number
): PortfolioSnapshot {
  const nav = cash + snapshot.holdingsValue;
  const unitNav = snapshot.unitNav || 100;

  return {
    ...snapshot,
    cash,
    nav,
    navTotalReturn: nav,
    units: nav / unitNav,
    unitNav
  };
}

export function applyInternalIncomeToSnapshot(
  snapshot: PortfolioSnapshot,
  income: number
): PortfolioSnapshot {
  const normalizedIncome = Number.isFinite(income) && income > 0 ? income : 0;
  if (normalizedIncome === 0) return snapshot;

  const cash = snapshot.cash + normalizedIncome;
  const nav = cash + snapshot.holdingsValue;

  return {
    ...snapshot,
    cash,
    nav,
    navTotalReturn: nav,
    unitNav: snapshot.units === 0 ? snapshot.unitNav || 100 : nav / snapshot.units
  };
}

export function investmentChangeBetweenSnapshots(
  previous: PortfolioSnapshot,
  current: PortfolioSnapshot
): number | null {
  if (previous.unitNav === 0) return null;
  return previous.nav * (current.unitNav / previous.unitNav - 1);
}

function quarterKey(date: string): string {
  const parsed = parseISO(date);
  const quarter = Math.floor(parsed.getMonth() / 3) + 1;
  return `${format(parsed, "yyyy")} Q${quarter}`;
}

function quarterStartDate(quarter: string): string {
  const [yearText, quarterText] = quarter.split(" ");
  const quarterNumber = Number(quarterText.replace("Q", ""));
  const month = (quarterNumber - 1) * 3 + 1;
  return `${yearText}-${String(month).padStart(2, "0")}-01`;
}

function compareQuarter(a: string, b: string): number {
  const [aYear, aQuarterText] = a.split(" ");
  const [bYear, bQuarterText] = b.split(" ");
  const aQuarter = Number(aQuarterText.replace("Q", ""));
  const bQuarter = Number(bQuarterText.replace("Q", ""));

  if (aYear !== bYear) return Number(aYear) - Number(bYear);
  return aQuarter - bQuarter;
}

function periodReturn<T>(
  rows: T[],
  getDate: (row: T) => string,
  getValue: (row: T) => number,
  quarter: string
): number | null {
  const ordered = [...rows].sort((a, b) => getDate(a).localeCompare(getDate(b)));
  const startDate = quarterStartDate(quarter);
  const inQuarter = ordered.filter((row) => quarterKey(getDate(row)) === quarter);

  if (inQuarter.length === 0) return null;
  const first = ordered.filter((row) => getDate(row) < startDate).at(-1) ?? inQuarter[0];
  const last = inQuarter[inQuarter.length - 1];
  if (getDate(first) === getDate(last)) return null;
  const start = getValue(first);
  const end = getValue(last);
  if (start === 0) return null;
  return Number((end / start - 1).toFixed(12));
}

export function buildUnitReturnSeries(snapshots: PortfolioSnapshot[]): PortfolioSnapshot[] {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  return ordered.map((snapshot) => {
    const nav = snapshot.cash + snapshot.holdingsValue;
    const unitNav = snapshot.units === 0 ? 100 : nav / snapshot.units;
    return { ...snapshot, nav, navTotalReturn: nav, unitNav };
  });
}

export function quarterlyReturns(
  portfolio: PortfolioSnapshot[],
  topix: BenchmarkPoint[],
  nikkei225: BenchmarkPoint[]
): QuarterlyReturn[] {
  const quarters = Array.from(new Set(portfolio.map((row) => quarterKey(row.date)))).sort(
    compareQuarter
  );

  return quarters
    .map((quarter) => {
      const portfolioReturn = periodReturn(portfolio, (row) => row.date, (row) => row.unitNav, quarter);
      const topixReturn = periodReturn(topix, (row) => row.date, (row) => row.normalized, quarter);
      const nikkei225Return = periodReturn(nikkei225, (row) => row.date, (row) => row.normalized, quarter);

      return {
        quarter,
        portfolioReturn,
        topixReturn,
        nikkei225Return,
        vsTopix:
          portfolioReturn === null || topixReturn === null ? null : portfolioReturn - topixReturn,
        vsNikkei225:
          portfolioReturn === null || nikkei225Return === null ? null : portfolioReturn - nikkei225Return,
        dividendContribution: null
      };
    })
    .filter(
      (row) =>
        row.portfolioReturn !== null || row.topixReturn !== null || row.nikkei225Return !== null
    );
}
