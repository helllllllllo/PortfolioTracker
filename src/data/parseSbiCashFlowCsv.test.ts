import { describe, it, expect } from "vitest";
import { parseSbiCashFlowCsv } from "./parseSbiCashFlowCsv";

const SAMPLE = `
円貨入出金明細

指定期間,指定期間(開始),指定期間(終了),スィープ専用銀行口座 明細表示,指定取引区分,明細数
"期間指定","2024/07/03","2026/07/02","なし","入金：すべて、出金：すべて","4"

出金額合計,うち振替出金,入金額合計,うち振替入金
"0","0","2504203","0"

入出金日,取引,区分,摘要,出金額,入金額
"2026/07/01","入金","金融機関からの入金","振込入金","0","2000000"
"2026/06/15","入金","貸株","貸株金利","0","4203"
"2026/05/07","入金","金融機関からの入金","振込入金","0","500000"
"2026/04/01","出金","振替出金","振替","100000","0"
`;

describe("parseSbiCashFlowCsv", () => {
  it("classifies bank deposits as contributions", () => {
    const flows = parseSbiCashFlowCsv(SAMPLE);
    const contrib = flows.filter((f) => f.kind === "contribution");
    expect(contrib.map((f) => [f.date, f.amount])).toEqual([
      ["2026-07-01", 2000000],
      ["2026-05-07", 500000],
    ]);
  });
  it("classifies 貸株金利 as income", () => {
    const income = parseSbiCashFlowCsv(SAMPLE).filter((f) => f.kind === "income");
    expect(income).toEqual([
      { date: "2026-06-15", kind: "income", category: "貸株", description: "貸株金利", amount: 4203 },
    ]);
  });
  it("classifies 出金 as withdrawal using the 出金額 column", () => {
    const w = parseSbiCashFlowCsv(SAMPLE).filter((f) => f.kind === "withdrawal");
    expect(w).toEqual([
      { date: "2026-04-01", kind: "withdrawal", category: "振替出金", description: "振替", amount: 100000 },
    ]);
  });
  it("throws when the header row is absent", () => {
    expect(() => parseSbiCashFlowCsv("nope,nope\n1,2")).toThrow(/cash-flow header/);
  });
});
