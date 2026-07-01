# Portfolio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local npm web app that imports an SBI execution-history CSV, reconstructs holdings and fund-style NAV performance, fetches free latest-available prices, and compares the portfolio with TOPIX and Nikkei 225.

**Architecture:** Use a Vite + React + TypeScript frontend with a small local Express API for quote/benchmark fetching so browser CORS does not block free public quote endpoints. Keep CSV parsing, portfolio accounting, NAV math, quote normalization, and UI components in separate modules with unit tests around the calculation boundaries.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, Express, Recharts, date-fns, encoding-japanese, papaparse, lucide-react.

## Global Constraints

- The imported CSV is the source of truth for trades until the user imports a newer CSV.
- The app must parse CP932/Shift-JIS SBI `約定履歴照会` CSV files.
- The app must preserve `6846 / 名証 / 中央製作所` in holdings, return calculations, allocation, and missing-data warnings.
- The parser preserves the raw SBI `市場` execution venue on each trade, but position aggregation uses canonical holding markets: `名証` remains `名証`; `東証`, `東証（外）`, and `PTS...` execution venues collapse to `東証`; unknown markets keep their raw text.
- The app must treat buys and sells as internal portfolio activity; sell proceeds remain inside portfolio cash.
- Portfolio performance must be measured by NAV/unit value, with initial unit price `100`.
- The app must compare normalized portfolio returns with TOPIX and Nikkei 225.
- The app must be free-first and must not require a paid data subscription.
- The UI must show quote freshness/status and must not silently drop missing/stale quote holdings.
- Dividends must show confirmed, estimated, or unavailable states; the current CSV does not contain dividends.
- This workspace is not a Git repository as of 2026-06-23. Skip commit steps unless Git is initialized before execution.

---

## File Structure

- Create `package.json`: npm scripts and dependencies.
- Create `index.html`: Vite entry.
- Create `vite.config.ts`: React plugin, test config, API proxy.
- Create `tsconfig.json`, `tsconfig.node.json`: TypeScript config.
- Create `vitest.setup.ts`: Testing Library setup.
- Create `server/index.ts`: Express API for quotes and benchmarks.
- Create `server/yahooFinance.ts`: Free public Yahoo chart endpoint adapter.
- Create `src/main.tsx`: React bootstrap.
- Create `src/App.tsx`: Dashboard state orchestration.
- Create `src/styles.css`: App layout and visual styling.
- Create `src/types.ts`: shared portfolio, quote, benchmark, and dividend types.
- Create `src/data/parseSbiCsv.ts`: decode and parse SBI CSV.
- Create `src/data/parseSbiCsv.test.ts`: parser tests.
- Create `src/portfolio/positions.ts`: aggregate trades into lots/holdings/cash.
- Create `src/portfolio/positions.test.ts`: position/cash tests.
- Create `src/portfolio/nav.ts`: daily NAV/unit return and quarterly return logic.
- Create `src/portfolio/nav.test.ts`: NAV tests.
- Create `src/market/apiClient.ts`: browser client for local Express API.
- Create `src/market/benchmarks.ts`: normalize benchmark series.
- Create `src/market/benchmarks.test.ts`: benchmark tests.
- Create `src/market/quotes.ts`: merge quotes with holdings and manual overrides.
- Create `src/market/quotes.test.ts`: missing quote and 名証 tests.
- Create `src/dividends/dividends.ts`: dividend state summaries.
- Create `src/dividends/dividends.test.ts`: dividend state tests.
- Create `src/components/DashboardHeader.tsx`: import/refresh controls.
- Create `src/components/SummaryStrip.tsx`: NAV and daily change KPIs.
- Create `src/components/PerformanceChart.tsx`: normalized return chart.
- Create `src/components/HoldingsTable.tsx`: holdings table.
- Create `src/components/QuarterlyReturnsTable.tsx`: quarter comparison table.
- Create `src/components/DividendsPanel.tsx`: dividend summary and empty state.
- Create `src/App.test.tsx`: dashboard integration smoke tests.

---

### Task 1: Project Scaffold and Test Harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.setup.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: none.
- Produces: `App` React component, `npm run dev`, `npm test`, `npm run build`.

- [ ] **Step 1: Create package and config files**

`package.json`:

```json
{
  "name": "portfolio-visualization",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "server": "tsx server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "cors": "latest",
    "date-fns": "latest",
    "encoding-japanese": "latest",
    "express": "latest",
    "lucide-react": "latest",
    "papaparse": "latest",
    "react": "latest",
    "react-dom": "latest",
    "recharts": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/express": "latest",
    "@types/node": "latest",
    "@types/papaparse": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "concurrently": "latest",
    "jsdom": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portfolio Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    globals: true
  }
});
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  }
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts", "server/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

`vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write the failing dashboard smoke test**

`src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the portfolio dashboard controls", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /portfolio dashboard/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/import sbi csv/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh quotes/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm install
npm test -- src/App.test.tsx
```

Expected: FAIL because `src/App.tsx` and `src/main.tsx` do not exist yet.

- [ ] **Step 4: Implement minimal app shell**

`src/App.tsx`:

```tsx
import "./styles.css";

export default function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Hiroshi Capital</p>
          <h1>Portfolio Dashboard</h1>
        </div>
        <div className="topbar-actions">
          <label className="file-button">
            Import SBI CSV
            <input aria-label="Import SBI CSV" type="file" accept=".csv,text/csv" />
          </label>
          <button type="button">Refresh quotes</button>
        </div>
      </header>
      <section className="empty-state">
        <h2>Import your latest SBI execution history</h2>
        <p>The imported CSV becomes the local portfolio ledger until you replace it.</p>
      </section>
    </main>
  );
}
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/styles.css`:

