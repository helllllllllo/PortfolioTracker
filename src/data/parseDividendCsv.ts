import Papa from "papaparse";
import { decodeCsvBytes } from "./decode";
import type { ExternalDividend } from "../types";

// Header names we recognize, most-specific first. Tolerant so it works with the SBI
// 配当金 export and generic date/amount CSVs; tighten once the real file is in hand.
const DATE_HEADERS = ["入金日", "支払日", "受渡日", "配当基準日", "date", "Date"];
const AMOUNT_HEADERS = ["受取金額", "手取金額", "配当金額", "配当・分配金", "金額", "amount", "Amount"];
const CODE_HEADERS = ["銘柄コード", "コード", "code", "Code"];

function normalizeDate(value: string): string {
  return value.trim().replaceAll("/", "-");
}

function cleanAmount(value: string): number {
  const cleaned = String(value).replace(/[,\s￥¥+]/g, "").trim();
  if (cleaned === "" || cleaned === "--") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header === candidate);
    if (index >= 0) return index;
  }
  return -1;
}

export function parseDividendCsv(input: ArrayBuffer | string): ExternalDividend[] {
  const text = decodeCsvBytes(input);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);

  const rows = parsed.data;
  let headerIndex = -1;
  let dateCol = -1;
  let amountCol = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const trimmed = rows[i].map((cell) => cell.trim());
    const d = findColumn(trimmed, DATE_HEADERS);
    const a = findColumn(trimmed, AMOUNT_HEADERS);
    if (d >= 0 && a >= 0) {
      headerIndex = i;
      dateCol = d;
      amountCol = a;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new Error("Could not find date and amount columns in the dividend CSV");
  }

  const codeCol = findColumn(rows[headerIndex].map((cell) => cell.trim()), CODE_HEADERS);
  const dividends: ExternalDividend[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const rawDate = row[dateCol]?.trim();
    if (!rawDate || !/\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(rawDate)) continue;
    const amount = cleanAmount(row[amountCol] ?? "0");
    if (amount === 0) continue;
    const code = codeCol >= 0 ? row[codeCol]?.trim() : undefined;
    dividends.push({ date: normalizeDate(rawDate), amount, ...(code ? { code } : {}) });
  }
  return dividends;
}
