import { applyCashFlowToSnapshot, applyInternalIncomeToSnapshot, buildCurrentSnapshot } from "./nav";
import {
  applyEligibleStockSplitsToHoldings,
  canonicalHoldingMarket
} from "./corporateActions";
import { FUND_TRACKING_START_DATE } from "./constants";
import type { NormalizedPerformancePoint, PortfolioSnapshot, Quote, Trade } from "../types";
import type { BenchmarkPoint, Holding } from "../types";

export type HoldingHistoryPoint = {
  date: string;
  close: number;
};

export type HoldingHistoryMap = Record<string, HoldingHistoryPoint[]>;

type MutableHoldingState = Holding;

function holdingId(code: string, market: string): string {
  return `${code}::${market}`;
}

function sortDatesAscending(a: string, b: string): number {
  return a.localeCompare(b);
}

function rebaseSeries<T>(
  rows: T[],
  getDate: (row: T) => string,
  getValue: (row: T) => number | null,
  startDate: string
): Map<string, number | null> {
  const sorted = [...rows]
    .filter((row) => getDate(row) >= startDate)
    .sort((a, b) => sortDatesAscending(getDate(a), getDate(b)));
  const base =
    sorted
      .map(getValue)
      .find((value): value is number => value !== null && Number.isFinite(value) && value !== 0) ??
    null;

  return new Map(
    sorted.map((row) => {
      const value = getValue(row);
      return [
        getDate(row),
        base === null || value === null ? null : Number(((value / base) * 100).toFixed(12))
      ];
    })
  );
}

function buildStateThroughDate(
  trades: Trade[],
  date: string,
  inferredInitialCash: number,
  splitAdjustmentDate: string
): {
  cash: number;
  holdings: Holding[];
} {
  const byId = new Map<string, MutableHoldingState>();
  const appliedSplitIds = new Set<string>();
  let cash = inferredInitialCash;

  for (const trade of trades) {
    if (trade.tradeDate > date) continue;
    applyEligibleStockSplitsToHoldings(byId, appliedSplitIds, trade.tradeDate);

    const market = canonicalHoldingMarket(trade.market);
    const id = holdingId(trade.code, market);
    const holding = byId.get(id) ?? {
      id,
      code: trade.code,
      name: trade.name,
      market,
      quantity: 0,
      averageCost: 0,
      costBasis: 0,
      realizedPnl: 0,
      currency: trade.currency
    };

    if (trade.side === "buy") {
      cash -= trade.grossAmount;
      holding.costBasis += trade.grossAmount;
      holding.quantity += trade.quantity;
      holding.averageCost = holding.quantity === 0 ? 0 : holding.costBasis / holding.quantity;
      holding.currency = trade.currency ?? holding.currency;
      if (trade.grossAmount === 0 && trade.currency === "USD") {
        holding.costBasisWarning = "Transferred or split shares may not include original cost basis";
      }
    } else if (trade.side === "sell") {
      const quantitySold = Math.min(trade.quantity, holding.quantity);
      const removedCost = holding.averageCost * quantitySold;
      holding.quantity -= quantitySold;
      holding.costBasis -= removedCost;
      holding.realizedPnl += trade.grossAmount - removedCost;
      holding.averageCost = holding.quantity === 0 ? 0 : holding.costBasis / holding.quantity;
      cash += trade.grossAmount;
    } else if (trade.side === "split" && holding.quantity > 0 && trade.quantity > 0) {
      holding.quantity = trade.quantity;
      holding.averageCost = holding.costBasis / holding.quantity;
    }

    byId.set(id, holding);
  }

  applyEligibleStockSplitsToHoldings(byId, appliedSplitIds, splitAdjustmentDate);

  return {
    cash,
    holdings: Array.from(byId.values())
      .filter((holding) => holding.quantity > 0)
  };
}

function priceForDate(
  holding: Holding,
  historyByHoldingId: HoldingHistoryMap,
  date: string,
  latestQuotesById?: Map<string, Quote>
): number {
  const latestQuote = latestQuotesById?.get(holding.id);
  if (latestQuote?.price !== null && latestQuote?.price !== undefined) {
    return latestQuote.price;
  }

  const priceFromHistory = [...(historyByHoldingId[holding.id] ?? [])]
    .sort((a, b) => sortDatesAscending(a.date, b.date))
    .filter((row) => row.date <= date)
    .at(-1)?.close;

  return priceFromHistory ?? holding.averageCost;
}

function buildSnapshotForDate(input: {
  date: string;
  trades: Trade[];
  historyByHoldingId: HoldingHistoryMap;
  inferredInitialCash: number;
  splitAdjustmentDate: string;
  latestQuotesById?: Map<string, Quote>;
}): PortfolioSnapshot {
  const state = buildStateThroughDate(
    input.trades,
    input.date,
    input.inferredInitialCash,
    input.splitAdjustmentDate
  );
  const holdingsValue = state.holdings.reduce(
    (sum, holding) =>
      sum +
      priceForDate(holding, input.historyByHoldingId, input.date, input.latestQuotesById) *
        holding.quantity,
    0
  );

  return buildCurrentSnapshot({
    date: input.date,
    cash: state.cash,
    holdingsValue,
    inferredInitialCash: input.inferredInitialCash
  });
}

