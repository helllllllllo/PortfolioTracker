import Papa from "papaparse";
import type { Trade, TradeSide } from "../types";
import { decodeCsvBytes } from "./decode";

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

export type ParsedPortfolioCsv = {
  source: "sbi";
  trades: Trade[];
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

function tradeSide(raw: string): TradeSide | null {
  if (raw.includes("買")) return "buy";
  if (raw.includes("売")) return "sell";
  return null;
}

export function parseSbiExecutionCsv(input: ArrayBuffer | string): Trade[] {
  const text = decodeCsvBytes(input);
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
  return {
    source: "sbi",
    trades: parseSbiExecutionCsv(input)
  };
}
