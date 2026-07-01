import { useState } from "react";
import { Download } from "lucide-react";
import { downloadNodePng } from "../export/downloadPng";

type Props = {
  targetRef: React.RefObject<HTMLElement | null>;
  filename: string;
  label?: string;
};

export function DownloadPngButton({ targetRef, filename, label = "PNG" }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadNodePng(targetRef.current, filename);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="download-png no-export" onClick={handleClick} disabled={busy}>
      <Download size={14} aria-hidden="true" />
      <span>{busy ? "Exporting…" : label}</span>
    </button>
  );
}
