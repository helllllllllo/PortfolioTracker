# Fund Accounting Correctness (JP-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "capital = gross lifetime buys, present on day one" model with a correct, cash-flow-driven **time-weighted return** (unitized NAV) plus **money-weighted IRR**, dividends added back to total return, and total-return benchmarks — all JP/JPY only.

**Architecture:** A new pure engine `src/portfolio/fundAccounting.ts` consumes trades + the real cash-flow ledger + external dividends + injected price history, and emits a daily `PortfolioSnapshot[]` carrying both actual NAV (AUM) and a total-return unit price. Returns (TWR windows, XIRR) are pure functions over that series. The existing charting helpers (`buildPerformanceChartData`, `quarterlyReturns`) are reused, fed by the new snapshots. The Schwab/US path is deleted.

**Tech Stack:** TypeScript, React 18, Vite, Express, Recharts, Papaparse, encoding-japanese, vitest.

## Global Constraints

- **JP/JPY only.** No USD, no Schwab, no US benchmarks. `Currency` is `"JPY"`.
- **Unit-price base = 100** at inception. Contributions issue units at the prevailing (pre-flow) unit price; withdrawals redeem at the prevailing price.
- **AUM/NAV = holdings + SBI cash.** **Total-return NAV = NAV + cumulative added-back dividends.** `unitNav` is the *total-return* unit price (`navTotalReturn / units`).
- **Dividends** are "add-back": raise total return only, never NAV/cash, never units.
- **Lending interest (貸株金利)** is income that sits in cash: raises NAV and total return, issues no units.
- **Benchmarks are total return:** TOPIX via `1306.T` adjusted close; Nikkei via official Net TR CSV; both rebased to 100 at inception.
- All new pure logic is tested with **injected data** (no network in tests).
- Money is JPY integers/decimals; dates are `YYYY-MM-DD` strings; compare/sort dates with `localeCompare`.

---

## File Structure

**Create:**
- `src/data/decode.ts` — robust bytes→string (UTF-8 BOM or Shift-JIS).
- `src/data/parseSbiCashFlowCsv.ts` — parse 円貨入出金明細 → `CashFlow[]`.
- `src/data/parseSbiCashFlowCsv.test.ts`
- `src/portfolio/irr.ts` — `xirr` + `moneyWeightedReturn`.
- `src/portfolio/irr.test.ts`
- `src/portfolio/fundAccounting.ts` — engine: `buildFundSnapshots`, `timeWeightedReturn`, `periodStartDate`, `UNIT_BASE`, `PeriodKey`.
- `src/portfolio/fundAccounting.test.ts`

**Modify:**
- `src/types.ts` — add `CashFlow`, `ExternalDividend`; extend `PortfolioSnapshot` with `navTotalReturn`; `Currency = "JPY"`.
- `src/portfolio/positions.ts` — key holdings by **code** (merge venues).
- `src/portfolio/corporateActions.ts` — match splits by **code**.
- `src/portfolio/nav.ts` — `quarterlyReturns` gains dividend attribution; retire inferred-cash helpers.
- `src/market/quotes.ts` — key priced holdings by code.
- `src/market/apiClient.ts` — history/quotes keyed by code; drop US/currency params.
- `src/market/benchmarks.ts` — (unchanged logic; consumed as TR).
- `server/yahooFinance.ts` — `fetchYahooDailySeries(symbol, range, useAdjClose)`.
- `server/index.ts` — TOPIX = `1306.T` adjusted close; drop US branch.
- `src/data/parseSbiCsv.ts` — delete Schwab; export trade parser only.
- `src/App.tsx` — cash-flow upload, dividend seed, engine wiring, period state; remove source/currency/US.
- Delete Schwab/US test blocks in `src/data/parseSbiCsv.test.ts`, `src/market/apiClient.test.ts`, `src/market/benchmarks.test.ts`.

---

## Task 1: Robust CSV decode utility

**Files:**
- Create: `src/data/decode.ts`
- Test: `src/data/decode.test.ts`

**Interfaces:**
- Produces: `decodeCsvBytes(input: ArrayBuffer | string): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/data/decode.test.ts
import { describe, it, expect } from "vitest";
import Encoding from "encoding-japanese";
import { decodeCsvBytes } from "./decode";

function utf8WithBom(text: string): ArrayBuffer {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out.buffer;
}
function sjis(text: string): ArrayBuffer {
  const bytes = Encoding.convert(Encoding.stringToCode(text), { to: "SJIS", from: "UNICODE" });
  return new Uint8Array(bytes).buffer;
}

describe("decodeCsvBytes", () => {
  it("passes through strings unchanged", () => {
    expect(decodeCsvBytes("入金額")).toBe("入金額");
  });
  it("decodes UTF-8 with BOM and strips the BOM", () => {
    expect(decodeCsvBytes(utf8WithBom("入出金日,入金額"))).toBe("入出金日,入金額");
  });
  it("decodes Shift-JIS", () => {
    expect(decodeCsvBytes(sjis("約定日,銘柄コード"))).toBe("約定日,銘柄コード");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/decode.test.ts`
Expected: FAIL — cannot find module `./decode`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/data/decode.ts
import Encoding from "encoding-japanese";

