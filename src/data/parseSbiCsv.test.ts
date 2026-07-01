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

const schwabCsv = `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"06/26/2026","Buy","SNOW","SNOWFLAKE INC CLASS A","10","$224.89","","-$2248.90"
"06/22/2026","Sell","SCHD","SCHWAB U.S. DIVIDEND EQUITY ETF","403.8082","$32.04","$0.35","$12937.66"
"06/04/2026","Reinvest Shares","SHV","ISHARES 01 YEAR TREASURYBOND ETF","0.4437","$110.10","","-$48.85"
"03/26/2026 as of 03/25/2026","Cancel Buy","BRKB","BERKSHIRE HATHAWAY CLASS B","4","$477.40","","$1909.60"
"11/17/2025 as of 11/14/2025","Stock Split","NFLX","NETFLIX INC","540","$111.217","",""
"06/17/2024","Reverse Split","HYDR","GLOBAL X HYDROGEN ETF IV","268","$67.62","",""
"01/11/2023","Security Transfer","AMD","ADVANCED MICRO DEVIC","48","","",""
"06/25/2026","Qualified Dividend","META","META PLATFORMS INC CLASS A","","","","$16.80"`;

describe("parsePortfolioCsv", () => {
  it("auto-detects SBI execution CSVs", () => {
    const parsed = parsePortfolioCsv(csvText);

    expect(parsed.source).toBe("sbi");
    expect(parsed.trades).toHaveLength(2);
    expect(parsed.dividends).toEqual([]);
  });

  it("parses Schwab US transaction rows into USD portfolio events", () => {
    const parsed = parsePortfolioCsv(schwabCsv);

    expect(parsed.source).toBe("schwab");
    expect(parsed.trades).toEqual([
      expect.objectContaining({
        tradeDate: "2026-06-26",
        settlementDate: "2026-06-26",
        code: "SNOW",
        name: "SNOWFLAKE INC CLASS A",
        market: "US",
        side: "buy",
        quantity: 10,
        price: 224.89,
        grossAmount: 2248.9,
        currency: "USD"
      }),
      expect.objectContaining({
        code: "SCHD",
        side: "sell",
        quantity: 403.8082,
        grossAmount: 12937.66,
        currency: "USD"
      }),
      expect.objectContaining({
        code: "SHV",
        side: "buy",
        quantity: 0.4437,
        grossAmount: 48.85,
        currency: "USD"
      }),
      expect.objectContaining({
        code: "BRKB",
        side: "sell",
        quantity: 4,
        grossAmount: 1909.6,
        currency: "USD"
      }),
      expect.objectContaining({
        code: "NFLX",
        side: "buy",
        quantity: 540,
        grossAmount: 0,
        currency: "USD"
      }),
      expect.objectContaining({
        code: "HYDR",
        side: "split",
        quantity: 268,
        grossAmount: 0,
        currency: "USD"
      }),
      expect.objectContaining({
        code: "AMD",
        side: "buy",
        quantity: 48,
        grossAmount: 0,
        currency: "USD"
      })
    ]);
    expect(parsed.dividends).toEqual([
      {
        date: "2026-06-25",
        amount: 16.8,
        state: "confirmed",
        currency: "USD"
      }
    ]);
    expect(parsed.warnings).toContain("AMD: transferred shares imported with zero cost basis");
  });
});
