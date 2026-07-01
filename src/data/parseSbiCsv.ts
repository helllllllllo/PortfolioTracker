import Encoding from "encoding-japanese";
import Papa from "papaparse";
import type { Trade, TradeSide } from "../types";
import type { DividendRow } from "../dividends/dividends";

const REQUIRED_HEADERS = [
  "約定日",
  "銘柄",
  "銘柄コード",
  "市場",
  "取引",
  "約定数量",
  "約定単価",
  "受渡日",
  "受渡金額/決済損益"
];

const SCHWAB_HEADERS = [
  "Date",
  "Action",
  "Symbol",
  "Description",
  "Quantity",
  "Price",
  "Fees & Comm",
  "Amount"
];

const SCHWAB_DIVIDEND_ACTIONS = new Set([
  "Cash Dividend",
  "Qualified Dividend",
  "Non-Qualified Div",
  "Reinvest Dividend",
  "Qual Div Reinvest",
  "Pr Yr Cash Div",
  "Pr Yr Div Reinvest",
  "Pr Yr Non Qual Div"
]);

export type ParsedPortfolioCsv = {
  source: "sbi" | "schwab";
  trades: Trade[];
  dividends: DividendRow[];
  warnings: string[];
};

function normalizeDate(value: string): string {
  return value.trim().replaceAll("/", "-");
}

function cleanNumber(value: string): number {
  const cleaned = String(value).replaceAll(",", "").replace("+", "").trim();
  if (cleaned === "" || cleaned === "--") return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return parsed;
}

function cleanMoney(value: string): number {
  const cleaned = String(value)
    .replace(/[,$]/g, "")
    .replace(/[()]/g, "")
    .trim();
  if (cleaned === "") return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return parsed;
}

function decodeInput(input: ArrayBuffer | string): string {
  if (typeof input === "string") return input;
  const bytes = new Uint8Array(input);
  return Encoding.convert(bytes, {
    to: "UNICODE",
    from: "SJIS",
    type: "string"
  });
}

function tradeSide(raw: string): TradeSide | null {
  if (raw.includes("買")) return "buy";
  if (raw.includes("売")) return "sell";
  return null;
}

function schwabDate(raw: string): string {
  const [datePart] = raw.split(" as of ");
  const [month, day, year] = datePart.trim().split("/");
  if (!month || !day || !year) {
    throw new Error(`Invalid Schwab date: ${raw}`);
  }
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function schwabHeaders(headers: string[]): boolean {
  const found = new Set(headers.map((header) => header.trim()));
  return SCHWAB_HEADERS.every((header) => found.has(header));
}

function parseSchwabTransactionRows(rows: string[][], headerIndex: number): ParsedPortfolioCsv {
  const headers = rows[headerIndex].map((header) => header.trim());
  const index = new Map(headers.map((header, i) => [header, i]));
  const trades: Trade[] = [];
  const dividends: DividendRow[] = [];
  const warnings: string[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const rawDate = row[index.get("Date") ?? -1]?.trim();
    const action = row[index.get("Action") ?? -1]?.trim();
    const symbol = row[index.get("Symbol") ?? -1]?.trim();
    const description = row[index.get("Description") ?? -1]?.trim() ?? "";

    if (!rawDate || !action) continue;

    const date = schwabDate(rawDate);
    const quantity = cleanNumber(row[index.get("Quantity") ?? -1] ?? "0");
    const price = cleanMoney(row[index.get("Price") ?? -1] ?? "0");
    const amount = cleanMoney(row[index.get("Amount") ?? -1] ?? "0");

    if (SCHWAB_DIVIDEND_ACTIONS.has(action)) {
      if (amount !== 0) {
        dividends.push({
          date,
          amount,
          state: "confirmed",
          currency: "USD"
        });
      }
      continue;
    }

    if (!symbol) continue;

    const base = {
      tradeDate: date,
      settlementDate: date,
      code: symbol,
      name: description,
      market: "US",
      price,
      currency: "USD" as const
    };

    if (action === "Buy" || action === "Reinvest Shares") {
      trades.push({
        ...base,
        side: "buy",
        quantity,
        grossAmount: Math.abs(amount) || quantity * price
      });
      continue;
    }

    if (action === "Sell" || action === "Cancel Buy") {
      trades.push({
        ...base,
        side: "sell",
        quantity,
        grossAmount: Math.abs(amount) || quantity * price
      });
      continue;
    }

    if (action === "Security Transfer") {
      if (quantity > 0) {
        warnings.push(`${symbol}: transferred shares imported with zero cost basis`);
        trades.push({
          ...base,
          side: "buy",
          quantity,
          grossAmount: 0
        });
      } else if (quantity < 0) {
        trades.push({
          ...base,
          side: "sell",
          quantity: Math.abs(quantity),
          grossAmount: 0
        });
      }
      continue;
    }

    if (action === "Stock Split") {
      trades.push({
        ...base,
        side: "buy",
        quantity,
        grossAmount: 0
      });
      continue;
    }

    if (action === "Reverse Split" && quantity > 0) {
      trades.push({
        ...base,
        side: "split",
        quantity,
        grossAmount: 0
      });
      continue;
    }

    if (action === "Full Redemption" && quantity !== 0) {
      trades.push({
        ...base,
        side: "sell",
        quantity: Math.abs(quantity),
        grossAmount: Math.abs(amount)
      });
    }
  }

  return {
    source: "schwab",
    trades,
    dividends,
    warnings
  };
}

export function parseSbiExecutionCsv(input: ArrayBuffer | string): Trade[] {
  const text = decodeInput(input);
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  const rows = parsed.data;
  const headerIndex = rows.findIndex((row) => row.includes("約定日") && row.includes("銘柄コード"));

  if (headerIndex < 0) {
    throw new Error(`Missing required SBI header: ${REQUIRED_HEADERS.join(", ")}`);
  }

  const headers = rows[headerIndex].map((header) => header.trim());
  const index = new Map(headers.map((header, i) => [header, i]));
  const missing = REQUIRED_HEADERS.filter((header) => !index.has(header));

  if (missing.length > 0) {
    throw new Error(`Missing required SBI header: ${missing.join(", ")}`);
  }

  const trades: Trade[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const tradeDate = row[index.get("約定日") ?? -1]?.trim();
    if (!tradeDate) continue;

    const side = tradeSide(row[index.get("取引") ?? -1] ?? "");
    if (!side) continue;

    trades.push({
      tradeDate: normalizeDate(tradeDate),
      settlementDate: normalizeDate(row[index.get("受渡日") ?? -1] ?? ""),
      code: (row[index.get("銘柄コード") ?? -1] ?? "").trim(),
      name: (row[index.get("銘柄") ?? -1] ?? "").trim(),
      market: (row[index.get("市場") ?? -1] ?? "").trim(),
      side,
      quantity: cleanNumber(row[index.get("約定数量") ?? -1] ?? "0"),
      price: cleanNumber(row[index.get("約定単価") ?? -1] ?? "0"),
      grossAmount: cleanNumber(row[index.get("受渡金額/決済損益") ?? -1] ?? "0")
    });
  }

  return trades;
}

export function parsePortfolioCsv(input: ArrayBuffer | string): ParsedPortfolioCsv {
  const text = decodeInput(input);
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  const rows = parsed.data;
  const schwabHeaderIndex = rows.findIndex((row) => schwabHeaders(row));
  if (schwabHeaderIndex >= 0) {
    return parseSchwabTransactionRows(rows, schwabHeaderIndex);
  }

  return {
    source: "sbi",
    trades: parseSbiExecutionCsv(input),
    dividends: [],
    warnings: []
  };
}