export function decodeCsvBytes(input: ArrayBuffer | string): string {
  if (typeof input === "string") return input;
  const bytes = new Uint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  const detected = Encoding.detect(bytes);
  if (detected === "UTF8" || detected === "ASCII") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  return Encoding.convert(bytes, { to: "UNICODE", from: "SJIS", type: "string" }) as string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/decode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/decode.ts src/data/decode.test.ts
git commit -m "feat: robust CSV byte decode (UTF-8 BOM or Shift-JIS)"
```

---

## Task 2: Cash-flow parser (円貨入出金明細)

**Files:**
- Create: `src/data/parseSbiCashFlowCsv.ts`
- Test: `src/data/parseSbiCashFlowCsv.test.ts`

**Interfaces:**
- Consumes: `decodeCsvBytes` (Task 1); `CashFlow` (Task 9 adds it — define it here too if not present, see note).
- Produces: `parseSbiCashFlowCsv(input: ArrayBuffer | string): CashFlow[]`

> **Note:** `CashFlow` is added to `src/types.ts` in Task 9's data-model step, but this task needs it. Add the `CashFlow`/`ExternalDividend` types to `src/types.ts` **now** as the first step of this task (they are additive and harmless):
>
> ```ts
> // src/types.ts — append
> export type CashFlowKind = "contribution" | "withdrawal" | "income";
> export type CashFlow = {
>   date: string;
>   kind: CashFlowKind;
>   category: string;
>   description: string;
>   amount: number;
> };
> export type ExternalDividend = { date: string; amount: number; code?: string; note?: string };
> ```

- [ ] **Step 1: Write the failing test**

```ts
// src/data/parseSbiCashFlowCsv.test.ts
import { describe, it, expect } from "vitest";
import { parseSbiCashFlowCsv } from "./parseSbiCashFlowCsv";

const SAMPLE = `﻿
円貨入出金明細

指定期間,指定期間(開始),指定期間(終了),スィープ専用銀行口座 明細表示,指定取引区分,明細数
"期間指定","2024/07/03","2026/07/02","なし","入金：すべて、出金：すべて","4"

出金額合計,うち振替出金,入金額合計,うち振替入金
"0","0","2504203","0"

入出金日,取引,区分,摘要,出金額,入金額
"2026/07/01","入金","金融機関からの入金","振込入金","0","2000000"
"2026/06/15","入金","貸株","貸株金利","0","4203"
"2026/05/07","入金","金融機関からの入金","振込入金","0","500000"
"2026/04/01","出金","振替出金","振替","100000","0"
`;

describe("parseSbiCashFlowCsv", () => {
  it("classifies bank deposits as contributions", () => {
    const flows = parseSbiCashFlowCsv(SAMPLE);
    const contrib = flows.filter((f) => f.kind === "contribution");
    expect(contrib.map((f) => [f.date, f.amount])).toEqual([
      ["2026-07-01", 2000000],
      ["2026-05-07", 500000],
    ]);
  });
  it("classifies 貸株金利 as income", () => {
    const income = parseSbiCashFlowCsv(SAMPLE).filter((f) => f.kind === "income");
    expect(income).toEqual([
      { date: "2026-06-15", kind: "income", category: "貸株", description: "貸株金利", amount: 4203 },
    ]);
  });
  it("classifies 出金 as withdrawal using the 出金額 column", () => {
    const w = parseSbiCashFlowCsv(SAMPLE).filter((f) => f.kind === "withdrawal");
    expect(w).toEqual([
      { date: "2026-04-01", kind: "withdrawal", category: "振替出金", description: "振替", amount: 100000 },
    ]);
  });
  it("throws when the header row is absent", () => {
    expect(() => parseSbiCashFlowCsv("nope,nope\n1,2")).toThrow(/cash-flow header/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/parseSbiCashFlowCsv.test.ts`
Expected: FAIL — cannot find module `./parseSbiCashFlowCsv`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/data/parseSbiCashFlowCsv.ts
import Papa from "papaparse";
import { decodeCsvBytes } from "./decode";
import type { CashFlow } from "../types";

const INCOME_KEYWORDS = ["貸株", "配当", "分配", "利子", "金利"];

function normalizeDate(value: string): string {
  return value.trim().replaceAll("/", "-");
}
function cleanAmount(value: string): number {
  const cleaned = String(value).replaceAll(",", "").trim();
  if (cleaned === "" || cleaned === "--") return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid cash-flow amount: ${value}`);
  return parsed;
}
function classifyInflow(category: string, description: string): "contribution" | "income" {
  const hay = `${category} ${description}`;
  return INCOME_KEYWORDS.some((k) => hay.includes(k)) ? "income" : "contribution";
}

export function parseSbiCashFlowCsv(input: ArrayBuffer | string): CashFlow[] {
  const text = decodeCsvBytes(input);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);

  const rows = parsed.data;
  const headerIndex = rows.findIndex((r) => r.includes("入出金日") && r.includes("入金額"));
  if (headerIndex < 0) throw new Error("Missing SBI cash-flow header (入出金日 … 入金額)");

  const headers = rows[headerIndex].map((h) => h.trim());
  const idx = new Map(headers.map((h, i) => [h, i] as const));
  const col = (name: string) => idx.get(name) ?? -1;

  const flows: CashFlow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const rawDate = row[col("入出金日")]?.trim();
    if (!rawDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(rawDate)) continue;

    const torihiki = (row[col("取引")] ?? "").trim();
    const category = (row[col("区分")] ?? "").trim();
    const description = (row[col("摘要")] ?? "").trim();
    const inAmount = cleanAmount(row[col("入金額")] ?? "0");
    const outAmount = cleanAmount(row[col("出金額")] ?? "0");

    if (torihiki.includes("入金") && inAmount > 0) {
      flows.push({
        date: normalizeDate(rawDate),
        kind: classifyInflow(category, description),
        category,
        description,
        amount: inAmount,
      });
    } else if (torihiki.includes("出金") && outAmount > 0) {
      flows.push({ date: normalizeDate(rawDate), kind: "withdrawal", category, description, amount: outAmount });
    }
  }
  return flows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/parseSbiCashFlowCsv.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify against the real file**

Run:
```bash
npx tsx -e 'import {readFileSync} from "node:fs"; import {parseSbiCashFlowCsv} from "./src/data/parseSbiCashFlowCsv.ts"; const b=readFileSync("/Users/hsakakibara/Downloads/DetailInquiry_20260702035929.csv"); const f=parseSbiCashFlowCsv(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)); const c=f.filter(x=>x.kind==="contribution").reduce((s,x)=>s+x.amount,0); const i=f.filter(x=>x.kind==="income").reduce((s,x)=>s+x.amount,0); console.log("rows",f.length,"contrib",c,"income",i,"withdrawals",f.filter(x=>x.kind==="withdrawal").length);'
```
Expected: `contrib 52300000 income 5470 withdrawals 0`.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/data/parseSbiCashFlowCsv.ts src/data/parseSbiCashFlowCsv.test.ts
git commit -m "feat: parse SBI 円貨入出金明細 cash-flow CSV"
```

---

## Task 3: XIRR (money-weighted return)

**Files:**
- Create: `src/portfolio/irr.ts`
- Test: `src/portfolio/irr.test.ts`

**Interfaces:**
- Consumes: `CashFlow`, `ExternalDividend` (Task 2).
- Produces: `xirr(flows: DatedFlow[]): number | null`; `moneyWeightedReturn(cashFlows, dividends, endingNav, asOf): number | null`; `type DatedFlow = { date: string; amount: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/portfolio/irr.test.ts
import { describe, it, expect } from "vitest";
import { xirr, moneyWeightedReturn } from "./irr";

describe("xirr", () => {
  it("returns ~10% for -1000 today, +1100 in one year", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 3);
  });
  it("returns null without both an inflow and an outflow", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1 }, { date: "2026-01-01", amount: -1 }])).toBeNull();
  });
});

