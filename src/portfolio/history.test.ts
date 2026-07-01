import { describe, expect, it } from "vitest";
import type { Quote, Trade } from "../types";
import { buildHistoricalSnapshots, buildPerformanceChartData } from "./history";

describe("buildHistoricalSnapshots", () => {
  it("starts visible fund history at January 2026", () => {
    const trades: Trade[] = [
      {
        tradeDate: "2025-12-15",
        settlementDate: "2025-12-17",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {
        "7201::東証": [
          { date: "2025-12-30", close: 900 },
          { date: "2026-01-02", close: 1000 }
        ]
      },
      latestQuotes: []
    });

    expect(snapshots.map((snapshot) => snapshot.date)).toEqual(["2026-01-02"]);
  });

  it("uses a caller-provided visible fund history start date", () => {
    const trades: Trade[] = [
      {
        tradeDate: "2025-12-15",
        settlementDate: "2025-12-17",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {
        "7201::東証": [
          { date: "2025-12-30", close: 900 },
          { date: "2026-01-02", close: 1000 }
        ]
      },
      latestQuotes: [],
      startDate: "2025-12-01"
    });

    expect(snapshots.map((snapshot) => snapshot.date)).toEqual(["2025-12-30", "2026-01-02"]);
  });


  it("treats buy and sell cash as internal fund activity while historical prices create multiple snapshots", () => {
    const trades: Trade[] = [
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-01-03",
        settlementDate: "2026-01-07",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "sell",
        quantity: 50,
        price: 1200,
        grossAmount: 60000
      }
    ];

    const latestQuotes: Quote[] = [
      {
        code: "7201",
        market: "東証",
        price: 1300,
        currency: "JPY",
        asOf: "2026-01-05T06:00:00.000Z",
        source: "Yahoo Finance",
        status: "delayed"
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {
        "7201::東証": [
          { date: "2026-01-02", close: 1000 },
          { date: "2026-01-03", close: 1200 },
          { date: "2026-01-04", close: 1100 }
        ]
      },
      latestQuotes
    });

    expect(snapshots).toEqual([
      { date: "2026-01-02", cash: 0, holdingsValue: 100000, nav: 100000, navTotalReturn: 100000, units: 1000, unitNav: 100 },
      { date: "2026-01-03", cash: 60000, holdingsValue: 60000, nav: 120000, navTotalReturn: 120000, units: 1000, unitNav: 120 },
      { date: "2026-01-04", cash: 60000, holdingsValue: 55000, nav: 115000, navTotalReturn: 115000, units: 1000, unitNav: 115 },
      { date: "2026-01-05", cash: 60000, holdingsValue: 65000, nav: 125000, navTotalReturn: 125000, units: 1000, unitNav: 125 }
    ]);
  });

  it("keeps 6846::名証 at average cost when price history is missing", () => {
    const trades: Trade[] = [
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
      },
      {
        tradeDate: "2026-06-17",
        settlementDate: "2026-06-19",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {
        "7201::東証": [
          { date: "2026-06-18", close: 1100 },
          { date: "2026-06-19", close: 1200 }
        ]
      },
      latestQuotes: []
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      date: "2026-06-18",
      cash: 0,
      holdingsValue: 245500,
      nav: 245500,
      units: 2355
    });
    expect(snapshots[0].unitNav).toBeCloseTo(104.24628450106158, 12);
    expect(snapshots[1]).toMatchObject({
      date: "2026-06-19",
      cash: 0,
      holdingsValue: 255500,
      nav: 255500,
      units: 2355
    });
    expect(snapshots[1].unitNav).toBeCloseTo(108.49256900212314, 12);
  });

  it("does not append a latest quote snapshot older than existing history", () => {
    const trades: Trade[] = [
      {
        tradeDate: "2026-06-20",
        settlementDate: "2026-06-24",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 300,
        grossAmount: 30000
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {
        "7201::東証": [
          { date: "2026-06-20", close: 300 },
          { date: "2026-06-21", close: 310 },
          { date: "2026-06-23", close: 320 }
        ]
      },
      latestQuotes: [
        {
          code: "7201",
          market: "東証",
          price: 305,
          currency: "JPY",
          asOf: "2026-06-22T06:30:00.000Z",
          source: "Yahoo Finance",
          status: "stale"
        }
      ]
    });

    expect(snapshots.map((snapshot) => snapshot.date)).toEqual([
      "2026-06-20",
      "2026-06-21",
      "2026-06-23"
    ]);
  });

  it("uses manual current cash for the latest quote snapshot without rewriting history", () => {
    const trades: Trade[] = [
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-01-03",
        settlementDate: "2026-01-07",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "sell",
        quantity: 50,
        price: 1200,
        grossAmount: 60000
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {
        "7201::東証": [
          { date: "2026-01-02", close: 1000 },
          { date: "2026-01-03", close: 1200 },
          { date: "2026-01-04", close: 1100 }
        ]
      },
      latestQuotes: [
        {
          code: "7201",
          market: "東証",
          price: 1300,
          currency: "JPY",
          asOf: "2026-01-05T06:00:00.000Z",
          source: "Yahoo Finance",
          status: "delayed"
        }
      ],
      currentCashOverride: 25000
    });

    expect(snapshots.at(-2)).toMatchObject({
      date: "2026-01-04",
      cash: 60000,
      holdingsValue: 55000,
      nav: 115000
    });
    expect(snapshots.at(-1)).toMatchObject({
      date: "2026-01-05",
      cash: 25000,
      holdingsValue: 65000,
      nav: 90000
    });
    expect(snapshots.at(-1)?.units).toBe(720);
    expect(snapshots.at(-1)?.unitNav).toBe(125);
  });

  it("uses post-split 378A quantity when valuing a latest quote after the split ex-date", () => {
    const trades: Trade[] = [
      {
        tradeDate: "2026-03-02",
        settlementDate: "2026-03-04",
        code: "378A",
        name: "ヒット",
        market: "東証",
        side: "buy",
        quantity: 3000,
        price: 2523.8333333333335,
        grossAmount: 7571500
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {},
      latestQuotes: [
        {
          code: "378A",
          market: "東証",
          price: 1011,
          currency: "JPY",
          asOf: "2026-06-29T06:30:00.000Z",
          source: "Yahoo Finance",
          status: "delayed"
        }
      ]
    });

    expect(snapshots.at(-1)).toMatchObject({
      date: "2026-06-29",
      holdingsValue: 6066000
    });
  });

  it("uses split-adjusted 378A quantities with split-adjusted Yahoo history before the ex-date", () => {
    const trades: Trade[] = [
      {
        tradeDate: "2026-03-02",
        settlementDate: "2026-03-04",
        code: "378A",
        name: "ヒット",
        market: "東証",
        side: "buy",
        quantity: 3000,
        price: 2523.8333333333335,
        grossAmount: 7571500
      }
    ];

    const snapshots = buildHistoricalSnapshots({
      trades,
      historyByHoldingId: {
        "378A::東証": [{ date: "2026-06-26", close: 1006 }]
      },
      latestQuotes: [
        {
          code: "378A",
          market: "東証",
          price: 1011,
          currency: "JPY",
          asOf: "2026-06-29T06:30:00.000Z",
          source: "Yahoo Finance",
          status: "delayed"
        }
      ]
    });

    expect(snapshots).toEqual([
      {
        date: "2026-06-26",
        cash: 0,
        holdingsValue: 6036000,
        nav: 6036000,
        navTotalReturn: 6036000,
        units: 75715,
        unitNav: 79.72000264148451
      },
      {
        date: "2026-06-29",
        cash: 0,
        holdingsValue: 6066000,
        nav: 6066000,
        navTotalReturn: 6066000,
        units: 75715,
        unitNav: 80.11622531862906
      }
    ]);
  });
});

