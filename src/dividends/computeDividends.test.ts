import { describe, it, expect } from "vitest";
import { computeDividends } from "./computeDividends";
import type { DividendRecord } from "./computeDividends";
import type { Trade } from "../types";

const buy = (code: string, date: string, qty: number): Trade => ({
  tradeDate: date, settlementDate: date, code, name: code, market: "東証",
  side: "buy", quantity: qty, price: 1000, grossAmount: qty * 1000
});
const rec = (over: Partial<DividendRecord>): DividendRecord => ({
  code: "7974", divRate: 100, recDate: "2026-03-31", exDate: "2026-03-30",
  payDate: "2026-06-29", discDate: "2026-05-10", ...over
});

describe("computeDividends", () => {
  it("uses record-date shares and 15.315% withholding for realized income", () => {
    const trades = [buy("7974", "2026-02-01", 300)]; // held 300 on record date 2026-03-31
    const { realized } = computeDividends({ "7974": [rec({ divRate: 177 })] }, trades, 1_000_000, {
      trackingStart: "2026-01-01", asOf: "2026-07-01"
    });
    expect(realized).toHaveLength(1);
    expect(realized[0].date).toBe("2026-06-29");
    expect(realized[0].amount).toBeCloseTo(177 * 300 * (1 - 0.15315), 2); // ≈ 44,955
  });

  it("dedupes revised disclosures for the same code + record date (keeps latest)", () => {
    const trades = [buy("4689", "2026-01-10", 5000)];
    const records = {
      "4689": [
        rec({ code: "4689", divRate: 7.3, discDate: "2026-04-01", payDate: "2026-06-05", recDate: "2026-03-31" }),
        rec({ code: "4689", divRate: 7.3, discDate: "2026-05-01", payDate: "2026-06-05", recDate: "2026-03-31" })
      ]
    };
    const { realized } = computeDividends(records, trades, 1_000_000, {
      trackingStart: "2026-01-01", asOf: "2026-07-01"
    });
    expect(realized).toHaveLength(1); // not double-counted
    expect(realized[0].amount).toBeCloseTo(7.3 * 5000 * (1 - 0.15315), 2);
  });

  it("computes a trailing-12M dividend yield on current holdings", () => {
    const trades = [buy("7974", "2026-02-01", 1000)];
    const { forwardAnnualIncome, forwardYield } = computeDividends(
      { "7974": [rec({ divRate: 177, payDate: "2026-06-29" })] },
      trades,
      10_000_000,
      { trackingStart: "2026-01-01", asOf: "2026-07-01" }
    );
    const expectedIncome = 177 * 1000 * (1 - 0.15315);
    expect(forwardAnnualIncome).toBeCloseTo(expectedIncome, 2);
    expect(forwardYield).toBeCloseTo(expectedIncome / 10_000_000, 6);
  });
});
