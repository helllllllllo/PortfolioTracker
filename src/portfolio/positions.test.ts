import { describe, expect, it } from "vitest";
import type { Trade } from "../types";
import { buildHistoricalHoldings, buildPortfolioState } from "./positions";

const trades: Trade[] = [
  {
    tradeDate: "2026-06-01",
    settlementDate: "2026-06-03",
    code: "7974",
    name: "任天堂",
    market: "東証",
    side: "buy",
    quantity: 100,
    price: 7000,
    grossAmount: 700000
  },
  {
    tradeDate: "2026-06-10",
    settlementDate: "2026-06-12",
    code: "7974",
    name: "任天堂",
    market: "東証",
    side: "sell",
    quantity: 40,
    price: 7500,
    grossAmount: 300000
  },
  {
    tradeDate: "2026-06-17",
    settlementDate: "2026-06-19",
    code: "6846",
    name: "中央製作所",
    market: "名証",
    side: "buy",
    quantity: 100,
    price: 1355,
    grossAmount: 135500
  }
];

describe("buildPortfolioState", () => {
  it("keeps sell proceeds as portfolio cash and preserves Nagoya holdings", () => {
    const state = buildPortfolioState(trades);

    expect(state.inferredInitialCash).toBe(835500);
    expect(state.cash).toBe(300000);
    expect(state.holdings).toEqual([
      expect.objectContaining({
        id: "6846",
        code: "6846",
        market: "名証",
        quantity: 100,
        averageCost: 1355
      }),
      expect.objectContaining({
        id: "7974",
        quantity: 60,
        averageCost: 7000,
        realizedPnl: 20000
      })
    ]);
  });

  it("reconciles Tokyo-listed trades across PTS and TSE execution venues", () => {
    const state = buildPortfolioState([
      {
        tradeDate: "2026-01-29",
        settlementDate: "2026-02-02",
        code: "4689",
        name: "ＬＩＮＥヤフー",
        market: "PTS（X）",
        side: "buy",
        quantity: 200,
        price: 393.6,
        grossAmount: 78720
      },
      {
        tradeDate: "2026-04-13",
        settlementDate: "2026-04-15",
        code: "4689",
        name: "ＬＩＮＥヤフー",
        market: "東証",
        side: "sell",
        quantity: 200,
        price: 405.5,
        grossAmount: 81100
      }
    ]);

    expect(state.holdings).toEqual([]);
    expect(state.cash).toBe(81100);
    expect(state.realizedPnl).toBe(2380);
    expect(state.warnings).toEqual([]);
  });

  it("applies the 378A HIT 1:2 split from the ex-date", () => {
    const hitTrades: Trade[] = [
      {
        tradeDate: "2026-03-02",
        settlementDate: "2026-03-04",
        code: "378A",
        name: "ヒット",
        market: "東証",
        side: "buy",
        quantity: 800,
        price: 2338,
        grossAmount: 1870400
      },
      {
        tradeDate: "2026-03-19",
        settlementDate: "2026-03-24",
        code: "378A",
        name: "ヒット",
        market: "東証",
        side: "buy",
        quantity: 700,
        price: 2726,
        grossAmount: 1908200
      },
      {
        tradeDate: "2026-03-23",
        settlementDate: "2026-03-25",
        code: "378A",
        name: "ヒット",
        market: "東証",
        side: "buy",
        quantity: 800,
        price: 2621,
        grossAmount: 2096800
      },
      {
        tradeDate: "2026-03-23",
        settlementDate: "2026-03-25",
        code: "378A",
        name: "ヒット",
        market: "東証",
        side: "buy",
        quantity: 400,
        price: 2500,
        grossAmount: 1000000
      },
      {
        tradeDate: "2026-03-31",
        settlementDate: "2026-04-02",
        code: "378A",
        name: "ヒット",
        market: "PTS（X）",
        side: "buy",
        quantity: 100,
        price: 2281,
        grossAmount: 228100
      },
      {
        tradeDate: "2026-03-31",
        settlementDate: "2026-04-02",
        code: "378A",
        name: "ヒット",
        market: "PTS（O）",
        side: "buy",
        quantity: 100,
        price: 2281,
        grossAmount: 228100
      },
      {
        tradeDate: "2026-04-23",
        settlementDate: "2026-04-27",
        code: "378A",
        name: "ヒット",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 2399,
        grossAmount: 239900
      }
    ];

    // Trades are normalized into split-adjusted space (to match Yahoo's split-adjusted
    // price series), so the holding is expressed in post-split terms regardless of the
    // as-of date. Cost basis is preserved; quantity doubles and average cost halves.
    const beforeSplit = buildPortfolioState(hitTrades, "2026-06-28").holdings[0];
    const afterSplit = buildPortfolioState(hitTrades, "2026-06-29").holdings[0];

    for (const holding of [beforeSplit, afterSplit]) {
      expect(holding).toEqual(
        expect.objectContaining({
          code: "378A",
          name: "ヒット",
          market: "東証",
          quantity: 6000,
          costBasis: 7571500
        })
      );
      expect(holding.averageCost).toBeCloseTo(1261.9166666666667, 12);
    }
  });

  it("aggregates the same code across 東証 / PTS / 名証 into one holding", () => {
    const venueTrades: Trade[] = [
      {
        tradeDate: "2026-02-01",
        settlementDate: "2026-02-03",
        code: "4689",
        name: "ＬＩＮＥヤフー",
        market: "東証",
        side: "buy",
        quantity: 800,
        price: 400,
        grossAmount: 320000
      },
      {
        tradeDate: "2026-02-01",
        settlementDate: "2026-02-03",
        code: "4689",
        name: "ＬＩＮＥヤフー",
        market: "PTS（X）",
        side: "buy",
        quantity: 200,
        price: 400,
        grossAmount: 80000
      },
      {
        tradeDate: "2026-02-01",
        settlementDate: "2026-02-03",
        code: "4689",
        name: "ＬＩＮＥヤフー",
        market: "名証（名２）",
        side: "buy",
        quantity: 100,
        price: 400,
        grossAmount: 40000
      }
    ];
    const { holdings } = buildPortfolioState(venueTrades, "2026-03-01");
    const line = holdings.filter((holding) => holding.code === "4689");
    expect(line).toHaveLength(1);
    expect(line[0].quantity).toBe(1100);
    expect(line[0].id).toBe("4689");
  });

  it("keeps sold holdings in the historical pricing universe", () => {
    const trades = [
      {
        tradeDate: "2026-01-05",
        settlementDate: "2026-01-07",
        code: "1111",
        name: "Sold Later",
        market: "東証",
        side: "buy" as const,
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-02-05",
        settlementDate: "2026-02-09",
        code: "1111",
        name: "Sold Later",
        market: "東証",
        side: "sell" as const,
        quantity: 100,
        price: 1100,
        grossAmount: 110000
      },
      {
        tradeDate: "2026-03-05",
        settlementDate: "2026-03-09",
        code: "2222",
        name: "Still Held",
        market: "PTS（X）",
        side: "buy" as const,
        quantity: 100,
        price: 2000,
        grossAmount: 200000
      }
    ];

    expect(buildPortfolioState(trades, "2026-03-31").holdings.map((holding) => holding.code)).toEqual([
      "2222"
    ]);
    expect(buildHistoricalHoldings(trades).map((holding) => holding.id)).toEqual([
      "1111",
      "2222"
    ]);
  });
});
