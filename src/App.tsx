import { useMemo, useRef, useState } from "react";
import { DashboardHeader } from "./components/DashboardHeader";
import { AllocationPieChart } from "./components/AllocationPieChart";
import { DividendsPanel } from "./components/DividendsPanel";
import { HoldingsTable } from "./components/HoldingsTable";
import { PerformanceChart } from "./components/PerformanceChart";
import { QuarterlyReturnsTable } from "./components/QuarterlyReturnsTable";
import { SummaryStrip } from "./components/SummaryStrip";
import { DownloadPngButton } from "./components/DownloadPngButton";
import { formatCurrency } from "./format";
import { summarizeDividends } from "./dividends/dividends";
import type { DividendRow } from "./dividends/dividends";
import { fetchBenchmarks, fetchHistoryForHoldings, fetchQuotesForHoldings } from "./market/apiClient";
import {
  buildFundSnapshots,
  periodStartDate,
  timeWeightedReturn
} from "./portfolio/fundAccounting";
import type { PeriodKey, PriceHistory } from "./portfolio/fundAccounting";
import { moneyWeightedReturn } from "./portfolio/irr";
import { quarterlyReturns } from "./portfolio/nav";
import { buildPerformanceChartData } from "./portfolio/history";
import { buildHistoricalHoldings, buildPortfolioState } from "./portfolio/positions";
import { priceHoldings } from "./market/quotes";
import { buildAllocationSlices } from "./portfolio/allocation";
import { parseSbiExecutionCsv } from "./data/parseSbiCsv";
import { parseSbiCashFlowCsv } from "./data/parseSbiCashFlowCsv";
import type { BenchmarkPoint, CashFlow, ExternalDividend, Quote, Trade } from "./types";
import "./styles.css";

const TRADES_STORAGE_KEY = "portfolio:trades";
const TRADE_CSV_NAME_STORAGE_KEY = "portfolio:lastCsvName";
const CASHFLOWS_STORAGE_KEY = "portfolio:cashFlows";
const CASHFLOW_CSV_NAME_STORAGE_KEY = "portfolio:cashFlowCsvName";
const DIVIDENDS_STORAGE_KEY = "portfolio:externalDividends";
const EXPECTED_ANNUAL_DIVIDEND_STORAGE_KEY = "portfolio:expectedAnnualDividend";
const PERIOD_STORAGE_KEY = "portfolio:period";

const DIVIDEND_SEED_DATE = "2026-06-29";
const DEFAULT_EXTERNAL_DIVIDENDS: ExternalDividend[] = [
  { date: DIVIDEND_SEED_DATE, amount: 119511, note: "H1 2026 dividends (other account)" }
];

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

function loadExternalDividends(): ExternalDividend[] {
  const stored = loadJsonArray<ExternalDividend>(DIVIDENDS_STORAGE_KEY);
  return stored.length > 0 ? stored : DEFAULT_EXTERNAL_DIVIDENDS;
}

