type YahooChartResult = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
        currency?: string;
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: { description?: string };
  };
};

type YahooQuote = {
  symbol: string;
  price: number | null;
  asOf: string | null;
  source: string;
  status: "live-ish" | "delayed" | "stale" | "missing";
  message?: string;
};

type YahooChartItem = NonNullable<
  NonNullable<YahooChartResult["chart"]>["result"]
>[number];

const LIVEISH_MINUTES_MS = 15 * 60 * 1000;
const DELAYED_MINUTES_MS = 48 * 60 * 60 * 1000;
const YAHOO_JAPAN_SOURCE = "Yahoo Japan Finance";
const NIKKEI_225_TOTAL_RETURN_DAILY_CSV =
  "https://indexes.nikkei.co.jp/nkave/historical/nikkei_225_total_return_index_daily_en.csv";

function yahooHeaders(region: "global" | "japan" = "global"): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "portfolio-dashboard/0.1"
  };

  if (region === "japan") {
    headers["Accept-Language"] = "ja,en-US;q=0.8,en;q=0.6";
  }

  return headers;
}

function isYahooJapanQuoteSymbol(symbol: string): boolean {
  return /\.N$/i.test(symbol);
}

function quoteStatusFromAsOf(asOf: string): YahooQuote["status"] {
  const ageMs = Date.now() - new Date(asOf).getTime();
  if (ageMs <= LIVEISH_MINUTES_MS) return "live-ish";
  if (ageMs <= DELAYED_MINUTES_MS) return "delayed";
  return "stale";
}

function quoteMissing(symbol: string, message?: string): YahooQuote {
  return {
    symbol,
    price: null,
    asOf: null,
    source: "Yahoo Finance",
    status: "missing",
    message
  };
}

function quoteFromMarketData(symbol: string, result: YahooChartItem | undefined): YahooQuote {
  const time = result?.meta?.regularMarketTime ?? null;
  const price = result?.meta?.regularMarketPrice ?? null;
  const asOf = time ? new Date(time * 1000).toISOString() : null;

  if (price === null) {
    return quoteMissing(symbol, `No latest price returned for ${symbol}`);
  }

  if (!asOf) {
    return {
      symbol,
      price,
      asOf: null,
      source: "Yahoo Finance",
      status: "stale",
      message: `No timestamp returned for ${symbol}`
    };
  }

  return { symbol, price, asOf, source: "Yahoo Finance", status: quoteStatusFromAsOf(asOf) };
}

function parseYahooJapanNumber(value: string | undefined): number | null {
  if (!value || value.includes("---")) return null;
  const price = Number(value.replace(/[,\s]/g, ""));
  return Number.isFinite(price) && price > 0 ? price : null;
}

function parseYahooJapanAsOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseYahooJapanPreviousClose(html: string): { price: number; asOf: string } | null {
  const normalized = html.replace(/\\"/g, '"');
  const match = normalized.match(
    /"previousPrice":\{[^}]*?"value":"([^"]+)"[^}]*?"updateDateMeta":(?:"([^"]+)"|null)/
  );
  const price = parseYahooJapanNumber(match?.[1]);
  const asOf = parseYahooJapanAsOf(match?.[2]);

  if (price === null || asOf === null) return null;
  return { price, asOf };
}

async function fetchYahooJapanLatest(symbol: string): Promise<YahooQuote> {
  const url = `https://finance.yahoo.co.jp/quote/${encodeURIComponent(symbol)}`;

  try {
    const response = await fetch(url, { headers: yahooHeaders("japan") });

    if (!response.ok) {
      return quoteMissing(symbol, `Yahoo Japan request failed with status ${response.status}`);
    }

    const html = await response.text();
    const previousClose = parseYahooJapanPreviousClose(html);

    if (!previousClose) {
      return quoteMissing(symbol, `No Yahoo Japan price returned for ${symbol}`);
    }

    return {
      symbol,
      price: previousClose.price,
      asOf: previousClose.asOf,
      source: YAHOO_JAPAN_SOURCE,
      status: quoteStatusFromAsOf(previousClose.asOf),
      message: "Yahoo Japan previous close fallback"
    };
  } catch (error) {
    return quoteMissing(
      symbol,
      error instanceof Error ? error.message : "Failed to fetch Yahoo Japan quote"
    );
  }
}

