import { describe, expect, it } from "vitest";
import type { BenchmarkPoint } from "../types";
import { applyInternalIncomeToSnapshot, buildCurrentSnapshot, quarterlyReturns } from "./nav";

describe("NAV calculations", () => {
  it("uses cash plus holding value and keeps initial unit NAV at 100", () => {
    const snapshot = buildCurrentSnapshot({
      date: "2026-06-23",
      cash: 300000,
      holdingsValue: 555500,
      inferredInitialCash: 835500
    });

    expect(snapshot.nav).toBe(855500);
    expect(snapshot.units).toBe(8355);
    expect(snapshot.unitNav).toBeCloseTo(102.3938, 4);
  });

  it("adds dividend income to NAV without issuing new fund units", () => {
    const snapshot = {
      date: "2026-06-30",
      cash: 25000,
      holdingsValue: 65000,
      nav: 90000,
      units: 1000,
      unitNav: 90
    };

    const adjusted = applyInternalIncomeToSnapshot(snapshot, 119511);

    expect(adjusted).toEqual({
      date: "2026-06-30",
      cash: 144511,
      holdingsValue: 65000,
      nav: 209511,
      units: 1000,
      unitNav: 209.511
    });
  });

  it("computes quarterly portfolio returns against benchmarks", () => {
    const portfolio = [
      { date: "2026-03-31", cash: 0, holdingsValue: 0, nav: 1000, units: 10, unitNav: 100 },
      { date: "2026-04-01", cash: 0, holdingsValue: 0, nav: 1010, units: 10, unitNav: 101 },
      { date: "2026-06-30", cash: 0, holdingsValue: 0, nav: 1111, units: 10, unitNav: 111.1 }
    ];
    const topix: BenchmarkPoint[] = [
      { date: "2026-04-01", value: 2000, normalized: 100, source: "test" },
      { date: "2026-06-30", value: 2100, normalized: 105, source: "test" }
    ];
    const nikkei225: BenchmarkPoint[] = [
      { date: "2026-04-01", value: 40000, normalized: 100, source: "test" },
      { date: "2026-06-30", value: 42000, normalized: 105, source: "test" }
    ];

    expect(quarterlyReturns(portfolio, topix, nikkei225)).toEqual([
      {
        quarter: "2026 Q2",
        portfolioReturn: 0.111,
        topixReturn: 0.05,
        nikkei225Return: 0.05,
        vsTopix: 0.061,
        vsNikkei225: 0.061,
        dividendContribution: null
      }
    ]);
  });

  it("sorts rows by date and returns quarters chronologically when input is unsorted", () => {
    const portfolio = [
      { date: "2026-06-30", cash: 0, holdingsValue: 0, nav: 1300, units: 10, unitNav: 130 },
      { date: "2026-03-31", cash: 0, holdingsValue: 0, nav: 1100, units: 10, unitNav: 110 },
      { date: "2025-12-31", cash: 0, holdingsValue: 0, nav: 950, units: 10, unitNav: 95 },
      { date: "2026-01-02", cash: 0, holdingsValue: 0, nav: 1000, units: 10, unitNav: 100 },
      { date: "2026-04-02", cash: 0, holdingsValue: 0, nav: 1200, units: 10, unitNav: 120 },
      { date: "2025-10-01", cash: 0, holdingsValue: 0, nav: 900, units: 10, unitNav: 90 }
    ];

    const topix: BenchmarkPoint[] = [
      { date: "2026-06-30", value: 2100, normalized: 105, source: "test" },
      { date: "2026-03-31", value: 1100, normalized: 110, source: "test" },
      { date: "2026-04-02", value: 1000, normalized: 100, source: "test" },
      { date: "2025-10-01", value: 1000, normalized: 100, source: "test" },
      { date: "2026-01-02", value: 1000, normalized: 100, source: "test" },
      { date: "2025-12-31", value: 1050, normalized: 105, source: "test" }
    ];

    const nikkei225: BenchmarkPoint[] = [
      { date: "2026-06-30", value: 1210, normalized: 110, source: "test" },
      { date: "2026-04-02", value: 1000, normalized: 100, source: "test" },
      { date: "2025-12-31", value: 400, normalized: 100, source: "test" },
      { date: "2025-10-01", value: 380, normalized: 95, source: "test" },
      { date: "2026-03-31", value: 1100, normalized: 110, source: "test" },
      { date: "2026-01-02", value: 1000, normalized: 100, source: "test" }
    ];

    const result = quarterlyReturns(portfolio, topix, nikkei225);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      quarter: "2025 Q4",
      dividendContribution: null
    });
    expect(result[0].portfolioReturn).toBeCloseTo(0.055555555556, 12);
    expect(result[0].topixReturn).toBeCloseTo(0.05, 12);
    expect(result[0].nikkei225Return).toBeCloseTo(0.052631578947, 12);
    expect(result[0].vsTopix).toBeCloseTo(0.005555555556, 12);
    expect(result[0].vsNikkei225).toBeCloseTo(0.002923976609, 12);

    expect(result[1]).toMatchObject({
      quarter: "2026 Q1",
      dividendContribution: null
    });
    expect(result[1].portfolioReturn).toBeCloseTo(0.157894736842, 12);
    expect(result[1].topixReturn).toBeCloseTo(0.047619047619, 12);
    expect(result[1].nikkei225Return).toBeCloseTo(0.1, 12);
    expect(result[1].vsTopix).toBeCloseTo(0.110275689223, 12);
    expect(result[1].vsNikkei225).toBeCloseTo(0.057894736842, 12);

    expect(result[2]).toMatchObject({
      quarter: "2026 Q2",
      dividendContribution: null
    });
    expect(result[2].portfolioReturn).toBeCloseTo(0.181818181818, 12);
    expect(result[2].topixReturn).toBeCloseTo(-0.045454545455, 12);
    expect(result[2].nikkei225Return).toBeCloseTo(0, 12);
    expect(result[2].vsTopix).toBeCloseTo(0.227272727273, 12);
    expect(result[2].vsNikkei225).toBeCloseTo(0.181818181818, 12);
  });

  it("uses the prior quarter close as the start value when available", () => {
    const portfolio = [
      { date: "2025-12-30", cash: 0, holdingsValue: 0, nav: 1000, units: 10, unitNav: 100 },
      { date: "2026-01-05", cash: 0, holdingsValue: 0, nav: 1100, units: 10, unitNav: 110 },
      { date: "2026-03-31", cash: 0, holdingsValue: 0, nav: 1200, units: 10, unitNav: 120 }
    ];
    const topix: BenchmarkPoint[] = [
      { date: "2025-12-30", value: 2000, normalized: 100, source: "test" },
      { date: "2026-01-05", value: 2100, normalized: 105, source: "test" },
      { date: "2026-03-31", value: 2200, normalized: 110, source: "test" }
    ];
    const nikkei225: BenchmarkPoint[] = [
      { date: "2025-12-30", value: 50000, normalized: 100, source: "test" },
      { date: "2026-01-05", value: 52000, normalized: 104, source: "test" },
      { date: "2026-03-31", value: 51000, normalized: 102, source: "test" }
    ];

    const [result] = quarterlyReturns(portfolio, topix, nikkei225);

    expect(result).toMatchObject({
      quarter: "2026 Q1",
      portfolioReturn: 0.2,
      topixReturn: 0.1,
      nikkei225Return: 0.02
    });
  });
});
