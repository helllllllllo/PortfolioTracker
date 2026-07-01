# Hiroshi Capital — Correct Fund Accounting + Report-Grade Visuals

**Date:** 2026-07-02
**Status:** Draft for review
**Author:** Fund-manager review + engineering design

## 1. Context

Portfolio Visualization is the internal platform for **Hiroshi Capital**, a Japanese
long-only equity fund. It ingests an SBI 約定履歴 (execution) CSV, marks positions
against Yahoo Finance, and renders a performance-vs-benchmark chart, an allocation
donut, holdings, and dividend/quarterly panels. The output is meant to drop directly
into a **quarterly investor report** (return curve vs Nikkei & TOPIX, correct return
numbers, allocation pie).

Two data files describe the fund:

- **Trades** — `SaveFile_000001_000090.csv` (SBI 約定履歴, Shift-JIS). 90 rows:
  72 buys + 18 sells, 17 distinct securities, 2026-01-26 → 2026-06-17.
- **Cash flows** — `DetailInquiry_*.csv` (SBI 円貨入出金明細, UTF-8 BOM). The fund's
  real external capital: **18 wire contributions = ¥52,300,000** (2026-01-08 → 07-01),
  **¥5,470 stock-lending interest** (貸株金利), **zero withdrawals**.

Dividends (¥119,511 YTD, all received 2026-06-05 → 06-29) are paid to a **separate
account** and are **not** in either CSV; they are entered manually today and will
become their own CSV later.

## 2. Problems found in the current accounting

Ranked by materiality:

1. **Capital-timing distortion (critical).** `history.ts` / `nav.ts` set
   `inferredInitialCash = Σ(all buys)` and treat that full amount as day-one cash,
   converting cash→holdings as trades occur. Effect: the fund really held ~¥1.6M of
   stock in January (2.6% of eventual capital) but returns are measured against a
   ¥62.1M base — early performance is diluted ~40× and the whole curve vs TOPIX/Nikkei
   is understated and misshapen. Deployment was progressive: 2.6% (Jan) → 14% (Feb) →
   47% (Mar) → 72% (Apr) → 97.5% (May) → 100% (Jun).
2. **Gross-buys overstate the capital base (critical).** Σ(buys) = ¥62.1M includes
   rebuys funded by the 18 sells; true contributed capital is ¥52.3M. ~¥10M (19%)
   overstatement, compounding problem #1.
3. **Mixed benchmark bases.** TOPIX is a *price* index (`^TOPX` → 1308.T close);
   Nikkei is *net total return*; the portfolio is price + a lumped dividend. Three
   different return definitions on one chart.
4. **Dividends lumped at the newest point.** `applyInternalIncomeToSnapshot` adds the
   whole ¥119,511 at the final snapshot, so it lands in whatever quarter is last, not
   when earned. `quarterlyReturns.dividendContribution` is hard-coded `null` (dead).
5. **Final-cash discontinuity.** Recycled sell-proceeds (~¥13M inferred cash) are
   carried through the historical curve but dropped at the final point unless the user
   types a manual cash balance — an artificial end-of-line jump.
6. **Latent venue double-listing.** Holdings key on `code::canonicalMarket`, and
   名証 canonicalizes separately from 東証/PTS, so a stock bought on both venues would
   split into two rows. Not triggered today (only 6846 is 名証, no overlap) but fragile.

**What is already correct and kept:** unitized NAV concept; split handling consistent
with Yahoo adjusted prices (378A 2:1); moving-average cost & realized P&L; clean
zero-commission data (`price×qty` ties out); Nikkei Net-TR sourcing.

## 3. Goals / Non-goals

**Goals**
- Accounting-correct, GIPS-style **time-weighted return (TWR)** using real dated cash
  flows, plus **money-weighted return (IRR/XIRR)**.
- **Total-return vs total-return** benchmark comparison (portfolio incl. dividends vs
  TOPIX TR vs Nikkei TR), rebased to 100 at inception.
- Dividends **added back** to total return in the quarter earned; **AUM/NAV** reported
  as what is actually in the fund.
- **Period toggle:** Since inception (default) / YTD / QTD / MTD.
- **Report-grade light "tearsheet" charts** with **PNG download** (per-chart + a
  composed quarterly tearsheet).
- Cash-flow CSV and (future) dividend CSV are **uploadable** and persisted.
- Remove the Schwab/US path entirely (JP/JPY only).

**Non-goals (deferred, flagged in-app):** sector/industry allocation, drawdown/vol/
Sharpe, persisted daily-NAV store, tax-lot/tax reporting, multi-account consolidation.

## 4. Data model changes (`src/types.ts`)