describe("moneyWeightedReturn", () => {
  it("treats contributions as outflows, dividends + terminal NAV as inflows", () => {
    const r = moneyWeightedReturn(
      [{ date: "2026-01-01", kind: "contribution", category: "", description: "", amount: 1000 }],
      [{ date: "2026-07-01", amount: 50 }],
      1100,
      "2027-01-01"
    );
    // -1000 at t0, +50 mid-year, +1100 at 1yr => IRR clearly positive
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/irr.test.ts`
Expected: FAIL — cannot find module `./irr`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/portfolio/irr.ts
import type { CashFlow, ExternalDividend } from "../types";

export type DatedFlow = { date: string; amount: number };
const DAY_MS = 86400000;

function yearsBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / (365 * DAY_MS);
}

export function xirr(flows: DatedFlow[]): number | null {
  const nonzero = flows.filter((f) => f.amount !== 0);
  if (nonzero.length < 2) return null;
  if (!nonzero.some((f) => f.amount > 0) || !nonzero.some((f) => f.amount < 0)) return null;

  const t0 = [...nonzero].sort((a, b) => a.date.localeCompare(b.date))[0].date;
  const npv = (rate: number) =>
    nonzero.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, yearsBetween(t0, f.date)), 0);

  let lo = -0.9999;
  let hi = 10; // 1000% annual ceiling
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return null; // no bracketed root

  for (let i = 0; i < 300; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7 || (hi - lo) < 1e-10) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function moneyWeightedReturn(
  cashFlows: CashFlow[],
  dividends: ExternalDividend[],
  endingNav: number,
  asOf: string
): number | null {
  const flows: DatedFlow[] = [];
  for (const c of cashFlows) {
    if (c.kind === "contribution") flows.push({ date: c.date, amount: -c.amount });
    else if (c.kind === "withdrawal") flows.push({ date: c.date, amount: c.amount });
    // income (lending) stays in the fund and is captured by endingNav
  }
  for (const d of dividends) flows.push({ date: d.date, amount: d.amount }); // paid out to investor
  flows.push({ date: asOf, amount: endingNav });
  return xirr(flows);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/portfolio/irr.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portfolio/irr.ts src/portfolio/irr.test.ts
git commit -m "feat: XIRR + money-weighted return"
```

---

## Task 4: Merge holdings by security code

**Files:**
- Modify: `src/portfolio/corporateActions.ts`
- Modify: `src/portfolio/positions.ts`
- Modify (tests): `src/portfolio/positions.test.ts`

**Interfaces:**
- Produces: holdings whose `id === code` (venues 東証/名証/PTS aggregated). Splits match by `code`.

- [ ] **Step 1: Update the split matcher to match by code**

In `src/portfolio/corporateActions.ts`, replace `holdingMatchesSplit`:

```ts
function holdingMatchesSplit(holding: Pick<Holding, "code">, split: StockSplit): boolean {
  return holding.code === split.code;
}
```

- [ ] **Step 2: Write the failing test (venue merge)**

Add to `src/portfolio/positions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPortfolioState } from "./positions";
import type { Trade } from "../types";

function buy(code: string, market: string, quantity: number, price: number): Trade {
  return {
    tradeDate: "2026-02-01", settlementDate: "2026-02-03", code, name: code, market,
    side: "buy", quantity, price, grossAmount: quantity * price,
  };
}

describe("buildPortfolioState venue merge", () => {
  it("aggregates the same code across 東証 / PTS / 名証 into one holding", () => {
    const { holdings } = buildPortfolioState(
      [buy("4689", "東証", 800, 400), buy("4689", "PTS（X）", 200, 400), buy("4689", "名証（名２）", 100, 400)],
      "2026-03-01"
    );
    const line = holdings.filter((h) => h.code === "4689");
    expect(line).toHaveLength(1);
    expect(line[0].quantity).toBe(1100);
    expect(line[0].id).toBe("4689");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/portfolio/positions.test.ts -t "venue merge"`
Expected: FAIL — two holdings / id `4689::東証`.

- [ ] **Step 4: Implement — key by code**

In `src/portfolio/positions.ts`, change `holdingId`:

```ts
function holdingId(code: string, _market: string): string {
  return code;
}
```

And where a new holding is created (both in `buildPortfolioState` and `buildHistoricalHoldings`), set `market` to the canonical market of the **first** trade seen for that code (it is only used for display now). The existing `canonicalHoldingMarket(trade.market)` call already yields that value — keep assigning `market: canonicalHoldingMarket(trade.market)` on first creation; do not overwrite it on later trades. (The `byId.get(id) ?? {…}` pattern already preserves the first-seen market.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/portfolio/positions.test.ts`
Expected: PASS (existing + new). If a pre-existing test asserts an id like `"4689::東証"`, update that expectation to `"4689"`.

- [ ] **Step 6: Commit**

```bash
git add src/portfolio/corporateActions.ts src/portfolio/positions.ts src/portfolio/positions.test.ts
git commit -m "feat: merge holdings by security code across venues"
```

---

## Task 5: Fund accounting engine — daily snapshots (TWR)

**Files:**
- Create: `src/portfolio/fundAccounting.ts`
- Test: `src/portfolio/fundAccounting.test.ts`
- Modify: `src/types.ts` (extend `PortfolioSnapshot`)

**Interfaces:**
- Consumes: `Trade`, `CashFlow`, `ExternalDividend` (Tasks 2), `STOCK_SPLITS` (corporateActions).
- Produces:
  - `UNIT_BASE = 100`
  - `type PriceHistory = Record<string, { date: string; close: number }[]>` (keyed by code)
  - `type FundInputs = { trades: Trade[]; cashFlows: CashFlow[]; dividends: ExternalDividend[]; historyByCode: PriceHistory; latestPriceByCode?: Record<string, number>; asOfDate: string }`
  - `buildFundSnapshots(inputs: FundInputs): PortfolioSnapshot[]`

- [ ] **Step 1: Extend the snapshot type**

In `src/types.ts`, change `PortfolioSnapshot`:

```ts
export type PortfolioSnapshot = {
  date: string;
  cash: number;
  holdingsValue: number;
  nav: number;             // AUM = cash + holdingsValue
  navTotalReturn: number;  // nav + cumulative added-back dividends
  units: number;
  unitNav: number;         // navTotalReturn / units (total-return unit price)
};
```

- [ ] **Step 2: Write the failing tests (invariants)**

```ts
// src/portfolio/fundAccounting.test.ts
import { describe, it, expect } from "vitest";
import { buildFundSnapshots, UNIT_BASE } from "./fundAccounting";
import type { CashFlow, ExternalDividend, Trade } from "../types";

const flat = (code: string) => ({ [code]: [
  { date: "2026-01-01", close: 100 },
  { date: "2026-02-01", close: 100 },
  { date: "2026-03-01", close: 100 },
] });
const buy = (date: string, code: string, qty: number, px: number): Trade => ({
  tradeDate: date, settlementDate: date, code, name: code, market: "東証",
  side: "buy", quantity: qty, price: px, grossAmount: qty * px,
});
const contrib = (date: string, amount: number): CashFlow =>
  ({ date, kind: "contribution", category: "", description: "", amount });

describe("buildFundSnapshots", () => {
  it("starts unit price at 100 on the first contribution", () => {
    const s = buildFundSnapshots({
      trades: [], cashFlows: [contrib("2026-01-01", 1_000_000)], dividends: [],
      historyByCode: {}, asOfDate: "2026-01-01",
    });
    expect(s.at(-1)!.unitNav).toBeCloseTo(UNIT_BASE, 6);
    expect(s.at(-1)!.nav).toBe(1_000_000);
  });

  it("a contribution does not move the unit price on its day", () => {
    // price of the single holding doubles by 02-01; then a contribution arrives
    const history = { A: [
      { date: "2026-01-01", close: 100 }, { date: "2026-02-01", close: 200 },
    ] };
    const s = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],       // 1,000,000 invested
      cashFlows: [contrib("2026-01-01", 1_000_000), contrib("2026-02-01", 1_000_000)],
      dividends: [], historyByCode: history, asOfDate: "2026-02-01",
    });
    // On 02-01 holding worth 2,000,000 + cash 1,000,000 (2nd contrib) = 3,000,000; unit price ~200
    expect(s.at(-1)!.unitNav).toBeCloseTo(200, 4);
  });

  it("is invariant to contribution timing (same trades/prices → same TWR)", () => {
    const history = { A: [
      { date: "2026-01-01", close: 100 }, { date: "2026-02-01", close: 150 }, { date: "2026-03-01", close: 150 },
    ] };
    const early = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000)], dividends: [], historyByCode: history, asOfDate: "2026-03-01",
    });
    const late = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      // extra idle contribution on 02-01 that is never invested
      cashFlows: [contrib("2026-01-01", 1_000_000), contrib("2026-02-01", 5_000_000)],
      dividends: [], historyByCode: history, asOfDate: "2026-03-01",
    });
    // Since-inception TWR reflects the invested holding's +50% (diluted by idle cash in `late`,
    // but the UNIT PRICE path up to the 02-01 flow is identical). Assert the pre-flow unit price
    // on 02-01 matches in both runs:
    const earlyFeb = early.find((x) => x.date === "2026-02-01")!.unitNav;
    const lateFebPre = late.find((x) => x.date === "2026-02-01")!.unitNav;
    expect(lateFebPre).toBeCloseTo(earlyFeb, 4); // ~150
  });

  it("adds back dividends to total return but not to NAV", () => {
    const s = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000)],
      dividends: [{ date: "2026-02-01", amount: 100_000 }] as ExternalDividend[],
      historyByCode: flat("A"), asOfDate: "2026-02-01",
    });
    const last = s.at(-1)!;
    expect(last.nav).toBe(1_000_000);                 // AUM unchanged (dividend paid out)
    expect(last.navTotalReturn).toBe(1_100_000);      // TR includes the dividend
    expect(last.unitNav).toBeCloseTo(110, 4);         // +10% total return
  });

  it("lending income raises both NAV and total return", () => {
    const income: CashFlow = { date: "2026-02-01", kind: "income", category: "貸株", description: "貸株金利", amount: 50_000 };
    const s = buildFundSnapshots({
      trades: [buy("2026-01-01", "A", 10000, 100)],
      cashFlows: [contrib("2026-01-01", 1_000_000), income],
      dividends: [], historyByCode: flat("A"), asOfDate: "2026-02-01",
    });
    expect(s.at(-1)!.nav).toBe(1_050_000);
    expect(s.at(-1)!.unitNav).toBeCloseTo(105, 4);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/portfolio/fundAccounting.test.ts`
Expected: FAIL — cannot find module `./fundAccounting`.

- [ ] **Step 4: Implement the engine**

```ts
// src/portfolio/fundAccounting.ts
import type { CashFlow, ExternalDividend, PortfolioSnapshot, Trade } from "../types";
import { STOCK_SPLITS } from "./corporateActions";

export const UNIT_BASE = 100;

export type PriceHistory = Record<string, { date: string; close: number }[]>;

export type FundInputs = {
  trades: Trade[];
  cashFlows: CashFlow[];
  dividends: ExternalDividend[];
  historyByCode: PriceHistory;
  latestPriceByCode?: Record<string, number>;
  asOfDate: string;
};

type Position = { qty: number; costBasis: number; avgCost: number; realized: number };

function groupByDate<T>(items: T[], getDate: (x: T) => string, max: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const date = getDate(item);
    if (date > max) continue;
    const bucket = map.get(date);
    if (bucket) bucket.push(item);
    else map.set(date, [item]);
  }
  return map;
}

function applyTrade(positions: Map<string, Position>, trade: Trade, onCash: (delta: number) => void): void {
  const pos = positions.get(trade.code) ?? { qty: 0, costBasis: 0, avgCost: 0, realized: 0 };
  if (trade.side === "buy") {
    onCash(-trade.grossAmount);
    pos.costBasis += trade.grossAmount;
    pos.qty += trade.quantity;
    pos.avgCost = pos.qty === 0 ? 0 : pos.costBasis / pos.qty;
  } else if (trade.side === "sell") {
    const sold = Math.min(trade.quantity, pos.qty);
    const removed = pos.avgCost * sold;
    pos.qty -= sold;
    pos.costBasis -= removed;
    pos.realized += trade.grossAmount - removed;
    pos.avgCost = pos.qty === 0 ? 0 : pos.costBasis / pos.qty;
    onCash(trade.grossAmount);
  } else if (trade.side === "split" && pos.qty > 0 && trade.quantity > 0) {
    pos.qty = trade.quantity;
    pos.avgCost = pos.costBasis / pos.qty;
  }
  positions.set(trade.code, pos);
}

export function buildFundSnapshots(inputs: FundInputs): PortfolioSnapshot[] {
  const { trades, cashFlows, dividends, historyByCode, latestPriceByCode, asOfDate } = inputs;

  const eventDates = new Set<string>();
  for (const t of trades) if (t.tradeDate <= asOfDate) eventDates.add(t.tradeDate);
  for (const c of cashFlows) if (c.date <= asOfDate) eventDates.add(c.date);
  for (const d of dividends) if (d.date <= asOfDate) eventDates.add(d.date);
  if (eventDates.size === 0) return [];

  const inception = [...eventDates].sort()[0];

  const sortedHistory: PriceHistory = {};
  for (const [code, rows] of Object.entries(historyByCode)) {
    sortedHistory[code] = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  }

  const historyDates = new Set<string>();
  for (const rows of Object.values(sortedHistory)) {
    for (const r of rows) if (r.date >= inception && r.date <= asOfDate) historyDates.add(r.date);
  }

  const dates = Array.from(new Set<string>([...eventDates, ...historyDates, asOfDate]))
    .filter((d) => d >= inception && d <= asOfDate)
    .sort((a, b) => a.localeCompare(b));

  const tradesByDate = groupByDate(trades, (t) => t.tradeDate, asOfDate);
  const flowsByDate = groupByDate(cashFlows, (c) => c.date, asOfDate);
  const divsByDate = groupByDate(dividends, (d) => d.date, asOfDate);

  const positions = new Map<string, Position>();
  const appliedSplits = new Set<string>();
  let cash = 0;
  let units = 0;
  let cumulativeDividends = 0;

  const priceOf = (code: string, date: string): number => {
    if (date === asOfDate && latestPriceByCode && latestPriceByCode[code] != null) {
      return latestPriceByCode[code];
    }
    const rows = sortedHistory[code];
    const fallback = positions.get(code)?.avgCost ?? 0;
    if (!rows) return fallback;
    let price = fallback;
    for (const r of rows) {
      if (r.date <= date) price = r.close;
      else break;
    }
    return price;
  };

  const markHoldings = (date: string): number => {
    let sum = 0;
    for (const [code, pos] of positions) if (pos.qty > 0) sum += priceOf(code, date) * pos.qty;
    return sum;
  };

  const applySplitsThrough = (date: string): void => {
    for (const s of STOCK_SPLITS) {
      const id = `${s.code}:${s.exDate}`;
      if (appliedSplits.has(id) || s.exDate > date) continue;
      const pos = positions.get(s.code);
      if (pos && pos.qty > 0) {
        pos.qty *= s.ratio;
        pos.avgCost = pos.costBasis / pos.qty;
      }
      appliedSplits.add(id);
    }
  };

  const snapshots: PortfolioSnapshot[] = [];

  for (const date of dates) {
    applySplitsThrough(date);

    // Pre-flow unit price for issuing/redeeming units
    const preHoldings = markHoldings(date);
    const preNavTR = preHoldings + cash + cumulativeDividends;
    const unitPrice = units === 0 ? UNIT_BASE : preNavTR / units;

    for (const flow of flowsByDate.get(date) ?? []) {
      if (flow.kind === "contribution") {
        units += flow.amount / unitPrice;
        cash += flow.amount;
      } else if (flow.kind === "withdrawal") {
        units -= flow.amount / unitPrice;
        cash -= flow.amount;
      } else {
        cash += flow.amount; // income (lending): raises NAV, no units
      }
    }

    for (const trade of tradesByDate.get(date) ?? []) {
      applyTrade(positions, trade, (delta) => {
        cash += delta;
      });
    }

    for (const dividend of divsByDate.get(date) ?? []) {
      cumulativeDividends += dividend.amount; // add-back: TR only
    }

    const holdingsValue = markHoldings(date);
    const nav = holdingsValue + cash;
    const navTotalReturn = nav + cumulativeDividends;
    snapshots.push({
      date,
      cash,
      holdingsValue,
      nav,
      navTotalReturn,
      units,
      unitNav: units === 0 ? UNIT_BASE : navTotalReturn / units,
    });
  }

  return snapshots;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/portfolio/fundAccounting.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/portfolio/fundAccounting.ts src/portfolio/fundAccounting.test.ts
git commit -m "feat: cash-flow-driven unitized NAV engine (TWR)"
```

---

## Task 6: Period TWR windows

**Files:**
- Modify: `src/portfolio/fundAccounting.ts` (append)
- Modify: `src/portfolio/fundAccounting.test.ts` (append)

**Interfaces:**
- Produces: `type PeriodKey = "inception" | "ytd" | "qtd" | "mtd"`; `periodStartDate(asOf, period): string | null`; `timeWeightedReturn(snapshots, period): number | null`.

- [ ] **Step 1: Write the failing test**

Append to `src/portfolio/fundAccounting.test.ts`:

```ts
import { periodStartDate, timeWeightedReturn } from "./fundAccounting";
import type { PortfolioSnapshot } from "../types";

const snap = (date: string, unitNav: number): PortfolioSnapshot =>
  ({ date, cash: 0, holdingsValue: 0, nav: 0, navTotalReturn: 0, units: 1, unitNav });

describe("period windows", () => {
  it("computes period start dates", () => {
    expect(periodStartDate("2026-07-02", "ytd")).toBe("2026-01-01");
    expect(periodStartDate("2026-07-02", "qtd")).toBe("2026-07-01");
    expect(periodStartDate("2026-05-15", "qtd")).toBe("2026-04-01");
    expect(periodStartDate("2026-07-02", "mtd")).toBe("2026-07-01");
    expect(periodStartDate("2026-07-02", "inception")).toBeNull();
  });
  it("since-inception TWR uses base 100", () => {
    const s = [snap("2026-01-01", 100), snap("2026-06-30", 120)];
    expect(timeWeightedReturn(s, "inception")).toBeCloseTo(0.2, 6);
  });
  it("QTD uses the last unit price before the quarter start", () => {
    const s = [snap("2026-03-31", 110), snap("2026-04-01", 110), snap("2026-06-30", 132)];
    expect(timeWeightedReturn(s, "qtd")).toBeCloseTo(0.2, 6); // 132/110 - 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/fundAccounting.test.ts -t "period"`
Expected: FAIL — `periodStartDate` / `timeWeightedReturn` not exported.

- [ ] **Step 3: Implement**

Append to `src/portfolio/fundAccounting.ts`:

```ts
export type PeriodKey = "inception" | "ytd" | "qtd" | "mtd";

export function periodStartDate(asOf: string, period: PeriodKey): string | null {
  const d = new Date(`${asOf}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based
  if (period === "inception") return null;
  if (period === "ytd") return `${year}-01-01`;
  if (period === "mtd") return `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const quarterStartMonth = Math.floor(month / 3) * 3; // 0,3,6,9
  return `${year}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`;
}

export function timeWeightedReturn(snapshots: PortfolioSnapshot[], period: PeriodKey): number | null {
  if (snapshots.length === 0) return null;
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const end = ordered[ordered.length - 1];
  const startDate = periodStartDate(end.date, period);

  const startUnit =
    startDate === null
      ? UNIT_BASE
      : ordered.filter((s) => s.date < startDate).at(-1)?.unitNav ??
        ordered.find((s) => s.date >= startDate)?.unitNav ??
        null;

  if (startUnit === null || startUnit === 0) return null;
  return end.unitNav / startUnit - 1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/portfolio/fundAccounting.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/portfolio/fundAccounting.ts src/portfolio/fundAccounting.test.ts
git commit -m "feat: period TWR windows (inception/YTD/QTD/MTD)"
```

---

## Task 7: Total-return benchmarks (server + Nikkei retained)

**Files:**
- Modify: `server/yahooFinance.ts:186-213` (`fetchYahooDailySeries`)
- Modify: `server/index.ts` (TOPIX branch, drop US)
- Modify (tests): `server/yahooFinance.test.ts`, `server/benchmarkSymbols.test.ts` (if they assert old behavior)

**Interfaces:**
- Produces: `fetchYahooDailySeries(symbol, range?, useAdjClose?)`; `/api/benchmarks` returns `{ topix, nikkei225 }` where `topix` is `1306.T` adjusted-close rows.

- [ ] **Step 1: Add adjusted-close support**

Replace the body of `fetchYahooDailySeries` in `server/yahooFinance.ts`:

```ts
export async function fetchYahooDailySeries(
  symbol: string,
  range = "1y",
  useAdjClose = false
): Promise<Array<{ date: string; value: number }>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${encodeURIComponent(range)}&interval=1d`;

  try {
    const response = await fetch(url, { headers: yahooHeaders() });
    if (!response.ok) return [];

    const json = (await response.json()) as YahooChartResult & {
      chart?: { result?: Array<{ indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }> } }> };
    };
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const adj = (result as { indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }> } })
      ?.indicators?.adjclose?.[0]?.adjclose ?? [];

    return timestamps
      .map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        value: (useAdjClose ? adj[index] ?? closes[index] : closes[index]) ?? 0,
      }))
      .filter((row) => row.value > 0);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Point TOPIX at the total-return ETF proxy; drop the US branch**

