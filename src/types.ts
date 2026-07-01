export type Currency = "JPY" | "USD";

export type TradeSide = "buy" | "sell" | "split";

export type Trade = {
  tradeDate: string;
  settlementDate: string;
  code: string;
  name: string;
  market: string;
  side: TradeSide;
  quantity: number;
  price: number;
  grossAmount: number;
  currency?: Currency;
};

export type Holding = {
  id: string;
  code: string;
  name: string;
  market: string;
  quantity: number;
  averageCost: number;
  costBasis: number;
  realizedPnl: number;
  currency?: Currency;
  costBasisWarning?: string;
};

export type QuoteStatus = "live-ish" | "delayed" | "stale" | "manual" | "missing";

export type Quote = {
  code: string;
  market: string;
  price: number | null;
  currency: Currency;
  asOf: string | null;
  source: string;
  status: QuoteStatus;
  message?: string;
  fxRateToJpy?: number;
};

export type PricedHolding = Holding & {
  latestPrice: number | null;
  marketValue: number;
  unrealizedPnl: number;
  allocation: number;
  quote: Quote;
};

export type PortfolioSnapshot = {
  date: string;
  cash: number;
  holdingsValue: number;
  nav: number; // AUM = cash + holdingsValue
  navTotalReturn: number; // nav + cumulative added-back dividends
  units: number;
  unitNav: number; // navTotalReturn / units (total-return unit price)
};

export type BenchmarkPoint = {
  date: string;
  value: number;
  normalized: number;
  source: string;
};

export type NormalizedPerformancePoint = {
  date: string;
  portfolio: number | null;
  topix: number | null;
  nikkei225: number | null;
};

export type QuarterlyReturn = {
  quarter: string;
  portfolioReturn: number | null;
  topixReturn: number | null;
  nikkei225Return: number | null;
  vsTopix: number | null;
  vsNikkei225: number | null;
  dividendContribution: number | null;
};

export type CashFlowKind = "contribution" | "withdrawal" | "income";

export type CashFlow = {
  date: string;
  kind: CashFlowKind;
  category: string;
  description: string;
  amount: number;
};

export type ExternalDividend = { date: string; amount: number; code?: string; note?: string };

export type DividendState = "confirmed" | "estimated" | "unavailable";

export type DividendSummary = {
  state: DividendState;
  yearToDate: number;
  byQuarter: Record<string, number>;
  message: string;
};
