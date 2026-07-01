import type { Holding, Trade } from "../types";

type StockSplit = {
  code: string;
  market: string;
  exDate: string;
  ratio: number;
};

export const STOCK_SPLITS: StockSplit[] = [
  {
    code: "378A",
    market: "東証",
    exDate: "2026-06-29",
    ratio: 2
  }
];

// A corporate-action split, from any source (Yahoo events, J-Quants AdjustmentFactor,
// or the manual STOCK_SPLITS fallback). Matching is by security code only.
export type SplitEvent = { code: string; exDate: string; ratio: number };

// Price feeds (Yahoo, J-Quants adjusted) return split-adjusted history for the whole
// range. To value a position consistently against those prices, express every executed
// trade in the same split-adjusted basis: a buy/sell dated BEFORE a split's ex-date has
// its quantity multiplied and price divided by the ratio (gross amount is preserved).
export function splitAdjustTrades(
  trades: Trade[],
  splits: readonly SplitEvent[] = STOCK_SPLITS
): Trade[] {
  return trades.map((trade) => {
    let quantity = trade.quantity;
    let price = trade.price;
    for (const split of splits) {
      if (trade.code === split.code && trade.tradeDate < split.exDate) {
        quantity *= split.ratio;
        price /= split.ratio;
      }
    }
    return quantity === trade.quantity ? trade : { ...trade, quantity, price };
  });
}

// Combine split lists from multiple sources, de-duplicated by code+ex-date so a split
// is never applied twice. Later lists win on conflict.
export function mergeSplitEvents(...lists: readonly SplitEvent[][]): SplitEvent[] {
  const byKey = new Map<string, SplitEvent>();
  for (const list of lists) {
    for (const split of list) {
      if (split.ratio > 0) byKey.set(`${split.code}:${split.exDate}`, split);
    }
  }
  return [...byKey.values()];
}

// Data-integrity guardrail: after split-adjustment, an executed price should be close to
// the market price on its trade date. A large residual gap means an unhandled corporate
// action (a split not in our list, a reverse split, a stock dividend) — surface it rather
// than silently mis-valuing the position. One warning per code.
export function reconcileTradesAgainstPrices(
  trades: Trade[],
  historyByCode: Record<string, Array<{ date: string; close: number }>>,
  splits: readonly SplitEvent[] = STOCK_SPLITS,
  tolerance = 0.2
): string[] {
  const adjusted = splitAdjustTrades(trades, splits);
  const warnings: string[] = [];
  const flagged = new Set<string>();

  for (const trade of adjusted) {
    if (trade.price <= 0 || flagged.has(trade.code)) continue;
    const rows = historyByCode[trade.code];
    if (!rows || rows.length === 0) continue;
    const close = [...rows]
      .filter((row) => row.date <= trade.tradeDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)?.close;
    if (close == null || close <= 0) continue;

    if (Math.abs(trade.price / close - 1) > tolerance) {
      flagged.add(trade.code);
      warnings.push(
        `${trade.code} ${trade.name}: executed price and market price differ by ` +
          `${Math.round(Math.abs(trade.price / close - 1) * 100)}% on ${trade.tradeDate} — ` +
          `possible unhandled split or corporate action.`
      );
    }
  }
  return warnings;
}

export function canonicalHoldingMarket(rawMarket: string): string {
  if (rawMarket.includes("名証")) return "名証";
  if (rawMarket.includes("東証") || rawMarket.startsWith("PTS")) return "東証";
  return rawMarket;
}

function holdingMatchesSplit(holding: Pick<Holding, "code">, split: StockSplit): boolean {
  return holding.code === split.code;
}

function splitId(split: StockSplit): string {
  return `${split.code}:${split.market}:${split.exDate}`;
}

function applyStockSplitToHolding(holding: Holding, split: StockSplit): Holding {
  return {
    ...holding,
    quantity: holding.quantity * split.ratio,
    averageCost: holding.averageCost / split.ratio
  };
}

export function applyEligibleStockSplitsToHoldings(
  holdingsById: Map<string, Holding>,
  appliedSplitIds: Set<string>,
  throughDate: string
): void {
  for (const split of STOCK_SPLITS) {
    const id = splitId(split);
    if (appliedSplitIds.has(id) || split.exDate > throughDate) continue;

    for (const [holdingId, holding] of holdingsById.entries()) {
      if (holdingMatchesSplit(holding, split)) {
        holdingsById.set(holdingId, applyStockSplitToHolding(holding, split));
      }
    }

    appliedSplitIds.add(id);
  }
}
