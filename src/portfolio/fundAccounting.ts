import type { CashFlow, ExternalDividend, PortfolioSnapshot, Trade } from "../types";
import { splitAdjustTrades } from "./corporateActions";
import type { SplitEvent } from "./corporateActions";

export const UNIT_BASE = 100;

export type PriceHistory = Record<string, { date: string; close: number }[]>;

export type FundInputs = {
  trades: Trade[];
  cashFlows: CashFlow[];
  dividends: ExternalDividend[];
  historyByCode: PriceHistory;
  latestPriceByCode?: Record<string, number>;
  asOfDate: string;
  splits?: readonly SplitEvent[];
};

type Position = { qty: number; costBasis: number; avgCost: number; realized: number };

function groupByDate<T>(items: T[], getDate: (x: T) => string, max: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const date = getDate(item);
    if (date > max) continue;
    const bucket = map.get(date);
    if (bucket) bucket.push(item);
    else map.set(date, [item]);
  }
  return map;
}

function applyTrade(positions: Map<string, Position>, trade: Trade, onCash: (delta: number) => void): void {
  const pos = positions.get(trade.code) ?? { qty: 0, costBasis: 0, avgCost: 0, realized: 0 };
  if (trade.side === "buy") {
    onCash(-trade.grossAmount);
    pos.costBasis += trade.grossAmount;
    pos.qty += trade.quantity;
    pos.avgCost = pos.qty === 0 ? 0 : pos.costBasis / pos.qty;
  } else if (trade.side === "sell") {
    const sold = Math.min(trade.quantity, pos.qty);
    const removed = pos.avgCost * sold;
    pos.qty -= sold;
    pos.costBasis -= removed;
    pos.realized += trade.grossAmount - removed;
    pos.avgCost = pos.qty === 0 ? 0 : pos.costBasis / pos.qty;
    onCash(trade.grossAmount);
  } else if (trade.side === "split" && pos.qty > 0 && trade.quantity > 0) {
    pos.qty = trade.quantity;
    pos.avgCost = pos.costBasis / pos.qty;
  }
  positions.set(trade.code, pos);
}

export function buildFundSnapshots(inputs: FundInputs): PortfolioSnapshot[] {
  const { cashFlows, dividends, historyByCode, latestPriceByCode, asOfDate, splits } = inputs;
  const trades = splitAdjustTrades(inputs.trades, splits);

  const eventDates = new Set<string>();
  for (const t of trades) if (t.tradeDate <= asOfDate) eventDates.add(t.tradeDate);
  for (const c of cashFlows) if (c.date <= asOfDate) eventDates.add(c.date);
  for (const d of dividends) if (d.date <= asOfDate) eventDates.add(d.date);
  if (eventDates.size === 0) return [];

  const inception = [...eventDates].sort()[0];

  const sortedHistory: PriceHistory = {};
  for (const [code, rows] of Object.entries(historyByCode)) {
    sortedHistory[code] = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  }

  const historyDates = new Set<string>();
  for (const rows of Object.values(sortedHistory)) {
    for (const row of rows) if (row.date >= inception && row.date <= asOfDate) historyDates.add(row.date);
  }

  const dates = Array.from(new Set<string>([...eventDates, ...historyDates, asOfDate]))
    .filter((date) => date >= inception && date <= asOfDate)
    .sort((a, b) => a.localeCompare(b));

  const tradesByDate = groupByDate(trades, (t) => t.tradeDate, asOfDate);
  const flowsByDate = groupByDate(cashFlows, (c) => c.date, asOfDate);
  const divsByDate = groupByDate(dividends, (d) => d.date, asOfDate);

  const positions = new Map<string, Position>();
  let cash = 0;
  let units = 0;
  let cumulativeDividends = 0;

  const priceOf = (code: string, date: string): number => {
    if (date === asOfDate && latestPriceByCode && latestPriceByCode[code] != null) {
      return latestPriceByCode[code];
    }
    const rows = sortedHistory[code];
    const fallback = positions.get(code)?.avgCost ?? 0;
    if (!rows) return fallback;
    let price = fallback;
    for (const row of rows) {
      if (row.date <= date) price = row.close;
      else break;
    }
    return price;
  };

  const markHoldings = (date: string): number => {
    let sum = 0;
    for (const [code, pos] of positions) if (pos.qty > 0) sum += priceOf(code, date) * pos.qty;
    return sum;
  };

  const snapshots: PortfolioSnapshot[] = [];

  for (const date of dates) {
    // Pre-flow unit price for issuing/redeeming units at the prevailing price
    const preHoldings = markHoldings(date);
    const preNavTR = preHoldings + cash + cumulativeDividends;
    const unitPrice = units === 0 ? UNIT_BASE : preNavTR / units;

    for (const flow of flowsByDate.get(date) ?? []) {
      if (flow.kind === "contribution") {
        units += flow.amount / unitPrice;
        cash += flow.amount;
      } else if (flow.kind === "withdrawal") {
        units -= flow.amount / unitPrice;
        cash -= flow.amount;
      } else {
        cash += flow.amount; // income (lending): raises NAV, issues no units
      }
    }

    for (const trade of tradesByDate.get(date) ?? []) {
      applyTrade(positions, trade, (delta) => {
        cash += delta;
      });
    }

    for (const dividend of divsByDate.get(date) ?? []) {
      cumulativeDividends += dividend.amount; // add-back: total return only
    }

    const holdingsValue = markHoldings(date);
    const nav = holdingsValue + cash;
    const navTotalReturn = nav + cumulativeDividends;
    snapshots.push({
      date,
      cash,
      holdingsValue,
      nav,
      navTotalReturn,
      units,
      unitNav: units === 0 ? UNIT_BASE : navTotalReturn / units,
    });
  }

  return snapshots;
}

export type PeriodKey = "inception" | "ytd" | "qtd" | "mtd";

export function periodStartDate(asOf: string, period: PeriodKey): string | null {
  const d = new Date(`${asOf}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based
  if (period === "inception") return null;
  if (period === "ytd") return `${year}-01-01`;
  if (period === "mtd") return `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const quarterStartMonth = Math.floor(month / 3) * 3; // 0, 3, 6, 9
  return `${year}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`;
}

export function timeWeightedReturn(snapshots: PortfolioSnapshot[], period: PeriodKey): number | null {
  if (snapshots.length === 0) return null;
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const end = ordered[ordered.length - 1];
  const startDate = periodStartDate(end.date, period);

  const startUnit =
    startDate === null
      ? UNIT_BASE
      : ordered.filter((s) => s.date < startDate).at(-1)?.unitNav ??
        ordered.find((s) => s.date >= startDate)?.unitNav ??
        null;

  if (startUnit === null || startUnit === 0) return null;
  return end.unitNav / startUnit - 1;
}
