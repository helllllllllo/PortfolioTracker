import express from "express";
import {
  fetchNikkei225NetTotalReturnDailySeries,
  fetchYahooDailySeries,
  fetchYahooDailySeriesWithFallback,
  fetchYahooLatest
} from "./yahooFinance.js";
import { TOPIX_FALLBACK_SYMBOL } from "./benchmarkSymbols.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const DEFAULT_BENCHMARK_SYMBOLS = ["^TOPX", "^N225"];

function parseBenchmarkSymbols(rawSymbols: unknown): [string, string] {
  const provided = String(rawSymbols ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  const [firstSymbol, secondSymbol] = provided;

  return [
    firstSymbol && firstSymbol.length > 0 ? firstSymbol : DEFAULT_BENCHMARK_SYMBOLS[0],
    secondSymbol && secondSymbol.length > 0 ? secondSymbol : DEFAULT_BENCHMARK_SYMBOLS[1]
  ];
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/quotes", async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  const quotes = await Promise.all(symbols.map((symbol) => fetchYahooLatest(symbol)));
  res.json({ quotes });
});

app.get("/api/benchmarks", async (req, res) => {
  const range = String(req.query.range ?? "1y");
  const [topixSymbol, nikkeiSymbol] = parseBenchmarkSymbols(req.query.symbols);

  try {
    const [topixResult, nikkei225] = await Promise.all([
      fetchYahooDailySeriesWithFallback(topixSymbol, TOPIX_FALLBACK_SYMBOL, range),
      nikkeiSymbol === DEFAULT_BENCHMARK_SYMBOLS[1]
        ? fetchNikkei225NetTotalReturnDailySeries(range)
        : fetchYahooDailySeries(nikkeiSymbol, range)
    ]);

    res.json({
      topix: topixResult.rows,
      nikkei225
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load benchmarks";
    res.status(500).json({ error: msg });
  }
});

app.get("/api/history", async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
  const range = String(req.query.range ?? "1y");

  try {
    const history = await Promise.all(
      symbols.map(async (symbol) => ({
        symbol,
        rows: await fetchYahooDailySeries(symbol, range)
      }))
    );

    res.json({ history });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load price history";
    res.status(500).json({ error: msg });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio API listening on http://127.0.0.1:${port}`);
});
