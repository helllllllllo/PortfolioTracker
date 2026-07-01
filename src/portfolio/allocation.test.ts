import { describe, expect, it } from "vitest";
import type { PricedHolding } from "../types";
import { buildAllocationSlices } from "./allocation";

function holding(overrides: Partial<PricedHolding>): PricedHolding {
  return {
    id: "7201::東証",
    code: "7201",
    name: "日産自動車",
    market: "東証",
    quantity: 50,
    averageCost: 1000,
    costBasis: 50000,
    realizedPnl: 0,
    latestPrice: 1300,
    marketValue: 65000,
    unrealizedPnl: 15000,
    allocation: 1,
    quote: {
      code: "7201",
      market: "東証",
      price: 1300,
      currency: "JPY",
      asOf: "2026-01-05T06:00:00.000Z",
      source: "Yahoo Finance",
      status: "delayed"
    },
    ...overrides
  };
}

describe("buildAllocationSlices", () => {
  it("ranks holdings and cash by current market value", () => {
    const slices = buildAllocationSlices(
      [
        holding({ id: "small", code: "1111", name: "Small", marketValue: 10000 }),
        holding({ id: "large", code: "2222", name: "Large", marketValue: 90000 }),
        holding({ id: "medium", code: "3333", name: "Medium", marketValue: 30000 })
      ],
      50000
    );

    expect(slices.map((slice) => slice.label)).toEqual(["Large", "Cash", "Medium", "Small"]);
  });

  it("includes cash alongside holdings and computes portfolio-level weights", () => {
    const slices = buildAllocationSlices([holding({})], 25000);

    expect(slices).toEqual([
      {
        id: "7201::東証",
        label: "日産自動車",
        detail: "7201 / 東証",
        value: 65000,
        weight: 65000 / 90000
      },
      {
        id: "cash",
        label: "Cash",
        detail: "JPY",
        value: 25000,
        weight: 25000 / 90000
      }
    ]);
  });

  it("omits empty cash and zero-value holdings", () => {
    const slices = buildAllocationSlices([holding({ marketValue: 0 })], 0);

    expect(slices).toEqual([]);
  });
});