function parseMoney(value: string): number {
  const parsed = Number(value.replace(/[,\s￥¥]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
  const [externalDividends, setExternalDividends] = useState<ExternalDividend[]>(() =>
    loadExternalDividends()
  );
  const [expectedDividendInput, setExpectedDividendInput] = useState<string>(
    () => readLocalStorageValue(EXPECTED_ANNUAL_DIVIDEND_STORAGE_KEY) ?? "0"
  );
  const [period, setPeriod] = useState<PeriodKey>(() => loadPeriod());
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteMessage, setQuoteMessage] = useState("Quotes not refreshed");
  const [historyByCode, setHistoryByCode] = useState<PriceHistory>({});
  const [benchmarks, setBenchmarks] = useState<{
    topix: BenchmarkPoint[];
    nikkei225: BenchmarkPoint[];
  }>({ topix: [], nikkei225: [] });
  const [error, setError] = useState<string | null>(null);

  const expectedAnnualDividend = useMemo(
    () => parseMoney(expectedDividendInput),
    [expectedDividendInput]
  );
  const dividendAmountInput = useMemo(
    () => String(externalDividends.reduce((sum, dividend) => sum + dividend.amount, 0)),
    [externalDividends]
  );

  const portfolio = useMemo(() => buildPortfolioState(trades), [trades]);
  const historicalHoldings = useMemo(() => buildHistoricalHoldings(trades), [trades]);
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

  const snapshots = useMemo(
    () =>
      buildFundSnapshots({
        trades,
        cashFlows,
        dividends: externalDividends,
        historyByCode,
        latestPriceByCode,
        asOfDate
      }),
    [trades, cashFlows, externalDividends, historyByCode, latestPriceByCode, asOfDate]
  );

  const latest = snapshots.at(-1) ?? null;
  const nav = latest?.nav ?? 0;
  const cash = latest?.cash ?? 0;
  const sinceInception = timeWeightedReturn(snapshots, "inception");
  const periodReturn = timeWeightedReturn(snapshots, period);
  const irr = moneyWeightedReturn(cashFlows, externalDividends, nav, asOfDate);
  const netContributions = cashFlows.reduce(
    (sum, flow) =>
      sum + (flow.kind === "contribution" ? flow.amount : flow.kind === "withdrawal" ? -flow.amount : 0),
    0
  );

  const chartStartDate = periodStartDate(asOfDate, period) ?? snapshots[0]?.date;
  const chartData = useMemo(
    () => buildPerformanceChartData(snapshots, benchmarks.topix, benchmarks.nikkei225, chartStartDate),
    [snapshots, benchmarks.topix, benchmarks.nikkei225, chartStartDate]
  );
  const quarterly = useMemo(
    () => quarterlyReturns(snapshots, benchmarks.topix, benchmarks.nikkei225, externalDividends),
    [snapshots, benchmarks.topix, benchmarks.nikkei225, externalDividends]
  );
  const allocationSlices = useMemo(
    () => buildAllocationSlices(pricedHoldings, cash, "JPY"),
    [pricedHoldings, cash]
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
    setExternalDividends(next);
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
      setBenchmarks({ topix: [], nikkei225: [] });
      setQuoteMessage("Quotes not refreshed");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade import failed");
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

  function handleDividendInputChange(value: string) {
    const amount = parseMoney(value);
    persistDividends([{ date: DIVIDEND_SEED_DATE, amount, note: "External account dividends" }]);
  }

  function handleExpectedDividendInputChange(value: string) {
    setExpectedDividendInput(value);
    writeLocalStorageValue(EXPECTED_ANNUAL_DIVIDEND_STORAGE_KEY, value);
  }

  async function handleRefresh() {
    const refreshLedgerVersion = ledgerVersionRef.current;
    try {
      if (portfolio.holdings.length === 0) {
        setQuotes([]);
        setHistoryByCode({});
        setBenchmarks({ topix: [], nikkei225: [] });
        setQuoteMessage("No holdings to quote");
        setError(null);
        return;
      }

      const [nextQuotes, nextHistory, nextBenchmarks] = await Promise.all([
        fetchQuotesForHoldings(portfolio.holdings),
        fetchHistoryForHoldings(historicalHoldings, "1y"),
        fetchBenchmarks("1y")
      ]);

      if (refreshLedgerVersion !== ledgerVersionRef.current) return;

      setQuotes(nextQuotes);
      setHistoryByCode(nextHistory);
      setBenchmarks(nextBenchmarks);
      setQuoteMessage(nextQuotes.length === 0 ? "No holdings to quote" : "Latest available prices");
      setError(null);
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
        onRefresh={handleRefresh}
      />

      {error ? <div className="error-banner">{error}</div> : null}

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

        <div className="insight-grid">
          <PerformanceChart data={chartData} benchmarkLabels={BENCHMARK_LABELS} asOf={asOfDate} />
          <AllocationPieChart slices={allocationSlices} currency="JPY" asOf={asOfDate} />
        </div>
      </div>

      <div className="content-grid">
        <HoldingsTable holdings={pricedHoldings} currency="JPY" />
        <QuarterlyReturnsTable rows={quarterly} benchmarkLabels={BENCHMARK_LABELS} />
        <DividendsPanel
          summary={dividendSummary}
          currency="JPY"
          manualDividendInput={dividendAmountInput}
          onManualDividendInputChange={handleDividendInputChange}
          expectedDividendInput={expectedDividendInput}
          expectedAnnualDividend={expectedAnnualDividend}
          onExpectedDividendInputChange={handleExpectedDividendInputChange}
        />
      </div>
    </main>
  );
}
