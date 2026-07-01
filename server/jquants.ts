// J-Quants v2 provider (JPX official data). Auth is a single API key sent as the
// "x-api-key" header. Prices come split-adjusted (AdjC) with an authoritative daily
// split factor (AdjFactor), so corporate actions are consistent from the source.
const JQUANTS_BASE = "https://api.jquants.com/v2";

type JQuantsRow = Record<string, unknown>;

export function hasJQuants(): boolean {
  return Boolean(process.env.JQUANTS_API_KEY);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeFromDate(range: string): string {
  const from = new Date();
  const years = /^(\d+)y$/.exec(range);
  const months = /^(\d+)mo$/.exec(range);
  if (years) from.setFullYear(from.getFullYear() - Number(years[1]));
  else if (months) from.setMonth(from.getMonth() - Number(months[1]));
  else from.setFullYear(from.getFullYear() - 1);
  return toIsoDate(from);
}

function throughDate(): string {
  const to = new Date();
  to.setDate(to.getDate() + 3); // capture the latest JST close regardless of UTC skew
  return toIsoDate(to);
}

async function jqFetch(path: string, params: Record<string, string>): Promise<JQuantsRow[]> {
  const key = process.env.JQUANTS_API_KEY;
  if (!key) return [];

  const rows: JQuantsRow[] = [];
  let paginationKey: string | undefined;
  try {
    do {
      const query = new URLSearchParams({
        ...params,
        ...(paginationKey ? { pagination_key: paginationKey } : {})
      });
      const response = await fetch(`${JQUANTS_BASE}${path}?${query.toString()}`, {
        headers: { "x-api-key": key }
      });
      if (!response.ok) return rows;
      const json = (await response.json()) as { data?: JQuantsRow[]; pagination_key?: string };
      if (Array.isArray(json.data)) rows.push(...json.data);
      paginationKey = json.pagination_key;
    } while (paginationKey);
  } catch {
    return rows;
  }
  return rows;
}

// "7974.T" -> "7974", "6846.N" -> "6846", "378A.T" -> "378A"
function codeFromSymbol(symbol: string): string {
  return symbol.split(".")[0];
}

export async function fetchJQuantsDailyBars(
  symbol: string,
  range = "1y"
): Promise<{ rows: Array<{ date: string; value: number }>; splits: Array<{ date: string; ratio: number }> }> {
  const data = await jqFetch("/equities/bars/daily", {
    code: codeFromSymbol(symbol),
    from: rangeFromDate(range),
    to: throughDate()
  });

  const rows = data
    .map((row) => ({ date: String(row.Date), value: Number(row.AdjC) }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const splits = data
    .filter((row) => typeof row.AdjFactor === "number" && row.AdjFactor > 0 && row.AdjFactor !== 1)
    .map((row) => ({ date: String(row.Date), ratio: 1 / (row.AdjFactor as number) }));

  return { rows, splits };
}

export async function fetchJQuantsIndex(
  code: string,
  range = "1y"
): Promise<Array<{ date: string; value: number }>> {
  const data = await jqFetch("/indices/bars/daily", {
    code,
    from: rangeFromDate(range),
    to: throughDate()
  });
  return data
    .map((row) => ({ date: String(row.Date), value: Number(row.C) }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchJQuantsLatest(
  symbol: string
): Promise<{ price: number; asOf: string } | null> {
  const { rows } = await fetchJQuantsDailyBars(symbol, "1mo");
  const last = rows.at(-1);
  return last ? { price: last.value, asOf: `${last.date}T00:00:00.000Z` } : null;
}
