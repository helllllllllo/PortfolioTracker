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

// Yahoo's daily price series is split-adjusted for the whole history. To value a
// position consistently against those prices, express every executed trade in the
// same split-adjusted basis: a buy/sell dated BEFORE a split's ex-date has its
// quantity multiplied and price divided by the ratio (gross amount is preserved).
// This replaces ex-date-gated quantity doubling, which mismatched the adjusted prices
// and halved a pre-split holding's value.
export function splitAdjustTrades(trades: Trade[]): Trade[] {
  return trades.map((trade) => {
    let quantity = trade.quantity;
    let price = trade.price;
    for (const split of STOCK_SPLITS) {
      if (trade.code === split.code && trade.tradeDate < split.exDate) {
        quantity *= split.ratio;
        price /= split.ratio;
      }
    }
    return quantity === trade.quantity ? trade : { ...trade, quantity, price };
  });
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
