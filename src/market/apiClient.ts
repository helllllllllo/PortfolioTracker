import type { BenchmarkPoint, Currency, Holding, Quote } from "../types";
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

const USDJPY_SYMBOL = "USDJPY=X";

function isUsHolding(holding: Holding): boolean {
  return holding.market === "US" || holding.currency === "USD";
}

function yahooUsSymbol(code: string): string {
  if (code === "BRKB") return "BRK-B";
  return code;
}

function symbolForHolding(holding: Holding): string {
  if (isUsHolding(holding)) return yahooUsSymbol(holding.code);
  if (holding.market.includes("名証")) return `${holding.code}.N`;
  return `${holding.code}.T`;
}

function uniqueSymbols(holdings: Holding[], baseCurrency: Currency): string[] {
  const symbols = holdings.map(symbolForHolding);
  if (baseCurrency === "JPY" && holdings.some(isUsHolding)) symbols.push(USDJPY_SYMBOL);
  return Array.from(new Set(symbols));
}

function fxRateForDate(rows: ServerHistoryRow[], date: string): number | null {
  return (
    [...rows]
      .filter((row) => row.date <= date && row.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)?.value ?? null
  );
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchQuotesForHoldings(
  holdings: Holding[],
  baseCurrency: Currency = "JPY"
): Promise<Quote[]> {
  const symbols = uniqueSymbols(holdings, baseCurrency);
  if (symbols.length === 0) return [];

  const data = await fetchJson<{ quotes: ServerQuote[] }>(
    `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`
  );
  const quoteBySymbol = new Map(data.quotes.map((quote) => [quote.symbol, quote]));
  const usdJpy = quoteBySymbol.get(USDJPY_SYMBOL)?.price ?? null;

  return holdings.map((holding) => {
    const symbol = symbolForHolding(holding);
    const quote = quoteBySymbol.get(symbol);
    const usHolding = isUsHolding(holding);
    const quoteCurrency: Currency = usHolding && baseCurrency === "USD" ? "USD" : "JPY";

    if (!quote) {
      return {
        code: holding.code,
        market: holding.market,
        price: null,
        currency: quoteCurrency,
        asOf: null,
        source: "Portfolio API",
        status: "missing",
        message: "No free quote found",
        fxRateToJpy: quoteCurrency === "JPY" && usHolding && usdJpy ? usdJpy : undefined
      };
    }

    if (usHolding && baseCurrency === "USD") {
      return {
        code: holding.code,
        market: holding.market,
        price: quote.price,
        currency: "USD",
        asOf: quote.asOf,
        source: quote.source,
        status: quote.status ?? (quote.price === null ? "missing" : "delayed"),
        message: quote.message
      };
    }

    if (usHolding) {
      if (!usdJpy || quote.price === null) {
        return {
          code: holding.code,
          market: holding.market,
          price: null,
          currency: "JPY",
          asOf: quote.asOf,
          source: quote.source,
          status: quote.status ?? "missing",
          message: quote.price === null ? quote.message : "Missing USDJPY=X conversion rate",
          fxRateToJpy: usdJpy ?? undefined
        };
      }

      return {
        code: holding.code,
        market: holding.market,
        price: quote.price * usdJpy,
        currency: "JPY",
        asOf: quote.asOf,
        source: `${quote.source} / ${USDJPY_SYMBOL}`,
        status: quote.status ?? "delayed",
        message: quote.message,
        fxRateToJpy: usdJpy
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
  range = "1y",
  baseCurrency: Currency = "JPY"
): Promise<HoldingHistoryMap> {
  const symbols = uniqueSymbols(holdings, baseCurrency);
  if (symbols.length === 0) return {};

  const data = await fetchJson<{ history: ServerHistorySeries[] }>(
    `/api/history?symbols=${encodeURIComponent(symbols.join(","))}&range=${encodeURIComponent(range)}`
  );
  const historyBySymbol = new Map(data.history.map((series) => [series.symbol, series.rows]));
  const usdJpyRows = historyBySymbol.get(USDJPY_SYMBOL) ?? [];

  return Object.fromEntries(
    holdings.map((holding) => {
      const rows = historyBySymbol.get(symbolForHolding(holding)) ?? [];
      const convertedRows = isUsHolding(holding) && baseCurrency === "JPY"
        ? rows.flatMap((row) => {
            const fx = fxRateForDate(usdJpyRows, row.date);
            return fx === null ? [] : [{ date: row.date, close: row.value * fx }];
          })
        : rows.map((row) => ({
            date: row.date,
            close: row.value
          }));

      return [holding.id, convertedRows];
    })
  );
}

export type BenchmarkMode = "japan" | "us";

export async function fetchBenchmarks(range = "1y", mode: BenchmarkMode = "japan"): Promise<{
  topix: BenchmarkPoint[];
  nikkei225: BenchmarkPoint[];
}> {
  const benchmarkSymbols = mode === "us" ? "&symbols=%5EGSPC" : "";
  const data = await fetchJson<{
    topix: Array<{ date: string; value: number }>;
    nikkei225: Array<{ date: string; value: number }>;
  }>(`/api/benchmarks?range=${encodeURIComponent(range)}${benchmarkSymbols}`);

  return {
    topix: normalizeBenchmark(
      data.topix,
      mode === "us" ? "Yahoo Finance ^GSPC" : "Yahoo Finance TOPIX proxy"
    ),
    nikkei225:
      mode === "us"
        ? []
        : normalizeBenchmark(data.nikkei225, "Nikkei official Net Total Return")
  };
}
