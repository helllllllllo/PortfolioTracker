import { describe, it, expect } from "vitest";
import { xirr, moneyWeightedReturn } from "./irr";

describe("xirr", () => {
  it("returns ~10% for -1000 today, +1100 in one year", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 3);
  });
  it("returns null without both an inflow and an outflow", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
    expect(
      xirr([
        { date: "2025-01-01", amount: -1 },
        { date: "2026-01-01", amount: -1 },
      ])
    ).toBeNull();
  });
});

describe("moneyWeightedReturn", () => {
  it("treats contributions as outflows, dividends + terminal NAV as inflows", () => {
    const r = moneyWeightedReturn(
      [{ date: "2026-01-01", kind: "contribution", category: "", description: "", amount: 1000 }],
      [{ date: "2026-07-01", amount: 50 }],
      1100,
      "2027-01-01"
    );
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.1);
  });
});
