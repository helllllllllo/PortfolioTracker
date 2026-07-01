import { describe, it, expect } from "vitest";
import { buildFundSnapshots, periodStartDate, timeWeightedReturn, UNIT_BASE } from "./fundAccounting";
import type { CashFlow, ExternalDividend, PortfolioSnapshot, Trade } from "../types";

const flat = (code: string) => ({
  [code]: [
    { date: "2026-01-01", close: 100 },
    { date: "2026-02-01", close: 100 },
    { date: "2026-03-01", close: 100 },
  ],
});
const buy = (date: string, code: string, qty: number, px: number): Trade => ({
  tradeDate: date,
  settlementDate: date,
  code,
  name: code,
  market: "東証",
  side: "buy",
  quantity: qty,
  price: px,
  grossAmount: qty * px,
});
const contrib = (date: string, amount: number): CashFlow => ({
  date,
  kind: "contribution",
  category: "",
  description: "",
  amount,
});

describe("buildFundSnapshots", () => {
  it("starts unit price at 100 on the first contribution", () => {
    const s = buildFundSnapshots({
      trades: [],
      cashFlows: [contrib("2026-01-01", 1_000_000)],
      dividends: [],
      historyByCode: {},
      asOfDate: "2026-01-01",
    });
    expect(s.at(-1)!.unitNav).toBeCloseTo(UNIT_BASE, 6);
    expect(s.at(-1)!.nav).toBe(1_000_000);
  });

  it("a contribution does not move the unit price on its day", () => {
    const history = { A: [
      { date: "2026-01-01", close: 100 },
      { date: "2026-02-01", close: 200 },
    ] };
    const s = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000), contrib("2026-02-01", 1_000_000)],
      dividends: [],
      historyByCode: history,
      asOfDate: "2026-02-01",
    });
    expect(s.at(-1)!.unitNav).toBeCloseTo(200, 4);
  });

  it("is invariant to contribution timing on the pre-flow unit price", () => {
    const history = { A: [
      { date: "2026-01-01", close: 100 },
      { date: "2026-02-01", close: 150 },
      { date: "2026-03-01", close: 150 },
    ] };
    const early = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000)],
      dividends: [],
      historyByCode: history,
      asOfDate: "2026-03-01",
    });
    const late = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000), contrib("2026-02-01", 5_000_000)],
      dividends: [],
      historyByCode: history,
      asOfDate: "2026-03-01",
    });
    const earlyFeb = early.find((x) => x.date === "2026-02-01")!.unitNav;
    const lateFeb = late.find((x) => x.date === "2026-02-01")!.unitNav;
    expect(lateFeb).toBeCloseTo(earlyFeb, 4); // ~150
  });

  it("adds back dividends to total return but not to NAV", () => {
    const s = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000)],
      dividends: [{ date: "2026-02-01", amount: 100_000 }] as ExternalDividend[],
      historyByCode: flat("A"),
      asOfDate: "2026-02-01",
    });
    const last = s.at(-1)!;
    expect(last.nav).toBe(1_000_000);
    expect(last.navTotalReturn).toBe(1_100_000);
    expect(last.unitNav).toBeCloseTo(110, 4);
  });

  it("lending income raises both NAV and total return", () => {
    const income: CashFlow = {
      date: "2026-02-01",
      kind: "income",
      category: "貸株",
      description: "貸株金利",
      amount: 50_000,
    };
    const s = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000), income],
      dividends: [],
      historyByCode: flat("A"),
      asOfDate: "2026-02-01",
    });
    expect(s.at(-1)!.nav).toBe(1_050_000);
    expect(s.at(-1)!.unitNav).toBeCloseTo(105, 4);
  });
});

const snap = (date: string, unitNav: number): PortfolioSnapshot => ({
  date,
  cash: 0,
  holdingsValue: 0,
  nav: 0,
  navTotalReturn: 0,
  units: 1,
  unitNav,
});

describe("period windows", () => {
  it("computes period start dates", () => {
    expect(periodStartDate("2026-07-02", "ytd")).toBe("2026-01-01");
    expect(periodStartDate("2026-07-02", "qtd")).toBe("2026-07-01");
    expect(periodStartDate("2026-05-15", "qtd")).toBe("2026-04-01");
    expect(periodStartDate("2026-07-02", "mtd")).toBe("2026-07-01");
    expect(periodStartDate("2026-07-02", "inception")).toBeNull();
  });
  it("since-inception TWR uses base 100", () => {
    const s = [snap("2026-01-01", 100), snap("2026-06-30", 120)];
    expect(timeWeightedReturn(s, "inception")).toBeCloseTo(0.2, 6);
  });
  it("QTD uses the last unit price before the quarter start", () => {
    const s = [snap("2026-03-31", 110), snap("2026-04-01", 110), snap("2026-06-30", 132)];
    expect(timeWeightedReturn(s, "qtd")).toBeCloseTo(0.2, 6); // 132/110 - 1
  });
});
