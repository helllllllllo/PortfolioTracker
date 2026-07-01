import { describe, it, expect, vi, beforeEach } from "vitest";
import { toPng } from "html-to-image";
import { downloadNodePng } from "./downloadPng";

vi.mock("html-to-image", () => ({ toPng: vi.fn() }));

describe("downloadNodePng", () => {
  beforeEach(() => vi.mocked(toPng).mockReset());

  it("does nothing when the node is null", async () => {
    await downloadNodePng(null, "x.png");
    expect(toPng).not.toHaveBeenCalled();
  });

  it("rasterizes the node and triggers a download with the given filename", async () => {
    vi.mocked(toPng).mockResolvedValue("data:image/png;base64,abc");
    const click = vi.fn();
    const anchor = { download: "", href: "", click } as unknown as HTMLAnchorElement;
    const createElement = vi.spyOn(document, "createElement").mockReturnValue(anchor);

    const node = document.createElement("div");
    await downloadNodePng(node, "hiroshi-capital-performance-2026-06-30.png");

    expect(toPng).toHaveBeenCalledWith(node, expect.objectContaining({ pixelRatio: 3, backgroundColor: "#ffffff" }));
    expect(anchor.download).toBe("hiroshi-capital-performance-2026-06-30.png");
    expect(anchor.href).toBe("data:image/png;base64,abc");
    expect(click).toHaveBeenCalledTimes(1);
    createElement.mockRestore();
  });
});
