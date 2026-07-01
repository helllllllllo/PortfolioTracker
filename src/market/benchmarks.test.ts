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

  it("drops single-day bad-tick outliers a broad index cannot produce", () => {
    const normalized = normalizeBenchmark(
      [
        { date: "2026-03-27", value: 382 },
        { date: "2026-03-30", value: 37 }, // Yahoo glitch: -90%
        { date: "2026-03-31", value: 37 },
        { date: "2026-04-01", value: 389 }
      ],
      "test"
    );

    expect(normalized.map((row) => row.date)).toEqual(["2026-03-27", "2026-04-01"]);
    expect(normalized[0].normalized).toBe(100);
    expect(normalized[1].normalized).toBeCloseTo((389 / 382) * 100, 6);
  });
});