In `server/index.ts`, replace `DEFAULT_BENCHMARK_SYMBOLS` and the `/api/benchmarks` handler body:

```ts
const TOPIX_TR_SYMBOL = "1306.T"; // NEXT FUNDS TOPIX ETF; adjusted close ≈ total return

app.get("/api/benchmarks", async (req, res) => {
  const range = String(req.query.range ?? "1y");
  try {
    const [topix, nikkei225] = await Promise.all([
      fetchYahooDailySeries(TOPIX_TR_SYMBOL, range, true),
      fetchNikkei225NetTotalReturnDailySeries(range),
    ]);
    res.json({ topix, nikkei225 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load benchmarks";
    res.status(500).json({ error: msg });
  }
});
```

Remove now-unused imports (`fetchYahooDailySeriesWithFallback`, `TOPIX_FALLBACK_SYMBOL`, `parseBenchmarkSymbols`, `DEFAULT_BENCHMARK_SYMBOLS`) and their code. Delete `server/benchmarkSymbols.ts` and its test if nothing else references them (grep first: `grep -rn benchmarkSymbols server src`).

- [ ] **Step 3: Update/adjust server tests**

Run the server tests and fix expectations that referenced `^TOPX`/US/symbol parsing:

Run: `npx vitest run server/`
Expected: PASS after updating assertions to the new `{ topix, nikkei225 }` shape and adjusted-close behavior. If `benchmarkSymbols.test.ts` only tested the deleted constant, delete the file.

