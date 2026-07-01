import { describe, it, expect } from "vitest";
import { mergeStoredSnapshots } from "./navStore";
import type { PortfolioSnapshot } from "../types";

const snap = (date: string, unitNav: number): PortfolioSnapshot => ({
  date, cash: 0, holdingsValue: 0, nav: 0, navTotalReturn: 0, units: 1, unitNav
});

describe("mergeStoredSnapshots", () => {
  it("uses fresh snapshots and backfills earlier dates only from storage", () => {
    const stored = [snap("2026-01-08", 100), snap("2026-02-01", 105), snap("2026-03-01", 110)];
    const fresh = [snap("2026-02-01", 106), snap("2026-03-01", 112)]; // window rolled past January
    const merged = mergeStoredSnapshots(stored, fresh);

    expect(merged.map((s) => s.date)).toEqual(["2026-01-08", "2026-02-01", "2026-03-01"]);
    expect(merged.find((s) => s.date === "2026-01-08")!.unitNav).toBe(100); // preserved from storage
    expect(merged.find((s) => s.date === "2026-02-01")!.unitNav).toBe(106); // fresh wins on overlap
  });

  it("returns fresh unchanged when storage is empty", () => {
    const fresh = [snap("2026-01-08", 100)];
    expect(mergeStoredSnapshots([], fresh)).toEqual(fresh);
  });

  it("returns stored when there is no fresh series", () => {
    const stored = [snap("2026-01-08", 100)];
    expect(mergeStoredSnapshots(stored, [])).toEqual(stored);
  });
});
