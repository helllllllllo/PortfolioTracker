import type { BenchmarkPoint, Holding, Quote } from "../types";
import type { HoldingHistoryMap } from "../portfolio/history";
import type { DividendRecord } from "../dividends/computeDividends";
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

type ServerSplit = { date: string; ratio: number };

type ServerHistorySeries = {
  symbol: string;
  rows: ServerHistoryRow[];
  splits?: ServerSplit[];
};

export type HoldingHistoryResult = {
  historyByCode: HoldingHistoryMap;
  splitsByCode: Record<string, Array<{ exDate: string; ratio: number }>>;
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
): Promise<HoldingHistoryResult> {
  const symbols = uniqueSymbols(holdings);
  if (symbols.length === 0) return { historyByCode: {}, splitsByCode: {} };

  const data = await fetchJson<{ history: ServerHistorySeries[] }>(
    `/api/history?symbols=${encodeURIComponent(symbols.join(","))}&range=${encodeURIComponent(range)}`
  );
  const bySymbol = new Map(data.history.map((series) => [series.symbol, series]));

  const historyByCode: HoldingHistoryMap = {};
  const splitsByCode: Record<string, Array<{ exDate: string; ratio: number }>> = {};
  for (const holding of holdings) {
    const series = bySymbol.get(symbolForHolding(holding));
    historyByCode[holding.id] = (series?.rows ?? []).map((row) => ({ date: row.date, close: row.value }));
    splitsByCode[holding.code] = (series?.splits ?? []).map((split) => ({
      exDate: split.date,
      ratio: split.ratio
    }));
  }
  return { historyByCode, splitsByCode };
}

export async function fetchDividends(codes: string[]): Promise<Record<string, DividendRecord[]>> {
  const unique = Array.from(new Set(codes.filter(Boolean)));
  if (unique.length === 0) return {};
  const data = await fetchJson<{ dividends: Record<string, DividendRecord[]> }>(
    `/api/dividends?codes=${encodeURIComponent(unique.join(","))}`
  );
  return data.dividends ?? {};
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
