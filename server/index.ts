import express from "express";
import {
  fetchNikkei225NetTotalReturnDailySeries,
  fetchYahooDailySeries,
  fetchYahooLatest
} from "./yahooFinance.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

// NEXT FUNDS TOPIX ETF; Yahoo adjusted close reinvests distributions ≈ TOPIX total return.
const TOPIX_TR_SYMBOL = "1306.T";

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

  try {
    const [topix, nikkei225] = await Promise.all([
      fetchYahooDailySeries(TOPIX_TR_SYMBOL, range, true),
      fetchNikkei225NetTotalReturnDailySeries(range)
    ]);

    res.json({ topix, nikkei225 });
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
