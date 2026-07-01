import type { PricedHolding } from "../types";

export function calculateInvestmentChange(_input: {
  pricedHoldings: PricedHolding[];
  realizedPnl: number;
  internalIncome: number;
}): number {
  const unrealizedPnl = _input.pricedHoldings.reduce(
    (sum, holding) => sum + holding.unrealizedPnl,
    0
  );
  return unrealizedPnl + _input.realizedPnl + _input.internalIncome;
}

export function calculateNetContributions(_input: {
  beginningValue: number;
  endingValue: number;
  investmentChange: number;
}): number {
  return _input.endingValue - _input.beginningValue - _input.investmentChange;
}
