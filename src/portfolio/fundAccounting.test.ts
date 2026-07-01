import { describe, it, expect } from "vitest";
import { buildFundSnapshots, UNIT_BASE } from "./fundAccounting";
import type { CashFlow, ExternalDividend, Trade } from "../types";

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
