import type { Currency } from "./types";

export function formatCurrency(value: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0
  }).format(value);
}