- [ ] **Step 4: Live smoke test**

Run:
```bash
npx tsx -e 'import {fetchYahooDailySeries} from "./server/yahooFinance.ts"; const r=await fetchYahooDailySeries("1306.T","1mo",true); console.log("rows",r.length,"last",r.at(-1));'
```
Expected: non-empty rows; last row has a positive `value`.

- [ ] **Step 5: Commit**

```bash
git add server/yahooFinance.ts server/index.ts server/*.test.ts
git rm --ignore-unmatch server/benchmarkSymbols.ts server/benchmarkSymbols.test.ts
git commit -m "feat: total-return benchmarks (TOPIX ETF adjusted close), drop US"
```

---

## Task 8: Remove Schwab/US; JPY-only types & client

**Files:**
- Modify: `src/data/parseSbiCsv.ts` (delete Schwab)
- Modify: `src/types.ts` (`Currency = "JPY"`)
- Modify: `src/market/apiClient.ts` (drop US/currency params; history/quotes keyed by code)
- Modify: `src/market/quotes.ts` (key by code)
- Modify (tests): `src/data/parseSbiCsv.test.ts`, `src/market/apiClient.test.ts`, `src/market/benchmarks.test.ts`

**Interfaces:**
- Produces: `parsePortfolioCsv(input): { trades: Trade[] }` (SBI trades only); history/quote maps keyed by `code`.

