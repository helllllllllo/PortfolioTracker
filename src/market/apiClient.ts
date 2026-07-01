import type { BenchmarkPoint, Holding, Quote } from "../types";
import type { HoldingHistoryMap } from "../portfolio/history";
import { normalizeBenchmark } from "./benchmarks";

type ServerQuote = {
  symbol: string;
  price: number | null;
  asOf: string | null;
  source: string;
  status?: Quote["status"];
  message?: string;
};

type ServerHistoryRow = {
  date: string;
  value: number;
};

type ServerHistorySeries = {
  symbol: string;
  rows: ServerHistoryRow[];
};

function symbolForHolding(holding: Holding): string {
  if (holding.market.includes("名証")) return `${holding.code}.N`;
  return `${holding.code}.T`;
}

function uniqueSymbols(holdings: Holding[]): string[] {
  return Array.from(new Set(holdings.map(symbolForHolding)));
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchQuotesForHoldings(holdings: Holding[]): Promise<Quote[]> {
  const symbols = uniqueSymbols(holdings);
  if (symbols.length === 0) return [];

  const data = await fetchJson<{ quotes: ServerQuote[] }>(
    `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`
  );
  const quoteBySymbol = new Map(data.quotes.map((quote) => [quote.symbol, quote]));

  return holdings.map((holding) => {
    const quote = quoteBySymbol.get(symbolForHolding(holding));

    if (!quote) {
      return {
        code: holding.code,
        market: holding.market,
        price: null,
        currency: "JPY",
        asOf: null,
        source: "Portfolio API",
        status: "missing",
        message: "No free quote found"
      };
    }

    return {
      code: holding.code,
      market: holding.market,
      price: quote.price,
      currency: "JPY",
      asOf: quote.asOf,
      source: quote.source,
      status: quote.status ?? (quote.price === null ? "missing" : "delayed"),
      message: quote.message
    };
  });
}

export async function fetchHistoryForHoldings(
  holdings: Holding[],
  range = "1y"
): Promise<HoldingHistoryMap> {
  const symbols = uniqueSymbols(holdings);
  if (symbols.length === 0) return {};

  const data = await fetchJson<{ history: ServerHistorySeries[] }>(
    `/api/history?symbols=${encodeURIComponent(symbols.join(","))}&range=${encodeURIComponent(range)}`
  );
  const historyBySymbol = new Map(data.history.map((series) => [series.symbol, series.rows]));

  return Object.fromEntries(
    holdings.map((holding) => {
      const rows = historyBySymbol.get(symbolForHolding(holding)) ?? [];
      return [holding.id, rows.map((row) => ({ date: row.date, close: row.value }))];
    })
  );
}

export async function fetchBenchmarks(range = "1y"): Promise<{
  topix: BenchmarkPoint[];
  nikkei225: BenchmarkPoint[];
}> {
  const data = await fetchJson<{
    topix: Array<{ date: string; value: number }>;
    nikkei225: Array<{ date: string; value: number }>;
  }>(`/api/benchmarks?range=${encodeURIComponent(range)}`);

  return {
    topix: normalizeBenchmark(data.topix, "TOPIX Total Return (1306.T)"),
    nikkei225: normalizeBenchmark(data.nikkei225, "Nikkei 225 Net Total Return")
  };
}
