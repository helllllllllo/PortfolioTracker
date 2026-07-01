import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { parsePortfolioCsv, parseSbiExecutionCsv } from "./data/parseSbiCsv";
import {
  fetchBenchmarks,
  fetchHistoryForHoldings,
  fetchQuotesForHoldings
} from "./market/apiClient";

vi.mock("./market/apiClient", () => ({
  fetchQuotesForHoldings: vi.fn(),
  fetchHistoryForHoldings: vi.fn(),
  fetchBenchmarks: vi.fn()
}));

const parserMocks = vi.hoisted(() => {
  const parseSbiExecutionCsv = vi.fn();
  const parsePortfolioCsv = vi.fn((input: ArrayBuffer | string) => ({
    source: "sbi",
    trades: parseSbiExecutionCsv(input),
    dividends: [],
    warnings: []
  }));

  return { parseSbiExecutionCsv, parsePortfolioCsv };
});

vi.mock("./data/parseSbiCsv", () => parserMocks);

vi.mock("./components/PerformanceChart", () => ({
  PerformanceChart: ({
    data,
    benchmarkLabels
  }: {
    data: Array<unknown>;
    benchmarkLabels?: { primary: string; secondary?: string };
  }) => (
    <section>
      <h2>Performance</h2>
      {benchmarkLabels ? <div>{benchmarkLabels.primary}</div> : null}
      {benchmarkLabels?.secondary ? <div>{benchmarkLabels.secondary}</div> : null}
      <div data-testid="performance-chart-points">{data.length}</div>
    </section>
  )
}));

vi.mock("./components/AllocationPieChart", () => ({
  AllocationPieChart: ({ slices }: { slices: Array<{ label: string; value: number }> }) => (
    <section aria-label="Portfolio allocation">
      <h2>Allocation</h2>
      <div data-testid="allocation-slices">{slices.length}</div>
      {slices.map((slice) => (
        <span key={slice.label}>{slice.label}</span>
      ))}
    </section>
  )
}));

function installTestStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      })
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("App", () => {
  beforeEach(() => {
    vi.mocked(fetchQuotesForHoldings).mockReset();
    vi.mocked(fetchHistoryForHoldings).mockReset();
    vi.mocked(fetchBenchmarks).mockReset();
    vi.mocked(parseSbiExecutionCsv).mockReset();
    vi.mocked(parsePortfolioCsv).mockReset();
    vi.mocked(parsePortfolioCsv).mockImplementation((input: ArrayBuffer | string) => ({
      source: "sbi",
      trades: vi.mocked(parseSbiExecutionCsv)(input),
      dividends: [],
      warnings: []
    }));
    installTestStorage();
  });

  it("renders dashboard sections before import", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".market-cockpit")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /portfolio dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/command center/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/import csv/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh quotes/i })).toBeInTheDocument();
    expect(screen.getByText(/current nav/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/track from/i)).toBeInTheDocument();
    expect(screen.getByText(/holdings/i)).toBeInTheDocument();
    expect(screen.getByText(/quarterly returns/i)).toBeInTheDocument();
    expect(screen.getByText(/dividends/i)).toBeInTheDocument();
    expect(screen.getByText(/performance method/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/manual cash balance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/manual ytd dividend/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/expected yearly dividend/i)).toBeInTheDocument();
    expect(screen.queryByText(/inferred cash/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /allocation/i })).toBeInTheDocument();
  });

  it("renders premium visual affordances for metrics and quote statuses", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-01-03",
        settlementDate: "2026-01-07",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "sell",
        quantity: 50,
        price: 1200,
        grossAmount: 60000
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([
      {
        code: "7201",
        market: "東証",
        price: 700,
        currency: "JPY",
        asOf: "2026-01-05T06:00:00.000Z",
        source: "Yahoo Finance",
        status: "delayed"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({
      "7201::東証": [
        { date: "2026-01-02", close: 1000 },
        { date: "2026-01-03", close: 1200 },
        { date: "2026-01-04", close: 600 }
      ]
    });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({
      topix: [],
      nikkei225: []
    });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["premium"], "ledger-premium.csv", { type: "text/csv" })
    );
    await user.clear(screen.getByLabelText(/manual ytd dividend/i));
    await user.type(screen.getByLabelText(/manual ytd dividend/i), "0");
    await user.clear(screen.getByLabelText(/manual cash balance/i));
    await user.type(screen.getByLabelText(/manual cash balance/i), "25000");
    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(fetchQuotesForHoldings).toHaveBeenCalled();
    });

    const summary = screen.getByLabelText(/portfolio summary/i);
    const dailyMetric = within(summary).getByText(/daily change/i).closest(".summary-card");
    const totalMetric = within(summary).getByText(/total return/i).closest(".summary-card");
    const quoteChip = screen.getByText("delayed").closest(".quote-chip");

    expect(dailyMetric).toHaveClass("metric-positive");
    expect(totalMetric).toHaveClass("metric-negative");
    expect(quoteChip).toHaveClass("quote-delayed");
  });

  it("shows the manual SBI dividend default before import", () => {
    render(<App />);

    expect(screen.getByLabelText(/manual ytd dividend/i)).toHaveValue("119511");
    expect(screen.getAllByText(/¥119,511|￥119,511/).length).toBeGreaterThan(0);
  });

  it("persists manual dividend input as the displayed year-to-date dividend", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/manual ytd dividend/i);
    await user.clear(input);
    await user.type(input, "120000");

    expect(window.localStorage.setItem).toHaveBeenCalledWith("portfolio:manualDividendYtd", "120000");
    expect(screen.getAllByText(/¥120,000|￥120,000/).length).toBeGreaterThan(0);
  });

  it("persists expected yearly dividend as a projection separate from current NAV", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/expected yearly dividend/i);
    await user.clear(input);
    await user.type(input, "240000");

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "portfolio:expectedAnnualDividend",
      "240000"
    );
    expect(screen.getAllByText(/¥240,000|￥240,000/).length).toBeGreaterThan(0);
  });

  it("refreshes quotes and updates the status pill", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    expect(screen.getByText(/no holdings to quote/i)).toBeInTheDocument();
    expect(fetchQuotesForHoldings).not.toHaveBeenCalled();
  });

  it("resets quote status when a newer CSV is imported after refresh", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-06-17",
        settlementDate: "2026-06-19",
        code: "6846",
        name: "中央製作所",
        market: "名証",
        side: "buy",
        quantity: 100,
        price: 1355,
        grossAmount: 135500
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({
      "6846::名証": []
    });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({
      topix: [],
      nikkei225: []
    });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["import-one"], "ledger-1.csv", { type: "text/csv" })
    );

    await waitFor(() => {
      expect(screen.getByText(/ledger-1.csv/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(screen.getByText(/no holdings to quote/i)).toBeInTheDocument();
    });

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["import-two"], "ledger-2.csv", { type: "text/csv" })
    );

    await waitFor(() => {
      expect(screen.getByText(/ledger-2.csv/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/quotes not refreshed/i)).toBeInTheDocument();
    expect(screen.queryByText(/no holdings to quote/i)).not.toBeInTheDocument();
  });

  it("ignores stale refresh responses after a newer CSV import", async () => {
    const user = userEvent.setup();
    const quoteRefresh = deferred<Awaited<ReturnType<typeof fetchQuotesForHoldings>>>();
    const historyRefresh = deferred<Awaited<ReturnType<typeof fetchHistoryForHoldings>>>();
    const benchmarkRefresh = deferred<Awaited<ReturnType<typeof fetchBenchmarks>>>();

    vi.mocked(parseSbiExecutionCsv)
      .mockReturnValueOnce([
        {
          tradeDate: "2026-06-17",
          settlementDate: "2026-06-19",
          code: "6846",
          name: "中央製作所",
          market: "名証",
          side: "buy",
          quantity: 100,
          price: 1355,
          grossAmount: 135500
        }
      ])
      .mockReturnValueOnce([
        {
          tradeDate: "2026-06-18",
          settlementDate: "2026-06-22",
          code: "7201",
          name: "日産自動車",
          market: "東証",
          side: "buy",
          quantity: 100,
          price: 300,
          grossAmount: 30000
        }
      ]);
    vi.mocked(fetchQuotesForHoldings).mockReturnValueOnce(quoteRefresh.promise);
    vi.mocked(fetchHistoryForHoldings).mockReturnValueOnce(historyRefresh.promise);
    vi.mocked(fetchBenchmarks).mockReturnValueOnce(benchmarkRefresh.promise);

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["import-one"], "ledger-1.csv", { type: "text/csv" })
    );
    await waitFor(() => {
      expect(screen.getByText(/ledger-1.csv/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["import-two"], "ledger-2.csv", { type: "text/csv" })
    );
    await waitFor(() => {
      expect(screen.getByText(/ledger-2.csv/i)).toBeInTheDocument();
    });

    quoteRefresh.resolve([
      {
        code: "6846",
        market: "名証",
        price: 1400,
        currency: "JPY",
        asOf: "2026-06-23T06:30:00.000Z",
        source: "Yahoo Finance",
        status: "delayed"
      }
    ]);
    historyRefresh.resolve({ "6846::名証": [{ date: "2026-06-23", close: 1400 }] });
    benchmarkRefresh.resolve({ topix: [], nikkei225: [] });

    await waitFor(() => {
      expect(screen.getByText(/quotes not refreshed/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/latest available prices/i)).not.toBeInTheDocument();
  });

  it("refresh populates chart data, quarterly returns, and daily change from history and benchmarks", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-01-03",
        settlementDate: "2026-01-07",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "sell",
        quantity: 50,
        price: 1200,
        grossAmount: 60000
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([
      {
        code: "7201",
        market: "東証",
        price: 1300,
        currency: "JPY",
        asOf: "2026-01-05T06:00:00.000Z",
        source: "Yahoo Finance",
        status: "delayed"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({
      "7201::東証": [
        { date: "2026-01-02", close: 1000 },
        { date: "2026-01-03", close: 1200 },
        { date: "2026-01-04", close: 1100 }
      ]
    });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({
      topix: [
        { date: "2026-01-02", value: 1000, normalized: 100, source: "test" },
        { date: "2026-01-03", value: 1010, normalized: 101, source: "test" },
        { date: "2026-01-04", value: 1020, normalized: 102, source: "test" }
      ],
      nikkei225: [
        { date: "2026-01-02", value: 2000, normalized: 100, source: "test" },
        { date: "2026-01-03", value: 2040, normalized: 102, source: "test" },
        { date: "2026-01-04", value: 2060, normalized: 103, source: "test" }
      ]
    });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["history"], "ledger-history.csv", { type: "text/csv" })
    );
    await user.clear(screen.getByLabelText(/manual ytd dividend/i));
    await user.type(screen.getByLabelText(/manual ytd dividend/i), "0");
    await user.clear(screen.getByLabelText(/manual cash balance/i));
    await user.type(screen.getByLabelText(/manual cash balance/i), "60000");

    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(fetchHistoryForHoldings).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: "7201",
            code: "7201",
            market: "東証"
          })
        ],
        "1y"
      );
    });

    expect(screen.getByTestId("performance-chart-points")).toHaveTextContent("4");
    expect(screen.getByText("2026 Q1")).toBeInTheDocument();
    const summary = screen.getByLabelText(/portfolio summary/i);
    expect(within(summary).getByText(/¥10,000|￥10,000/)).toBeInTheDocument();
  });

  it("uses manually entered cash for current NAV and portfolio allocation", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-01-03",
        settlementDate: "2026-01-07",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "sell",
        quantity: 50,
        price: 1200,
        grossAmount: 60000
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([
      {
        code: "7201",
        market: "東証",
        price: 1300,
        currency: "JPY",
        asOf: "2026-01-05T06:00:00.000Z",
        source: "Yahoo Finance",
        status: "delayed"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({
      "7201::東証": [
        { date: "2026-01-02", close: 1000 },
        { date: "2026-01-03", close: 1200 },
        { date: "2026-01-04", close: 1100 }
      ]
    });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({
      topix: [],
      nikkei225: []
    });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["manual-cash"], "ledger-manual-cash.csv", { type: "text/csv" })
    );

    const cashInput = screen.getByLabelText(/manual cash balance/i);
    await user.clear(cashInput);
    await user.type(cashInput, "25000");
    expect(window.localStorage.setItem).toHaveBeenCalledWith("portfolio:manualCash", "25000");

    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(fetchQuotesForHoldings).toHaveBeenCalled();
    });

    const summary = screen.getByLabelText(/portfolio summary/i);
    const navMetric = within(summary).getByText(/current nav/i).closest("div");
    const cashMetric = within(summary).getByText(/manual cash/i).closest("div");

    expect(navMetric).not.toBeNull();
    expect(cashMetric).not.toBeNull();
    expect(within(navMetric as HTMLElement).getByText(/¥209,511|￥209,511/)).toBeInTheDocument();
    expect(within(cashMetric as HTMLElement).getByText(/¥25,000|￥25,000/)).toBeInTheDocument();

    const method = screen.getByLabelText(/performance method/i);
    expect(within(method).getByText("Unit NAV")).toBeInTheDocument();
    expect(within(method).queryByText(/TWR/i)).not.toBeInTheDocument();
    expect(within(method).getByText(/value vs net contributions/i)).toBeInTheDocument();
    expect(within(method).getByText(/manual adjustments/i)).toBeInTheDocument();
    expect(within(method).getByText(/manual dividend outside broker/i)).toBeInTheDocument();
    expect(within(method).getAllByText(/¥119,511|￥119,511/).length).toBeGreaterThan(0);

    const allocation = screen.getByLabelText(/portfolio allocation/i);
    expect(within(allocation).getByText("Cash")).toBeInTheDocument();
    expect(within(allocation).getByText("日産自動車")).toBeInTheDocument();
    expect(screen.getByTestId("allocation-slices")).toHaveTextContent("2");
  });

  it("does not count a manual cash correction as daily investment loss", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-01-03",
        settlementDate: "2026-01-07",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "sell",
        quantity: 50,
        price: 1200,
        grossAmount: 60000
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([
      {
        code: "7201",
        market: "東証",
        price: 1300,
        currency: "JPY",
        asOf: "2026-01-05T06:00:00.000Z",
        source: "Yahoo Finance",
        status: "delayed"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({
      "7201::東証": [
        { date: "2026-01-02", close: 1000 },
        { date: "2026-01-03", close: 1200 },
        { date: "2026-01-04", close: 1100 }
      ]
    });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({
      topix: [],
      nikkei225: []
    });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["cash-flow"], "ledger-cash-flow.csv", { type: "text/csv" })
    );
    await user.clear(screen.getByLabelText(/manual ytd dividend/i));
    await user.type(screen.getByLabelText(/manual ytd dividend/i), "0");
    await user.clear(screen.getByLabelText(/manual cash balance/i));
    await user.type(screen.getByLabelText(/manual cash balance/i), "25000");
    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(fetchQuotesForHoldings).toHaveBeenCalled();
    });

    const summary = screen.getByLabelText(/portfolio summary/i);
    const dailyMetric = within(summary).getByText(/daily change/i).closest("div");

    expect(dailyMetric).not.toBeNull();
    expect(within(dailyMetric as HTMLElement).getByText(/¥10,000|￥10,000/)).toBeInTheDocument();
  });

  it("does not count manual YTD dividend as a one-day move", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      },
      {
        tradeDate: "2026-01-03",
        settlementDate: "2026-01-07",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "sell",
        quantity: 50,
        price: 1200,
        grossAmount: 60000
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([
      {
        code: "7201",
        market: "東証",
        price: 1300,
        currency: "JPY",
        asOf: "2026-01-05T06:00:00.000Z",
        source: "Yahoo Finance",
        status: "delayed"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({
      "7201::東証": [
        { date: "2026-01-02", close: 1000 },
        { date: "2026-01-03", close: 1200 },
        { date: "2026-01-04", close: 1100 }
      ]
    });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({
      topix: [],
      nikkei225: []
    });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["manual-dividend"], "ledger-manual-dividend.csv", { type: "text/csv" })
    );
    await user.clear(screen.getByLabelText(/manual cash balance/i));
    await user.type(screen.getByLabelText(/manual cash balance/i), "25000");
    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(fetchQuotesForHoldings).toHaveBeenCalled();
    });

    const summary = screen.getByLabelText(/portfolio summary/i);
    const navMetric = within(summary).getByText(/current nav/i).closest("div");
    const dailyMetric = within(summary).getByText(/daily change/i).closest("div");

    expect(navMetric).not.toBeNull();
    expect(dailyMetric).not.toBeNull();
    expect(within(navMetric as HTMLElement).getByText(/¥209,511|￥209,511/)).toBeInTheDocument();
    expect(within(dailyMetric as HTMLElement).getByText(/¥10,000|￥10,000/)).toBeInTheDocument();
  });

  it("counts stale quotes in the missing/stale quote summary metric", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-01-02",
        settlementDate: "2026-01-06",
        code: "7201",
        name: "日産自動車",
        market: "東証",
        side: "buy",
        quantity: 100,
        price: 1000,
        grossAmount: 100000
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([
      {
        code: "7201",
        market: "東証",
        price: 1000,
        currency: "JPY",
        asOf: "2026-01-02T06:00:00.000Z",
        source: "Yahoo Finance",
        status: "stale"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({
      "7201::東証": [{ date: "2026-01-02", close: 1000 }]
    });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({
      topix: [],
      nikkei225: []
    });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["stale"], "ledger-stale.csv", { type: "text/csv" })
    );
    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(fetchQuotesForHoldings).toHaveBeenCalled();
    });

    const summary = screen.getByLabelText(/portfolio summary/i);
    const metric = within(summary).getByText(/missing\/stale quotes/i).closest("div");
    expect(metric).not.toBeNull();
    expect(within(metric as HTMLElement).getByText("1")).toBeInTheDocument();
  });

  it("keeps a missing 名証 quote visible and shows it is valued at average cost", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([
      {
        tradeDate: "2026-06-17",
        settlementDate: "2026-06-19",
        code: "6846",
        name: "中央製作所",
        market: "名証",
        side: "buy",
        quantity: 100,
        price: 1355,
        grossAmount: 135500
      }
    ]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValueOnce([
      {
        code: "6846",
        market: "名証",
        price: null,
        currency: "JPY",
        asOf: null,
        source: "Yahoo Finance",
        status: "missing",
        message: "Request failed with status 404"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValueOnce({ "6846::名証": [] });
    vi.mocked(fetchBenchmarks).mockResolvedValueOnce({ topix: [], nikkei225: [] });

    render(<App />);

    await user.upload(
      screen.getByLabelText(/import csv/i),
      new File(["nagoya"], "ledger-nagoya.csv", { type: "text/csv" })
    );
    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    await waitFor(() => {
      expect(screen.getByText("6846")).toBeInTheDocument();
    });

    const row = screen.getByText("6846").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("中央製作所")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("名証")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(/average cost fallback/i)).toBeInTheDocument();
  });
});
