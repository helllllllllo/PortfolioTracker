import { toPng } from "html-to-image";

export async function downloadNodePng(
  node: HTMLElement | null,
  filename: string,
  pixelRatio = 3
): Promise<void> {
  if (!node) return;
  const dataUrl = await toPng(node, {
    pixelRatio,
    backgroundColor: "#ffffff",
    cacheBust: true,
    filter: (element) =>
      !(element instanceof HTMLElement && element.classList?.contains("no-export"))
  });
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
