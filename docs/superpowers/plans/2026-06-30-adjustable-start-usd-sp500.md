# Adjustable Start Date, USD Mode, and S&P 500 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make performance start date editable, display Schwab imports in USD, and use S&P 500 for Schwab benchmarks.

**Architecture:** Add base-currency and import-source state to App, parameterize history/chart builders by selected start date, parameterize display components by currency and benchmark labels, and extend the market API client with a benchmark mode. Keep existing fixed data shapes where possible to avoid a broad rewrite.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Recharts, Yahoo Finance-backed local API.

## Global Constraints

- SBI/Japan imports default to `2026-01-01`.
- Schwab/US imports default to the earliest transaction date in the imported CSV.
- Schwab dashboards display USD, not JPY.
- Schwab benchmark is S&P 500 via Yahoo `^GSPC`.
- Japan benchmark mode remains TOPIX and Nikkei 225.
- Start date is editable and persisted.
- No paid APIs.
- No Chrome automation.
- This workspace is not a git repository, so commit steps are replaced by verification checkpoints.

---

### Task 1: Start Date Parameterization

**Files:**
- Modify: `src/portfolio/history.ts`
- Modify: `src/portfolio/history.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `buildHistoricalSnapshots({ ..., startDate?: string })`
- `buildPerformanceChartData(portfolioSnapshots, topix, nikkei225, startDate?)`

- [ ] **Step 1: Write failing tests**

Add history tests showing a custom start date can include 2025 rows or exclude rows after a later chosen date. Add App tests for a visible `Track from` date input.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/portfolio/history.test.ts src/App.test.tsx`
Expected: FAIL because start date is fixed and no UI control exists.

- [ ] **Step 3: Implement minimal code**

Thread `startDate` through history/chart builders and App state. Persist to `portfolio:trackingStartDate`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/portfolio/history.test.ts src/App.test.tsx`
Expected: PASS.

### Task 2: USD Base Currency Display

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/SummaryStrip.tsx`
- Modify: `src/components/HoldingsTable.tsx`
- Modify: `src/components/AllocationPieChart.tsx`
- Modify: `src/components/DividendsPanel.tsx`
- Test: `src/App.test.tsx`
- Test: component tests if needed.

**Interfaces:**
- Components accept `currency: "JPY" | "USD"`.
- Schwab import sets base currency to USD.

- [ ] **Step 1: Write failing tests**

Add App test proving Schwab import shows `$` values and manual cash label `USD`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL because values and labels are JPY-only.

- [ ] **Step 3: Implement minimal code**

Add currency formatting helper, pass currency props, and keep US quote/history values in USD when base currency is USD.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/App.test.tsx`
Expected: PASS.

### Task 3: S&P 500 Benchmark Mode

**Files:**
- Modify: `src/market/apiClient.ts`
- Modify: `src/market/apiClient.test.ts`
- Modify: `src/components/PerformanceChart.tsx`
- Modify: `src/components/QuarterlyReturnsTable.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `fetchBenchmarks(range, mode)` where mode is `"japan"` or `"us"`.
- US mode requests `^GSPC` and labels the primary benchmark `S&P 500`.

- [ ] **Step 1: Write failing tests**

Add API client test for US benchmark request and App/component tests for S&P 500 labels.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/market/apiClient.test.ts src/App.test.tsx`
Expected: FAIL because benchmark mode and labels are fixed.

- [ ] **Step 3: Implement minimal code**

Add benchmark mode to `fetchBenchmarks`, pass labels to chart/table, and hide the secondary benchmark in US mode.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/market/apiClient.test.ts src/App.test.tsx`
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
Expected: HTTP 200. If it is not running, start `npm run dev`.
