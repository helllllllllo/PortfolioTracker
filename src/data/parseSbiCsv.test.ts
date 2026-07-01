import { describe, expect, it } from "vitest";
import { parsePortfolioCsv, parseSbiExecutionCsv } from "./parseSbiCsv";

const csvText = `
約定履歴照会

商品指定,約定開始年月日,約定終了年月日,明細数,明細指定開始,明細指定終了
"すべての商品","2026年01月01日","2026年06月23日","2","1","2"

約定日,銘柄,銘柄コード,市場,取引,期限,預り,課税,約定数量,約定単価,手数料/諸経費等,税額,受渡日,受渡金額/決済損益
"2026/06/17","中央製作所","6846","名証",株式現物買,"--"," 一般 ","--",100,1355,--,--,"2026/06/19",135500
"2026/06/15","ジャフコ　グループ","8595","PTS（X）",株式現物売,"--"," 一般 ","--",100,2239.4,--,--,"2026/06/17",223940
`;

describe("parseSbiExecutionCsv", () => {
  it("parses SBI execution rows and preserves Nagoya exchange holdings", () => {
    const trades = parseSbiExecutionCsv(csvText);

    expect(trades).toHaveLength(2);
    expect(trades[0]).toEqual({
      tradeDate: "2026-06-17",
      settlementDate: "2026-06-19",
      code: "6846",
      name: "中央製作所",
      market: "名証",
      side: "buy",
      quantity: 100,
      price: 1355,
      grossAmount: 135500
    });
    expect(trades[1].side).toBe("sell");
  });

  it("throws a useful error when required SBI headers are missing", () => {
    expect(() => parseSbiExecutionCsv("date,name\\n2026-01-01,test")).toThrow(
      /required SBI header/i
    );
  });
});

describe("parsePortfolioCsv", () => {
  it("returns SBI execution trades", () => {
    const parsed = parsePortfolioCsv(csvText);

    expect(parsed.source).toBe("sbi");
    expect(parsed.trades).toHaveLength(2);
  });
});
