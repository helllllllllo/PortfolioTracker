import { useMemo, useRef, useState } from "react";
import { DashboardHeader } from "./components/DashboardHeader";
import { AllocationPieChart } from "./components/AllocationPieChart";
import { DividendsPanel } from "./components/DividendsPanel";
import { HoldingsTable } from "./components/HoldingsTable";
import { PerformanceChart } from "./components/PerformanceChart";
import { PerformanceMethodPanel } from "./components/PerformanceMethodPanel";
import type { ManualAdjustmentRow } from "./components/PerformanceMethodPanel";
import { QuarterlyReturnsTable } from "./components/QuarterlyReturnsTable";
import { SummaryStrip } from "./components/SummaryStrip";
import { summarizeDividends } from "./dividends/dividends";
import { fetchBenchmarks, fetchHistoryForHoldings, fetchQuotesForHoldings } from "./market/apiClient";
import type { BenchmarkMode } from "./market/apiClient";
import {
  applyCashFlowToSnapshot,
  applyInternalIncomeToSnapshot,
  buildCurrentSnapshot,
  investmentChangeBetweenSnapshots,
  quarterlyReturns
} from "./portfolio/nav";
import { buildHistoricalSnapshots, buildPerformanceChartData } from "./portfolio/history";
import { calculateInvestmentChange, calculateNetContributions } from "./portfolio/performance";
import { buildHistoricalHoldings, buildPortfolioState } from "./portfolio/positions";
import { priceHoldings } from "./market/quotes";
import { buildAllocationSlices } from "./portfolio/allocation";
import { FUND_TRACKING_START_DATE } from "./portfolio/constants";
import type { BenchmarkPoint, Currency, DividendSummary, Quote, Trade } from "./types";
import { parsePortfolioCsv } from "./data/parseSbiCsv";
import type { DividendRow } from "./dividends/dividends";
import "./styles.css";

const TRADES_STORAGE_KEY = "portfolio:trades";
const CSV_NAME_STORAGE_KEY = "portfolio:lastCsvName";
const MANUAL_CASH_STORAGE_KEY = "portfolio:manualCash";
const SOURCE_STORAGE_KEY = "portfolio:source";
const DIVIDENDS_STORAGE_KEY = "portfolio:dividends";
const TRACKING_START_STORAGE_KEY = "portfolio:trackingStartDate";
const MANUAL_DIVIDEND_STORAGE_KEY = "portfolio:manualDividendYtd";
const EXPECTED_ANNUAL_DIVIDEND_STORAGE_KEY = "portfolio:expectedAnnualDividend";
const DEFAULT_SBI_MANUAL_DIVIDEND_YTD = "119511";

type PortfolioSource = "sbi" | "schwab";

function readLocalStorageValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage as unknown;
  if (
    storage === null ||
    typeof storage !== "object" ||
    !("getItem" in storage) ||
    typeof (storage as Storage).getItem !== "function"
  ) {
    return null;
  }

  try {
    return (storage as Storage).getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  const storage = window.localStorage as unknown;
  if (
    storage === null ||
    typeof storage !== "object" ||
    !("setItem" in storage) ||
    typeof (storage as Storage).setItem !== "function"
  ) {
    return;
  }

  try {
    (storage as Storage).setItem(key, value);
  } catch {
    // Ignore unavailable storage in tests or privacy-restricted environments.
  }
}

function loadTradesFromStorage(): Trade[] {
  const raw = readLocalStorageValue(TRADES_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Trade[]) : [];
  } catch {
    return [];
  }
}

function loadDividendRowsFromStorage(): DividendRow[] {
  const raw = readLocalStorageValue(DIVIDENDS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DividendRow[]) : [];
  } catch {
    return [];
  }
}

function inferPortfolioSource(trades: Trade[]): PortfolioSource {
  return trades.some((trade) => trade.market === "US" || trade.currency === "USD")
    ? "schwab"
    : "sbi";
}

function loadPortfolioSource(): PortfolioSource {
  const raw = readLocalStorageValue(SOURCE_STORAGE_KEY);
  if (raw === "schwab" || raw === "sbi") return raw;
  return inferPortfolioSource(loadTradesFromStorage());
}

function earliestTradeDate(trades: Trade[]): string | null {
  return (
    trades
      .map((trade) => trade.tradeDate)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))[0] ?? null
  );
}

function defaultStartDateForSource(source: PortfolioSource, trades: Trade[]): string {
  if (source === "schwab") return earliestTradeDate(trades) ?? FUND_TRACKING_START_DATE;
  return FUND_TRACKING_START_DATE;
}

function baseCurrencyForSource(source: PortfolioSource): Currency {
  return source === "schwab" ? "USD" : "JPY";
}

function benchmarkModeForSource(source: PortfolioSource): BenchmarkMode {
  return source === "schwab" ? "us" : "japan";
}