```ts
// NEW
export type CashFlowKind = "contribution" | "withdrawal" | "income";
export type CashFlow = {
  date: string;            // YYYY-MM-DD
  kind: CashFlowKind;
  category: string;        // e.g. 金融機関からの入金, 貸株, 配当金
  description: string;     // 摘要
  amount: number;          // positive JPY
};

export type ExternalDividend = { date: string; amount: number; code?: string; note?: string };

// Snapshot gains a total-return leg
export type PortfolioSnapshot = {
  date: string; cash: number; holdingsValue: number;
  nav: number;             // AUM = cash + holdingsValue (what's actually in the fund)
  navTotalReturn: number;  // nav + cumulative added-back external income
  units: number;
  unitNav: number;         // navTotalReturn / units  (total-return unit price)
};
```

**Removed:** `Currency`/USD usage, `PortfolioSource`, Schwab types & parser,
`benchmarkMode: "us"`, US benchmark fetch, `baseCurrencyForSource`, `inferPortfolioSource`,
schwab branches in `defaultStartDateForSource`. Currency is JPY throughout.

## 5. Accounting engine (new `src/portfolio/fundAccounting.ts`)

Single chronological pass building a **daily** snapshot series from inception
(earliest of first contribution / first trade — here 2026-01-08) to as-of (latest
quote / today). Events per day are applied in this order:

State: `cash`, `positions` (qty + cost basis + realized per code), `units`,
`cumulativeAddBackIncome` (dividends paid out, for TR).

1. **Mark** holdings at day `d` (history close; the latest day uses live quotes).
2. Compute **pre-flow** `navTR = holdings + cash + cumulativeAddBackIncome` and
   **pre-flow unit price** `p = units === 0 ? 100 : navTR / units`.
3. **Contributions** on `d`: `units += amount / p; cash += amount`. (Units issued at
   pre-flow price ⇒ contribution does not move the unit price.)
4. **Withdrawals** on `d`: `units -= amount / p; cash -= amount`.
5. **Trades** on `d`: buys `cash -= gross`, sells `cash += gross`; update qty, cost
   basis (moving average), realized P&L. (No effect on units.)
6. **Lending interest** on `d`: `cash += amount`. Raises NAV and TR; issues no units.
7. **External dividends** (add-back) on `d`: `cumulativeAddBackIncome += amount`.
   Raises TR only (not cash — it was paid out); issues no units.
8. **Record** snapshot: `nav = holdings + cash`, `navTotalReturn = nav +
   cumulativeAddBackIncome`, `unitNav = navTotalReturn / units`.

**Unit-price base = 100** at inception (first contribution issues `amount/100` units).

### Returns
- **TWR(period)** = `unitNav(periodEnd) / unitNav(periodStart) − 1`, where
  `periodStart` is the last snapshot on/before the window start. Since-inception uses
  base 100. Windows: inception / YTD / QTD / MTD.
- **IRR (XIRR, annualized)** over dated flows: contributions = −amount, withdrawals =
  +amount, paid-out dividends = +amount, terminal = +current NAV. Solved by bisection/
  Newton on the actual-date discount function.

### Invariants (become unit tests)
- A pure contribution on day `d` leaves `unitNav(d)` unchanged vs pre-flow (timing
  invariance).
- Two funds with identical trades/prices but different contribution *timing* produce
  the **same** since-inception TWR.
- Adding an external dividend raises TWR but **not** reported NAV/AUM.
- Lending interest raises **both** NAV and TWR.
- Cash derived by the engine reconciles: `cash = Σcontrib − Σbuys + Σsells +
  ΣlendingIncome − Σwithdrawals`.

## 6. Parsers (`src/data/`)

- **`parseSbiCashFlowCsv`** (new) for 円貨入出金明細: detect header row
  `入出金日,取引,区分,摘要,出金額,入金額` (UTF-8 BOM aware; reuse the SJIS/AUTO decode
  path). Map: 入金+`金融機関からの入金`/`振替入金` → contribution; 出金/`振替出金` →
  withdrawal; 入金+`貸株`/`配当`/`分配`/`利子` → income. Amount = 入金額 or 出金額.
- **`parseDividendCsv`** (new, tolerant) for the future dividend export: `{date, amount}`
  rows. Until it exists, dividends are seeded/edited in-app (see §8).
- **`parsePortfolioCsv`** router: auto-detect trade vs cash-flow vs dividend by header;
  drop the Schwab branch. Keep `parseSbiExecutionCsv` (unchanged except returned via
  router).

## 7. Benchmarks (total return)