- [ ] **Step 1: Delete Schwab from the parser**

In `src/data/parseSbiCsv.ts`: remove `SCHWAB_HEADERS`, `SCHWAB_DIVIDEND_ACTIONS`, `parseSchwabTransactionRows`, `schwabDate`, `schwabHeaders`, and the Schwab branch in `parsePortfolioCsv`. Reduce `parsePortfolioCsv` to:

```ts
export function parsePortfolioCsv(input: ArrayBuffer | string): { source: "sbi"; trades: Trade[] } {
  return { source: "sbi", trades: parseSbiExecutionCsv(input) };
}
```

Keep `parseSbiExecutionCsv` but switch its decode to the shared util: replace the local `decodeInput` usage with `import { decodeCsvBytes } from "./decode";` and call `decodeCsvBytes(input)`.

- [ ] **Step 2: Currency = JPY only**

In `src/types.ts`: `export type Currency = "JPY";` Remove `"USD"`. Then run `npx tsc -b --noEmit` and fix each error by deleting the USD branch (they are all in App/quotes/apiClient handled below).

- [ ] **Step 3: Key market data by code**

In `src/market/quotes.ts` and `src/market/apiClient.ts`, change any holding-id keying from `code::market` to `code`, and remove `baseCurrency`/US parameters and `BenchmarkMode`. `fetchBenchmarks(range)` now calls `/api/benchmarks?range=…` (no symbols/mode). `fetchQuotesForHoldings(holdings)` and `fetchHistoryForHoldings(holdings, range)` drop the currency arg and return maps keyed by `code`.

