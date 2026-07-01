import { describe, it, expect } from "vitest";
import { buildAttribution } from "./attribution";
import type { PricedHolding, Trade } from "../types";

const buy = (code: string, date: string, qty: number, px: number): Trade => ({
  tradeDate: date, settlementDate: date, code, name: code, market: "東証",
  side: "buy", quantity: qty, price: px, grossAmount: qty * px
});
const sell = (code: string, date: string, qty: number, px: number): Trade => ({
  tradeDate: date, settlementDate: date, code, name: code, market: "東証",
  side: "sell", quantity: qty, price: px, grossAmount: qty * px
});
const priced = (code: string, unrealizedPnl: number): PricedHolding => ({
  id: code, code, name: code, market: "東証", quantity: 1, averageCost: 0, costBasis: 0,
  realizedPnl: 0, latestPrice: 0, marketValue: 0, unrealizedPnl, allocation: 0,
  quote: { code, market: "東証", price: 0, currency: "JPY", asOf: null, source: "t", status: "manual" }
});

describe("buildAttribution", () => {
  it("ranks by total P&L (realized + unrealized), including fully-exited names", () => {
    const trades: Trade[] = [
      buy("WIN", "2026-01-05", 100, 1000), // held, unrealized +50,000
      buy("LOSS", "2026-01-05", 100, 1000),
      sell("LOSS", "2026-02-05", 100, 800) // realized -20,000, fully exited
    ];
    const rows = buildAttribution(trades, [priced("WIN", 50000)]);
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));

    expect(byCode.WIN.totalPnl).toBe(50000);
    expect(byCode.LOSS.realizedPnl).toBe(-20000);
    expect(byCode.LOSS.unrealizedPnl).toBe(0);
    expect(rows[0].code).toBe("WIN"); // sorted, best first
    expect(rows[rows.length - 1].code).toBe("LOSS");
  });
});
