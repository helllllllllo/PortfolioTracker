import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { parseSbiExecutionCsv } from "./data/parseSbiCsv";
import { parseSbiCashFlowCsv } from "./data/parseSbiCashFlowCsv";
import { fetchBenchmarks, fetchHistoryForHoldings, fetchQuotesForHoldings } from "./market/apiClient";
import type { CashFlow, Trade } from "./types";

vi.mock("./market/apiClient", () => ({
  fetchQuotesForHoldings: vi.fn(),
  fetchHistoryForHoldings: vi.fn(),
  fetchBenchmarks: vi.fn()
}));

vi.mock("./data/parseSbiCsv", () => ({ parseSbiExecutionCsv: vi.fn() }));
vi.mock("./data/parseSbiCashFlowCsv", () => ({ parseSbiCashFlowCsv: vi.fn() }));

vi.mock("./components/PerformanceChart", () => ({
  PerformanceChart: ({ data }: { data: Array<unknown> }) => (
    <section>
      <h2>Performance</h2>
      <div data-testid="performance-chart-points">{data.length}</div>
    </section>
  )
}));

vi.mock("./components/AllocationPieChart", () => ({
  AllocationPieChart: ({ slices }: { slices: Array<{ label: string }> }) => (
    <section aria-label="Portfolio allocation">
      <h2>Allocation</h2>
      <div data-testid="allocation-slices">{slices.length}</div>
    </section>
  )
}));

function installTestStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => store.set(key, value))
    }
  });
}

const TRADE: Trade = {
  tradeDate: "2026-01-15",
  settlementDate: "2026-01-17",
  code: "7203",
  name: "トヨタ自動車",
  market: "東証",
  side: "buy",
  quantity: 1000,
  price: 100,
  grossAmount: 100000
};

const CONTRIBUTION: CashFlow = {
  date: "2026-01-10",
  kind: "contribution",
  category: "金融機関からの入金",
  description: "振込入金",
  amount: 100000
};

describe("App", () => {
  beforeEach(() => {
    vi.mocked(fetchQuotesForHoldings).mockReset();
    vi.mocked(fetchHistoryForHoldings).mockReset();
    vi.mocked(fetchBenchmarks).mockReset();
    vi.mocked(parseSbiExecutionCsv).mockReset();
    vi.mocked(parseSbiCashFlowCsv).mockReset();
    installTestStorage();
  });

  it("renders the dashboard shell before any import", () => {
    render(<App />);
    expect(screen.getByText("Hiroshi Capital")).toBeInTheDocument();
    expect(screen.getByText("Net asset value")).toBeInTheDocument();
    expect(screen.getByLabelText(/import trades csv/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/import cash flows csv/i)).toBeInTheDocument();
  });

  it("computes a time-weighted NAV and return from trades + cash flows + quotes", async () => {
    const user = userEvent.setup();
    vi.mocked(parseSbiExecutionCsv).mockReturnValue([TRADE]);
    vi.mocked(parseSbiCashFlowCsv).mockReturnValue([CONTRIBUTION]);
    vi.mocked(fetchQuotesForHoldings).mockResolvedValue([
      {
        code: "7203",
        market: "東証",
        price: 120,
        currency: "JPY",
        asOf: "2026-01-20T00:00:00.000Z",
        source: "test",
        status: "delayed"
      }
    ]);
    vi.mocked(fetchHistoryForHoldings).mockResolvedValue({
      "7203": [
        { date: "2026-01-15", close: 100 },
        { date: "2026-01-20", close: 120 }
      ]
    });
    vi.mocked(fetchBenchmarks).mockResolvedValue({
      topix: [
        { date: "2026-01-15", value: 2800, normalized: 100, source: "topix" },
        { date: "2026-01-20", value: 2828, normalized: 101, source: "topix" }
      ],
      nikkei225: [
        { date: "2026-01-15", value: 40000, normalized: 100, source: "nikkei" },
        { date: "2026-01-20", value: 40400, normalized: 101, source: "nikkei" }
      ]
    });

    render(<App />);
    await user.upload(
      screen.getByLabelText(/import trades csv/i),
      new File(["trades"], "trades.csv", { type: "text/csv" })
    );
    await user.upload(
      screen.getByLabelText(/import cash flows csv/i),
      new File(["cash"], "cash.csv", { type: "text/csv" })
    );
    await user.click(screen.getByRole("button", { name: /refresh quotes/i }));

    const summary = screen.getByLabelText(/portfolio summary/i);
    await waitFor(() => {
      expect(within(summary).getByText(/￥120,000|¥120,000/)).toBeInTheDocument();
    });
    // Holding rose 100 -> 120 on fully-deployed capital: since-inception TWR = 20%.
    expect(within(summary).getAllByText("20.00%").length).toBeGreaterThan(0);
  });
});