> Concretely, wherever the code builds `` `${code}::${market}` `` as a key, replace with `code`. `priceHoldings` should match a quote to a holding by `holding.code === quote.code`.

- [ ] **Step 4: Fix tests**

Delete Schwab test blocks in `src/data/parseSbiCsv.test.ts`; delete US assertions in `src/market/apiClient.test.ts` and `src/market/benchmarks.test.ts`.

Run: `npx vitest run src/data/ src/market/`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors from `src/market`, `src/data`, `src/types` (App.tsx handled in Task 10).

- [ ] **Step 6: Commit**

```bash
git add src/data/parseSbiCsv.ts src/types.ts src/market/ src/data/*.test.ts
git commit -m "refactor: remove Schwab/US; JPY-only, key market data by code"
```

---

## Task 9: Quarterly returns with dividend attribution

**Files:**
- Modify: `src/portfolio/nav.ts` (`quarterlyReturns`)
- Modify (tests): `src/portfolio/nav.test.ts`

**Interfaces:**
- Consumes: `PortfolioSnapshot[]` (now total-return `unitNav`), `ExternalDividend[]`.
- Produces: `quarterlyReturns(portfolio, topix, nikkei225, dividends?): QuarterlyReturn[]` with `dividendContribution` populated.

- [ ] **Step 1: Write the failing test**

Add to `src/portfolio/nav.test.ts`:

```ts
import { quarterlyReturns } from "./nav";
import type { ExternalDividend, PortfolioSnapshot } from "../types";

const s = (date: string, unitNav: number, navTotalReturn: number): PortfolioSnapshot =>
  ({ date, cash: 0, holdingsValue: 0, nav: navTotalReturn, navTotalReturn, units: 1, unitNav });

it("attributes dividends to the quarter received", () => {
  const snaps = [s("2026-04-01", 100, 1_000_000), s("2026-06-30", 110, 1_100_000)];
  const divs: ExternalDividend[] = [{ date: "2026-06-15", amount: 20_000 }];
  const rows = quarterlyReturns(snaps, [], [], divs);
  const q2 = rows.find((r) => r.quarter === "2026 Q2")!;
  expect(q2.dividendContribution).toBeCloseTo(20_000 / 1_000_000, 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/nav.test.ts -t "attributes dividends"`
Expected: FAIL — `dividendContribution` is null / signature mismatch.

- [ ] **Step 3: Implement**

In `src/portfolio/nav.ts`, change the `quarterlyReturns` signature and dividend line. Add a `dividends` param (default `[]`), and compute per-quarter dividend contribution = quarter dividends ÷ the total-return NAV at the quarter's start snapshot:

```ts
export function quarterlyReturns(
  portfolio: PortfolioSnapshot[],
  topix: BenchmarkPoint[],
  nikkei225: BenchmarkPoint[],
  dividends: { date: string; amount: number }[] = []
): QuarterlyReturn[] {
  // ...existing quarter setup...
  const ordered = [...portfolio].sort((a, b) => a.date.localeCompare(b.date));
  return quarters
    .map((quarter) => {
      // ...existing portfolioReturn/topixReturn/nikkei225Return...
      const quarterDividends = dividends
        .filter((d) => quarterKey(d.date) === quarter)
        .reduce((sum, d) => sum + d.amount, 0);
      const startDate = quarterStartDate(quarter);
      const baseNav =
        ordered.filter((r) => r.date < startDate).at(-1)?.navTotalReturn ??
        ordered.find((r) => quarterKey(r.date) === quarter)?.navTotalReturn ??
        0;
      const dividendContribution =
        quarterDividends === 0 || baseNav === 0 ? (quarterDividends === 0 ? null : null) : quarterDividends / baseNav;

      return {
        quarter,
        portfolioReturn,
        topixReturn,
        nikkei225Return,
        vsTopix: portfolioReturn === null || topixReturn === null ? null : portfolioReturn - topixReturn,
        vsNikkei225: portfolioReturn === null || nikkei225Return === null ? null : portfolioReturn - nikkei225Return,
        dividendContribution,
      };
    })
    .filter((row) => row.portfolioReturn !== null || row.topixReturn !== null || row.nikkei225Return !== null);
}
```