function latestQuoteDate(quotes: Quote[]): string | null {
  const datedQuotes = quotes
    .map((quote) => quote.asOf?.slice(0, 10) ?? null)
    .filter((date): date is string => date !== null)
    .sort(sortDatesAscending);

  return datedQuotes.at(-1) ?? null;
}

function latestQuotesByHoldingId(quotes: Quote[]): Map<string, Quote> {
  return new Map(
    quotes.map((quote) => [holdingId(quote.code, canonicalHoldingMarket(quote.market)), quote] as const)
  );
}

export function buildHistoricalSnapshots(input: {
  trades: Trade[];
  historyByHoldingId: HoldingHistoryMap;
  latestQuotes: Quote[];
  currentCashOverride?: number;
  currentInternalIncome?: number;
  startDate?: string;
}): PortfolioSnapshot[] {
  const startDate = input.startDate ?? FUND_TRACKING_START_DATE;
  const trades = [...input.trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const inferredInitialCash = trades
    .filter((trade) => trade.side === "buy")
    .reduce((sum, trade) => sum + trade.grossAmount, 0);

  if (trades.length === 0 || inferredInitialCash === 0) return [];

  const historyDates = Array.from(
    new Set(
      Object.values(input.historyByHoldingId)
        .flat()
        .filter((row) => row.date >= startDate)
        .map((row) => row.date)
    )
  ).sort(sortDatesAscending);
  const latestDate = latestQuoteDate(input.latestQuotes);
  const splitAdjustmentDate =
    [latestDate, historyDates.at(-1), new Date().toISOString().slice(0, 10)]
      .filter((date): date is string => date !== undefined && date !== null)
      .sort(sortDatesAscending)
      .at(-1) ?? new Date().toISOString().slice(0, 10);

  const snapshots = historyDates.map((date) =>
    buildSnapshotForDate({
      date,
      trades,
      historyByHoldingId: input.historyByHoldingId,
      inferredInitialCash,
      splitAdjustmentDate
    })
  );

  if (!latestDate || latestDate < startDate) return snapshots;

  const latestHistoryDate = snapshots.at(-1)?.date;
  if (latestHistoryDate && latestDate < latestHistoryDate) {
    return snapshots;
  }

  const latestSnapshotBase = buildSnapshotForDate({
    date: latestDate,
    trades,
    historyByHoldingId: input.historyByHoldingId,
    inferredInitialCash,
    splitAdjustmentDate,
    latestQuotesById: latestQuotesByHoldingId(input.latestQuotes)
  });
  const cashAdjustedSnapshot =
    input.currentCashOverride === undefined
      ? latestSnapshotBase
      : applyCashFlowToSnapshot(latestSnapshotBase, input.currentCashOverride);
  const latestSnapshot = applyInternalIncomeToSnapshot(
    cashAdjustedSnapshot,
    input.currentInternalIncome ?? 0
  );

  if (snapshots.at(-1)?.date === latestDate) {
    return [...snapshots.slice(0, -1), latestSnapshot];
  }

  return [...snapshots, latestSnapshot];
}

export function buildPerformanceChartData(
  portfolioSnapshots: PortfolioSnapshot[],
  topix: BenchmarkPoint[],
  nikkei225: BenchmarkPoint[],
  trackingStartDate = FUND_TRACKING_START_DATE
): NormalizedPerformancePoint[] {
  const orderedPortfolio = [...portfolioSnapshots]
    .filter((snapshot) => snapshot.date >= trackingStartDate)
    .sort((a, b) => sortDatesAscending(a.date, b.date));
  const startDate =
    orderedPortfolio[0]?.date ??
    [...topix.map((row) => row.date), ...nikkei225.map((row) => row.date)]
      .filter((date) => date >= trackingStartDate)
      .sort(sortDatesAscending)[0];

  if (!startDate) return [];

  const portfolioByDate = rebaseSeries(
    orderedPortfolio,
    (row) => row.date,
    (row) => row.unitNav,
    startDate
  );
  const topixByDate = rebaseSeries(topix, (row) => row.date, (row) => row.normalized, startDate);
  const nikkeiByDate = rebaseSeries(
    nikkei225,
    (row) => row.date,
    (row) => row.normalized,
    startDate
  );
  const allDates = Array.from(
    new Set([
      ...portfolioByDate.keys(),
      ...topixByDate.keys(),
      ...nikkeiByDate.keys()
    ])
  ).sort(sortDatesAscending);

  return allDates.map((date) => ({
    date,
    portfolio: portfolioByDate.get(date) ?? null,
    topix: topixByDate.get(date) ?? null,
    nikkei225: nikkeiByDate.get(date) ?? null
  }));
}