export async function fetchYahooLatest(symbol: string): Promise<YahooQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=1d&interval=1m`;

  try {
    const response = await fetch(url, { headers: yahooHeaders() });

    if (!response.ok) {
      if (isYahooJapanQuoteSymbol(symbol)) return fetchYahooJapanLatest(symbol);
      return quoteMissing(symbol, `Request failed with status ${response.status}`);
    }

    const json = (await response.json()) as YahooChartResult;
    const result = json.chart?.result?.[0];

    const quote = quoteFromMarketData(symbol, result);
    if (quote.status === "missing" && isYahooJapanQuoteSymbol(symbol)) {
      return fetchYahooJapanLatest(symbol);
    }

    return quote;
  } catch (error) {
    if (isYahooJapanQuoteSymbol(symbol)) return fetchYahooJapanLatest(symbol);

    return quoteMissing(
      symbol,
      error instanceof Error ? error.message : "Failed to fetch latest quote"
    );
  }
}

export async function fetchYahooDailySeries(
  symbol: string,
  range = "1y",
  useAdjClose = false
): Promise<Array<{ date: string; value: number }>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${encodeURIComponent(range)}&interval=1d`;

  try {
    const response = await fetch(url, { headers: yahooHeaders() });

    if (!response.ok) return [];

    const json = (await response.json()) as YahooChartResult & {
      chart?: {
        result?: Array<{
          indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const adjCloses =
      (result as { indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }> } })
        ?.indicators?.adjclose?.[0]?.adjclose ?? [];

    return timestamps
      .map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        value: (useAdjClose ? adjCloses[index] ?? closes[index] : closes[index]) ?? 0
      }))
      .filter((row) => row.value > 0);
  } catch {
    return [];
  }
}

export async function fetchYahooHistoryWithSplits(
  symbol: string,
  range = "1y"
): Promise<{ rows: Array<{ date: string; value: number }>; splits: Array<{ date: string; ratio: number }> }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${encodeURIComponent(range)}&interval=1d&events=split`;

  try {
    const response = await fetch(url, { headers: yahooHeaders() });
    if (!response.ok) return { rows: [], splits: [] };

    const json = (await response.json()) as YahooChartResult & {
      chart?: {
        result?: Array<{
          events?: { splits?: Record<string, { date?: number; numerator?: number; denominator?: number }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const rows = timestamps
      .map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        value: closes[index] ?? 0
      }))
      .filter((row) => row.value > 0);

    const rawSplits =
      (result as { events?: { splits?: Record<string, { date?: number; numerator?: number; denominator?: number }> } })
        ?.events?.splits ?? {};
    const splits = Object.values(rawSplits)
      .map((split) => ({
        date: split.date ? new Date(split.date * 1000).toISOString().slice(0, 10) : "",
        ratio: split.numerator && split.denominator ? split.numerator / split.denominator : 0
      }))
      .filter((split) => split.date !== "" && split.ratio > 0);

    return { rows, splits };
  } catch {
    return { rows: [], splits: [] };
  }
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

export async function fetchNikkei225NetTotalReturnDailySeries(
  _range = "1y"
): Promise<Array<{ date: string; value: number }>> {
  try {
    const response = await fetch(NIKKEI_225_TOTAL_RETURN_DAILY_CSV, { headers: yahooHeaders() });
    if (!response.ok) return [];

    const csv = await response.text();
    return csv
      .split(/\r?\n/)
      .slice(1)
      .flatMap((line) => {
        if (!line.trim()) return [];
        const [rawDate, , rawNetTotalReturn] = parseCsvLine(line);
        const value = Number(rawNetTotalReturn);

        if (!rawDate || !Number.isFinite(value) || value <= 0) return [];

        return [
          {
            date: rawDate.replaceAll("/", "-"),
            value
          }
        ];
      });
  } catch {
    return [];
  }
}

export type YahooBenchmarkSeriesWithSource = {
  rows: Array<{ date: string; value: number }>;
  source: string;
};

export async function fetchYahooDailySeriesWithFallback(
  primarySymbol: string,
  fallbackSymbol: string,
  range = "1y"
): Promise<YahooBenchmarkSeriesWithSource> {
  const primary = await fetchYahooDailySeries(primarySymbol, range);

  if (primary.length > 0) {
    return {
      rows: primary,
      source: primarySymbol
    };
  }

  const fallback = await fetchYahooDailySeries(fallbackSymbol, range);
  return {
    rows: fallback,
    source: fallbackSymbol
  };
}
