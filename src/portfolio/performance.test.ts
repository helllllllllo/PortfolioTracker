import { describe, expect, it } from "vitest";
import type { PricedHolding } from "../types";
import { calculateInvestmentChange, calculateNetContributions } from "./performance";

describe("performance reconciliation", () => {
  it("uses realized and unrealized P&L for investment change", () => {
    const pricedHoldings = [
      { unrealizedPnl: -10000 },
      { unrealizedPnl: 2500 }
    ] as PricedHolding[];

    expect(
      calculateInvestmentChange({
        pricedHoldings,
        realizedPnl: 12000,
        internalIncome: 500
      })
    ).toBe(5000);
  });

  it("backs into net contributions from ending value and investment change", () => {
    expect(
      calculateNetContributions({
        beginningValue: 0,
        endingValue: 100000,
        investmentChange: -7500
      })
    ).toBe(107500);
  });
});
