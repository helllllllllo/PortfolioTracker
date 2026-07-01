# Adjustable Start Date, USD Schwab Mode, and S&P 500 Benchmark Design

## Goal

The dashboard should let the user choose the performance start date, display Schwab portfolios in USD, and compare Schwab portfolios with the S&P 500 instead of Japanese benchmarks.

## Decisions

- The tracking start date is editable through a date input and persisted in `localStorage`.
- Default start date depends on import source:
  - SBI/Japan imports default to `2026-01-01`.
  - Schwab/US imports default to the earliest trade date in the imported CSV.
- The selected start date filters historical portfolio snapshots and benchmark series.
- Schwab portfolios use `USD` as the app base currency.
- SBI portfolios use `JPY` as the app base currency.
- US quotes and histories stay in USD when the base currency is USD.
- Japanese quotes and histories stay in JPY when the base currency is JPY.
- Schwab benchmark mode uses Yahoo `^GSPC` and displays it as `S&P 500`.
- Japan benchmark mode continues to use TOPIX and Nikkei 225.

## Scope

- Keep one active imported CSV at a time.
- Keep existing SBI behavior intact.
- Do not add paid data APIs.
- Do not use Chrome automation.
- Dividend rows imported from Schwab may be summarized in USD.

## Verification

- Tests cover adjustable start-date filtering.
- Tests cover Schwab default start-date selection.
- Tests cover USD display for Schwab holdings and summary.
- Tests cover S&P 500 benchmark requests and labels.
- Full test suite and production build must pass.
