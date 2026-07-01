import type { Holding, PricedHolding, Quote } from "../types";

type ManualOverrides = Record<string, number>;

function missingQuote(holding: Holding): Quote {
  return {
    code: holding.code,
    market: holding.market,
    price: null,
    currency: holding.currency ?? "JPY",
    asOf: null,
    source: "none",
    status: "missing",
    message: "No free quote found; carrying at average cost"
  };
}

function manualQuote(holding: Holding, price: number): Quote {
  return {
    code: holding.code,
    market: holding.market,
    price,
    currency: holding.currency ?? "JPY",
    asOf: new Date().toISOString(),
    source: "manual",
    status: "manual"
  };
}

export function priceHoldings(
  holdings: Holding[],
  quotes: Quote[],
  manualOverrides: ManualOverrides
): PricedHolding[] {
  const quoteByCode = new Map(quotes.map((quote) => [quote.code, quote]));

  const priced = holdings.map((holding) => {
    const override = manualOverrides[holding.id];
    const quote =
      override !== undefined
        ? manualQuote(holding, override)
        : quoteByCode.get(holding.code) ?? missingQuote(holding);
    const latestPrice = quote.price;
    const fallbackPrice = holding.averageCost;
    const marketValue = (latestPrice ?? fallbackPrice) * holding.quantity;
    const costBasis = holding.costBasis;
    const unrealizedPnl = marketValue - costBasis;

    return {
      ...holding,
      latestPrice,
      marketValue,
      unrealizedPnl,
      allocation: 0,
      quote
    };
  });

  const total = priced.reduce((sum, holding) => sum + holding.marketValue, 0);

  return priced.map((holding) => ({
    ...holding,
    allocation: total === 0 ? 0 : holding.marketValue / total
  }));
}
