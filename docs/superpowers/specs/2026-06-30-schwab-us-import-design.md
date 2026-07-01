# Schwab US Brokerage Import Design

## Goal

The dashboard should import the Schwab-style US transactions CSV alongside the existing SBI CSV format, show US holdings in the portfolio, and fetch free US quotes through the existing Yahoo-backed API.

## Decisions

- Detect Schwab CSVs by the header set `Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount`.
- Preserve existing SBI parsing.
- Represent Schwab securities with `market: "US"` and `currency: "USD"`.
- Use Yahoo US symbols directly, with a mapping for Schwab `BRKB` to Yahoo `BRK-B`.
- Convert US quote and history prices to JPY using free Yahoo `USDJPY=X` data before they enter the existing JPY dashboard surfaces.
- Preserve transferred-in US shares with zero cost basis and a warning rather than inventing unavailable cost basis.
- Parse dividends from Schwab rows for later dividend reporting, but prioritize holdings and current valuation in this first integration.

## Schwab Action Mapping

- `Buy`, `Reinvest Shares`, positive `Security Transfer`, and `Stock Split` add shares.
- `Sell`, `Cancel Buy`, negative `Security Transfer`, and `Full Redemption` remove shares.
- Positive `Reverse Split` resets that security's share quantity to the reported post-split quantity.
- Dividend-style rows are captured as dividend rows.
- Cash transfers, bank interest, tax rows, ADR fees, and rows without symbols do not create holdings.

## Risks

- Schwab exports do not always include true cost basis for transferred-in securities. The app should show those positions and flag the uncertainty instead of hiding them.
- Full historical USD performance requires historical FX conversion. Current quotes and holding histories will be converted with `USDJPY=X`; more detailed cash-flow FX attribution can be improved later.

## Verification

- Parser tests cover Schwab buy/sell/reinvestment/cancel/transfer/split rows.
- API client tests cover US Yahoo symbol mapping and USDJPY conversion.
- Portfolio valuation tests cover USD holdings converted into JPY market value.
- Full Vitest suite and production build must pass.
