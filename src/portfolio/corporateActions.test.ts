import { describe, it, expect } from "vitest";
import {
  splitAdjustTrades,
  mergeSplitEvents,
  reconcileTradesAgainstPrices
} from "./corporateActions";
import type { Trade } from "../types";

const trade = (code: string, date: string, quantity: number, price: number): Trade => ({
  tradeDate: date,
  settlementDate: date,
  code,
  name: code,
  market: "東証",
  side: "buy",
  quantity,
  price,
  grossAmount: quantity * price
});

describe("splitAdjustTrades", () => {
  it("normalizes a pre-split buy into post-split terms (qty up, price down, gross preserved)", () => {
    const [adjusted] = splitAdjustTrades([trade("999X", "2026-03-01", 100, 2000)], [
      { code: "999X", exDate: "2026-06-01", ratio: 2 }
    ]);
    expect(adjusted.quantity).toBe(200);
    expect(adjusted.price).toBe(1000);
    expect(adjusted.grossAmount).toBe(200000);
  });

  it("leaves trades on/after the ex-date untouched", () => {
    const [adjusted] = splitAdjustTrades([trade("999X", "2026-06-01", 100, 1000)], [
      { code: "999X", exDate: "2026-06-01", ratio: 2 }
    ]);
    expect(adjusted.quantity).toBe(100);
  });
});

describe("mergeSplitEvents", () => {
  it("dedupes by code + ex-date so a split is never applied twice", () => {
    const merged = mergeSplitEvents(
      [{ code: "378A", exDate: "2026-06-29", ratio: 2 }],
      [{ code: "378A", exDate: "2026-06-29", ratio: 2 }, { code: "AAA", exDate: "2026-02-01", ratio: 3 }]
    );
    expect(merged).toHaveLength(2);
  });
});

describe("reconcileTradesAgainstPrices", () => {
  const history = { "999X": [{ date: "2026-03-01", close: 1000 }] }; // split-adjusted (~half of exec 2000)

  it("flags a split that was NOT handled (exec price ~2x the adjusted market price)", () => {
    const warnings = reconcileTradesAgainstPrices(
      [trade("999X", "2026-03-01", 100, 2000)],
      history,
      [] // no split provided => unhandled
    );
    expect(warnings.join(" ")).toMatch(/999X/);
    expect(warnings.join(" ")).toMatch(/corporate action|split/i);
  });

  it("stays silent once the split is handled", () => {
    const warnings = reconcileTradesAgainstPrices(
      [trade("999X", "2026-03-01", 100, 2000)],
      history,
      [{ code: "999X", exDate: "2026-06-01", ratio: 2 }]
    );
    expect(warnings).toEqual([]);
  });
});
