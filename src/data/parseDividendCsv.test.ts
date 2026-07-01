import { describe, it, expect } from "vitest";
import { parseDividendCsv } from "./parseDividendCsv";

// Plausible SBI 配当金・分配金 export shape (net "受取金額" is what lands in the account).
const SBI_DIVIDEND = `配当金・分配金

入金日,銘柄コード,銘柄,数量,配当・分配金,税額,受取金額
"2026/06/15","7974","任天堂","300","30000","6090","23910"
"2026/06/29","3697","ＳＨＩＦＴ","7000","70000","14210","55790"
`;

describe("parseDividendCsv", () => {
  it("parses date + net received amount from an SBI-style dividend CSV", () => {
    const rows = parseDividendCsv(SBI_DIVIDEND);
    expect(rows).toEqual([
      { date: "2026-06-15", amount: 23910, code: "7974" },
      { date: "2026-06-29", amount: 55790, code: "3697" }
    ]);
  });

  it("falls back to a generic amount column and English headers", () => {
    const csv = `Date,Code,Amount\n"2026-05-10","2267","1200"\n`;
    expect(parseDividendCsv(csv)).toEqual([{ date: "2026-05-10", amount: 1200, code: "2267" }]);
  });

  it("throws when no date/amount columns are found", () => {
    expect(() => parseDividendCsv("foo,bar\n1,2")).toThrow(/dividend/i);
  });
});
