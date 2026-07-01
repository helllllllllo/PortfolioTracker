import { describe, expect, it, vi } from "vitest";
import type { Holding } from "../types";
import { fetchBenchmarks, fetchHistoryForHoldings, fetchQuotesForHoldings } from "./apiClient";

describe("fetchQuotesForHoldings", () => {
  it("maps holdings to regional quote symbols and preserves server status payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quotes: [
          {
            symbol: "6846.N",
            price: 1380,
            asOf: "2026-06-23T00:00:00.000Z",
            source: "Yahoo Japan Finance",
            status: "delayed",
            message: "Yahoo Japan previous close fallback"
          },
          {
            symbol: "7201.T",
            price: 1234,
            asOf: "2026-06-23T01:23:45.000Z",
            source: "Portfolio API",
            status: "live-ish",
            message: "Fresh quote"
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

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
      },
      {
        id: "7201::東証",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        quantity: 200,
        averageCost: 610,
        costBasis: 122000,
        realizedPnl: 0
      }
    ];

    const result = await fetchQuotesForHoldings(holdings);

    expect(fetchMock).toHaveBeenCalledWith("/api/quotes?symbols=6846.N%2C7201.T");
    expect(result).toEqual([
      {
        code: "6846",
        market: "名証",
        price: 1380,
        currency: "JPY",
        asOf: "2026-06-23T00:00:00.000Z",
        source: "Yahoo Japan Finance",
        status: "delayed",
        message: "Yahoo Japan previous close fallback"
      },
      {
        code: "7201",
        market: "東証",
        price: 1234,
        currency: "JPY",
        asOf: "2026-06-23T01:23:45.000Z",
        source: "Portfolio API",
        status: "live-ish",
        message: "Fresh quote"
      }
    ]);
  });

  it("maps US holdings to Yahoo US symbols and converts quotes through USDJPY", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quotes: [
          {
            symbol: "BRK-B",
            price: 500,
            asOf: "2026-06-29T14:30:00.000Z",
            source: "Yahoo Finance",
            status: "delayed"
          },
          {
            symbol: "USDJPY=X",
            price: 160,
            asOf: "2026-06-29T14:31:00.000Z",
            source: "Yahoo Finance",
            status: "delayed"
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const holdings: Holding[] = [
      {
        id: "BRKB::US",
        code: "BRKB",
        name: "BERKSHIRE HATHAWAY CLASS B",
        market: "US",
        quantity: 2,
        averageCost: 470,
        costBasis: 940,
        realizedPnl: 0,
        currency: "USD"
      }
    ];

    const result = await fetchQuotesForHoldings(holdings);

    expect(fetchMock).toHaveBeenCalledWith("/api/quotes?symbols=BRK-B%2CUSDJPY%3DX");
    expect(result).toEqual([
      {
        code: "BRKB",
        market: "US",
        price: 80000,
        currency: "JPY",
        asOf: "2026-06-29T14:30:00.000Z",
        source: "Yahoo Finance / USDJPY=X",
        status: "delayed",
        message: undefined,
        fxRateToJpy: 160
      }
    ]);
  });
});

describe("fetchHistoryForHoldings", () => {
  it("maps holdings to history symbols and returns rows keyed by canonical holding id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          {
            symbol: "6846.N",
            rows: []
          },
          {
            symbol: "7201.T",
            rows: [
              { date: "2026-06-20", value: 998.5 },
              { date: "2026-06-23", value: 1012 }
            ]
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

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
      },
      {
        id: "7201::東証",
        code: "7201",
        name: "日産自動車",
        market: "東証（外）",
        quantity: 200,
        averageCost: 610,
        costBasis: 122000,
        realizedPnl: 0
      }
    ];

    const result = await fetchHistoryForHoldings(holdings, "1y");

    expect(fetchMock).toHaveBeenCalledWith("/api/history?symbols=6846.N%2C7201.T&range=1y");
    expect(result).toEqual({
      "6846::名証": [],
      "7201::東証": [
        { date: "2026-06-20", close: 998.5 },
        { date: "2026-06-23", close: 1012 }
      ]
    });
  });

  it("converts US history rows to JPY using USDJPY history", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          {
            symbol: "SNOW",
            rows: [
              { date: "2026-06-27", value: 220 },
              { date: "2026-06-28", value: 225 }
            ]
          },
          {
            symbol: "USDJPY=X",
            rows: [
              { date: "2026-06-27", value: 159 },
              { date: "2026-06-28", value: 160 }
            ]
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const holdings: Holding[] = [
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
    ];

    const result = await fetchHistoryForHoldings(holdings, "1y");

    expect(fetchMock).toHaveBeenCalledWith("/api/history?symbols=SNOW%2CUSDJPY%3DX&range=1y");
    expect(result).toEqual({
      "SNOW::US": [
        { date: "2026-06-27", close: 34980 },
        { date: "2026-06-28", close: 36000 }
      ]
    });
  });
});

describe("fetchBenchmarks", () => {
  it("labels Japan TOPIX data as a proxy because the server may fall back to 1308.T", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        topix: [
          { date: "2026-06-26", value: 2800 },
          { date: "2026-06-29", value: 2828 }
        ],
        nikkei225: [
          { date: "2026-06-26", value: 84000 },
          { date: "2026-06-29", value: 84840 }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBenchmarks("1y", "japan");

    expect(fetchMock).toHaveBeenCalledWith("/api/benchmarks?range=1y");
    expect(result.topix[0].source).toBe("Yahoo Finance TOPIX proxy");
    expect(result.nikkei225[0].source).toBe("Nikkei official Net Total Return");
  });

  it("requests S&P 500 data for US benchmark mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        topix: [
          { date: "2026-06-26", value: 6000 },
          { date: "2026-06-29", value: 6060 }
        ],
        nikkei225: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBenchmarks("1y", "us");

    expect(fetchMock).toHaveBeenCalledWith("/api/benchmarks?range=1y&symbols=%5EGSPC");
    expect(result.topix[0].source).toBe("Yahoo Finance ^GSPC");
    expect(result.nikkei225).toEqual([]);
  });
});
