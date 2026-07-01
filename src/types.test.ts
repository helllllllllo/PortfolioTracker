import { describe, expect, it } from "vitest";
import type { Quote, Trade } from "./types";

describe("shared portfolio types", () => {
  it("supports SBI trades and quote statuses", async () => {
    await expect(import("./types")).resolves.toBeDefined();

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
