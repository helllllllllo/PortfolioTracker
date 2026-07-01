import { describe, expect, it } from "vitest";
import { summarizeDividends } from "./dividends";

describe("summarizeDividends", () => {
  it("returns an unavailable state when no dividend data exists", () => {
    expect(summarizeDividends([])).toEqual({
      state: "unavailable",
      yearToDate: 0,
      byQuarter: {},
      message: "No dividend data imported or found from free sources."
    });
  });

  it("summarizes confirmed dividends by quarter", () => {
    expect(
      summarizeDividends([
        { date: "2026-03-31", amount: 1200, state: "confirmed" },
        { date: "2026-06-30", amount: 1800, state: "confirmed" }
      ])
    ).toEqual({
      state: "confirmed",
      yearToDate: 3000,
      byQuarter: { "2026 Q1": 1200, "2026 Q2": 1800 },
      message: "Confirmed dividend data loaded."
    });
  });

  it("keeps year-to-date dividends scoped to the latest imported year", () => {
    expect(
      summarizeDividends([
        { date: "2025-12-31", amount: 900, state: "confirmed" },
        { date: "2026-03-31", amount: 1200, state: "confirmed" },
        { date: "2026-06-30", amount: 1800, state: "confirmed" }
      ])
    ).toEqual({
      state: "confirmed",
      yearToDate: 3000,
      byQuarter: { "2025 Q4": 900, "2026 Q1": 1200, "2026 Q2": 1800 },
      message: "Confirmed dividend data loaded."
    });
  });
});
