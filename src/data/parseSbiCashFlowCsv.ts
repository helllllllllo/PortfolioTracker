import Papa from "papaparse";
import { decodeCsvBytes } from "./decode";
import type { CashFlow } from "../types";

const INCOME_KEYWORDS = ["貸株", "配当", "分配", "利子", "金利"];

function normalizeDate(value: string): string {
  return value.trim().replaceAll("/", "-");
}

function cleanAmount(value: string): number {
  const cleaned = String(value).replaceAll(",", "").trim();
  if (cleaned === "" || cleaned === "--") return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid cash-flow amount: ${value}`);
  return parsed;
}

function classifyInflow(category: string, description: string): "contribution" | "income" {
  const hay = `${category} ${description}`;
  return INCOME_KEYWORDS.some((keyword) => hay.includes(keyword)) ? "income" : "contribution";
}

export function parseSbiCashFlowCsv(input: ArrayBuffer | string): CashFlow[] {
  const text = decodeCsvBytes(input);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);

  const rows = parsed.data;
  const headerIndex = rows.findIndex((row) => row.includes("入出金日") && row.includes("入金額"));
  if (headerIndex < 0) throw new Error("Missing SBI cash-flow header (入出金日 … 入金額)");

  const headers = rows[headerIndex].map((header) => header.trim());
  const index = new Map(headers.map((header, i) => [header, i] as const));
  const col = (name: string) => index.get(name) ?? -1;

  const flows: CashFlow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const rawDate = row[col("入出金日")]?.trim();
    if (!rawDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(rawDate)) continue;

    const transaction = (row[col("取引")] ?? "").trim();
    const category = (row[col("区分")] ?? "").trim();
    const description = (row[col("摘要")] ?? "").trim();
    const inAmount = cleanAmount(row[col("入金額")] ?? "0");
    const outAmount = cleanAmount(row[col("出金額")] ?? "0");

    if (transaction.includes("入金") && inAmount > 0) {
      flows.push({
        date: normalizeDate(rawDate),
        kind: classifyInflow(category, description),
        category,
        description,
        amount: inAmount,
      });
    } else if (transaction.includes("出金") && outAmount > 0) {
      flows.push({
        date: normalizeDate(rawDate),
        kind: "withdrawal",
        category,
        description,
        amount: outAmount,
      });
    }
  }
  return flows;
}