describe("buildPerformanceChartData", () => {
  it("rebases visible performance from January 2026 when earlier snapshots exist", () => {
    const data = buildPerformanceChartData(
      [
        {
          date: "2025-12-31",
          cash: 0,
          holdingsValue: 0,
          nav: 1000,
          units: 10,
          unitNav: 100
        },
        {
          date: "2026-01-02",
          cash: 0,
          holdingsValue: 0,
          nav: 1200,
          units: 10,
          unitNav: 120
        },
        {
          date: "2026-01-03",
          cash: 0,
          holdingsValue: 0,
          nav: 1320,
          units: 10,
          unitNav: 132
        }
      ],
      [
        { date: "2025-12-31", value: 900, normalized: 100, source: "TOPIX" },
        { date: "2026-01-02", value: 1000, normalized: 111.111111111111, source: "TOPIX" },
        { date: "2026-01-03", value: 1100, normalized: 122.222222222222, source: "TOPIX" }
      ],
      [
        { date: "2025-12-31", value: 1800, normalized: 100, source: "Nikkei" },
        { date: "2026-01-02", value: 2000, normalized: 111.111111111111, source: "Nikkei" },
        { date: "2026-01-03", value: 2200, normalized: 122.222222222222, source: "Nikkei" }
      ]
    );

    expect(data).toEqual([
      { date: "2026-01-02", portfolio: 100, topix: 100, nikkei225: 100 },
      { date: "2026-01-03", portfolio: 110, topix: 110, nikkei225: 110 }
    ]);
  });

  it("rebases visible performance from a caller-provided start date", () => {
    const data = buildPerformanceChartData(
      [
        {
          date: "2025-12-31",
          cash: 0,
          holdingsValue: 0,
          nav: 1000,
          units: 10,
          unitNav: 100
        },
        {
          date: "2026-01-02",
          cash: 0,
          holdingsValue: 0,
          nav: 1200,
          units: 10,
          unitNav: 120
        }
      ],
      [
        { date: "2025-12-31", value: 900, normalized: 100, source: "TOPIX" },
        { date: "2026-01-02", value: 1000, normalized: 111.111111111111, source: "TOPIX" }
      ],
      [
        { date: "2025-12-31", value: 1800, normalized: 100, source: "Nikkei" },
        { date: "2026-01-02", value: 2000, normalized: 111.111111111111, source: "Nikkei" }
      ],
      "2025-12-01"
    );

    expect(data).toEqual([
      { date: "2025-12-31", portfolio: 100, topix: 100, nikkei225: 100 },
      { date: "2026-01-02", portfolio: 120, topix: 111.111111111111, nikkei225: 111.111111111111 }
    ]);
  });


  it("rebases portfolio and benchmark series to 100 at the first portfolio date", () => {
    const data = buildPerformanceChartData(
      [
        {
          date: "2026-01-02",
          cash: 0,
          holdingsValue: 0,
          nav: 1200,
          units: 10,
          unitNav: 120
        },
        {
          date: "2026-01-03",
          cash: 0,
          holdingsValue: 0,
          nav: 1320,
          units: 10,
          unitNav: 132
        }
      ],
      [
        { date: "2026-01-01", value: 900, normalized: 100, source: "TOPIX" },
        { date: "2026-01-02", value: 1000, normalized: 111.111111111111, source: "TOPIX" },
        { date: "2026-01-03", value: 1100, normalized: 122.222222222222, source: "TOPIX" }
      ],
      [
        { date: "2026-01-01", value: 1800, normalized: 100, source: "Nikkei" },
        { date: "2026-01-02", value: 2000, normalized: 111.111111111111, source: "Nikkei" },
        { date: "2026-01-03", value: 2200, normalized: 122.222222222222, source: "Nikkei" }
      ]
    );

    expect(data).toEqual([
      { date: "2026-01-02", portfolio: 100, topix: 100, nikkei225: 100 },
      { date: "2026-01-03", portfolio: 110, topix: 110, nikkei225: 110 }
    ]);
  });
});