```css
:root {
  color: #111827;
  background: #f7f8fa;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
.file-button {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #111827;
  border-radius: 8px;
  padding: 10px 14px;
  font: inherit;
  cursor: pointer;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.topbar h1 {
  margin: 4px 0 0;
  font-size: 28px;
  line-height: 1.2;
}

.eyebrow {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.topbar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.file-button input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.empty-state {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 8px;
  padding: 28px;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit or record checkpoint**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in current workspace: command exits nonzero. Record "Task 1 complete; Git unavailable, commit skipped."

---

### Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Consumes: none.
- Produces: `Trade`, `Holding`, `Quote`, `PortfolioSnapshot`, `BenchmarkPoint`, `QuarterlyReturn`, `DividendSummary`.

- [ ] **Step 1: Write compile-facing type import test**

Create `src/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Quote, Trade } from "./types";

describe("shared portfolio types", () => {
  it("supports SBI trades and quote statuses", () => {
    const trade: Trade = {
      tradeDate: "2026-06-17",
      settlementDate: "2026-06-19",
      code: "6846",
      name: "中央製作所",
      market: "名証",
      side: "buy",
      quantity: 100,
      price: 1355,
      grossAmount: 135500
    };
    const quote: Quote = {
      code: "6846",
      market: "名証",
      price: null,
      currency: "JPY",
      asOf: null,
      source: "manual",
      status: "missing",
      message: "No free quote found"
    };

    expect(trade.code).toBe("6846");
    expect(quote.status).toBe("missing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/types.test.ts
```

Expected: FAIL because `src/types.ts` does not exist.

- [ ] **Step 3: Implement shared types**

`src/types.ts`:

```ts
export type TradeSide = "buy" | "sell";

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
};

export type QuoteStatus = "live-ish" | "delayed" | "stale" | "manual" | "missing";

export type Quote = {
  code: string;
  market: string;
  price: number | null;
  currency: "JPY";
  asOf: string | null;
  source: string;
  status: QuoteStatus;
  message?: string;
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
  nav: number;
  units: number;
  unitNav: number;
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

export type DividendState = "confirmed" | "estimated" | "unavailable";

export type DividendSummary = {
  state: DividendState;
  yearToDate: number;
  byQuarter: Record<string, number>;
  message: string;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit or record checkpoint**

Record "Task 2 complete; Git unavailable, commit skipped."

---

### Task 3: SBI CSV Parser

**Files:**
- Create: `src/data/parseSbiCsv.ts`
- Create: `src/data/parseSbiCsv.test.ts`

**Interfaces:**
- Consumes: `Trade` from `src/types.ts`.
- Produces: `parseSbiExecutionCsv(input: ArrayBuffer | string): Trade[]`.

- [ ] **Step 1: Write failing parser tests**

`src/data/parseSbiCsv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSbiExecutionCsv } from "./parseSbiCsv";

const csvText = `
約定履歴照会

商品指定,約定開始年月日,約定終了年月日,明細数,明細指定開始,明細指定終了
"すべての商品","2026年01月01日","2026年06月23日","2","1","2"

約定日,銘柄,銘柄コード,市場,取引,期限,預り,課税,約定数量,約定単価,手数料/諸経費等,税額,受渡日,受渡金額/決済損益
"2026/06/17","中央製作所","6846","名証",株式現物買,"--"," 一般 ","--",100,1355,--,--,"2026/06/19",135500
"2026/06/15","ジャフコ　グループ","8595","PTS（X）",株式現物売,"--"," 一般 ","--",100,2239.4,--,--,"2026/06/17",223940
`;

describe("parseSbiExecutionCsv", () => {
  it("parses SBI execution rows and preserves Nagoya exchange holdings", () => {
    const trades = parseSbiExecutionCsv(csvText);

    expect(trades).toHaveLength(2);
    expect(trades[0]).toEqual({
      tradeDate: "2026-06-17",
      settlementDate: "2026-06-19",
      code: "6846",
      name: "中央製作所",
      market: "名証",
      side: "buy",
      quantity: 100,
      price: 1355,
      grossAmount: 135500
    });
    expect(trades[1].side).toBe("sell");
  });

  it("throws a useful error when required SBI headers are missing", () => {
    expect(() => parseSbiExecutionCsv("date,name\\n2026-01-01,test")).toThrow(
      /required SBI header/i
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/data/parseSbiCsv.test.ts
```

Expected: FAIL because `parseSbiCsv.ts` does not exist.

- [ ] **Step 3: Implement parser**

`src/data/parseSbiCsv.ts`:

```ts
import Encoding from "encoding-japanese";
import Papa from "papaparse";
import type { Trade, TradeSide } from "../types";

const REQUIRED_HEADERS = [
  "約定日",
  "銘柄",
  "銘柄コード",
  "市場",
  "取引",
  "約定数量",
  "約定単価",
  "受渡日",
  "受渡金額/決済損益"
];

function normalizeDate(value: string): string {
  return value.trim().replaceAll("/", "-");
}

function cleanNumber(value: string): number {
  const cleaned = String(value).replaceAll(",", "").replace("+", "").trim();
  if (cleaned === "" || cleaned === "--") return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return parsed;
}

function decodeInput(input: ArrayBuffer | string): string {
  if (typeof input === "string") return input;
  const bytes = new Uint8Array(input);
  return Encoding.convert(bytes, {
    to: "UNICODE",
    from: "SJIS",
    type: "string"
  });
}

function tradeSide(raw: string): TradeSide | null {
  if (raw.includes("買")) return "buy";
  if (raw.includes("売")) return "sell";
  return null;
}

export function parseSbiExecutionCsv(input: ArrayBuffer | string): Trade[] {
  const text = decodeInput(input);
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  const rows = parsed.data;
  const headerIndex = rows.findIndex((row) => row.includes("約定日") && row.includes("銘柄コード"));

  if (headerIndex < 0) {
    throw new Error(`Missing required SBI header: ${REQUIRED_HEADERS.join(", ")}`);
  }

  const headers = rows[headerIndex].map((header) => header.trim());
  const index = new Map(headers.map((header, i) => [header, i]));
  const missing = REQUIRED_HEADERS.filter((header) => !index.has(header));

  if (missing.length > 0) {
    throw new Error(`Missing required SBI header: ${missing.join(", ")}`);
  }

  const trades: Trade[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const tradeDate = row[index.get("約定日") ?? -1]?.trim();
    if (!tradeDate) continue;

    const side = tradeSide(row[index.get("取引") ?? -1] ?? "");
    if (!side) continue;

    trades.push({
      tradeDate: normalizeDate(tradeDate),
      settlementDate: normalizeDate(row[index.get("受渡日") ?? -1] ?? ""),
      code: (row[index.get("銘柄コード") ?? -1] ?? "").trim(),
      name: (row[index.get("銘柄") ?? -1] ?? "").trim(),
      market: (row[index.get("市場") ?? -1] ?? "").trim(),
      side,
      quantity: cleanNumber(row[index.get("約定数量") ?? -1] ?? "0"),
      price: cleanNumber(row[index.get("約定単価") ?? -1] ?? "0"),
      grossAmount: cleanNumber(row[index.get("受渡金額/決済損益") ?? -1] ?? "0")
    });
  }

  return trades;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/data/parseSbiCsv.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit or record checkpoint**

Record "Task 3 complete; Git unavailable, commit skipped."

---

### Task 4: Position and Cash Aggregation

**Files:**
- Create: `src/portfolio/positions.ts`
- Create: `src/portfolio/positions.test.ts`

**Interfaces:**
- Consumes: `Trade`, `Holding`.
- Produces: `buildPortfolioState(trades: Trade[]): { holdings: Holding[]; cash: number; inferredInitialCash: number; warnings: string[] }`.

- [ ] **Step 1: Write failing aggregation tests**

`src/portfolio/positions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Trade } from "../types";
import { buildPortfolioState } from "./positions";

const trades: Trade[] = [
  {
    tradeDate: "2026-06-01",
    settlementDate: "2026-06-03",
    code: "7974",
    name: "任天堂",
    market: "東証",
    side: "buy",
    quantity: 100,
    price: 7000,
    grossAmount: 700000
  },
  {
    tradeDate: "2026-06-10",
    settlementDate: "2026-06-12",
    code: "7974",
    name: "任天堂",
    market: "東証",
    side: "sell",
    quantity: 40,
    price: 7500,
    grossAmount: 300000
  },
  {
    tradeDate: "2026-06-17",
    settlementDate: "2026-06-19",
    code: "6846",
    name: "中央製作所",
    market: "名証",
    side: "buy",
    quantity: 100,
    price: 1355,
    grossAmount: 135500
  }
];

describe("buildPortfolioState", () => {
  it("keeps sell proceeds as portfolio cash and preserves Nagoya holdings", () => {
    const state = buildPortfolioState(trades);

    expect(state.inferredInitialCash).toBe(835500);
    expect(state.cash).toBe(300000);
    expect(state.holdings).toEqual([
      expect.objectContaining({
        id: "6846::名証",
        code: "6846",
        market: "名証",
        quantity: 100,
        averageCost: 1355
      }),
      expect.objectContaining({
        id: "7974::東証",
        quantity: 60,
        averageCost: 7000,
        realizedPnl: 20000
      })
    ]);
  });

  it("reconciles Tokyo-listed trades across PTS and TSE execution venues", () => {
    const state = buildPortfolioState([
      {
        tradeDate: "2026-01-29",
        settlementDate: "2026-02-02",
        code: "4689",
        name: "ＬＩＮＥヤフー",
        market: "PTS（X）",
        side: "buy",
        quantity: 200,
        price: 393.6,
        grossAmount: 78720
      },
      {
        tradeDate: "2026-04-13",
        settlementDate: "2026-04-15",
        code: "4689",
        name: "ＬＩＮＥヤフー",
        market: "東証",
        side: "sell",
        quantity: 200,
        price: 405.5,
        grossAmount: 81100
      }
    ]);

    expect(state.holdings).toEqual([]);
    expect(state.cash).toBe(81100);
    expect(state.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/portfolio/positions.test.ts
```

Expected: FAIL because `positions.ts` does not exist.

- [ ] **Step 3: Implement position aggregation**

`src/portfolio/positions.ts`:

```ts
import type { Holding, Trade } from "../types";

type MutableHolding = Holding;

function holdingId(code: string, market: string): string {
  return `${code}::${market}`;
}

function canonicalHoldingMarket(rawMarket: string): string {
  if (rawMarket.includes("名証")) return "名証";
  if (rawMarket.includes("東証") || rawMarket.startsWith("PTS")) return "東証";
  return rawMarket;
}

export function buildPortfolioState(trades: Trade[]): {
  holdings: Holding[];
  cash: number;
  inferredInitialCash: number;
  warnings: string[];
} {
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const totalBuyAmount = sorted
    .filter((trade) => trade.side === "buy")
    .reduce((sum, trade) => sum + trade.grossAmount, 0);
  const byId = new Map<string, MutableHolding>();
  const warnings: string[] = [];
  let cash = totalBuyAmount;

  for (const trade of sorted) {
    const market = canonicalHoldingMarket(trade.market);
    const id = holdingId(trade.code, market);
    const holding = byId.get(id) ?? {
      id,
      code: trade.code,
      name: trade.name,
      market,
      quantity: 0,
      averageCost: 0,
      costBasis: 0,
      realizedPnl: 0
    };

    if (trade.side === "buy") {
      cash -= trade.grossAmount;
      holding.costBasis += trade.grossAmount;
      holding.quantity += trade.quantity;
      holding.averageCost = holding.quantity === 0 ? 0 : holding.costBasis / holding.quantity;
    } else {
      if (trade.quantity > holding.quantity) {
        warnings.push(`${trade.code} ${trade.name}: sell quantity exceeds current holding`);
      }
      const quantitySold = Math.min(trade.quantity, holding.quantity);
      const removedCost = holding.averageCost * quantitySold;
      holding.quantity -= quantitySold;
      holding.costBasis -= removedCost;
      holding.realizedPnl += trade.grossAmount - removedCost;
      holding.averageCost = holding.quantity === 0 ? 0 : holding.costBasis / holding.quantity;
      cash += trade.grossAmount;
    }

    byId.set(id, holding);
  }

  const holdings = Array.from(byId.values())
    .filter((holding) => holding.quantity > 0)
    .sort((a, b) => a.code.localeCompare(b.code, "ja"));

  return {
    holdings,
    cash,
    inferredInitialCash: totalBuyAmount,
    warnings
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/portfolio/positions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit or record checkpoint**

Record "Task 4 complete; Git unavailable, commit skipped."

---

### Task 5: NAV and Quarterly Returns

**Files:**
- Create: `src/portfolio/nav.ts`
- Create: `src/portfolio/nav.test.ts`

**Interfaces:**
- Consumes: `Trade`, `Quote`, `PortfolioSnapshot`, `QuarterlyReturn`.
- Produces:
  - `buildCurrentSnapshot(params): PortfolioSnapshot`
  - `buildUnitReturnSeries(snapshots: PortfolioSnapshot[]): PortfolioSnapshot[]`
  - `quarterlyReturns(portfolio, topix, nikkei225): QuarterlyReturn[]`

- [ ] **Step 1: Write failing NAV tests**

`src/portfolio/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BenchmarkPoint, PortfolioSnapshot } from "../types";
import { buildCurrentSnapshot, quarterlyReturns } from "./nav";

describe("NAV calculations", () => {
  it("uses cash plus holding value and keeps initial unit NAV at 100", () => {
    const snapshot = buildCurrentSnapshot({
      date: "2026-06-23",
      cash: 300000,
      holdingsValue: 555500,
      inferredInitialCash: 835500
    });

    expect(snapshot.nav).toBe(855500);
    expect(snapshot.units).toBe(8355);
    expect(snapshot.unitNav).toBeCloseTo(102.3938, 4);
  });

  it("computes quarterly portfolio returns against benchmarks", () => {
    const portfolio: PortfolioSnapshot[] = [
      { date: "2026-03-31", cash: 0, holdingsValue: 0, nav: 1000, units: 10, unitNav: 100 },
      { date: "2026-04-01", cash: 0, holdingsValue: 0, nav: 1010, units: 10, unitNav: 101 },
      { date: "2026-06-30", cash: 0, holdingsValue: 0, nav: 1111, units: 10, unitNav: 111.1 }
    ];
    const topix: BenchmarkPoint[] = [
      { date: "2026-04-01", value: 2000, normalized: 100, source: "test" },
      { date: "2026-06-30", value: 2100, normalized: 105, source: "test" }
    ];
    const nikkei225: BenchmarkPoint[] = [
      { date: "2026-04-01", value: 40000, normalized: 100, source: "test" },
      { date: "2026-06-30", value: 42000, normalized: 105, source: "test" }
    ];

    expect(quarterlyReturns(portfolio, topix, nikkei225)).toEqual([
      {
        quarter: "2026 Q2",
        portfolioReturn: 0.1,
        topixReturn: 0.05,
        nikkei225Return: 0.05,
        vsTopix: 0.05,
        vsNikkei225: 0.05,
        dividendContribution: null
      }
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/portfolio/nav.test.ts
```

Expected: FAIL because `nav.ts` does not exist.

- [ ] **Step 3: Implement NAV logic**

`src/portfolio/nav.ts`:

```ts
import { format, parseISO } from "date-fns";
import type { BenchmarkPoint, PortfolioSnapshot, QuarterlyReturn } from "../types";

export function buildCurrentSnapshot(input: {
  date: string;
  cash: number;
  holdingsValue: number;
  inferredInitialCash: number;
}): PortfolioSnapshot {
  const units = input.inferredInitialCash / 100;
  const nav = input.cash + input.holdingsValue;

  return {
    date: input.date,
    cash: input.cash,
    holdingsValue: input.holdingsValue,
    nav,
    units,
    unitNav: units === 0 ? 100 : nav / units
  };
}

function quarterKey(date: string): string {
  const parsed = parseISO(date);
  const quarter = Math.floor(parsed.getMonth() / 3) + 1;
  return `${format(parsed, "yyyy")} Q${quarter}`;
}

function periodReturn<T>(
  rows: T[],
  getDate: (row: T) => string,
  getValue: (row: T) => number,
  quarter: string
): number | null {
  const inQuarter = rows.filter((row) => quarterKey(getDate(row)) === quarter);
  if (inQuarter.length < 2) return null;
  const first = inQuarter[0];
  const last = inQuarter[inQuarter.length - 1];
  const start = getValue(first);
  const end = getValue(last);
  return start === 0 ? null : end / start - 1;
}

export function quarterlyReturns(
  portfolio: PortfolioSnapshot[],
  topix: BenchmarkPoint[],
  nikkei225: BenchmarkPoint[]
): QuarterlyReturn[] {
  const quarters = Array.from(new Set(portfolio.map((row) => quarterKey(row.date)))).sort();

  return quarters
    .map((quarter) => {
      const portfolioReturn = periodReturn(portfolio, (row) => row.date, (row) => row.unitNav, quarter);
      const topixReturn = periodReturn(topix, (row) => row.date, (row) => row.normalized, quarter);
      const nikkei225Return = periodReturn(nikkei225, (row) => row.date, (row) => row.normalized, quarter);

      return {
        quarter,
        portfolioReturn,
        topixReturn,
        nikkei225Return,
        vsTopix:
          portfolioReturn === null || topixReturn === null ? null : portfolioReturn - topixReturn,
        vsNikkei225:
          portfolioReturn === null || nikkei225Return === null ? null : portfolioReturn - nikkei225Return,
        dividendContribution: null
      };
    })
    .filter((row) => row.portfolioReturn !== null || row.topixReturn !== null || row.nikkei225Return !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/portfolio/nav.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit or record checkpoint**

Record "Task 5 complete; Git unavailable, commit skipped."

---

### Task 6: Quotes, Benchmarks, and Manual Fallback

**Files:**
- Create: `server/index.ts`
- Create: `server/yahooFinance.ts`
- Create: `src/market/apiClient.ts`
- Create: `src/market/quotes.ts`
- Create: `src/market/quotes.test.ts`
- Create: `src/market/benchmarks.ts`
- Create: `src/market/benchmarks.test.ts`

**Interfaces:**
- Consumes: `Holding`, `Quote`, `BenchmarkPoint`.
- Produces:
  - `GET /api/quotes?symbols=7974.T,6846.NAG`
  - `GET /api/benchmarks?symbols=^TOPX,^N225&range=1y`
  - `priceHoldings(holdings, quotes, manualOverrides): PricedHolding[]`
  - `normalizeBenchmark(points, source): BenchmarkPoint[]`

- [ ] **Step 1: Write failing quote tests**

`src/market/quotes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Holding, Quote } from "../types";
import { priceHoldings } from "./quotes";

const holdings: Holding[] = [
  {
    id: "6846::名証",
    code: "6846",
    name: "中央製作所",
    market: "名証",
    quantity: 100,
    averageCost: 1355,
    costBasis: 135500,
    realizedPnl: 0
  }
];

describe("priceHoldings", () => {
  it("keeps Nagoya holdings visible when a quote is missing", () => {
    const result = priceHoldings(holdings, [], {});

    expect(result[0]).toEqual(
      expect.objectContaining({
        code: "6846",
        market: "名証",
        latestPrice: null,
        marketValue: 135500,
        allocation: 1
      })
    );
    expect(result[0].quote.status).toBe("missing");
  });

  it("uses manual overrides for hard-to-track regional listings", () => {
    const result = priceHoldings(holdings, [], { "6846::名証": 1400 });

    expect(result[0].latestPrice).toBe(1400);
    expect(result[0].marketValue).toBe(140000);
    expect(result[0].quote.status).toBe("manual");
  });
});
```

`src/market/benchmarks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeBenchmark } from "./benchmarks";

describe("normalizeBenchmark", () => {
  it("normalizes benchmark values to 100 at the first point", () => {
    const normalized = normalizeBenchmark(
      [
        { date: "2026-01-01", value: 2000 },
        { date: "2026-01-02", value: 2200 }
      ],
      "test"
    );

    expect(normalized).toEqual([
      { date: "2026-01-01", value: 2000, normalized: 100, source: "test" },
      { date: "2026-01-02", value: 2200, normalized: 110, source: "test" }
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/market/quotes.test.ts src/market/benchmarks.test.ts
```

Expected: FAIL because `quotes.ts` and `benchmarks.ts` do not exist.

- [ ] **Step 3: Implement quote and benchmark client-side helpers**

`src/market/quotes.ts`:

```ts
import type { Holding, PricedHolding, Quote } from "../types";

type ManualOverrides = Record<string, number>;

function missingQuote(holding: Holding): Quote {
  return {
    code: holding.code,
    market: holding.market,
    price: null,
    currency: "JPY",
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
    currency: "JPY",
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
  const quoteById = new Map(quotes.map((quote) => [`${quote.code}::${quote.market}`, quote]));
  const priced = holdings.map((holding) => {
    const override = manualOverrides[holding.id];
    const quote = override !== undefined ? manualQuote(holding, override) : quoteById.get(holding.id) ?? missingQuote(holding);
    const latestPrice = quote.price;
    const marketValue = (latestPrice ?? holding.averageCost) * holding.quantity;
    const unrealizedPnl = marketValue - holding.costBasis;

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
```

`src/market/benchmarks.ts`:

```ts
import type { BenchmarkPoint } from "../types";

export function normalizeBenchmark(
  rows: Array<{ date: string; value: number }>,
  source: string
): BenchmarkPoint[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]?.value ?? 0;

  return sorted.map((row) => ({
    date: row.date,
    value: row.value,
    normalized: first === 0 ? 100 : (row.value / first) * 100,
    source
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/market/quotes.test.ts src/market/benchmarks.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement local quote API**

First update `package.json` so the final dev command runs both the local API and Vite:

```json
"dev": "concurrently -k \"tsx watch server/index.ts\" \"vite --host 127.0.0.1\""
```

`server/yahooFinance.ts`:

```ts
type YahooChartResult = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
        currency?: string;
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: { description?: string };
  };
};

export async function fetchYahooLatest(symbol: string): Promise<{
  symbol: string;
  price: number | null;
  asOf: string | null;
  source: string;
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  const response = await fetch(url, {
    headers: { "User-Agent": "portfolio-dashboard/0.1" }
  });

  if (!response.ok) {
    return { symbol, price: null, asOf: null, source: "Yahoo Finance" };
  }

  const json = (await response.json()) as YahooChartResult;
  const result = json.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice ?? null;
  const time = result?.meta?.regularMarketTime ?? null;

  return {
    symbol,
    price,
    asOf: time ? new Date(time * 1000).toISOString() : null,
    source: "Yahoo Finance"
  };
}

export async function fetchYahooDailySeries(symbol: string, range = "1y"): Promise<Array<{ date: string; value: number }>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "portfolio-dashboard/0.1" }
  });

  if (!response.ok) return [];

  const json = (await response.json()) as YahooChartResult;
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      value: closes[index] ?? 0
    }))
    .filter((row) => row.value > 0);
}
```

`server/index.ts`:

```ts
import cors from "cors";
import express from "express";
import { fetchYahooDailySeries, fetchYahooLatest } from "./yahooFinance";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/quotes", async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
  const quotes = await Promise.all(symbols.map((symbol) => fetchYahooLatest(symbol)));
  res.json({ quotes });
});

app.get("/api/benchmarks", async (req, res) => {
  const range = String(req.query.range ?? "1y");
  const [topix, nikkei225] = await Promise.all([
    fetchYahooDailySeries("^TOPX", range),
    fetchYahooDailySeries("^N225", range)
  ]);

  res.json({ topix, nikkei225 });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio API listening on http://127.0.0.1:${port}`);
});
```

`src/market/apiClient.ts`:

```ts
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
```

- [ ] **Step 6: Run API health check**

Run:

```bash
npm run server
```

In a second terminal or after starting a background session, run:

```bash
curl -s http://127.0.0.1:8787/api/health
```

Expected:

```json
{"ok":true}
```

Stop the server after the check.

- [ ] **Step 7: Commit or record checkpoint**

Record "Task 6 complete; Git unavailable, commit skipped."

---

### Task 7: Dividends Summary

**Files:**
- Create: `src/dividends/dividends.ts`
- Create: `src/dividends/dividends.test.ts`

**Interfaces:**
- Consumes: dividend rows if later imported.
- Produces: `summarizeDividends(rows): DividendSummary`.

- [ ] **Step 1: Write failing dividend tests**

`src/dividends/dividends.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { summarizeDividends } from "./dividends";

describe("summarizeDividends", () => {
  it("returns an unavailable state when no dividend data exists", () => {
    expect(summarizeDividends([])).toEqual({
      state: "unavailable",
      yearToDate: 0,
      byQuarter: {},
      message: "No dividend data imported or found from free sources."
    });
  });

  it("summarizes confirmed dividends by quarter", () => {
    expect(
      summarizeDividends([
        { date: "2026-03-31", amount: 1200, state: "confirmed" },
        { date: "2026-06-30", amount: 1800, state: "confirmed" }
      ])
    ).toEqual({
      state: "confirmed",
      yearToDate: 3000,
      byQuarter: { "2026 Q1": 1200, "2026 Q2": 1800 },
      message: "Confirmed dividend data loaded."
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/dividends/dividends.test.ts
```

Expected: FAIL because `dividends.ts` does not exist.

- [ ] **Step 3: Implement dividend summary**

`src/dividends/dividends.ts`:

```ts
import { parseISO } from "date-fns";
import type { DividendSummary, DividendState } from "../types";

export type DividendRow = {
  date: string;
  amount: number;
  state: Exclude<DividendState, "unavailable">;
};

function quarterKey(date: string): string {
  const parsed = parseISO(date);
  return `${parsed.getFullYear()} Q${Math.floor(parsed.getMonth() / 3) + 1}`;
}

export function summarizeDividends(rows: DividendRow[]): DividendSummary {
  if (rows.length === 0) {
    return {
      state: "unavailable",
      yearToDate: 0,
      byQuarter: {},
      message: "No dividend data imported or found from free sources."
    };
  }

  const byQuarter: Record<string, number> = {};
  let yearToDate = 0;
  let hasEstimated = false;

  for (const row of rows) {
    const key = quarterKey(row.date);
    byQuarter[key] = (byQuarter[key] ?? 0) + row.amount;
    yearToDate += row.amount;
    hasEstimated = hasEstimated || row.state === "estimated";
  }

  return {
    state: hasEstimated ? "estimated" : "confirmed",
    yearToDate,
    byQuarter,
    message: hasEstimated ? "Estimated dividend data loaded." : "Confirmed dividend data loaded."
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/dividends/dividends.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit or record checkpoint**

Record "Task 7 complete; Git unavailable, commit skipped."

---

### Task 8: Dashboard Components

**Files:**
- Create: `src/components/DashboardHeader.tsx`
- Create: `src/components/SummaryStrip.tsx`
- Create: `src/components/PerformanceChart.tsx`
- Create: `src/components/HoldingsTable.tsx`
- Create: `src/components/QuarterlyReturnsTable.tsx`
- Create: `src/components/DividendsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: parsed trades, priced holdings, snapshots, quarterly returns, dividend summary.
- Produces: visible dashboard.

- [ ] **Step 1: Replace app smoke test with imported-data integration test**

`src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders dashboard sections before import", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /portfolio dashboard/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/import sbi csv/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh quotes/i })).toBeInTheDocument();
    expect(screen.getByText(/current nav/i)).toBeInTheDocument();
    expect(screen.getByText(/holdings/i)).toBeInTheDocument();
    expect(screen.getByText(/quarterly returns/i)).toBeInTheDocument();
    expect(screen.getByText(/dividends/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because components are not implemented.

- [ ] **Step 3: Implement components**

`src/components/DashboardHeader.tsx`:

```tsx
type Props = {
  fileName: string | null;
  quoteStatus: string;
  onImport: (file: File) => void;
  onRefresh: () => void;
};

export function DashboardHeader({ fileName, quoteStatus, onImport, onRefresh }: Props) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Hiroshi Capital</p>
        <h1>Portfolio Dashboard</h1>
        <p className="subtle">{fileName ? `Ledger: ${fileName}` : "No CSV imported yet"}</p>
      </div>
      <div className="topbar-actions">
        <span className="status-pill">{quoteStatus}</span>
        <label className="file-button">
          Import SBI CSV
          <input
            aria-label="Import SBI CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onImport(file);
            }}
          />
        </label>
        <button type="button" onClick={onRefresh}>
          Refresh quotes
        </button>
      </div>
    </header>
  );
}
```

`src/components/SummaryStrip.tsx`:

```tsx
type Props = {
  nav: number;
  dailyChange: number | null;
  totalReturn: number | null;
  quarterlyReturn: number | null;
  cash: number;
  missingQuotes: number;
};

function yen(value: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`;
}

export function SummaryStrip({ nav, dailyChange, totalReturn, quarterlyReturn, cash, missingQuotes }: Props) {
  return (
    <section className="summary-grid" aria-label="Portfolio summary">
      <div><span>Current NAV</span><strong>{yen(nav)}</strong></div>
      <div><span>Daily change</span><strong>{dailyChange === null ? "N/A" : yen(dailyChange)}</strong></div>
      <div><span>Total return</span><strong>{pct(totalReturn)}</strong></div>
      <div><span>Quarterly return</span><strong>{pct(quarterlyReturn)}</strong></div>
      <div><span>Cash</span><strong>{yen(cash)}</strong></div>
      <div><span>Missing/stale quotes</span><strong>{missingQuotes}</strong></div>
    </section>
  );
}
```

`src/components/PerformanceChart.tsx`:

```tsx
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NormalizedPerformancePoint } from "../types";

export function PerformanceChart({ data }: { data: NormalizedPerformancePoint[] }) {
  return (
    <section className="panel chart-panel">
      <h2>Portfolio vs TOPIX / Nikkei 225</h2>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <XAxis dataKey="date" tickLine={false} />
          <YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} />
          <Tooltip />
          <Line type="monotone" dataKey="portfolio" stroke="#0f766e" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="topix" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="nikkei225" stroke="#b45309" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
```

`src/components/HoldingsTable.tsx`:

```tsx
import type { PricedHolding } from "../types";

function yen(value: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

export function HoldingsTable({ holdings }: { holdings: PricedHolding[] }) {
  return (
    <section className="panel">
      <h2>Holdings</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Market</th>
              <th>Quantity</th>
              <th>Average cost</th>
              <th>Latest price</th>
              <th>Market value</th>
              <th>Unrealized P&amp;L</th>
              <th>Allocation</th>
              <th>Quote</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr><td colSpan={10}>Import your latest SBI CSV to populate holdings.</td></tr>
            ) : holdings.map((holding) => (
              <tr key={holding.id}>
                <td>{holding.code}</td>
                <td>{holding.name}</td>
                <td>{holding.market}</td>
                <td>{holding.quantity.toLocaleString("ja-JP")}</td>
                <td>{yen(holding.averageCost)}</td>
                <td>{holding.latestPrice === null ? "N/A" : yen(holding.latestPrice)}</td>
                <td>{yen(holding.marketValue)}</td>
                <td>{yen(holding.unrealizedPnl)}</td>
                <td>{(holding.allocation * 100).toFixed(1)}%</td>
                <td>{holding.quote.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

`src/components/QuarterlyReturnsTable.tsx`:

```tsx
import type { QuarterlyReturn } from "../types";

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`;
}

export function QuarterlyReturnsTable({ rows }: { rows: QuarterlyReturn[] }) {
  return (
    <section className="panel">
      <h2>Quarterly Returns</h2>
      <table>
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Portfolio</th>
            <th>TOPIX</th>
            <th>Nikkei 225</th>
            <th>Vs TOPIX</th>
            <th>Vs Nikkei</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6}>Quarterly returns appear after portfolio and benchmark data are available.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.quarter}>
              <td>{row.quarter}</td>
              <td>{pct(row.portfolioReturn)}</td>
              <td>{pct(row.topixReturn)}</td>
              <td>{pct(row.nikkei225Return)}</td>
              <td>{pct(row.vsTopix)}</td>
              <td>{pct(row.vsNikkei225)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

`src/components/DividendsPanel.tsx`:

```tsx
import type { DividendSummary } from "../types";

function yen(value: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

export function DividendsPanel({ summary }: { summary: DividendSummary }) {
  return (
    <section className="panel">
      <h2>Dividends</h2>
      <p className="subtle">{summary.message}</p>
      <strong>{yen(summary.yearToDate)}</strong>
      <div className="dividend-grid">
        {Object.entries(summary.byQuarter).map(([quarter, amount]) => (
          <div key={quarter}>
            <span>{quarter}</span>
            <strong>{yen(amount)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire components in App**

Update `src/App.tsx` to:

```tsx
import { useMemo, useState } from "react";
import { DashboardHeader } from "./components/DashboardHeader";
import { DividendsPanel } from "./components/DividendsPanel";
import { HoldingsTable } from "./components/HoldingsTable";
import { PerformanceChart } from "./components/PerformanceChart";
import { QuarterlyReturnsTable } from "./components/QuarterlyReturnsTable";
import { SummaryStrip } from "./components/SummaryStrip";
import { summarizeDividends } from "./dividends/dividends";
import { buildPortfolioState } from "./portfolio/positions";
import { buildCurrentSnapshot } from "./portfolio/nav";
import { priceHoldings } from "./market/quotes";
import type { NormalizedPerformancePoint, Quote, Trade } from "./types";
import { parseSbiExecutionCsv } from "./data/parseSbiCsv";
import "./styles.css";

export default function App() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes] = useState<Quote[]>([]);
  const [error, setError] = useState<string | null>(null);

  const portfolio = useMemo(() => buildPortfolioState(trades), [trades]);
  const pricedHoldings = useMemo(() => priceHoldings(portfolio.holdings, quotes, {}), [portfolio.holdings, quotes]);
  const holdingsValue = pricedHoldings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const snapshot = buildCurrentSnapshot({
    date: new Date().toISOString().slice(0, 10),
    cash: portfolio.cash,
    holdingsValue,
    inferredInitialCash: portfolio.inferredInitialCash
  });
  const dividendSummary = summarizeDividends([]);
  const chartData: NormalizedPerformancePoint[] = trades.length
    ? [{ date: snapshot.date, portfolio: snapshot.unitNav, topix: null, nikkei225: null }]
    : [];

  async function handleImport(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSbiExecutionCsv(buffer);
      setTrades(parsed);
      setFileName(file.name);
      setError(null);
      window.localStorage.setItem("portfolio:lastCsvName", file.name);
      window.localStorage.setItem("portfolio:trades", JSON.stringify(parsed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <main className="app-shell">
      <DashboardHeader
        fileName={fileName}
        quoteStatus={quotes.length === 0 ? "Quotes not refreshed" : "Latest available prices"}
        onImport={handleImport}
        onRefresh={() => undefined}
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <SummaryStrip
        nav={snapshot.nav}
        dailyChange={null}
        totalReturn={snapshot.unitNav / 100 - 1}
        quarterlyReturn={null}
        cash={portfolio.cash}
        missingQuotes={pricedHoldings.filter((holding) => holding.quote.status === "missing").length}
      />
      <PerformanceChart data={chartData} />
      <div className="content-grid">
        <HoldingsTable holdings={pricedHoldings} />
        <QuarterlyReturnsTable rows={[]} />
        <DividendsPanel summary={dividendSummary} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Expand CSS**

Append to `src/styles.css`:

```css
.subtle {
  color: #64748b;
  margin: 6px 0 0;
  font-size: 13px;
}

.status-pill {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 8px 10px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 13px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-grid > div,
.panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.summary-grid span {
  display: block;
  color: #64748b;
  font-size: 12px;
  margin-bottom: 8px;
}

.summary-grid strong {
  font-size: 20px;
}

.chart-panel {
  margin-bottom: 18px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: 18px;
}

.content-grid .panel:first-child {
  grid-row: span 2;
}

.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 8px;
  text-align: left;
  white-space: nowrap;
}

th {
  color: #475569;
  font-weight: 600;
}

.error-banner {
  margin-bottom: 16px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #991b1b;
  border-radius: 8px;
  padding: 12px;
}

.dividend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

@media (max-width: 960px) {
  .topbar,
  .topbar-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit or record checkpoint**

Record "Task 8 complete; Git unavailable, commit skipped."

---

### Task 9: End-to-End Integration and Verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/market/apiClient.ts`
- Modify: `src/styles.css`
- Read: `SaveFile_000001_000090.csv`

**Interfaces:**
- Consumes: all prior modules.
- Produces: running local dashboard at Vite URL.

- [ ] **Step 1: Add quote refresh wiring**

Update `src/market/apiClient.ts`:

```ts
import type { BenchmarkPoint, Holding, Quote } from "../types";
import { normalizeBenchmark } from "./benchmarks";

function symbolForHolding(holding: Holding): string {
  if (holding.market.includes("名証")) return `${holding.code}.NAG`;
  return `${holding.code}.T`;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchQuotesForHoldings(holdings: Holding[]): Promise<Quote[]> {
  const symbols = holdings.map(symbolForHolding);
  if (symbols.length === 0) return [];
  const data = await fetchJson<{
    quotes: Array<{ symbol: string; price: number | null; asOf: string | null; source: string }>;
  }>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);

  return data.quotes.map((quote, index) => {
    const holding = holdings[index];
    return {
      code: holding.code,
      market: holding.market,
      price: quote.price,
      currency: "JPY",
      asOf: quote.asOf,
      source: quote.source,
      status: quote.price === null ? "missing" : "delayed",
      message: quote.price === null ? "No free quote found" : undefined
    };
  });
}

export async function fetchBenchmarks(range = "1y"): Promise<{
  topix: BenchmarkPoint[];
  nikkei225: BenchmarkPoint[];
}> {
  const data = await fetchJson<{
    topix: Array<{ date: string; value: number }>;
    nikkei225: Array<{ date: string; value: number }>;
  }>(`/api/benchmarks?range=${encodeURIComponent(range)}`);

  return {
    topix: normalizeBenchmark(data.topix, "Yahoo Finance ^TOPX"),
    nikkei225: normalizeBenchmark(data.nikkei225, "Yahoo Finance ^N225")
  };
}
```

- [ ] **Step 2: Update App quote refresh state**

Modify `src/App.tsx` so it imports `fetchQuotesForHoldings`, stores `quotes`, and passes a real `onRefresh`:

```tsx
import { fetchQuotesForHoldings } from "./market/apiClient";
```

Replace:

```ts
const [quotes] = useState<Quote[]>([]);
```

with:

```ts
const [quotes, setQuotes] = useState<Quote[]>([]);
const [quoteMessage, setQuoteMessage] = useState("Quotes not refreshed");
```

Add:

```ts
async function handleRefresh() {
  try {
    const nextQuotes = await fetchQuotesForHoldings(portfolio.holdings);
    setQuotes(nextQuotes);
    setQuoteMessage(nextQuotes.length === 0 ? "No holdings to quote" : "Latest available prices");
    setError(null);
  } catch (err) {
    setQuoteMessage("Quote refresh failed");
    setError(err instanceof Error ? err.message : "Quote refresh failed");
  }
}
```

Change `DashboardHeader` props:

```tsx
quoteStatus={quoteMessage}
onRefresh={handleRefresh}
```

- [ ] **Step 3: Run all tests**

Run:

```bash
npm test
```

Expected: PASS for all tests.

- [ ] **Step 4: Build the app**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 5: Start the dev app**

Run:

```bash
npm run dev
```

Expected:

```txt
Portfolio API listening on http://127.0.0.1:8787
Local: http://127.0.0.1:5173/
```

- [ ] **Step 6: Manual browser verification**

Open `http://127.0.0.1:5173/` and verify:

- Initial dashboard loads without a landing page.
- CSV import control accepts `SaveFile_000001_000090.csv`.
- Holdings table includes `6846`, name `中央製作所`, market `名証`.
- Selling activity leaves a positive cash balance where applicable.
- Missing quote for `6846 / 名証` does not remove the holding.
- Refresh quotes button calls the local API and updates quote statuses.
- Layout is legible on desktop width and mobile width.

- [ ] **Step 7: Commit or record checkpoint**

Record "Task 9 complete; Git unavailable, commit skipped."

---

## Plan Self-Review

- Spec coverage: CSV parsing, `6846 / 名証`, fund-style cash/NAV handling, quotes, benchmarks, quarterly returns, dividends, free-first data, and UI states are covered by tasks.
- Completeness scan: no undefined later work remains.
- Type consistency: shared types are introduced in Task 2 and consumed by later tasks using the same names.
- Git constraint: commit steps are replaced with explicit checkpoint records because the workspace is currently not a Git repository.
