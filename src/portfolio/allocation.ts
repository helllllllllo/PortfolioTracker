import type { Currency, PricedHolding } from "../types";

export type AllocationSlice = {
  id: string;
  label: string;
  detail: string;
  value: number;
  weight: number;
};

export function buildAllocationSlices(
  holdings: PricedHolding[],
  cash: number,
  currency: Currency = "JPY"
): AllocationSlice[] {
  const holdingSlices = holdings
    .filter((holding) => holding.marketValue > 0)
    .map((holding) => ({
      id: holding.id,
      label: holding.name,
      detail: `${holding.code} / ${holding.market}`,
      value: holding.marketValue
    }));
  const rawSlices =
    cash > 0
      ? [...holdingSlices, { id: "cash", label: "Cash", detail: currency, value: cash }]
      : holdingSlices;
  const total = rawSlices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) return [];

  return [...rawSlices]
    .sort((a, b) => b.value - a.value)
    .map((slice) => ({
      ...slice,
      weight: slice.value / total
    }));
}
