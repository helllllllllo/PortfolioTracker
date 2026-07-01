import { describe, expect, it } from "vitest";
import { TOPIX_FALLBACK_SYMBOL } from "./benchmarkSymbols.js";

describe("benchmark symbols", () => {
  it("uses a stable free TOPIX proxy instead of the broken 1306.T Yahoo series", () => {
    expect(TOPIX_FALLBACK_SYMBOL).toBe("1308.T");
  });
});
