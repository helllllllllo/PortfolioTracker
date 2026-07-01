import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardHeader } from "./components/DashboardHeader";
import { AllocationPieChart } from "./components/AllocationPieChart";
import { DividendsPanel } from "./components/DividendsPanel";
import { HoldingsTable } from "./components/HoldingsTable";
import { PerformanceChart } from "./components/PerformanceChart";
import { QuarterlyReturnsTable } from "./components/QuarterlyReturnsTable";
import { ContributorsPanel } from "./components/ContributorsPanel";
import { SummaryStrip } from "./components/SummaryStrip";
import { DownloadPngButton } from "./components/DownloadPngButton";
import { formatCurrency } from "./format";
import { summarizeDividends } from "./dividends/dividends";
import { computeDividends } from "./dividends/computeDividends";
import type { DividendRecord } from "./dividends/computeDividends";
import type { DividendRow } from "./dividends/dividends";
import {
  fetchBenchmarks,
  fetchDividends,
  fetchHistoryForHoldings,
  fetchQuotesForHoldings
} from "./market/apiClient";
import {
  buildFundSnapshots,
  periodStartDate,
  timeWeightedReturn
} from "./portfolio/fundAccounting";
import type { PeriodKey, PriceHistory } from "./portfolio/fundAccounting";
import { moneyWeightedReturn } from "./portfolio/irr";
import { quarterlyReturns } from "./portfolio/nav";
import { buildPerformanceChartData } from "./portfolio/history";
import { mergeStoredSnapshots } from "./portfolio/navStore";
import { buildHistoricalHoldings, buildPortfolioState } from "./portfolio/positions";
import {
  STOCK_SPLITS,
  mergeSplitEvents,
  reconcileTradesAgainstPrices
} from "./portfolio/corporateActions";
import type { SplitEvent } from "./portfolio/corporateActions";
import { priceHoldings } from "./market/quotes";
import { buildAllocationSlices } from "./portfolio/allocation";
import { buildAttribution } from "./portfolio/attribution";
import { parseSbiExecutionCsv } from "./data/parseSbiCsv";
import { parseSbiCashFlowCsv } from "./data/parseSbiCashFlowCsv";
import { parseDividendCsv } from "./data/parseDividendCsv";
import type { BenchmarkPoint, CashFlow, ExternalDividend, PortfolioSnapshot, Quote, Trade } from "./types";
import "./styles.css";

const TRADES_STORAGE_KEY = "portfolio:trades";
const TRADE_CSV_NAME_STORAGE_KEY = "portfolio:lastCsvName";
const CASHFLOWS_STORAGE_KEY = "portfolio:cashFlows";
const CASHFLOW_CSV_NAME_STORAGE_KEY = "portfolio:cashFlowCsvName";
const DIVIDENDS_STORAGE_KEY = "portfolio:externalDividends";
const PERIOD_STORAGE_KEY = "portfolio:period";
const SNAPSHOTS_STORAGE_KEY = "portfolio:navSnapshots";

const BENCHMARK_LABELS = { primary: "TOPIX (TR)", secondary: "Nikkei 225 (TR)" };

function readLocalStorageValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeLocalStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Ignore unavailable storage in tests or privacy-restricted environments.
  }
}

