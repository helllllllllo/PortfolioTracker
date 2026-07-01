import type { Currency } from "./types";

export function formatCurrency(value: number, currency: Currency = "JPY"): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}