- **TOPIX TR:** fetch **1306.T adjusted close** (Yahoo `adjclose` reinvests dividends ⇒
  TR proxy). Server `fetchYahooDailySeries` gains an `adjusted` mode returning
  `indicators.adjclose[0].adjclose`.
- **Nikkei 225 TR:** keep the official Nikkei 225 Net Total Return CSV.
- Both rebased to 100 at the fund inception date (first portfolio date ≥ inception).
- Portfolio line uses `unitNav` (already total return). Chart = TR vs TR vs TR.

## 8. UI / App changes

- **Two uploads** in the header: "Import trades" and "Import cash flows" (+ future
  "Import dividends"). Each persists to localStorage and is re-uploadable.
- **Period toggle** (segmented control): Since inception (default) / YTD / QTD / MTD —
  drives KPI calc, chart window, and benchmark rebasing.
- **KPI header** (report block): AUM (NAV), TWR (period + since-inception), IRR
  (annualized), Net contributions, Realized P&L, Unrealized P&L, Income (dividends +
  lending), Excess vs TOPIX, Excess vs Nikkei.
- **Dividends panel:** editable list (date, amount) seeded with the June ¥119,511;
  replaced by CSV import when available. Feeds add-back income.
- **Cash reconciliation:** engine-derived cash is primary; an optional "actual cash"
  field flags a mismatch (data-integrity check) instead of silently overriding.
- **Top contributors / detractors panel:** the names that added/subtracted most from
  the period's return (return attribution). No concentration flag — the user does not
  track concentration.
- Holdings **merged by security code** (aggregate 東証/名証/PTS venues into one row).

## 9. Report-grade charts + PNG (`src/components/`)

- **Light "tearsheet" theme** for the two report cards (white/cream card, dark ink,
  restrained institutional palette), designed to read well on screen *and* on paper.
- **PerformanceChart:** rebased-to-100 lines (portfolio, TOPIX TR, Nikkei TR), subtle
  excess-vs-primary shaded area, title block ("Hiroshi Capital — Performance"),
  subtitle ("Total return, rebased to 100 · as of YYYY-MM-DD"), stat strip
  (Since inception, vs TOPIX, vs Nikkei).
- **AllocationDonut:** top 8 holdings + grouped "Other", distinct categorical palette,
  legend with % and ¥, AUM in the center, title + as-of.
- **PNG export:** add `html-to-image` (`toPng`, `pixelRatio: 3`) on each card ref;
  filenames like `hiroshi-capital-performance-2026-06-30.png`. Plus a **"Download
  quarterly tearsheet"** capturing a composed light container (KPI header + both charts
  + as-of + a short methodology footnote). One new dependency (`html-to-image`,
  ~5KB gz). Alternative considered: hand-rolled SVG→canvas (no dep) — rejected for font/
  CSS fragility.

## 10. Removals (Schwab / US)

Delete `parseSchwabTransactionRows`, `SCHWAB_*`, US currency/benchmark code, and all
`source === "schwab"` branches. Simplify `App.tsx` state (no `portfolioSource`,
`baseCurrency`, `benchmarkMode`). Update/remove associated tests.

## 11. Testing (vitest, TDD)

New/updated tests: cash-flow parser (real DetailInquiry sample); dividend seeding;
`fundAccounting` engine + all §5 invariants; XIRR (against a known-answer case);
benchmark TR rebasing; venue-merge; period-window TWR (QTD/YTD/MTD boundaries);
PNG-export wiring smoke test (button → toPng called). Remove Schwab tests.

## 12. Risks / open items

- **TOPIX TR proxy** via 1306.T adjusted close is an ETF approximation (tracking error,
  ETF fees) rather than the official TOPIX Net TR index — acceptable and clearly
  labeled; can be upgraded if a free official series is found.
- **Dividend precision:** treated as June/Q2 income now; exact per-payment dates arrive
  with the future CSV.
- **Yahoo history re-adjusts on splits**, so the historical benchmark/holding series can
  shift after a corporate action; a persisted daily-NAV store (deferred) would harden
  this.
- No git repo yet — spec is written to disk but not committed; offer `git init`.

## 13. Rough implementation sequence

1. Remove Schwab/US; simplify types & App to JPY-only (green build + tests).
2. Cash-flow parser + upload wiring + persistence.
3. `fundAccounting` engine (TWR + units + add-back) with invariant tests; replace
   `history.ts`/`nav.ts` inferred-cash path.
4. XIRR + KPI header; period toggle.
5. Benchmarks → total return (adjusted close) + rebasing.
6. Light tearsheet charts (performance + allocation) + top contributors/detractors.
7. PNG export (per-chart + composed tearsheet).
8. Full test pass + manual verification against the two real CSVs.
