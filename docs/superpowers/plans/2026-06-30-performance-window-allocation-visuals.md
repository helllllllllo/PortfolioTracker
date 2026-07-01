# Performance Window, Allocation Ranking, and Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the portfolio from January 2026 onward, rank allocation by current value, and make the performance panel more informative.

**Architecture:** Add a shared fund start-date constant, apply it inside portfolio history/chart shaping, sort allocation slices before weight calculation output, and keep performance analytics local to the performance component. The app data flow remains CSV/import state -> portfolio state -> snapshots/chart/allocation -> React panels.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Recharts.

## Global Constraints

- Fund start date is exactly `2026-01-01`.
- Allocation is ranked by current market value descending, including cash.
- Performance visualization must compare Portfolio, TOPIX, and Nikkei 225.
- No paid APIs.
- No Chrome automation.
- Keep existing manual cash and 6846 名証 behavior intact.
- This workspace is not a git repository, so commit steps are replaced by verification checkpoints.

---

### Task 1: Fund Start Date Clamp

**Files:**
- Create: `src/portfolio/constants.ts`
- Modify: `src/portfolio/history.ts`
- Test: `src/portfolio/history.test.ts`

**Interfaces:**
- Produces: `FUND_TRACKING_START_DATE: "2026-01-01"`
- Consumes: `buildHistoricalSnapshots(...)`, `buildPerformanceChartData(...)`

- [ ] **Step 1: Write failing tests**

Add one test proving `buildHistoricalSnapshots` excludes history rows before `2026-01-01`, and one test proving `buildPerformanceChartData` excludes benchmark-only rows before `2026-01-01`.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/portfolio/history.test.ts`
Expected: FAIL because pre-2026 dates are still included.

- [ ] **Step 3: Implement minimal code**

Create the constant and filter history/chart dates with `date >= FUND_TRACKING_START_DATE`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/portfolio/history.test.ts`
Expected: PASS.

### Task 2: Allocation Ranking

**Files:**
- Modify: `src/portfolio/allocation.ts`
- Test: `src/portfolio/allocation.test.ts`

**Interfaces:**
- Consumes: `buildAllocationSlices(holdings, cash)`
- Produces: slices sorted by `value` descending before rendering.

- [ ] **Step 1: Write failing test**

Add a test with small, medium, large holdings and cash; assert output labels are ordered by descending `value`.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/portfolio/allocation.test.ts`
Expected: FAIL because output currently follows input order.

- [ ] **Step 3: Implement minimal code**

Sort `rawSlices` by `value` descending before mapping weights.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/portfolio/allocation.test.ts`
Expected: PASS.

### Task 3: Performance Analytics Visuals

**Files:**
- Modify: `src/components/PerformanceChart.tsx`
- Modify: `src/styles.css`
- Test: `src/components/PerformanceChart.test.tsx`

**Interfaces:**
- Consumes: `NormalizedPerformancePoint[]`
- Produces: rendered analytics for latest rebased values, excess versus benchmarks, and best/worst visible portfolio day.

- [ ] **Step 1: Write failing component test**

Render `PerformanceChart` with three dates and assert the panel shows `Latest`, `Excess vs TOPIX`, `Excess vs Nikkei`, `Best day`, and `Worst day`.

- [ ] **Step 2: Run focused test to verify RED**

Run: `npm test -- src/components/PerformanceChart.test.tsx`
Expected: FAIL because analytics cards do not exist yet.

- [ ] **Step 3: Implement minimal component and CSS**

Add small pure helpers inside `PerformanceChart.tsx` to compute latest values, excess returns, and day-to-day portfolio moves from visible data. Render compact cards below the chart and style them with the existing cockpit visual system.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `npm test -- src/components/PerformanceChart.test.tsx`
Expected: PASS.

### Task 4: Full Verification

**Files:**
- All modified files.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified dashboard.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: build passes. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 3: Confirm dev server**

Run: `curl -I --max-time 2 http://127.0.0.1:5173/`
Expected: HTTP 200 from Vite.
