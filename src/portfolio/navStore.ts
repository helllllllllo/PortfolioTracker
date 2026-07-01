import type { PortfolioSnapshot } from "../types";

// Persist the computed daily NAV series so (a) the dashboard shows real history the
// instant it loads, before any network call, and (b) early history survives once the
// rolling price-history window eventually moves past the fund's inception date.
export function mergeStoredSnapshots(
  stored: PortfolioSnapshot[],
  fresh: PortfolioSnapshot[]
): PortfolioSnapshot[] {
  if (fresh.length === 0) return [...stored].sort((a, b) => a.date.localeCompare(b.date));
  if (stored.length === 0) return fresh;

  const freshStart = fresh[0].date;
  const backfill = stored.filter((snapshot) => snapshot.date < freshStart);
  return [...backfill, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
}