(`quarterStartDate` and `quarterKey` already exist in this file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/portfolio/nav.test.ts`
Expected: PASS. Update any existing `quarterlyReturns` test that constructs snapshots to include `navTotalReturn`.

- [ ] **Step 5: Commit**

```bash
git add src/portfolio/nav.ts src/portfolio/nav.test.ts
git commit -m "feat: attribute dividends to the quarter earned"
```

---

## Task 10: Wire the engine into App (cash-flow upload, dividends, period, KPIs)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/DashboardHeader.tsx` (second upload)
- Test: `src/App.test.tsx` (smoke)

**Interfaces:**
- Consumes: everything above — `buildFundSnapshots`, `timeWeightedReturn`, `periodStartDate`, `moneyWeightedReturn`, `parseSbiCashFlowCsv`, `parseSbiExecutionCsv`, `buildPerformanceChartData`, `quarterlyReturns`.

- [ ] **Step 1: Add cash-flow + dividend state and a second upload**

In `src/App.tsx`:
- Add storage keys `CASHFLOWS_STORAGE_KEY = "portfolio:cashFlows"`, `DIVIDENDS_LIST_STORAGE_KEY = "portfolio:externalDividends"`.
- Add state `cashFlows: CashFlow[]` (loaded from storage) and `externalDividends: ExternalDividend[]` seeded, when empty, with `[{ date: "2026-06-29", amount: 119511, note: "H1 2026 dividends (other account)" }]`.
- Remove `portfolioSource`, `baseCurrency`, `benchmarkMode`, `benchmarkLabels` source logic → constants: `const baseCurrency = "JPY"`, `const benchmarkLabels = { primary: "TOPIX (TR)", secondary: "Nikkei 225 (TR)" }`.
- Add `handleImportCashFlows(file)` mirroring `handleImport`, calling `parseSbiCashFlowCsv(await file.arrayBuffer())`, persisting to storage.
- In `DashboardHeader`, add an `onImportCashFlows` prop + a second file button labeled "Import cash flows".

- [ ] **Step 2: Replace the snapshot source with the engine**

Replace the `portfolioSnapshots`/`dailyChangeSnapshots`/inferred-cash block with:

```ts
const asOfDate = useMemo(
  () => latestQuoteDate(quotes) ?? new Date().toISOString().slice(0, 10),
  [quotes]
);
const historyByCode = historyByHoldingId; // already keyed by code after Task 8
const latestPriceByCode = useMemo(() => {
  const map: Record<string, number> = {};
  for (const q of quotes) if (q.price != null) map[q.code] = q.price;
  return map;
}, [quotes]);

const snapshots = useMemo(
  () =>
    buildFundSnapshots({
      trades,
      cashFlows,
      dividends: externalDividends,
      historyByCode,
      latestPriceByCode,
      asOfDate,
    }),
  [trades, cashFlows, externalDividends, historyByCode, latestPriceByCode, asOfDate]
);
const [period, setPeriod] = useState<PeriodKey>("inception");
const latest = snapshots.at(-1) ?? null;
const nav = latest?.nav ?? 0;
const twr = timeWeightedReturn(snapshots, period);
const sinceInception = timeWeightedReturn(snapshots, "inception");
const irr = moneyWeightedReturn(cashFlows, externalDividends, nav, asOfDate);
const netContributions = cashFlows.reduce(
  (s, c) => s + (c.kind === "contribution" ? c.amount : c.kind === "withdrawal" ? -c.amount : 0),
  0
);
```

Add a small `latestQuoteDate(quotes)` helper in App (or import one) that returns the max `asOf?.slice(0,10)`.

- [ ] **Step 3: Feed the existing chart + quarterly helpers**

```ts
const chartData = useMemo(
  () => buildPerformanceChartData(snapshots, benchmarks.topix, benchmarks.nikkei225, periodStartDate(asOfDate, period) ?? undefined),
  [snapshots, benchmarks, asOfDate, period]
);
const quarterly = useMemo(
  () => quarterlyReturns(snapshots, benchmarks.topix, benchmarks.nikkei225, externalDividends),
  [snapshots, benchmarks, externalDividends]
);
```

Pass `nav`, `twr`, `sinceInception`, `irr`, `netContributions`, `period`, `setPeriod` down to the summary/KPI components (the components themselves are refined in Plan B; for now wire the values into the existing `SummaryStrip` props, replacing `totalReturn`/`quarterlyReturn` with `twr`/`sinceInception`).

> `buildPerformanceChartData`'s 4th arg is `trackingStartDate`; passing the period start rebases the chart to the selected window. For `inception` pass the first snapshot date (`snapshots[0]?.date`).

- [ ] **Step 4: Remove dead inferred-cash code**

Delete unused imports and calls: `buildCurrentSnapshot`, `applyCashFlowToSnapshot`, `applyInternalIncomeToSnapshot`, `buildHistoricalSnapshots`, `calculateInvestmentChange`, `calculateNetContributions`, `manualCash`/`manualDividend` (replaced by ledger + dividend list). Keep `priceHoldings`, `buildAllocationSlices`. Remove the now-unused functions from `nav.ts`/`history.ts`/`performance.ts` only if nothing imports them (grep first).

- [ ] **Step 5: Smoke test**

Update `src/App.test.tsx` to render `<App />` and assert it mounts without throwing and shows the header. 

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck + build**

Run:
```bash
npx tsc -b --noEmit && npx vitest run && npm run build
```
Expected: typecheck clean, all tests pass, build succeeds.

- [ ] **Step 7: End-to-end check against real files**

Start dev (`npm run dev`), import `SaveFile_000001_000090.csv` then `DetailInquiry_20260702035929.csv`, click refresh, and confirm: NAV ≈ holdings + ~¥3–4M cash; since-inception TWR and IRR render as sane positive/negative percentages; the performance line no longer sits flat-then-jumps. Record the numbers in the commit message.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/DashboardHeader.tsx src/App.test.tsx src/portfolio/nav.ts src/portfolio/history.ts src/portfolio/performance.ts
git commit -m "feat: drive dashboard from cash-flow-based TWR/IRR engine"
```

---

## Self-Review

**Spec coverage:**
- TWR + real contributions → Tasks 2,5,6,10. IRR → Tasks 3,10. Dividend add-back → Tasks 5,9,10. TR benchmarks → Task 7. Period toggle (logic) → Tasks 6,10 (UI control in Plan B). Venue merge → Task 4. Remove Schwab/US → Task 8. Cash reconciliation, uploadable cash-flow CSV → Tasks 2,10. Dividend CSV importer (future) → deferred to Plan B (parser stub can reuse Task 2 patterns). Light tearsheet charts, PNG export, KPI header UI, contributors panel → **Plan B**.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The `dividendContribution` ternary in Task 9 is intentionally explicit (null when no dividend).

**Type consistency:** `PortfolioSnapshot` gains `navTotalReturn` in Task 5 and is used consistently in Tasks 9,10. `PeriodKey` defined in Task 6, used in Task 10. History/quote maps keyed by `code` from Task 8 onward; the engine's `historyByCode` in Task 10 relies on that. `moneyWeightedReturn` signature matches between Tasks 3 and 10.

**Note:** Tasks 4–7 are independent and can be built in any order; Task 10 depends on all prior tasks. Tasks touching `App.tsx` (Task 10) must come after Task 8's type changes.
