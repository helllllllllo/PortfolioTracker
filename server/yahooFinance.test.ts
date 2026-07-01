import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchNikkei225NetTotalReturnDailySeries,
  fetchYahooDailySeriesWithFallback,
  fetchYahooLatest
} from "./yahooFinance.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetchYahooDailySeriesWithFallback", () => {
  it("falls back to 1306.T when the primary symbol returns no daily rows", async () => {
    const primaryEmpty = {
      chart: {
        result: [
          {
            timestamp: [1760000000],
            indicators: { quote: [{ close: [0] }] }
          }
        ]
      }
    };

    const fallbackRows = {
      chart: {
        result: [
          {
            timestamp: [1760000000],
            indicators: { quote: [{ close: [1234] }] }
          }
        ]
      }
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(primaryEmpty)) as Response)
      .mockResolvedValueOnce(new Response(JSON.stringify(fallbackRows)) as Response);

    const result = await fetchYahooDailySeriesWithFallback("^TOPX", "1306.T", "5d");

    expect(result).toEqual({
      rows: [
        {
          date: new Date(1760000000 * 1000).toISOString().slice(0, 10),
          value: 1234
        }
      ],
      source: "1306.T"
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns an empty series when the Yahoo endpoint responds with non-JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not json", {
        status: 200
      }) as Response
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not json", {
        status: 200
      }) as Response
    );

    const rows = await fetchYahooDailySeriesWithFallback("^TOPX", "1306.T", "5d");

    expect(rows.rows).toEqual([]);
  });
});

describe("fetchNikkei225NetTotalReturnDailySeries", () => {
  it("parses Nikkei official CSV net total return values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        [
          "Date of Data,Close,Close(Nikkei 225 Net Total Return Index)",
          "\"2025/12/30\",\"91630.43\",\"82591.38\"",
          "\"2026/01/05\",\"94348.65\",\"85041.45\"",
          "\"2026/03/31\",\"93629.13\",\"84268.22\""
        ].join("\n"),
        { status: 200 }
      ) as Response
    );

    await expect(fetchNikkei225NetTotalReturnDailySeries("1y")).resolves.toEqual([
      { date: "2025-12-30", value: 82591.38 },
      { date: "2026-01-05", value: 85041.45 },
      { date: "2026-03-31", value: 84268.22 }
    ]);
  });

  it("returns an empty series when the Nikkei CSV cannot be fetched", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not found", { status: 404 }) as Response
    );

    await expect(fetchNikkei225NetTotalReturnDailySeries("1y")).resolves.toEqual([]);
  });
});

describe("fetchYahooLatest", () => {
  it("classifies the quote as live-ish when asOf is within 15 minutes", async () => {
    const now = new Date("2026-06-23T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3000,
                  regularMarketTime: Math.floor(now.getTime() / 1000) - 60 * 10
                }
              }
            ]
          }
        }),
        { status: 200 }
      ) as Response
    );

    const quote = await fetchYahooLatest("7974.T");

    expect(quote.status).toBe("live-ish");
    expect(quote.price).toBe(3000);
  });

  it("classifies the quote as delayed when asOf is within 48 hours", async () => {
    const now = new Date("2026-06-23T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3000,
                  regularMarketTime: Math.floor(now.getTime() / 1000) - 3600
                }
              }
            ]
          }
        }),
        { status: 200 }
      ) as Response
    );

    const quote = await fetchYahooLatest("7974.T");

    expect(quote.status).toBe("delayed");
    expect(quote.price).toBe(3000);
  });

  it("classifies the quote as stale when asOf is older than 48 hours", async () => {
    const now = new Date("2026-06-23T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3000,
                  regularMarketTime: Math.floor(now.getTime() / 1000) - 3600 * 50
                }
              }
            ]
          }
        }),
        { status: 200 }
      ) as Response
    );

    const quote = await fetchYahooLatest("7974.T");

    expect(quote.status).toBe("stale");
    expect(quote.price).toBe(3000);
  });

  it("returns missing quote metadata when quote price is null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chart: {
            result: [{ meta: { regularMarketPrice: null, regularMarketTime: 1 } }]
          }
        }),
        { status: 200 }
      ) as Response
    );

    const quote = await fetchYahooLatest("7974.T");

    expect(quote.status).toBe("missing");
    expect(quote.price).toBeNull();
    expect(quote.message).toBe("No latest price returned for 7974.T");
  });

  it("returns missing quote metadata when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));
    const quote = await fetchYahooLatest("7974.T");

    expect(quote.status).toBe("missing");
    expect(quote.message).toBe("network down");
    expect(quote.price).toBeNull();
  });

  it("falls back to Yahoo Japan Finance for Nagoya listings rejected by the global chart API", async () => {
    const now = new Date("2026-06-23T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const yahooJapanHtml = String.raw`
      <script>
        self.__next_f.push([1,"{\"previousPrice\":{\"name\":\"前日終値\",\"value\":\"1,380\",\"updateDate\":\"06/22\",\"updateDateMeta\":\"2026-06-22\"}}"]);
      </script>
    `;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("not found", { status: 404 }) as Response)
      .mockResolvedValueOnce(new Response(yahooJapanHtml, { status: 200 }) as Response);

    const quote = await fetchYahooLatest("6846.N");

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://finance.yahoo.co.jp/quote/6846.N",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Language": "ja,en-US;q=0.8,en;q=0.6"
        })
      })
    );
    expect(quote).toEqual({
      symbol: "6846.N",
      price: 1380,
      asOf: "2026-06-22T00:00:00.000Z",
      source: "Yahoo Japan Finance",
      status: "delayed",
      message: "Yahoo Japan previous close fallback"
    });
  });

  it("returns missing quote metadata when the Yahoo Japan fallback has no parseable price", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("not found", { status: 404 }) as Response)
      .mockResolvedValueOnce(new Response("<html></html>", { status: 200 }) as Response);

    const quote = await fetchYahooLatest("6846.N");

    expect(quote.status).toBe("missing");
    expect(quote.price).toBeNull();
    expect(quote.message).toBe("No Yahoo Japan price returned for 6846.N");
  });
});
