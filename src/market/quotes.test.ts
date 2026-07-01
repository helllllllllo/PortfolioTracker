import { describe, expect, it } from "vitest";
import type { Holding, Quote } from "../types";
import { priceHoldings } from "./quotes";

const holdings: Holding[] = [
  {
    id: "6846::名証",
    code: "6846",
    name: "中央製作所",
    market: "名証",
    quantity: 100,
    averageCost: 1355,
    costBasis: 135500,
    realizedPnl: 0
  }
];

describe("priceHoldings", () => {
  it("keeps Nagoya holdings visible when a quote is missing", () => {
    const result = priceHoldings(holdings, [], {});

    expect(result[0]).toEqual(
      expect.objectContaining({
        code: "6846",
        market: "名証",
        latestPrice: null,
        marketValue: 135500,
        allocation: 1
      })
    );
    expect(result[0].quote.status).toBe("missing");
  });

  it("uses manual overrides for hard-to-track regional listings", () => {
    const result = priceHoldings(holdings, [], { "6846::名証": 1400 });

    expect(result[0].latestPrice).toBe(1400);
    expect(result[0].marketValue).toBe(140000);
    expect(result[0].quote.status).toBe("manual");
  });

  it("matches quotes by code and market even when holding ids use another format", () => {
    const result = priceHoldings(
      [
        {
          ...holdings[0],
          id: "holding-1"
        }
      ],
      [
        {
          code: "6846",
          market: "名証",
          price: 1488,
          currency: "JPY",
          asOf: "2026-06-23T00:00:00.000Z",
          source: "free",
          status: "live-ish"
        }
      ],
      {}
    );

    expect(result[0].latestPrice).toBe(1488);
    expect(result[0].quote.status).toBe("live-ish");
  });

  it("carries a missing quote at average cost", () => {
    const result = priceHoldings(
      [
        {
          id: "6301",
          code: "6301",
          name: "小松製作所",
          market: "東証",
          quantity: 100,
          averageCost: 6504,
          costBasis: 650400,
          realizedPnl: 0
        }
      ],
      [
        {
          code: "6301",
          market: "東証",
          price: null,
          currency: "JPY",
          asOf: null,
          source: "Portfolio API",
          status: "missing"
        }
      ],
      {}
    );

    expect(result[0].latestPrice).toBeNull();
    expect(result[0].marketValue).toBeCloseTo(650400);
    expect(result[0].unrealizedPnl).toBeCloseTo(0);
  });
});
