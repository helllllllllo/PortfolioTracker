# Premium Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the existing portfolio dashboard into a premium, visually rich trading cockpit while preserving current portfolio calculations.

**Architecture:** Keep all data and calculation flows unchanged. Add lightweight presentational affordances in existing React components and replace the CSS visual system with a darker, higher-contrast dashboard shell.

**Tech Stack:** React, TypeScript, Recharts, lucide-react, Vitest, Testing Library, Vite.

## Global Constraints

- Do not create a landing page; the first screen remains the actual dashboard.
- Do not use Chrome automation.
- Keep cards at 8px radius or less.
- Preserve manual cash behavior, HIT split handling, and current quote APIs.
- Use existing dependencies only.

---

### Task 1: Cockpit Shell And Header

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/DashboardHeader.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `DashboardHeader` props.
- Produces: `main` with `market-cockpit` class and header with command-bar styling hooks.

- [ ] **Step 1: Write failing tests**

Add assertions in `src/App.test.tsx` that the app root has `market-cockpit`, the header exposes the text `Command center`, and the quote status remains visible.

- [ ] **Step 2: Run focused test**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL because those class/text affordances do not exist yet.

- [ ] **Step 3: Implement header structure**

Add `market-cockpit` to the app shell and add a `Command center` eyebrow plus richer action wrappers in `DashboardHeader`.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/App.test.tsx`
Expected: PASS.

### Task 2: Metric And Table Visual Affordances

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/components/SummaryStrip.tsx`
- Modify: `src/components/HoldingsTable.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing metric values and priced holdings.
- Produces: KPI cards with `metric-positive`, `metric-negative`, and quote status chips.

- [ ] **Step 1: Write failing tests**

Add tests that a positive daily change has `metric-positive`, a negative total return has `metric-negative`, and quote statuses are rendered as chip elements.

- [ ] **Step 2: Run focused test**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL because class affordances do not exist yet.

- [ ] **Step 3: Implement class affordances**

Add value-state class helpers in `SummaryStrip` and status chip markup in `HoldingsTable`.

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/App.test.tsx`
Expected: PASS.

### Task 3: Premium Visual System

**Files:**
- Modify: `src/components/PerformanceChart.tsx`
- Modify: `src/components/AllocationPieChart.tsx`
- Modify: `src/components/QuarterlyReturnsTable.tsx`
- Modify: `src/components/DividendsPanel.tsx`
- Replace: `src/styles.css`

**Interfaces:**
- Consumes: existing chart/allocation/table props.
- Produces: stronger panel headings, chart styling, allocation legend, dark cockpit shell, polished tables, and responsive layout.

- [ ] **Step 1: Update component class hooks**

Add panel heading wrappers and semantic classes for chart, allocation, returns, and dividend panels.

- [ ] **Step 2: Replace CSS**

Implement a dark premium shell with ink background, glassy panels, accent colors, high-contrast KPI tiles, table chips, and responsive constraints.

- [ ] **Step 3: Run all verification**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS, with only the existing Vite chunk-size warning acceptable.
