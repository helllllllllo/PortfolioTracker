# Schwab US Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Schwab-style US transaction CSV support while preserving the existing SBI Japanese brokerage import.

**Architecture:** Add Schwab parsing beside the existing SBI parser, extend the trade/holding types with optional currency metadata, and make the quote API client map US holdings to Yahoo US symbols plus `USDJPY=X`. Keep the dashboard's displayed values in JPY by converting US quotes/history before pricing holdings.

**Tech Stack:** React, TypeScript, Vite, Vitest, Papa Parse, Express, Yahoo Finance chart endpoints.

## Global Constraints

- Existing SBI CSV imports must continue to work.
- Schwab CSV headers are `Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount`.
- US holdings use `market: "US"` and `currency: "USD"`.
- Base dashboard display remains JPY.
- US quote/history conversion uses free Yahoo `USDJPY=X`.
- Schwab `BRKB` maps to Yahoo `BRK-B`.
- No paid APIs.
- No Chrome automation.
- This workspace is not a git repository, so commit steps are replaced by verification checkpoints.

---

### Task 1: Schwab CSV Parser

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data/parseSbiCsv.ts`
- Test: `src/data/parseSbiCsv.test.ts`

**Interfaces:**
- Produces: `Currency = "JPY" | "USD"`.
- Produces: `Trade.currency?: Currency`.
- Produces: `parsePortfolioCsv(input): { source: "sbi" | "schwab"; trades: Trade[]; dividends: DividendRow[]; warnings: string[] }`.
- Preserves: `parseSbiExecutionCsv(input): Trade[]`.

- [ ] **Step 1: Write failing parser tests**

Add tests proving Schwab rows parse into US trades with `currency: "USD"`, `market: "US"`, cancel buys reverse buys, stock split adds zero-cost shares, and reverse split emits a split adjustment.

- [ ] **Step 2: Run parser tests to verify RED**

Run: `npm test -- src/data/parseSbiCsv.test.ts`
Expected: FAIL because `parsePortfolioCsv` and Schwab parsing do not exist.

- [ ] **Step 3: Implement parser**

Add header detection, Schwab date/money parsing, action mapping, and warnings for transferred-in zero-cost lots.

- [ ] **Step 4: Run parser tests to verify GREEN**

Run: `npm test -- src/data/parseSbiCsv.test.ts`
Expected: PASS.

### Task 2: US Quote and History Conversion

**Files:**
- Modify: `src/types.ts`
- Modify: `src/market/apiClient.ts`
- Modify: `src/market/quotes.ts`
- Test: `src/market/apiClient.test.ts`
- Test: `src/market/quotes.test.ts`

**Interfaces:**
- Produces: US symbol mapping inside `fetchQuotesForHoldings` and `fetchHistoryForHoldings`.
- Produces: JPY-converted US quote prices with `fxRateToJpy`.
- Produces: JPY fallback valuation for missing US quotes when FX is available.

- [ ] **Step 1: Write failing tests**

Add API client tests for `BRKB -> BRK-B`, extra `USDJPY=X`, and history conversion. Add quote pricing tests for USD average-cost fallback converted to JPY.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/market/apiClient.test.ts src/market/quotes.test.ts`
Expected: FAIL because US symbols and FX conversion are missing.

- [ ] **Step 3: Implement conversion**

Update symbol mapping, include `USDJPY=X` for US holdings, convert US quote/history rows to JPY, and use FX-aware fallback pricing.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/market/apiClient.test.ts src/market/quotes.test.ts`
Expected: PASS.

### Task 3: App Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/portfolio/positions.ts`
- Modify: `src/portfolio/history.ts`
- Test: `src/App.test.tsx`
- Test: `src/portfolio/positions.test.ts`

**Interfaces:**
- Consumes: `parsePortfolioCsv`.
- Produces: imported Schwab holdings visible in holdings/allocation after upload.
- Preserves: SBI import workflow and manual cash behavior.

- [ ] **Step 1: Write failing tests**

Add App tests proving a Schwab CSV import produces US holdings and quote refresh requests US quotes. Add position tests for split side handling.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/App.test.tsx src/portfolio/positions.test.ts`
Expected: FAIL because App still imports only SBI trades and split side is unsupported.

- [ ] **Step 3: Implement integration**

Use `parsePortfolioCsv` in App import handling, preserve existing storage compatibility, and handle `TradeSide: "split"` in position/history builders.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/App.test.tsx src/portfolio/positions.test.ts`
Expected: PASS.

### Task 4: Full Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: build passes. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 3: Confirm dev server**

Run: `curl -I --max-time 2 http://127.0.0.1:5173/`
Expected: HTTP 200. If not running, start `npm run dev`.
