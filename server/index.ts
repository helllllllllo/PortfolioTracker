import express from "express";
import {
  fetchNikkei225NetTotalReturnDailySeries,
  fetchYahooDailySeries,
  fetchYahooHistoryWithSplits,
  fetchYahooLatest
} from "./yahooFinance.js";
import {
  fetchJQuantsDailyBars,
  fetchJQuantsDividends,
  fetchJQuantsIndex,
  fetchJQuantsLatest,
  hasJQuants
} from "./jquants.js";

// Load .env (Node 20.6+ built-in) so JQUANTS_API_KEY is available without a dependency.
try {
  (process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile(".env");
} catch {
  // No .env present, or already loaded via the environment — fine.
}

const app = express();
const port = Number(process.env.PORT ?? 8787);

// TOPIX Net Total Return (matches the Nikkei Net TR basis). Yahoo TOPIX-ETF fallback.
const TOPIX_NET_TR_INDEX = "6095";
const TOPIX_TR_FALLBACK_SYMBOL = "1306.T";

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
  res.json({ ok: true, source: hasJQuants() ? "j-quants" : "yahoo" });
});

app.get("/api/quotes", async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  const quotes = await Promise.all(
    symbols.map(async (symbol) => {
      if (hasJQuants()) {
        const jq = await fetchJQuantsLatest(symbol);
        if (jq) {
          return {
            symbol,
            price: jq.price,
            asOf: jq.asOf,
            source: "J-Quants",
            status: "delayed" as const
          };
        }
      }
      return fetchYahooLatest(symbol); // fallback (e.g. Nagoya-only names not on J-Quants)
    })
  );
  res.json({ quotes });
});

app.get("/api/benchmarks", async (req, res) => {
  const range = String(req.query.range ?? "1y");

  try {
    const topixPromise = hasJQuants()
      ? fetchJQuantsIndex(TOPIX_NET_TR_INDEX, range).then((rows) =>
          rows.length > 0 ? rows : fetchYahooDailySeries(TOPIX_TR_FALLBACK_SYMBOL, range, true)
        )
      : fetchYahooDailySeries(TOPIX_TR_FALLBACK_SYMBOL, range, true);

    const [topix, nikkei225] = await Promise.all([
      topixPromise,
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
      symbols.map(async (symbol) => {
        if (hasJQuants()) {
          const jq = await fetchJQuantsDailyBars(symbol, range);
          if (jq.rows.length > 0) return { symbol, rows: jq.rows, splits: jq.splits };
        }
        const { rows, splits } = await fetchYahooHistoryWithSplits(symbol, range);
        return { symbol, rows, splits };
      })
    );

    res.json({ history });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load price history";
    res.status(500).json({ error: msg });
  }
});

app.get("/api/dividends", async (req, res) => {
  const codes = String(req.query.codes ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  if (!hasJQuants()) {
    res.json({ dividends: {} });
    return;
  }

  try {
    const entries = await Promise.all(
      codes.map(async (code) => [code, await fetchJQuantsDividends(code)] as const)
    );
    res.json({ dividends: Object.fromEntries(entries) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load dividends";
    res.status(500).json({ error: msg });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(
    `Portfolio API listening on http://127.0.0.1:${port} (source: ${hasJQuants() ? "J-Quants" : "Yahoo"})`
  );
});
