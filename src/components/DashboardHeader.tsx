import { RefreshCw, Upload } from "lucide-react";

type Props = {
  fileName: string | null;
  cashFlowFileName: string | null;
  quoteStatus: string;
  onImport: (file: File) => void;
  onImportCashFlows: (file: File) => void;
  onRefresh: () => void;
};

export function DashboardHeader({
  fileName,
  cashFlowFileName,
  quoteStatus,
  onImport,
  onImportCashFlows,
  onRefresh
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <p className="eyebrow">Command center</p>
        <h1>Portfolio Dashboard</h1>
        <div className="ledger-line">
          <span className="brand-mark">Hiroshi Capital</span>
          <span>{fileName ? `Trades: ${fileName}` : "No trade CSV imported yet"}</span>
          <span>{cashFlowFileName ? `Cash flows: ${cashFlowFileName}` : "No cash-flow CSV imported yet"}</span>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          {quoteStatus}
        </span>
        <label className="file-button">
          <Upload size={16} aria-hidden="true" />
          <span>Import trades</span>
          <input
            aria-label="Import trades CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onImport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label className="file-button">
          <Upload size={16} aria-hidden="true" />
          <span>Import cash flows</span>
          <input
            aria-label="Import cash flows CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onImportCashFlows(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button type="button" onClick={onRefresh}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>Refresh quotes</span>
        </button>
      </div>
    </header>
  );
}