function benchmarkLabelsForMode(mode: BenchmarkMode): { primary: string; secondary?: string } {
  return mode === "us"
    ? { primary: "S&P 500" }
    : { primary: "TOPIX proxy", secondary: "Nikkei 225 Net TR" };
}

function defaultManualDividendForSource(source: PortfolioSource): string {
  return source === "sbi" ? DEFAULT_SBI_MANUAL_DIVIDEND_YTD : "0";
}

function parseManualMoney(value: string): number {
  const parsed = Number(value.replace(/[,\s￥¥$]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function manualDividendSummary(amount: number): DividendSummary {
  return {
    state: "estimated",
    yearToDate: amount,
    byQuarter: { "Manual YTD": amount },
    message: "Manual year-to-date dividend entered."
  };
}

export default function App() {
  const ledgerVersionRef = useRef(0);
  const [fileName, setFileName] = useState<string | null>(() =>
    readLocalStorageValue(CSV_NAME_STORAGE_KEY)
  );
  const [trades, setTrades] = useState<Trade[]>(() => loadTradesFromStorage());
  const [portfolioSource, setPortfolioSource] = useState<PortfolioSource>(() =>
    loadPortfolioSource()
  );
  const [dividendRows, setDividendRows] = useState<DividendRow[]>(() =>
    loadDividendRowsFromStorage()
  );
  const [manualCashInput, setManualCashInput] = useState<string>(
    () => readLocalStorageValue(MANUAL_CASH_STORAGE_KEY) ?? "0"
  );
  const [manualDividendInput, setManualDividendInput] = useState<string>(() => {
    const source = loadPortfolioSource();
    return (
      readLocalStorageValue(MANUAL_DIVIDEND_STORAGE_KEY) ??
      defaultManualDividendForSource(source)
    );
  });
  const [expectedDividendInput, setExpectedDividendInput] = useState<string>(
    () => readLocalStorageValue(EXPECTED_ANNUAL_DIVIDEND_STORAGE_KEY) ?? "0"
  );
  const [trackingStartDate, setTrackingStartDate] = useState<string>(() => {
    const source = loadPortfolioSource();
    return (
      readLocalStorageValue(TRACKING_START_STORAGE_KEY) ??
      defaultStartDateForSource(source, loadTradesFromStorage())
    );
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteMessage, setQuoteMessage] = useState("Quotes not refreshed");
  const [historyByHoldingId, setHistoryByHoldingId] = useState<Record<string, Array<{ date: string; close: number }>>>({});
  const [benchmarks, setBenchmarks] = useState<{
    topix: BenchmarkPoint[];
    nikkei225: BenchmarkPoint[];
  }>({ topix: [], nikkei225: [] });
  const [error, setError] = useState<string | null>(null);
  const manualCash = useMemo(() => parseManualMoney(manualCashInput), [manualCashInput]);
  const manualDividend = useMemo(
    () => parseManualMoney(manualDividendInput),
    [manualDividendInput]
  );
  const expectedAnnualDividend = useMemo(
    () => parseManualMoney(expectedDividendInput),
    [expectedDividendInput]
  );
  const baseCurrency = baseCurrencyForSource(portfolioSource);
  const benchmarkMode = benchmarkModeForSource(portfolioSource);
  const benchmarkLabels = benchmarkLabelsForMode(benchmarkMode);

  const portfolio = useMemo(() => buildPortfolioState(trades), [trades]);
  const historicalHoldings = useMemo(() => buildHistoricalHoldings(trades), [trades]);
  const pricedHoldings = useMemo(
    () => priceHoldings(portfolio.holdings, quotes, {}),
    [portfolio.holdings, quotes]
  );
  const missingQuotes = pricedHoldings.filter((holding) =>
    ["missing", "stale"].includes(holding.quote.status)
  ).length;
  const holdingsValue = pricedHoldings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const baseLatestSnapshot = buildCurrentSnapshot({
    date: new Date().toISOString().slice(0, 10),
    cash: portfolio.cash,
    holdingsValue,
    inferredInitialCash: portfolio.inferredInitialCash
  });
  const latestSnapshot = applyInternalIncomeToSnapshot(
    applyCashFlowToSnapshot(baseLatestSnapshot, manualCash),
    manualDividend
  );
  const allocationSlices = useMemo(
    () => buildAllocationSlices(pricedHoldings, manualCash, baseCurrency),
    [baseCurrency, manualCash, pricedHoldings]
  );
  const importedDividendSummary = summarizeDividends(dividendRows);
  const dividendSummary =
    manualDividend > 0 ? manualDividendSummary(manualDividend) : importedDividendSummary;
  const portfolioSnapshots = useMemo(
    () =>
      buildHistoricalSnapshots({
        trades,
        historyByHoldingId,
        latestQuotes: quotes,
        currentCashOverride: manualCash,
        currentInternalIncome: manualDividend,
        startDate: trackingStartDate
      }),
    [historyByHoldingId, manualCash, manualDividend, quotes, trackingStartDate, trades]
  );
  const dailyChangeSnapshots = useMemo(
    () =>
      buildHistoricalSnapshots({
        trades,
        historyByHoldingId,
        latestQuotes: quotes,
        currentCashOverride: manualCash,
        startDate: trackingStartDate
      }),
    [historyByHoldingId, manualCash, quotes, trackingStartDate, trades]
  );
  const summarySnapshot = latestSnapshot;
  const beginningValue = 0;
  const investmentChange = calculateInvestmentChange({
    pricedHoldings,
    realizedPnl: portfolio.realizedPnl,
    internalIncome: manualDividend
  });
  const netContributions = calculateNetContributions({
    beginningValue,
    endingValue: summarySnapshot.nav,
    investmentChange
  });
  const unitNavReturn =
    summarySnapshot.units === 0 || !Number.isFinite(summarySnapshot.unitNav)
      ? null
      : summarySnapshot.unitNav / 100 - 1;
  const manualAdjustments: ManualAdjustmentRow[] = [
    {
      id: "beginning-value",
      label: "Beginning value",
      treatment: "Period start"
    },
    {
      id: "manual-cash",
      label: "Manual cash balance",
      treatment: "Ending cash"
    },
    {
      id: "manual-dividend",
      label: "Manual dividend outside broker",
      treatment: "Internal income"
    },
    {
      id: "expected-yearly-dividend",
      label: "Expected yearly dividend",
      treatment: "Projection"
    },
    {
      id: "in-kind-transfer",
      label: "In-kind transfer values",
      treatment: "Manual placeholder"
    }
  ].map((row) => ({
    ...row,
    amount:
      row.id === "beginning-value"
        ? beginningValue
        : row.id === "manual-cash"
          ? manualCash
          : row.id === "manual-dividend"
            ? manualDividend
            : row.id === "expected-yearly-dividend"
              ? expectedAnnualDividend
              : 0
  }));
  const quarterly = useMemo(
    () => quarterlyReturns(portfolioSnapshots, benchmarks.topix, benchmarks.nikkei225),
    [benchmarks.nikkei225, benchmarks.topix, portfolioSnapshots]
  );
  const latestQuarterlyReturn =
    [...quarterly].reverse().find((row) => row.portfolioReturn !== null)?.portfolioReturn ?? null;
  const chartData = useMemo(
    () =>
      buildPerformanceChartData(
        portfolioSnapshots,
        benchmarks.topix,
        benchmarks.nikkei225,
        trackingStartDate
      ),
    [benchmarks.nikkei225, benchmarks.topix, portfolioSnapshots, trackingStartDate]
  );
  const latestNormalizedPortfolio =
    [...chartData].reverse().find((point) => point.portfolio !== null)?.portfolio ?? null;
  const totalReturn =
    latestNormalizedPortfolio === null
      ? summarySnapshot.unitNav / 100 - 1
      : latestNormalizedPortfolio / 100 - 1;
  const dailyChange =
    dailyChangeSnapshots.length >= 2
      ? investmentChangeBetweenSnapshots(
          dailyChangeSnapshots[dailyChangeSnapshots.length - 2],
          dailyChangeSnapshots[dailyChangeSnapshots.length - 1]
        )
      : null;

  async function handleImport(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parsePortfolioCsv(buffer);
      const nextStartDate = defaultStartDateForSource(parsed.source, parsed.trades);
      ledgerVersionRef.current += 1;
      setTrades(parsed.trades);
      setPortfolioSource(parsed.source);
      setDividendRows(parsed.dividends);
      setTrackingStartDate(nextStartDate);
      setFileName(file.name);
      setQuotes([]);
      setHistoryByHoldingId({});
      setBenchmarks({ topix: [], nikkei225: [] });
      setQuoteMessage("Quotes not refreshed");
      setError(null);
      if (parsed.source !== portfolioSource) {
        const nextManualDividend = defaultManualDividendForSource(parsed.source);
        setManualCashInput("0");
        setManualDividendInput(nextManualDividend);
        setExpectedDividendInput("0");
        writeLocalStorageValue(MANUAL_CASH_STORAGE_KEY, "0");
        writeLocalStorageValue(MANUAL_DIVIDEND_STORAGE_KEY, nextManualDividend);
        writeLocalStorageValue(EXPECTED_ANNUAL_DIVIDEND_STORAGE_KEY, "0");
      }

      writeLocalStorageValue(CSV_NAME_STORAGE_KEY, file.name);
      writeLocalStorageValue(TRADES_STORAGE_KEY, JSON.stringify(parsed.trades));
      writeLocalStorageValue(SOURCE_STORAGE_KEY, parsed.source);
      writeLocalStorageValue(DIVIDENDS_STORAGE_KEY, JSON.stringify(parsed.dividends));
      writeLocalStorageValue(TRACKING_START_STORAGE_KEY, nextStartDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  function handleManualCashInputChange(value: string) {
    setManualCashInput(value);
    writeLocalStorageValue(MANUAL_CASH_STORAGE_KEY, value);
  }

  function handleManualDividendInputChange(value: string) {
    setManualDividendInput(value);
    writeLocalStorageValue(MANUAL_DIVIDEND_STORAGE_KEY, value);
  }

  function handleExpectedDividendInputChange(value: string) {
    setExpectedDividendInput(value);
    writeLocalStorageValue(EXPECTED_ANNUAL_DIVIDEND_STORAGE_KEY, value);
  }

  function handleTrackingStartDateChange(value: string) {
    const nextStartDate = value || defaultStartDateForSource(portfolioSource, trades);
    setTrackingStartDate(nextStartDate);
    writeLocalStorageValue(TRACKING_START_STORAGE_KEY, nextStartDate);
  }

  async function handleRefresh() {
    const refreshLedgerVersion = ledgerVersionRef.current;

    try {
      if (portfolio.holdings.length === 0) {
        setQuotes([]);
        setHistoryByHoldingId({});
        setBenchmarks({ topix: [], nikkei225: [] });
        setQuoteMessage("No holdings to quote");
        setError(null);
        return;
      }

      const quoteRequest =
        baseCurrency === "USD"
          ? fetchQuotesForHoldings(portfolio.holdings, baseCurrency)
          : fetchQuotesForHoldings(portfolio.holdings);
      const historyRequest =
        baseCurrency === "USD"
          ? fetchHistoryForHoldings(historicalHoldings, "1y", baseCurrency)
          : fetchHistoryForHoldings(historicalHoldings, "1y");
      const benchmarkRequest =
        benchmarkMode === "us" ? fetchBenchmarks("1y", benchmarkMode) : fetchBenchmarks("1y");

      const [nextQuotes, nextHistory, nextBenchmarks] = await Promise.all([
        quoteRequest,
        historyRequest,
        benchmarkRequest
      ]);

      if (refreshLedgerVersion !== ledgerVersionRef.current) {
        return;
      }

      setQuotes(nextQuotes);
      setHistoryByHoldingId(nextHistory);
      setBenchmarks(nextBenchmarks);
      setQuoteMessage(nextQuotes.length === 0 ? "No holdings to quote" : "Latest available prices");
      setError(null);
    } catch (err) {
      if (refreshLedgerVersion !== ledgerVersionRef.current) {
        return;
      }

      setQuoteMessage("Quote refresh failed");
      setError(err instanceof Error ? err.message : "Quote refresh failed");
    }
  }

  return (
    <main className="app-shell market-cockpit">
      <DashboardHeader
        fileName={fileName}
        quoteStatus={quoteMessage}
        onImport={handleImport}
        onRefresh={handleRefresh}
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <SummaryStrip
        nav={summarySnapshot.nav}
        dailyChange={dailyChange}
        totalReturn={totalReturn}
        quarterlyReturn={latestQuarterlyReturn}
        cash={manualCash}
        cashInput={manualCashInput}
        onCashInputChange={handleManualCashInputChange}
        currency={baseCurrency}
        trackingStartDate={trackingStartDate}
        onTrackingStartDateChange={handleTrackingStartDateChange}
        missingQuotes={missingQuotes}
      />

      <div className="insight-grid">
        <PerformanceChart data={chartData} benchmarkLabels={benchmarkLabels} />
        <AllocationPieChart slices={allocationSlices} currency={baseCurrency} />
      </div>

      <div className="content-grid">
        <HoldingsTable holdings={pricedHoldings} currency={baseCurrency} />
        <PerformanceMethodPanel
          currency={baseCurrency}
          unitNavReturn={unitNavReturn}
          beginningValue={beginningValue}
          netContributions={netContributions}
          investmentChange={investmentChange}
          endingValue={summarySnapshot.nav}
          benchmarkLabel={benchmarkLabels.primary}
          adjustments={manualAdjustments}
        />
        <QuarterlyReturnsTable rows={quarterly} benchmarkLabels={benchmarkLabels} />
        <DividendsPanel
          summary={dividendSummary}
          currency={baseCurrency}
          manualDividendInput={manualDividendInput}
          onManualDividendInputChange={handleManualDividendInputChange}
          expectedDividendInput={expectedDividendInput}
          expectedAnnualDividend={expectedAnnualDividend}
          onExpectedDividendInputChange={handleExpectedDividendInputChange}
        />
      </div>
    </main>
  );
}
