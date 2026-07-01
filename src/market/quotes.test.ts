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

  it("uses USDJPY to value US average-cost fallback in JPY", () => {
    const result = priceHoldings(
      [
        {
          id: "SNOW::US",
          code: "SNOW",
          name: "SNOWFLAKE INC CLASS A",
          market: "US",
          quantity: 10,
          averageCost: 224.89,
          costBasis: 2248.9,
          realizedPnl: 0,
          currency: "USD"
        }
      ],
      [
        {
          code: "SNOW",
          market: "US",
          price: null,
          currency: "JPY",
          asOf: null,
          source: "Portfolio API",
          status: "missing",
          fxRateToJpy: 160
        }
      ],
      {}
    );

    expect(result[0].latestPrice).toBeNull();
    expect(result[0].marketValue).toBeCloseTo(359824);
    expect(result[0].unrealizedPnl).toBeCloseTo(0);
  });
});
