import type { Holding, Trade } from "../types";
import { canonicalHoldingMarket, splitAdjustTrades } from "./corporateActions";

type MutableHolding = Holding;

function holdingId(code: string, _market: string): string {
  return code;
}

export function buildPortfolioState(trades: Trade[], asOfDate?: string): {
  holdings: Holding[];
  cash: number;
  inferredInitialCash: number;
  realizedPnl: number;
  warnings: string[];
} {
  const effectiveAsOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  const sorted = splitAdjustTrades(trades)
    .filter((trade) => trade.tradeDate <= effectiveAsOfDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const totalBuyAmount = sorted
    .filter((trade) => trade.side === "buy")
    .reduce((sum, trade) => sum + trade.grossAmount, 0);
  const byId = new Map<string, MutableHolding>();
  const warnings: string[] = [];
  let cash = totalBuyAmount;
  let realizedPnl = 0;

  for (const trade of sorted) {
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
    } else if (trade.side === "sell") {
      if (trade.quantity > holding.quantity) {
        warnings.push(`${trade.code} ${trade.name}: sell quantity exceeds current holding`);
      }
      const quantitySold = Math.min(trade.quantity, holding.quantity);
      const removedCost = holding.averageCost * quantitySold;
      const tradeRealizedPnl = trade.grossAmount - removedCost;
      holding.quantity -= quantitySold;
      holding.costBasis -= removedCost;
      holding.realizedPnl += tradeRealizedPnl;
      realizedPnl += tradeRealizedPnl;
      holding.averageCost = holding.quantity === 0 ? 0 : holding.costBasis / holding.quantity;
      cash += trade.grossAmount;
    } else if (trade.side === "split") {
      if (holding.quantity <= 0) {
        warnings.push(`${trade.code} ${trade.name}: split event without current holding`);
      } else if (trade.quantity > 0) {
        holding.quantity = trade.quantity;
        holding.averageCost = holding.costBasis / holding.quantity;
      }
    }

    byId.set(id, holding);
  }

  const holdings = Array.from(byId.values())
    .filter((holding) => holding.quantity > 0)
    .sort((a, b) => a.code.localeCompare(b.code, "ja"));

  return {
    holdings,
    cash,
    inferredInitialCash: totalBuyAmount,
    realizedPnl,
    warnings
  };
}

export function buildHistoricalHoldings(trades: Trade[]): Holding[] {
  const byId = new Map<string, Holding>();

  for (const trade of trades) {
    const market = canonicalHoldingMarket(trade.market);
    const id = holdingId(trade.code, market);
    if (byId.has(id)) continue;

    byId.set(id, {
      id,
      code: trade.code,
      name: trade.name,
      market,
      quantity: 0,
      averageCost: 0,
      costBasis: 0,
      realizedPnl: 0,
      currency: trade.currency
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.code.localeCompare(b.code, "ja"));
}
