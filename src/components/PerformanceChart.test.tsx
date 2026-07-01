import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PerformanceChart } from "./PerformanceChart";
import type { NormalizedPerformancePoint } from "../types";

describe("PerformanceChart", () => {
  it("shows since-inception return and excess vs each benchmark", () => {
    const data: NormalizedPerformancePoint[] = [
      { date: "2026-01-02", portfolio: 100, topix: 100, nikkei225: 100 },
      { date: "2026-01-03", portfolio: 106, topix: 103, nikkei225: 104 },
      { date: "2026-01-04", portfolio: 102, topix: 104, nikkei225: 105 }
    ];

    render(<PerformanceChart data={data} asOf="2026-01-04" />);

    expect(screen.getByText(/return \(since start\)/i)).toBeInTheDocument();
    expect(screen.getByText("+2.00%")).toBeInTheDocument();
    expect(screen.getByText(/excess vs topix/i)).toBeInTheDocument();
    expect(screen.getByText("-2.0 pts")).toBeInTheDocument();
    expect(screen.getByText(/excess vs nikkei/i)).toBeInTheDocument();
    expect(screen.getByText("-3.0 pts")).toBeInTheDocument();
    expect(screen.getByText(/as of 2026-01-04/i)).toBeInTheDocument();
  });
});
