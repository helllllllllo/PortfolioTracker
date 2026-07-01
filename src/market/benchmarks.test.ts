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