function loadJsonArray<T>(key: string): T[] {
  const raw = readLocalStorageValue(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function loadPeriod(): PeriodKey {
  const raw = readLocalStorageValue(PERIOD_STORAGE_KEY);
  return raw === "ytd" || raw === "qtd" || raw === "mtd" || raw === "inception" ? raw : "inception";
}

function latestQuoteDate(quotes: Quote[]): string | null {
  const dates = quotes
    .map((quote) => quote.asOf?.slice(0, 10))
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => a.localeCompare(b));
  return dates.at(-1) ?? null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function signedPct(value: number | null): string {
  if (value === null) return "N/A";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${(value * 100).toFixed(2)}%`;
}

function signedPts(value: number | null): string {
  if (value === null) return "N/A";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)} pts`;
}

function toneClass(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "stat-positive" : "stat-negative";
}

export default function App() {
  const ledgerVersionRef = useRef(0);
  const tearsheetRef = useRef<HTMLDivElement>(null);
  const [fileName, setFileName] = useState<string | null>(() =>
    readLocalStorageValue(TRADE_CSV_NAME_STORAGE_KEY)
  );
  const [cashFlowFileName, setCashFlowFileName] = useState<string | null>(() =>
    readLocalStorageValue(CASHFLOW_CSV_NAME_STORAGE_KEY)
  );
  const [trades, setTrades] = useState<Trade[]>(() => loadJsonArray<Trade>(TRADES_STORAGE_KEY));
  const [cashFlows, setCashFlows] = useState<CashFlow[]>(() =>
    loadJsonArray<CashFlow>(CASHFLOWS_STORAGE_KEY)
  );
  // Dividends imported from a CSV (the actual amounts that hit the other account). When
  // present these win; otherwise dividends are computed from J-Quants (see below).
  const [importedDividends, setImportedDividends] = useState<ExternalDividend[]>(() =>
    loadJsonArray<ExternalDividend>(DIVIDENDS_STORAGE_KEY)
  );
  const [dividendRecords, setDividendRecords] = useState<Record<string, DividendRecord[]>>({});
  const [period, setPeriod] = useState<PeriodKey>(() => loadPeriod());
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteMessage, setQuoteMessage] = useState("Quotes not refreshed");
  const [historyByCode, setHistoryByCode] = useState<PriceHistory>({});
  const [splitsByCode, setSplitsByCode] = useState<Record<string, Array<{ exDate: string; ratio: number }>>>({});
  const [benchmarks, setBenchmarks] = useState<{
    topix: BenchmarkPoint[];
    nikkei225: BenchmarkPoint[];
  }>({ topix: [], nikkei225: [] });
  const [error, setError] = useState<string | null>(null);

  // Fund inception = earliest capital or trade event (computed without the snapshot
  // series to avoid a dependency cycle with the dividend add-back).
  const inception = useMemo(() => {
    const dates = [...trades.map((t) => t.tradeDate), ...cashFlows.map((c) => c.date)]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return dates[0] ?? new Date().toISOString().slice(0, 10);
  }, [trades, cashFlows]);

  // Splits come from Yahoo's price feed (the same source that adjusts the prices), merged
  // with the manual STOCK_SPLITS fallback and de-duped, so quantity and price adjustments
  // always agree — no hand-maintained list to forget. J-Quants AdjustmentFactor can feed
  // this same list when wired in.
  const splits = useMemo<SplitEvent[]>(() => {
    const detected: SplitEvent[] = Object.entries(splitsByCode).flatMap(([code, events]) =>
      events.map((event) => ({ code, exDate: event.exDate, ratio: event.ratio }))
    );
    return mergeSplitEvents(STOCK_SPLITS, detected);
  }, [splitsByCode]);

  const portfolio = useMemo(() => buildPortfolioState(trades, undefined, splits), [trades, splits]);
  const historicalHoldings = useMemo(() => buildHistoricalHoldings(trades), [trades]);
  const dataWarnings = useMemo(
    () => reconcileTradesAgainstPrices(trades, historyByCode, splits),
    [trades, historyByCode, splits]
  );
  const pricedHoldings = useMemo(
    () => priceHoldings(portfolio.holdings, quotes, {}),
    [portfolio.holdings, quotes]
  );
  const missingQuotes = pricedHoldings.filter((holding) =>
    ["missing", "stale"].includes(holding.quote.status)
  ).length;

  const asOfDate = useMemo(() => latestQuoteDate(quotes) ?? todayIso(), [quotes]);
  const latestPriceByCode = useMemo(() => {
    const map: Record<string, number> = {};
    for (const quote of quotes) if (quote.price != null) map[quote.code] = quote.price;
    return map;
  }, [quotes]);

  // Dividends: an imported CSV (actual received) wins; otherwise compute the realized
  // add-back income from J-Quants (record-date shares × per-share rate, net of withholding).
  // Passing nav=0 here is fine — realized income does not depend on nav; the forward yield
  // (which does) is computed after nav below.
  const computedDividends = useMemo(
    () => computeDividends(dividendRecords, trades, 0, { trackingStart: inception, asOf: asOfDate }),
    [dividendRecords, trades, inception, asOfDate]
  );
  const externalDividends: ExternalDividend[] =
    importedDividends.length > 0 ? importedDividends : computedDividends.realized;

  const snapshots = useMemo(
    () =>
      buildFundSnapshots({
        trades,
        cashFlows,
        dividends: externalDividends,
        historyByCode,
        latestPriceByCode,
        asOfDate,
        splits
      }),
    [trades, cashFlows, externalDividends, historyByCode, latestPriceByCode, asOfDate, splits]
  );

  // Persisted daily NAV: show real history on load before any network call, and keep
  // early history once the rolling price window moves past inception. Fresh (live) data
  // wins; stored only backfills dates the fresh series lacks.
  const [storedSnapshots, setStoredSnapshots] = useState<PortfolioSnapshot[]>(() =>
    loadJsonArray<PortfolioSnapshot>(SNAPSHOTS_STORAGE_KEY)
  );
  const hasLiveData = quotes.length > 0;
  const displaySnapshots = useMemo(
    () =>
      hasLiveData
        ? mergeStoredSnapshots(storedSnapshots, snapshots)
        : storedSnapshots.length > 0
          ? storedSnapshots
          : snapshots,
    [hasLiveData, storedSnapshots, snapshots]
  );
  useEffect(() => {
    if (hasLiveData && snapshots.length > 0) {
      writeLocalStorageValue(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
    }
  }, [hasLiveData, snapshots]);

  const latest = displaySnapshots.at(-1) ?? null;
  const nav = latest?.nav ?? 0;
  const cash = latest?.cash ?? 0;
  const sinceInception = timeWeightedReturn(displaySnapshots, "inception");
  const periodReturn = timeWeightedReturn(displaySnapshots, period);
  const irr = moneyWeightedReturn(cashFlows, externalDividends, nav, asOfDate);
  const netContributions = cashFlows.reduce(
    (sum, flow) =>
      sum + (flow.kind === "contribution" ? flow.amount : flow.kind === "withdrawal" ? -flow.amount : 0),
    0
  );

  const chartStartDate = periodStartDate(asOfDate, period) ?? displaySnapshots[0]?.date;
  const chartData = useMemo(
    () => buildPerformanceChartData(displaySnapshots, benchmarks.topix, benchmarks.nikkei225, chartStartDate),
    [displaySnapshots, benchmarks.topix, benchmarks.nikkei225, chartStartDate]
  );
  const quarterly = useMemo(
    () => quarterlyReturns(displaySnapshots, benchmarks.topix, benchmarks.nikkei225, externalDividends),
    [displaySnapshots, benchmarks.topix, benchmarks.nikkei225, externalDividends]
  );
  const allocationSlices = useMemo(
    () => buildAllocationSlices(pricedHoldings, cash, "JPY"),
    [pricedHoldings, cash]
  );
  const attribution = useMemo(
    () => buildAttribution(trades, pricedHoldings, splits),
    [trades, pricedHoldings, splits]
  );

  const dividendSummary = useMemo(
    () =>
      summarizeDividends(
        externalDividends.map(
          (dividend): DividendRow => ({ date: dividend.date, amount: dividend.amount, state: "confirmed" })
        )
      ),
    [externalDividends]
  );
  // Forward yield needs nav, so it is computed here (after nav) rather than above.
  const dividendForward = useMemo(
    () => computeDividends(dividendRecords, trades, nav, { trackingStart: inception, asOf: asOfDate }),
    [dividendRecords, trades, nav, inception, asOfDate]
  );
  const dividendSource: "csv" | "j-quants" | "none" =
    importedDividends.length > 0 ? "csv" : Object.keys(dividendRecords).length > 0 ? "j-quants" : "none";

  const latestChartPoint = [...chartData].reverse().find((point) => point.portfolio !== null) ?? null;
  const vsTopix =
    latestChartPoint?.portfolio != null && latestChartPoint?.topix != null
      ? latestChartPoint.portfolio - latestChartPoint.topix
      : null;
  const vsNikkei =
    latestChartPoint?.portfolio != null && latestChartPoint?.nikkei225 != null
      ? latestChartPoint.portfolio - latestChartPoint.nikkei225
      : null;

  function persistTrades(next: Trade[]) {
    setTrades(next);
    writeLocalStorageValue(TRADES_STORAGE_KEY, JSON.stringify(next));
  }

  function persistCashFlows(next: CashFlow[]) {
    setCashFlows(next);
    writeLocalStorageValue(CASHFLOWS_STORAGE_KEY, JSON.stringify(next));
  }

  function persistDividends(next: ExternalDividend[]) {
    setImportedDividends(next);
    writeLocalStorageValue(DIVIDENDS_STORAGE_KEY, JSON.stringify(next));
  }

  async function handleImport(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const nextTrades = parseSbiExecutionCsv(buffer);
      ledgerVersionRef.current += 1;
      persistTrades(nextTrades);
      setFileName(file.name);
      writeLocalStorageValue(TRADE_CSV_NAME_STORAGE_KEY, file.name);
      setQuotes([]);
      setHistoryByCode({});
      setSplitsByCode({});
      setBenchmarks({ topix: [], nikkei225: [] });
      setStoredSnapshots([]);
      writeLocalStorageValue(SNAPSHOTS_STORAGE_KEY, "[]");
      setQuoteMessage("Quotes not refreshed");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade import failed");
    }
  }

  async function handleImportDividends(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const nextDividends = parseDividendCsv(buffer);
      if (nextDividends.length === 0) {
        setError("No dividend rows found in that CSV.");
        return;
      }
      persistDividends(nextDividends);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dividend import failed");
    }
  }

  async function handleImportCashFlows(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const nextCashFlows = parseSbiCashFlowCsv(buffer);
      persistCashFlows(nextCashFlows);
      setCashFlowFileName(file.name);
      writeLocalStorageValue(CASHFLOW_CSV_NAME_STORAGE_KEY, file.name);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash-flow import failed");
    }
  }

  function handlePeriodChange(next: PeriodKey) {
    setPeriod(next);
    writeLocalStorageValue(PERIOD_STORAGE_KEY, next);
  }

  async function handleRefresh() {
    const refreshLedgerVersion = ledgerVersionRef.current;
    try {
      if (portfolio.holdings.length === 0) {
        setQuotes([]);
        setHistoryByCode({});
        setSplitsByCode({});
        setBenchmarks({ topix: [], nikkei225: [] });
        setQuoteMessage("No holdings to quote");
        setError(null);
        return;
      }

      // Resilient: one failing endpoint must not discard the others' data. Dividends are
      // fetched for every name ever held (a dividend belongs to the record-date holder,
      // even if the position was later sold).
      const [quotesResult, historyResult, benchmarksResult, dividendsResult] =
        await Promise.allSettled([
          fetchQuotesForHoldings(portfolio.holdings),
          fetchHistoryForHoldings(historicalHoldings, "1y"),
          fetchBenchmarks("1y"),
          fetchDividends(historicalHoldings.map((holding) => holding.code))
        ]);

      if (refreshLedgerVersion !== ledgerVersionRef.current) return;

      if (quotesResult.status === "fulfilled") setQuotes(quotesResult.value);
      if (historyResult.status === "fulfilled") {
        setHistoryByCode(historyResult.value.historyByCode);
        setSplitsByCode(historyResult.value.splitsByCode);
      }
      if (benchmarksResult.status === "fulfilled") setBenchmarks(benchmarksResult.value);
      if (dividendsResult.status === "fulfilled") setDividendRecords(dividendsResult.value);

      const failures = [quotesResult, historyResult, benchmarksResult].filter(
        (result) => result.status === "rejected"
      ).length;
      const quotesLoaded = quotesResult.status === "fulfilled" && quotesResult.value.length > 0;
      setQuoteMessage(
        !quotesLoaded
          ? "Quote refresh failed"
          : failures > 0
            ? "Latest prices · some market data unavailable"
            : "Latest available prices"
      );
      setError(failures === 3 ? "All market-data requests failed. Is the API server running?" : null);
    } catch (err) {
      if (refreshLedgerVersion !== ledgerVersionRef.current) return;
      setQuoteMessage("Quote refresh failed");
      setError(err instanceof Error ? err.message : "Quote refresh failed");
    }
  }

  return (
    <main className="app-shell market-cockpit">
      <DashboardHeader
        fileName={fileName}
        cashFlowFileName={cashFlowFileName}
        quoteStatus={quoteMessage}
        onImport={handleImport}
        onImportCashFlows={handleImportCashFlows}
        onImportDividends={handleImportDividends}
        onRefresh={handleRefresh}
      />

      {error ? <div className="error-banner">{error}</div> : null}

      {dataWarnings.length > 0 ? (
        <div className="warning-banner" role="alert">
          <strong>Data integrity check:</strong>
          <ul>
            {dataWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <SummaryStrip
        nav={nav}
        sinceInception={sinceInception}
        periodReturn={periodReturn}
        period={period}
        onPeriodChange={handlePeriodChange}
        irr={irr}
        cash={cash}
        netContributions={netContributions}
        missingQuotes={missingQuotes}
        currency="JPY"
      />

      <div className="tearsheet-bar">
        <DownloadPngButton
          targetRef={tearsheetRef}
          filename={`hiroshi-capital-tearsheet-${asOfDate}.png`}
          label="Download quarterly tearsheet"
        />
      </div>

      <div className="report-tearsheet" ref={tearsheetRef}>
        <div className="tearsheet-header">
          <div>
            <p className="report-eyebrow">Hiroshi Capital</p>
            <h2>Quarterly performance &amp; allocation</h2>
            <p className="report-sub">Total-return basis · as of {asOfDate}</p>
          </div>
          <div className="tearsheet-kpis">
            <div>
              <span>Net asset value</span>
              <strong>{formatCurrency(nav, "JPY")}</strong>
            </div>
            <div>
              <span>Return (since inception)</span>
              <strong className={toneClass(sinceInception)}>{signedPct(sinceInception)}</strong>
            </div>
            <div>
              <span>vs TOPIX</span>
              <strong className={toneClass(vsTopix)}>{signedPts(vsTopix)}</strong>
            </div>
            <div>
              <span>vs Nikkei</span>
              <strong className={toneClass(vsNikkei)}>{signedPts(vsNikkei)}</strong>
            </div>
          </div>
        </div>

        <div className="tearsheet-body">
          <PerformanceChart data={chartData} benchmarkLabels={BENCHMARK_LABELS} asOf={asOfDate} />
          <AllocationPieChart slices={allocationSlices} currency="JPY" asOf={asOfDate} />
        </div>
      </div>

      <div className="content-grid">
        <HoldingsTable holdings={pricedHoldings} currency="JPY" />
        <QuarterlyReturnsTable rows={quarterly} benchmarkLabels={BENCHMARK_LABELS} />
        <ContributorsPanel attribution={attribution} currency="JPY" />
        <DividendsPanel
          summary={dividendSummary}
          currency="JPY"
          source={dividendSource}
          forwardAnnualIncome={dividendForward.forwardAnnualIncome}
          forwardYield={dividendForward.forwardYield}
        />
      </div>
    </main>
  );
}
