import type { PricedHolding, Trade } from "../types";
import { splitAdjustTrades } from "./corporateActions";
import type { SplitEvent } from "./corporateActions";

export type Attribution = {
  code: string;
  name: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
};

// Per-security profit attribution: realized P&L from every sell (including names now
// fully exited) plus the current unrealized P&L of held names. Ranked best-first, so the
// head is the top contributors and the tail is the top detractors.
export function buildAttribution(
  trades: Trade[],
  pricedHoldings: PricedHolding[],
  splits?: readonly SplitEvent[]
): Attribution[] {
  const adjusted = splitAdjustTrades(trades, splits).sort((a, b) =>
    a.tradeDate.localeCompare(b.tradeDate)
  );

  const realizedByCode = new Map<string, { name: string; qty: number; cost: number; avg: number; realized: number }>();
  for (const trade of adjusted) {
    const position =
      realizedByCode.get(trade.code) ?? { name: trade.name, qty: 0, cost: 0, avg: 0, realized: 0 };
    if (trade.side === "buy") {
      position.cost += trade.grossAmount;
      position.qty += trade.quantity;
      position.avg = position.qty === 0 ? 0 : position.cost / position.qty;
    } else if (trade.side === "sell") {
      const sold = Math.min(trade.quantity, position.qty);
      const removed = position.avg * sold;
      position.qty -= sold;
      position.cost -= removed;
      position.realized += trade.grossAmount - removed;
      position.avg = position.qty === 0 ? 0 : position.cost / position.qty;
    }
    realizedByCode.set(trade.code, position);
  }

  const unrealizedByCode = new Map(pricedHoldings.map((holding) => [holding.code, holding.unrealizedPnl]));
  const nameByCode = new Map(pricedHoldings.map((holding) => [holding.code, holding.name]));

  return [...realizedByCode.entries()]
    .map(([code, position]) => {
      const unrealizedPnl = unrealizedByCode.get(code) ?? 0;
      return {
        code,
        name: nameByCode.get(code) ?? position.name,
        realizedPnl: position.realized,
        unrealizedPnl,
        totalPnl: position.realized + unrealizedPnl
      };
    })
    .sort((a, b) => b.totalPnl - a.totalPnl);
}
